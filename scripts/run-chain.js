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

// ---------------------------------------------------------------------------
// B2 — defer mechanism pure helpers (Spec 40 §3.1.2, Spec 47 §8.7, Spec 115 §2.5)
// ---------------------------------------------------------------------------

/**
 * Pure — detects a step's `records_meta.deferred` marker
 * (`{ step, scope_count, threshold, ratio }`), emitted by a gated pipeline script that
 * computed its own scope BEFORE doing any work and found it over threshold (B-1: the
 * decision is made pre-transaction, so a deferring run makes ZERO writes). Returns the
 * shape-validated marker or null. Separated from run() so it is unit-testable without a
 * live DB or child process.
 *
 * @param {Record<string, unknown> | null | undefined} recordsMeta
 * @returns {{ step: string, scope_count: number, threshold: number, ratio: number | null } | null}
 */
function parseDeferMarker(recordsMeta) {
  if (!recordsMeta || typeof recordsMeta !== 'object') return null;
  const marker = recordsMeta.deferred;
  if (!marker || typeof marker !== 'object') return null;
  const { step, scope_count: scopeCount, threshold } = marker;
  if (typeof step !== 'string' || !step) return null;
  if (typeof scopeCount !== 'number' || !Number.isFinite(scopeCount)) return null;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return null;
  const ratio = typeof marker.ratio === 'number' && Number.isFinite(marker.ratio)
    ? marker.ratio
    : (threshold > 0 ? Math.round((scopeCount / threshold) * 100) / 100 : null);
  return { step, scope_count: scopeCount, threshold, ratio };
}

/**
 * Pure — mirrors the chain-level terminal-status ladder below (RULING 1 precedence: cancel >
 * failed > verdict-FAIL > defer > budget-stop > verdict-WARN > completed). cancel/budget are
 * pre-step checks and defer is a post-step-boundary break, so control flow already makes the
 * three mutually exclusive at runtime — this function exists for external unit-testability
 * (run-chain.js is never `require()`-d directly by a test in a live process, see
 * run-chain-defer.logic.test.ts's file header) and is kept in sync BY HAND with the inline
 * `chainStatus` ladder in run() below, which stays a literal ladder (not a call to this
 * function) so the run-chain-budget.logic.test.ts / chain-cascade.integration.test.ts source-scan
 * locks pinning the exact `chainStatus = '...'` literals keep matching. Any change to one ladder
 * must be mirrored in the other.
 *
 * @param {{ wasCancelled: boolean, failedStep: string | null, hasVerdictFails: boolean,
 *           deferredStep: string | null, budgetStopped: boolean, hasVerdictWarns: boolean }} facts
 * @returns {'cancelled'|'failed'|'completed_with_errors'|'deferred_to_full'|'completed_with_warnings'|'completed'}
 */
function resolveChainStatus({ wasCancelled, failedStep, hasVerdictFails, deferredStep, budgetStopped, hasVerdictWarns }) {
  if (wasCancelled) return 'cancelled';
  if (failedStep) return 'failed';
  if (hasVerdictFails) return 'completed_with_errors';
  if (deferredStep) return 'deferred_to_full';
  if (budgetStopped) return 'completed_with_warnings';
  if (hasVerdictWarns) return 'completed_with_warnings';
  return 'completed';
}

// ---------------------------------------------------------------------------
// WF3 F2 (2026-08-15, Spec 118 §3/§7.2) — Layer 3: per-step ceilings.
// ---------------------------------------------------------------------------

/**
 * Spawns a step's child process, streaming stdout to console and buffering
 * PIPELINE_SUMMARY/PIPELINE_META lines — the exact behaviour the inline
 * executor had before this fold, extracted so it is unit-testable with a real
 * child process and no manifest/chain/DB.
 *
 * Layer 3 of the stop-mechanism hierarchy (Spec 118 §3): the missing "a
 * pathological step must die in minutes at run-chain's hands, not at the
 * platform's" layer. `timeoutMinutes` is manifest-configurable per step
 * (`manifest.scripts[slug].step_timeout_minutes`); absent/0 is INERT — no
 * timer is armed, matching layers 1/2's convention. When the ceiling elapses
 * with the child still running, it is killed (SIGTERM) and the returned
 * promise rejects with an Error carrying `err.stepTimedOut = true` and
 * `err.summaryLines` (whatever PIPELINE_SUMMARY/META lines were buffered
 * before the kill) — the caller's existing failure path (the :680-735-class
 * catch below) reads both to build a `step_timeout` reason into failMeta.
 *
 * DESIGN DECISION (WF3 JOINT FOLD-VALIDATION, W5): a ceiling kill is HALTING,
 * not the non-halting cross-check posture C1 gave quality-assert scripts. Per
 * Spec 30 §5.4.1 criterion 1, a ceiling kill means "I could not run this
 * step" — exception-class, not threshold-derived data-quality signal — so it
 * flows through the SAME failedStep path any other step failure does. No
 * ladder edit; no new chain-status branch.
 *
 * @param {{ runtime: string, scriptPath: string, args: string[], env: NodeJS.ProcessEnv, timeoutMinutes: number }} opts
 * @returns {Promise<string>} buffered PIPELINE_SUMMARY/PIPELINE_META lines
 */
function spawnStepChild({ runtime, scriptPath, args, env, timeoutMinutes }) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const child = spawn(runtime, [scriptPath, ...args], {
      env,
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let timedOut = false;
    let killTimer = null;
    if (timeoutMinutes > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMinutes * 60000);
      // Never keep the parent process alive on this timer alone (matters for
      // the pure unit test, which spawns real children with no chain/DB
      // around it and must exit promptly once its own assertions finish).
      if (typeof killTimer.unref === 'function') killTimer.unref();
    }

    const decoder = new StringDecoder('utf8');
    let lineBuffer = '';
    let summaryLines = '';
    child.stdout.on('data', (data) => {
      const chunk = decoder.write(data);
      process.stdout.write(chunk); // Tee to console immediately
      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (line.includes('PIPELINE_SUMMARY:') || line.includes('PIPELINE_META:')) {
          summaryLines += line + '\n';
        }
      }
    });

    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      const remaining = decoder.end();
      if (remaining) lineBuffer += remaining;
      if (lineBuffer && (lineBuffer.includes('PIPELINE_SUMMARY:') || lineBuffer.includes('PIPELINE_META:'))) {
        summaryLines += lineBuffer + '\n';
      }
      if (timedOut) {
        const err = new Error(`Step timeout: ${runtime} ${scriptPath} exceeded ${timeoutMinutes}m ceiling (killed)`);
        err.stepTimedOut = true;
        err.summaryLines = summaryLines;
        rejectSpawn(err);
        return;
      }
      if (code === 0) resolveSpawn(summaryLines);
      else rejectSpawn(new Error(`Command failed: ${runtime} ${scriptPath}`));
    });
    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      rejectSpawn(err);
    });
  });
}

async function run() {
  const pool = pipeline.createPool();
  _pool = pool;

  // Parse manifest inside run() so errors are caught by the global try/catch
  // and logged via pipeline.log (instead of crashing with raw stderr on boot).
  // WF3 F2 (2026-08-15) — `--manifest=<path>` is a TEST-ONLY override (never set
  // by any workflow yml or the local-cron caller): it lets a db test spin up its
  // own tiny fixture chain (a step_timeout_minutes-bearing sleep stub) without
  // touching the real manifest.json, whose `chains` list stays production-only.
  const manifestArg = process.argv.find((a) => a.startsWith('--manifest='));
  const manifestPath = manifestArg
    ? path.resolve(manifestArg.slice('--manifest='.length))
    : path.resolve(__dirname, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
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
  // B2 — set when a step emits a records_meta.deferred marker. A THIRD, distinct break variable:
  // NEVER failedStep (which terminalizes the chain 'failed', exit 1) — a defer is a clean, designed
  // stop at the current step boundary (RULING 1/2).
  let deferredStep = null;
  let deferMarkerInfo = null; // { step, scope_count, threshold, ratio } — for the chainError text
  const stepVerdicts = {}; // slug → 'PASS' | 'WARN' | 'FAIL'
  // C5 (Spec 48 §3.9) — step_completeness bookkeeping. executedSteps excludes a died/failed step
  // (died_at names it separately) but INCLUDES a deferred step (its own row is rewritten, not
  // missing). skippedGateSteps folds gate-skip + disabled + coming_soon placeholders — all three are
  // "administratively skipped, not a failure" at chain-completeness altitude; skippedBudgetSteps
  // reuses the existing budgetSkippedSteps array declared below.
  const executedSteps = [];
  const skippedGateSteps = [];

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
    // skip the backlog the red run left behind. Sole consumer: :675 (the gate-skip
    // guard's `!forceMode && !prevChainFailed` — this line number drifts with every edit
    // above it in the file; re-verify with `grep -n` rather than trusting the digit).
    // B2 (RULING 1, B0 item 7): `deferred_to_full` counts too — without it, AD1 would
    // gate-skip the very step carrying the deferred backlog on the NEXT run and starve
    // the defer-streak detector. Dormant for 'sources' today (manifest.chain_gates has
    // no 'sources' entry, so prevChainFailed never reaches the gate-skip guard for this
    // chain) — a re-ruling is only forced if 'sources' ever gains a gate.
    const prevStatus = prevRun.rows[0]?.status;
    if (prevStatus === 'failed' || prevStatus === 'completed_with_errors' || prevStatus === 'deferred_to_full') {
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
      skippedGateSteps.push(slug);
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
      skippedGateSteps.push(slug);
      try {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms) VALUES ($1, NOW(), NOW(), 'skipped', 0)`,
          [`${chainId}:${slug}`]
        );
      } catch (err) {
        pipeline.log.warn('[run-chain]', `Gate-skip insert failed: ${err.message}`);
      }
      continue;
    }

    // Skip coming_soon placeholders (file: null) to prevent path.resolve crash
    if (manifest.scripts[slug]?.coming_soon) {
      console.log(`${stepLabel} — SKIPPED (coming soon)`);
      skippedGateSteps.push(slug);
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
    // WF3 F2 — read once per step from manifest.scripts[slug]; absent/0 is inert.
    const stepTimeoutMinutes = Number(scriptEntry.step_timeout_minutes || 0);

    try {
      // Merge step-specific env vars and chain-specific args from manifest
      const stepEnv = { ...process.env, PIPELINE_CHAIN: chainId, ...(scriptEntry.env || {}) };
      const extraArgs = [...(scriptEntry.chain_args?.[chainId] || [])];
      const runtime = scriptPath.endsWith('.py')
        ? (process.platform === 'win32' ? 'python' : 'python3')
        : 'node';
      // Spawn child process with streaming stdout — prevents ENOBUFS on long scripts.
      // WF3 F2 (Spec 118 §3 Layer 3): a killed-on-ceiling child rejects with
      // err.stepTimedOut — caught below, same as any other step failure.
      const output = await spawnStepChild({ runtime, scriptPath, args: extraArgs, env: stepEnv, timeoutMinutes: stepTimeoutMinutes });
      summaryLines = output;

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

      // B2 defer mechanism (RULING 1/2): a step signals it deferred its own scope to a future
      // --full run via records_meta.deferred = {step, scope_count, threshold, ratio}. Diverts the
      // unconditional 'completed' UPDATE below to 'deferred_to_full', sets deferredStep (NEVER
      // failedStep), and breaks the loop. Downstream steps get NO rows — a deliberate divergence
      // from the budget-stop path's 'skipped' rows: a defer is a clean stop at the CURRENT step
      // boundary, not a pre-decided skip of steps the chain already committed to running.
      const deferMarker = parseDeferMarker(recordsMeta);
      if (deferMarker) {
        console.log(`${stepLabel} — deferred to full (scope ${deferMarker.scope_count} >= threshold ${deferMarker.threshold})\n`);
        if (stepRunId) {
          await pool.query(
            `UPDATE pipeline_runs
             SET completed_at = NOW(), status = 'deferred_to_full', duration_ms = $1,
                 records_total = COALESCE($3, records_total),
                 records_new = COALESCE($4, records_new),
                 records_updated = COALESCE($5, records_updated),
                 records_meta = COALESCE($6::jsonb, records_meta)
             WHERE id = $2`,
            [durationMs, stepRunId, recordsTotal, recordsNew, recordsUpdated, recordsMeta ? JSON.stringify(recordsMeta) : null]
          );
        }
        deferredStep = slug;
        deferMarkerInfo = deferMarker;
        executedSteps.push(slug); // C5 — the deferring step's OWN row exists (rewritten, not missing)
        break;
      }

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
      executedSteps.push(slug); // C5 — this step's row exists as 'completed' this run

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

      // WF3 F2 — spawnStepChild's buffered summary lives on the rejection (its
      // own local variable, not this outer placeholder); pull it across before
      // parsing so a ceiling-killed step's partial telemetry survives the kill
      // exactly like any other mid-run failure's does.
      if (err && typeof err.summaryLines === 'string') summaryLines = err.summaryLines;

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

      // WF3 F2 (Spec 118 §3 Layer 3) — a ceiling kill names its own cause: the
      // step didn't fail on its own merits, run-chain axed it. HALTING (see
      // spawnStepChild's doc comment) — failedStep is set unconditionally below,
      // same as any other step failure.
      if (err && err.stepTimedOut === true) {
        failMeta = { ...(failMeta || {}), reason: 'step_timeout', step_timeout_minutes: stepTimeoutMinutes };
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
  // B2 (RULING 1): defer sits between verdict-FAIL and budget-stop — a red audit still reds the
  // chain even if a later step also deferred, but a clean defer must not be swallowed by a WARN.
  else if (deferredStep) chainStatus = 'deferred_to_full';
  // WF3 2026-08-09: an all-PASS budget-stopped chain must NOT read plain 'completed' — the WARN
  // status is the honest signal and the green allowlist admits it. FAIL verdicts still win above.
  else if (budgetStopped) chainStatus = 'completed_with_warnings';
  else if (hasVerdictWarns) chainStatus = 'completed_with_warnings';
  else chainStatus = 'completed';
  // resolveChainStatus() above mirrors this ladder for external unit-testability — kept in sync by
  // hand (see its own doc comment for why it isn't called here directly).

  // budgetStopped chainError: this string is what FreshnessTimeline renders — meta alone is
  // invisible, and a third of coa runs are already WARN for other reasons (status can't distinguish).
  // B2 (N-6 folded): the defer arm gets the same treatment — meta alone is invisible until B6 wires
  // admin surfaces, so the human-readable string carries the step + scope + threshold.
  const chainError = failedStep
    ? `Stopped at step: ${failedStep}`
    : deferredStep
      ? `Deferred to full at step ${deferredStep} (scope ${deferMarkerInfo?.scope_count} >= threshold ${deferMarkerInfo?.threshold})`
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
  // C5/B2 — ONE CONTRACT (RULING 2): records_meta.step_completeness = {expected, executed, died_at,
  // skipped_gate, skipped_budget, deferred_at}. `deferred_to_full` is a legitimate executed<expected
  // (steps at-or-after deferred_at are missing BY DESIGN, not silently). Written every run (not
  // length-gated) so "absent" unambiguously means "a row written before this deploy" (Spec 48 §4.9
  // annotate window), never "this run chose not to write it".
  metaObj.step_completeness = {
    expected: steps,
    executed: executedSteps,
    died_at: wasCancelled ? null : failedStep,
    skipped_gate: skippedGateSteps,
    skipped_budget: budgetSkippedSteps,
    deferred_at: deferredStep || undefined,
    // Informational passthrough of the deferring step's OWN marker (never consumed by
    // classifyStepCompleteness, which only reads expected/executed/died_at/skipped_*/deferred_at) —
    // lets check-chain-verdict.js's ::warning name the scope/threshold, not just the step slug.
    ...(deferredStep && deferMarkerInfo
      ? { scope_count: deferMarkerInfo.scope_count, threshold: deferMarkerInfo.threshold, ratio: deferMarkerInfo.ratio }
      : {}),
  };
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

// B2 (C1 precedent, assert-lifecycle-phase-distribution.js:307) — guard the CLI body so this module
// is safe to `require()` from a test process: without it, requiring run-chain.js would immediately
// try to create a real DB pool and call run(), same class of risk C1 closed for the assert script.
if (require.main === module) {
  run().catch(async (err) => {
    pipeline.log.error('[run-chain]', err, { phase: 'fatal' });
    // Close pool to prevent orphaned TCP connections on the database server
    if (_pool) { try { await _pool.end(); } catch { /* best effort */ } }
    setTimeout(() => process.exit(1), 500);
  });
}

module.exports = { resolveChainStatus, parseDeferMarker, spawnStepChild };
