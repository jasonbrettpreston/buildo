#!/usr/bin/env node
/**
 * Assert Entity Tracing — Tier 3 CQA check.
 *
 * Runs after compute_opportunity_scores (step 25). For permits seen in
 * the last 26 hours, checks that each one has made it through all five
 * key downstream tables/columns:
 *   1. permit_trades    — classify_permits ran
 *   2. cost_estimates   — compute_cost_estimates ran
 *   3. trade_forecasts  — compute_trade_forecasts ran
 *   4. lifecycle_phase  — classify_lifecycle_phase ran (column on permits)
 *   5. opportunity_score— compute_opportunity_scores ran (column on trade_forecasts)
 *
 * Non-halting on business-logic FAILs: emits FAIL rows to the audit_table
 * but does NOT throw when coverage falls below threshold. Infrastructure
 * failures (DB connectivity, query errors) will re-throw as intended.
 *
 * Denominator design:
 *   windowPermits   — all permits with last_seen_at > NOW() - 26h.
 *                     Used for metrics 1 (permit_trades), 2 (cost_estimates),
 *                     4 (lifecycle_phase) — scripts that process all phases.
 *   eligiblePermits — permits in window that compute-trade-forecasts would
 *                     process (lifecycle_phase IS NOT NULL, phase_started_at
 *                     IS NOT NULL, and NOT IN SKIP_PHASES). Used for
 *                     metric 3 (trade_forecasts) only.
 *   forecast_rows   — trade_forecasts rows for window permits. Used for
 *                     metric 5 (opportunity_score) only.
 *
 * SPEC LINK: docs/specs/pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/pipeline/43_chain_sources.md
 */
'use strict';

const pipeline = require('./../lib/pipeline');
const { SKIP_PHASES_SQL } = require('./../lib/lifecycle-phase');

// Advisory lock ID — unique to this assert script (§47 §A.5, ID 110).
// Prevents two concurrent chain runs from executing the entity tracing
// check simultaneously, which could produce misleading coverage readings.
const ADVISORY_LOCK_ID = 110;

// 26-hour window: slightly wider than the assert-data-bounds 24h window to
// tolerate timing drift in daily chain scheduling. The two windows are NOT
// identical by design — this script uses 26h to avoid missing permits that
// arrived just outside the previous 24h boundary.
const TRACE_WINDOW = '26 hours';

// SKIP_PHASES_SQL imported from scripts/lib/lifecycle-phase.js — single source of truth.

const THRESHOLDS = {
  permit_trades:     0.95,
  cost_estimates:    0.90,
  trade_forecasts:   0.90,
  lifecycle_phase:   0.95,
  opportunity_score: 0.80,
};

pipeline.run('assert-entity-tracing', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // ── Base denominator: all permits touched in the 26h window ──────────────
    const { rows: [baseRow] } = await pool.query(
      `SELECT COUNT(*)::int AS window_permits
         FROM permits
        WHERE last_seen_at > NOW() - $1::interval`,
      [TRACE_WINDOW],
    );
    const windowPermits = baseRow.window_permits;

    if (windowPermits === 0) {
      pipeline.emitSummary({
        records_total: 0,
        records_new: 0,
        records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'no_permits_in_window',
          window: TRACE_WINDOW,
        },
      });
      pipeline.emitMeta({}, {});
      return;
    }

    // ── Eligible denominator: permits compute-trade-forecasts would process ──
    // Mirrors compute-trade-forecasts.js SOURCE_SQL eligibility criteria.
    // On CoA-link-only runs, link-coa.js bumps last_seen_at for CoA-linked permits —
    // many of which are in SKIP_PHASES (P19/P20 terminal, O1-O3 orphan). Using
    // windowPermits as the denominator for trade_forecasts would produce ~5% coverage
    // on those runs (false FAIL). eligiblePermits excludes those phases AND requires at
    // least one active trade (matching SOURCE_SQL: `pt.is_active = true`) so the
    // denominator represents exactly the permits the engine produces forecast rows for.
    //
    // WF3 2026-04-21: replaced `phase_started_at IS NOT NULL` with 3-year COALESCE
    // recency gate to mirror the zombie gate added to SOURCE_SQL. Two reasons:
    //   1. P1/P2 permits (PERT pipeline) have no phase_started_at but do have
    //      application_date — the old IS NOT NULL excluded them from the denominator
    //      even though the engine now generates forecasts for them (Branch A).
    //   2. Permits with phase_started_at > 3 years ago are excluded from SOURCE_SQL
    //      by the zombie gate — the denominator must exclude them too or coverage
    //      reads as artificially low (false FAIL at 38.6%).
    const { rows: [eligRow] } = await pool.query(
      `SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num)::int AS eligible_permits
         FROM permits p
         JOIN permit_trades pt ON pt.permit_num = p.permit_num
                              AND pt.revision_num = p.revision_num
                              AND pt.is_active = true
        WHERE p.last_seen_at > NOW() - $1::interval
          AND p.lifecycle_phase IS NOT NULL
          AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
          AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'`,
      [TRACE_WINDOW],
    );
    const eligiblePermits = eligRow.eligible_permits;

    const auditRows = [];
    const failures = [];

    // ── 1. permit_trades ──────────────────────────────────────────────────────
    const { rows: [pt] } = await pool.query(
      `SELECT COUNT(DISTINCT pt.permit_num || '--' || pt.revision_num)::int AS matched
         FROM permit_trades pt
         JOIN permits p ON p.permit_num = pt.permit_num
                       AND p.revision_num = pt.revision_num
        WHERE p.last_seen_at > NOW() - $1::interval`,
      [TRACE_WINDOW],
    );
    auditRows.push(traceRow('permit_trades', pt.matched, windowPermits, THRESHOLDS.permit_trades, failures, 'window_permits'));

    // ── 2. cost_estimates ─────────────────────────────────────────────────────
    const { rows: [ce] } = await pool.query(
      `SELECT COUNT(*)::int AS matched
         FROM cost_estimates ce
         JOIN permits p ON p.permit_num = ce.permit_num
                       AND p.revision_num = ce.revision_num
        WHERE p.last_seen_at > NOW() - $1::interval`,
      [TRACE_WINDOW],
    );
    auditRows.push(traceRow('cost_estimates', ce.matched, windowPermits, THRESHOLDS.cost_estimates, failures, 'window_permits'));

    // ── 3. trade_forecasts ────────────────────────────────────────────────────
    // Uses eligiblePermits denominator — compute-trade-forecasts skips SKIP_PHASES,
    // so the denominator must also exclude them to avoid false FAILs on
    // CoA-link-only runs where all bumped permits are ineligible phases.
    if (eligiblePermits === 0) {
      auditRows.push({
        metric: 'trade_forecasts_coverage_pct',
        value: null,
        threshold: `>= ${(THRESHOLDS.trade_forecasts * 100).toFixed(0)}%`,
        matched: 0,
        denominator: 0,
        denominator_type: 'eligible_permits',
        status: 'SKIP',
      });
    } else {
      const { rows: [tf] } = await pool.query(
        `SELECT COUNT(DISTINCT tf.permit_num || '--' || tf.revision_num)::int AS matched
           FROM trade_forecasts tf
           JOIN permits p ON p.permit_num = tf.permit_num
                         AND p.revision_num = tf.revision_num
          WHERE p.last_seen_at > NOW() - $1::interval
            AND p.lifecycle_phase IS NOT NULL
            AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
            AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'`,
        [TRACE_WINDOW],
      );
      auditRows.push(traceRow('trade_forecasts', tf.matched, eligiblePermits, THRESHOLDS.trade_forecasts, failures, 'eligible_permits'));
    }

    // ── 4. lifecycle_phase (column on permits) ────────────────────────────────
    const { rows: [lp] } = await pool.query(
      `SELECT COUNT(*)::int AS matched
         FROM permits
        WHERE last_seen_at > NOW() - $1::interval
          AND lifecycle_phase IS NOT NULL`,
      [TRACE_WINDOW],
    );
    auditRows.push(traceRow('lifecycle_phase', lp.matched, windowPermits, THRESHOLDS.lifecycle_phase, failures, 'window_permits'));

    // ── 5. opportunity_score (column on trade_forecasts, nullable) ───────────
    // opportunity_score is NULL when cost data is absent (spec 81 §3). Checks
    // whether compute_opportunity_scores populated scores >0: denominator is
    // trade_forecasts rows (not permits), since permits without classifications
    // will have no forecast rows. NULL > 0 is falsy — same as 0 > 0.
    // Filter expired rows from both numerator and denominator.
    // compute_opportunity_scores only processes non-expired forecast rows;
    // including expired rows (77% of all rows) inflates the denominator to ~81K
    // and produces ~20.5% coverage — a false FAIL. WF3-A fix.
    const { rows: [os] } = await pool.query(
      `SELECT
         COUNT(*)::int                                                          AS forecast_rows,
         SUM(CASE WHEN tf.opportunity_score > 0 THEN 1 ELSE 0 END)::int        AS matched
         FROM trade_forecasts tf
         JOIN permits p ON p.permit_num = tf.permit_num
                       AND p.revision_num = tf.revision_num
        WHERE p.last_seen_at > NOW() - $1::interval
          AND (tf.urgency IS NULL OR tf.urgency <> 'expired')`,
      [TRACE_WINDOW],
    );
    const osDenominator = os.forecast_rows || 0;
    const osMatched = os.matched || 0;
    const osCoverage = osDenominator > 0 ? osMatched / osDenominator : 1;
    const osThreshold = THRESHOLDS.opportunity_score;
    const osStatus = osCoverage >= osThreshold ? 'PASS' : 'FAIL';
    if (osStatus === 'FAIL') {
      failures.push(
        `opportunity_score: ${(osCoverage * 100).toFixed(1)}% of forecast rows scored > 0 ` +
        `(${osMatched}/${osDenominator}) below ${(osThreshold * 100).toFixed(0)}% threshold`,
      );
    }
    auditRows.push({
      metric: 'opportunity_score_coverage_pct',
      value: Math.round(osCoverage * 1000) / 10,
      threshold: `>= ${(osThreshold * 100).toFixed(0)}% of forecast rows`,
      matched: osMatched,
      denominator: osDenominator,
      denominator_type: 'forecast_rows',
      status: osStatus,
    });

    const verdict = failures.length > 0 ? 'FAIL' : 'PASS';

    if (failures.length > 0) {
      pipeline.log.warn('[assert-entity-tracing]', 'TRACE COVERAGE FAILURES', { failures });
    }

    pipeline.emitSummary({
      records_total: windowPermits,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        window: TRACE_WINDOW,
        eligible_permits: eligiblePermits,
        audit_table: {
          phase: 26,
          name: 'Assert Entity Tracing',
          verdict,
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        permits:         ['permit_num', 'revision_num', 'last_seen_at', 'lifecycle_phase'],
        permit_trades:   ['permit_num', 'revision_num'],
        cost_estimates:  ['permit_num', 'revision_num'],
        trade_forecasts: ['permit_num', 'revision_num', 'opportunity_score'],
      },
      {},
    );

    // Non-halting: FAIL is logged in audit_table but we do NOT throw.
    // Coverage gaps are expected for some permits (missing cost data,
    // legitimately zero opportunity scores, etc.).
  }, { skipEmit: false }); // end withAdvisoryLock

  if (!lockResult.acquired) {
    pipeline.log.info(
      '[assert-entity-tracing]',
      `Advisory lock ${ADVISORY_LOCK_ID} held — skipping to avoid duplicate coverage check.`,
    );
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        skipped: true,
        reason: 'lock_held',
        advisory_lock_id: ADVISORY_LOCK_ID,
      },
    });
    pipeline.emitMeta({}, {});
  }
});

/**
 * Build a standard trace coverage audit row and accumulate failures.
 * @param {string} table
 * @param {number} matched
 * @param {number} total
 * @param {number} threshold  0-1 fraction
 * @param {string[]} failures  mutated in place
 * @param {string} denominatorType  'window_permits' | 'eligible_permits'
 */
function traceRow(table, matched, total, threshold, failures, denominatorType) {
  const coverage = total > 0 ? matched / total : 1;
  const status = coverage >= threshold ? 'PASS' : 'FAIL';
  if (status === 'FAIL') {
    failures.push(
      `${table}: ${(coverage * 100).toFixed(1)}% coverage (${matched}/${total}) ` +
      `below ${(threshold * 100).toFixed(0)}% threshold`,
    );
  }
  return {
    metric: `${table}_coverage_pct`,
    value: Math.round(coverage * 1000) / 10,
    threshold: `>= ${(threshold * 100).toFixed(0)}%`,
    matched,
    denominator: total,
    denominator_type: denominatorType,
    status,
  };
}
