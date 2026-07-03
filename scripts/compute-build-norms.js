#!/usr/bin/env node
/**
 * compute-build-norms.js — permit-derived neighbourhood build/reno norms (Spec 78 Phase 1).
 *
 * A recomputed snapshot (truncate-replace) of what's ACTUALLY built/renovated per neighbourhood over the
 * 5-year permit window: realized FSI (p50/p90), build-ratios (NEW-build + OLD-stock from addition
 * deltas), reno-% (kitchen/bath), storey norms (joined from neighbourhood_storey_norms), and CoA
 * approval. The calibration layer the optimal-config (Phase 3) reads. One row per neighbourhood + one
 * citywide fallback row (neighbourhood_id = NULL, written UNCONDITIONALLY so the per-parcel range never
 * NULL-collapses on an empty/sparse neighbourhood).
 *
 * MARKET-REALIZED, NOT LEGAL (maximizer bias) — see the table COMMENT + Spec 78. Mutator archetype.
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-1
 * CHAIN: permits chain, after classify_permits / link_neighbourhoods / link_parcels. Advisory lock 78.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const bn = require('./lib/build-norms');

const ADVISORY_LOCK_ID = 78;

// Named per-neighbourhood aggregates over the `obs` CTE. Reused verbatim for the per-neighbourhood
// (GROUP BY neighbourhood_id) and the citywide (no GROUP BY) inserts. $4 = over-capture clamp.
const AGG_COLS = `
  count(*) FILTER (WHERE o.kind = 'new_build')::int AS c_new,
  count(*) FILTER (WHERE o.kind = 'addition')::int AS c_add,
  count(*) FILTER (WHERE o.kind IN ('reno','kitchen','bath'))::int AS c_reno,
  count(*) FILTER (WHERE o.kind = 'suite')::int AS c_suite,
  count(*) FILTER (WHERE o.kind = 'demo')::int AS c_demo,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.fsi) FILTER (WHERE o.fsi IS NOT NULL AND o.fsi <= $6) AS fsi_p50,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY o.fsi) FILTER (WHERE o.fsi IS NOT NULL AND o.fsi <= $6) AS fsi_p90,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.build_ratio) FILTER (WHERE o.build_ratio IS NOT NULL AND o.build_ratio <= $4) AS br_p50,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY o.existing_ratio) FILTER (WHERE o.existing_ratio IS NOT NULL) AS ex_p25,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.existing_ratio) FILTER (WHERE o.existing_ratio IS NOT NULL) AS ex_p50,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.reno_frac) FILTER (WHERE o.kind = 'kitchen' AND o.reno_frac IS NOT NULL) AS reno_kit,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY o.reno_frac) FILTER (WHERE o.kind = 'bath' AND o.reno_frac IS NOT NULL) AS reno_bth,
  count(*)::int AS sample_n`;

// The shared SELECT-list that maps an `agg`/`ag` row + storey + coa into the insert column order.
// `nid` = the neighbourhood_id expr; `storeyP50/P90`, `coaApproved/Refused/Total` are scalar exprs.
function insertSelectCols(src, nid, family, storeyP50, storeyP90, coaApproved, coaRefused, coaTotal, lowSampleExpr) {
  // lowSampleExpr override lets the citywide fallback FORCE low_sample = false (Spec 78 §P1.2) — the
  // fallback is never "low sample" by definition. `... AND $3::int IS NOT NULL` keeps $3 referenced so
  // Postgres can still infer its type (a bare `false` leaves $3 unused → "cannot determine type").
  const lowSample = lowSampleExpr || `${src}.sample_n < $3::int`;
  return `${nid}, ${family}, $1::date, $2::date,
    ${src}.c_new, ${src}.c_add, ${src}.c_reno, ${src}.c_suite, ${src}.c_demo,
    ${src}.fsi_p50, ${src}.fsi_p90, NULL::numeric, NULL::numeric,
    ${src}.br_p50, ${src}.ex_p25, ${src}.ex_p50, ${src}.reno_kit, ${src}.reno_bth,
    ${storeyP50}, ${storeyP90},
    ${coaApproved}, ${coaRefused}, ${coaTotal},
    CASE WHEN (${coaApproved}) + (${coaRefused}) > 0 THEN round((${coaApproved})::numeric / ((${coaApproved}) + (${coaRefused})), 3) END,
    jsonb_build_object('new_build', ${src}.c_new, 'addition', ${src}.c_add, 'reno', ${src}.c_reno, 'suite', ${src}.c_suite, 'demo', ${src}.c_demo),
    ${src}.sample_n, ${lowSample}, 'market_realized_5yr', $5`;
}

const INSERT_COLS = `(neighbourhood_id, structure_family, window_start, window_end, new_builds_5yr, additions_5yr, renos_5yr, suites_5yr, demos_5yr,
  realized_fsi_p50, realized_fsi_p90, realized_coverage_p50, realized_coverage_p90,
  build_ratio_p50, existing_build_ratio_p25, existing_build_ratio_p50, reno_kitchen_pct, reno_bath_pct,
  storeys_p50, storeys_p90, coa_approved, coa_refused, coa_total, coa_approval_rate,
  reno_mix, sample_n, low_sample, data_provenance, computed_at)`;

// One observation per (dominant parcel, kind) — principal row = max residential_sqm, deterministic
// tiebreak (DISTINCT ON). 5-yr window; only parcel-linked, neighbourhood-resolved permits.
const OBS_CTE = `obs AS (
  SELECT DISTINCT ON (p.zoning_dominant_parcel_id, kc.kind)
    pa.neighbourhood_id, kc.kind, (${bn.structureFamilyCaseSql('p')}) AS structure_family,
    -- NB: guard residential_sqm > 0 — Postgres LEAST/GREATEST IGNORE NULL args, so without it a
    -- NULL-residential permit (~63% have no RESIDENTIAL) would yield existing_ratio = 0.0, not NULL,
    -- silently polluting the percentile.
    CASE WHEN kc.kind = 'new_build' AND pa.lot_size_sqm > 0 AND p.residential_sqm > 0 THEN p.residential_sqm / pa.lot_size_sqm END AS fsi,
    CASE WHEN kc.kind = 'new_build' AND pa.max_buildable_gfa_sqm > 0 AND p.residential_sqm > 0 THEN p.residential_sqm / pa.max_buildable_gfa_sqm END AS build_ratio,
    CASE WHEN kc.kind = 'addition' AND pa.max_buildable_gfa_sqm > 0 AND p.residential_sqm > 0 THEN LEAST(1.0, GREATEST(0.0, 1.0 - p.residential_sqm / pa.max_buildable_gfa_sqm)) END AS existing_ratio,
    CASE WHEN kc.kind IN ('kitchen','bath') AND pa.max_buildable_gfa_sqm > 0 AND p.interior_alterations_sqm > 0 THEN p.interior_alterations_sqm / pa.max_buildable_gfa_sqm END AS reno_frac
  FROM permits p
  JOIN parcels pa ON pa.id = p.zoning_dominant_parcel_id
  CROSS JOIN LATERAL (SELECT (${bn.buildKindCaseSql('p')}) AS kind) kc
  WHERE p.issued_date >= $1 AND p.issued_date <= $2 AND p.zoning_dominant_parcel_id IS NOT NULL AND pa.neighbourhood_id IS NOT NULL
    AND ${bn.lowRiseResidentialSql('p')}
  ORDER BY p.zoning_dominant_parcel_id, kc.kind, p.residential_sqm DESC NULLS LAST, p.issued_date DESC, p.revision_num DESC
)`;

async function computeBuildNorms(pool, minSample = bn.BUILD_NORM_MIN_SAMPLE_DEFAULT) {
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const windowStart = (await pool.query(`SELECT (now()::date - ($1 || ' years')::interval)::date AS d`, [bn.BUILD_NORM_WINDOW_YEARS])).rows[0].d;
  const windowEnd = (await pool.query(`SELECT now()::date AS d`)).rows[0].d;
  // params: $1 windowStart, $2 windowEnd, $3 minSample, $4 overClamp, $5 RUN_AT, $6 FSI plausibility cap
  const params = [windowStart, windowEnd, minSample, bn.OVER_CAPTURE_CLAMP, RUN_AT, bn.FSI_PLAUSIBILITY_MAX];

  // Observability: new-build permits dropped by the structure_type allowlist (apartment/mixed/commercial)
  // + low-rise new-builds whose FSI exceeds the plausibility cap (residential_sqm ÷ tiny-parcel artifact).
  const clean = (await pool.query(
    `SELECT count(*) FILTER (WHERE NOT ${bn.lowRiseResidentialSql('p')})::int AS excluded,
            count(*) FILTER (WHERE ${bn.lowRiseResidentialSql('p')} AND pa.lot_size_sqm > 0 AND p.residential_sqm > 0
                                AND p.residential_sqm / pa.lot_size_sqm > $1)::int AS capped
       FROM permits p JOIN parcels pa ON pa.id = p.zoning_dominant_parcel_id
      WHERE p.project_type = 'new_build' AND p.issued_date >= $2 AND p.issued_date <= $3
        AND p.zoning_dominant_parcel_id IS NOT NULL AND pa.neighbourhood_id IS NOT NULL`,
    [bn.FSI_PLAUSIBILITY_MAX, windowStart, windowEnd],
  )).rows[0];

  const rowsWritten = await pipeline.withTransaction(pool, async (client) => {
    await client.query('DELETE FROM neighbourhood_build_norms'); // truncate-replace snapshot

    const perNbhd = await client.query(
      `WITH ${OBS_CTE},
       coa_agg AS (
         SELECT pa.neighbourhood_id,
                count(*) FILTER (WHERE ca.decision ILIKE '%approv%')::int AS approved,
                count(*) FILTER (WHERE ca.decision ILIKE '%refus%')::int  AS refused, count(*)::int AS total
         FROM coa_applications ca JOIN parcels pa ON pa.id = ca.zoning_dominant_parcel_id
         WHERE coalesce(ca.hearing_date, ca.decision_date) BETWEEN $1 AND $2 AND pa.neighbourhood_id IS NOT NULL
         GROUP BY pa.neighbourhood_id
       ),
       -- P2: per-POCKET × FAMILY rows (detached/townhouse/multiplex). WF3: PLUS a per-neighbourhood 'all'
       -- rollup — a family-agnostic aggregate over ALL builds in the boundary (mirrors the citywide
       -- (NULL,'all') rollup below, just GROUP BY neighbourhood_id). Fixes the 36% who fell to CITYWIDE:
       -- 78% of them are generic-R / non-family parcels (norm_family='all') that had NO per-pocket 'all'
       -- row to land in, so they skipped straight to Toronto-wide. Now they get their OWN pocket. Real
       -- builds in the boundary (sample_n >= 1) — invents nothing. obs is neighbourhood_id NOT NULL (L80),
       -- so this never emits a (NULL,'all') row that would collide with the citywide backstop.
       -- coa + storey are per-neighbourhood (not family-split): coa is per parcel, storey norms are UNIFIED.
       agg AS (SELECT o.neighbourhood_id, o.structure_family, ${AGG_COLS}
               FROM obs o WHERE o.structure_family IS NOT NULL
               GROUP BY o.neighbourhood_id, o.structure_family
               UNION ALL
               SELECT o.neighbourhood_id, 'all'::text AS structure_family, ${AGG_COLS}
               FROM obs o GROUP BY o.neighbourhood_id)
       INSERT INTO neighbourhood_build_norms ${INSERT_COLS}
       SELECT ${insertSelectCols('a', 'a.neighbourhood_id', 'a.structure_family', 'nsn.storeys_p50', 'nsn.storeys_p90', 'coalesce(c.approved,0)', 'coalesce(c.refused,0)', 'coalesce(c.total,0)')}
       FROM agg a
       LEFT JOIN coa_agg c ON c.neighbourhood_id = a.neighbourhood_id
       LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = a.neighbourhood_id`,
      params,
    );

    // citywide fallback (neighbourhood_id = NULL) — UNCONDITIONAL (review A-10). low_sample forced false.
    const cityRes = await client.query(
      `WITH ${OBS_CTE},
       coa_all AS (
         SELECT count(*) FILTER (WHERE ca.decision ILIKE '%approv%')::int AS approved,
                count(*) FILTER (WHERE ca.decision ILIKE '%refus%')::int  AS refused, count(*)::int AS total
         FROM coa_applications ca WHERE coalesce(ca.hearing_date, ca.decision_date) BETWEEN $1 AND $2
       ),
       -- P2: citywide rows — one PER family (typed obs) + an UNCONDITIONAL (NULL,'all') rollup over
       -- ALL obs (the family-agnostic backstop every read falls through to). Storey subqueries read the
       -- UNIFIED neighbourhood_storey_norms citywide row (single-row — storey norms are NOT family-aware).
       ag AS (
         SELECT o.structure_family, ${AGG_COLS} FROM obs o WHERE o.structure_family IS NOT NULL GROUP BY o.structure_family
         UNION ALL
         SELECT 'all'::text AS structure_family, ${AGG_COLS} FROM obs o
       )
       INSERT INTO neighbourhood_build_norms ${INSERT_COLS}
       SELECT ${insertSelectCols('ag', 'NULL', 'ag.structure_family',
              '(SELECT storeys_p50 FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL)',
              '(SELECT storeys_p90 FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL)',
              'coalesce(ca.approved,0)', 'coalesce(ca.refused,0)', 'coalesce(ca.total,0)',
              'false AND $3::int IS NOT NULL')}
       FROM ag CROSS JOIN coa_all ca`,
      params,
    );

    return (perNbhd.rowCount || 0) + (cityRes.rowCount || 0);
  });

  // Stats. Citywide is now MULTI-ROW (one per family + 'all'), so the scalar subqueries + the "exactly
  // one citywide" check target the (NULL,'all') backstop explicitly (else "more than one row"). P2.
  const stats = (await pool.query(
    `SELECT count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND structure_family <> 'all')::int AS pocket_family_rows,
            count(DISTINCT neighbourhood_id) FILTER (WHERE neighbourhood_id IS NOT NULL)::int AS nbhds,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND structure_family = 'all')::int AS pocket_all_rows,
            count(*) FILTER (WHERE neighbourhood_id IS NULL AND structure_family = 'all')::int AS citywide_all_count,
            count(*) FILTER (WHERE neighbourhood_id IS NULL AND structure_family <> 'all')::int AS citywide_family_count,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND structure_family = 'detached')::int AS detached_pocket_rows,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND low_sample)::int AS low_sample_nbhds,
            count(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND structure_family <> 'all' AND build_ratio_p50 IS NULL)::int AS no_build_ratio,
            (SELECT existing_build_ratio_p50 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all') AS citywide_existing_p50,
            (SELECT realized_fsi_p50 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all') AS citywide_fsi_p50,
            (SELECT realized_fsi_p90 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'detached') AS citywide_detached_fsi_p90
     FROM neighbourhood_build_norms`)).rows[0];

  return { rowsWritten, fsiExcludedNonlowrise: clean.excluded, fsiCapped: clean.capped, ...stats };
}

function main() {
  pipeline.run('compute-build-norms', async (pool) => {
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      const s = await computeBuildNorms(pool);
      // P2: numerator + denominator are both per-POCKET-FAMILY row (no_build_ratio counts pocket-family
      // rows with a null build_ratio, so divide by pocket_family_rows, NOT distinct neighbourhoods).
      const nullRate = s.pocket_family_rows > 0 ? s.no_build_ratio / s.pocket_family_rows : 0;
      const auditRows = [
        { metric: 'neighbourhoods_computed', value: s.nbhds, threshold: '> 0', status: s.nbhds > 0 ? 'INFO' : 'WARN' },
        // P2 family-aware: one (NULL,'all') backstop is REQUIRED (every read falls through to it).
        { metric: 'citywide_all_backstop_written', value: s.citywide_all_count, threshold: '== 1', status: s.citywide_all_count === 1 ? 'INFO' : 'FAIL' },
        { metric: 'citywide_family_rows', value: s.citywide_family_count, threshold: null, status: 'INFO' },
        { metric: 'pocket_family_rows', value: s.pocket_family_rows, threshold: null, status: 'INFO' },
        // WF3: the per-neighbourhood 'all' rollup — one per neighbourhood with ANY build; recovers the
        // generic-R / non-family parcels (~127K) from the citywide fallback to their own pocket.
        { metric: 'pocket_all_rollup_rows', value: s.pocket_all_rows, threshold: null, status: 'INFO' },
        { metric: 'detached_pocket_rows', value: s.detached_pocket_rows, threshold: null, status: 'INFO' },
        { metric: 'citywide_detached_fsi_p90', value: s.citywide_detached_fsi_p90, threshold: null, status: 'INFO' },
        { metric: 'low_sample_neighbourhoods', value: s.low_sample_nbhds, threshold: null, status: 'INFO' },
        { metric: 'build_ratio_null_rate_pct', value: Math.round(1000 * nullRate) / 10, threshold: `< ${bn.BUILD_RATIO_NULL_RATE_WARN * 100}%`, status: nullRate > bn.BUILD_RATIO_NULL_RATE_WARN ? 'WARN' : 'INFO' },
        { metric: 'citywide_existing_build_ratio_p50', value: s.citywide_existing_p50, threshold: null, status: 'INFO' },
        { metric: 'citywide_fsi_p50', value: s.citywide_fsi_p50, threshold: null, status: 'INFO' },
        { metric: 'fsi_excluded_nonlowrise', value: s.fsiExcludedNonlowrise, threshold: null, status: 'INFO' },
        { metric: 'fsi_capped', value: s.fsiCapped, threshold: null, status: 'INFO' },
      ];
      const verdict = auditRows.some((r) => r.status === 'FAIL') ? 'FAIL' : auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
      pipeline.emitSummary({
        records_total: s.rowsWritten, records_new: s.rowsWritten, records_updated: 0,
        records_meta: { audit_table: { phase: ADVISORY_LOCK_ID, name: 'Neighbourhood Build Norms', verdict, rows: auditRows } },
      });
      pipeline.emitMeta(
        { permits: ['zoning_dominant_parcel_id', 'project_type', 'structure_type', 'description', 'issued_date', 'revision_num', 'residential_sqm', 'interior_alterations_sqm'],
          parcels: ['id', 'neighbourhood_id', 'lot_size_sqm', 'max_buildable_gfa_sqm'],
          coa_applications: ['zoning_dominant_parcel_id', 'decision', 'hearing_date', 'decision_date'],
          neighbourhood_storey_norms: ['neighbourhood_id', 'storeys_p50', 'storeys_p90'] },
        { neighbourhood_build_norms: ['*'] },
      );
    });

    if (!lockResult.acquired) {
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere', advisory_lock_id: ADVISORY_LOCK_ID,
          audit_table: { phase: ADVISORY_LOCK_ID, name: 'Neighbourhood Build Norms', verdict: 'SKIP',
            rows: [{ metric: 'neighbourhoods_computed', value: 0, threshold: null, status: 'SKIP' }] } },
      });
      pipeline.emitMeta({ permits: [] }, {});
    }
  });
}

module.exports = { computeBuildNorms, ADVISORY_LOCK_ID };

if (require.main === module) main();
