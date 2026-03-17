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
 * SPEC LINK: docs/specs/37_pipeline_system.md
 */
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const pipeline = require('./lib/pipeline');

const pool = pipeline.createPool();

const RUN_CHAIN_SCRIPT = path.resolve(__dirname, 'run-chain.js');

// ---------------------------------------------------------------------------
// Schedule definitions
// ---------------------------------------------------------------------------

const SCHEDULES = [
  {
    chainId: 'permits',
    cron: '0 6 * * 1-5',          // 6 AM ET weekdays
    label: 'Permits (Daily)',
  },
  {
    chainId: 'coa',
    cron: '0 7 * * 1-5',          // 7 AM ET weekdays (staggered 1h)
    label: 'CoA (Daily)',
  },
  {
    chainId: 'sources',
    cron: '0 8 1 1,4,7,10 *',     // 8 AM ET, 1st day of each quarter
    label: 'Sources (Quarterly)',
  },
  {
    chainId: 'entities',
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

    child.on('close', (code) => {
      if (code !== 0) {
        pipeline.log.error('[local-cron]', `${label} failed with exit code ${code}`);
      } else {
        pipeline.log.info('[local-cron]', `${label} completed successfully.`);
      }
      resolve();
    });

    child.on('error', (err) => {
      pipeline.log.error('[local-cron]', `${label} failed to start: ${err.message}`);
      resolve();
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
      const running = await isChainRunning(schedule.chainId);
      if (running) {
        pipeline.log.info('[local-cron]', `Skipping ${schedule.label} — already running.`);
        return;
      }
      await triggerChain(schedule.chainId, schedule.label);
    },
    { timezone: 'America/Toronto' }
  );

  tasks.push(task);
  pipeline.log.info('[local-cron]', `  ${schedule.label} — cron: ${schedule.cron}`);
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
