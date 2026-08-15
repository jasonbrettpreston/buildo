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
 * and applies a GREEN ALLOWLIST (Pipeline Rehab P3, 2026-08-03 — inverted
 * from the original denylist). Exits 0 ONLY if:
 *   - `status` is 'completed', 'completed_with_warnings', or
 *     'deferred_to_full' (a WARN verdict is not a chain-workflow failure;
 *     a defer is a clean, designed stop at a step boundary — B2, Spec 40
 *     §3.1.2), AND
 *   - `records_meta.step_verdicts` contains no 'FAIL' (belt-and-suspenders:
 *     run-chain.js already folds a step FAIL verdict into the
 *     `completed_with_errors` chain status itself, run-chain.js L580-589 —
 *     this is a second read of the same fact via a different field, not a
 *     new signal).
 * EVERYTHING ELSE exits 1: 'failed', 'completed_with_errors', 'cancelled',
 * 'running' (an orphaned row from a killed run — see fence note below),
 * any unknown/novel status, and a missing row entirely (an invocation
 * should always leave a row; a missing row means run-chain.js never wrote
 * one, which is its own outage signal, not a pass).
 *
 * Why allowlist, not denylist: `pipeline_runs.status` is unconstrained TEXT
 * (mig 033 — no CHECK), so a denylist can never be proven complete. The
 * original FAIL_STATUSES denylist classified three LIVE orphaned
 * `status='running'` rows (ids 1756/2045/2097, left behind by GH
 * step-timeout kills) as green — the 2026-08-03 verdict check PASSED
 * against a dead chain.
 *
 * FENCE (first line of defense is NOT this script): run-chain.js's own
 * SIGINT/SIGTERM handler (run-chain.js:28-79) is supposed to mark the row
 * 'failed' on a kill. On the GH step-timeout kills above it never landed
 * its UPDATE (likely SIGKILL beat the async write — filed as latent), which
 * is exactly why this check must be belt-and-suspenders on the RAW status
 * rather than trusting the handler to have normalized it.
 *
 * KNOWING behavior (test-pinned): "most recent row by started_at" means a
 * CONCURRENT manual dispatch's `running` row reddens a scheduled run's
 * check. Accepted — a red that makes an operator look is strictly better
 * than the false-green it replaces.
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

// GREEN ALLOWLIST (P3, 2026-08-03) — the ONLY statuses that can pass. See
// header: status is unconstrained TEXT, so a denylist is unprovable; every
// status outside this set (failed, completed_with_errors, cancelled,
// running, anything novel) is a FAIL.
const OK_STATUSES = new Set(['completed', 'completed_with_warnings', 'deferred_to_full']);

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
  if (!OK_STATUSES.has(row.status) || hasFailVerdict) {
    const statusPart = OK_STATUSES.has(row.status)
      ? `status=${row.status}`
      : `status=${row.status} not in green allowlist [${[...OK_STATUSES].join(', ')}]`;
    const suffix = hasFailVerdict ? `, step_verdicts=${JSON.stringify(stepVerdicts)}` : '';
    return { ok: false, reason: `${statusPart}${suffix}` };
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

/**
 * Pure — median, NOT mean (a single blown-up run must not drag the baseline
 * up with it; a mean is exactly the statistic a step-duration outlier
 * contaminates). Even-length arrays average the two middle values.
 *
 * @param {number[]} nums
 * @returns {number}
 */
function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * WF3 F3 (2026-08-15, Spec 118 §7.3) — the step-duration trend tripwire: "the
 * instrument whose absence cost two of the three [08-12/13/14] failure days."
 * Every gate this repo had compared a VALUE against a THRESHOLD; none compared
 * a value against its OWN HISTORY. This is that instrument, generalized to
 * every step of every chain (not just deep_scrapes' refresh_snapshot).
 *
 * Pure — takes a step's trailing durations (oldest-agnostic order; only the
 * VALUES matter) and its just-finished duration, and classifies the ratio
 * against the trailing MEDIAN (never the mean — see median() above).
 * `history` requires >= 3 usable (finite, non-negative) values or the
 * classification is SKIPPED (returns null) — 1-2 data points make a median
 * indistinguishable from a single outlier, and a brand-new step (0 prior
 * completions) must never manufacture a spurious ratio from nothing.
 *
 * @param {number[]} history - trailing durations (ms) of prior COMPLETED runs of this step
 * @param {number} current - duration (ms) of the just-finished run
 * @returns {{ level: 'warning' | 'error', ratio: number, medianMs: number, currentMs: number, message: string } | null}
 */
function classifyDurationTrend(history, current) {
  if (!Array.isArray(history)) return null;
  const usable = history.filter((n) => Number.isFinite(n) && n >= 0);
  if (usable.length < 3) return null;
  if (!Number.isFinite(current) || current < 0) return null;
  const medianMs = median(usable);
  if (!Number.isFinite(medianMs) || medianMs <= 0) return null;
  const ratio = current / medianMs;
  if (ratio < 3) return null;
  const level = ratio >= 10 ? 'error' : 'warning';
  const currentMin = (current / 60000).toFixed(1);
  const medianMin = (medianMs / 60000).toFixed(1);
  const message =
    `duration ${currentMin} min is ${ratio.toFixed(1)}x the trailing median ${medianMin} min ` +
    `(n=${usable.length}) — ${level === 'error' ? 'pathological, likely axed by the platform timeout' : 'creeping, watch it'}.`;
  return { level, ratio, medianMs, currentMs: current, message };
}

/**
 * WF3 F3 — the DB-querying half. ONE `LIMIT 7` probe PER EXECUTED STEP (never
 * per chain-run-history-lookback): `rows[0]` is the step's row from the just-
 * finished chain run (`current`); `rows.slice(1)` filtered to `status =
 * 'completed'` is the trailing history classifyDurationTrend() consumes.
 * ⚠ run-chain-defer.logic.test.ts's ⑧-lock bans the single-row `ORDER BY
 * started_at DESC` + `LIMIT` clause this file's defer-streak query moved off
 * of — the ban regex has no word boundary after the digit, so it fires on
 * ANY `LIMIT` value starting with that digit, not only the exact one-row
 * form. `LIMIT 7` is deliberately clear of it (as is the defer-streak
 * query's own `LIMIT 2` above). Cost is per-step negligible (~9.7ms
 * measured) — this runs once per executed step of EVERY chain, not just
 * deep_scrapes.
 *
 * Best-effort per step: a query failure for one step must never block the
 * others or the caller's real verdict (this is observability layered on an
 * already-decided result, same posture as countAbsentStepCompleteness above).
 *
 * @param {import('pg').Pool} pool
 * @param {string} chainId
 * @param {string[]} executedSteps
 * @returns {Promise<Array<{ slug: string, trend: ReturnType<typeof classifyDurationTrend> }>>}
 */
async function checkStepDurationTrends(pool, chainId, executedSteps) {
  const results = [];
  for (const slug of executedSteps) {
    try {
      const { rows } = await pool.query(
        `SELECT duration_ms, status FROM pipeline_runs
          WHERE pipeline = $1
          ORDER BY started_at DESC
          LIMIT 7`,
        [`${chainId}:${slug}`],
      );
      if (rows.length === 0) continue;
      const [current, ...rest] = rows;
      const currentMs = Number(current.duration_ms);
      const historyMs = rest
        .filter((r) => r.status === 'completed')
        .map((r) => Number(r.duration_ms))
        .filter((n) => Number.isFinite(n));
      const trend = classifyDurationTrend(historyMs, currentMs);
      if (trend) results.push({ slug, trend });
    } catch {
      // Best-effort — one step's query failure never blocks the others.
    }
  }
  return results;
}

/**
 * Pure — B2/C5 (Spec 48 §3.9): classifies a chain row's `records_meta.step_completeness`
 * (`{ expected, executed, died_at, skipped_gate, skipped_budget, deferred_at }`) against its own
 * `status`. Consulted ONLY on rows already inside OK_STATUSES — everything else is already red via
 * classifyVerdict, and step_completeness has no jurisdiction there (v6.1 X-2: a defer-then-FAIL run
 * legally carries `deferred_at` under `completed_with_errors`, which classifyVerdict reds first).
 *
 * Contract (active_task.md §C5, RULING 2, v6.1 X-2):
 *   - `died_at` set is ALWAYS a contradiction on an OK-status row (the step recorded as died, yet
 *     the chain reads green) — not ok, regardless of anything else.
 *   - `deferred_to_full ⟺ deferred_at` (OK-scoped ⟺): the status and the field must agree in both
 *     directions.
 *   - Per-slug reconciliation of `expected` vs `executed`: a missing step is legitimate iff it is
 *     named in `skipped_gate` or `skipped_budget`, OR (under a defer) it sits at-or-after
 *     `deferred_at`'s position in `expected` (manifest order) — an unexplained gap is not ok.
 *   - Absent `step_completeness` (legacy rows, pre-deploy) is a DELIBERATE, time-boxed relaxation
 *     (Spec 48 §4.9) — {ok:true, annotate:true}, never a silent pass indistinguishable from a fully
 *     populated row.
 *
 * @param {{ expected: string[], executed: string[], died_at: string | null, skipped_gate: string[],
 *           skipped_budget: string[], deferred_at?: string | null } | null | undefined} sc
 * @param {string} status
 * @returns {{ ok: boolean, reason: string, annotate?: boolean }}
 */
function classifyStepCompleteness(sc, status) {
  if (sc === null || sc === undefined) {
    return {
      ok: true,
      annotate: true,
      reason: 'step_completeness absent (legacy row, pre-deploy — Spec 48 §4.9 annotate window)',
    };
  }

  const expected = Array.isArray(sc.expected) ? sc.expected : [];
  const executed = Array.isArray(sc.executed) ? sc.executed : [];
  const skippedGate = Array.isArray(sc.skipped_gate) ? sc.skipped_gate : [];
  const skippedBudget = Array.isArray(sc.skipped_budget) ? sc.skipped_budget : [];
  const diedAt = sc.died_at ?? null;
  const deferredAt = sc.deferred_at ?? null;

  if (diedAt) {
    return { ok: false, reason: `died_at (${diedAt}) is set on an OK-status (${status}) row — contradiction` };
  }

  const isDeferredStatus = status === 'deferred_to_full';
  if (isDeferredStatus && !deferredAt) {
    return { ok: false, reason: `status=deferred_to_full but step_completeness.deferred_at is absent` };
  }
  if (!isDeferredStatus && deferredAt) {
    return { ok: false, reason: `step_completeness.deferred_at (${deferredAt}) present on a non-deferred OK status (${status})` };
  }

  const executedSet = new Set(executed);
  const gateSet = new Set(skippedGate);
  const budgetSet = new Set(skippedBudget);
  const deferredIdx = deferredAt ? expected.indexOf(deferredAt) : -1;

  for (let i = 0; i < expected.length; i++) {
    const slug = expected[i];
    if (executedSet.has(slug)) continue;
    if (gateSet.has(slug)) continue;
    if (budgetSet.has(slug)) continue;
    if (deferredIdx >= 0 && i >= deferredIdx) continue; // legit-incomplete: at/after the defer boundary
    return {
      ok: false,
      reason: `step "${slug}" is expected but missing from executed/skipped_gate/skipped_budget and not covered by the defer boundary`,
    };
  }

  return { ok: true, reason: 'step_completeness reconciled — no unexplained gap' };
}

/**
 * Pure — B2 defer-streak breaker (RULING 2, Adv F3, v6.1 X-2): 2 CONSECUTIVE runs carrying
 * `records_meta.step_completeness.deferred_at` for the SAME step means the defer is not
 * self-healing; escalate to a red verdict naming the supervised force-full remedy. Keyed on
 * `deferred_at` PRESENCE ALONE — NOT on `status === 'deferred_to_full'` (X-2: the
 * `deferred_to_full ⟺ deferred_at` tripwire in classifyStepCompleteness is scoped to OK_STATUSES
 * only; a defer-that-also-FAILed legally carries `deferred_at` under `completed_with_errors`, which
 * is OUTSIDE OK_STATUSES — and that run STILL counts toward the streak, deliberately: hiding a real
 * defer behind its own FAIL would starve the escalation the streak breaker exists to trigger). A
 * mixed pair (in either order) or two defers on DIFFERENT steps resets/never starts the streak.
 * Takes the last 2 chain rows, most-recent first. Never a v5-style chain-meta `deferred_step` key
 * (RETIRED per RULING 2) — `step_completeness.deferred_at` is the ONE CONTRACT.
 *
 * @param {Array<{ status: string, records_meta: Record<string, unknown> | null }>} rows
 * @returns {{ ok: boolean, reason: string }}
 */
function classifyDeferStreak(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return { ok: true, reason: 'fewer than 2 rows — no streak possible' };
  }
  const deferredAtOf = (row) => {
    const sc = row?.records_meta?.step_completeness;
    return sc && typeof sc === 'object' ? sc.deferred_at ?? null : null;
  };
  const a = deferredAtOf(rows[0]);
  const b = deferredAtOf(rows[1]);
  if (a && b && a === b) {
    return {
      ok: false,
      reason: `2 consecutive runs carry deferred_at="${a}" for the same step — supervised force-full required (defer-streak breaker)`,
    };
  }
  return { ok: true, reason: 'no same-step defer streak' };
}

// §4.9 companion (S-3) — the five chains this annotate window is gated on re-enabling/completing a
// full cycle of. `chain_sources` is `disabled_manually` as of this writing (B6 re-enables it).
const SCHEDULED_CHAIN_SLUGS = ['chain_permits', 'chain_coa', 'chain_sources', 'chain_entities', 'chain_deep_scrapes'];

/**
 * §4.9 live absent count (S-3): the number of the 5 scheduled chains whose LATEST row (never a
 * lookback window — a stale absent row that already rotated out of "latest" must not hold the count
 * nonzero forever) carries no `records_meta.step_completeness` at all. 0 is the machine-observable
 * re-tighten condition. Best-effort: a query failure returns null (never fabricates a count), and the
 * caller must not let it block the real verdict — this is observability layered on an already-decided
 * green result.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<number | null>}
 */
async function countAbsentStepCompleteness(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (pipeline) pipeline, records_meta
         FROM pipeline_runs
        WHERE pipeline = ANY($1)
        ORDER BY pipeline, started_at DESC`,
      [SCHEDULED_CHAIN_SLUGS],
    );
    return rows.filter((r) => r.records_meta == null || r.records_meta.step_completeness == null).length;
  } catch {
    return null;
  }
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
    // B2 (RULING 2): the defer-streak breaker needs the last TWO rows (was LIMIT 1) — 2 consecutive
    // deferred_to_full on the same step is not self-healing.
    const res = await pool.query(
      `SELECT id, status, records_meta, started_at, completed_at FROM pipeline_runs
        WHERE pipeline = $1
        ORDER BY started_at DESC
        LIMIT 2`,
      [chainSlug]
    );
    const latest = res.rows[0];

    // Duration tripwire (header contract) — observability only, evaluated
    // BEFORE the verdict so a run that both crept and failed still shows the
    // creep annotation alongside the failure.
    const budgetMinutes = Number(process.env.CHAIN_DURATION_BUDGET_MINUTES);
    const tripwire = checkDurationTripwire(latest, budgetMinutes);
    if (tripwire) {
      console.log(`::warning title=Chain duration tripwire::${chainSlug} ${tripwire.message}`);
    }

    // WF3 F3 (Spec 118 §7.3) — per-step duration TREND, not a point-in-time budget
    // check. Evaluated BEFORE the verdict (same rationale as the whole-chain
    // tripwire above): a run that both crept on one step AND failed elsewhere must
    // still surface the creep. Carrier is GH annotations + exit code — this CLI is
    // outside the Spec 47 skeleton and emits no audit rows (deliberate deviation,
    // matching this file's existing ::warning/::error convention).
    const executedSteps = Array.isArray(latest?.records_meta?.step_completeness?.executed)
      ? latest.records_meta.step_completeness.executed
      : [];
    const stepTrends = await checkStepDurationTrends(pool, chainId, executedSteps);
    let hasErrorTrend = false;
    for (const { slug, trend } of stepTrends) {
      if (trend.level === 'error') {
        console.error(`::error title=Step duration trend::${chainSlug}:${slug} ${trend.message}`);
        hasErrorTrend = true;
      } else {
        console.log(`::warning title=Step duration trend::${chainSlug}:${slug} ${trend.message}`);
      }
    }
    if (hasErrorTrend) process.exitCode = 1;

    const { ok, reason } = classifyVerdict(latest);
    if (!ok) {
      console.error(
        `::error title=Chain verdict check::${chainSlug} verdict is a FAIL (${reason}) — orchestrator ` +
          'exit-0-on-scrape-failure masking (Spec 115 §2.4) means the process exit code ' +
          'alone would have reported this run green.'
      );
      process.exitCode = 1;
      return;
    }

    // B2 defer-streak breaker (RULING 2, Adv F3) — evaluated only once the latest row itself
    // reads green above; a 2nd consecutive same-step defer escalates to red.
    const streak = classifyDeferStreak(res.rows);
    if (!streak.ok) {
      console.error(`::error title=Chain verdict check::${chainSlug} ${streak.reason}`);
      process.exitCode = 1;
      return;
    }

    // B2/C5 (Spec 48 §3.9) — consulted ONLY here, on a row already inside OK_STATUSES; every other
    // status already reds above via classifyVerdict.
    const stepCompleteness = latest?.records_meta?.step_completeness;
    const completeness = classifyStepCompleteness(stepCompleteness, latest?.status);
    if (!completeness.ok) {
      console.error(`::error title=Chain verdict check::${chainSlug} step_completeness FAIL — ${completeness.reason}`);
      process.exitCode = 1;
      return;
    }
    if (completeness.annotate) {
      // §4.9 self-announcing pair (S-3, modelled on scripts/lib/accepted-baseline.js's
      // acceptedBaselineRows). Live absent count: DISTINCT ON latest-row-per-chain across all 5
      // scheduled chains (never a lookback window — a legacy row that already rotated out of
      // "latest" must not hold the count nonzero forever).
      const absentCount = await countAbsentStepCompleteness(pool);
      const absentText = absentCount == null ? 'unknown (live count query failed)' : String(absentCount);
      console.log(
        `::warning title=Chain verdict check::${chainSlug} step_completeness ${completeness.reason} ` +
          `— annotate window (Spec 48 §4.9); live absent count across the 5 scheduled chains (latest ` +
          `row per chain) = ${absentText}; fails closed once the window closes.`
      );
      // The flip condition itself (zero step_completeness-absent rows across a FULL CYCLE OF ALL
      // FIVE scheduled chains) is STRUCTURALLY unmeasurable from a single chain's verdict step alone
      // — it is cross-chain AND gated on B6 re-enabling chain-sources (currently disabled_manually;
      // a chain that never runs can never rotate its absent row out of "latest") — so this names both
      // dependencies rather than fabricating a single-chain approximation of a cross-chain fact.
      console.log(
        `::notice title=Chain verdict check::${chainSlug} step_completeness_absent_retighten — ` +
          're-tightens (annotate → fail-on-absent) once the live absent count above reaches 0 across ' +
          'a full cycle of all 5 scheduled chains (chain_permits, chain_coa, chain_sources, ' +
          'chain_entities, chain_deep_scrapes), pinned to the LATEST row per chain — gated on B6 ' +
          're-enabling chain_sources (Spec 48 §4.9; docs/reports/review_followups.md).'
      );
    }

    // B2 (RULING 2/3): green + a ::warning annotation for a deferred chain — the operator sees the
    // backlog (step + scope + threshold) without the run itself reading red.
    if (latest?.status === 'deferred_to_full') {
      const deferredAt = stepCompleteness && typeof stepCompleteness === 'object' ? stepCompleteness.deferred_at : null;
      const scopeCount = stepCompleteness && typeof stepCompleteness === 'object' ? stepCompleteness.scope_count : null;
      const threshold = stepCompleteness && typeof stepCompleteness === 'object' ? stepCompleteness.threshold : null;
      const scopeText = scopeCount != null && threshold != null ? ` (scope ${scopeCount} >= threshold ${threshold})` : '';
      console.log(
        `::warning title=Chain verdict check::${chainSlug} deferred to full at step ${deferredAt || '(unknown)'}${scopeText} ` +
          '— scope exceeded threshold; a repeat defer on the same step will escalate to red.'
      );
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

module.exports = {
  run,
  classifyVerdict,
  checkDurationTripwire,
  classifyDurationTrend,
  checkStepDurationTrends,
  classifyStepCompleteness,
  classifyDeferStreak,
  OK_STATUSES,
};
