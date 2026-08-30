/**
 * The plausibility gate-mapping policy + distribution-scan mechanism.
 *
 * EXTRACTED VERBATIM from `scripts/analysis/parcel-sanity-audit.js` (R-T addendum,
 * Spec 124 §2 Rule 13, WF2 "The Step Validator, Data-First", commit 2). That file
 * now re-imports `statusFor`/`verdictCascade` from here rather than defining them
 * locally — one copy of the gate-mapping policy, not a second one forked for the
 * new `invariants[]`/`plausibility[]` categories (Fold A-4d: "extract once, both
 * sides import" — the same discipline used for `statusFor`/`verdictCascade` is
 * applied here to `parcel-sanity-audit.js`'s DIST_FIELDS distribution scan too,
 * Fold B-7).
 *
 * `runDistributionScan` is exported so a future `plausibility[].kind:"distribution"`
 * row type (Fold B-7, wiring decided at commit 7) can call it directly instead of
 * re-implementing the per-zone-outlier percentile logic. It hardcodes `FROM parcels`
 * — matching the ONE caller this scan has today (`parcel-sanity-audit.js`'s own
 * `runSanity`) — because genericizing it onto an arbitrary table is not this
 * commit's scope; a future caller needing a different table is Fold B-7's own
 * "commit 7 records the wiring decision", not assumed here.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 13 (R-T addendum)
 * SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (row-derived verdict cascade)
 */
'use strict';

// sev/gate → audit-row status (Spec 48 §3.6, data-driven — NO per-check-id branching):
//   inert (pop === 0) → INFO · gated + violated → FAIL · INFO check → INFO · violated → WARN · else PASS.
// D-E 4 (WF3 Phase 1): a check whose POPULATION is empty proves nothing — it reads INFO 'inert', never
// a green PASS (day-one customers: the vacated below-floor range, ravine_constrained pre-re-run).
// `pop` is optional (undefined = population unknown, e.g. the unit-altitude calls) — only an explicit 0 is inert.
function statusFor(check, viol, pop) {
  if (pop === 0) return 'INFO';
  return check.gate && viol > 0 ? 'FAIL' : check.sev === 'INFO' ? 'INFO' : viol > 0 ? 'WARN' : 'PASS';
}

// Row-derived verdict cascade (Spec 48 §3.6) — co-located with the sanity policy so the pipeline step
// imports it rather than adding a 5th copy of the generic helper.
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// buildDistributionQuery — the exact SQL `parcel-sanity-audit.js`'s inline `distQ` closure built,
// parameterised on the residential-scope predicate and the zone-class bucket expression (both were
// already parcel-sanity-audit-local constants, RES/ZC, now passed in rather than closed over).
function buildDistributionQuery(resScope, zoneExpr, field) {
  return `
    WITH base AS (SELECT id, (${zoneExpr}) AS zc, (${field.expr})::float8 AS f FROM parcels WHERE ${resScope} AND (${field.expr}) IS NOT NULL),
    stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                     percentile_cont(0.99) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
    SELECT count(*)::int AS viol, (array_agg(b.id ORDER BY b.f DESC, b.id))[1:6] AS samples,
           round(max(b.f)::numeric, 2) AS worst
    FROM base b JOIN stats s ON s.zc = b.zc
    WHERE b.f > s.p99 AND b.f > 3 * GREATEST(s.med, 0.0001)`;
}

// runDistributionScan(pool, fields, resScope, zoneExpr) — per-zone outlier scan (value beyond p99 AND
// > 3x the zone median). Extracted verbatim from `parcel-sanity-audit.js`'s `runSanity()` inline
// `distQ()`/`Promise.all()` — behavior-identical, only the RES/ZC closure became explicit parameters.
async function runDistributionScan(pool, fields, resScope, zoneExpr) {
  return Promise.all(fields.map(async (f) => {
    const r = (await pool.query(buildDistributionQuery(resScope, zoneExpr, f))).rows[0];
    return { id: f.id, viol: r.viol, worst: r.worst, samples: r.samples || [] };
  }));
}

module.exports = { statusFor, verdictCascade, buildDistributionQuery, runDistributionScan };
