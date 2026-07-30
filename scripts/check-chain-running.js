#!/usr/bin/env node
/**
 * check-chain-running — GitHub-Actions-invoked `isChainRunning`
 * re-implementation. Standalone CLI, NOT a `pipeline.run()` chain step (it
 * runs BEFORE a chain is even spawned, as a workflow guard step) — same
 * "outside the Spec 47 skeleton" category as `scripts/migrate.js` and
 * `scripts/restore-db.js`.
 *
 * Usage: node scripts/check-chain-running.js <chainId>
 *   chainId: bare chain id (e.g. 'coa', 'permits') — NOT pre-prefixed with
 *   `chain_`; this script prefixes it internally to match
 *   `run-chain.js`'s `chainSlug` convention (run-chain.js L101, F8 fold
 *   2026-07-20 — corrected from a stale L61 citation).
 *
 * Writes `skip=true|false` to `$GITHUB_OUTPUT` (the modern
 * `::set-output`-replacement mechanism); falls back to a plain
 * `skip=<value>` stdout line when `$GITHUB_OUTPUT` is unset (local/manual
 * invocation, e.g. smoke-testing this script directly).
 *
 * Contract (Spec 115 §4, items 1-6):
 *   1. Not running (no row)                → skip=false, exit 0
 *   2. Running (row within 12h TTL)         → skip=true,  exit 0 (legitimate skip)
 *   3. DB check itself errors               → skip=true,  exit 1 (P3-D8 AMENDMENT —
 *      fail-safe skip preserved, but now reddens the job + fires GitHub's
 *      failure notification; an unreachable DB is an outage signal, not a
 *      silent green no-op)
 *   4. 12h TTL self-expiry                  → inherited from the query itself
 *      (scripts/lib/chain-concurrency.js), no separate handling needed here
 *   5. Stale-running-row alert              → a `::warning` annotation, same
 *      query pass, independent of the skip/exit outcome above
 *   6. run-chain.js's SIGINT/SIGTERM handler is the item-6 counterpart —
 *      not this script's concern
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.3
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §4
 */
'use strict';
// F8 fold 2026-07-20 (CLI hygiene): dotenv is for local/manual invocation
// only — on a GitHub Actions runner the workflow's own `env:` block is the
// sole source of truth, and loading a stray repo-root `.env` (if one ever
// existed on the runner) should never silently shadow it.
if (!process.env.GITHUB_ACTIONS) require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');
const { isChainRunning, findStaleRunningRow } = require('./lib/chain-concurrency');

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

async function run() {
  const chainId = process.argv[2];
  if (!chainId) {
    console.error('[check-chain-running] Usage: node scripts/check-chain-running.js <chainId>');
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    // Same fail-safe-skip-but-loud posture as a live DB-check error (item 3,
    // P3-D8 amendment) — a missing connection string can never check the DB,
    // so it must not silently green-light a chain start either.
    console.error(
      '::error title=Chain concurrency check::SUPABASE_DATABASE_URL is not set — cannot check ' +
        `chain_${chainId} status.`
    );
    writeOutput('skip', 'true');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig({ connectionString }),
  });

  try {
    const { running, row: blocking } = await isChainRunning(pool, chainId);

    // Item 5 — stale-row alert, same query pass, independent of skip/exit.
    const staleRow = await findStaleRunningRow(pool, chainId);
    if (staleRow) {
      console.error(
        `::warning title=Stale pipeline_runs row::chain_${chainId} run id=${staleRow.id} ` +
          `still 'running' since ${staleRow.started_at} (>12h) — investigate; it is no ` +
          `longer blocking new runs but its status is a dashboard lie.`
      );
    }

    writeOutput('skip', running ? 'true' : 'false');
    if (running) {
      console.error(
        `[check-chain-running] chain_${chainId} is already running (blocking row id=` +
          `${blocking && blocking.id}, started_at=${blocking && blocking.started_at}) — skip=true`
      );
    } else {
      console.error(`[check-chain-running] chain_${chainId} is not running — skip=false`);
    }
  } catch (err) {
    // Item 3 (P3-D8 amendment): fail-safe skip=true, but exit 1 — an
    // unreachable DB is an outage signal, not a silent green skip.
    console.error(`::error title=Chain concurrency check::DB check failed for chain_${chainId}: ${err.message}`);
    writeOutput('skip', 'true');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run();
}

module.exports = { writeOutput, run };
