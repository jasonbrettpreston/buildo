#!/usr/bin/env node
/**
 * Pipeline Chain Orchestrator
 *
 * Runs a sequence of pipeline scripts in order, tracking each step and
 * the overall chain in the pipeline_runs table. Stops on first failure.
 *
 * Usage: node scripts/run-chain.js <chain_id>
 *   chain_id: permits | coa | sources | entities
 *
 * Example: node scripts/run-chain.js permits
 */
const pipeline = require('./lib/pipeline');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let _pool = null; // Module-level reference for fatal handler cleanup

async function run() {
  const pool = pipeline.createPool();
  _pool = pool;

  // Parse manifest inside run() so errors are caught by the global try/catch
  // and logged via pipeline.log (instead of crashing with raw stderr on boot)
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'manifest.json'), 'utf-8')
  );
  const CHAINS = manifest.chains;
  const PIPELINE_SCRIPTS = {};
  for (const [slug, entry] of Object.entries(manifest.scripts)) {
    PIPELINE_SCRIPTS[slug] = entry.file;
  }

  const chainId = process.argv[2];
  // Parse externalRunId BEFORE validation so we can mark it as failed on invalid chain
  const externalRunId = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (!chainId || !CHAINS[chainId]) {
    pipeline.log.error('[run-chain]', `Invalid chain_id. Available: ${Object.keys(CHAINS).join(', ')}`);
    // Mark external run as failed so it doesn't ghost in the UI as 'running' forever
    if (externalRunId) {
      await pool.query(
        `UPDATE pipeline_runs SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
        [`Invalid chain_id: ${chainId}`, externalRunId]
      ).catch(() => {});
    }
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const steps = CHAINS[chainId];
  const chainSlug = `chain_${chainId}`;
  const projectRoot = path.resolve(__dirname, '..');
  const forceMode = process.argv.includes('--force');

  console.log(`\n=== Chain: ${chainId} (${steps.length} steps)${forceMode ? ' [FORCE]' : ''} ===\n`);

  let chainRunId = null;
  const chainStart = Date.now();
  if (externalRunId) {
    chainRunId = externalRunId;
    console.log(`Using pre-created pipeline_runs row: ${chainRunId}`);
  } else {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running')
         RETURNING id`,
        [chainSlug]
      );
      chainRunId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[run-chain]', `Could not insert chain tracking row: ${err.message}`);
    }
  }

  // Pre-fetch enabled/disabled state for pipeline steps in THIS chain.
  // H-W19: chain_id = NULL means "disabled globally across all chains";
  // chain_id = '<chain>' scopes the disable to that chain only. Without
  // the chain filter, disabling classify_lifecycle_phase for coa
  // maintenance would also silently kill it in the permits chain.
  // NULL = global sentinel mirrors phase_calibration.permit_type.
  const disabledSlugs = new Set();
  try {
    const res = await pool.query(
      `SELECT pipeline FROM pipeline_schedules
        WHERE enabled = FALSE
          AND (chain_id IS NULL OR chain_id = $1)`,
      [chainId]
    );
    for (const row of res.rows) disabledSlugs.add(row.pipeline);
  } catch (err) {
    pipeline.log.warn('[run-chain]', `Could not query pipeline_schedules: ${err.message}`);
  }

  let failedStep = null;
  let gateSkipped = false;
  let wasCancelled = false;
  const stepVerdicts = {}; // slug → 'PASS' | 'WARN' | 'FAIL'

  // Check if previous chain run failed — if so, disable gate-skip to ensure
  // unprocessed records from the failed run get enriched downstream.
  let prevChainFailed = false;
  try {
    const prevRun = await pool.query(
      `SELECT status FROM pipeline_runs
       WHERE pipeline = $1 AND id != COALESCE($2, 0)
       ORDER BY started_at DESC LIMIT 1`,
      [chainSlug, chainRunId]
    );
    if (prevRun.rows[0]?.status === 'failed') {
      prevChainFailed = true;
      pipeline.log.info('[run-chain]', 'Previous chain run failed — gate-skip disabled to process unfinished work');
    }
  } catch (err) {
    pipeline.log.warn('[run-chain]', `Previous run check failed: ${err.message}`);
  }

  // Pre-flight bloat gate thresholds (B24/B25)
  // Phase 0 is the SOLE bloat defense — checks BEFORE any steps run.
  // Per-step bloat gate was removed: normal upserts create 50-99% dead tuples
  // which autovacuum handles between runs. Phase 0 catches pre-existing stalls.
  const BLOAT_WARN_THRESHOLD = 0.30;
  const BLOAT_ABORT_THRESHOLD = 0.50;

  // Phase 0: Pre-Flight Health Gate — collect bloat for all chain tables
  const preFlightRows = [];
  let preFlightVerdict = 'PASS';
  try {
    const allTables = new Set();
    for (const slug of steps) {
      const meta = manifest.scripts[slug];
      if (meta?.telemetry_tables) meta.telemetry_tables.forEach((t) => { allTables.add(t); });
    }
    for (const table of allTables) {
      const res = await pool.query(
        `SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead
         FROM pg_stat_user_tables WHERE relname = $1`, [table]
      );
      if (res.rows[0]) {
        const live = parseInt(res.rows[0].live, 10) || 0;
        const dead = parseInt(res.rows[0].dead, 10) || 0;
        const ratio = (live + dead) > 0 ? dead / (live + dead) : 0;
        const pct = (ratio * 100).toFixed(1) + '%';
        let status = 'PASS';
        if (ratio > BLOAT_ABORT_THRESHOLD) { status = 'FAIL'; preFlightVerdict = 'FAIL'; }
        else if (ratio > BLOAT_WARN_THRESHOLD) { status = 'WARN'; if (preFlightVerdict === 'PASS') preFlightVerdict = 'WARN'; }
        preFlightRows.push({ metric: `sys_db_bloat_${table}`, value: pct, threshold: '< 50% (warn)', status });
      }
    }
  } catch (err) {
    pipeline.log.warn('[run-chain]', `Pre-flight health check failed: ${err.message}`);
  }
  // Store Phase 0 in chain records_meta (available to dashboard)
  const preFlightAudit = {
    phase: 0,
    name: 'Pre-Flight Health Gate',
    verdict: preFlightVerdict,
    rows: preFlightRows,
  };
  pipeline.log.info('[run-chain]', `Pre-Flight: ${preFlightVerdict} (${preFlightRows.length} tables checked)`);

  // Phase 0 is warn-only — never blocks chain execution.
  // Dead tuples from prior runs are expected (MVCC); autovacuum handles cleanup.
  // The pre_flight_audit is stored in chain records_meta for dashboard visibility.
  if (preFlightVerdict === 'FAIL') {
    pipeline.log.warn('[run-chain]', 'Pre-flight bloat WARNING: dead tuple ratio exceeds 50% on some tables. Consider running VACUUM.', { preFlightRows });
  }

  for (let i = 0; i < steps.length; i++) {
    const slug = steps[i];
    const stepLabel = `[${i + 1}/${steps.length}] ${slug}`;

    // Check if chain was cancelled between steps
    if (chainRunId) {
      try {
        const statusCheck = await pool.query(
          `SELECT status FROM pipeline_runs WHERE id = $1`,
          [chainRunId]
        );
        if (statusCheck.rows[0]?.status === 'cancelled') {
          console.log(`\nChain cancelled by user — stopping before ${slug}`);
          failedStep = slug;
          wasCancelled = true;
          break;
        }
      } catch (err) { pipeline.log.warn('[run-chain]', `Cancel check failed: ${err.message}`); }
    }

    // Skip disabled steps
    if (disabledSlugs.has(slug)) {
      console.log(`${stepLabel} — SKIPPED (disabled)`);
      const scopedSlug = `${chainId}:${slug}`;
      try {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms)
           VALUES ($1, NOW(), NOW(), 'skipped', 0)`,
          [scopedSlug]
        );
      } catch (err) {
        pipeline.log.warn('[run-chain]', `Skip tracking insert failed: ${err.message}`);
      }
      continue;
    }

    // Gate-skip: when primary ingest had 0 new records, skip non-essential
    // downstream steps but still run quality/infrastructure steps (assert_*,
    // classify_*, compute_*, refresh_snapshot) — they check cumulative DB state,
    // not just the latest batch.
    //
    // `update_tracked_projects` is explicitly included because it processes
    // existing tracked rows to emit time-sensitive CRM alerts (stall, recovery,
    // imminent). A stall that happens on a no-ingest day must still trigger a
    // notification. See adversarial Probe 8 / independent FAIL-4.
    const isInfraStep = slug.startsWith('assert_')
      || slug.startsWith('classify_')
      || slug.startsWith('compute_')
      || slug === 'refresh_snapshot'
      || slug === 'close_stale_permits'
      || slug === 'update_tracked_projects';
    if (gateSkipped && !isInfraStep) {
      console.log(`${stepLabel} — SKIPPED (gate: 0 new records)`);
      const scopedSlug = `${chainId}:${slug}`;
      try {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms)
           VALUES ($1, NOW(), NOW(), 'skipped', 0)`,
          [scopedSlug]
        );
      } catch (err) {
        pipeline.log.warn('[run-chain]', `Gate-skip tracking insert failed: ${err.message}`);
      }
      continue;
    }

    // Skip coming_soon placeholders (file: null) to prevent path.resolve crash
    if (manifest.scripts[slug]?.coming_soon) {
      console.log(`${stepLabel} — SKIPPED (coming soon)`);
      continue;
    }

    const scriptRelPath = PIPELINE_SCRIPTS[slug];
    if (!scriptRelPath) {
      pipeline.log.error('[run-chain]', `No script mapping for slug: ${slug}`);
      failedStep = slug;
      break;
    }

    const scriptPath = path.resolve(projectRoot, scriptRelPath);
    if (!fs.existsSync(scriptPath)) {
      pipeline.log.error('[run-chain]', `Script not found: ${scriptRelPath}`);
      failedStep = slug;
      break;
    }

    console.log(`${stepLabel} — starting...`);

    // Insert step tracking row — scoped to chain (e.g. permits:assert_schema)
    // so status doesn't bleed across chains that share the same step slug.
    const scopedSlug = `${chainId}:${slug}`;
    let stepRunId = null;
    const stepStart = Date.now();
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running')
         RETURNING id`,
        [scopedSlug]
      );
      stepRunId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[run-chain]', `Could not insert step tracking row: ${err.message}`);
    }

    // T1/T2/T4 Telemetry: capture pre-run DB state for transparency
    let preTelemetry = null;
    const scriptEntry = manifest.scripts[slug];
    const telemetryTables = scriptEntry?.telemetry_tables ?? [];
    const telemetryNullCols = scriptEntry?.telemetry_null_cols ?? null;
    if (telemetryTables.length > 0) {
      try {
        preTelemetry = await pipeline.captureTelemetry(pool, telemetryTables, telemetryNullCols);
      } catch (err) {
        pipeline.log.warn('[run-chain]', `Pre-telemetry capture failed for ${slug}: ${err.message}`);
      }
    }

    // summaryLines is declared outside try/catch so the catch block can parse
    // PIPELINE_SUMMARY on failure (scrapers emit telemetry even when exiting non-zero).
    let summaryLines = '';

    try {
      // Merge step-specific env vars and chain-specific args from manifest
      const stepEnv = { ...process.env, PIPELINE_CHAIN: chainId, ...(scriptEntry.env || {}) };
      const extraArgs = [...(scriptEntry.chain_args?.[chainId] || [])];
      // Spawn child process with streaming stdout — prevents ENOBUFS on long scripts.
      const output = await new Promise((resolveSpawn, rejectSpawn) => {
        const runtime = scriptPath.endsWith('.py')
          ? (process.platform === 'win32' ? 'python' : 'python3')
          : 'node';
        const child = spawn(runtime, [scriptPath, ...extraArgs], {
          env: stepEnv,
          stdio: ['inherit', 'pipe', 'inherit'],
        });

        // StringDecoder correctly buffers split multibyte UTF-8 characters
        // across chunk boundaries (OS fragments at ~8KB). Without it,
        // Buffer.toString('utf-8') can corrupt characters split mid-sequence.
        const decoder = new StringDecoder('utf8');
        let lineBuffer = '';
        child.stdout.on('data', (data) => {
          const chunk = decoder.write(data);
          process.stdout.write(chunk); // Tee to console immediately
          lineBuffer += chunk;
          const lines = lineBuffer.split('\n');
          // Last element is incomplete (no trailing \n) — retain for next chunk
          lineBuffer = lines.pop();
          for (const line of lines) {
            if (line.includes('PIPELINE_SUMMARY:') || line.includes('PIPELINE_META:')) {
              summaryLines += line + '\n';
            }
          }
        });

        child.on('close', (code) => {
          // Flush remaining decoder bytes + line buffer
          const remaining = decoder.end();
          if (remaining) lineBuffer += remaining;
          if (lineBuffer && (lineBuffer.includes('PIPELINE_SUMMARY:') || lineBuffer.includes('PIPELINE_META:'))) {
            summaryLines += lineBuffer + '\n';
          }
          if (code === 0) resolveSpawn(summaryLines);
          else rejectSpawn(new Error(`Command failed: ${runtime} ${scriptPath}`));
        });
        child.on('error', rejectSpawn);
      });

      // Parse PIPELINE_SUMMARY line for record counts + records_meta
      let recordsTotal = null;
      let recordsNew = null;
      let recordsUpdated = null;
      let recordsMeta = null;
      // Use last PIPELINE_SUMMARY — multi-worker scripts (orchestrator) emit
      // worker summaries before the aggregate. matchAll + last gets the aggregate.
      const summaryMatches = [...output.matchAll(/PIPELINE_SUMMARY:(.+)/g)];
      const summaryMatch = summaryMatches.length > 0 ? summaryMatches[summaryMatches.length - 1] : null;
      if (summaryMatch) {
        try {
          const summary = JSON.parse(summaryMatch[1]);
          recordsTotal = summary.records_total ?? null;
          recordsNew = summary.records_new ?? null;
          recordsUpdated = summary.records_updated ?? null;
          recordsMeta = summary.records_meta ?? null;
        } catch (parseErr) {
          pipeline.log.warn('[run-chain]', `Malformed PIPELINE_SUMMARY JSON from ${slug}: ${parseErr.message}`);
        }
      }

      // Extract audit_table verdict for chain-level aggregation
      if (recordsMeta?.audit_table?.verdict) {
        stepVerdicts[slug] = recordsMeta.audit_table.verdict;
      }

      // Parse PIPELINE_META line for self-documented reads/writes
      const metaMatches = [...output.matchAll(/PIPELINE_META:(.+)/g)];
      const metaMatch = metaMatches.length > 0 ? metaMatches[metaMatches.length - 1] : null;
      if (metaMatch) {
        try {
          const pipelineMeta = JSON.parse(metaMatch[1]);
          // Merge into records_meta under pipeline_meta key
          recordsMeta = { ...(recordsMeta || {}), pipeline_meta: pipelineMeta };
        } catch (parseErr) {
          pipeline.log.warn('[run-chain]', `Malformed PIPELINE_META JSON from ${slug}: ${parseErr.message}`);
        }
      }

      // T1/T2/T4 Telemetry: capture post-run state (always, even on success)
      if (preTelemetry) {
        try {
          const telemetry = await pipeline.diffTelemetry(pool, telemetryTables, preTelemetry);
          recordsMeta = { ...(recordsMeta || {}), telemetry };
        } catch (err) {
          pipeline.log.warn('[run-chain]', `Post-telemetry capture failed for ${slug}: ${err.message}`);
        }
      }

      const durationMs = Date.now() - stepStart;
      console.log(`${stepLabel} — completed (${(durationMs / 1000).toFixed(1)}s)\n`);

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'completed', duration_ms = $1,
               records_total = COALESCE($3, records_total),
               records_new = COALESCE($4, records_new),
               records_updated = COALESCE($5, records_updated),
               records_meta = COALESCE($6::jsonb, records_meta)
           WHERE id = $2`,
          [durationMs, stepRunId, recordsTotal, recordsNew, recordsUpdated, recordsMeta ? JSON.stringify(recordsMeta) : null]
        );
        // No .catch() — DB failures on step completion must halt the chain
        // (masked disconnects would silently cascade into the next step)
      }

      // When the primary ingest step produced zero changes, set gateSkipped
      // so non-essential downstream steps are skipped. Quality/infrastructure
      // steps (assert_*, refresh_snapshot) still run — they check cumulative
      // DB state, not just the latest batch.
      // --force bypasses gate-skip entirely (recovery after mid-chain crash).
      // prevChainFailed also bypasses: unprocessed records from failed prior run.
      const gate = manifest.chain_gates[chainId];
      // Defensive: null/undefined coerce to 0 (null === 0 is false in JS)
      if (gate && slug === gate && (recordsNew || 0) === 0 && (recordsUpdated || 0) === 0 && !forceMode && !prevChainFailed) {
        console.log(`${stepLabel} — 0 new records — skipping non-essential downstream steps`);
        gateSkipped = true;
      }
    } catch (err) {
      // With spawn, stdout was already streamed to console in real-time
      const durationMs = Date.now() - stepStart;
      const errorMsg = (err.message || String(err)).slice(0, 4000);
      pipeline.log.error('[run-chain]', `${stepLabel} — FAILED (${(durationMs / 1000).toFixed(1)}s)`, { error: errorMsg.slice(0, 200) });

      // Parse PIPELINE_SUMMARY + PIPELINE_META from stdout even on failure —
      // scrapers emit telemetry (audit_table, scraper_telemetry) before exiting non-zero.
      let failMeta = null;
      const failSummaryMatches = [...summaryLines.matchAll(/PIPELINE_SUMMARY:(.+)/g)];
      const failSummaryMatch = failSummaryMatches.length > 0 ? failSummaryMatches[failSummaryMatches.length - 1] : null;
      if (failSummaryMatch) {
        try {
          const summary = JSON.parse(failSummaryMatch[1]);
          failMeta = summary.records_meta ?? null;
          // Extract verdict from failure telemetry (same as success path)
          if (failMeta?.audit_table?.verdict) {
            stepVerdicts[slug] = failMeta.audit_table.verdict;
          }
        } catch (parseErr) {
          pipeline.log.warn('[run-chain]', `Malformed PIPELINE_SUMMARY JSON from failed ${slug}: ${parseErr.message}`);
        }
      }
      const failMetaMatches = [...summaryLines.matchAll(/PIPELINE_META:(.+)/g)];
      const failMetaMatch = failMetaMatches.length > 0 ? failMetaMatches[failMetaMatches.length - 1] : null;
      if (failMetaMatch) {
        try {
          const pipelineMeta = JSON.parse(failMetaMatch[1]);
          failMeta = { ...(failMeta || {}), pipeline_meta: pipelineMeta };
        } catch (parseErr) {
          pipeline.log.warn('[run-chain]', `Malformed PIPELINE_META JSON from failed ${slug}: ${parseErr.message}`);
        }
      }

      // T1/T2/T4: Still capture post-run telemetry on failure — partial data
      // (e.g. "5,000 rows inserted before crash") is invaluable for debugging.
      if (preTelemetry) {
        try {
          const telemetry = await pipeline.diffTelemetry(pool, telemetryTables, preTelemetry);
          failMeta = { ...(failMeta || {}), telemetry };
        } catch (telErr) { pipeline.log.warn('[run-chain]', `Failure-path telemetry capture failed for ${slug}: ${telErr.message}`); }
      }

      if (stepRunId) {
        await pool.query(
          `UPDATE pipeline_runs
           SET completed_at = NOW(), status = 'failed', duration_ms = $1, error_message = $2,
               records_meta = COALESCE($4::jsonb, records_meta)
           WHERE id = $3`,
          [durationMs, errorMsg, stepRunId, failMeta ? JSON.stringify(failMeta) : null]
        ).catch((dbErr) => { pipeline.log.error('[run-chain]', `Failed to update pipeline_runs: ${dbErr.message}`); });
      }

      failedStep = slug;
      break;
    }
  }

  // Update parent chain row — aggregate step verdicts for chain-level health
  const chainDurationMs = Date.now() - chainStart;
  const verdictValues = Object.values(stepVerdicts);
  const hasVerdictFails = verdictValues.includes('FAIL');
  const hasVerdictWarns = verdictValues.includes('WARN');

  let chainStatus;
  if (wasCancelled) chainStatus = 'cancelled';
  else if (failedStep) chainStatus = 'failed';
  else if (hasVerdictFails) chainStatus = 'completed_with_errors';
  else if (hasVerdictWarns) chainStatus = 'completed_with_warnings';
  else chainStatus = 'completed';

  const chainError = failedStep
    ? `Stopped at step: ${failedStep}`
    : gateSkipped
      ? '0 new records — downstream steps skipped'
      : null;

  // Include step verdicts + pre-flight audit in chain records_meta for drill-down
  const metaObj = {};
  if (Object.keys(stepVerdicts).length > 0) metaObj.step_verdicts = stepVerdicts;
  if (preFlightRows.length > 0) metaObj.pre_flight_audit = preFlightAudit;
  const chainMeta = Object.keys(metaObj).length > 0 ? JSON.stringify(metaObj) : null;

  if (chainRunId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_meta = COALESCE(records_meta, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb)
       WHERE id = $4`,
      [chainStatus, chainDurationMs, chainError, chainRunId, chainMeta]
    ).catch((dbErr) => { pipeline.log.error('[run-chain]', `Failed to update chain status: ${dbErr.message}`); });
  }

  console.log(`=== Chain ${chainId}: ${chainStatus} (${(chainDurationMs / 1000).toFixed(1)}s) ===`);
  if (failedStep) {
    pipeline.log.error('[run-chain]', `Chain stopped at step: ${failedStep}`);
  }
  if (hasVerdictFails && !failedStep) {
    pipeline.log.warn('[run-chain]', `Chain completed but ${verdictValues.filter(v => v === 'FAIL').length} step(s) reported FAIL verdicts`, { step_verdicts: stepVerdicts });
  }
  if (hasVerdictWarns && !hasVerdictFails && !failedStep) {
    pipeline.log.warn('[run-chain]', `Chain completed with ${verdictValues.filter(v => v === 'WARN').length} warning(s)`, { step_verdicts: stepVerdicts });
  }
  if (gateSkipped) {
    pipeline.log.info('[run-chain]', '0 new records — downstream steps skipped (stale data, not a failure)');
  }

  await pool.end().catch((dbErr) => { pipeline.log.warn('[run-chain]', `pool.end failed: ${dbErr.message}`); });

  if (failedStep) process.exit(1);
}

run().catch(async (err) => {
  pipeline.log.error('[run-chain]', err, { phase: 'fatal' });
  // Close pool to prevent orphaned TCP connections on the database server
  if (_pool) { try { await _pool.end(); } catch { /* best effort */ } }
  setTimeout(() => process.exit(1), 500);
});
