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
 *
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md
 * SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md
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

// Module-level references for the SIGINT/SIGTERM handler below (Spec 115 §4
// item 6, P3-D7) — the handler needs to reach whichever chain/step run row is
// CURRENTLY in flight when the signal arrives, which is only known inside
// run()'s local scope otherwise. Both are set as soon as their respective
// pipeline_runs row exists and are read-only from the handler's perspective.
let _chainRunId = null;
let _currentStepRunId = null;
let _terminating = false; // guards against double-handling (GH sends SIGINT then SIGTERM ~7.5s later)

// GitHub Actions sends SIGINT first on a timeout-minutes expiry or a
// cancelled run, then SIGTERM ~7.5s later if the process hasn't exited
// (Integration LOW-7) — a handler registered only for SIGTERM would miss the
// far more common first signal entirely. On receipt of either, mark the
// in-flight rows 'failed' immediately rather than leaving them 'running'
// until the 12h TTL (Spec 115 §4 items 4-6 — this is the item-6 gap items
// 4-5 only detect after the fact).
async function handleTerminationSignal(signal) {
  if (_terminating) return;
  _terminating = true;
  const ids = [_chainRunId, _currentStepRunId].filter((id) => id !== null && id !== undefined);
  if (ids.length > 0 && _pool) {
    try {
      await _pool.query(
        `UPDATE pipeline_runs
         SET status = 'failed', completed_at = NOW(),
             error_message = 'Terminated (SIGINT/SIGTERM — likely GH Actions timeout/cancellation)'
         WHERE id = ANY($1) AND status = 'running'`,
        [ids]
      );
    } catch (err) {
      pipeline.log.error('[run-chain]', `Failed to mark run(s) as failed on ${signal}: ${err.message}`, { ids });
    }
  }
  // F8 fold 2026-07-20 (Guardian): unlike the normal-completion path below
  // (L627-645), which explicitly releases the chain advisory lock via
  // `pg_advisory_unlock(2, hashtext(...))` on the SAME pinned client that
  // acquired it, this signal-handling path does NOT call
  // pg_advisory_unlock at all. That is intentional, not an oversight:
  // session-level advisory locks (the two-int `pg_advisory_lock(2, ...)`
  // form this chain lock uses) are automatically released by Postgres when
  // the session that holds them ends — `_pool.end()` closes every
  // connection in the pool, which tears down the session and releases the
  // lock as a side effect. Trying to explicitly unlock here would race the
  // pool teardown for no benefit; the exit code below (`process.exit(1)`)
  // guarantees the process — and therefore the session — is gone shortly
  // after this point regardless.
  if (_pool) { try { await _pool.end(); } catch { /* best effort */ } }
  process.exit(1);
}

process.on('SIGINT', () => { handleTerminationSignal('SIGINT'); });
process.on('SIGTERM', () => { handleTerminationSignal('SIGTERM'); });

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

  // ─── Concurrency guard — single-threaded chain orchestration (WF3-03 / RC-W7) ──
  // Two simultaneous run-chain.js invocations of the same chain (manual
  // re-trigger during nightly + cron overlap) would otherwise race on
  // shared mutations. Per-script locks (81/82/85/86) close most of the
  // gap; this chain-level lock closes the rest by serialising the entire
  // step sequence including unprotected steps.
  //
  // Lock ID uses the TWO-INT form `pg_try_advisory_lock(2, hashtext(...))`.
  // PostgreSQL keeps the 1-arg and 2-arg key spaces fully separate, so
  // chain locks can never collide with per-script locks (which use the
  // 1-arg form with the spec number). The leading `2` is a namespace
  // marker — chain locks live in space `2`, future lock-types could use
  // other namespaces. Acquired on a pinned `pool.connect()` client because
  // session locks are bound to the backend that acquired them (cf. 83-W5).
  const chainLockClient = await pool.connect();
  let chainLockHeld = false;
  try {
    const { rows: lockRows } = await chainLockClient.query(
      `SELECT pg_try_advisory_lock(2, hashtext('chain_' || $1)) AS got`,
      [chainId],
    );
    chainLockHeld = lockRows[0].got;
    if (!chainLockHeld) {
      pipeline.log.warn(
        '[run-chain]',
        `Chain lock for "${chainId}" already held by another orchestrator instance — exiting`,
      );
      // Mark any pre-created external run as cancelled so it doesn't
      // ghost in the UI as 'running' forever. Log (not silently swallow)
      // any failure so an inconsistent UI state surfaces as an error.
      if (externalRunId) {
        await pool.query(
          `UPDATE pipeline_runs SET status = 'cancelled', completed_at = NOW(),
                 error_message = $1 WHERE id = $2`,
          ['Chain lock held by concurrent orchestrator', externalRunId],
        ).catch((dbErr) => pipeline.log.error(
          '[run-chain]',
          'Failed to mark externalRunId as cancelled after lock-held exit',
          { externalRunId, err: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        ));
      }
      chainLockClient.release();
      await pool.end().catch(() => {});
      return;
    }
  } catch (lockErr) {
    chainLockClient.release();
    await pool.end().catch(() => {});
    throw lockErr;
  }

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
  _chainRunId = chainRunId; // visible to the SIGINT/SIGTERM handler above

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
    // AD1 (C1, 2026-08-11): `completed_with_errors` counts as a failed predecessor.
    // Before C1 a red audit always terminalized the chain as 'failed', so keying on
    // that alone was complete. C1 makes a non-halting FAIL land as
    // 'completed_with_errors' instead — the chain finishes, but its work is just as
    // unfinished. Without this, the next run would re-enable gate-skip and quietly
    // skip the backlog the red run left behind. Sole consumer: :565.
    const prevStatus = prevRun.rows[0]?.status;
    if (prevStatus === 'failed' || prevStatus === 'completed_with_errors') {
      prevChainFailed = true;
      pipeline.log.info('[run-chain]', `Previous chain run ${prevStatus} — gate-skip disabled to process unfinished work`);
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

  // Soft time-budget self-stop (Spec 115 §2.2, WF3 2026-08-09) — generalizes the deep-scrapes
  // d6eb9f31 ruling: the platform timeout is the BACKSTOP, never the mechanism. 2026-08-08: an
  // ungated coa (102 min) outran its 90-min GH step timeout — the kill never reached the node
  // process (it ran 12 more minutes concurrently with permits), and permits then died dirty at its
  // own ceiling (orphaned rows). Absent/0 → inert. Checked BETWEEN steps only (a step must
  // finalize, not be killed); the workflow computes ceiling−10 in its run shell.
  const chainBudgetMinutes = Number(process.env.CHAIN_TIME_BUDGET_MINUTES || 0);
  let budgetStopped = false;
  let budgetStopElapsedMin = 0;
  let budgetSkippedSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const slug = steps[i];
    const stepLabel = `[${i + 1}/${steps.length}] ${slug}`;

    // Check if chain was cancelled between steps. PRECEDENCE (Guardian 2026-08-09): the cancel
    // check runs BEFORE the budget check — an explicit human cancellation must win over a
    // budget-stop when both hold in the same iteration (else the chain would finalize
    // completed_with_warnings instead of 'cancelled').
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

    // Budget check (pure arithmetic — deliberately OUTSIDE the if(chainRunId) cancel guard above,
    // so it works even when the tracking-row INSERT failed). Never sets failedStep: exit stays 0.
    const elapsedBudgetMin = (Date.now() - chainStart) / 60000;
    if (chainBudgetMinutes > 0 && elapsedBudgetMin >= chainBudgetMinutes) {
      budgetStopped = true;
      budgetStopElapsedMin = Math.round(elapsedBudgetMin * 10) / 10;
      budgetSkippedSteps = steps.slice(i);
      console.log(`\n=== Soft time budget reached (${budgetStopElapsedMin}m >= ${chainBudgetMinutes}m) — stopping before ${slug}; ${budgetSkippedSteps.length} step(s) skipped ===`);
      for (const s of budgetSkippedSteps) {
        try {
          await pool.query(
            `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms, error_message)
             VALUES ($1, NOW(), NOW(), 'skipped', 0, $2)`,
            [`${chainId}:${s}`, `skipped: chain time budget reached (${budgetStopElapsedMin}m >= ${chainBudgetMinutes}m)`]
          );
        } catch (err) {
          pipeline.log.warn('[run-chain]', `Budget-skip tracking insert failed: ${err.message}`);
        }
      }
      break;
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
      || slug === 'update_tracked_projects'
      || slug === 'backup_db';
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
    _currentStepRunId = stepRunId; // visible to the SIGINT/SIGTERM handler above

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
  // WF3 2026-08-09: an all-PASS budget-stopped chain must NOT read plain 'completed' — the WARN
  // status is the honest signal and the green allowlist admits it. FAIL verdicts still win above.
  else if (budgetStopped) chainStatus = 'completed_with_warnings';
  else if (hasVerdictWarns) chainStatus = 'completed_with_warnings';
  else chainStatus = 'completed';

  // budgetStopped chainError: this string is what FreshnessTimeline renders — meta alone is
  // invisible, and a third of coa runs are already WARN for other reasons (status can't distinguish).
  const chainError = failedStep
    ? `Stopped at step: ${failedStep}`
    : budgetStopped
      ? `Soft time budget reached (${budgetStopElapsedMin}m >= ${chainBudgetMinutes}m) — ${budgetSkippedSteps.length} downstream step(s) skipped`
      : gateSkipped
        ? '0 new records — downstream steps skipped'
        : null;

  // Include step verdicts + pre-flight audit in chain records_meta for drill-down
  const metaObj = {};
  if (Object.keys(stepVerdicts).length > 0) metaObj.step_verdicts = stepVerdicts;
  if (preFlightRows.length > 0) metaObj.pre_flight_audit = preFlightAudit;
  if (budgetStopped) {
    metaObj.budget_stopped = {
      elapsed_min: budgetStopElapsedMin,
      budget_min: chainBudgetMinutes,
      steps_skipped: budgetSkippedSteps,
    };
  }
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

  // Release chain lock on the SAME pinned client that acquired it,
  // using the matching 2-arg form (1-arg `pg_advisory_unlock` would
  // operate on a different keyspace and silently no-op).
  if (chainLockHeld) {
    try {
      await chainLockClient.query(
        `SELECT pg_advisory_unlock(2, hashtext('chain_' || $1))`,
        [chainId],
      );
    } catch (unlockErr) {
      pipeline.log.warn(
        '[run-chain]',
        'Failed to release chain advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    } finally {
      chainLockClient.release();
    }
  }

  // Spawn observability agent as a detached fire-and-forget child (spec 48).
  // Does NOT affect the chain exit code — observer errors are fully isolated.
  if (process.env.OBSERVABILITY_ENABLED !== '0' && chainRunId) {
    try {
      const observerProc = spawn(
        'node',
        [path.join(__dirname, 'observe-chain.js'), chainId, String(chainRunId)],
        { detached: true, stdio: 'ignore' },
      );
      observerProc.unref();
    } catch (spawnErr) {
      pipeline.log.warn('[run-chain]', 'Failed to spawn observe-chain.js — observability skipped', {
        err: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
      });
    }
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
