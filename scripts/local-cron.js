#!/usr/bin/env node
/**
 * Local Cron Worker — Automated Pipeline Scheduling
 *
 * Runs alongside the Next.js dev server to trigger pipeline chains
 * on schedule. Uses node-cron with America/Toronto timezone.
 *
 * Usage: npm run local-cron
 *   (or: node scripts/local-cron.js)
 *
 * Chains triggered via execFileSync('node', ['scripts/run-chain.js', chainId])
 * — same execution path as admin dashboard "Run All".
 */
const cron = require('node-cron');
const { execFile } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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
// ---------------------------------------------------------------------------

async function isChainRunning(chainId) {
  const chainSlug = `chain_${chainId}`;
  try {
    const res = await pool.query(
      `SELECT id FROM pipeline_runs
       WHERE pipeline = $1 AND status = 'running'
       LIMIT 1`,
      [chainSlug]
    );
    return res.rows.length > 0;
  } catch (err) {
    console.error(`[local-cron] DB check failed for ${chainSlug}:`, err.message);
    // If we can't check, skip to be safe
    return true;
  }
}

// ---------------------------------------------------------------------------
// Trigger a chain via run-chain.js (child process)
// ---------------------------------------------------------------------------

function triggerChain(chainId, label) {
  return new Promise((resolve) => {
    console.log(`[local-cron] Triggering ${label} (chain_${chainId})...`);

    const child = execFile('node', [RUN_CHAIN_SCRIPT, chainId], {
      env: process.env,
      stdio: 'inherit',
    }, (err) => {
      if (err) {
        console.error(`[local-cron] ${label} failed:`, err.message);
      } else {
        console.log(`[local-cron] ${label} completed successfully.`);
      }
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const tasks = [];

console.log('\n[local-cron] Starting local pipeline scheduler...');
console.log('[local-cron] Timezone: America/Toronto\n');

for (const schedule of SCHEDULES) {
  const task = cron.schedule(
    schedule.cron,
    async () => {
      const running = await isChainRunning(schedule.chainId);
      if (running) {
        console.log(`[local-cron] Skipping ${schedule.label} — already running.`);
        return;
      }
      await triggerChain(schedule.chainId, schedule.label);
    },
    { timezone: 'America/Toronto' }
  );

  tasks.push(task);

  console.log(`  ${schedule.label}`);
  console.log(`    Cron: ${schedule.cron}`);
}

console.log(`\n[local-cron] ${tasks.length} jobs scheduled. Waiting for triggers...\n`);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  console.log(`\n[local-cron] Received ${signal}. Stopping cron jobs...`);
  for (const task of tasks) {
    task.stop();
  }
  pool.end().then(() => {
    console.log('[local-cron] DB pool closed. Exiting.');
    process.exit(0);
  }).catch(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
