/**
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ, R-DC, R-DE, R-DF
 *
 * CoA Source Freshness (portal-rot check) — THE DOMAIN LOGIC ONLY.
 *
 * Ported from `scripts/quality/assert-coa-freshness.js` (pre-conversion, 140 L) per
 * `docs/reports/2026-10-18-batch4-p4-1-assert-coa-freshness-assessment.md`. The one aggregate SELECT is
 * VERBATIM (`:53-60`); it reads the coa root's ingestion touch (`last_seen_at`, touched for every fed key,
 * R-DW), never `hearing_date` (future hearings mask portal rot). The runner owns the lock (identity.lock),
 * the config (config.logic_variables), the verdict (the declared check bounds compare; compute never
 * decides, R-BZ G7), the audit table and the emits.
 *
 * Checks (descriptor order — the §5.5 dispatch table below mirrors it):
 *   - total_records_present  viol == 0, WARN: an empty table is fresh staging, not portal rot (`:68-81`).
 *   - ingestion_days_ago     the measured day count; value_max from config, two tiers (R-AD warn_limit):
 *                            PASS <= assert_coa_freshness_warn_max_days, WARN <= _fail_max_days, else FAIL.
 *                            Inclusive ceilings (R-DC precedent, ACF-D7): the boundary day itself passes.
 *                            Inert (INFO) on an empty table, so the empty lane stays one WARN.
 * Context rows (INFO, appended after the checks): total_records, last_ingestion (UTC date, ACF-D4 declared
 * deviation), max_decision_date, max_hearing_date — the legacy INFO rows, verbatim values.
 */
'use strict';

const { MS_PER_DAY } = require('../units');

/** The verbatim legacy aggregate (`assert-coa-freshness.js:53-60`); no params. */
const FRESHNESS_SQL = `
    SELECT
      MAX(last_seen_at) AS max_last_seen,
      MAX(hearing_date)::date AS max_hearing_date,
      MAX(decision_date)::date AS max_decision_date,
      COUNT(*) AS total_records
    FROM coa_applications
  `;

// One round trip per run regardless of how many checks are selected (the assert_parcel_sanity SCAN_MEMO
// pattern): every dispatch entry reads the same memoized row.
const SCAN_MEMO = new WeakMap();
function getScan(ctx) {
  if (!SCAN_MEMO.has(ctx)) {
    SCAN_MEMO.set(ctx, ctx.pool.query(FRESHNESS_SQL).then((res) => {
      const row = res.rows[0] || {};
      return {
        totalRecords: parseInt(row.total_records, 10) || 0,
        maxLastSeen: row.max_last_seen || null,
        maxHearingDate: row.max_hearing_date || null,
        maxDecisionDate: row.max_decision_date || null,
      };
    }));
  }
  return SCAN_MEMO.get(ctx);
}

/** Days since the newest ingestion touch, rounded, never negative (`:85-88`); null when there is no touch. */
function ingestionDaysAgo(maxLastSeen, nowMs) {
  // node-postgres parses timestamptz to a Date; a string (another driver) is parsed, never the wall clock.
  const lastSeenMs = maxLastSeen instanceof Date ? maxLastSeen.getTime() : (maxLastSeen ? Date.parse(String(maxLastSeen)) : Number.NaN);
  if (!Number.isFinite(lastSeenMs)) return null;
  return Math.max(0, Math.round((nowMs - lastSeenMs) / MS_PER_DAY));
}

/** `last_ingestion` exactly as legacy rendered it (`:115`): the UTC calendar date of the touch, or "never". */
function lastIngestionDate(maxLastSeen) {
  if (!maxLastSeen) return 'never';
  return maxLastSeen instanceof Date ? maxLastSeen.toISOString().split('T')[0] : String(maxLastSeen).slice(0, 10);
}

async function total_records_present(ctx) {
  const { totalRecords } = await getScan(ctx);
  ctx.report('total_records_present', { violations: totalRecords === 0 ? 1 : 0, detail: `${totalRecords} coa_applications rows` });
}

async function ingestion_days_ago(ctx) {
  const { totalRecords, maxLastSeen } = await getScan(ctx);
  if (totalRecords === 0) {
    // The empty lane is total_records_present's WARN; this check proves nothing on an empty table.
    // value 0 keeps the value_max bound evaluable, so verdict.js reaches its inert arm (INFO) instead of unevaluable.
    ctx.report('ingestion_days_ago', { value: 0, inert: true, detail: 'inert (coa_applications is empty)' });
    return;
  }
  // A null day count (no touch at all) is unevaluable and resolves to the declared severity (ACF-D6).
  // No detail: the row's value is the day count itself, as the legacy row rendered it.
  ctx.report('ingestion_days_ago', { value: ingestionDaysAgo(maxLastSeen, ctx.clock()) });
}

const CHECKS = { total_records_present, ingestion_days_ago };

/** §5.5 (2) — run the SELECTED checks, then append the legacy INFO rows as context rows. */
async function compute(ctx) {
  for (const checkId of ctx.checks) {
    const fn = CHECKS[checkId];
    if (typeof fn !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${checkId}" with no function in the compute dispatch table`);
    }
    await fn(ctx);
  }
  const s = await getScan(ctx);
  ctx.contextRow({ metric: 'total_records', value: s.totalRecords, threshold: null, status: 'INFO' });
  ctx.contextRow({ metric: 'last_ingestion', value: lastIngestionDate(s.maxLastSeen), threshold: null, status: 'INFO' });
  // The two maxima pass through as the driver returns them (`:117-118`), byte-for-byte with legacy.
  ctx.contextRow({ metric: 'max_decision_date', value: s.maxDecisionDate || 'none', threshold: null, status: 'INFO' });
  ctx.contextRow({ metric: 'max_hearing_date', value: s.maxHearingDate || 'none', threshold: null, status: 'INFO' });
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.FRESHNESS_SQL = FRESHNESS_SQL;
module.exports.ingestionDaysAgo = ingestionDaysAgo;
