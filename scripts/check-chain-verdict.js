#!/usr/bin/env node
/**
 * check-chain-verdict — post-run verdict reader for chains whose child
 * process can exit 0 even though the run fully failed.
 *
 * `aic-orchestrator.py` (the `deep_scrapes` chain's `inspections` step)
 * exits 0 on a scrape-level failure BY DESIGN — a verdict-only FAIL
 * surfaces as `run-chain.js`'s `completed_with_errors` chain status, which
 * is itself a normal (exit 0) process termination; only a hard orchestrator
 * crash exits non-zero (Integration HIGH-2, Spec 115 §2.4). A workflow that
 * gates solely on `node scripts/run-chain.js deep_scrapes`'s own exit code
 * would therefore report GREEN on a scrape that fully failed. This script
 * is the step that reads the real DB-recorded outcome instead of trusting
 * the child process's exit code — the generalized form of §2.2's coa
 * red-flip pattern.
 *
 * Standalone CLI, NOT a `pipeline.run()` chain step — same "outside the
 * Spec 47 skeleton" category as `scripts/check-chain-running.js`, which
 * this script mirrors in conventions (SUPABASE_DATABASE_URL + ssl-config,
 * clear exit codes). Runs AFTER a chain completes, not before.
 *
 * Usage: node scripts/check-chain-verdict.js <chainId>
 *   chainId: bare chain id (e.g. 'deep_scrapes') — NOT pre-prefixed with
 *   `chain_`; this script prefixes it internally to match
 *   `run-chain.js`'s `chainSlug` convention (run-chain.js L101).
 *
 * Reads the MOST RECENT pipeline_runs row for chain_<chainId> — the row the
 * just-completed `node scripts/run-chain.js <chainId>` invocation wrote —
 * and exits 1 if:
 *   - `status` is 'failed' or 'completed_with_errors', OR
 *   - `records_meta.step_verdicts` contains any 'FAIL' (belt-and-suspenders:
 *     run-chain.js already folds a step FAIL verdict into the
 *     `completed_with_errors` chain status itself, run-chain.js L580-589 —
 *     this is a second read of the same fact via a different field, not a
 *     new signal), OR
 *   - no row is found at all (an invocation should always leave a row; a
 *     missing row means run-chain.js itself never wrote one, which is its
 *     own outage signal, not a pass).
 * Exits 0 otherwise — including `completed_with_warnings`, which is a WARN
 * verdict, not a chain-workflow failure.
 *
 * Duration tripwire (Pipeline Rehab P1, 2026-08-03): when
 * `CHAIN_DURATION_BUDGET_MINUTES` is set (the workflow passes the SAME value
 * it uses for the chain step's `timeout-minutes` — single source, no second
 * hardcode), a run whose wall-clock duration exceeds 80% of that budget emits
 * a `::warning` annotation. Observability only — it NEVER affects the exit
 * code. Rationale: the permits chain crept from ~55 to 78+ min and was
 * step-timeout-killed at 90 min on 2026-08-02/03 with zero warning; the
 * raised 120-min ceiling is UNVALIDATED headroom, so creep must be visible
 * BEFORE the next kill, not after it.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
 */
'use strict';
// F8 fold 2026-07-20 (CLI hygiene): dotenv is for local/manual invocation
// only — on a GitHub Actions runner the workflow's own `env:` block is the
// sole source of truth, and loading a stray repo-root `.env` (if one ever
// existed on the runner) should never silently shadow it.
if (!process.env.GITHUB_ACTIONS) require('dotenv').config();

const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');

const FAIL_STATUSES = new Set(['failed', 'completed_with_errors']);

/**
 * Pure classification — takes the latest pipeline_runs row (or undefined)
 * and returns whether the chain's verdict is a pass, plus a human-readable
 * reason. Separated from run() so it is unit-testable without a live DB.
 *
 * @param {{ id?: number, status: string, records_meta: Record<string, unknown> | null } | undefined} row
 * @returns {{ ok: boolean, reason: string }}
 */
function classifyVerdict(row) {
  if (!row) {
    return { ok: false, reason: 'no pipeline_runs row found' };
  }
  const stepVerdicts = (row.records_meta && row.records_meta.step_verdicts) || {};
  const hasFailVerdict = Object.values(stepVerdicts).includes('FAIL');
  if (FAIL_STATUSES.has(row.status) || hasFailVerdict) {
    const suffix = hasFailVerdict ? `, step_verdicts=${JSON.stringify(stepVerdicts)}` : '';
    return { ok: false, reason: `status=${row.status}${suffix}` };
  }
  return { ok: true, reason: `status=${row.status}` };
}

/**
 * Duration tripwire — pure helper. Returns a warning payload when the run's
 * wall-clock duration exceeds 80% of the step budget, else null. Null also
 * for any unusable input (no row, missing timestamps, invalid budget): the
 * tripwire is observability-only and must never invent a warning from bad
 * data. `new Date()` here is elapsed-time arithmetic on DB-provided
 * timestamps, not a DB-written timestamp (scripts/CLAUDE.md rule).
 *
 * @param {{ started_at?: string | Date | null, completed_at?: string | Date | null } | undefined} row
 * @param {number} budgetMinutes
 * @returns {{ durationMinutes: number, budgetMinutes: number, thresholdMinutes: number, message: string } | null}
 */
function checkDurationTripwire(row, budgetMinutes) {
  if (!row || !Number.isFinite(budgetMinutes) || budgetMinutes <= 0) return null;
  if (!row.started_at || !row.completed_at) return null;
  const durationMs = new Date(row.completed_at).getTime() - new Date(row.started_at).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const durationMinutes = durationMs / 60000;
  const thresholdMinutes = budgetMinutes * 0.8;
  if (durationMinutes <= thresholdMinutes) return null;
  const message =
    `chain duration ${durationMinutes.toFixed(1)} min exceeded 80% of the ` +
    `${budgetMinutes}-min step budget (threshold ${thresholdMinutes.toFixed(1)} min) — ` +
    'duration creep; raise the budget or shrink the chain BEFORE the step-timeout kill recurs.';
  return { durationMinutes, budgetMinutes, thresholdMinutes, message };
}

async function run() {
  const chainId = process.argv[2];
  if (!chainId) {
    console.error('[check-chain-verdict] Usage: node scripts/check-chain-verdict.js <chainId>');
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('::error title=Chain verdict check::SUPABASE_DATABASE_URL is not set — cannot read chain verdict.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig({ connectionString }),
  });

  const chainSlug = `chain_${chainId}`;
  try {
    const res = await pool.query(
      `SELECT id, status, records_meta, started_at, completed_at FROM pipeline_runs
        WHERE pipeline = $1
        ORDER BY started_at DESC
        LIMIT 1`,
      [chainSlug]
    );

    // Duration tripwire (header contract) — observability only, evaluated
    // BEFORE the verdict so a run that both crept and failed still shows the
    // creep annotation alongside the failure.
    const budgetMinutes = Number(process.env.CHAIN_DURATION_BUDGET_MINUTES);
    const tripwire = checkDurationTripwire(res.rows[0], budgetMinutes);
    if (tripwire) {
      console.log(`::warning title=Chain duration tripwire::${chainSlug} ${tripwire.message}`);
    }

    const { ok, reason } = classifyVerdict(res.rows[0]);
    if (!ok) {
      console.error(
        `::error title=Chain verdict check::${chainSlug} verdict is a FAIL (${reason}) — orchestrator ` +
          'exit-0-on-scrape-failure masking (Spec 115 §2.4) means the process exit code ' +
          'alone would have reported this run green.'
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[check-chain-verdict] ${chainSlug} verdict OK (${reason})`);
  } catch (err) {
    console.error(`::error title=Chain verdict check::DB check failed for ${chainSlug}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, classifyVerdict, checkDurationTripwire, FAIL_STATUSES };
