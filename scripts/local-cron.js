#!/usr/bin/env node
/**
 * Local Cron Worker — Automated Pipeline Scheduling
 *
 * Runs alongside the Next.js dev server to trigger pipeline chains
 * on schedule. Uses node-cron with America/Toronto timezone.
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
 */
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const pipeline = require('./lib/pipeline');

const pool = pipeline.createPool();

const RUN_CHAIN_SCRIPT = path.resolve(__dirname, 'run-chain.js');

// Hard per-chain timeout (WF2 P8 hardening, Gemini P11-pass + adversarial
// amendment). A chain that HANGS (never exits) would otherwise block every
// subsequent chain in the serialized coa→permits job forever — the primary
// pipeline (permits) would silently never run. 90 min is comfortably above the
// ~55 min measured combined coa+permits runtime, so a healthy chain never trips
// it; a hung one is SIGKILLed and the job continues to the next chain.
const CHAIN_TIMEOUT_MS = 90 * 60 * 1000;

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

async function isChainRunning(chainId) {
  const chainSlug = `chain_${chainId}`;
  try {
    const res = await pool.query(
      `SELECT id FROM pipeline_runs
       WHERE pipeline = $1 AND status = 'running'
         AND started_at > NOW() - INTERVAL '12 hours'
       LIMIT 1`,
      [chainSlug]
    );
    return res.rows.length > 0;
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
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };

    // Hard timeout: a hung chain (never exits) is SIGKILLed so it can't block
    // the rest of the serialized job. Logged CRITICAL — this is an anomaly.
    timer = setTimeout(() => {
      pipeline.log.error(
        '[local-cron]',
        `CRITICAL: ${label} exceeded ${CHAIN_TIMEOUT_MS / 60000}min hard timeout — killing chain_${chainId} and continuing to the next chain.`,
      );
      try {
        child.kill('SIGKILL');
      } catch (err) {
        pipeline.log.warn('[local-cron]', `failed to kill chain_${chainId}: ${err.message}`);
      }
      finish();
    }, CHAIN_TIMEOUT_MS);

    child.on('close', (code) => {
      if (code !== 0) {
        pipeline.log.error('[local-cron]', `${label} failed with exit code ${code}`);
      } else {
        pipeline.log.info('[local-cron]', `${label} completed successfully.`);
      }
      finish();
    });

    child.on('error', (err) => {
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
