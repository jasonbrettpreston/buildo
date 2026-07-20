#!/usr/bin/env node
/**
 * check-pipeline-freshness — the pipeline-watchdog.yml daily freshness check
 * (Spec 115 §2.5, P3-D9 — restores the dropped program-plan freshness-watchdog
 * mandate). Standalone CLI, NOT a `pipeline.run()` chain step — same
 * "outside the Spec 47 skeleton" category as check-chain-running.js and
 * check-chain-verdict.js, whose conventions this script mirrors
 * (SUPABASE_DATABASE_URL + ssl-config, $GITHUB_OUTPUT writes, clear exit codes).
 *
 * Checks TWO independent facts against `pipeline_runs`:
 *   (i)  Chain freshness — a completed `chain_permits` row AND a completed
 *        `chain_coa` row, each within the last 25h (Spec 07 §OP4 / Spec 115
 *        §2.5's SLA). Missing either is unrecoverable within this workflow
 *        (there is no "re-run the chain" fallback here) — it means the
 *        nightly `chain-coa-permits.yml` workflow itself never fired or
 *        never finished, which is exactly the gap this watchdog exists to
 *        surface (GitHub's own per-workflow notifications structurally
 *        cannot detect a workflow that never triggered at all).
 *   (ii) Backup freshness — a completed row under EITHER the scoped-slug
 *        `permits:backup_db` shape (`run-chain.js:321`, written when the
 *        permits chain runs `backup_db` as its own final step) OR the
 *        standalone `backup_db` slug (written when this workflow invokes
 *        `scripts/backup-db.js` directly as the Spec 112 §6 safety net),
 *        within the last 25h.
 *
 * Also reports whether the `permits` chain is CURRENTLY running (reusing
 * `scripts/lib/chain-concurrency.js`'s `isChainRunning`) — the race guard
 * Spec 115 §2.5 requires before the WORKFLOW (not this script) invokes the
 * `backup-db.js` fallback: a permits chain in flight may complete its own
 * `backup_db` step moments later, and a concurrent direct invocation would
 * double-run it.
 *
 * This script is invoked TWICE per workflow run (Spec 115 §2.5's "still
 * missing after the direct invocation -> exit 1" shape): once before an
 * optional `backup-db.js` fallback step, once after. It never decides
 * whether to run the fallback itself — it only reports facts via
 * $GITHUB_OUTPUT (`chains_fresh`, `backup_fresh`, `permits_running`, each
 * 'true'|'false') for the calling workflow to branch on.
 *
 * Exit code: 0 only when BOTH chains_fresh AND backup_fresh are true;
 * 1 otherwise. A DB-check error is fail-loud (exit 1, all outputs 'false')
 * — an unreachable database during a freshness check is itself an outage
 * signal, mirroring check-chain-running.js's P3-D8 posture.
 *
 * Usage: node scripts/check-pipeline-freshness.js
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.5
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §6, §7
 */
'use strict';
require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');
const { isChainRunning } = require('./lib/chain-concurrency');

// Spec 07 §OP4 / Spec 115 §2.5 — the standing "backup/chain within 25h"
// daily-schedule SLA (nightly cadence + headroom).
const FRESHNESS_WINDOW_HOURS = 25;

// Both row shapes backup_db can be written under (P3-G6, Spec 112 §6/§7).
const BACKUP_SLUGS = ['permits:backup_db', 'backup_db'];

/**
 * Write `key=value` to `$GITHUB_OUTPUT` if the env var is set (the GitHub
 * Actions runner contract); otherwise print `key=value` to stdout so the
 * script is still inspectable when run manually/locally.
 * @param {string} key
 * @param {string} value
 */
function writeOutput(key, value) {
  const line = `${key}=${value}`;
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, line + '\n');
  } else {
    console.log(line);
  }
}

/**
 * Is there a `completed` pipeline_runs row for ANY of the given pipeline
 * slugs, completed within the last `hours` hours?
 * @param {import('pg').Pool} pool
 * @param {string[]} pipelineSlugs
 * @param {number} hours
 * @returns {Promise<boolean>}
 */
async function hasCompletedWithin(pool, pipelineSlugs, hours) {
  const res = await pool.query(
    `SELECT id FROM pipeline_runs
      WHERE pipeline = ANY($1) AND status = 'completed'
        AND completed_at > NOW() - ($2 || ' hours')::interval
      LIMIT 1`,
    [pipelineSlugs, String(hours)]
  );
  return res.rows.length > 0;
}

async function run() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('[check-pipeline-freshness] SUPABASE_DATABASE_URL is not set — cannot check freshness.');
    writeOutput('chains_fresh', 'false');
    writeOutput('backup_fresh', 'false');
    writeOutput('permits_running', 'false');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig({ connectionString }),
  });

  try {
    const [permitsFresh, coaFresh, backupFresh, permitsRunningResult] = await Promise.all([
      hasCompletedWithin(pool, ['chain_permits'], FRESHNESS_WINDOW_HOURS),
      hasCompletedWithin(pool, ['chain_coa'], FRESHNESS_WINDOW_HOURS),
      hasCompletedWithin(pool, BACKUP_SLUGS, FRESHNESS_WINDOW_HOURS),
      isChainRunning(pool, 'permits'),
    ]);
    const permitsRunning = permitsRunningResult.running;
    const chainsFresh = permitsFresh && coaFresh;

    writeOutput('chains_fresh', chainsFresh ? 'true' : 'false');
    writeOutput('backup_fresh', backupFresh ? 'true' : 'false');
    writeOutput('permits_running', permitsRunning ? 'true' : 'false');

    if (!permitsFresh) {
      console.log(
        `::error title=Pipeline freshness::No completed chain_permits run within ${FRESHNESS_WINDOW_HOURS}h — ` +
          'the nightly chain-coa-permits.yml workflow may not have fired at all, or its permits step failed.'
      );
    }
    if (!coaFresh) {
      console.log(
        `::error title=Pipeline freshness::No completed chain_coa run within ${FRESHNESS_WINDOW_HOURS}h.`
      );
    }
    if (!backupFresh) {
      console.log(
        `::notice title=Pipeline freshness::No completed backup row (pipeline IN (${BACKUP_SLUGS.map((s) => `'${s}'`).join(', ')})) ` +
          `within ${FRESHNESS_WINDOW_HOURS}h yet — the workflow may attempt the backup-db.js fallback if permits is not currently running.`
      );
    }
    if (permitsRunning) {
      console.log(
        '::notice title=Pipeline freshness::permits chain is currently running — the backup-db.js ' +
          'fallback (if otherwise eligible) must NOT fire (Spec 115 §2.5 race guard: an in-flight ' +
          'permits chain may complete its own backup_db step moments later).'
      );
    }

    if (chainsFresh && backupFresh) {
      console.log('[check-pipeline-freshness] all fresh — chains and backup both within window');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`::error title=Pipeline freshness::DB check failed: ${err.message}`);
    writeOutput('chains_fresh', 'false');
    writeOutput('backup_fresh', 'false');
    writeOutput('permits_running', 'false');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, writeOutput, hasCompletedWithin, FRESHNESS_WINDOW_HOURS, BACKUP_SLUGS };
