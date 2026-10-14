'use strict';
/**
 * COMPUTE for `enrich_ravines` (Spec 122 §5.5; batch-2 row 2.1).
 *
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9, §11.1
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §11 (Counter Semantic Contract)
 *
 * Rule 2 — COMPUTE IS JUST COMPUTE. No pool creation outside the declared hooks the runner
 * calls, no logging, no `process.env`, no wall clock, no verdict derivation, no thresholds.
 * Every number this module produces is MEASURED; every judgement about it is made by the
 * library from the descriptor.
 *
 * ONE PHASE, ONE STATEMENT (`execution.phases` has exactly one entry, `ravine_join`, inside
 * the shared transaction). Spatial-joins parcels.geom against ravines and writes the
 * Chapter-658 flag + signed nearest-ravine distance + dataset lineage stamp, scoped to
 * geom-bearing parcels whose lineage stamp is stale against the producer's current
 * source_dataset_version (#418 Layer-2). The pre-conversion #418 Layer-1 cheap-COUNT early
 * return is RETIRED as a mechanism (deviations[] in the descriptor) — the ENRICHER runner has
 * no gated-skip branch, and the Layer-2 scope predicate already makes a zero-stale run a
 * 0-row write.
 */

// ===========================================================================
// §9/L18 consumer protocol — the pre-transaction HALT, resolved as
// `execution.enrich_hooks.contract_read`. Called by the runner ABOVE the phase loop, before
// any transaction opens, on the step's own pool (not a txn client).
//
// RV-L2 (descriptor limitations[]): guards.srid / guards.empty_source are declarative only —
// the runner has zero consumers for either field (measured, 2026-09-18). Because the legacy
// L14 (ravines must be non-empty) and SRID=4326 behaviours genuinely HALT rather than merely
// report, both are folded into THIS hook — the one mechanism proven to run pre-transaction on
// every invocation — rather than left as decorative descriptor fields with no enforcement.
// ===========================================================================

const PRODUCER_NAME = 'sources:load_ravines';
// Must equal staleness.pins[].step in the descriptor (locked by src/tests/enrich-ravines-pins.logic.test.ts).
const PRODUCER_STEP = 'load_ravines';
const TAG = '[enrich_ravines]';

/**
 * F1 (00902695) — the §9/L18 producer-protocol consumer. The producer-protocol HALTs are
 * descriptor pins (S1-P-6): producer missing, spec-version mismatch, the orphan-prune-suppression flag,
 * drift/mass-delete check failure, the invalid-geometry ratio bound (its 5% now the declared
 * logic variable enrich_ravines_producer_invalid_geom_max_pct) and an empty/missing
 * source_dataset_version are DECLARED `staleness.pins[]` rows on this step's descriptor,
 * evaluated by the runner BEFORE any phase or hook (Rule 10 — a violation is a FAIL row, never
 * a throw). A violated pin never reaches this function.
 *
 * F2 (92ee03b9, Gemini CRIT-1) — L14: a wiped ravines table must HALT even when matching
 * version stamps would otherwise satisfy the #418 skip. Enforced by the declared
 * guards.empty_source (runner, before this hook; S4 — measured pre-phase for non-INGESTOR
 * steps), not folded in here.
 *
 * F3 (00902695, DEC-F §3.10) half — the SRID=4326 assertion. The three GIST-index /
 * PostGIS-extension / migration-168-column halves of F3/F4 are declared via `guards.requires`
 * instead (REQUIREMENT_PROBES has no "srid" kind, so this one clause cannot move there).
 * @param {{pool: import('pg').Pool, config: object, producer: (slug: string, opts?: object) => Promise<object>}} ctx
 */
async function readRavineContract(ctx) {
  const pool = ctx.pool;
  // Producer contract (the spec-version stamp, the guard/drift flags, the invalid-geometry ratio and the
  // lineage stamp) is DECLARED in the descriptor's staleness.pins[] and evaluated by the runner
  // BEFORE this hook (Rule 10); a violated pin never reaches here. The hook only READS the
  // already-qualified run — no defaults, no guard: a missing key must crash loudly, never stamp
  // garbage.
  const run = await ctx.producer(PRODUCER_STEP);
  const rl = run.records_meta.ravine_load;

  // L14 — ravines non-empty: enforced by the declared guards.empty_source (runner, before this hook; S4).

  // §3.10 SRID guard — parcels.geom must be 4326 (no ST_Transform path in this compute).
  const srid = await pool.query("SELECT Find_SRID('public', 'parcels', 'geom') AS srid");
  if (Number(srid.rows[0].srid) !== 4326) {
    throw new Error(`${TAG} parcels.geom SRID is ${srid.rows[0].srid}, expected 4326`);
  }

  return { sourceDatasetVersion: rl.source_dataset_version };
}

// ===========================================================================
// PHASE — `ravine_join`. Class N (`set_based_join_update`), executed through `ctx.joinUpdate`,
// whose executor structurally refuses any statement text containing INSERT INTO / ON CONFLICT.
// ===========================================================================

/**
 * §11.1 set-based UPDATE, PORTED VERBATIM (F5 — the materialized-centroid LATERAL KNN
 * rewrite, NOT the Spec 59 §11.1 code block's inline-centroid form, which defeats the
 * geography GIST index and seq-scans ~415M distance calcs; review_followups #413, spec
 * corrected at cutover). `$1` = source_dataset_version.
 *
 * #418 Layer-2 scoping: `parcel_c` is restricted to geom-bearing parcels that are STALE
 * against this exact ravines version. The inner IS DISTINCT FROM triple guard (§8d no-op-write
 * fence) is KEPT — it is what makes a second run against an unchanged ravines version write 0
 * rows, since the Layer-1 early-return mechanism itself is retired (deviations[]).
 */
const ENRICH_SQL = `
WITH parcel_c AS MATERIALIZED (
  SELECT p.id AS parcel_id, p.geom, ST_Centroid(p.geom)::geography AS cg
    FROM parcels p
   WHERE p.geom IS NOT NULL
     AND p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1   -- #418 stale-only scope
),
enrichment AS (
  SELECT
    pc.parcel_id,
    ex.new_in_ravine,
    nn.dist * CASE WHEN ex.new_in_ravine THEN -1 ELSE 1 END AS new_distance_m
  FROM parcel_c pc
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM ravines r WHERE ST_Intersects(pc.geom, r.geom)) AS new_in_ravine
  ) ex
  LEFT JOIN LATERAL (
    SELECT ST_Distance(pc.cg, r.geom::geography) AS dist
      FROM ravines r
  ORDER BY pc.cg <-> r.geom::geography      -- binds idx_ravines_geog_gist (cg is a per-row constant)
     LIMIT 1
  ) nn ON true
)
UPDATE parcels p
   SET is_in_ravine_protection_area         = e.new_in_ravine,
       ravine_distance_m                    = e.new_distance_m,
       ravine_dataset_version_when_enriched = $1
  FROM enrichment e
 WHERE p.id = e.parcel_id
   AND (p.is_in_ravine_protection_area IS DISTINCT FROM e.new_in_ravine
        OR p.ravine_distance_m            IS DISTINCT FROM e.new_distance_m
        OR p.ravine_dataset_version_when_enriched IS DISTINCT FROM $1);
`;

/**
 * Phase `ravine_join`, `writes_ref` 0, inside the shared transaction.
 *
 * `ctx.contract` is the object `readRavineContract` returned (Ask A2 (a): one additive
 * `passCtx.contract` line in `runEnrichPhase`, `scripts/lib/step/index.js`) — the seam that
 * lets `sourceDatasetVersion` reach the write, since the runner otherwise calls the
 * `contract_read` hook only for its `staleOverlays` side effect and discards the rest.
 *
 * The returned key name is `updated`, same as any other pass — `ctx.joinUpdate` is this
 * target's counter of record (RV-D4, WF3, 2026-09-20: the runner's own reconciliation loop
 * in `scripts/lib/step/index.js` now owns `written[key].updated`/`rows_changed` by SEAM USE,
 * not by the pass's return-key spelling, so no key-name workaround is needed here any more;
 * lock tests `src/tests/step-library.logic.test.ts` M1e–M1h).
 */
async function runRavineJoinPass(client, ctx) {
  const sourceDatasetVersion = ctx.contract.sourceDatasetVersion;
  const updated = await ctx.joinUpdate(0, ENRICH_SQL, [sourceDatasetVersion]);
  ctx.onProgress(updated);
  return { updated, sourceDatasetVersion };
}

// ===========================================================================
// STEP-LEVEL POST PHASE — `execution.enrich_hooks.post_phase`. Called ONCE by the runner,
// after the last phase and after COMMIT, on the step's own pool.
// ===========================================================================

/**
 * Coverage stats + audit-row source, re-queried LIVE on every call (F7 — Regression Guardian:
 * "so a pre-existing partial-coverage hole stays visible even when this run's write is empty";
 * Integration BUG: "the dashboard step is never UNKNOWN"). Ported verbatim from the legacy
 * `emitResults`'s coverage query.
 */
const COVERAGE_SQL = `
    SELECT
      COUNT(*) FILTER (WHERE geom IS NOT NULL)                                          AS geom_total,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND ravine_distance_m IS NOT NULL)         AS with_distance,
      COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                               AS in_ravine,
      COUNT(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))                  AS invalid_geom
    FROM parcels`;

/**
 * `matched` carries one entry per declared check id (§5.5 (1)) plus the raw scan population.
 * `compute` carries the three counter sources — `matched.compute.*` / `written.e1.*`, never a
 * bare `compute.*` (the ENRICHER null-counter trap, filed HIGH 2026-09-16 against enrich_parcels).
 */
async function computePostPhase(pool, { passRaw }) {
  const join = passRaw.ravine_join || {};
  const updated = Number(join.updated || 0);
  const sourceDatasetVersion = join.sourceDatasetVersion;

  const cov = await pool.query(COVERAGE_SQL);
  const c = cov.rows[0];
  const geomTotal = Number(c.geom_total);
  const withDistance = Number(c.with_distance);
  const inRavine = Number(c.in_ravine);
  const invalidGeom = Number(c.invalid_geom);
  const distancePct = geomTotal ? Math.round((1000 * withDistance) / geomTotal) / 10 : 0;

  // #418 — F9: the Layer-1 skip BRANCH is retired; its OBSERVABLE is re-derived from the
  // scope count instead of a skip decision the runner never makes for this shape. A run whose
  // scope was empty (updated === 0 against a non-zero geom population) reads skipped:true,
  // identically to the legacy's skip-path audit row.
  const skipped = updated === 0;

  return {
    matched: {
      geom_bearing_parcels_scanned: geomTotal,
      parcels_with_ravine_distance_pct: distancePct,
      parcels_in_ravine_count: inRavine,
      parcels_invalid_geom_count: invalidGeom,
      parcels_enriched_count: updated,
      parcels_ravine_enrich_skipped: skipped,
      ravine_source_dataset_version: sourceDatasetVersion,
    },
    compute: {
      // records_total's source (A4 ruling — the scanned population, not the legacy's null).
      geom_bearing_parcels_scanned: geomTotal,
      // Structurally 0: class N's executor refuses INSERT INTO / ON CONFLICT text, so this
      // step cannot create a `parcels` row. Declared as a finite literal rather than omitted,
      // because an omitted source resolves null and null reads as "not counted" (Spec 48 §3.6).
      records_new_aggregate: 0,
      records_updated_aggregate: updated,
    },
  };
}

// ===========================================================================
// Checks — one function per declared check, keys === descriptor.checks[].id in declaration
// order. Each reads `ctx.matched.<id>` and reports; none judges.
// ===========================================================================

/** R-AD 3-tier: PASS >=95 / WARN >=90 / else FAIL, resolved by the library from `ctx.matched`'s reported ratio. */
function parcels_with_ravine_distance_pct(ctx) {
  ctx.report('parcels_with_ravine_distance_pct', { value: ctx.matched.parcels_with_ravine_distance_pct });
}

function parcels_in_ravine_count(ctx) {
  ctx.report('parcels_in_ravine_count', { violations: 0, detail: ctx.matched.parcels_in_ravine_count });
}

/** Root-cause signal for any distance-coverage drop (Gemini/DeepSeek MED). */
function parcels_invalid_geom_count(ctx) {
  ctx.report('parcels_invalid_geom_count', { violations: 0, detail: ctx.matched.parcels_invalid_geom_count });
}

function parcels_enriched_count(ctx) {
  ctx.report('parcels_enriched_count', { violations: 0, detail: ctx.matched.parcels_enriched_count });
}

/** F9 — re-derived from the scope count, since the Layer-1 skip branch itself is retired. */
function parcels_ravine_enrich_skipped(ctx) {
  ctx.report('parcels_ravine_enrich_skipped', { violations: 0, detail: ctx.matched.parcels_ravine_enrich_skipped });
}

/** RV-D3 — a STRING value, unlike every sibling row on this step. */
function ravine_source_dataset_version(ctx) {
  ctx.report('ravine_source_dataset_version', { violations: 0, detail: ctx.matched.ravine_source_dataset_version });
}

function enrich_ravines_duration_ms(ctx) {
  ctx.report('enrich_ravines_duration_ms', { violations: 0, detail: ctx.elapsed_ms });
}

const CHECKS = {
  parcels_with_ravine_distance_pct,
  parcels_in_ravine_count,
  parcels_invalid_geom_count,
  parcels_enriched_count,
  parcels_ravine_enrich_skipped,
  ravine_source_dataset_version,
  enrich_ravines_duration_ms,
  // Note: `ravine_distance_m_min_magnitude_observed` / `_max_observed` /
  // `ravine_dataset_version_distinct_count` (F-RC1) are declared in
  // descriptor.plausibility[], not checks[] — they are executed generically by
  // scripts/lib/step/plausibility.js#runValidatorEntries against their own declared
  // `sql`, never through this dispatch table.
};

// ===========================================================================
// records_meta
// ===========================================================================

/** The step's `records_meta` block — matches the two `emits[]`-declared extra keys exactly. */
function buildRavineMeta(ctx) {
  return {
    duration_ms: ctx.elapsed_ms,
    code_version: ctx.descriptor.staleness.logic_version,
  };
}

/** §5.5 (2) — run the SELECTED checks, and nothing else. */
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
  if (!ctx.matched) return { records_meta: {} };
  return { records_meta: buildRavineMeta(ctx) };
}

// The declared phase order — names MUST match `execution.phases[].name`, in order.
const passes = [
  { name: 'ravine_join', txn: 'shared', run: runRavineJoinPass },
];

module.exports = Object.assign(compute, {
  checks: CHECKS,
  ENRICH_SQL,
  COVERAGE_SQL,
  readRavineContract,
  runRavineJoinPass,
  computePostPhase,
  buildRavineMeta,
  passes,
  PRODUCER_NAME,
});
