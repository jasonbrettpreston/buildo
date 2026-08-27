/**
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2 (geom contract), §3 (core logic, the --full gate)
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §3 (Link Massing)
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md MB-7 (the downstream precondition)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2a, §1.4, §4.1, §5.1, §5.5
 *
 * Building Footprint Linking — THE DOMAIN LOGIC ONLY.
 *
 * WHAT THIS FILE IS. Under operator ruling A-1(a) the library owns the whole
 * read -> gate -> ordered-write pipeline (scripts/lib/step/{index,write,staleness}.js),
 * because a LINK's real work is transaction, batch and catalog work a compute is
 * forbidden to touch (scripts/ast-grep-rules/compute-shape.yml). What is left here is
 * what a compute is FOR, and it is exactly three things:
 *
 *   1. buildMatchSql(descriptor, config, mode) — ruling A-2 option 2. The SPATIAL
 *      PREDICATE is this step's entire domain and it had no declaration slot: no schema
 *      field can express "join table A to table B on ST_Contains of B's centroid".
 *      Option 1 (a SQL DSL in the schema) is a C3 contract change this pilot cannot
 *      carry, and option 3 (a pool in the compute) breaks P2. So the compute holds the
 *      SQL TEXT, pure, with no pool — the same shape write.js buildWritePlan already
 *      has — and the library executes it. The P1 shortfall is recorded in the
 *      descriptor's limitations[] rather than pretended away.
 *   2. the pure row classifiers the library calls between the match and the write.
 *   3. one named observer per declared check, reading what the library measured.
 *
 * THE CTX CONTRACT (what the library hands a LINK compute):
 *   · ctx.matched     — what the JOIN produced this run: parcels walked, parcels
 *                       linked, per-predicate match counts, the unmatched tail, the
 *                       upstream corpus size the gate measured, and the two junction
 *                       invariants measured after the write
 *   · ctx.cumulative  — the link-rate numerator and its denominator. CUMULATIVE, not
 *                       run-scoped, and that is deliberate: in incremental mode the
 *                       unlinked pool is permanently-unmatchable parcels, so a
 *                       run-scoped rate reads 0% on a perfectly healthy run
 *   · ctx.written     — PER DECLARED TARGET (written.e1 / written.e2), plus the
 *                       measured RLS privilege. Keyed by target because this step
 *                       writes TWO disciplines to ONE table and "records_new" must mean
 *                       the upsert's inserts, never the primary-clear's rewrites (LG-5)
 *   · ctx.gate        — the tri-state mode decision and the reason it resolved that way
 *   · ctx.prior       — the prior COMPLETED run's records_meta, i.e. this step's own
 *                       baseline (the two gate fields are self-consumed)
 *   · ctx.overrides   — the resolved override.force_full flag
 *   · ctx.config      — the seven declared logic variables, resolved and bounds-checked
 *                       before this file runs, frozen, projected to the declared names
 *
 * ⚠️ THERE IS NO SECOND CODE PATH (A-8 OVERRIDE, operator ruling 2026-08-27). The
 * pre-conversion step answered a missing PostGIS extension with an entire alternative
 * implementation — an in-memory grid, haversine distance, a Mercator auto-detect
 * reprojection, turf point-in-polygon, a different batch size, its own copies of the
 * confidence literals and NO primary-clear before the upsert. Every recorded run took
 * the PostGIS branch (buildings_indexed = 0, grid_cells = "N/A (PostGIS)" on all of
 * them), so it was a never-executed duplicate of the contract, and it carried the
 * §1.6 silent swallow this step is named for: an invalid geometry in the
 * point-in-polygon test was caught, logged and the parcel silently reclassified as
 * no-match with NO counter. It is knowingly retired. Its replacement is a fail-loud
 * guards.requires precondition on the extension — a step that cannot do the work now
 * says so instead of quietly doing different work.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE. The pre-conversion file carried its own
 * three-way cascade over a hand-built row array; it is retired to
 * scripts/lib/step/verdict.js deriveVerdict, which reads it off the rows. A step that
 * decides its own outcome can disagree with its own audit table.
 *
 * ⚠️ THE COUNTERS ARE NOT ASSIGNED HERE either. They are resolved by the runner from
 * the descriptor's counters[].source against written.e2 (D-8). Pre-conversion the "new"
 * counter was the literal 0 — a guarded upsert's rowCount cannot separate an insert
 * from an update, so the number was not a measurement at all.
 */
'use strict';

const { safeParseFloat } = require('../safe-math');

/**
 * WGS84 metres-per-degree at Toronto's latitude, used ONLY to widen the nearest
 * fallback's bounding-box prefilter into degree space. It over-covers east-west on
 * purpose: the prefilter must be a superset of the true distance cut, and the exact cut
 * is the geography ST_DWithin that follows it. Changing this number changes what "50 m"
 * COSTS to find, never how much of it is accepted — which is why it is a structural
 * constant and not an operator knob. Precedent: the same divisor in enrich-parcels, and
 * tasks/lessons.md records what happens without the prefilter at all.
 */
const DEGREES_PER_METRE_DIVISOR = 78000.0;

/** Display precision for the ratio values in the audit rows; compared against nothing. */
const ROUND_SCALE = 10000;

/**
 * THE ELIGIBILITY PREDICATE — which parcels this step is allowed to link at all.
 *
 * `centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL` is a compute_centroids
 * PRECONDITION (B-2): with NULL centroids the work set is empty and the run silently
 * succeeds, which is why guards.empty_source and a declared eligible count exist.
 *
 * ⚠️ IT MUST DESCRIBE THE SAME SET AS THE E2 TARGET'S write_discipline.scope. That is
 * B-7 — "ONE DELETE, before the loop, in a transaction, scoped IDENTICALLY to the
 * parcels being re-evaluated" — and a retraction scope wider than the work set empties
 * the junction for parcels the run never revisits. They are two declarations in two
 * files; what proves they agree is the F3 fence lock, and the descriptor records the
 * coupling in limitations[].
 */
const PARCEL_ELIGIBILITY = 'centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL';

/**
 * The INCREMENTAL narrowing: parcels that carry no link at all.
 *
 * Note what it does NOT ask — whether an existing link is still correct. A parcel whose
 * centroid or boundary moved after it was linked is not re-evaluated by this filter;
 * only a full relink corrects it. Recorded in the descriptor's limitations[] against the
 * open review_followups finding that parcels.centroid_lat/lng has no invalidator.
 */
const UNLINKED_ONLY = 'NOT EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = parcels.id)';

// ===========================================================================
// A-2 option 2 — the SQL text builder. Pure: no pool, no client, no execution.
// ===========================================================================

/**
 * Every statement the LINK phase issues, as text, derived from the descriptor.
 *
 * ⚠️ TWO ORDERING PROPERTIES IN HERE ARE LOAD-BEARING AND BOTH ARE FENCED.
 *
 * B-9 — the nearest fallback runs only AFTER the centroid pass and only over the
 * batch's unmatched parcels. Reordering makes every parcel take the 0.60-confidence
 * path.
 *
 * B-10 — inside the fallback, the degree-span bbox prefilter (`bf.geom &&
 * ST_Expand(p.geom, $2)`) MUST precede the geography `ST_DWithin`. Without it the
 * distance predicate runs a nested loop over all 427,077 footprints per batch; that is
 * the failure tasks/lessons.md records, and fence d324ab27 is what put the bound in a
 * logic variable rather than a literal.
 *
 * ⚠️ LM-D13, PINNED VERBATIM (Fold C). The fallback's `ORDER BY p.id, ST_Distance(...)
 * ASC` has NO TIEBREAK, so which of two equidistant footprints `DISTINCT ON` keeps is
 * whatever the plan emitted first — 18,252 of the 103,530 nearest links can flip
 * between two otherwise identical full relinks. Adding `, bf.id ASC` fixes it in one
 * token and MOVES ROWS, which is exactly what a no-op conversion diff may not do. It is
 * reproduced as-is here and lands in peel 8b with its own before/after counts. The
 * consequence for the differential is declared: a FULL-path table hash is unstable by
 * pin, and only the incremental captures are compared for hash identity.
 *
 * @param {object} descriptor - the validated step descriptor
 * @param {Readonly<Record<string, number>>|null} [config] - ctx.config; null yields the
 *   statement TEXT with its placeholders and no bind values, which is what a shape test
 *   and a reviewer want
 * @param {'full'|'incremental'} [mode] - the resolved staleness mode
 */
function buildMatchSql(descriptor, config, mode) {
  const srid = descriptor.guards.srid;
  const eligible = mode === 'full'
    ? PARCEL_ELIGIBILITY
    : `${PARCEL_ELIGIBILITY} AND ${UNLINKED_ONLY}`;
  const cap = config ? config.massing_nearest_max_distance_m : null;
  const centroidConfidence = config ? config.link_massing_centroid_confidence : null;
  const nearestConfidence = config ? config.link_massing_nearest_confidence : null;
  return {
    eligible_count_sql:
      `SELECT COUNT(*) AS total FROM parcels WHERE ${eligible};`,
    eligible_batch_sql:
      'SELECT id FROM parcels\n'
      + ` WHERE ${eligible} AND id > $2\n`
      + ' ORDER BY id ASC\n'
      + ' LIMIT $1;',
    // Fence b16c036d. The BUILDING's centre of mass sits on the LOT — never the reverse:
    // a house covers ~35% of its lot, so the lot's own centroid usually lands in the
    // yard and the pre-flip predicate linked 58% of parcels where this one links 99.7%.
    // `bf.geom && p.geom` is the GiST bbox prefilter; ST_Contains is the exact test.
    // `p.geom IS NOT NULL` guards the ungeometried parcel that ST_Contains would return
    // NULL for and the join would silently drop anyway.
    primary_match_sql:
      'SELECT p.id AS parcel_id, bf.id AS building_id, bf.footprint_area_sqm\n'
      + '  FROM parcels p\n'
      + '  JOIN building_footprints bf\n'
      + '    ON bf.geom && p.geom\n'
      + `   AND ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(bf.centroid_lng, bf.centroid_lat), ${srid}))\n`
      + ' WHERE p.id = ANY($1::int[]) AND p.geom IS NOT NULL;',
    fallback_match_sql:
      'SELECT DISTINCT ON (p.id) p.id AS parcel_id, bf.id AS building_id, bf.footprint_area_sqm\n'
      + '  FROM parcels p\n'
      + '  JOIN building_footprints bf\n'
      + '    ON bf.geom && ST_Expand(p.geom, $2)\n'
      + '   AND ST_DWithin(p.geom::geography, bf.geom::geography, $3)\n'
      + ' WHERE p.id = ANY($1::int[]) AND p.geom IS NOT NULL\n'
      + ' ORDER BY p.id, ST_Distance(p.geom::geography, bf.geom::geography) ASC;',
    // ONE query for the link-rate pair AND the two junction invariants: the numerator
    // and denominator the rate is taken over, the exactly-one-primary law counted rather
    // than assumed from the partial unique index, and any confidence outside the two
    // declared values. Measured ~323 ms for the four scalars.
    cumulative_sql:
      'SELECT\n'
      + '  (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) AS linked,\n'
      + `  (SELECT COUNT(*) FROM parcels WHERE ${PARCEL_ELIGIBILITY}) AS total,\n`
      + '  (SELECT COUNT(*) FROM (\n'
      + '     SELECT parcel_id FROM parcel_buildings WHERE is_primary GROUP BY parcel_id HAVING COUNT(*) > 1\n'
      + '   ) m) AS multi_primary_parcels,\n'
      + '  (SELECT COUNT(*) FROM parcel_buildings WHERE confidence <> $1 AND confidence <> $2) AS confidence_off_domain;',
    cumulative_params: [centroidConfidence, nearestConfidence],
    // The names the two passes are counted under. Supplied BY THE STEP because they are
    // this step's match_type vocabulary — the runner may not spell a domain value, and a
    // counter named by the library would drift from the column it describes (claim #149).
    primary_counter: 'centroid_in_parcel',
    fallback_counter: 'nearest',
    // B-10's prefilter span, in degrees, and the metre cap it must over-cover.
    fallback_bbox_degrees: cap === null ? null : cap / DEGREES_PER_METRE_DIVISOR,
    fallback_max_distance: cap,
  };
}

// ===========================================================================
// Pure classifiers — ported VERBATIM from the pre-conversion PostGIS path
// ===========================================================================

/**
 * Area -> structure_type. Ported unchanged; src/tests/massing.logic.test.ts locks it.
 * The two thresholds are operator knobs (fence d324ab27 externalized them in 2026-04).
 */
function classifyStructure(areaSqm, allAreas, shedThreshold, garageMax) {
  if (allAreas.length <= 1) return 'primary';
  const maxArea = Math.max(...allAreas);
  if (areaSqm >= maxArea) return 'primary';
  if (areaSqm < shedThreshold) return 'shed';
  if (areaSqm <= garageMax) return 'garage';
  return 'other';
}

/**
 * The centroid-in-parcel match rows -> junction rows.
 *
 * ⚠️ THE SORT IS A FENCE (5bb31faf). Area DESC then building_id ASC is the SAME order
 * migration 081's repair used, and it is what makes the primary assignment
 * deterministic: without the id tiebreak, two buildings of equal area on one lot would
 * take turns being primary between runs. The second guard below is the other half —
 * classifyStructure returns 'primary' for EVERY building at the maximum area, so a tie
 * would produce two primaries and violate idx_parcel_buildings_one_primary; only the
 * first by the sort keeps it.
 */
function classifyMatches(matchRows, config) {
  const shedThresholdSqm = config.massing_shed_threshold_sqm;
  const garageMaxSqm = config.massing_garage_max_sqm;
  const confidence = config.link_massing_centroid_confidence;
  const byParcel = new Map();
  for (const r of matchRows) {
    const pid = r.parcel_id;
    if (!byParcel.has(pid)) byParcel.set(pid, []);
    byParcel.get(pid).push({
      building_id: r.building_id,
      footprint_area_sqm: r.footprint_area_sqm != null ? safeParseFloat(r.footprint_area_sqm, 'footprint_area_sqm') : 0,
    });
  }
  const rows = [];
  for (const [parcelId, buildings] of byParcel) {
    buildings.sort((a, b) => b.footprint_area_sqm - a.footprint_area_sqm || a.building_id - b.building_id);
    const allAreas = buildings.map((b) => b.footprint_area_sqm);
    const primaryBuildingId = buildings[0].building_id;
    for (const b of buildings) {
      let structureType = classifyStructure(b.footprint_area_sqm, allAreas, shedThresholdSqm, garageMaxSqm);
      if (structureType === 'primary' && b.building_id !== primaryBuildingId) {
        structureType = b.footprint_area_sqm <= garageMaxSqm ? 'garage' : 'other';
      }
      rows.push({
        parcel_id: parcelId,
        building_id: b.building_id,
        is_primary: structureType === 'primary',
        structure_type: structureType,
        match_type: 'centroid_in_parcel',
        confidence,
      });
    }
  }
  return { rows, parcels: byParcel.size, matches: rows.length };
}

/**
 * The nearest-fallback rows -> junction rows.
 *
 * ONE nearest building per parcel, so it is always the primary: these parcels had no
 * building centroid on them at all, and either the full-mode retraction or the
 * unlinked-only incremental filter guarantees no pre-existing primary to collide with.
 */
function classifyFallback(fallbackRows, config) {
  const confidence = config.link_massing_nearest_confidence;
  const rows = fallbackRows.map((r) => ({
    parcel_id: r.parcel_id,
    building_id: r.building_id,
    is_primary: true,
    structure_type: 'primary',
    match_type: 'nearest',
    confidence,
  }));
  return { rows, parcels: rows.length };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

function building_footprints_count(ctx) {
  ctx.report('building_footprints_count', { violations: 0, detail: ctx.matched.building_footprints_count });
}

function full_mode_gate(ctx) {
  const g = ctx.gate || {};
  ctx.report('full_mode_gate', {
    violations: 0,
    detail: { mode: g.mode, reason: g.reason, explicit_full: g.explicit_full === true },
  });
}

function structure_thresholds(ctx) {
  ctx.report('structure_thresholds', {
    violations: 0,
    detail: {
      shed_below_sqm: ctx.config.massing_shed_threshold_sqm,
      garage_max_sqm: ctx.config.massing_garage_max_sqm,
    },
  });
}

function override_force_full_present(ctx) {
  const standing = ctx.overrides.force_full === true;
  ctx.report('override_force_full_present', { violations: standing ? 1 : 0, detail: standing });
}

/**
 * D-20, at `when: "pre_write"`. The only check whose FAIL must stop a statement being
 * issued: the very next thing the runner does is the full-mode retraction, and against
 * an empty upstream corpus that deletes every link and rebuilds nothing.
 */
function empty_source_guard(ctx) {
  const corpus = ctx.matched.building_footprints_count;
  ctx.report('empty_source_guard', { violations: corpus > 0 ? 0 : 1, detail: corpus });
}

function parcels_processed(ctx) {
  ctx.report('parcels_processed', { violations: 0, detail: ctx.matched.parcels_processed });
}

function run_matched(ctx) {
  ctx.report('run_matched', { violations: 0, detail: ctx.matched.parcels_linked });
}

function match_centroid_in_parcel(ctx) {
  ctx.report('match_centroid_in_parcel', { violations: 0, detail: ctx.matched.centroid_in_parcel });
}

function match_nearest_fallback(ctx) {
  ctx.report('match_nearest_fallback', {
    violations: 0,
    detail: { links: ctx.matched.nearest, max_distance_m: ctx.config.massing_nearest_max_distance_m },
  });
}

function no_match(ctx) {
  ctx.report('no_match', { violations: 0, detail: ctx.matched.no_match });
}

function parcel_buildings_written(ctx) {
  ctx.report('parcel_buildings_written', { violations: 0, detail: upsert(ctx).rows_changed });
}

/**
 * THE VERDICT BOUND, and the reason it reports the COMPLEMENT.
 *
 * The declared limit forms are upper bounds (`pct <= n`), so a FLOOR on the link rate is
 * expressed as a CEILING on the unlinked fraction: `unlinked <= 50` is exactly
 * `link_rate >= 50`, the bound the pre-conversion literal encoded. The readable rate
 * travels in the row's detail, so nothing is hidden by the algebra — and the threshold
 * column now renders the operator-editable value in force rather than a literal that had
 * already been duplicated once into a render string.
 *
 * CUMULATIVE, never run-scoped: in incremental mode the unlinked pool is parcels that
 * are permanently unmatchable, so a run-scoped rate reads 0% on a perfectly healthy run.
 */
function link_rate(ctx) {
  const c = ctx.cumulative || {};
  const total = c.parcels_with_centroid;
  const linked = c.linked_parcels;
  const rate = total > 0 ? (linked / total) * 100 : 0;
  const unlinked = total > 0 ? 100 - rate : 100;
  ctx.report('link_rate', {
    value: unlinked,
    detail: {
      link_rate_pct: round(rate),
      unlinked_pct: round(unlinked),
      linked_parcels: linked,
      parcels_with_centroid: total,
    },
  });
}

/** Invariant (1), BY COUNT — a constraint proves nothing about a path that never reached it. */
function multi_primary_parcels(ctx) {
  const n = ctx.matched.multi_primary_parcels;
  ctx.report('multi_primary_parcels', { violations: n, detail: n });
}

/** Invariant (4). The column's own numeric(3,2) type will not reject a value the step never meant. */
function confidence_vocabulary(ctx) {
  const n = ctx.matched.confidence_off_domain;
  ctx.report('confidence_vocabulary', {
    violations: n,
    detail: {
      off_domain: n,
      domain: [ctx.config.link_massing_centroid_confidence, ctx.config.link_massing_nearest_confidence],
    },
  });
}

/** The post-write half of D-20: retracted and NOT rebuilt is the shape of a broken run. */
function mass_retraction_ratio(ctx) {
  const w = upsert(ctx);
  const retracted = w.retracted || 0;
  const rebuilt = w.inserted || 0;
  const ratio = retracted > 0 ? Math.max(0, retracted - rebuilt) / retracted : 0;
  ctx.report('mass_retraction_ratio', {
    value: ratio,
    detail: { retracted, rebuilt, unrestored_ratio: round(ratio) },
  });
}

/** The live D-5 canary: if the run clock ever reaches the change guard this pins at 1.0. */
function rows_changed_ratio(ctx) {
  const w = upsert(ctx);
  const scanned = w.scanned || 0;
  const ratio = scanned > 0 ? (w.rows_changed || 0) / scanned : 0;
  ctx.report('rows_changed_ratio', {
    value: ratio,
    detail: { scanned, changed: w.rows_changed || 0, ratio: round(ratio) },
  });
}

function write_privilege(ctx) {
  const p = (ctx.written && ctx.written.privilege) || null;
  const writable = Boolean(p && (p.rls_enabled === false || p.bypassrls === true || p.policies > 0));
  ctx.report('write_privilege', {
    violations: writable ? 0 : 1,
    detail: p ? `bypassrls=${p.bypassrls === true} policies=${p.policies}` : 'not measured',
  });
}

// ---- helpers ----

/**
 * The UPSERT target's counters, by declared position: `written.e2` is
 * `outputs.writes[1]`, the guarded upsert. `written.e1` is the primary clear, and its
 * rows are deliberately excluded from everything reported as a write — a clear that
 * rewrites a flag and immediately has it rewritten back is not a record the step
 * produced (D-8 / LG-5).
 */
function upsert(ctx) {
  return (ctx.written && ctx.written.e2) || {};
}

function round(n) {
  return Math.round(n * ROUND_SCALE) / ROUND_SCALE;
}

/**
 * The step's `records_meta` block, byte-shaped like the pre-conversion one.
 *
 * ⚠️ TWO OF THESE FIELDS ARE A SELF-CONSUMED PRODUCER CONTRACT. `code_version` and
 * `building_footprints_count` are read back by THIS STEP'S NEXT RUN to decide
 * full-vs-incremental, and `building_footprints_count` is a STRING ("427077") because
 * the reader compares String(prevCount) — changing the type would silently make every
 * comparison unequal and force a 21.9-minute relink on every run.
 */
function buildLinkMeta(ctx) {
  const m = ctx.matched;
  const w = upsert(ctx);
  const g = ctx.gate || {};
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
    building_footprints_count: String(m.building_footprints_count),
    full_mode: g.mode === 'full',
    full_mode_reason: g.reason,
    parcels_processed: m.parcels_processed,
    parcels_linked: m.parcels_linked,
    buildings_matched: m.centroid_in_parcel + m.nearest,
    buildings_upserted: w.rows_changed || 0,
    matches_centroid_in_parcel: m.centroid_in_parcel,
    matches_nearest: m.nearest,
    no_match_count: m.no_match,
  };
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  building_footprints_count,
  full_mode_gate,
  structure_thresholds,
  override_force_full_present,
  empty_source_guard,
  parcels_processed,
  run_matched,
  match_centroid_in_parcel,
  match_nearest_fallback,
  no_match,
  parcel_buildings_written,
  link_rate,
  multi_primary_parcels,
  confidence_vocabulary,
  mass_retraction_ratio,
  rows_changed_ratio,
  write_privilege,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * ⚠️ CALLED TWICE ON A WRITING RUN. The runner invokes this once with `ctx.checks`
 * narrowed to the `when: "pre_write"` ids (to decide whether the retraction may happen
 * at all) and once with the full selection afterwards. Nothing here changes between the
 * two, because the loop is already scoped to `ctx.checks` — what the position relies on
 * is that a pre_write observer is a pure function of what has been MEASURED before any
 * write, which the write does not touch.
 *
 * The loop is the error boundary: whatever an observer throws becomes `{ error }` under
 * that observer's own id, so one failure never suppresses the observers after it and
 * never lands on another check's row.
 */
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
  // No join result means the run stopped before it produced one (a pre_write refusal, or
  // a shape the library does not drive). Building a half-populated block here would
  // publish zeroes as if they had been measured — and two of these fields are the NEXT
  // run's gate baseline.
  if (!ctx.matched || !ctx.cumulative) return { records_meta: {} };
  return { records_meta: buildLinkMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// A-2 option 2: the SQL text builder the library executes.
module.exports.buildMatchSql = buildMatchSql;
// The pure classifiers the LINK phase calls between the match and the write.
module.exports.classifyStructure = classifyStructure;
module.exports.classifyMatches = classifyMatches;
module.exports.classifyFallback = classifyFallback;
module.exports.buildLinkMeta = buildLinkMeta;
// Structural constants, exported so their locks read the real value rather than a copy.
module.exports.DEGREES_PER_METRE_DIVISOR = DEGREES_PER_METRE_DIVISOR;
module.exports.PARCEL_ELIGIBILITY = PARCEL_ELIGIBILITY;
module.exports.UNLINKED_ONLY = UNLINKED_ONLY;
