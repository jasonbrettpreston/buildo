#!/usr/bin/env node
/**
 * Local development convenience only — NOT the production scheduler.
 * Production scheduling is GitHub Actions
 * (docs/specs/00-architecture/115_scheduling.md). This file exists so a
 * developer can exercise the same 3 chain schedules locally without waiting
 * for a cron tick.
 *
 * Demoted (not retired) at Phase 3.2 of the Supabase migration — Spec 115
 * §7. Runs alongside the Next.js dev server to trigger pipeline chains on
 * schedule. Uses node-cron with America/Toronto timezone.
 *
 * Improvements:
 *   - spawn (not execFile) prevents buffer overflow on long pipelines
 *   - 12-hour zombie lock timeout prevents permanent pipeline deadlock
 *   - pipeline.createPool() for consistent DB config (§9.4)
 *
 * Usage: npm run local-cron
 *   (or: node scripts/local-cron.js)
 *
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md
 * SPEC LINK: docs/specs/01-pipeline/40_pipeline_system.md
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §7
 */
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const pipeline = require('./lib/pipeline');
const chainConcurrency = require('./lib/chain-concurrency');

const pool = pipeline.createPool();

const RUN_CHAIN_SCRIPT = path.resolve(__dirname, 'run-chain.js');

// Hard per-chain timeout (WF2 P8 hardening, Gemini P11-pass + adversarial
// amendment). A chain that HANGS (never exits) would otherwise block every
// subsequent chain in the serialized coa→permits job forever — the primary
// pipeline (permits) would silently never run. Raised 90→120 min with the
// production permits step ceiling (Pipeline Rehab P1, 2026-08-03 — permits
// crept to 78+ min and the 90-min ceiling killed it mid-chain on 08-02/08-03;
// prod parity with chain-coa-permits.yml's PERMITS_STEP_TIMEOUT_MINUTES). A
// healthy chain never trips it; a hung one is escalated SIGTERM-then-SIGKILL
// (below) and the job continues to the next chain regardless of whether the
// child has exited yet.
const CHAIN_TIMEOUT_MS = 120 * 60 * 1000;

// SIGTERM-then-SIGKILL-after-grace (Spec 115 §7 item 4, prod parity — GitHub
// Actions itself sends SIGTERM before a force kill, §3) — replaces the
// previous immediate SIGKILL. 10s is generous enough for a well-behaved
// child to flush its own SIGINT/SIGTERM handler (run-chain.js's own
// termination handler, Spec 115 §4 item 6) before being force-killed.
const KILL_GRACE_MS = 10 * 1000;

// ---------------------------------------------------------------------------
// Schedule definitions
// ---------------------------------------------------------------------------

const SCHEDULES = [
  // FRESHNESS CONTRACT (WF2 2026-07-06, D4b* + adversarial amendment;
  // Spec 81 §Wiring / Spec 85 §Wiring):
  // The coa chain and permits chain run in ONE serialized weekday job — coa
  // FIRST, permits only AFTER coa completes. The permits chain is the single
  // engine that computes CoA-stage trade forecasts AND opportunity scores
  // (Branch B), reading the CoA costs written by the coa chain's
  // compute_coa_cost_estimates step. SERIALIZING (rather than staggering the
  // two on separate cron hours) is required because the chains SHARE steps
  // (classify_lifecycle_phase, compute_phase_calibration, refresh_snapshot)
  // whose advisory locks SKIP on contention rather than wait — a stagger where
  // the coa chain overran its hour would make the permits chain silently drop
  // those shared steps. Chain-order lock: src/tests/chain.logic.test.ts
  // ("serialized daily job runs coa strictly before permits").
  {
    chainIds: ['coa', 'permits'],
    cron: '0 6 * * 1-5',          // 6 AM ET weekdays — coa then permits, strictly sequential
    label: 'CoA→Permits (Daily, serialized)',
  },
  {
    chainIds: ['sources'],
    cron: '0 8 1 1,4,7,10 *',     // 8 AM ET, 1st day of each quarter
    label: 'Sources (Quarterly)',
  },
  {
    // NOT dead config: kept daily on purpose (Spec 45). The chain no-ops without
    // SERPER_API_KEY (enrich-web-search.js), so an un-keyed run is a safe zero-spend
    // no-op — the Serper key is the spend gate, not the schedule. Provision the key
    // to activate; contact coverage is ~1% until then.
    chainIds: ['entities'],
    cron: '0 3 * * *',             // 3 AM ET daily — after core ingestion
    label: 'Entities Enrichment (Daily)',
  },
];

// ---------------------------------------------------------------------------
// Concurrency guard — skip if chain is already running
// 12-hour staleness threshold prevents permanent zombie locks from crashes
// ---------------------------------------------------------------------------

// Delegates to scripts/lib/chain-concurrency.js — the SAME query
// scripts/check-chain-running.js (the GitHub Actions guard step) uses, so
// the "exact query" Spec 113 §8.3 requires stays byte-identical across both
// callers instead of two independently-evolving copies (Spec 115 §7 item 2).
// The extraction is LIMITED to this function — triggerChain and the
// scheduler loop below are unchanged (chain.logic.test.ts source-scan locks
// on their literal shape).
async function isChainRunning(chainId) {
  const chainSlug = `chain_${chainId}`;
  try {
    const { running } = await chainConcurrency.isChainRunning(pool, chainId);
    return running;
  } catch (err) {
    pipeline.log.error('[local-cron]', `DB check failed for ${chainSlug}: ${err.message}`);
    // If we can't check, skip to be safe
    return true;
  }
}

// ---------------------------------------------------------------------------
// Trigger a chain via run-chain.js (child process)
// Uses spawn with stdio: 'inherit' — zero memory buffering
// ---------------------------------------------------------------------------

function triggerChain(chainId, label) {
  return new Promise((resolve) => {
    pipeline.log.info('[local-cron]', `Triggering ${label} (chain_${chainId})...`);

    const child = spawn('node', [RUN_CHAIN_SCRIPT, chainId], {
      env: process.env,
      stdio: 'inherit',
    });

    // triggerChain always RESOLVES (never rejects) — a chain crash, a failed
    // start, or a hard-timeout kill must all be non-fatal to the serialized job
    // so the next chain (permits) still runs. `settled` guards against a
    // double-resolve if close fires right after the timeout kill.
    let settled = false;
    let timer;
    let killTimer; // SIGKILL escalation timer — deliberately NOT cleared by
                    // finish() below, since finish() fires the moment SIGTERM
                    // is sent (to unblock the serialized loop) while the
                    // escalation itself must keep counting down independently.
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };

    // Hard timeout: a hung chain (never exits) is escalated SIGTERM-then-
    // SIGKILL (prod parity with GitHub Actions' own timeout-minutes behavior,
    // Spec 115 §3/§7 item 4) so it can't block the rest of the serialized
    // job. Logged CRITICAL — this is an anomaly.
    timer = setTimeout(() => {
      pipeline.log.error(
        '[local-cron]',
        `CRITICAL: ${label} exceeded ${CHAIN_TIMEOUT_MS / 60000}min hard timeout — sending SIGTERM to chain_${chainId} and continuing to the next chain.`,
      );
      try {
        child.kill('SIGTERM');
      } catch (err) {
        pipeline.log.warn('[local-cron]', `failed to SIGTERM chain_${chainId}: ${err.message}`);
      }
      // Give the child KILL_GRACE_MS to exit cleanly (e.g. its own
      // SIGTERM handler, Spec 115 §4 item 6) before force-killing it.
      killTimer = setTimeout(() => {
        pipeline.log.warn(
          '[local-cron]',
          `${label} did not exit ${KILL_GRACE_MS / 1000}s after SIGTERM — SIGKILLing chain_${chainId}.`,
        );
        try {
          child.kill('SIGKILL');
        } catch (err) {
          pipeline.log.warn('[local-cron]', `failed to SIGKILL chain_${chainId}: ${err.message}`);
        }
      }, KILL_GRACE_MS);
      finish();
    }, CHAIN_TIMEOUT_MS);

    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (code !== 0) {
        pipeline.log.error('[local-cron]', `${label} failed with exit code ${code}`);
      } else {
        pipeline.log.info('[local-cron]', `${label} completed successfully.`);
      }
      finish();
    });

    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      pipeline.log.error('[local-cron]', `${label} failed to start: ${err.message}`);
      finish();
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const tasks = [];

pipeline.log.info('[local-cron]', 'Starting local pipeline scheduler (America/Toronto)');

for (const schedule of SCHEDULES) {
  const task = cron.schedule(
    schedule.cron,
    async () => {
      // Run the chains in this job STRICTLY SEQUENTIALLY — each awaits the
      // previous one's completion before starting (the freshness contract for
      // the coa→permits job; harmless for single-chain jobs).
      for (const chainId of schedule.chainIds) {
        // Failure ISOLATION (WF2 P8 hardening, Gemini P11-pass): each chain runs
        // independently — a crash, a failed start, a HANG (hard-timeout kill),
        // OR an unexpected throw in one chain must NEVER skip the remaining
        // chains. triggerChain already resolves (never rejects) on a non-zero
        // exit and enforces CHAIN_TIMEOUT_MS on a hung chain, so a coa CRASH or
        // HANG still continues to permits; this try/catch additionally
        // guarantees continue-on-failure against any throw in
        // isChainRunning/triggerChain. An `&&`-style short-circuit here would
        // trade the old silent-skip bug for a silent-TOTAL-failure of the
        // primary pipeline (permits). Locked by chain.logic.test.ts
        // ("serialized job continues to the next chain when one chain fails").
        try {
          const running = await isChainRunning(chainId);
          if (running) {
            pipeline.log.info(
              '[local-cron]',
              `Skipping chain_${chainId} (${schedule.label}) — already running.`,
            );
            continue;
          }
          await triggerChain(chainId, `${schedule.label} :: chain_${chainId}`);
        } catch (err) {
          pipeline.log.error(
            '[local-cron]',
            `chain_${chainId} (${schedule.label}) errored unexpectedly — continuing to next chain: ${err.message}`,
          );
        }
      }
    },
    { timezone: 'America/Toronto' }
  );

  tasks.push(task);
  pipeline.log.info(
    '[local-cron]',
    `  ${schedule.label} — cron: ${schedule.cron} — chains: ${schedule.chainIds.join(' → ')}`,
  );
}

pipeline.log.info('[local-cron]', `${tasks.length} jobs scheduled. Waiting for triggers...`);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  pipeline.log.info('[local-cron]', `Received ${signal}. Stopping cron jobs...`);
  for (const task of tasks) {
    task.stop();
  }
  pool.end().then(() => {
    pipeline.log.info('[local-cron]', 'DB pool closed. Exiting.');
    process.exit(0);
  }).catch((err) => {
    pipeline.log.warn('[local-cron]', `pool.end failed: ${err.message}`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
