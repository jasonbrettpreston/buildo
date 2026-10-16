/**
 * SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md (link_parcel_abutments — PROPOSED)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1, 3, 10
 * SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (plan B2)
 *
 * Parcel abutments (front-yard-averaging input) — THE LINK DOMAIN LOGIC ONLY.
 *
 * This module owns exactly three things and nothing else:
 *   · the SQL TEXT (PURE, no pool): the pair query, the eligibility queries and the
 *     post-write census. The LIBRARY executes it (runLinkPhase) — this file never opens a
 *     connection, never imports `pg`, `fs` or `pipeline`, and never reads a clock.
 *   · the PURE row classifier (`classifyMatches`), the only place an `est_status` is born.
 *   · ONE OBSERVER PER DECLARED CHECK (`fn.name === check.id`), each reading a value the
 *     library already measured off the ctx.
 *
 * ⚠️ WHAT THIS FILE IS NOT. Under Spec 122 §5.1 the library owns acquire → validate →
 * write (`scripts/lib/step/*`). What is left here is what a compute is FOR: pure arithmetic
 * and the SQL string it hands back. The verdict is NOT computed here (Rule 10) — it is
 * derived from the audit rows by `scripts/lib/step/verdict.js`.
 *
 * ⚠️ TUNING IS NOT A CONSTANT (Spec 124 Rule 3 / the gate-E rule): NO module-level numeric
 * tunables exist here. Every threshold arrives on `config`, already resolved by the library
 * against the descriptor's declared `logic_variables` bounds BEFORE compute runs, and is
 * interpolated into the SQL as a NUMBER literal. `runLinkPhase` binds ONLY `[ids]` to
 * `primary_match_sql` (`$1` in the CTE), so `$2…$5` cannot exist; `sqlNumber()` refuses a
 * non-finite tunable by THROWING rather than emitting `NaN` into shipped SQL.
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, gathered in the CHECKS dispatch at the bottom
 *      in DESCRIPTOR ORDER (locked by the step-conformance compute-pairs test).
 *   2. `compute(ctx)` iterates `ctx.checks` and does nothing else.
 *   3. Every observation goes through `ctx.report(<checkId>, …)`. No `console.*`.
 *   4. Every seam is injected: `ctx.config`, `ctx.log`. No `fs`, no `pg`, no `pipeline`.
 *
 * The two frozen vocabularies below are NOT tunables: RES_ZONES is the by-law's own
 * residential zone-family letter set (R/RD/RS/RT/RM, City of Toronto Zoning By-law 569-2013
 * §40) and STATUSES is the CLOSED est_status vocabulary the migration's CHECK constraint
 * carries — hoisting them to `logic_variables` would make an operator-editable enum, and a
 * value outside the set would be refused by Postgres rather than by the step.
 */
'use strict';

/** The residential zone families the `neighbour_residential` flag reads (by-law vocabulary, not a tunable). */
const RES_ZONES = Object.freeze(['R', 'RD', 'RS', 'RT', 'RM']);
/** The CLOSED est_status vocabulary (mirrors the migration's CHECK constraint, not a tunable). */
const STATUSES = Object.freeze([
  'estimated',
  'no_building',
  'no_frontage_street',
  'street_not_found',
  'estimate_negative',
  'estimate_out_of_bounds',
]);

// ===========================================================================
// SQL builders — PURE. The library executes the strings; this file never does.
// ===========================================================================

/**
 * The eligibility predicate: every parcel with geometry, on EVERY run.
 *
 * H6 port (Q-B3 adjudicated full rescan 2026-10-14; Spec 124 R-BZ G1 + O4 row 5): the step is a
 * full_rescan LINK (`staleness.mode_select: "none"`) — every run re-derives every pair and the
 * guarded upsert writes only the pairs whose values changed. The former tri-state incremental
 * predicate read `pipeline_runs` from compute text (a G1 `compute-ledger-sql` finding) to avoid
 * disqualifying parcels the current run had itself filled; under full_rescan there is no
 * incremental predicate, so that read is gone rather than moved. Pair EXISTENCE depends only
 * on the two geometries, and a material geometry change deletes the parcel's pairs in both
 * orientations (migration 255 trigger); a parcel delete cascades (FK).
 */
function eligibilityPredicate() {
  return 'geom IS NOT NULL';
}

/**
 * The pair query: subject parcels (bound as `$1::int[]` by runLinkPhase — the ONLY bind this
 * statement takes) joined to their neighbours within `abut_touch_tolerance_m`, the shared
 * boundary measured ONCE per UNORDERED pair in EPSG 2952, and both orientations expanded
 * only after the length test — with the neighbour's primary building and frontage-street
 * geometry attached as OBSERVATIONS.
 *
 * ⚠️ WHY THE SHARED LENGTH IS MEASURED ON THE UNORDERED PAIR (PA-F2). The old form measured
 * `ST_Length(ST_Intersection(ST_Boundary(A), ST_Buffer(B, tol)))` per ORDERED row, which is
 * wrong twice over. (a) It is ORIENTATION-DEPENDENT: `∂A ∩ buffer(B)` is not the reverse, so
 * (A,B) and (B,A) could disagree about whether the pair clears `abut_min_shared_len_m` and the
 * two orientations of one pair could be kept and dropped independently — the exact asymmetry
 * `asymmetric_pairs` is supposed to catch, manufactured by the step itself. (b) `ST_Buffer`
 * INFLATES the measurement by about `tol` at each end, so a CORNER TOUCH measures about
 * `2·tol` (≈ 1.4 m at the 0.5 m default) and sails past a 1.0 m minimum — a point touch written
 * as an abutting lot.
 *
 * The fix is structural: `u` collapses `nb` to DISTINCT unordered pairs (`LEAST`/`GREATEST`),
 * `m` computes the SYMMETRIC length there, the `minLen` test runs THERE, and `pairs` expands
 * the surviving pairs to both orientations afterwards. Both orientations of a pair therefore
 * carry ONE length and ONE keep/drop decision, by construction.
 *
 * The symmetric length is the MEAN of the two oriented overlaps with the buffer inflation
 * removed: `GREATEST(0, (len(∂lo ∩ buf(hi)) + len(∂hi ∩ buf(lo))) / 2 - 2·tol)`. Each term
 * overstates the true shared edge by about `2·tol` (the buffer extends `tol` past each end), so
 * averaging and subtracting `2·tol` lands on the real shared boundary; the two terms agree to
 * within a few cm so the mean is stable, and the clamp keeps a degenerate pair at 0 rather than
 * a small negative. `ST_CollectionExtract(…, 2)` keeps only the LINEAL part of the
 * intersection: the buffer makes the intersection PUNCTUAL at a corner touch even when
 * `ST_Boundary(lo)` also clips area-like slivers, and a point has zero length, so a point touch
 * now measures 0 and is excluded by any positive minimum.
 *
 * The distance columns are deliberately raw here: `classifyMatches` rounds them, so the SQL
 * never has to agree with the class-B write about a scale.
 */
function buildPrimaryMatchSql(config) {
  const tol = sqlNumber(config.abut_touch_tolerance_m, 'abut_touch_tolerance_m');
  const pad = sqlNumber(config.abut_bbox_pad_deg, 'abut_bbox_pad_deg');
  const minLen = sqlNumber(config.abut_min_shared_len_m, 'abut_min_shared_len_m');
  const streetDeg = sqlNumber(config.abut_street_search_deg, 'abut_street_search_deg');
  return `WITH s AS (
  SELECT p.id, p.geom FROM parcels p WHERE p.id = ANY($1::int[]) AND p.geom IS NOT NULL
),
nb AS (
  SELECT s.id AS a, n.id AS b
    FROM s JOIN parcels n
      ON n.id <> s.id AND n.geom IS NOT NULL
     AND n.geom && ST_Expand(s.geom, ${pad})
     AND ST_DWithin(n.geom::geography, s.geom::geography, ${tol})
),
u AS (
  SELECT DISTINCT LEAST(a, b) AS lo, GREATEST(a, b) AS hi FROM nb
),
m AS (
  SELECT u.lo, u.hi,
         GREATEST(0, (ST_Length(ST_CollectionExtract(ST_Intersection(ST_Boundary(ST_Transform(lo.geom, 2952)), ST_Buffer(ST_Transform(hi.geom, 2952), ${tol})), 2))
                    + ST_Length(ST_CollectionExtract(ST_Intersection(ST_Boundary(ST_Transform(hi.geom, 2952)), ST_Buffer(ST_Transform(lo.geom, 2952), ${tol})), 2))) / 2
                    - 2 * ${tol}) AS shared_len_m
    FROM u JOIN parcels lo ON lo.id = u.lo JOIN parcels hi ON hi.id = u.hi
),
kept AS (
  SELECT lo, hi, shared_len_m FROM m WHERE shared_len_m >= ${minLen}
),
pairs AS (
  SELECT lo AS parcel_id, hi AS neighbour_id, shared_len_m FROM kept
  UNION ALL
  SELECT hi AS parcel_id, lo AS neighbour_id, shared_len_m FROM kept
),
g AS (
  SELECT pr.parcel_id, pr.neighbour_id, pr.shared_len_m,
         ST_Transform(sp.geom, 2952) AS sg, ST_Transform(np.geom, 2952) AS ng, np.geom AS n_geom,
         sp.primary_frontage_street_name AS s_st, np.primary_frontage_street_name AS n_st, np.zoning_class AS n_zc
    FROM pairs pr
    JOIN parcels sp ON sp.id = pr.parcel_id
    JOIN parcels np ON np.id = pr.neighbour_id
)
SELECT g.parcel_id, g.neighbour_id, g.shared_len_m,
       CASE WHEN g.s_st IS NULL OR g.n_st IS NULL THEN NULL ELSE g.s_st = g.n_st END AS same_frontage_street,
       COALESCE(g.n_zc IN (${resZoneList()}), false) AS neighbour_residential,
       bf.id AS neighbour_building_id,
       CASE WHEN bf.id IS NULL THEN NULL ELSE ST_Distance(ST_Transform(bf.geom, 2952), g.sg) END AS bldg_to_subject_m,
       g.n_st AS neighbour_street,
       -- PA-F4: a street UNION over zero rows is an EMPTY geometry, not NULL — a bare
       -- IS NOT NULL would call that found and then measure against nothing.
       (st.g IS NOT NULL AND NOT ST_IsEmpty(st.g)) AS street_found,
       CASE WHEN bf.id IS NULL OR st.g IS NULL OR ST_IsEmpty(st.g) THEN NULL ELSE ST_Distance(ST_Transform(bf.geom, 2952), st.g) END AS bldg_street_m,
       CASE WHEN st.g IS NULL OR ST_IsEmpty(st.g) THEN NULL ELSE ST_Distance(g.ng, st.g) END AS lot_street_m
  FROM g
  LEFT JOIN LATERAL (
    SELECT pb.building_id FROM parcel_buildings pb
     WHERE pb.parcel_id = g.neighbour_id AND pb.is_primary
     ORDER BY pb.building_id LIMIT 1
  ) pbx ON true
  LEFT JOIN building_footprints bf ON bf.id = pbx.building_id
  LEFT JOIN LATERAL (
    SELECT ST_Union(ST_Transform(c.geom, 2952)) AS g FROM toronto_centreline c
     WHERE g.n_st IS NOT NULL AND c.linear_name_full = g.n_st AND c.geom && ST_Expand(g.n_geom, ${streetDeg})
  ) st ON true;`;
}

/**
 * The post-write census, ONE round trip, no binds: the share of parcels with an abutment
 * row, the symmetry invariant, the row count and the est_status histogram. `linked` /
 * `total` are the LINK pair the descriptor declares as `cumulative`; `mono_*` and `fallback`
 * are the library's positional aliases.
 */
const CUMULATIVE_SQL = `SELECT
  (SELECT COUNT(DISTINCT parcel_id) FROM parcel_abutments) AS linked,
  (SELECT COUNT(*) FROM parcels WHERE geom IS NOT NULL) AS total,
  (SELECT COUNT(*) FROM parcel_abutments) AS abutment_rows,
  (SELECT COUNT(*) FROM parcel_abutments a
    WHERE NOT EXISTS (SELECT 1 FROM parcel_abutments b
                       WHERE b.parcel_id = a.neighbour_id AND b.neighbour_id = a.parcel_id)) AS asymmetric_pairs,
  COALESCE((SELECT jsonb_object_agg(est_status, n) FROM (SELECT est_status, COUNT(*) AS n FROM parcel_abutments GROUP BY est_status) x), '{}'::jsonb) AS est_status_counts;`;

/**
 * The LINK contract: everything the library needs to run one candidate source, with the
 * tunables already interpolated and every field a boolean set COUNT rather than a predicate.
 * `cumulative_params` is `[]` because the census takes no bind parameters. `mode` is always
 * "full" under full_rescan (resolveLinkGate), so the predicate does not branch on it.
 */
function buildMatchSql(descriptor, config) {
  const eligible = eligibilityPredicate();
  return {
    eligible_count_sql: `SELECT COUNT(*) AS total FROM parcels WHERE ${eligible};`,
    eligible_batch_sql: `SELECT id FROM parcels WHERE ${eligible} AND id > $2 ORDER BY id ASC LIMIT $1;`,
    primary_match_sql: buildPrimaryMatchSql(config),
    primary_match_params: [],
    primary_counter: 'abutment_pairs',
    fallback_counter: 'fallback_none',
    fallback_match_sql: null,
    fallback_match_params: [],
    fallback_eligible_sql: null,
    cumulative_sql: CUMULATIVE_SQL,
    cumulative_params: [],
  };
}

// ===========================================================================
// Pure classifier
// ===========================================================================

/**
 * ONE raw pair row -> the row the write plan binds, with the advisory estimate and its
 * status. The ORDER of the refusal tests IS the semantics: a parcel with no building has no
 * estimate to bound, a parcel with no frontage street has no street to difference against,
 * and only then is the difference bounded by the descriptor's fya_est_min_m / fya_est_max_m.
 *
 * PURE. Returns the tally the runner's counters read, not a decision (Rule 10).
 */
function classifyMatches(rows, config) {
  // PA-F3: the classifier's own tunables go through the SAME finite-number refusal as the
  // SQL tunables. `Number(NaN)` and `Number('x')` are NaN, and a NaN bound makes EVERY
  // comparison false — `est < min` and `est > max` both fall through, so every estimate
  // would be stamped `estimated` by an unmeasured bound and nothing would say so.
  const min = sqlNumber(config.fya_est_min_m, 'fya_est_min_m');
  const max = sqlNumber(config.fya_est_max_m, 'fya_est_max_m');
  const out = rows.map((r) => {
    const buildingId = r.neighbour_building_id === undefined ? null : r.neighbour_building_id;
    const street = r.neighbour_street === undefined ? null : r.neighbour_street;
    const streetFound = r.street_found === true;
    let status;
    let est = null;
    if (buildingId === null) {
      status = 'no_building';
    } else if (street === null) {
      status = 'no_frontage_street';
    } else if (!streetFound) {
      status = 'street_not_found';
    } else {
      est = round2(Number(r.bldg_street_m) - Number(r.lot_street_m));
      if (est < min) {
        status = 'estimate_negative';
        est = null;
      } else if (est > max) {
        status = 'estimate_out_of_bounds';
        est = null;
      } else {
        status = 'estimated';
      }
    }
    return {
      parcel_id: r.parcel_id,
      neighbour_id: r.neighbour_id,
      shared_len_m: round2(r.shared_len_m),
      same_frontage_street: r.same_frontage_street === undefined ? null : r.same_frontage_street,
      neighbour_residential: r.neighbour_residential === undefined ? null : r.neighbour_residential,
      neighbour_building_id: buildingId,
      bldg_to_subject_m: buildingId === null ? null : round2(r.bldg_to_subject_m),
      front_setback_est_m: est,
      est_status: status,
    };
  });
  const parcels = new Set(out.map((r) => r.parcel_id)).size;
  return { rows: out, parcels, matches: out.length };
}

/**
 * The fallback contract. This step declares `fallback_match_sql: null` — there is no second
 * source of abutments — so this is NEVER called on a run; it exists so the LINK contract is
 * total (a caller may ask without knowing which step it is holding) and so the "no fallback"
 * decision is a named, testable export rather than an absence.
 */
function classifyFallback() {
  return { rows: [], parcels: 0 };
}

// ===========================================================================
// One observer per declared check — `fn.name === check.id`, DESCRIPTOR ORDER.
// ===========================================================================

/**
 * The gate decision, copied verbatim off `ctx.gate` (full / full_rescan under mode_select
 * none). INFO, never FAIL: this row RECORDS what the library already decided; it does not
 * decide (Rule 10).
 */
function full_mode_gate(ctx) {
  const gate = ctx.gate || {};
  ctx.report('full_mode_gate', {
    violations: 0,
    detail: { mode: gate.mode ?? null, reason: gate.reason ?? null, explicit_full: gate.explicit_full === true },
  });
}

/** The denominator of this run: every parcel with geometry (full_rescan). */
function parcels_processed(ctx) {
  ctx.report('parcels_processed', {
    violations: 0,
    detail: { parcels_processed: ctx.matched.parcels_processed },
  });
}

/** What the guarded upsert did. Zero on an unchanged re-run IS the idempotency evidence. */
function abutment_rows_written(ctx) {
  const w = ctx.written.e1 || {};
  ctx.report('abutment_rows_written', {
    violations: 0,
    detail: { inserted: w.inserted ?? 0, updated: w.updated ?? 0 },
  });
}

/**
 * Adjacency is symmetric and every batch emits both orientations, so a non-zero count is a
 * partial write (a geometry edit deletes both orientations, migration 255) — measured over the WHOLE table,
 * which is why this is WARN and posts a violation count rather than a boolean.
 */
function asymmetric_pairs(ctx) {
  // PA-F5: a NON-FINITE count (an absent key, a null the runner could not coerce) must
  // report a violation, not a clean zero. `Number(undefined) || 0` used to turn "nobody
  // measured the symmetry invariant" into a green row — the fail-open the fleet's other
  // checks refuse. An unmeasured invariant is a violation with the reason named.
  const raw = Number(ctx.matched.asymmetric_pairs);
  if (!Number.isFinite(raw)) {
    ctx.report('asymmetric_pairs', { violations: 1, detail: { asymmetric_pairs: null, unmeasured: true } });
    return;
  }
  const viol = raw;
  ctx.report('asymmetric_pairs', {
    violations: viol,
    detail: { asymmetric_pairs: viol },
  });
}

/** The closed est_status census the Reality-Check bounds read. A shortfall is visible here, not refused. */
function est_status_counts(ctx) {
  ctx.report('est_status_counts', {
    violations: 0,
    detail: ctx.matched.est_status_counts || {},
  });
}

/**
 * The CUMULATIVE share (%) of parcels with geometry that have at least one abutment row, reported
 * as a value against the declared `pct >=` floor (link_neighbourhoods link_rate form). A collapse
 * is a join, tolerance or search-pad regression.
 */
function parcels_with_abutments_pct(ctx) {
  const c = ctx.cumulative || {};
  const linked = Number(c.linked_parcels) || 0;
  const total = Number(c.parcels_with_centroid) || 0;
  ctx.report('parcels_with_abutments_pct', {
    value: total > 0 ? (linked / total) * 100 : 0,
    detail: { linked, total },
  });
}

// ---- helpers ----

/**
 * A tunable interpolated into SQL as a NUMBER literal. A non-number or non-finite value (NaN,
 * ±Infinity, any string, undefined) is a DEFECT (fleet form: assert-parcel-sanity-fields.js num()): it would produce `NaN`/`null` inside
 * the shipped query, and Postgres would either error opaquely or — worse — accept a
 * degenerate predicate. Refuse by name so the failure says WHICH tunable.
 */
function sqlNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`link-parcel-abutments: tunable ${name} is not a finite number (got ${String(value)})`);
  }
  return value;
}

/** The RES_ZONES set as a quoted SQL list — `'R', 'RD', …` — pure, from the frozen vocabulary. */
function resZoneList() {
  return RES_ZONES.map((z) => `'${z}'`).join(', ');
}

/** Round to the NUMERIC(10,2) column scale so the IS DISTINCT FROM guard is stable across re-runs. */
function round2(x) {
  return x === null || x === undefined ? null : Math.round(Number(x) * 100) / 100;
}

/**
 * The emit block for `emits[].key` on a LINK run. Built only when the library actually
 * matched and measured (`ctx.matched` + `ctx.cumulative`): a gated skip re-emits the PRIOR
 * block through the library, so a half-populated block here would overwrite it with zeroes.
 */
function buildLinkMeta(ctx) {
  const m = ctx.matched || {};
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    parcels_count: String(m.parcels_count),
    building_footprints_count: String(m.building_footprints_count),
    centreline_count: String(m.centreline_count),
    full_mode: ((ctx.gate || {}).mode === 'full'),
    parcels_processed: m.parcels_processed,
    abutment_rows: m.abutment_rows,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  full_mode_gate,
  parcels_processed,
  abutment_rows_written,
  asymmetric_pairs,
  est_status_counts,
  parcels_with_abutments_pct,
};

// The dispatch keys === the descriptor's declared check ids, in order, is locked by the
// generic compute-pairs test (src/tests/step-conformance.infra.test.ts) and the step's own
// violations suite — not by a descriptor require here (R-BZ G12).

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row, never suppress siblings. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!(ctx.matched && ctx.cumulative)) return { records_meta: {} };
  return { records_meta: buildLinkMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The pure seams the LINK runner calls by name.
module.exports.buildMatchSql = buildMatchSql;
module.exports.classifyMatches = classifyMatches;
module.exports.classifyFallback = classifyFallback;
module.exports.buildLinkMeta = buildLinkMeta;
module.exports.STATUSES = STATUSES;
module.exports.RES_ZONES = RES_ZONES;
