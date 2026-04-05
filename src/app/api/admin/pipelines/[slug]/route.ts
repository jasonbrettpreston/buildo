import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

/** Track running child processes so DELETE can kill them */
const runningProcesses = new Map<string, ChildProcess>();

/**
 * Map of allowed pipeline slugs to their script paths (relative to project root).
 */
const PIPELINE_SCRIPTS: Record<string, string> = {
  // Ingest (load raw data)
  permits: 'scripts/load-permits.js',
  coa: 'scripts/load-coa.js',
  builders: 'scripts/extract-builders.js',
  address_points: 'scripts/load-address-points.js',
  parcels: 'scripts/load-parcels.js',
  massing: 'scripts/load-massing.js',
  neighbourhoods: 'scripts/load-neighbourhoods.js',
  // Link (join data sources)
  geocode_permits: 'scripts/geocode-permits.js',
  link_parcels: 'scripts/link-parcels.js',
  link_neighbourhoods: 'scripts/link-neighbourhoods.js',
  link_massing: 'scripts/link-massing.js',
  link_coa: 'scripts/link-coa.js',
  // Enrich (augment records)
  enrich_wsib_builders: 'scripts/enrich-web-search.js',
  enrich_named_builders: 'scripts/enrich-web-search.js',
  load_wsib: 'scripts/load-wsib.js',
  link_wsib: 'scripts/link-wsib.js',
  // Scrape (external portal data)
  inspections: 'scripts/aic-orchestrator.py',
  // Classify (derive fields)
  classify_scope: 'scripts/classify-scope.js',
  classify_permits: 'scripts/classify-permits.js',
  // Compute centroids
  compute_centroids: 'scripts/compute-centroids.js',
  // Link similar + pre-permits
  link_similar: 'scripts/link-similar.js',
  create_pre_permits: 'scripts/create-pre-permits.js',
  // Snapshot (capture metrics)
  refresh_snapshot: 'scripts/refresh-snapshot.js',
  // Quality (CQA validation)
  assert_schema: 'scripts/quality/assert-schema.js',
  assert_data_bounds: 'scripts/quality/assert-data-bounds.js',
  assert_network_health: 'scripts/quality/assert-network-health.js',
  assert_staleness: 'scripts/quality/assert-staleness.js',
  assert_pre_permit_aging: 'scripts/quality/assert-pre-permit-aging.js',
  assert_coa_freshness: 'scripts/quality/assert-coa-freshness.js',
  // Chain orchestrators
  chain_permits: 'scripts/run-chain.js',
  chain_coa: 'scripts/run-chain.js',
  chain_sources: 'scripts/run-chain.js',
  chain_entities: 'scripts/run-chain.js',
  chain_wsib: 'scripts/run-chain.js',
  chain_deep_scrapes: 'scripts/run-chain.js',
};

const CHAIN_SLUGS = new Set(['chain_permits', 'chain_coa', 'chain_sources', 'chain_entities', 'chain_wsib', 'chain_deep_scrapes']);

const ALLOWED_PIPELINES = Object.keys(PIPELINE_SCRIPTS);

/**
 * POST /api/admin/pipelines/[slug] - Trigger a manual pipeline run.
 *
 * Creates a pipeline_runs row, spawns the script in the background,
 * and returns immediately with the run ID.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!ALLOWED_PIPELINES.includes(slug)) {
    return NextResponse.json(
      { error: `Invalid pipeline: ${slug}. Allowed: ${ALLOWED_PIPELINES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate script exists before spawning
  const scriptPath = path.resolve(process.cwd(), PIPELINE_SCRIPTS[slug]);
  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json(
      { error: `Script not found: ${PIPELINE_SCRIPTS[slug]}` },
      { status: 500 }
    );
  }

  const isChain = CHAIN_SLUGS.has(slug);

  // Concurrency guard: reject if a live process is already running for this slug.
  // Prevents resource contention (B11: concurrent chains slow classify_permits from
  // ~10 min to 88+ min, exceeding the 1-hour timeout).
  const existingChild = runningProcesses.get(slug);
  if (existingChild && !existingChild.killed) {
    return NextResponse.json(
      { error: `Pipeline ${slug} is already running` },
      { status: 409 }
    );
  }

  // Force-cancel any previous 'running' rows for this slug.
  // Previous runs may be stale (dev server restart, process crash) and would
  // permanently block future runs. Also kill the OS process if still alive.
  const staleChild = runningProcesses.get(slug);
  if (staleChild && !staleChild.killed) {
    staleChild.kill('SIGTERM');
    runningProcesses.delete(slug);
  }
  try {
    await query(
      `UPDATE pipeline_runs
       SET status = 'cancelled', error_message = 'Superseded by new run', completed_at = NOW()
       WHERE status = 'running'
         AND pipeline = $1`,
      [slug]
    );
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, { event: 'cancel_stale_failed' });
  }

  // Stale-run cleanup: mark any orphaned 'running' rows older than the timeout
  // threshold as failed. This catches processes killed by timeout, server restart,
  // or crash where the callback never fired to update the row.
  try {
    await query(
      `UPDATE pipeline_runs
       SET status = 'failed', error_message = 'Process timed out or orphaned — cleaned up on next run', completed_at = NOW()
       WHERE status = 'running'
         AND started_at < NOW() - INTERVAL '70 minutes'`,
      []
    );
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, { event: 'stale_orphan_cleanup_failed' });
  }

  // Insert tracking row for ALL pipelines (including chains) so the row exists
  // immediately for UI polling. Chain script receives the runId to avoid duplicates.
  let runId: number | null = null;
  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), 'running')
       RETURNING id`,
      [slug]
    );
    runId = rows[0].id;
  } catch (trackErr) {
    console.warn(`[pipelines/${slug}] pipeline_runs table not available, running without tracking:`, trackErr instanceof Error ? trackErr.message : trackErr);
  }

  // Bug 1 fix: Use spawn (not execFile) — execFile pipes stdin which causes
  // pg pool.connect() to hang on Windows. spawn with 'ignore' stdin avoids this.
  // Also supports ?force=true for chain recovery (Bug 2).
  const forceMode = request.nextUrl.searchParams.get('force') === 'true';

  try {
    const startMs = Date.now();

    // For chain slugs, pass the chain ID and the pre-created runId so the
    // chain script reuses it instead of inserting a duplicate tracking row.
    const args = isChain
      ? [scriptPath, slug.replace(/^chain_/, ''), ...(runId ? [String(runId)] : []), ...(forceMode ? ['--force'] : [])]
      : [scriptPath];
    const LONG_RUNNING = new Set(['enrich_wsib_registry', 'enrich_wsib_builders', 'enrich_named_builders', 'inspections', 'chain_wsib']);
    const timeout = LONG_RUNNING.has(slug) ? 86_400_000 : isChain ? 7_200_000 : 600_000; // 24h enrichment/scrape, 2h other chains, 10min individual

    // Detect Python scripts and use the correct runtime.
    const isPython = scriptPath.endsWith('.py');
    const runtime = isPython
      ? (process.platform === 'win32' ? 'python' : 'python3')
      : 'node';

    // spawn with stdin='ignore' to prevent Windows pg connection hang.
    // stdout/stderr are piped for PIPELINE_SUMMARY/META parsing.
    const child = spawn(runtime, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Buffer stdout/stderr for parsing after process exits
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

    // Timeout: kill the process if it exceeds the limit
    const timeoutHandle = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        // Give 5s for graceful shutdown, then force-kill
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
      }
    }, timeout);

    child.on('close', async (code) => {
      clearTimeout(timeoutHandle);
      runningProcesses.delete(slug);

      const err = code !== 0;
      if (err) {
        logError(`[pipelines/${slug}]`, new Error(`Script exited with code ${code}`), {
          event: 'script_failed', run_id: runId, stderr: stderr?.slice(0, 2000),
        });
      }

      // isChain guard: skip the status/error_message UPDATE — run-chain.js
      // manages its own row. The chain script sets status (completed/failed/cancelled)
      // and a clean error_message directly. If we overwrite here, we'd replace it
      // with raw stderr content (assert_schema warnings, JSON log entries, etc.).
      // The stale-run cleanup (above) handles the case where the chain process
      // dies without updating its row (timeout, crash).
      if (isChain) return;

      const durationMs = Date.now() - startMs;
      const status = err ? 'failed' : 'completed';
      // Prefer stderr for error details, fall back to exit code
      const errorMsg = err
        ? (stderr?.trim() || `Process exited with code ${code}`).slice(0, 4000)
        : null;

      // Parse PIPELINE_SUMMARY from stdout for record counts + records_meta
      let recordsTotal: number | null = null;
      let recordsNew: number | null = null;
      let recordsUpdated: number | null = null;
      let recordsMeta: Record<string, unknown> | null = null;
      // Use last PIPELINE_SUMMARY line — orchestrator emits its aggregate after
      // workers stream theirs. .match() returns the first; we need the last.
      const summaryMatches = [...(stdout?.matchAll(/PIPELINE_SUMMARY:(.+)/g) ?? [])];
      const summaryMatch = summaryMatches.length > 0 ? summaryMatches[summaryMatches.length - 1] : null;
      if (summaryMatch) {
        try {
          const summary = JSON.parse(summaryMatch[1]);
          recordsTotal = summary.records_total ?? null;
          recordsNew = summary.records_new ?? null;
          recordsUpdated = summary.records_updated ?? null;
          recordsMeta = summary.records_meta ?? null;
        } catch { /* malformed summary — ignore */ }
      }

      // Parse PIPELINE_META from stdout for self-documented reads/writes
      const metaMatches = [...(stdout?.matchAll(/PIPELINE_META:(.+)/g) ?? [])];
      const metaMatch = metaMatches.length > 0 ? metaMatches[metaMatches.length - 1] : null;
      if (metaMatch) {
        try {
          const pipelineMeta = JSON.parse(metaMatch[1]);
          recordsMeta = { ...(recordsMeta || {}), pipeline_meta: pipelineMeta };
        } catch { /* malformed meta — ignore */ }
      }

      if (runId) {
        try {
          await query(
            `UPDATE pipeline_runs
               SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
                   records_total = COALESCE($5, records_total),
                   records_new = COALESCE($6, records_new),
                   records_updated = COALESCE($7, records_updated),
                   records_meta = COALESCE($8::jsonb, records_meta)
               WHERE id = $4`,
            [status, durationMs, errorMsg, runId, recordsTotal, recordsNew, recordsUpdated,
             recordsMeta ? JSON.stringify(recordsMeta) : null]
          );
        } catch (updateErr) {
          logError(`[pipelines/${slug}]`, updateErr, { event: 'run_update_failed', run_id: runId });
        }
      }
    });

    child.on('error', (spawnErr) => {
      clearTimeout(timeoutHandle);
      runningProcesses.delete(slug);
      logError(`[pipelines/${slug}]`, spawnErr, { event: 'spawn_failed', run_id: runId });
    });

    // Track process for cancellation
    runningProcesses.set(slug, child);

    // Detach so the API response isn't blocked
    child.unref();

    return NextResponse.json({ run_id: runId, pipeline: slug, status: 'running' });
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, { event: 'trigger_failed' });
    return NextResponse.json(
      { error: 'Failed to trigger pipeline' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/pipelines/[slug] - Cancel a running pipeline/chain.
 *
 * Sets all 'running' rows for the given slug to 'cancelled'.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!ALLOWED_PIPELINES.includes(slug)) {
    return NextResponse.json(
      { error: `Invalid pipeline: ${slug}` },
      { status: 400 }
    );
  }

  try {
    // Kill the running child process if one exists for this slug
    const child = runningProcesses.get(slug);
    if (child && !child.killed) {
      child.kill('SIGTERM');
      runningProcesses.delete(slug);
    }

    // Cancel the chain slug itself AND any chain-scoped step rows (e.g. permits:link_similar)
    const chainPrefix = slug.replace(/^chain_/, '');
    const result = await query<{ id: number }>(
      `UPDATE pipeline_runs
       SET status = 'cancelled', error_message = 'Cancelled by user', completed_at = NOW()
       WHERE status = 'running'
         AND (pipeline = $1 OR pipeline LIKE $2)
       RETURNING id`,
      [slug, `${chainPrefix}:%`]
    );

    return NextResponse.json({
      cancelled: result.length,
      pipeline: slug,
      status: 'cancelled',
    });
  } catch (err) {
    logError(`[pipelines/${slug}]`, err, { event: 'cancel_failed' });
    return NextResponse.json(
      { error: 'Failed to cancel pipeline' },
      { status: 500 }
    );
  }
}
