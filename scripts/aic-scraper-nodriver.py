#!/usr/bin/env python3
"""
AIC Inspection Scraper — nodriver (CDP) Edition

Uses nodriver to launch Chrome via Chrome DevTools Protocol (no WebDriver).
The WAF cannot detect automation because CDP does not set navigator.webdriver
or use any detectable automation protocol.

All data requests use page.evaluate(fetch(...)) — native browser fetch()
calls from Chrome's network stack. Same 4-step REST API chain as the
Playwright version but with zero automation fingerprint.

Usage:
    python scripts/aic-scraper-nodriver.py                    # batch mode
    python scripts/aic-scraper-nodriver.py "24 132854"        # single permit

Env vars:
    SCRAPE_BATCH_SIZE  — permits per batch (default: 10)
    SCRAPE_PERMIT_TYPE — filter to one type (e.g. "Small Residential")
    PROXY_HOST/PORT    — optional proxy (default: direct connection)
    PG_HOST/PORT/DATABASE/USER/PASSWORD — PostgreSQL connection

SPEC LINK: docs/specs/38_inspection_scraping.md
"""

import asyncio
import json
import os
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import nodriver as uc
import psycopg2
from psycopg2.extras import RealDictCursor

# ---------------------------------------------------------------------------
# Load .env for standalone execution
# ---------------------------------------------------------------------------
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
        if m and m.group(1) not in os.environ:
            val = m.group(2)
            # Strip surrounding quotes (single or double)
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            os.environ[m.group(1)] = val

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
AIC_BASE = 'https://secure.toronto.ca/ApplicationStatus'
MAX_RETRIES = 3
RETRY_BASE_MS = 2000
WAF_TRAP_THRESHOLD = 20
SESSION_REFRESH_INTERVAL = 200

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

BATCH_SIZE = int(os.environ.get('SCRAPE_BATCH_SIZE', '10'))


# ---------------------------------------------------------------------------
# Sanitization — validate values before interpolating into page.evaluate JS
# ---------------------------------------------------------------------------
def sanitize_js_value(val):
    """Ensure a value is safe to interpolate into JavaScript. Strip non-alphanumeric chars except spaces."""
    s = str(val)
    if not re.match(r'^[A-Za-z0-9 _\-]+$', s):
        raise ValueError(f"Unsafe value for JS interpolation: {s!r}")
    return s


# ---------------------------------------------------------------------------
# Status normalization (matches Spec 38 §3.4)
# ---------------------------------------------------------------------------
def normalize_status(raw):
    s = (raw or '').strip().lower()
    if s == 'outstanding': return 'Outstanding'
    if s in ('pass', 'passed'): return 'Passed'
    if s in ('fail', 'failed', 'not passed'): return 'Not Passed'
    if s in ('partial', 'partially completed'): return 'Partial'
    return None


def compute_enriched_status(stages):
    """Compute enriched_status from scraped inspection stages."""
    if not stages:
        return None
    statuses = [normalize_status(s.get('status')) for s in stages]
    statuses = [s for s in statuses if s]
    if not statuses:
        return None
    if any(s == 'Not Passed' for s in statuses): return 'Not Passed'
    if all(s == 'Outstanding' for s in statuses): return 'Permit Issued'
    if all(s == 'Passed' for s in statuses): return 'Inspections Complete'
    return 'Active Inspection'


def parse_inspection_date(raw):
    trimmed = (raw or '').strip()
    if not trimmed or trimmed in ('-', 'N/A', ''):
        return None
    # ISO format
    if re.match(r'^\d{4}-\d{2}-\d{2}', trimmed):
        return trimmed[:10]
    # Named month: "Jun 3, 2024"
    months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
              'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}
    m = re.match(r'^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$', trimmed)
    if m:
        month_num = months.get(m.group(1)[:3].lower())
        if month_num:
            return f"{m.group(3)}-{month_num}-{m.group(2).zfill(2)}"
    return None


# ---------------------------------------------------------------------------
# Pipeline protocol — emit SUMMARY and META to stdout for chain orchestrator
# ---------------------------------------------------------------------------
def emit_summary(data):
    print(f"PIPELINE_SUMMARY:{json.dumps(data)}")

def emit_meta(reads, writes, external=None):
    meta = {"reads": reads, "writes": writes}
    if external:
        meta["external"] = external
    print(f"PIPELINE_META:{json.dumps(meta)}")

def log(level, tag, msg, context=None):
    entry = {"level": level, "tag": tag, "msg": msg}
    if context:
        entry["context"] = context
    print(json.dumps(entry))


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


# ---------------------------------------------------------------------------
# Browser — nodriver CDP (no WebDriver)
# ---------------------------------------------------------------------------
async def bootstrap_session():
    """Launch Chrome via CDP and establish AIC session with warm entry."""
    browser = await uc.start()
    try:
        page = await browser.get('about:blank')

        # Warm bootstrap: toronto.ca first for realistic referrer chain
        try:
            page = await browser.get('https://www.toronto.ca', new_tab=False)
            await page.sleep(2)
        except Exception:
            pass  # toronto.ca may be slow — non-fatal

        # Navigate to AIC portal
        page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
        await page.sleep(1)
        return browser, page
    except Exception as err:
        browser.stop()
        raise err


async def bootstrap_with_retry():
    """Bootstrap with retry — 3 attempts with 10s backoff."""
    last_error = None
    for attempt in range(1, 4):
        try:
            browser, page = await bootstrap_session()
            if attempt > 1:
                log('INFO', '[scraper]', f'Bootstrap succeeded on attempt {attempt}')
            return browser, page, attempt
        except Exception as err:
            last_error = err
            log('ERROR', '[scraper]', str(err), {'event': 'bootstrap_failed', 'attempt': attempt})
            if attempt < 3:
                log('INFO', '[scraper]', f'Retrying bootstrap in 10s...')
                await asyncio.sleep(10)
    raise Exception(f'Bootstrap failed after 3 attempts: {last_error}')


# ---------------------------------------------------------------------------
# Scrape one permit (4-step API chain via page.evaluate)
# ---------------------------------------------------------------------------
async def fetch_permit_chain(page, year, sequence):
    """Execute 4-step API chain inside Chrome via page.evaluate(fetch)."""

    # Step 1: Search properties
    step1 = await page.evaluate(f"""
        fetch('{AIC_BASE}/jaxrs/search/properties', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
            body: JSON.stringify({{
                ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                folderSection: '', folderRevision: '', folderType: '',
                address: '', searchType: '0',
                mapX: null, mapY: null,
                propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
            }})
        }}).then(r => r.text())
    """, await_promise=True)

    if not step1 or step1.strip().startswith('<'):
        return {'waf_blocked': True, 'properties': [], 'results': []}

    props = json.loads(step1)
    if not props:
        return {'properties': [], 'results': []}

    property_rsn = sanitize_js_value(props[0].get('propertyRsn', ''))

    # Step 2: Get folders
    step2 = await page.evaluate(f"""
        fetch('{AIC_BASE}/jaxrs/search/folders', {{
            method: 'POST',
            headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
            body: JSON.stringify({{
                ward: '', folderYear: '{year}', folderSequence: '{sequence}',
                folderSection: '', folderRevision: '', folderType: '',
                address: '', searchType: '0', propertyRsn: '{property_rsn}',
                mapX: null, mapY: null,
                propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
            }})
        }}).then(r => r.text())
    """, await_promise=True)

    if not step2 or step2.strip().startswith('<'):
        return {'waf_blocked': True, 'properties': props, 'results': []}

    folders = json.loads(step2)
    target_folders = [f for f in folders if f.get('folderTypeDesc') in TARGET_TYPES]

    results = []
    for folder in target_folders:
        permit_num = f"{folder['folderYear']} {folder['folderSequence']} {folder['folderSection']}"
        folder_rsn = sanitize_js_value(folder['folderRsn'])

        # Step 3: Get detail
        step3 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/detail/{folder_rsn}', {{
                method: 'GET', headers: {{ Accept: 'application/json' }}
            }}).then(r => r.text())
        """, await_promise=True)

        if not step3 or step3.strip().startswith('<'):
            return {'waf_blocked': True, 'properties': props, 'results': results}

        detail = json.loads(step3)
        processes = detail.get('inspectionProcesses') or []

        if not processes:
            results.append({'permit_num': permit_num, 'error': 'no_processes'})
            continue

        if not detail.get('showStatus'):
            results.append({'permit_num': permit_num, 'error': 'no_status_link'})
            continue

        # Step 4: Get inspection stages
        for proc in processes:
            process_rsn = sanitize_js_value(proc.get('processRsn'))
            step4 = await page.evaluate(f"""
                fetch('{AIC_BASE}/jaxrs/search/status/{folder_rsn}/{process_rsn}', {{
                    method: 'GET', headers: {{ Accept: 'application/json' }}
                }}).then(r => r.text())
            """, await_promise=True)

            if not step4 or step4.strip().startswith('<'):
                return {'waf_blocked': True, 'properties': props, 'results': results}

            status_data = json.loads(step4)
            stages = status_data.get('stages') or []
            if stages:
                results.append({'permit_num': permit_num, 'stages': stages})
            else:
                results.append({'permit_num': permit_num, 'error': 'no_stages'})

    return {'properties': props, 'folders': folders, 'results': results}


async def scrape_year_sequence(page, year_seq, conn):
    """Scrape one year+sequence and write results to DB."""
    year, sequence = year_seq.split(' ')
    chain_result = await fetch_permit_chain(page, year, sequence)

    if chain_result.get('waf_blocked'):
        raise Exception(f'WAF blocked request for {year_seq}')

    props = chain_result.get('properties', [])
    if not props:
        log('INFO', '[scraper]', f'No property found for {year_seq}')
        return {'searched': 1, 'scraped': 0, 'upserted': 0}

    results = chain_result.get('results', [])
    folders = chain_result.get('folders', [])
    target_folders = [f for f in folders if f.get('folderTypeDesc') in TARGET_TYPES]

    if not target_folders:
        log('INFO', '[scraper]', f'{year_seq}: no target folders found')
        return {'searched': 1, 'scraped': 0, 'upserted': 0}

    log('INFO', '[scraper]', f'{year_seq}: {len(folders)} folders, {len(target_folders)} target permits', {
        'all': [f"{f['folderYear']} {f['folderSequence']} {f['folderSection']} [{f['statusDesc']}]" for f in folders]
    })

    scraped = 0
    upserted = 0
    enriched_updates = 0
    status_changes = 0

    cur = conn.cursor()
    try:
        for result in results:
            if result.get('error'):
                log('INFO', '[scraper]', f"{result['permit_num']}: {result['error']}")
                # Permits with no_processes/no_status_link — set Permit Issued
                if result['error'] in ('no_processes', 'no_status_link'):
                    cur.execute(
                        "UPDATE permits SET enriched_status = 'Permit Issued' "
                        "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM 'Permit Issued'",
                        (result['permit_num'],)
                    )
                    if cur.rowcount > 0:
                        enriched_updates += 1
                continue

            # Upsert stages
            for stage in result['stages']:
                status = normalize_status(stage.get('status'))
                if not status:
                    continue
                insp_date = parse_inspection_date(stage.get('date'))

                # Check existing for status change detection
                cur.execute(
                    "SELECT status FROM permit_inspections WHERE permit_num = %s AND stage_name = %s",
                    (result['permit_num'], stage['desc'])
                )
                old_row = cur.fetchone()
                old_status = old_row[0] if old_row else None

                cur.execute("""
                    INSERT INTO permit_inspections (permit_num, stage_name, status, inspection_date, scraped_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (permit_num, stage_name) DO UPDATE
                    SET status = EXCLUDED.status,
                        inspection_date = EXCLUDED.inspection_date,
                        scraped_at = NOW()
                    WHERE permit_inspections.status IS DISTINCT FROM EXCLUDED.status
                       OR permit_inspections.inspection_date IS DISTINCT FROM EXCLUDED.inspection_date
                """, (result['permit_num'], stage['desc'], status, insp_date))

                if cur.rowcount > 0:
                    upserted += 1
                    if old_status and old_status != status:
                        status_changes += 1

            # Touch scraped_at unconditionally for 7-day cooldown
            cur.execute(
                "UPDATE permit_inspections SET scraped_at = NOW() WHERE permit_num = %s",
                (result['permit_num'],)
            )

            # Compute and write enriched_status
            enriched = compute_enriched_status(result['stages'])
            cur.execute(
                "UPDATE permits SET enriched_status = %s "
                "WHERE permit_num = %s AND enriched_status IS DISTINCT FROM %s",
                (enriched, result['permit_num'], enriched)
            )
            if cur.rowcount > 0:
                enriched_updates += 1

            scraped += 1
            log('INFO', '[scraper]', f"Scraped {len(result['stages'])} stages for {result['permit_num']}", {
                'stages': [f"{s['desc']}: {s['status']}" for s in result['stages']],
                'enrichedStatus': enriched,
            })

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()

    return {
        'searched': 1, 'scraped': scraped, 'upserted': upserted,
        'enriched_updates': enriched_updates, 'status_changes': status_changes,
    }


async def scrape_with_retry(page, year_seq, conn):
    """Retry wrapper with exponential backoff."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await scrape_year_sequence(page, year_seq, conn)
        except Exception as err:
            last_error = err
            log('ERROR', '[scraper]', str(err), {'yearSeq': year_seq, 'attempt': attempt})
            if attempt == MAX_RETRIES:
                log('ERROR', '[scraper]', f'All retries exhausted for {year_seq}, skipping')
                return {'searched': 1, 'scraped': 0, 'upserted': 0, 'retry_exhausted': True}
            await asyncio.sleep(RETRY_BASE_MS / 1000 * (2 ** (attempt - 1)))
    return {'searched': 1, 'scraped': 0, 'upserted': 0, 'retry_exhausted': True}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    single_permit = sys.argv[1] if len(sys.argv) > 1 else None
    start_ms = time.time() * 1000

    # Telemetry
    tel = {
        'permits_attempted': 0, 'permits_found': 0, 'permits_scraped': 0,
        'not_found_count': 0, 'enriched_updates': 0, 'proxy_errors': 0,
        'consecutive_empty': 0, 'consecutive_empty_max': 0,
        'session_bootstraps': 0, 'session_failures': 0,
        'schema_drift': [], 'status_changes': 0, 'total_upserted': 0,
        'error_categories': {}, 'last_error': None, 'latencies': [],
    }

    log('INFO', '[scraper]', 'Launching browser via nodriver (CDP)...')
    browser, page, bootstrap_attempts = await bootstrap_with_retry()
    tel['session_bootstraps'] = bootstrap_attempts
    log('INFO', '[scraper]', 'WAF session established (no WebDriver)')

    conn = get_db_connection()

    def accumulate(result):
        tel['permits_attempted'] += 1
        if result.get('scraped', 0) > 0:
            tel['permits_found'] += 1
            tel['permits_scraped'] += result['scraped']
            tel['consecutive_empty'] = 0
        elif result.get('searched', 0) > 0 and result.get('scraped', 0) == 0:
            tel['not_found_count'] += 1
            tel['consecutive_empty'] += 1
            tel['consecutive_empty_max'] = max(tel['consecutive_empty_max'], tel['consecutive_empty'])
        tel['total_upserted'] += result.get('upserted', 0)
        tel['enriched_updates'] += result.get('enriched_updates', 0)
        tel['status_changes'] += result.get('status_changes', 0)
        if result.get('retry_exhausted'):
            tel['proxy_errors'] += 1

    try:
        if single_permit:
            log('INFO', '[scraper]', f'Single permit mode: {single_permit}')
            req_start = time.time() * 1000
            result = await scrape_with_retry(page, single_permit, conn)
            tel['latencies'].append(time.time() * 1000 - req_start)
            accumulate(result)
        else:
            # Batch mode: query DB for eligible permits
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT year_seq FROM (
                    SELECT DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+') AS year_seq,
                           MAX(p.issued_date) AS max_issued
                    FROM permits p
                    LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
                    WHERE p.status = 'Inspection'
                      AND p.permit_type = ANY(%s)
                      AND p.issued_date IS NOT NULL
                      AND p.issued_date > NOW() - INTERVAL '3 years'
                      AND (p.enriched_status IS NULL
                           OR p.enriched_status IN ('Permit Issued', 'Active Inspection', 'Not Passed'))
                      AND (pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '7 days')
                      AND SUBSTRING(p.permit_num FROM '^[0-9]{2}')::int <= EXTRACT(YEAR FROM CURRENT_DATE) %% 100
                    GROUP BY year_seq
                    ORDER BY max_issued DESC
                    LIMIT %s
                ) sub
            """, (TARGET_TYPES, BATCH_SIZE))
            rows = cur.fetchall()
            cur.close()

            log('INFO', '[scraper]', f'Batch mode: {len(rows)} year+sequence combos to scrape')

            for i, row in enumerate(rows):
                year_seq = row['year_seq']
                progress_pct = (i + 1) / len(rows) * 100
                elapsed = (time.time() * 1000 - start_ms) / 1000
                print(f"  [aic-scraper-nodriver] {i + 1} / {len(rows)} ({progress_pct:.1f}%) — {elapsed:.1f}s")

                # WAF trap detection
                if tel['consecutive_empty'] >= WAF_TRAP_THRESHOLD:
                    log('WARN', '[scraper]', f"WAF trap detected ({tel['consecutive_empty']} consecutive empty). Re-bootstrapping...")
                    try:
                        browser.stop()
                        browser = None
                        browser, page, attempts = await bootstrap_with_retry()
                        tel['session_bootstraps'] += attempts
                        tel['consecutive_empty'] = 0
                    except Exception as err:
                        tel['session_failures'] += 1
                        log('ERROR', '[scraper]', str(err), {'event': 'session_bootstrap_failed'})
                        break

                # Periodic session refresh
                if i > 0 and i % SESSION_REFRESH_INTERVAL == 0:
                    log('INFO', '[scraper]', f'Refreshing session (after {i} permits)...')
                    try:
                        page = await browser.get(f'{AIC_BASE}/setup.do?action=init', new_tab=False)
                        await page.sleep(1)
                    except Exception as err:
                        tel['session_failures'] += 1
                        log('ERROR', '[scraper]', str(err), {'event': 'session_refresh_failed'})

                req_start = time.time() * 1000
                result = await scrape_with_retry(page, year_seq, conn)
                tel['latencies'].append(time.time() * 1000 - req_start)
                accumulate(result)

                # Jitter between requests (500-2000ms)
                if i < len(rows) - 1:
                    await page.sleep(0.5 + random.random() * 1.5)

                # Early abort on sustained misses
                if i >= 9 and (i + 1) % 10 == 0 and tel['not_found_count'] / tel['permits_attempted'] >= 0.9:
                    log('WARN', '[scraper]', f"Early abort: {tel['not_found_count']}/{tel['permits_attempted']} not found")
                    break

    finally:
        if browser:
            browser.stop()
        conn.close()

    # Compute latency percentiles
    latencies = sorted(tel['latencies']) if tel['latencies'] else [0]
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    elapsed_s = (time.time() * 1000 - start_ms) / 1000

    log('INFO', '[scraper]', 'Scrape complete', {
        'permits_attempted': tel['permits_attempted'],
        'permits_found': tel['permits_found'],
        'permits_scraped': tel['permits_scraped'],
        'enriched_updates': tel['enriched_updates'],
        'status_changes': tel['status_changes'],
        'proxy_errors': tel['proxy_errors'],
        'session_bootstraps': tel['session_bootstraps'],
        'elapsed': f'{elapsed_s:.1f}s',
    })

    duration_ms = int(time.time() * 1000 - start_ms)
    miss_rate = (tel['not_found_count'] / tel['permits_attempted'] * 100) if tel['permits_attempted'] > 0 else 0
    miss_status = 'FAIL' if miss_rate >= 20 else 'PASS'

    emit_summary({
        'records_total': tel['permits_attempted'],
        'records_new': tel['total_upserted'],
        'records_updated': tel['status_changes'],
        'records_meta': {
            'scraper_telemetry': {
                'permits_attempted': tel['permits_attempted'],
                'permits_found': tel['permits_found'],
                'permits_scraped': tel['permits_scraped'],
                'not_found_count': tel['not_found_count'],
                'enriched_updates': tel['enriched_updates'],
                'proxy_errors': tel['proxy_errors'],
                'consecutive_empty_max': tel['consecutive_empty_max'],
                'session_bootstraps': tel['session_bootstraps'],
                'session_failures': tel['session_failures'],
                'schema_drift': tel['schema_drift'],
                'status_changes': tel['status_changes'],
                'error_categories': tel['error_categories'],
                'last_error': tel['last_error'],
                'proxy_configured': bool(os.environ.get('PROXY_HOST')),
                'proxy_host': os.environ.get('PROXY_HOST'),
                'latency': {'p50': int(p50), 'p95': int(p95), 'max': int(latencies[-1])},
            },
            'audit_table': {
                'phase': 1,
                'name': 'Data Ingestion',
                'verdict': 'FAIL' if miss_status == 'FAIL' else 'PASS',
                'rows': [
                    {'metric': 'permits_attempted', 'value': tel['permits_attempted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'permits_found', 'value': tel['permits_found'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'enriched_updates', 'value': tel['enriched_updates'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'not_found_count', 'value': tel['not_found_count'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'not_found_rate', 'value': f'{miss_rate:.1f}%', 'threshold': '< 20%', 'status': miss_status},
                    {'metric': 'records_inserted', 'value': tel['total_upserted'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'records_updated', 'value': tel['status_changes'], 'threshold': None, 'status': 'INFO'},
                    {'metric': 'duration_ms', 'value': duration_ms, 'threshold': None, 'status': 'INFO'},
                    {'metric': 'exit_code', 'value': 0, 'threshold': '== 0', 'status': 'PASS'},
                    {'metric': 'pipeline_summary_emitted', 'value': True, 'threshold': '== true', 'status': 'PASS'},
                ],
            },
        },
    })

    emit_meta(
        {'permits': ['permit_num', 'status', 'enriched_status', 'permit_type']},
        {'permit_inspections': ['permit_num', 'stage_name', 'status', 'inspection_date', 'scraped_at']},
        ['AIC Portal REST API (secure.toronto.ca/ApplicationStatus/jaxrs)']
    )


if __name__ == '__main__':
    asyncio.run(main())
