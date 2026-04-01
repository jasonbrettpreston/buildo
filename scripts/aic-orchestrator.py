#!/usr/bin/env python3
"""
AIC Inspection Scraper — Multi-Worker Orchestrator

Spawns N concurrent nodriver workers, each claiming batches from the
scraper_queue table via DB-level locking (FOR UPDATE SKIP LOCKED).

Usage:
    python scripts/aic-orchestrator.py              # uses SCRAPER_WORKERS env (default 1)
    SCRAPER_WORKERS=3 python scripts/aic-orchestrator.py

Env vars:
    SCRAPER_WORKERS    — number of concurrent workers (default: 1)
    SCRAPE_BATCH_SIZE  — permits per worker batch claim (default: 10)
    SCRAPE_MAX_PERMITS — total permits cap across all workers (default: 0 = unlimited)
    SCRAPE_PERMIT_TYPE — filter to one type (e.g. "Small Residential")
    PROXY_HOST/PORT/USER/PASS — optional Decodo proxy (disabled by default)
    PG_HOST/PORT/DATABASE/USER/PASSWORD — PostgreSQL connection

SPEC LINK: docs/specs/38_inspection_scraping.md §3.9
"""

import asyncio
import json
import os
import random
import re
import signal
import sys
import time
from pathlib import Path

import psycopg2

# ---------------------------------------------------------------------------
# Load .env for standalone execution
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if m and m.group(1) not in os.environ:
            val = m.group(2)
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            os.environ[m.group(1)] = val

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
NUM_WORKERS = int(os.environ.get('SCRAPER_WORKERS', '1'))
BATCH_SIZE = int(os.environ.get('SCRAPE_BATCH_SIZE', '10'))
MAX_PERMITS = int(os.environ.get('SCRAPE_MAX_PERMITS', '0'))  # 0 = unlimited
STALE_CLAIM_MINUTES = 30
MAX_PREFLIGHT_FAILURES = 2

ALL_TARGET_TYPES = [
    'Small Residential Projects',
    'Building Additions/Alterations',
    'New Houses',
]

SCRAPE_PERMIT_TYPE = os.environ.get('SCRAPE_PERMIT_TYPE', '')
if SCRAPE_PERMIT_TYPE:
    TARGET_TYPES = [t for t in ALL_TARGET_TYPES if SCRAPE_PERMIT_TYPE.lower() in t.lower()]
else:
    TARGET_TYPES = ALL_TARGET_TYPES

SCRIPT_DIR = Path(__file__).parent
WORKER_SCRIPT = SCRIPT_DIR / 'aic-scraper-nodriver.py'

shutdown_requested = False


def handle_signal(signum, frame):
    global shutdown_requested
    shutdown_requested = True
    log('WARN', '[orchestrator]', f'Shutdown signal received ({signum}), finishing current batches...')


# Register signal handlers (SIGINT for Ctrl+C, SIGTERM for kill)
signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


# ---------------------------------------------------------------------------
# Logging & pipeline protocol (matches scraper conventions)
# ---------------------------------------------------------------------------
def log(level, tag, msg, context=None):
    entry = {"level": level, "tag": tag, "msg": msg}
    if context:
        entry["context"] = context
    print(json.dumps(entry))


def emit_summary(data):
    print(f"PIPELINE_SUMMARY:{json.dumps(data)}")


def emit_meta(reads, writes, external=None):
    meta = {"reads": reads, "writes": writes}
    if external:
        meta["external"] = external
    print(f"PIPELINE_META:{json.dumps(meta)}")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db_connection():
    return psycopg2.connect(
        host=os.environ.get('PG_HOST', 'localhost'),
        port=int(os.environ.get('PG_PORT', '5432')),
        dbname=os.environ.get('PG_DATABASE', 'buildo'),
        user=os.environ.get('PG_USER', 'postgres'),
        password=os.environ.get('PG_PASSWORD', 'postgres'),
    )


def populate_queue(conn):
    """Populate scraper_queue from permits table. Returns count of new rows added."""
    cur = conn.cursor()
    try:
        # Reset stale claims (workers that crashed mid-batch)
        cur.execute("""
            UPDATE scraper_queue
            SET status = 'pending', claimed_at = NULL, claimed_by = NULL
            WHERE status = 'claimed'
              AND claimed_at < NOW() - INTERVAL '1 minute' * %s
        """, (STALE_CLAIM_MINUTES,))
        stale_reset = cur.rowcount
        if stale_reset > 0:
            log('INFO', '[orchestrator]', f'Reset {stale_reset} stale claims')

        # Insert new year_seqs that aren't already in the queue
        cur.execute("""
            INSERT INTO scraper_queue (year_seq, permit_type)
            SELECT DISTINCT
                SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq,
                p.permit_type
            FROM permits p
            WHERE p.status = 'Inspection'
              AND p.permit_type = ANY(%s)
              AND p.issued_date IS NOT NULL
              AND p.issued_date > NOW() - INTERVAL '3 years'
              AND (p.enriched_status IS NULL
                   OR p.enriched_status IN ('Permit Issued', 'Active Inspection', 'Not Passed'))
              AND (p.last_scraped_at IS NULL OR p.last_scraped_at < NOW() - INTERVAL '7 days')
              AND SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= EXTRACT(YEAR FROM CURRENT_DATE) %% 100
            ON CONFLICT (year_seq) DO NOTHING
        """, (TARGET_TYPES,))
        new_rows = cur.rowcount
        conn.commit()

        # Get total pending
        cur.execute("SELECT COUNT(*) FROM scraper_queue WHERE status = 'pending'")
        total_pending = cur.fetchone()[0]

        return new_rows, total_pending
    finally:
        cur.close()


# ---------------------------------------------------------------------------
# Worker management
# ---------------------------------------------------------------------------
async def run_worker(worker_id, abort_event, preflight_fail_counter):
    """Spawn a long-lived worker subprocess that claims batches from the DB queue.

    The worker uses --db-queue mode: single Chrome bootstrap, browser reuse across batches.

    Args:
        abort_event: asyncio.Event — set when preflight failures exceed threshold.
        preflight_fail_counter: list[int] — shared counter for preflight failures
            (safe because all workers are coroutines in the same event loop).
    """
    worker_tag = f'[worker-{worker_id}]'
    worker_tel = {
        'permits_attempted': 0, 'permits_found': 0, 'permits_scraped': 0,
        'not_found_count': 0, 'proxy_errors': 0, 'session_bootstraps': 0,
        'session_failures': 0, 'total_upserted': 0, 'status_changes': 0,
        'enriched_updates': 0, 'preflight_passed': True, 'latencies': [],
        'workers_completed': 0, 'consecutive_empty_max': 0,
    }

    # Check abort before even spawning
    if abort_event.is_set():
        log('INFO', worker_tag, 'Abort event already set — skipping')
        return worker_tel

    try:
        # Spawn a single long-lived worker subprocess (--db-queue mode)
        # The worker claims batches from scraper_queue itself, reusing one Chrome instance
        cmd = [
            sys.executable, str(WORKER_SCRIPT),
            f'--worker-id={worker_id}',
            '--db-queue',
        ]

        # Divide max permits across workers — worker 1 gets the remainder
        if MAX_PERMITS > 0:
            base = MAX_PERMITS // max(NUM_WORKERS, 1)
            remainder = MAX_PERMITS % max(NUM_WORKERS, 1)
            per_worker_max = str(base + (1 if worker_id <= remainder else 0))
        else:
            per_worker_max = '0'

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, 'SCRAPE_BATCH_SIZE': str(BATCH_SIZE), 'SCRAPE_MAX_PERMITS': per_worker_max},
        )

        # Stream stdout/stderr line-by-line to avoid buffering entire output in RAM.
        # Only keep the PIPELINE_SUMMARY line for telemetry parsing.
        captured_summary = []

        async def stream_reader(stream, is_stderr=False):
            async for raw_line in stream:
                text = raw_line.decode('utf-8', errors='replace').rstrip()
                if not text:
                    continue
                # Encode to console-safe output (Windows charmap can't handle all Unicode)
                safe_text = text.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8', errors='replace')
                if is_stderr:
                    print(safe_text, file=sys.stderr)
                else:
                    print(safe_text)
                    if 'PIPELINE_SUMMARY:' in text:
                        captured_summary.append(text)
                    # Check for preflight failure in real-time
                    if 'PREFLIGHT_FAIL' in text:
                        worker_tel['preflight_passed'] = False
                        preflight_fail_counter[0] += 1
                        log('ERROR', worker_tag, f'Preflight failure detected in stream (count: {preflight_fail_counter[0]}/{MAX_PREFLIGHT_FAILURES})')
                        if preflight_fail_counter[0] >= MAX_PREFLIGHT_FAILURES:
                            abort_event.set()
                            log('ERROR', worker_tag, 'Preflight abort threshold — terminating worker')
                # Active kill switch: terminate on abort or shutdown
                if abort_event.is_set() or shutdown_requested:
                    if proc.returncode is None:
                        log('WARN', worker_tag, 'Termination signal — killing worker subprocess')
                        proc.terminate()
                        return

        await asyncio.gather(
            stream_reader(proc.stdout, is_stderr=False),
            stream_reader(proc.stderr, is_stderr=True),
        )
        await proc.wait()

        # Parse the captured PIPELINE_SUMMARY line for telemetry
        summary_line = next((l for l in captured_summary if 'PIPELINE_SUMMARY:' in l), None)
        summary_match = re.search(r'PIPELINE_SUMMARY:(.+)', summary_line) if summary_line else None
        if summary_match:
            try:
                summary = json.loads(summary_match.group(1))
                meta = summary.get('records_meta', {})
                sc_tel = meta.get('scraper_telemetry', {})

                worker_tel['permits_attempted'] += sc_tel.get('permits_attempted', 0)
                worker_tel['permits_found'] += sc_tel.get('permits_found', 0)
                worker_tel['permits_scraped'] += sc_tel.get('permits_scraped', 0)
                worker_tel['not_found_count'] += sc_tel.get('not_found_count', 0)
                worker_tel['proxy_errors'] += sc_tel.get('proxy_errors', 0)
                worker_tel['session_bootstraps'] += sc_tel.get('session_bootstraps', 0)
                worker_tel['session_failures'] += sc_tel.get('session_failures', 0)
                worker_tel['total_upserted'] += summary.get('records_new', 0)
                worker_tel['status_changes'] += summary.get('records_updated', 0)
                worker_tel['enriched_updates'] += sc_tel.get('enriched_updates', 0)
                worker_tel['consecutive_empty_max'] = max(
                    worker_tel['consecutive_empty_max'],
                    sc_tel.get('consecutive_empty_max', 0),
                )

                if not sc_tel.get('preflight_passed', True):
                    worker_tel['preflight_passed'] = False

                lat = sc_tel.get('latency', {})
                if lat.get('p50'):
                    worker_tel['latencies'].append(lat['p50'])
            except (json.JSONDecodeError, KeyError) as err:
                log('WARN', worker_tag, f'Failed to parse worker summary: {err}')

        if proc.returncode == 0:
            worker_tel['workers_completed'] += 1
        else:
            log('ERROR', worker_tag, f'Worker process exited with code {proc.returncode}')
            # Preflight failures are now detected in real-time via stream_reader

    except Exception as err:
        log('ERROR', worker_tag, f'Worker subprocess error: {err}')
        worker_tel['preflight_passed'] = False

    return worker_tel


# ---------------------------------------------------------------------------
# Telemetry aggregation
# ---------------------------------------------------------------------------
def aggregate_telemetry(worker_results):
    """Aggregate telemetry from all workers into a single dict."""
    agg = {
        'permits_attempted': 0, 'permits_found': 0, 'permits_scraped': 0,
        'not_found_count': 0, 'proxy_errors': 0, 'session_bootstraps': 0,
        'session_failures': 0, 'total_upserted': 0, 'status_changes': 0,
        'enriched_updates': 0, 'preflight_failures': 0,
        'workers_total': len(worker_results),
        'workers_completed': 0,
        'consecutive_empty_max': 0,
        'latencies': [],
    }

    for w in worker_results:
        agg['permits_attempted'] += w.get('permits_attempted', 0)
        agg['permits_found'] += w.get('permits_found', 0)
        agg['permits_scraped'] += w.get('permits_scraped', 0)
        agg['not_found_count'] += w.get('not_found_count', 0)
        agg['proxy_errors'] += w.get('proxy_errors', 0)
        agg['session_bootstraps'] += w.get('session_bootstraps', 0)
        agg['session_failures'] += w.get('session_failures', 0)
        agg['total_upserted'] += w.get('total_upserted', 0)
        agg['status_changes'] += w.get('status_changes', 0)
        agg['enriched_updates'] += w.get('enriched_updates', 0)
        agg['workers_completed'] += w.get('workers_completed', 0)
        agg['consecutive_empty_max'] = max(agg['consecutive_empty_max'], w.get('consecutive_empty_max', 0))
        if not w.get('preflight_passed', True):
            agg['preflight_failures'] += 1
        agg['latencies'].extend(w.get('latencies', []))

    return agg


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    start_ms = time.time() * 1000

    log('INFO', '[orchestrator]', f'Starting with {NUM_WORKERS} workers, batch size {BATCH_SIZE}')
    log('INFO', '[orchestrator]', f'Target types: {TARGET_TYPES}')
    if MAX_PERMITS > 0:
        log('INFO', '[orchestrator]', f'Max permits cap: {MAX_PERMITS} total ({MAX_PERMITS // max(NUM_WORKERS, 1)} per worker)')

    # Populate queue with a short-lived connection — release before long-running scrape.
    # Managed PostgreSQL servers drop idle connections after 5-15 minutes, so holding
    # a connection open during asyncio.gather (which can run for hours) would crash
    # with psycopg2.OperationalError when fetching final stats.
    conn = get_db_connection()
    try:
        new_rows, total_pending = populate_queue(conn)
    finally:
        conn.close()

    log('INFO', '[orchestrator]', f'Queue: {new_rows} new rows added, {total_pending} total pending')

    if total_pending == 0:
        log('INFO', '[orchestrator]', 'Nothing to scrape — queue is empty')
        emit_summary({
            'records_total': 0, 'records_new': 0, 'records_updated': 0,
            'records_meta': {
                'scraper_telemetry': {'permits_attempted': 0},
                'audit_table': {'phase': 1, 'name': 'Data Ingestion', 'verdict': 'PASS', 'rows': []},
            },
        })
        emit_meta(
            {'permits': ['permit_num', 'status', 'enriched_status', 'permit_type']},
            {'permit_inspections': [], 'scraper_queue': ['year_seq', 'status']},
            ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)'],
        )
        return

    # Shared abort mechanism for real-time preflight failure detection (A8)
    abort_event = asyncio.Event()
    preflight_fail_counter = [0]  # Shared mutable counter (GIL-safe in single event loop)

    # Spawn workers with random stagger (0-5s) — avoids simultaneous
    # browser launches which create a detectable burst pattern.
    async def staggered_worker(wid, abort_evt, counter):
        stagger = random.uniform(0, 5.0) if wid > 1 else 0
        if stagger > 0:
            log('INFO', '[orchestrator]', f'Worker {wid} starting in {stagger:.1f}s')
            await asyncio.sleep(stagger)
        return await run_worker(wid, abort_evt, counter)

    tasks = []
    for i in range(min(NUM_WORKERS, total_pending)):
        tasks.append(staggered_worker(i + 1, abort_event, preflight_fail_counter))

    log('INFO', '[orchestrator]', f'Spawning {len(tasks)} workers (staggered)...')
    worker_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Handle exceptions from workers
    clean_results = []
    for i, result in enumerate(worker_results):
        if isinstance(result, Exception):
            log('ERROR', '[orchestrator]', f'Worker {i+1} crashed: {result}')
            clean_results.append({'preflight_passed': False})
        else:
            clean_results.append(result)

    # Aggregate telemetry
    agg = aggregate_telemetry(clean_results)

    # Check preflight abort condition
    if agg['preflight_failures'] >= MAX_PREFLIGHT_FAILURES:
        log('ERROR', '[orchestrator]', f"ABORT: {agg['preflight_failures']}/{agg['workers_total']} workers failed preflight — CDP stealth may be compromised")

    elapsed_s = (time.time() * 1000 - start_ms) / 1000
    log('INFO', '[orchestrator]', 'All workers complete', {
        'workers': agg['workers_total'],
        'workers_completed': agg['workers_completed'],
        'permits_attempted': agg['permits_attempted'],
        'permits_scraped': agg['permits_scraped'],
        'preflight_failures': agg['preflight_failures'],
        'elapsed': f'{elapsed_s:.1f}s',
    })

    # Emit aggregated PIPELINE_SUMMARY
    latencies = sorted(agg['latencies']) if agg['latencies'] else [0]
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    duration_ms = int(time.time() * 1000 - start_ms)
    miss_rate = (agg['not_found_count'] / agg['permits_attempted'] * 100) if agg['permits_attempted'] > 0 else 0
    miss_status = 'FAIL' if miss_rate >= 20 else 'PASS'

    # Queue stats — fresh connection since the populate connection was closed hours ago
    stats_conn = get_db_connection()
    try:
        cur = stats_conn.cursor()
        try:
            cur.execute("""
                SELECT status, COUNT(*) FROM scraper_queue GROUP BY status ORDER BY status
            """)
            queue_stats = {r[0]: r[1] for r in cur.fetchall()}
        finally:
            cur.close()
    finally:
        stats_conn.close()

    emit_summary({
        'records_total': agg['permits_attempted'],
        'records_new': agg['total_upserted'],
        'records_updated': agg['status_changes'],
        'records_meta': {
            'scraper_telemetry': {
                'permits_attempted': agg['permits_attempted'],
                'permits_found': agg['permits_found'],
                'permits_scraped': agg['permits_scraped'],
                'not_found_count': agg['not_found_count'],
                'enriched_updates': agg['enriched_updates'],
                'proxy_errors': agg['proxy_errors'],
                'consecutive_empty_max': agg['consecutive_empty_max'],
                'session_bootstraps': agg['session_bootstraps'],
                'session_failures': agg['session_failures'],
                'schema_drift': [],
                'status_changes': agg['status_changes'],
                'error_categories': {},
                'last_error': None,
                'proxy_configured': bool(os.environ.get('PROXY_HOST')),
                'proxy_host': os.environ.get('PROXY_HOST'),
                'max_permits_cap': MAX_PERMITS,
                'capped': MAX_PERMITS > 0 and agg['permits_attempted'] >= MAX_PERMITS,
                'preflight_failures': agg['preflight_failures'],
                'workers': agg['workers_total'],
                'workers_completed': agg['workers_completed'],
                'latency': {'p50': int(p50), 'p95': int(p95), 'max': int(latencies[-1])},
            },
            'orchestrator': {
                'workers': agg['workers_total'],
                'batch_size': BATCH_SIZE,
                'queue_stats': queue_stats,
            },
            'audit_table': {
                'phase': 1,
                'name': 'Data Ingestion (Multi-Worker)',
                'verdict': 'FAIL' if (miss_status == 'FAIL' or agg['preflight_failures'] >= MAX_PREFLIGHT_FAILURES) else 'PASS',
                'rows': [
                    {'metric': 'workers_total', 'value': agg['workers_total'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'preflight_failures', 'value': agg['preflight_failures'], 'threshold': f'< {MAX_PREFLIGHT_FAILURES}', 'status': 'FAIL' if agg['preflight_failures'] >= MAX_PREFLIGHT_FAILURES else 'PASS'},
                    {'metric': 'permits_attempted', 'value': agg['permits_attempted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'permits_found', 'value': agg['permits_found'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'enriched_updates', 'value': agg['enriched_updates'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'not_found_rate', 'value': f'{miss_rate:.1f}%', 'threshold': '< 20%', 'status': miss_status},
                    {'metric': 'records_inserted', 'value': agg['total_upserted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'records_updated', 'value': agg['status_changes'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'duration_ms', 'value': duration_ms, 'threshold': None, 'status': 'INFO'},
                    {'metric': 'queue_pending', 'value': queue_stats.get('pending', 0), 'threshold': None, 'status': 'INFO'},
                    {'metric': 'queue_completed', 'value': queue_stats.get('completed', 0), 'threshold': None, 'status': 'INFO'},
                    {'metric': 'queue_failed', 'value': queue_stats.get('failed', 0), 'threshold': None, 'status': 'INFO'},
                    {'metric': 'exit_code', 'value': 0, 'threshold': '== 0', 'status': 'PASS'},
                    {'metric': 'pipeline_summary_emitted', 'value': True, 'threshold': '== true', 'status': 'PASS'},
                ],
            },
        },
    })

    emit_meta(
        {
            'permits': ['permit_num', 'status', 'enriched_status', 'permit_type'],
            'scraper_queue': ['year_seq', 'status', 'claimed_by'],
        },
        {
            'permit_inspections': ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at'],
            'scraper_queue': ['year_seq', 'status', 'claimed_at', 'completed_at', 'claimed_by'],
        },
        ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)'],
    )


if __name__ == '__main__':
    asyncio.run(main())
