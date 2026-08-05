#!/usr/bin/env node
/**
 * check-pipeline-freshness — the pipeline-watchdog.yml daily freshness check
 * (Spec 115 §2.5, P3-D9 — restores the dropped program-plan freshness-watchdog
 * mandate). Standalone CLI, NOT a `pipeline.run()` chain step — same
 * "outside the Spec 47 skeleton" category as check-chain-running.js and
 * check-chain-verdict.js, whose conventions this script mirrors
 * (SUPABASE_DATABASE_URL + ssl-config, $GITHUB_OUTPUT writes, clear exit codes,
 * `::error`/`::warning`/`::notice` GitHub Actions annotations).
 *
 * Checks against `pipeline_runs`:
 *   (i)  Chain freshness — a completed run for EVERY applicable chain
 *        (chain_coa, chain_permits, chain_sources, chain_entities, and
 *        chain_deep_scrapes when it applies) within that chain's own
 *        freshness window (F8 fold 2026-07-20 — extends the original
 *        coa/permits-only scope to all 5 scheduled chains; Spec 115 §2.5
 *        amended). Missing any applicable chain is unrecoverable within
 *        this workflow (there is no "re-run the chain" fallback here) — it
 *        means that chain's own scheduled workflow never fired or never
 *        finished, which is exactly the gap this watchdog exists to surface
 *        (GitHub's own per-workflow notifications structurally cannot
 *        detect a workflow that never triggered at all).
 *   (ii) Backup freshness — a completed row under EITHER the scoped-slug
 *        `permits:backup_db` shape (`run-chain.js:362`, written when the
 *        permits chain runs `backup_db` as its own final step) OR the
 *        standalone `backup_db` slug (written when this workflow invokes
 *        `scripts/backup-db.js` directly as the Spec 112 §6 safety net),
 *        within the last 25h.
 *
 * A "completed" run, for both checks, means a `pipeline_runs.status` in
 * RAN_STATUSES below — 'completed', 'completed_with_warnings', or
 * 'completed_with_errors' (F8 fold 2026-07-20: this script now does
 * ABSENCE detection only — did a chain land fresh data recently, at all —
 * not pass/fail; pass/fail visibility comes from check-chain-verdict.js's
 * per-run verdict-check steps in the chain workflows themselves, which
 * generalize the exit-0-masking guard chain-deep-scrapes.yml already had.
 * Before this fold, `hasCompletedWithin` matched only 'completed', which
 * silently excluded ~26% of live coa runs that legitimately landed data but
 * also logged a step-level WARN/FAIL somewhere). This is the same
 * "did-it-run" status set src/app/api/admin/stats/route.ts's chain_freshness
 * query and src/components/FreshnessTimeline.tsx's "ran" convention already
 * use — 'failed' and 'cancelled' are excluded from all three because those
 * mean the chain did NOT land fresh data.
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
// F8 fold 2026-07-20 (CLI hygiene): dotenv is for local/manual invocation
// only — on a GitHub Actions runner the workflow's own `env:` block is the
// sole source of truth, and loading a stray repo-root `.env` (if one ever
// existed on the runner) should never silently shadow it.
if (!process.env.GITHUB_ACTIONS) require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');
const { isChainRunning } = require('./lib/chain-concurrency');

// Terminal "ran" statuses per run-chain.js's chainStatus assignment
// (run-chain.js:584-589) — see file header for the absence-detection
// rationale (F8 fold 2026-07-20).
const RAN_STATUSES = ['completed', 'completed_with_warnings', 'completed_with_errors'];

// Spec 07 §OP4 / Spec 115 §2.5 — the standing "backup/chain within 25h"
// daily-schedule SLA (nightly cadence + headroom). Used for chain_coa,
// chain_permits, and the backup check.
const FRESHNESS_WINDOW_HOURS = 25;

// Per-chain freshness windows (F8 fold 2026-07-20, Spec 115 §2.5 amendment
// — extends the original coa/permits-only scope to all 5 scheduled chains).
// chain_deep_scrapes is NOT here — it is weekday-aware (see
// deepScrapesWindow below) rather than a single fixed-hour constant.
const CHAIN_WINDOWS_HOURS = {
  chain_coa: FRESHNESS_WINDOW_HOURS,
  chain_permits: FRESHNESS_WINDOW_HOURS,
  chain_sources: 204, // 8 days + 12h slack (Spec 115 §2 table row 2: weekly Sunday cadence)
  chain_entities: 26,
};

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
 * chain_deep_scrapes runs weekdays-only, business hours (Spec 115 §2 table
 * row 4) — never Saturday/Sunday. Its freshness check is therefore
 * date-aware rather than a fixed-hour constant (F8 fold 2026-07-20):
 *   - Sat/Sun: the check does not apply at all (no run is ever expected —
 *     this is NOT the same as "stale", it is "not applicable today").
 *   - Monday: 80h window (reaches back through the weekend to Friday's
 *     only slot).
 *   - Tue-Fri: 30h window (analogous to chain_entities' daily-cadence
 *
 * WIDENED 2026-08-05 (F3 cadence change, 72->80 / 26->30). The original
 * numbers were sized for THREE slots a weekday, whose last was ~21:00 UTC.
 * The cadence is now a SINGLE 15:00 UTC slot, so the newest completion moved
 * ~6h earlier (~17:35 for a full 150-min slice). Against a watchdog that
 * fires at 15:30 UTC and has been observed 1-2h late, the old Monday 72h left
 * ~6 minutes of margin and Tue-Fri 26h left ~2h — both false-red generators.
 * These windows are ABSENCE detection ("did a slice land at all"), so slack
 * costs nothing: a genuinely skipped slice still breaches by a wide margin.
 * If the cadence changes again, THESE MOVE WITH IT — that coupling is the
 * whole point of this comment.
 *   (original Tue-Fri rationale retained:) analogous to chain_entities' daily-cadence
 *     buffer; NOT byte-identical to src/app/api/admin/stats/route.ts's 24h
 *     dashboard threshold — the two are independently-derived checks over
 *     the same underlying facts, see DataQualityDashboard.tsx's comment).
 * @param {number} utcDay - Date#getUTCDay() result, 0=Sun..6=Sat
 * @returns {{ applies: boolean, windowHours: number | null }}
 */
function deepScrapesWindow(utcDay) {
  if (utcDay === 0 || utcDay === 6) return { applies: false, windowHours: null };
  if (utcDay === 1) return { applies: true, windowHours: 80 };
  return { applies: true, windowHours: 30 };
}

/**
 * Is there a RAN_STATUSES pipeline_runs row for ANY of the given pipeline
 * slugs, completed within the last `hours` hours?
 * @param {import('pg').Pool} pool
 * @param {string[]} pipelineSlugs
 * @param {number} hours
 * @returns {Promise<boolean>}
 */
async function hasCompletedWithin(pool, pipelineSlugs, hours) {
  // F8 fold 2026-07-20 (CLI hygiene): pass the full '25 hours'-style string
  // as a single ::interval-cast parameter rather than building the interval
  // via `($n || ' hours')::interval` string concatenation in SQL.
  const res = await pool.query(
    `SELECT id FROM pipeline_runs
      WHERE pipeline = ANY($1) AND status = ANY($2)
        AND completed_at > NOW() - $3::interval
      LIMIT 1`,
    [pipelineSlugs, RAN_STATUSES, `${hours} hours`]
  );
  return res.rows.length > 0;
}

async function run() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('::error title=Pipeline freshness::SUPABASE_DATABASE_URL is not set — cannot check freshness.');
    writeOutput('chains_fresh', 'false');
    writeOutput('backup_fresh', 'false');
    writeOutput('permits_running', 'false');
    process.exitCode = 1;
    return;
  }

  // F8 fold 2026-07-20 (CLI hygiene): pool construction lives INSIDE the
  // try block (declared with `let` above it so `finally` can still reach
  // it) — previously `new Pool(...)` sat between the connectionString guard
  // and the try, so a construction-time throw would escape the catch
  // block's fail-safe-output handling entirely (no $GITHUB_OUTPUT written,
  // uncaught rejection) instead of degrading the same way a query failure
  // does.
  let pool;
  try {
    pool = new Pool({
      connectionString,
      ssl: resolveSslConfig({ connectionString }),
    });

    const nowUtcDay = new Date().getUTCDay();
    const deepScrapes = deepScrapesWindow(nowUtcDay);

    const chainChecks = Object.entries(CHAIN_WINDOWS_HOURS).map(([slug, hours]) => ({ slug, hours }));
    if (deepScrapes.applies) {
      chainChecks.push({ slug: 'chain_deep_scrapes', hours: deepScrapes.windowHours });
    }

    const [chainResults, backupFresh, permitsRunningResult] = await Promise.all([
      Promise.all(
        chainChecks.map(async ({ slug, hours }) => ({
          slug,
          hours,
          fresh: await hasCompletedWithin(pool, [slug], hours),
        }))
      ),
      hasCompletedWithin(pool, BACKUP_SLUGS, FRESHNESS_WINDOW_HOURS),
      isChainRunning(pool, 'permits'),
    ]);
    const permitsRunning = permitsRunningResult.running;
    const chainsFresh = chainResults.every((r) => r.fresh);

    writeOutput('chains_fresh', chainsFresh ? 'true' : 'false');
    writeOutput('backup_fresh', backupFresh ? 'true' : 'false');
    writeOutput('permits_running', permitsRunning ? 'true' : 'false');

    if (!deepScrapes.applies) {
      console.log(
        '::notice title=Pipeline freshness::chain_deep_scrapes freshness check does not apply today ' +
          '(Spec 115 §2 table row 4 — weekdays-only; no run is expected Sat/Sun).'
      );
    }
    for (const r of chainResults) {
      if (!r.fresh) {
        console.log(
          `::error title=Pipeline freshness::No completed ${r.slug} run within ${r.hours}h — ` +
            `that chain's scheduled workflow may not have fired at all, or its run failed before completing.`
        );
      }
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
    if (pool) await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  writeOutput,
  hasCompletedWithin,
  deepScrapesWindow,
  FRESHNESS_WINDOW_HOURS,
  CHAIN_WINDOWS_HOURS,
  BACKUP_SLUGS,
  RAN_STATUSES,
};
