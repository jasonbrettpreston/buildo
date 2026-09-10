/**
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (ENRICHER), §5.5 (seams)
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2/§3/§4/§5/§6/§7 (governing behaviour, passes 1-3)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §P2/§P3A.1/§P3C.1/§P3C.2 (passes 4-5)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute is JUST compute, Rule 3 P4
 *   externalization, §5.5 seam list)
 *
 * Pilot 9 commit 7c — enrich_parcels compute port. Ports the 5 SQL/JS passes of the legacy
 * scripts/enrich-parcels.js (2,391 lines) BYTE-VERBATIM, with ONLY the seam substitutions Fold G3/E7
 * and this commit's own task ruling name:
 *
 *   1. `now()::date - interval '5 years'` (pass 4's comps window, legacy :1114) -> a BOUND `$N::date`
 *      parameter, sourced from `ctx.clock.asOfDate()` (never a bare `now()`/`Date.now()`/`new Date()`
 *      inside this file — Spec 122 §5.5). The `5 years` half becomes a separate config read
 *      (`enrich_parcels_comps_window_years`), interpolated the SAME way every other pre-existing P4
 *      tunable already was (Number()-coerced, then embedded as a SQL literal — never bound).
 *   2. The 11 previously-undeclared literals (Ask 5, EP-D2) -> `config.<name>` reads, exact names
 *      matching `scripts/enrich-parcels.descriptor.json#config.logic_variables[]` and
 *      `scripts/seeds/logic_variables.json`. Values equal the legacy constants (locked in
 *      `src/tests/steps/enrich_parcels/compute-config.logic.test.ts`).
 *   3. `pipeline.log.*` -> `ctx.log.*`.
 *   4. `process.env` (legacy :1876, ENRICH_PARCELS_FORCE_FULL) -> REMOVED. Full/incremental mode is an
 *      argv/env decision the runner (runEnrichPhase, forked per Ask 1, commit 7d) resolves BEFORE calling any pass
 *      — this file only ever reads `ctx.full` (a boolean already resolved for it).
 *   5. Transaction open/commit, advisory lock, `SET LOCAL statement_timeout`/`lock_timeout`,
 *      `recordHeartbeat`/`captureStallDiagnostic`/`startStallTicker`, and pass-duration timing all move
 *      to `runEnrichPhase` (commit 7d) — NONE of that lives here. Passes 1-4 receive an already-open
 *      transactional `client`; pass 5 receives the post-commit connection the runner hands it (this
 *      file treats both identically as a query-capable `client` — it never opens/closes anything).
 *
 * WHAT THIS FILE DOES NOT DO (explicitly, nothing-hidden): it does not acquire the advisory lock, does
 * not open/commit any transaction, does not resolve --full/--dry-run from argv, does not read
 * `logic_variables` from the DB (the runner resolves + Zod-validates `config` before calling any pass),
 * does not check PostGIS/GiST-index preconditions itself — the legacy `assertPreconditions` is NOT
 * ported (R-W: a compute may not branch on PostGIS availability); the descriptor's own declarative
 * `guards.requires` is the ONLY legal form and the runner enforces it generically. Does not build the
 * `audit_table`/derive the verdict itself — `compute(ctx)`'s own `ctx.report(id, observation)` calls
 * (below) are the ONLY audit-emission surface this file uses; the runner's own generic
 * `scripts/lib/step/verdict.js#deriveVerdict` (Rule 10) assembles `ctx.report`'s accumulated
 * observations into rows and derives the verdict, exactly as it does for every other converted step
 * — there is no separate, ENRICHER-specific verdict path here (EP-D3, `docs/reports/defect-ledger.md`,
 * CLOSED: the legacy script's own hand-rolled `verdictCascade` was never ported — it simply does not
 * exist in this file, confirmed by a repo-wide grep — so there was never anything left to "wire up").
 * Also does not implement `computeAggregateRecordsUpdated`'s downstream consumption (kept here as a
 * pure helper — see below).
 *
 * THE ctx CONTRACT this file consumes (implemented by runEnrichPhase, LG-28, commit 7d,
 * `scripts/lib/step/index.js`):
 *   ctx.clock.asOfDate(): string   - YYYY-MM-DD, bound as the comps-window $N::date; the runner's own
 *                                     clock date (Fold G3). A config-driven override
 *                                     (enrich_parcels_comps_as_of_date) was declared at commit 7b and
 *                                     REMOVED at commit 7e/2 — resolveConfig's invalidReason
 *                                     (scripts/lib/step/config.js:76-81) is unconditionally numeric-only
 *                                     across every archetype, so a string/nullable override throws
 *                                     on_invalid:"fail" before any pass runs (discovered running this
 *                                     commit's own G2' golden capture). Fold G3 already flagged the
 *                                     override half as optional, not Rule-3-mandated; only that half
 *                                     was dropped — this seam itself (no bare now()::date literal) stays.
 *   ctx.clock.now(): Date          - the DB-facing RUN_AT, captured ONCE by the runner before pass 1
 *                                     begins and held STABLE for the whole phase invocation (mirrors
 *                                     the `const runAt = clockNow;` convention every other runner in
 *                                     scripts/lib/step/index.js already uses) — never a bare
 *                                     `Date.now()`/`new Date()` call inside this file.
 *   ctx.log.{info,warn,error}(tag, msg) - replaces pipeline.log.*.
 *   ctx.full: boolean              - --full vs incremental, already resolved by the runner.
 *   ctx.scopeWhere: string         - trusted internal/test predicate over alias `p` ('TRUE' in prod).
 *   ctx.staleOverlays: Set<string> - Spec 58 §9/§11 consumer-protocol result (readZoningContract, below),
 *                                     computed once by the runner before pass 1 and handed to every pass
 *                                     that needs it (only pass 1 does).
 *   ctx.scopeRunId: number         - the D4' synthetic run id (Math.floor(runAt/1000)) the runner keys
 *                                     enrich_parcels_pass3_scope rows on; read only by pass 5.
 *   ctx.stream(sql, params, opts)  - pass 5 ONLY (post_commit phase): an async-iterable cursor over the
 *                                     SAME pinned session pass 5's own SET LOCAL statement_timeout binds
 *                                     to (Fold B2) — the runner's streamOverClient, backed by the same
 *                                     pg-query-stream primitive pipeline.streamQuery uses, never
 *                                     pipeline.streamQuery itself (Rule 2, no ../pipeline import here).
 *
 * KNOWN-DEFECT pins (Spec 123 §3.1 — see docs/reports/defect-ledger.md EP-D1/EP-D8/EP-D9/EP-D10),
 * status as of pilot 9 commit 8 P3 (2026-09-08): **EP-D1/B4.5's guard half — CLOSED** (peel 8x,
 * commit 8 P2): pass 4's comps UPDATE now guards `IS DISTINCT FROM` over all 5 comp columns (the
 * never-refresh `comp_count IS NULL` half remains PIN — Fold G4 ruling, spec-supported disclaimed
 * limitation, not reopened). **EP-D9 — CLOSED** (this commit, P3): both comps `ORDER BY` clauses now
 * carry a deterministic secondary tiebreak (`c.id` inner kNN, `near.id` outer rank). **EP-D10 —
 * CLOSED** (commit 8 P1): `enrich_parcels_pass3_scope`'s consumed rows are pruned at run end.
 * **EP-D8 — still OPEN, ported VERBATIM in its CURRENT WRONG FORM:** the generic-family comp-match
 * fallback carries no structure-scale/type filter — peel 8y (commit 8 P4) fixes it.
 */
'use strict';

const mb = require('../max-build');
const bn = require('../build-norms');
const optcfg = require('../optimal-config');
const {
  PRECEDENCE_RULES,
  AMBIGUOUS_DOMINANT_SHARE_MAX,
  DOMINANT_ORDER_BY,
  sqlAggregate,
} = require('../zoning-precedence');

const TAG = '[enrich-parcels]';

// ---------------------------------------------------------------------------
// Write-column arrays — verbatim from scripts/enrich-parcels.js :93-130
// ---------------------------------------------------------------------------
const BASE_SRC = {
  zoning_class: 'zn_zone',
  zoning_zn_string: 'zn_string',
  zoning_gen_zone: 'gen_zone',
  zoning_holding: 'zn_holding',
  zone_status: 'zone_status',
  exception_number: 'exception_number',
  exception_text: 'exception_text',
  bylaw_chapter: 'bylaw_chapter',
  bylaw_section: 'bylaw_section',
  bylaw_exception_ref: 'bylaw_exception_ref',
  bylaw_max_fsi: 'fsi_max',
  bylaw_max_units: 'units_max',
  bylaw_max_density: 'density_max',
  bylaw_pct_commercial_max: 'pct_commercial_max',
  bylaw_pct_residential_max: 'pct_residential_max',
  bylaw_pct_employment_max: 'pct_employment_max',
  bylaw_pct_office_max: 'pct_office_max',
  bylaw_min_frontage_m: 'frontage_min_m',
  bylaw_min_area_sqm: 'area_min_sqm',
  bylaw_standard_setback_m: 'standard_setback',
};
const OVERLAY_MIN_COLS = ['bylaw_max_coverage_pct', 'bylaw_max_height_m', 'bylaw_max_stories'];
const MEMBERSHIP_COLS = [
  'in_policy_area', 'on_policy_road', 'in_rooming_house_overlay', 'in_parking_zone_overlay',
  'in_building_setback_overlay', 'on_priority_retail', 'in_queenstw_eat_overlay',
];
const PROVENANCE_WRITE = [
  'zoning_overlays', 'zoning_base_source_id', 'zoning_dominant_area_share',
  'zoning_is_ambiguous', 'zoning_base_source_dataset_version',
];
const ALL_WRITE_COLS = [
  ...Object.keys(BASE_SRC), ...OVERLAY_MIN_COLS, ...MEMBERSHIP_COLS, ...PROVENANCE_WRITE,
];

const OVERLAY_LAYERS = [
  { key: 'height_overlay',           table: 'zoning_height_overlay',           kind: 'numeric' },
  { key: 'lot_coverage_overlay',     table: 'zoning_lot_coverage_overlay',     kind: 'numeric' },
  { key: 'policy_area_overlay',      table: 'zoning_policy_area_overlay',      kind: 'poly', col: 'in_policy_area' },
  { key: 'policy_road_overlay',      table: 'zoning_policy_road_overlay',      kind: 'line', col: 'on_policy_road' },
  { key: 'rooming_house_overlay',    table: 'zoning_rooming_house_overlay',    kind: 'poly', col: 'in_rooming_house_overlay' },
  { key: 'parking_zone_overlay',     table: 'zoning_parking_zone_overlay',     kind: 'poly', col: 'in_parking_zone_overlay' },
  { key: 'building_setback_overlay', table: 'zoning_building_setback_overlay', kind: 'poly', col: 'in_building_setback_overlay' },
  { key: 'priority_retail_overlay',  table: 'zoning_priority_retail_overlay',  kind: 'line', col: 'on_priority_retail' },
  { key: 'queenstw_eat_overlay',     table: 'zoning_queenstw_eat_overlay',     kind: 'poly', col: 'in_queenstw_eat_overlay' },
];

for (const c of Object.keys(BASE_SRC)) {
  if (!PRECEDENCE_RULES[c]) throw new Error(`${TAG} BASE_SRC column ${c} has no precedence rule`);
}

// ---------------------------------------------------------------------------
// Consumer-protocol read (Spec 58 §9/§11) — ported verbatim (no pipeline.* calls in the legacy version
// either). NOT invoked by the pass `run()` functions below — the RUNNER fetches it once (before pass 1)
// and hands the result to ctx (ctx.staleOverlays) — see the ctx contract above.
//
// R-W (Spec 124 §2 Rule 2 addendum) — the legacy `assertPreconditions` (its own `pg_extension WHERE
// extname='postgis'` + GiST-index probe) is DELIBERATELY NOT ported here: a compute may not branch on
// PostGIS availability (compute-shape.yml's `compute-no-postgis-branch` rule), and the descriptor's own
// declarative `guards.requires` (postgis extension, parcels.geom column, idx_parcels_geom_gist index —
// all `on_missing:"fail"`) is the ONLY legal form of this precondition. This is a port, not a
// retirement: the SAME two checks, enforced generically by the runner from `guards.requires` instead of
// a bespoke query embedded in domain logic.
// ---------------------------------------------------------------------------
const PRODUCER_NAME = 'sources:load_zoning'; // Spec 58 producer enrich_parcels consumes (§9)

async function readZoningContract(pool) {
  const latest = await pool.query(
    `SELECT status, records_meta FROM pipeline_runs WHERE pipeline = $1 ORDER BY started_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (latest.rows.length && latest.rows[0].status === 'failed') {
    throw new Error(`${TAG} latest ${PRODUCER_NAME} run FAILED — halting (will not enrich against stale zoning)`);
  }
  const withMeta = await pool.query(
    `SELECT records_meta FROM pipeline_runs
      WHERE pipeline = $1 AND status = 'completed'
        AND jsonb_typeof(records_meta -> 'zoning_layers_loaded') = 'object'
      ORDER BY started_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (withMeta.rows.length === 0) {
    throw new Error(`${TAG} no successful ${PRODUCER_NAME} run with zoning_layers_loaded — zoning pipeline not initialised`);
  }
  const meta = withMeta.rows[0].records_meta || {};
  const layers = meta.zoning_layers_loaded || {};
  if (layers.base !== true) {
    throw new Error(`${TAG} ${PRODUCER_NAME}.zoning_layers_loaded.base !== true — base zoning missing, cannot enrich`);
  }
  return {
    layers,
    partial: meta.zoning_partial_load || false,
    baseCommittedAfterOverlayFailed: meta.base_layer_committed_after_overlays_failed === true,
  };
}

// ===========================================================================
// PASS 1 — zoning (Spec 65 §2). Verbatim from scripts/enrich-parcels.js :210-458.
// ===========================================================================

function buildPass1ScopeWhere({ full = false } = {}) {
  if (full) return 'TRUE';
  return `(p.zoning_enriched_at IS NULL OR EXISTS (
         SELECT 1 FROM zoning_bylaw_areas zv
         WHERE zv.geom && p.geom AND ST_Intersects(p.geom, zv.geom)
           AND zv.source_dataset_version > p.zoning_enriched_at))`;
}

/**
 * SECURITY — scopeWhere is interpolated verbatim into the SQL. It MUST come from trusted code only
 * (the runner passes the literal 'TRUE'; tests pass literal predicates). NEVER pass user/request-derived
 * input here — it would be a SQL-injection vector.
 * @param {{scopeWhere?: string, full?: boolean, staleOverlays?: Set<string>, bboxDivisor: number}} opts
 */
function buildEnrichmentSql({ scopeWhere = 'TRUE', full = false, staleOverlays = new Set(), bboxDivisor }) {
  const incremental = buildPass1ScopeWhere({ full });

  const baseAgg = Object.entries(BASE_SRC)
    .map(([col, src]) => `      ${sqlAggregate(col, src)} AS ${col}`)
    .join(',\n');

  // Membership overlays — set-based DISTINCT join CTEs (one GIST spatial join each), NOT per-parcel
  // correlated EXISTS (O(parcels), does not scale to 486K — tasks/lessons.md:33). Polygon overlays use
  // ST_Intersects + NOT ST_Touches. LineString overlays use a geometry-bbox prefilter on the GiST index
  // before the exact ::geography ST_DWithin. The bbox is expanded by metres/bboxDivisor (Ask 5:
  // enrich_parcels_bbox_degree_divisor, default 78000 — at Toronto's latitude a degree of LONGITUDE is
  // only ~80.5 km, so dividing by a value < 80500 guarantees the box is >= roadDist in EVERY direction).
  const mem = OVERLAY_LAYERS.filter((l) => l.col);
  const active = mem.filter((l) => !staleOverlays.has(l.key));
  const memberCtes = active.map((l) =>
    `mem_${l.col} AS (
  SELECT DISTINCT s.parcel_id FROM scope s
  JOIN ${l.table} o ON ${l.kind === 'line'
      ? `o.geom && ST_Expand(s.geom, ($1 / ${bboxDivisor}.0)) AND ST_DWithin(s.geom::geography, o.geom::geography, $1)`
      : 'o.geom && s.geom AND ST_Intersects(s.geom, o.geom) AND NOT ST_Touches(s.geom, o.geom)'}
)`).join(',\n');
  const memberSelect = mem
    .map((l) => staleOverlays.has(l.key)
      ? `  false AS ${l.col}`
      : `  (mem_${l.col}.parcel_id IS NOT NULL) AS ${l.col}`).join(',\n');
  const memberJoins = active
    .map((l) => `LEFT JOIN mem_${l.col} ON mem_${l.col}.parcel_id = s.parcel_id`).join('\n');

  const heightStale = staleOverlays.has('height_overlay');
  const covStale = staleOverlays.has('lot_coverage_overlay');
  const heightCte = heightStale ? '' : `height_agg AS (
  SELECT DISTINCT ON (s.parcel_id) s.parcel_id,
         h.height_max_m AS bylaw_max_height_m, h.ht_stories AS bylaw_max_stories
  FROM scope s JOIN zoning_height_overlay h
    ON h.geom && s.geom AND ST_Intersects(s.geom, h.geom) AND NOT ST_Touches(s.geom, h.geom)
  ORDER BY s.parcel_id, h.height_max_m ASC, h.ht_stories ASC NULLS LAST, h.source_id ASC
),\n`;
  const covCte = covStale ? '' : `cov_agg AS (
  SELECT s.parcel_id, MIN(o.coverage_max_pct_override) AS cov_override
  FROM scope s JOIN zoning_lot_coverage_overlay o ON o.geom && s.geom AND ST_Intersects(s.geom, o.geom)
  GROUP BY s.parcel_id
),\n`;
  const heightSel = heightStale
    ? 'NULL::numeric AS bylaw_max_height_m, NULL::integer AS bylaw_max_stories'
    : 'ha.bylaw_max_height_m, ha.bylaw_max_stories';
  const covSel = covStale
    ? 'ba.base_coverage_max_pct AS bylaw_max_coverage_pct'
    : 'COALESCE(ca.cov_override, ba.base_coverage_max_pct) AS bylaw_max_coverage_pct';
  const heightJson = heightStale ? '' : `    'height_overlay', CASE WHEN ha.parcel_id IS NOT NULL
      THEN jsonb_build_object('applied', true, 'height_max_m', ha.bylaw_max_height_m, 'stories', ha.bylaw_max_stories) END,\n`;
  const covJson = covStale ? '' : `    'lot_coverage_overlay', CASE WHEN ca.parcel_id IS NOT NULL
      THEN jsonb_build_object('applied', true, 'coverage_max_pct', ca.cov_override) END,\n`;
  const heightJoin = heightStale ? '' : 'LEFT JOIN height_agg ha ON ha.parcel_id = s.parcel_id\n';
  const covJoin = covStale ? '' : 'LEFT JOIN cov_agg ca ON ca.parcel_id = s.parcel_id\n';

  return `
CREATE TEMP TABLE parcel_zoning_enrich ON COMMIT DROP AS
WITH scope AS (
  SELECT p.parcel_id, p.geom
  FROM parcels p
  WHERE (${scopeWhere}) AND p.geom IS NOT NULL AND ${incremental}
),
base_cand AS (
  -- Two-pass area (D6): exact ST_Intersection (expensive geometry construction) is
  -- evaluated ONLY for multi-candidate (boundary) parcels — the CASE ELSE is lazy,
  -- so single-zone parcels (~78%) skip it and take share 1.0. NOT ST_Touches drops
  -- point/edge-only contacts at the join (zero-area boundary touches) — so the
  -- dominant zone is never a mere neighbour.
  SELECT s.parcel_id, z.source_id, z.zn_zone, z.zn_string, z.gen_zone, z.zn_holding, z.zone_status,
         z.exception_number, z.exception_text, z.bylaw_chapter, z.bylaw_section, z.bylaw_exception_ref,
         -- WF3 B2 source-plausibility guard (Spec 65): a residential (R-prefix) source zone with
         -- fsi_max > 10 is corrupt data (real RD/RS/RM <= ~2, RA apartment <= ~8-10; CR is exempt —
         -- starts with C). NULL it before aggregation so it can't seed bylaw_max_fsi. Counted via
         -- zoning_fsi_source_nulled_count (INFO). Keep the raw value for the count in fsi_max_raw.
         CASE WHEN upper(z.zn_zone) LIKE 'R%' AND z.fsi_max > 10 THEN NULL ELSE z.fsi_max END AS fsi_max,
         z.fsi_max AS fsi_max_raw,
         z.units_max, z.density_max, z.pct_commercial_max, z.pct_residential_max,
         z.pct_employment_max, z.pct_office_max, z.frontage_min_m, z.area_min_sqm, z.standard_setback,
         z.coverage_max_pct, z.source_dataset_version,
         CASE WHEN COUNT(*) OVER (PARTITION BY s.parcel_id) = 1 THEN 1.0
              ELSE ST_Area(ST_Intersection(s.geom, z.geom)::geography) END AS intersect_area
  FROM scope s
  JOIN zoning_bylaw_areas z
    ON z.geom && s.geom AND ST_Intersects(s.geom, z.geom) AND NOT ST_Touches(s.geom, z.geom)
),
base_pos AS (
  SELECT *, intersect_area / NULLIF(SUM(intersect_area) OVER (PARTITION BY parcel_id), 0) AS area_share
  FROM base_cand WHERE intersect_area > 0
),
base_agg AS (
  SELECT parcel_id,
${baseAgg},
      MIN(coverage_max_pct) AS base_coverage_max_pct,
      (array_agg(source_id ORDER BY ${DOMINANT_ORDER_BY}))[1] AS zoning_base_source_id,
      (array_agg(source_dataset_version ORDER BY ${DOMINANT_ORDER_BY}))[1] AS zoning_base_source_dataset_version,
      -- Round to the parcels.zoning_dominant_area_share NUMERIC(5,4) precision so the
      -- UPDATE's IS DISTINCT FROM guard is stable (float8 vs NUMERIC(5,4) would compare
      -- unequal every run -> multi-zone parcels never reach their idempotent fixed point).
      round(MAX(area_share)::numeric, 4) AS zoning_dominant_area_share,
      (MAX(area_share) < ${AMBIGUOUS_DOMINANT_SHARE_MAX}) AS zoning_is_ambiguous,
      COUNT(*) AS base_candidate_count,
      -- WF3 B2 telemetry: source rows the plausibility guard nulled (raw R-zone fsi_max > 10).
      COUNT(*) FILTER (WHERE upper(zn_zone) LIKE 'R%' AND fsi_max_raw > 10) AS fsi_source_nulled,
      COUNT(DISTINCT fsi_max)      FILTER (WHERE fsi_max IS NOT NULL)      AS fsi_distinct,
      COUNT(DISTINCT frontage_min_m) FILTER (WHERE frontage_min_m IS NOT NULL) AS frontage_distinct,
      jsonb_agg(jsonb_build_object('source_id', source_id, 'zn_zone', zn_zone,
        'area_share', round(area_share::numeric, 4)) ORDER BY intersect_area DESC) AS base_candidates
  FROM base_pos GROUP BY parcel_id
),
${heightCte}${covCte}${memberCtes}
SELECT s.parcel_id,
  ${Object.keys(BASE_SRC).map((c) => `ba.${c}`).join(', ')},
  ${heightSel},
  ${covSel},
${memberSelect},
  ba.zoning_base_source_id,
  ba.zoning_base_source_dataset_version,
  ba.zoning_dominant_area_share,
  COALESCE(ba.zoning_is_ambiguous, false) AS zoning_is_ambiguous,
  jsonb_strip_nulls(jsonb_build_object(
    'base', COALESCE(ba.base_candidates, '[]'::jsonb),
${heightJson}${covJson}    '_placeholder', NULL
  )) AS zoning_overlays,
  ba.base_candidate_count,
  COALESCE(ba.fsi_source_nulled, 0) AS fsi_source_nulled,
  COALESCE(ba.fsi_distinct, 0) AS fsi_distinct,
  COALESCE(ba.frontage_distinct, 0) AS frontage_distinct
FROM scope s
LEFT JOIN base_agg ba   ON ba.parcel_id = s.parcel_id
${heightJoin}${covJoin}${memberJoins};
`;
}

function buildUpdateSql() {
  const setList = ALL_WRITE_COLS.map((c) => `${c} = e.${c}`).join(',\n    ');
  const guard = ALL_WRITE_COLS.map((c) => `p.${c} IS DISTINCT FROM e.${c}`).join('\n      OR ');
  return `
UPDATE parcels p SET
    ${setList},
    zoning_enriched_at = $1
FROM parcel_zoning_enrich e
WHERE p.parcel_id = e.parcel_id
  AND (
      ${guard}
  )
RETURNING p.id;`; // D#5 — ids feed the run's honest aggregate records_updated (distinct-parcels-touched)
}

/**
 * Pass 1 — zoning. `run(client, ctx, config)`. Returns the same stats shape as the legacy
 * `enrichParcels()`, plus nothing runner-owned (no duration timing — the runner times the call).
 */
async function runPass1(client, ctx, config) {
  const roadDist = Number(config.road_overlay_distance_m);
  const bboxDivisor = Number(config.enrich_parcels_bbox_degree_divisor);
  await client.query('DROP TABLE IF EXISTS parcel_zoning_enrich');
  await client.query(
    buildEnrichmentSql({ scopeWhere: ctx.scopeWhere, full: ctx.full, staleOverlays: ctx.staleOverlays, bboxDivisor }),
    [roadDist],
  );

  const stats = await client.query(`
    SELECT
      COUNT(*) AS scoped,
      COUNT(*) FILTER (WHERE zoning_base_source_id IS NULL) AS gaps,
      COUNT(*) FILTER (WHERE zoning_is_ambiguous) AS ambiguous,
      COUNT(*) FILTER (WHERE base_candidate_count > 1) AS multi_zone,
      COUNT(*) FILTER (WHERE fsi_distinct > 1 OR frontage_distinct > 1) AS conflicts,
      COALESCE(SUM(fsi_source_nulled), 0) AS fsi_source_nulled,
      ROUND(100.0 * COUNT(*) FILTER (WHERE bylaw_max_fsi IS NULL) / NULLIF(COUNT(*), 0), 1) AS fsi_null_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NULL) / NULLIF(COUNT(*), 0), 1) AS coverage_null_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE bylaw_max_height_m IS NULL) / NULLIF(COUNT(*), 0), 1) AS height_null_pct
    FROM parcel_zoning_enrich`);
  const s = stats.rows[0];

  const stamp = ctx.clock.now();
  const upd = await client.query(buildUpdateSql(), [stamp]);

  return {
    scoped: Number(s.scoped),
    updated: upd.rowCount,
    updatedIds: upd.rows.map((r) => r.id),
    gaps: Number(s.gaps),
    ambiguous: Number(s.ambiguous),
    multiZone: Number(s.multi_zone),
    conflicts: Number(s.conflicts),
    fsiSourceNulled: Number(s.fsi_source_nulled),
    fsiNullPct: s.fsi_null_pct === null ? null : Number(s.fsi_null_pct),
    coverageNullPct: s.coverage_null_pct === null ? null : Number(s.coverage_null_pct),
    heightNullPct: s.height_null_pct === null ? null : Number(s.height_null_pct),
  };
}

// ===========================================================================
// PASS 2 — max-build envelope (Spec 65 §4/§7/§8). Verbatim from :392-899.
// ===========================================================================

function buildMassingScopeWhere({ full = false } = {}) {
  if (full) return 'TRUE';
  return `(p.massing_enriched_at IS NULL OR EXISTS (
    SELECT 1 FROM parcel_buildings pb
    WHERE pb.parcel_id = p.id AND pb.linked_at > p.massing_enriched_at
  ))`;
}

/**
 * SECURITY — scopeWhere is interpolated verbatim; trusted internal/test predicate only.
 * @param {{scopeWhere?: string, full?: boolean, storeyHeight: number, acc: object, mislinkTol: number, minDim: number}} opts
 */
function buildMaxBuildSql({ scopeWhere = 'TRUE', full = false, storeyHeight, acc, mislinkTol, minDim }) {
  const incremental = full
    ? 'TRUE'
    : `(p.lot_size_confidence IS NULL OR EXISTS (SELECT 1 FROM parcel_zoning_enrich z WHERE z.parcel_id = p.parcel_id) OR ${buildMassingScopeWhere({ full: false })})`;
  const { LOT_TOLERANCE: tol, LOT_MIN_SQM, LOT_MAX_SQM, RAVINE_SETBACK_M } = mb;
  const N = (v, d) => Number(v ?? d);
  const gardenMinLot = N(acc.gardenMinLot, mb.GARDEN_SUITE_MIN_LOT_SQM);
  const gardenMinRearYard = N(acc.gardenMinRearYard, mb.GARDEN_SUITE_MIN_REAR_YARD_M);
  const gardenMaxGfa = N(acc.gardenMaxGfa, mb.GARDEN_SUITE_MAX_GFA_SQM);
  const garageMinLot = N(acc.garageMinLot, mb.GARAGE_MIN_LOT_SQM);
  const garageMaxGfa = N(acc.garageMaxGfa, mb.GARAGE_MAX_GFA_SQM);
  const garageMinFootprint = N(acc.garageMinFootprint, mb.GARAGE_MIN_FOOTPRINT_SQM);
  const accessoryMaxCovPct = N(acc.accessoryMaxCovPct, mb.ACCESSORY_MAX_COVERAGE_PCT);
  const carFootprint = N(acc.carFootprint, mb.CAR_FOOTPRINT_SQM);
  const lanewayMaxGfa = N(acc.lanewayMaxGfa, mb.LANEWAY_SUITE_MAX_GFA_SQM);
  const lanewayMinLot = N(acc.lanewayMinLot, mb.LANEWAY_SUITE_MIN_LOT_SQM);
  const lanewayMinRearYard = N(acc.lanewayMinRearYard, mb.LANEWAY_SUITE_MIN_REAR_YARD_M);
  const minSoftPct = N(acc.minSoftPct, mb.MIN_SOFT_LANDSCAPING_PCT);
  const lanewayStoreys = N(acc.lanewayStoreys, mb.LANEWAY_SUITE_STOREYS);
  const gardenStoreys = N(acc.gardenStoreys, mb.GARDEN_SUITE_STOREYS);
  const mislinkTolNum = N(mislinkTol, mb.MISLINK_FOOTPRINT_LOT_TOL_DEFAULT);
  const minDimNum = N(minDim, mb.MAX_BUILD_MIN_DIMENSION_M_DEFAULT);
  return `
CREATE TEMP TABLE parcel_max_build ON COMMIT DROP AS
WITH scope AS (
  SELECT p.id AS pid, p.parcel_id, p.geom,
         p.lot_size_sqm::numeric AS lot_size_sqm, p.frontage_m::numeric AS frontage_m, p.depth_m::numeric AS depth_m,
         p.bylaw_max_height_m, p.bylaw_max_stories, p.bylaw_max_fsi, p.bylaw_max_coverage_pct,
         p.bylaw_standard_setback_m, p.zoning_class, COALESCE(p.zoning_is_ambiguous, false) AS zoning_is_ambiguous,
         COALESCE(p.is_corner_lot, false) AS is_corner_lot, COALESCE(p.is_through_lot, false) AS is_through_lot,
         COALESCE(p.is_in_ravine_protection_area, false) AS is_in_ravine_protection_area,
         COALESCE(p.is_heritage_designated, false) AS is_heritage_designated,
         COALESCE(p.abuts_laneway, false) AS abuts_laneway,
         -- WF3-C2: parcel->neighbourhood (centroid-in-polygon, deterministic tiebreak). LEFT JOINs can't
         -- drop parcel rows; inner nsn LEFT JOIN so a parcel in a real nbhd with no norm still gets the link+income.
         nb.neighbourhood_id, nb.avg_household_income AS nbhd_income,
         nb.storeys_p50 AS pocket_p50_local, nb.storeys_p90 AS pocket_p90_local
  FROM parcels p
  LEFT JOIN LATERAL (
    SELECT n.id AS neighbourhood_id, n.avg_household_income, nsn.storeys_p50, nsn.storeys_p90
    FROM neighbourhoods n
    LEFT JOIN neighbourhood_storey_norms nsn ON nsn.neighbourhood_id = n.id
    WHERE n.geom IS NOT NULL AND ST_Contains(n.geom, ST_Centroid(p.geom))
    ORDER BY n.id LIMIT 1
  ) nb ON TRUE
  WHERE (${scopeWhere}) AND p.geom IS NOT NULL AND ${incremental}
),
massing AS (
  -- heritage-freeze uses the PRIMARY building (SUM footprint, MAX storeys; DeepSeek multi-primary).
  -- existing_total_footprint_sqm = ALL buildings (incl. sheds/detached garages) — for the Phase-3
  -- accessory yard/greenspace math, so it isn't optimistic about an empty rear yard.
  -- NB: existing_footprint_sqm here is a query-LOCAL massing intermediate (recomputed from
  -- building_footprints), feeding ONLY the max-build heritage fallback below — NOT the persisted column
  -- (renamed to imagery_roof_footprint_sqm by mig 201; written by the separate existing-structure pass).
  -- WF3 (heritage storeys): massing estimated_stories is tree-canopy contaminated (bungalows at 5-79
  -- storeys) -- RETIRED as a storey source everywhere (WF3-A did the output column; this closes the ES-6
  -- L213 heritage-freeze carve-out). Heritage storeys now come from stories_calc (bylaw->pocket p50).
  -- Footprint (canopy-independent, corr(fp,height)=0.116) is still trusted and kept.
  SELECT pb.parcel_id AS pid,
         SUM(bf.footprint_area_sqm) FILTER (WHERE pb.is_primary)::numeric AS existing_footprint_sqm,
         SUM(bf.footprint_area_sqm)::numeric AS existing_total_footprint_sqm
  FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id
  GROUP BY pb.parcel_id
),
sb AS (
  SELECT s.*, m.existing_footprint_sqm, m.existing_total_footprint_sqm,
    ST_Area(s.geom::geography)::numeric AS geom_area,
    (s.frontage_m * s.depth_m)::numeric AS fxd_area,
    -- front = real STAND_SET when present, else zone default; side/rear/flankage always zone default (no source).
    COALESCE(s.bylaw_standard_setback_m, ${mb.buildSetbackCase('s.zoning_class', 'front')}) AS front_setback,
    ${mb.buildSetbackCase('s.zoning_class', 'side')} AS side_setback,
    ${mb.buildSetbackCase('s.zoning_class', 'rear')} AS rear_setback,
    ${mb.buildSetbackCase('s.zoning_class', 'flankage')} AS flankage_setback,
    ${mb.buildSideCountCase('s.zoning_class')} AS side_count,  -- WF3-B party-wall: NON-party sides (RD/RM 2, RS 1, RT 0)
    (s.bylaw_standard_setback_m IS NOT NULL) AS setback_is_bylaw
  FROM scope s LEFT JOIN massing m ON m.pid = s.pid
),
lot AS (
  SELECT sb.*,
    (lot_size_sqm IS NOT NULL AND geom_area IS NOT NULL
      AND abs(lot_size_sqm - geom_area) <= ${tol} * GREATEST(lot_size_sqm, geom_area)) AS pair_lg,
    (lot_size_sqm IS NOT NULL AND fxd_area IS NOT NULL
      AND abs(lot_size_sqm - fxd_area) <= ${tol} * GREATEST(lot_size_sqm, fxd_area)) AS pair_lf,
    (geom_area IS NOT NULL AND fxd_area IS NOT NULL
      AND abs(geom_area - fxd_area) <= ${tol} * GREATEST(geom_area, fxd_area)) AS pair_gf,
    COALESCE(lot_size_sqm, geom_area, fxd_area) AS best_area
  FROM sb
),
tier AS (
  SELECT lot.*,
    CASE
      WHEN best_area IS NULL THEN NULL
      WHEN best_area < ${LOT_MIN_SQM} OR best_area > ${LOT_MAX_SQM} THEN 'low'
      WHEN pair_lg AND pair_lf AND pair_gf THEN 'high'
      WHEN pair_lg OR pair_lf OR pair_gf THEN 'medium'
      ELSE 'low'
    END AS lot_size_confidence,
    CASE
      WHEN best_area IS NULL THEN NULL
      WHEN best_area < ${LOT_MIN_SQM} OR best_area > ${LOT_MAX_SQM} THEN 'oob'
      WHEN pair_lg AND pair_lf AND pair_gf THEN '3way'
      WHEN pair_lg OR pair_lf OR pair_gf THEN 'pair'
      ELSE 'single'
    END AS lot_size_basis
  FROM lot
),
box AS (
  SELECT tier.*,
    COALESCE(lot_size_confidence IN ('high', 'medium'), false) AS emit,
    CASE WHEN is_in_ravine_protection_area THEN ${RAVINE_SETBACK_M} ELSE 0 END AS ravine_red,
    -- WF3 Phase 1 D-A: the corner branch charged the FRONT setback against the WIDTH (wrong axis —
    -- front setback is a DEPTH loss; 13.49 m frontages read width 2.99 m on ~6,961 corners). A corner
    -- loses its flankage side + at most ONE interior side setback, side_count-aware (MIN(side_count,1))
    -- so attached corner units (RS/RT) don't double-inset — the D-B intersection. Length is untouched.
    GREATEST(0, (CASE WHEN is_corner_lot THEN frontage_m - LEAST(side_count, 1) * side_setback - flankage_setback
                      ELSE frontage_m - side_count * side_setback END)  -- WF3-B: party-wall side_count (was 2x)
                - (CASE WHEN is_in_ravine_protection_area THEN ${RAVINE_SETBACK_M} ELSE 0 END)) AS width_raw,
    GREATEST(0, (CASE WHEN is_through_lot THEN depth_m - 2 * front_setback
                      ELSE depth_m - front_setback - rear_setback END)
                - (CASE WHEN is_in_ravine_protection_area THEN ${RAVINE_SETBACK_M} ELSE 0 END)) AS length_raw
  FROM tier
),
geo AS (
  SELECT box.*,
    -- WF3 Phase 1 D-C: a dimension below the viability floor (max_build_min_dimension_m, default
    -- 3.0 m) is NULLed — it is evidence the zone-default setbacks do not describe this lot, not a
    -- geometry to price. Exact-zero rows (the old NULLIF(.,0)) join the same contract: no
    -- "0.0 m gets coverage, 0.29 m gets NULL" split. box_area follows the clamped dims.
    CASE WHEN width_raw >= ${minDimNum} THEN width_raw END AS width_m,
    CASE WHEN length_raw >= ${minDimNum} THEN length_raw END AS length_m,
    CASE WHEN width_raw >= ${minDimNum} AND length_raw >= ${minDimNum} THEN round(width_raw * length_raw, 2) END AS box_area,
    -- uniform negative buffer (shape-aware, dir-blind): side setback (party-wall-scaled, WF3-B) + ravine. Empty (lot < 2xinset) -> NULL.
    -- D-C (step-8 gate catch): a buffer SLIVER below minDim^2 (can't seat a minDim x minDim square) is
    -- the same degenerate-geometry evidence as a sub-floor box dim — excluded from the LEAST, else a
    -- long-skinny ravine lot's -10 m inset collapses to ~0.01 m^2 and prices a physically absurd
    -- envelope (602 such rows caught by the (0,10)-GFA gate on the first full re-run).
    CASE WHEN round(ST_Area(ST_Buffer(geom::geography, -(side_setback * side_count / 2.0 + ravine_red)))::numeric, 2)
              >= ${minDimNum * minDimNum}
         THEN round(ST_Area(ST_Buffer(geom::geography, -(side_setback * side_count / 2.0 + ravine_red)))::numeric, 2)
         END AS buffer_area,
    -- WF3: coverage cap ALWAYS applied — a zone-class DEFAULT (empirical median) fills a NULL bylaw
    -- coverage (~37% of parcels), else LEAST drops the term and the footprint balloons to the setback
    -- box (~67% coverage). COALESCE fills NULL only. coverage_cap stays NULL only when lot_size_sqm is NULL.
    round(lot_size_sqm * COALESCE(bylaw_max_coverage_pct, ${mb.buildCoverageCase('zoning_class')}) / 100.0, 2) AS coverage_cap,
    (bylaw_max_coverage_pct IS NULL) AS coverage_defaulted,
    -- WF3-C2: by-law height-implied storeys (standalone — the legal cap for the pocket branch + hotspot ref).
    CASE WHEN bylaw_max_height_m IS NOT NULL AND bylaw_max_height_m > 0
         THEN GREATEST(1, round(bylaw_max_height_m / (${mb.buildStoreyHeightCase('zoning_class', storeyHeight)}))::int) END AS height_implied,
    -- WF3-C2: pocket norm — local neighbourhood, else citywide NULL-row fallback (singleton, partial-unique-index).
    COALESCE(pocket_p50_local, (SELECT storeys_p50 FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL)) AS pocket_p50,
    COALESCE(pocket_p90_local, (SELECT storeys_p90 FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL)) AS pocket_p90
  FROM box
),
env AS (
  SELECT geo.*,
    -- WF3 Phase 1 D-C class flags. ravine_sub_floor: the envelope is deliberately WITHHELD (all
    -- NULL) — a coverage x lot fallback is ravine-blind and would re-price deleted protection.
    -- Heritage is excluded (freeze path owns it; heritage^ravine^sub-floor pop 0 keeps the freeze).
    (is_in_ravine_protection_area AND NOT is_heritage_designated
       AND (width_m IS NULL OR length_m IS NULL)) AS ravine_sub_floor,
    -- D-C footprint routing: ravine sub-floor -> NULL; non-ravine sub-floor -> COVERAGE-ONLY (the
    -- degenerate box AND buffer are both excluded — nothing models depth loss, flagged
    -- max_buildable_gfa_basis='coverage_only'); else the normal LEAST (NULL-skipping by design).
    CASE
      WHEN is_in_ravine_protection_area AND NOT is_heritage_designated
           AND (width_m IS NULL OR length_m IS NULL) THEN NULL
      WHEN width_m IS NULL OR length_m IS NULL THEN coverage_cap
      ELSE LEAST(buffer_area, box_area, coverage_cap) END AS footprint_calc,
    is_heritage_designated AS heritage,
    -- WF3: "no TRUSTWORTHY massing" — the heritage freeze copies the primary-massing footprint, but a
    -- footprint exceeding the lot means the WRONG building was linked (mislink). The existing-structure
    -- pass NULLs this identically (> lot x(1+tol)); the freeze must agree, else it prices garbage (FSI 20+).
    (is_heritage_designated AND (existing_footprint_sqm IS NULL
       OR existing_footprint_sqm > lot_size_sqm * (1 + ${mislinkTolNum}))) AS heritage_no_massing,
    (is_heritage_designated AND existing_footprint_sqm IS NOT NULL
       AND existing_footprint_sqm > lot_size_sqm * (1 + ${mislinkTolNum})) AS heritage_footprint_mislink,
    -- WF3-C2: 3-way storeys — by-law authoritative; else pocket p50 (LEGAL-height-capped); else height-derived.
    CASE WHEN bylaw_max_stories IS NOT NULL THEN GREATEST(1, bylaw_max_stories)
         WHEN pocket_p50 IS NOT NULL AND height_implied IS NOT NULL THEN LEAST(pocket_p50, height_implied)
         WHEN pocket_p50 IS NOT NULL THEN pocket_p50
         ELSE height_implied END AS stories_calc
  FROM geo
),
gfa AS (
  SELECT env.*,
    CASE WHEN footprint_calc IS NOT NULL AND stories_calc IS NOT NULL THEN round(footprint_calc * stories_calc, 2) END AS gfa_box,
    CASE WHEN bylaw_max_fsi IS NOT NULL THEN round(lot_size_sqm * bylaw_max_fsi, 2) END AS fsi_cap
  FROM env
),
-- Phase-3 accessory fit (garage + rear suite). rear_yard_area subtracts the TOTAL existing footprint
-- (all buildings) so it isn't optimistic about sheds/old garages. garden/laneway fit reuse the
-- garden-suite lot+rear-yard-depth rule (now externalized); laneway additionally REQUIRES abuts_laneway.
accessory AS (
  SELECT gfa.*,
    GREATEST(0, depth_m - front_setback - rear_setback) AS rear_yard_depth,
    GREATEST(0, GREATEST(0, depth_m - front_setback - rear_setback) * COALESCE(width_m, 0)
              - COALESCE(existing_total_footprint_sqm, 0)) AS rear_yard_area,
    COALESCE(emit AND NOT heritage AND NOT is_in_ravine_protection_area
             AND lot_size_sqm >= ${gardenMinLot} AND (depth_m - front_setback - rear_setback) >= ${gardenMinRearYard}, false) AS garden_fits,
    COALESCE(emit AND NOT heritage AND NOT is_in_ravine_protection_area AND abuts_laneway
             AND lot_size_sqm >= ${lanewayMinLot} AND (depth_m - front_setback - rear_setback) >= ${lanewayMinRearYard}, false) AS laneway_fits
  FROM gfa
),
accessory2 AS (
  SELECT a.*,
    -- WF3 (Phase 0 garage one-car floor): offer a garage only when the BUILDABLE garage GFA
    -- (LEAST(max, accessoryMaxCovPct of rear yard)) holds >=1 car. The old gate (rear_yard_area >=
    -- garageMinFootprint) was wrong: the garage is only ~30% of the rear yard, so an 18-61 m2 rear yard
    -- yielded a 5-18 m2 garage = 0 cars but garage_permission='as_of_right' (46,598 phantom garages, e.g.
    -- 39 & 45 Derwyn). GREATEST(garageMinFootprint, carFootprint) guarantees >=1 car even if the logicVar
    -- garage_min_footprint_sqm is set below the one-car footprint.
    COALESCE(a.emit AND NOT a.heritage AND NOT a.is_in_ravine_protection_area
             AND a.lot_size_sqm >= ${garageMinLot}
             AND LEAST(${garageMaxGfa}::numeric, ${accessoryMaxCovPct}::numeric * a.rear_yard_area)
                 >= GREATEST(${garageMinFootprint}::numeric, ${carFootprint}::numeric), false) AS garage_fits,
    CASE WHEN a.emit AND NOT a.heritage AND NOT a.is_in_ravine_protection_area
              AND a.lot_size_sqm >= ${garageMinLot}
              AND LEAST(${garageMaxGfa}::numeric, ${accessoryMaxCovPct}::numeric * a.rear_yard_area)
                  >= GREATEST(${garageMinFootprint}::numeric, ${carFootprint}::numeric)
         THEN round(LEAST(${garageMaxGfa}::numeric, ${accessoryMaxCovPct}::numeric * a.rear_yard_area), 2) END AS max_garage_gfa_sqm,
    CASE WHEN a.garden_fits THEN round(${gardenMaxGfa}::numeric, 2) END AS max_garden_suite_gfa_sqm,
    CASE WHEN a.laneway_fits THEN round(${lanewayMaxGfa}::numeric, 2) END AS max_laneway_suite_gfa_sqm,
    CASE WHEN a.abuts_laneway AND a.laneway_fits THEN 'laneway'
         WHEN NOT a.abuts_laneway AND a.garden_fits THEN 'garden' END AS rear_suite_type
  FROM accessory a
)
SELECT pid, parcel_id, lot_size_confidence, lot_size_basis,
  CASE WHEN emit THEN (CASE WHEN setback_is_bylaw THEN 'bylaw' ELSE 'zone_default' END) END AS max_build_setback_basis,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN existing_footprint_sqm
       ELSE footprint_calc END AS max_buildable_footprint_sqm,
  CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN width_m END AS max_build_width_m,
  CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN length_m END AS max_build_length_m,
  -- D-C: the ravine_constrained class NULLs every envelope dim (height/stories/basis included).
  CASE WHEN emit AND NOT heritage AND NOT ravine_sub_floor THEN bylaw_max_height_m END AS max_build_height_m,
  -- WF3: heritage storeys use the bounded stories_calc (bylaw->pocket p50->derived), NOT the retired
  -- tree-contaminated massing estimated_stories. Footprint stays frozen to the existing structure.
  CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL
       ELSE stories_calc END AS max_build_stories,
  CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL
       WHEN bylaw_max_stories IS NOT NULL THEN 'bylaw'
       WHEN pocket_p50 IS NOT NULL THEN 'pocket'
       WHEN bylaw_max_height_m IS NOT NULL AND bylaw_max_height_m > 0 THEN 'derived'
       ELSE NULL END AS max_build_stories_basis,
  -- WF3-C2: market-realized ceiling (p90, UNCAPPED) + the variance hotspot; neighbourhood link + premium (ALL parcels, ungated).
  CASE WHEN NOT emit OR heritage_no_massing OR heritage THEN NULL ELSE pocket_p90 END AS max_build_stories_aggressive,
  COALESCE(emit AND NOT heritage AND pocket_p90 IS NOT NULL AND height_implied IS NOT NULL AND pocket_p90 > height_implied, false) AS market_exceeds_bylaw,
  neighbourhood_id,
  round((${mb.buildPremiumCase('nbhd_income')})::numeric, 2) AS neighbourhood_cost_premium,
  CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL
       WHEN heritage THEN 'heritage_existing' ELSE 'rect_approx' END AS max_build_basis,
  -- WF3: heritage GFA = frozen existing footprint x bounded stories_calc (was x the contaminated
  -- massing storeys). No FSI cap: footprint is real+frozen and stories_calc is bounded, so FSI
  -- self-bounds; capping would understate a legitimately grandfathered heritage structure.
  -- D-C: ravine_sub_floor MUST be explicit here — LEAST skips NULLs, so a NULL gfa_box would
  -- otherwise leak fsi_cap (lot x FSI) as the GFA for a parcel whose envelope was withheld.
  CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL
       WHEN heritage THEN round(existing_footprint_sqm * stories_calc, 2)
       ELSE LEAST(gfa_box, fsi_cap) END AS max_buildable_gfa_sqm,
  CASE WHEN NOT emit OR heritage_no_massing OR ravine_sub_floor THEN NULL
       WHEN heritage THEN 'heritage_existing'
       -- D-C: below-floor non-ravine = the box was excluded as degenerate; the envelope is
       -- coverage-only and nothing models depth loss (MB-3 amendment).
       WHEN width_m IS NULL OR length_m IS NULL THEN 'coverage_only'
       WHEN fsi_cap IS NOT NULL AND fsi_cap <= COALESCE(gfa_box, 'infinity'::numeric) THEN 'fsi'
       ELSE 'coverage_box' END AS max_buildable_gfa_basis,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN zoning_is_ambiguous THEN 'low'
       WHEN heritage THEN 'high'
       WHEN width_m IS NULL OR length_m IS NULL THEN 'low'
       WHEN lot_size_confidence = 'high' AND setback_is_bylaw
            AND (bylaw_max_fsi IS NOT NULL OR bylaw_max_height_m IS NOT NULL) THEN 'high'
       ELSE 'medium' END AS max_build_confidence,
  max_garden_suite_gfa_sqm,        -- externalized garden constants; computed in accessory2
  garden_fits AS garden_suite_fits,
  COALESCE(emit AND (heritage OR is_in_ravine_protection_area OR width_m IS NULL OR length_m IS NULL
       OR (buffer_area IS NULL AND box_area IS NULL)), false) AS envelope_constrained,
  CASE
    -- WF3: split the NOT-emit reason so a future cost/build UI can distinguish an unbuildable sliver from a
    -- large lot that merely exceeds the residential max-build MODEL range (LOT_MAX) — the latter is buildable,
    -- just not modelled. NULL lot (NULL < LOT_MIN is NULL, not TRUE) correctly falls through to low_lot_confidence.
    WHEN NOT emit AND lot_size_sqm < ${LOT_MIN_SQM} THEN 'lot_too_small'
    WHEN NOT emit AND lot_size_sqm > ${LOT_MAX_SQM} THEN 'lot_too_large'
    WHEN NOT emit THEN 'low_lot_confidence'
    WHEN heritage_no_massing THEN (CASE WHEN heritage_footprint_mislink THEN 'heritage_footprint_exceeds_lot' ELSE 'heritage_no_massing' END)
    WHEN heritage THEN 'heritage'
    -- D-C (R3-M8 explicit CASE diff): the sub-floor ravine residual gets 'ravine_constrained';
    -- ordered ABOVE the unconditional 'ravine' branch, which the above-floor majority keeps.
    WHEN is_in_ravine_protection_area AND (width_m IS NULL OR length_m IS NULL) THEN 'ravine_constrained'
    WHEN is_in_ravine_protection_area THEN 'ravine'
    WHEN buffer_area IS NULL AND box_area IS NULL THEN 'setback_exceeds_lot'
    WHEN width_m IS NULL OR length_m IS NULL THEN 'lot_too_narrow'
    WHEN zoning_is_ambiguous THEN 'ambiguous_zone'
    ELSE NULL
  END AS envelope_constraint_reason,
  -- --- Phase 3 accessory fit (garage + rear suite + greenspace-driven CoA permission) ---
  max_garage_gfa_sqm,
  CASE WHEN max_garage_gfa_sqm IS NOT NULL THEN floor(max_garage_gfa_sqm / ${carFootprint})::int END AS garage_capacity_cars,
  CASE WHEN garage_fits THEN NULL
       WHEN NOT emit THEN 'low_lot_confidence'
       WHEN heritage THEN 'heritage'
       WHEN is_in_ravine_protection_area THEN 'ravine'
       WHEN lot_size_sqm < ${garageMinLot} THEN 'lot_too_small'
       WHEN LEAST(${garageMaxGfa}::numeric, ${accessoryMaxCovPct}::numeric * rear_yard_area)
            < GREATEST(${garageMinFootprint}::numeric, ${carFootprint}::numeric) THEN 'no_rear_yard'
       ELSE NULL END AS garage_constraint_reason,
  CASE WHEN NOT garage_fits THEN (CASE WHEN emit THEN 'not_permitted' END)
       WHEN GREATEST(0, lot_size_sqm - COALESCE(existing_total_footprint_sqm, 0) - max_garage_gfa_sqm)
            >= ${minSoftPct} * lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END AS garage_permission,
  max_laneway_suite_gfa_sqm,
  CASE rear_suite_type WHEN 'laneway' THEN max_laneway_suite_gfa_sqm WHEN 'garden' THEN max_garden_suite_gfa_sqm END AS max_rear_suite_gfa_sqm,
  rear_suite_type,
  CASE WHEN rear_suite_type IS NULL THEN (CASE WHEN emit THEN 'not_permitted' END)
       WHEN GREATEST(0, lot_size_sqm - COALESCE(existing_total_footprint_sqm, 0)
            - (CASE rear_suite_type WHEN 'laneway' THEN max_laneway_suite_gfa_sqm / ${lanewayStoreys}
                                    WHEN 'garden'  THEN max_garden_suite_gfa_sqm / ${gardenStoreys} END))
            >= ${minSoftPct} * lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END AS rear_suite_permission,
  -- WF3 telemetry — stats-only passthrough into parcel_max_build for the audit counts. Deliberately
  -- NOT in MAX_BUILD_COLS (buildMaxBuildUpdateSql would UPDATE nonexistent cols).
  -- D-C adds width_raw/length_raw + ravine_sub_floor + emit for the box-excluded / constrained counts
  -- (the raws are CTE-internal — counting here avoids duplicating the setback SQL in the audit).
  coverage_cap, box_area, buffer_area, coverage_defaulted, heritage_footprint_mislink,
  width_raw, length_raw, ravine_sub_floor, emit,
  -- D1' telemetry passthrough (NOT in MAX_BUILD_COLS — stats-only, mirrors the box-excluded pattern
  -- above): existing_total_footprint_sqm IS NULL means this scoped parcel has ZERO parcel_buildings
  -- rows at all — the massing_zero_link_ghost WARN row's population.
  existing_total_footprint_sqm
FROM accessory2;
`;
}

function buildMaxBuildUpdateSql() {
  const cols = mb.MAX_BUILD_COLS;
  const setList = cols.map((c) => `${c} = e.${c}`).join(',\n    ');
  const guard = cols.map((c) => `p.${c} IS DISTINCT FROM e.${c}`).join('\n      OR ');
  return `
UPDATE parcels p SET
    ${setList}
FROM parcel_max_build e
WHERE p.parcel_id = e.parcel_id
  AND (
      ${guard}
  )
RETURNING p.id;`; // D#5 — ids feed the run's honest aggregate records_updated
}

function buildMassingStampSql() {
  return `
UPDATE parcels p SET massing_enriched_at = $1
FROM parcel_max_build e
WHERE p.parcel_id = e.parcel_id;`;
}

async function runPass2(client, ctx, config) {
  const storeyHeight = Number(config.storey_height_m);
  const minDimNum = Number(config.max_build_min_dimension_m);
  const mislinkTolNum = Number(config.mislink_footprint_lot_tol);
  const acc = {
    gardenMinLot: config.garden_suite_min_lot_sqm, gardenMinRearYard: config.garden_suite_min_rear_yard_m,
    gardenMaxGfa: config.garden_suite_max_gfa_sqm, garageMinLot: config.garage_min_lot_sqm,
    garageMaxGfa: config.garage_max_gfa_sqm, garageMinFootprint: config.garage_min_footprint_sqm,
    accessoryMaxCovPct: config.accessory_max_coverage_pct, carFootprint: config.car_footprint_sqm,
    lanewayMaxGfa: config.laneway_suite_max_gfa_sqm, lanewayMinLot: config.laneway_suite_min_lot_sqm,
    lanewayMinRearYard: config.laneway_suite_min_rear_yard_m, minSoftPct: config.min_soft_landscaping_pct,
    lanewayStoreys: config.laneway_suite_storeys, gardenStoreys: config.garden_suite_storeys,
  };
  await client.query('DROP TABLE IF EXISTS parcel_max_build');
  await client.query(buildMaxBuildSql({ scopeWhere: ctx.scopeWhere, full: ctx.full, storeyHeight, acc, mislinkTol: mislinkTolNum, minDim: minDimNum }));
  const stats = await client.query(`
    SELECT
      COUNT(*)::int AS scoped,
      COUNT(*) FILTER (WHERE lot_size_confidence = 'high')::int   AS lot_high,
      COUNT(*) FILTER (WHERE lot_size_confidence = 'medium')::int AS lot_medium,
      COUNT(*) FILTER (WHERE lot_size_confidence = 'low')::int    AS lot_low,
      COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)::int AS with_footprint,
      COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)::int       AS with_gfa,
      COUNT(*) FILTER (WHERE max_build_width_m IS NOT NULL)::int           AS with_box,
      COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'fsi')::int         AS gfa_fsi,
      COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_box')::int AS gfa_coverage,
      COUNT(*) FILTER (WHERE max_build_confidence = 'high')::int   AS mb_high,
      COUNT(*) FILTER (WHERE max_build_confidence = 'medium')::int AS mb_medium,
      COUNT(*) FILTER (WHERE max_build_confidence = 'low')::int    AS mb_low,
      COUNT(*) FILTER (WHERE garden_suite_fits)::int    AS suite_fits,
      COUNT(*) FILTER (WHERE envelope_constrained)::int AS constrained,
      COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)::int           AS garage_fits_cnt,
      COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')::int        AS garage_aor,
      COUNT(*) FILTER (WHERE garage_permission = 'coa_required')::int       AS garage_coa,
      COUNT(*) FILTER (WHERE rear_suite_type = 'laneway')::int              AS suite_laneway,
      COUNT(*) FILTER (WHERE rear_suite_type = 'garden')::int               AS suite_garden,
      COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')::int     AS suite_aor,
      COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')::int    AS suite_coa,
      COUNT(*) FILTER (WHERE max_build_stories_basis = 'bylaw')::int   AS basis_bylaw,
      COUNT(*) FILTER (WHERE max_build_stories_basis = 'pocket')::int  AS basis_pocket,
      COUNT(*) FILTER (WHERE max_build_stories_basis = 'derived')::int AS basis_derived,
      COUNT(*) FILTER (WHERE market_exceeds_bylaw)::int                AS market_exceeds,
      COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL)::int        AS with_nbhd,
      COUNT(*) FILTER (WHERE neighbourhood_cost_premium IS NOT NULL AND neighbourhood_cost_premium > 1.00)::int AS premium_above_1,
      COUNT(*) FILTER (WHERE coverage_defaulted AND coverage_cap IS NOT NULL
                         AND max_build_basis = 'rect_approx')::int AS coverage_defaulted_cnt,
      COUNT(*) FILTER (WHERE coverage_defaulted AND coverage_cap IS NOT NULL
                         AND max_build_basis = 'rect_approx'
                         AND (buffer_area IS NULL OR coverage_cap <= buffer_area)
                         AND (box_area   IS NULL OR coverage_cap <= box_area))::int AS coverage_binding_cnt,
      COUNT(*) FILTER (WHERE heritage_footprint_mislink)::int AS heritage_mislink_cnt,
      COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_only')::int AS gfa_coverage_only,
      COUNT(*) FILTER (WHERE envelope_constraint_reason = 'ravine_constrained')::int AS ravine_constrained_cnt,
      COUNT(*) FILTER (WHERE emit AND ((width_raw > 0 AND width_raw < ${minDimNum})
                                    OR (length_raw > 0 AND length_raw < ${minDimNum})))::int AS box_excluded_cnt,
      COUNT(*) FILTER (WHERE existing_total_footprint_sqm IS NULL)::int AS zero_link_ghost_cnt
    FROM parcel_max_build`);
  const upd = await client.query(buildMaxBuildUpdateSql());
  const stamp = ctx.clock.now();
  await client.query(buildMassingStampSql(), [stamp]);
  return { ...stats.rows[0], updated: upd.rowCount, updatedIds: upd.rows.map((r) => r.id) };
}

// ===========================================================================
// PASS 3 — existing-structure + scenarios (Spec 65 §5/§6). Verbatim from :909-1077.
// ===========================================================================

function buildExistingStructureSql({ scopeWhere = 'TRUE', full = false, reno = {} }) {
  const incremental = full
    ? 'TRUE'
    : '(p.imagery_roof_footprint_sqm IS NULL OR EXISTS (SELECT 1 FROM parcel_max_build z WHERE z.parcel_id = p.parcel_id))';
  const confMin = mb.EXISTING_CONFIDENCE_HIGH_MIN;
  const coaUplift = Number(reno.coaUplift ?? mb.RENO_COA_UPLIFT_PCT_DEFAULT);
  const kitchenPct = Number(reno.kitchenPct ?? mb.RENO_KITCHEN_GFA_PCT_DEFAULT);
  const bathPct = Number(reno.bathPct ?? mb.RENO_BATH_GFA_PCT_DEFAULT);
  const mislinkTol = Number(reno.mislinkTol ?? mb.MISLINK_FOOTPRINT_LOT_TOL_DEFAULT);
  const mislinkFlag = mb.MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT;
  return `
CREATE TEMP TABLE parcel_existing_struct ON COMMIT DROP AS
WITH scope AS (
  -- max_buildable_gfa_sqm + max_build_stories were written by the max-build pass earlier in THIS txn.
  SELECT p.id AS pid, p.parcel_id, p.geom, p.lot_size_sqm::numeric AS lot_size_sqm,
         p.max_buildable_gfa_sqm::numeric AS max_buildable_gfa_sqm, p.max_build_stories
  FROM parcels p
  WHERE (${scopeWhere}) AND p.geom IS NOT NULL AND ${incremental}
),
prim AS (
  -- exactly one row/parcel (mig 081 idx_parcel_buildings_one_primary) — no GROUP BY needed.
  SELECT pb.parcel_id AS pid, pb.confidence AS link_confidence,
         bf.footprint_area_sqm::numeric AS p_footprint, bf.estimated_stories AS p_stories,
         bf.max_height_m::numeric AS p_height, bf.geom AS p_geom
  FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id
  WHERE pb.is_primary = true
),
allb AS (
  SELECT pb.parcel_id AS pid,
         COUNT(*) FILTER (WHERE NOT pb.is_primary)::int AS other_count,
         SUM(bf.footprint_area_sqm) FILTER (WHERE NOT pb.is_primary)::numeric AS other_sqm
  FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id
  GROUP BY pb.parcel_id
),
dims AS (
  -- oriented-envelope side lengths in METRES. WF3 (Phase 0 projection fix): build the oriented envelope
  -- in a PROJECTED CRS (EPSG:2952, MTM zone 10) then measure PLANAR. Computing ST_OrientedEnvelope on the
  -- raw 4326 (degree) geom distorts the minimum-rotated rectangle at Toronto's latitude (1 deg lon ~= 0.72
  -- lat), inflating length ~7% (measured n=272). 2952 is already metres -> no ::geography cast. Areal geoms only.
  SELECT s.pid,
    ST_Distance(ST_PointN(ST_ExteriorRing(oe.box), 1), ST_PointN(ST_ExteriorRing(oe.box), 2)) AS side1,
    ST_Distance(ST_PointN(ST_ExteriorRing(oe.box), 2), ST_PointN(ST_ExteriorRing(oe.box), 3)) AS side2
  FROM scope s
  JOIN prim pr ON pr.pid = s.pid
  CROSS JOIN LATERAL (
    SELECT CASE WHEN pr.p_geom IS NOT NULL AND ST_Dimension(pr.p_geom) = 2
                THEN ST_OrientedEnvelope(ST_Transform(pr.p_geom, 2952)) END AS box
  ) oe
  WHERE oe.box IS NOT NULL AND ST_GeometryType(oe.box) = 'ST_Polygon'
)
SELECT s.pid, s.parcel_id,
  -- WF3-A mislink guard: a primary footprint larger than the lot means the WRONG building was linked
  -- (block/neighbour attribution). g.eff_footprint is NULL when mislinked -> the WHOLE existing
  -- structure resolves NULL; existing_data_quality_flag records why. Footprint is otherwise trusted.
  -- imagery_roof_footprint_sqm (mig 201 rename): massing roof footprint — imagery, +/-20-38% unreliable.
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint, 2) END AS imagery_roof_footprint_sqm,
  NULL::integer AS existing_stories,   -- RETIRED (WF3-A): massing estimated_stories tree-contaminated (mode 3 storeys on bungalows)
  NULL::numeric AS existing_height_m,  -- RETIRED (WF3-A): massing max_height_m catches canopy, not roof (bungalows to 85-95 m)
  -- imagery_roof_gfa_sqm (mig 201 rename): imagery roof footprint x 2 (typical 2-storey menu option).
  -- No live consumer today (cost model computes GFA from building_footprints); kept honest (NULL on mislink).
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint * 2, 2) END AS imagery_roof_gfa_sqm,
  CASE WHEN m.mislink THEN NULL ELSE ROUND(LEAST(d.side1, d.side2)::numeric, 2) END AS existing_width_m,
  CASE WHEN m.mislink THEN NULL ELSE ROUND(GREATEST(d.side1, d.side2)::numeric, 2) END AS existing_length_m,
  CASE WHEN m.mislink THEN 'low'
       WHEN pr.pid IS NOT NULL AND pr.p_footprint IS NOT NULL
       THEN (CASE WHEN pr.link_confidence >= ${confMin} THEN 'high' ELSE 'low' END) END AS existing_structure_confidence,
  CASE WHEN g.eff_footprint IS NOT NULL THEN COALESCE(a.other_count, 0) END AS existing_other_structures_count,
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(COALESCE(a.other_sqm, 0), 2) END AS existing_other_structures_sqm,
  CASE WHEN g.eff_footprint IS NOT NULL THEN
    ROUND(GREATEST(0, COALESCE(s.lot_size_sqm, ST_Area(s.geom::geography)::numeric)
                      - ROUND(g.eff_footprint, 2) - ROUND(COALESCE(a.other_sqm, 0), 2)), 2)
  END AS existing_greenspace_sqm,
  CASE WHEN m.mislink THEN '${mislinkFlag}' END AS existing_data_quality_flag,
  -- max_newbuild_coa off max-build (mislink-independent); KIT/BTH off the known footprint.
  CASE WHEN s.max_buildable_gfa_sqm IS NOT NULL THEN ROUND(s.max_buildable_gfa_sqm * (1 + ${coaUplift}), 2) END AS max_newbuild_coa_gfa_sqm,
  NULL::numeric AS cur_basement_gfa_sqm,       -- DEPRECATED (WF3-A) -> folded into cur_floor_gfa_sqm
  NULL::numeric AS cur_storey_gfa_sqm,         -- DEPRECATED (WF3-A) -> depended on retired existing_stories
  NULL::numeric AS cur_interior_reno_gfa_sqm,  -- DEPRECATED (WF3-A) -> folded into cur_pot_2story_gfa_sqm
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint * ${kitchenPct}, 2) END AS cur_est_kitchen_gfa_sqm,
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint * ${bathPct}, 2) END AS cur_est_bath_gfa_sqm,
  -- WF3-A current-building GFA range — a MENU of priceable scope options off the known footprint
  -- (computeCurGfaRange in max-build.js mirrors this). cur_pot_3story + range_basis gate on the pocket.
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint, 2) END AS cur_floor_gfa_sqm,
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint * 2, 2) END AS cur_pot_2story_gfa_sqm,
  CASE WHEN g.eff_footprint IS NOT NULL AND s.max_build_stories >= 3 THEN ROUND(g.eff_footprint * 3, 2) END AS cur_pot_3story_gfa_sqm,
  CASE WHEN g.eff_footprint IS NOT NULL AND s.max_build_stories IS NOT NULL
       THEN (CASE WHEN s.max_build_stories >= 3 THEN '1-3' ELSE '1-2' END) END AS cur_gfa_range_basis
FROM scope s
LEFT JOIN prim pr ON pr.pid = s.pid
LEFT JOIN allb a ON a.pid = s.pid
LEFT JOIN dims d ON d.pid = s.pid
CROSS JOIN LATERAL (
  SELECT (pr.p_footprint IS NOT NULL AND s.lot_size_sqm IS NOT NULL
          AND pr.p_footprint > s.lot_size_sqm * (1 + ${mislinkTol})) AS mislink
) m
CROSS JOIN LATERAL (
  SELECT CASE WHEN m.mislink THEN NULL ELSE pr.p_footprint END AS eff_footprint
) g;
`;
}

function buildExistingStructureUpdateSql() {
  const cols = mb.EXISTING_COLS;
  const setList = cols.map((c) => `${c} = e.${c}`).join(',\n    ');
  const guard = cols.map((c) => `p.${c} IS DISTINCT FROM e.${c}`).join('\n      OR ');
  return `
UPDATE parcels p SET
    ${setList}
FROM parcel_existing_struct e
WHERE p.parcel_id = e.parcel_id
  AND (
      ${guard}
  )
RETURNING p.id;`; // D#5 — ids feed the run's honest aggregate records_updated
}

function buildScenarioUpdateSql() {
  const cols = mb.SCENARIO_COLS;
  const setList = cols.map((c) => `${c} = e.${c}`).join(',\n    ');
  const guard = cols.map((c) => `p.${c} IS DISTINCT FROM e.${c}`).join('\n      OR ');
  return `
UPDATE parcels p SET
    ${setList}
FROM parcel_existing_struct e
WHERE p.parcel_id = e.parcel_id
  AND (
      ${guard}
  )
RETURNING p.id;`; // D#5 — ids feed the run's honest aggregate records_updated
}

async function runPass3(client, ctx, config) {
  const reno = {
    coaUplift: Number(config.reno_coa_uplift_pct),
    kitchenPct: Number(config.reno_kitchen_gfa_pct),
    bathPct: Number(config.reno_bath_gfa_pct),
    mislinkTol: Number(config.mislink_footprint_lot_tol),
  };
  await client.query('DROP TABLE IF EXISTS parcel_existing_struct');
  await client.query(buildExistingStructureSql({ scopeWhere: ctx.scopeWhere, full: ctx.full, reno }));
  const stats = await client.query(`
    SELECT
      COUNT(*)::int AS scoped,
      COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)::int AS with_footprint,
      COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)::int       AS with_gfa,
      COUNT(*) FILTER (WHERE existing_width_m IS NOT NULL AND existing_length_m IS NOT NULL)::int AS with_dims,
      COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')::int AS conf_high,
      COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')::int  AS conf_low,
      COUNT(*) FILTER (WHERE existing_other_structures_count > 0)::int AS with_other,
      COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)::int AS with_greenspace,
      COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)::int  AS with_coa,
      COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)::int         AS with_floor,
      COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)::int    AS with_pot2,
      COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)::int    AS with_pot3,
      COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)::int       AS with_range,
      COUNT(*) FILTER (WHERE existing_data_quality_flag = '${mb.MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT}')::int AS mislinked,
      COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)::int   AS with_kitchen,
      COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)::int      AS with_bath
    FROM parcel_existing_struct`);
  const upd = await client.query(buildExistingStructureUpdateSql());
  const updScenario = await client.query(buildScenarioUpdateSql());
  return {
    ...stats.rows[0],
    updated: upd.rowCount,
    updatedIds: upd.rows.map((r) => r.id),
    scenarioUpdated: updScenario.rowCount,
    scenarioUpdatedIds: updScenario.rows.map((r) => r.id),
  };
}

// ===========================================================================
// PASS 4 — comparable-builds kNN (Spec 78 §Phase-3C). Verbatim from :1080-1236, with the ONE mandatory
// seam substitution: now()::date -> a bound $N::date (ctx.clock.asOfDate()). Ports EP-D1/B4.5 (no
// IS DISTINCT FROM guard), EP-D8 (no structure-scale/type filter on the generic fallback) and EP-D9
// (no deterministic tiebreak on either ORDER BY) in their CURRENT WRONG FORM — Spec 123 §3.1 PIN.
// ===========================================================================

const COMP_WRITE_COLS = ['comparable_builds', 'comp_count', 'comp_dominant_build', 'comp_build_ratio_p50', 'comp_fsi_p50'];

function buildDecisionScopeWhere({ full = false } = {}) {
  if (full) return 'TRUE';
  return `EXISTS (
    SELECT 1 FROM coa_applications ca
    WHERE ca.zoning_dominant_parcel_id = p.id
      AND ca.parcel_linked_at IS NOT NULL
      AND ca.parcel_linked_at > COALESCE(p.massing_enriched_at, p.zoning_enriched_at, 'epoch'::timestamptz)
  )`;
}

/**
 * @param {{asOfDateParamIndex: number, windowYears: number}} clockOpts - $N placeholder index for the
 *   bound as-of date (caller supplies the value as a query param) and the (config-sourced) window length.
 */
function buildCompCandidatesSql({ asOfDateParamIndex, windowYears }) {
  return `
  CREATE TEMP TABLE comp_cand ON COMMIT DROP AS
  WITH recent AS (
    SELECT DISTINCT ON (pr.zoning_dominant_parcel_id)
      pr.zoning_dominant_parcel_id AS pid, pr.street_num, pr.street_name,
      pr.project_type, pr.residential_sqm, pr.storeys, pr.structure_type
    FROM permits pr
    WHERE pr.project_type IN ('new_build','addition')
      AND pr.issued_date >= ($${asOfDateParamIndex}::date - (${windowYears} * interval '1 year'))
      AND pr.zoning_dominant_parcel_id IS NOT NULL
    ORDER BY pr.zoning_dominant_parcel_id, pr.issued_date DESC, pr.residential_sqm DESC NULLS LAST
  ),
  coa AS (
    SELECT DISTINCT ON (zoning_dominant_parcel_id) zoning_dominant_parcel_id AS pid, decision
    FROM coa_applications
    WHERE zoning_dominant_parcel_id IS NOT NULL
    ORDER BY zoning_dominant_parcel_id, coalesce(decision_date, hearing_date) DESC NULLS LAST
  )
  SELECT pa.id, pa.geom, pa.zoning_class, pa.lot_size_sqm, pa.frontage_m,
    NULLIF(trim(coalesce(r.street_num,'') || ' ' || coalesce(r.street_name,'')), '') AS address,
    r.project_type AS work_type, r.residential_sqm AS permit_gfa, r.storeys AS storeys,
    -- R4 (Spec 78 P2): the comp's BUILT dwelling family (permit structure_type), falling back to the
    -- candidate parcel's zoning family when the permit is untyped — so comps match on dwelling FORM.
    COALESCE(${bn.structureFamilyCaseSql('r')}, ${bn.parcelFamilyFromZoningCaseSql('pa.zoning_class')}) AS comp_family,
    -- EP-D8 FIXED (peel 8y, pilot 9 commit 8 P4): TRUE only when the permit's OWN structure_type was
    -- genuinely classifiable (detached/townhouse/multiplex) — FALSE when comp_family instead fell back
    -- to the candidate's zoning-derived family (r.structure_type was NULL/unmatched, e.g. an apartment
    -- or other high-density permit with no low-density classification). Spec 78 §P3C.2 amendment.
    (${bn.structureFamilyCaseSql('r')} IS NOT NULL) AS comp_structure_type_known,
    CASE WHEN pa.lot_size_sqm > 0 AND r.residential_sqm > 0 THEN round(r.residential_sqm / pa.lot_size_sqm, 2) END AS permit_fsi,
    CASE WHEN pa.max_buildable_footprint_sqm > 0 AND pa.imagery_roof_footprint_sqm > 0
         THEN round(pa.imagery_roof_footprint_sqm / pa.max_buildable_footprint_sqm, 2) END AS build_ratio,
    coa.decision AS coa_decision
  FROM recent r
  JOIN parcels pa ON pa.id = r.pid
  LEFT JOIN coa ON coa.pid = r.pid
  WHERE pa.geom IS NOT NULL AND pa.zoning_class IS NOT NULL AND pa.lot_size_sqm > 0;`;
}

/**
 * Split out of buildCompCandidatesSql (found running commit 7e/2's own G2' golden capture,
 * 2026-09-07): "cannot insert multiple commands into a prepared statement". Once the comps
 * window's as-of-date became a BOUND $N::date parameter (Fold G3/§5.5 seam rewrite, commit 7c),
 * the CREATE TEMP TABLE...AS statement above is issued with a values array, so pg's node driver
 * uses the EXTENDED protocol (a real prepared statement) — which Postgres restricts to exactly
 * ONE command. The legacy script's own equivalent call passed NO params (a bare now()::date
 * literal, simple-protocol, multi-statement-safe), so the CREATE INDEX/ANALYZE pair riding the
 * same semicolon-joined string never tripped this. Issued as its own, parameter-free
 * client.query() call (no values array => simple protocol, multi-statement allowed again).
 */
function buildCompCandidatesIndexSql() {
  return `CREATE INDEX comp_cand_gix ON comp_cand USING gist (geom); ANALYZE comp_cand;`;
}

/**
 * SECURITY — scopeWhere is interpolated verbatim; trusted internal/test predicate only (never user input).
 * EP-D1/B4.5 FIXED (peel 8x, pilot 9 commit 8 P2, Spec 123 §3.1 pin-then-fix): the final UPDATE now
 * guards on IS DISTINCT FROM over all 5 comp columns — a genuinely unchanged parcel is skipped, not
 * rewritten every --full run (previously WHERE p.id = agg.id was the ONLY predicate; measured live,
 * 354,679 parcels rewritten every run regardless of actual change). comp_build_ratio_p50/comp_fsi_p50
 * are cast ::numeric on the computed side before comparison — the target columns are unbounded NUMERIC
 * (migration 202/204) but percentile_cont() returns double precision; casting BOTH sides to the SAME
 * type avoids the float8-vs-NUMERIC IS DISTINCT FROM trap (lessons.md:28, fence 7e130bff) even though,
 * unlike that fence's NUMERIC(5,4) column, this column's own unbounded scale means no rounding occurs
 * on write — the cast here is precision-safe, not a lossy round(). comparable_builds (jsonb) and
 * comp_dominant_build (text) compare structurally/exactly, no cast needed. NOTE (Ask 4, EP-D9): the
 * comps candidate SELECT feeding `agg` still has NO deterministic tiebreak until EP-D9 (peel, commit
 * 8 P3) lands — a tied subject can therefore still compute a differently-ordered `comparable_builds`
 * array on a rerun over UNCHANGED data, which this guard then (correctly, not spuriously) treats as a
 * real change; idempotent_rerun:"zero_writes" (descriptor) is the declared value for the COMBINED
 * P2+P3 state, not P2 in isolation. EP-D8 PIN: the generic (s.subj_family='all') fallback carries no
 * structure-scale/type filter (still open, peel 8y, commit 8 P4). EP-D9 PIN: neither ORDER BY below
 * carries a deterministic secondary tiebreak (still open, commit 8 P3).
 */
function buildComparableBuildsUpdateSql({ full = false, scopeWhere = 'TRUE', comp = {} } = {}) {
  const incr = full ? '' : 'AND sp.comp_count IS NULL';
  const {
    lotTol, knnOverfetch, topN, overCaptureClamp, fsiMinPlausible, fsiMaxPlausible,
  } = comp;
  return `
  UPDATE parcels p SET
    comparable_builds = agg.comps, comp_count = agg.cnt, comp_dominant_build = agg.dominant,
    comp_build_ratio_p50 = agg.br_p50, comp_fsi_p50 = agg.fsi_p50
  FROM (
    SELECT s.id,
      jsonb_agg(jsonb_build_object(
        'address', m.address, 'lot_sqm', m.lot_size_sqm, 'frontage_m', m.frontage_m,
        'distance_m', round(m.dist::numeric, 1), 'work_type', m.work_type, 'permit_gfa_sqm', m.permit_gfa,
        'permit_fsi', m.permit_fsi, 'storeys', m.storeys, 'coa_decision', m.coa_decision, 'build_ratio', m.build_ratio,
        'structure_family', m.comp_family
      ) ORDER BY m.dist) AS comps,
      count(*)::int AS cnt,
      mode() WITHIN GROUP (ORDER BY m.work_type) AS dominant,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY m.build_ratio)
        FILTER (WHERE m.build_ratio IS NOT NULL AND m.build_ratio <= ${overCaptureClamp}) AS br_p50,
      -- WF3: NEW-BUILD comps only (additions' residential_sqm = increment, not a whole build) + two-sided
      -- plausibility band (kills the FSI-361 data-entry outlier + the sub-0.05 mislabeled-minor-permit tail).
      -- The comparable_builds ARRAY above still lists additions (valid renovation-activity evidence).
      percentile_cont(0.5) WITHIN GROUP (ORDER BY m.permit_fsi)
        FILTER (WHERE m.permit_fsi IS NOT NULL AND m.work_type = 'new_build'
                AND m.permit_fsi BETWEEN ${fsiMinPlausible} AND ${fsiMaxPlausible}) AS fsi_p50
    FROM (
      -- subjects: residential parcels with a max-build envelope (scoped + incremental). Scoping HERE
      -- (not just at the final UPDATE) is what keeps a scoped/test run from kNN-ing all 486K parcels.
      SELECT sp.id, sp.geom, sp.zoning_class, sp.lot_size_sqm, sp.frontage_m,
        (${bn.parcelFamilyFromZoningCaseSql('sp.zoning_class')}) AS subj_family  -- R4: the subject's dwelling family
      FROM parcels sp
      WHERE sp.max_buildable_footprint_sqm IS NOT NULL AND sp.lot_size_sqm > 0 AND sp.zoning_class IS NOT NULL
        AND (${scopeWhere}) ${incr}
    ) s
    CROSS JOIN LATERAL (
      SELECT near.*
      FROM (
        -- GiST kNN: the N nearest candidates (index-served), excluding the subject itself.
        -- EP-D9 FIXED (peel, pilot 9 commit 8 P3): c.id is a deterministic secondary tiebreak —
        -- Postgres does not guarantee stable row order among exactly-tied ORDER BY keys (two
        -- candidates equidistant from s.geom), so without it which candidate lands inside the
        -- knnOverfetch window was run-to-run unspecified (golden-master G1' measured 15/430,404
        -- inner-kNN ties, 0.003%, a minority of the 248/486,530 comparable_builds instability —
        -- the outer rank tiebreak below is the dominant fix).
        SELECT c.*, c.geom <-> s.geom AS dist
        FROM comp_cand c
        WHERE c.id <> s.id
        ORDER BY c.geom <-> s.geom, c.id
        LIMIT ${knnOverfetch}
      ) near
      -- post-filter to genuinely comparable lots, then keep the topN most similar (|Dlot| + |Dfrontage|*10).
      -- R4 (Spec 78 P2): match on dwelling FAMILY — a specific-family subject (detached/townhouse/multiplex)
      -- pools comps of the same BUILT form (so RD + RS both count as detached); a generic 'all' subject
      -- (R/RA/RAC) keeps the exact-zoning match. Replaces the old bare near.zoning_class = s.zoning_class.
      -- EP-D8 FIXED (peel 8y, pilot 9 commit 8 P4, Spec 78 §P3C.2 amendment): the generic 'all' fallback
      -- ALSO requires near.comp_structure_type_known — a zoning-class match alone let an apartment-scale
      -- permit (comp_family:'all' via the zoning fallback, no classifiable structure_type) stand in for
      -- a detached-home subject (measured live: parcel 8244, R zoning/detached, 290 m2, carried
      -- comp_fsi_p50=6.615 sourced from a 1,695 m2 apartment-scale comp). Excluding unclassified/
      -- high-density comps from the fallback match closes that gap without touching the specific-family
      -- branch (near.comp_family = s.subj_family), which was never the defect.
      WHERE (near.comp_family = s.subj_family
             OR (s.subj_family = 'all' AND near.zoning_class = s.zoning_class AND near.comp_structure_type_known))
        AND near.lot_size_sqm BETWEEN s.lot_size_sqm * ${1 - lotTol} AND s.lot_size_sqm * ${1 + lotTol}
        AND (s.frontage_m IS NULL OR near.frontage_m IS NULL
             OR near.frontage_m BETWEEN s.frontage_m * ${1 - lotTol} AND s.frontage_m * ${1 + lotTol})
      -- EP-D9 FIXED (peel, pilot 9 commit 8 P3): near.id is a deterministic secondary tiebreak —
      -- the DOMINANT half of the fix (golden-master G1' measured 1,921/344,845 subjects, 0.56%,
      -- carrying an exact score TIE at this LIMIT topN boundary, a superset comfortably
      -- explaining the 248/486,530 comparable_builds instability observed across two identical
      -- back-to-back --full runs). Without it, which candidate broke a tied score and therefore
      -- landed in the top-N (and so in comparable_builds, and potentially shifted
      -- comp_dominant_build/comp_build_ratio_p50/comp_fsi_p50) was run-to-run unspecified.
      ORDER BY (abs(near.lot_size_sqm - s.lot_size_sqm) + abs(coalesce(near.frontage_m, 0) - coalesce(s.frontage_m, 0)) * 10), near.id
      LIMIT ${topN}
    ) m
    GROUP BY s.id
  ) agg
  WHERE p.id = agg.id
    AND (p.comparable_builds IS DISTINCT FROM agg.comps
      OR p.comp_count IS DISTINCT FROM agg.cnt
      OR p.comp_dominant_build IS DISTINCT FROM agg.dominant
      OR p.comp_build_ratio_p50 IS DISTINCT FROM agg.br_p50::numeric
      OR p.comp_fsi_p50 IS DISTINCT FROM agg.fsi_p50::numeric);`;
}

async function runPass4(client, ctx, config) {
  const comp = {
    lotTol: Number(config.enrich_parcels_comp_lot_tol),
    knnOverfetch: Number(config.enrich_parcels_comp_knn_overfetch),
    topN: Number(config.enrich_parcels_comp_top_n),
    overCaptureClamp: Number(config.enrich_parcels_comp_over_capture_clamp),
    fsiMinPlausible: Number(config.enrich_parcels_comp_fsi_min_plausible),
    fsiMaxPlausible: Number(config.enrich_parcels_comp_fsi_max_plausible),
  };
  const windowYears = Number(config.enrich_parcels_comps_window_years);
  const eligible = `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0 AND zoning_class IS NOT NULL`;
  const scopeWhere = ctx.scopeWhere;
  const full = ctx.full;
  // WF3: RESET stale comp_* on parcels that LOST eligibility (footprint -> NULL, e.g. a heritage-mislink
  // freeze) — the eligible-only reset below skips them, leaving a stale comp_fsi_p50 forever (same gated-pass
  // gap the optconfig reset fixes). Always-on (not just --full).
  const resetIneligible = await client.query(
    `UPDATE parcels p SET comparable_builds = NULL, comp_count = NULL, comp_dominant_build = NULL,
       comp_build_ratio_p50 = NULL, comp_fsi_p50 = NULL
     WHERE (${scopeWhere})
       AND (p.max_buildable_footprint_sqm IS NULL OR (p.lot_size_sqm > 0) IS NOT TRUE)
       AND p.comp_count IS NOT NULL`);
  // FULL re-run: clear stale comp data for the scope first, so a parcel whose comps disappeared resets.
  if (full) {
    await client.query(`UPDATE parcels SET comparable_builds = NULL, comp_count = NULL, comp_dominant_build = NULL,
      comp_build_ratio_p50 = NULL, comp_fsi_p50 = NULL WHERE ${eligible} AND (${scopeWhere})`);
  }
  const asOfDate = ctx.clock.asOfDate();
  await client.query(buildCompCandidatesSql({ asOfDateParamIndex: 1, windowYears }), [asOfDate]);
  await client.query(buildCompCandidatesIndexSql());
  const cand = (await client.query('SELECT count(*)::int AS n FROM comp_cand')).rows[0].n;
  const upd = await client.query(buildComparableBuildsUpdateSql({ full, scopeWhere, comp }));
  // Mark eligible subjects that matched NO comps as comp_count = 0 (a clean "processed" marker, so the
  // incremental comp_count IS NULL skip is correct and the zero-comp count is real, not hidden as NULL).
  const zeroFilled = await client.query(
    `UPDATE parcels p SET comp_count = 0 WHERE ${eligible} AND p.comp_count IS NULL AND (${scopeWhere})`);
  const dist = (await client.query(
    `SELECT count(*) FILTER (WHERE comp_count > 0)::int AS with_comps,
            count(*) FILTER (WHERE comp_count = 0)::int AS zero_comps,
            count(*) FILTER (WHERE comp_build_ratio_p50 IS NOT NULL)::int AS with_br
     FROM parcels WHERE ${eligible} AND (${scopeWhere})`)).rows[0];
  return { candidates: cand, updated: upd.rowCount, zero_filled: zeroFilled.rowCount, reset_ineligible: resetIneligible.rowCount || 0, ...dist };
}

// ===========================================================================
// PASS 5 — optimal-config (Spec 78 §Phase-3A). Verbatim from :1246-1748. Runs POST-COMMIT (Spec 78
// §P3A.1 — a same-txn read of what passes 1-4 just wrote would be invisible), on whatever connection
// the runner hands it after passes 1-4's shared transaction commits — this file treats that connection
// identically to the shared-txn `client` passes 1-4 use (it never opens/closes anything itself).
//
// The legacy pass streamed via pipeline.streamQuery(batchSize:200) — banned here (Rule 2, no
// ../pipeline). REVERTED at commit 7d (runner amendment) from an intermediate buffered
// client.query select back to a cursor-streamed read via the injected ctx.stream seam
// (Spec 122 §5.5) — the runner's own streamOverClient, pinned to the SAME session pass 5's
// SET LOCAL statement_timeout binds to (Fold B2), backed by the same pg-query-stream cursor
// primitive pipeline.streamQuery uses. Cursor batch size is config.enrich_parcels_pass5_
// stream_batch_size, distinct from config.enrich_parcels_optcfg_batch_size (the WRITE flush
// size, unchanged) — never holds more than one cursor batch of rows in memory. Row VALUES
// are unchanged either way.
// ===========================================================================

const OPTCFG_WRITE_COLS = [
  'opt_aor_storeys', 'opt_aor_gfa_sqm', 'opt_aor_units', 'opt_coa_storeys', 'opt_coa_gfa_sqm',
  'opt_suite_type', 'opt_suite_fits_full', 'opt_binding_constraint', 'opt_config_confidence',
  'optimal_config', 'nearby_builds_summary',
];
// D#5 — the 10 genuine columns (excludes nearby_builds_summary, a rolling production-cadence snapshot —
// Fold A1 correction: measured zero_writes under a held-data control, but still excluded from the
// records_updated "genuine envelope change" aggregate by convention, matching legacy :1403-1412).
const OPTCFG_GENUINE_COLS = OPTCFG_WRITE_COLS.filter((c) => c !== 'nearby_builds_summary');

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(x) { return x == null ? '?' : `${Math.round(Number(x) * 100)}%`; }

function buildMassingScopeWhereForOptConfig() {
  // pass 5 has no massing-specific scope predicate of its own — kept as a named no-op so a future
  // reader does not confuse pass-2's buildMassingScopeWhere (above) with pass 5's own incremental gate.
  return null;
}
void buildMassingScopeWhereForOptConfig;

/** The streaming read — verbatim SQL from :1261-1312. */
function buildOptConfigSelectSql({ full = false, scopeWhere = 'TRUE' } = {}) {
  const incrWhere = full ? '' : `AND (p.opt_config_confidence IS NULL
        OR (p.optimal_config->'as_of_right'->>'main_footprint_sqm')::numeric IS DISTINCT FROM p.max_buildable_footprint_sqm)`;
  return `
    SELECT p.id, p.lot_size_sqm, p.frontage_m, p.depth_m, p.max_buildable_footprint_sqm,
           p.max_buildable_gfa_sqm, p.max_buildable_gfa_basis,  -- WF3: envelope-storey derive for heritage (col is NULL there)
           p.bylaw_max_fsi, p.bylaw_max_coverage_pct, p.max_build_stories,
           p.abuts_laneway, p.zoning_holding, p.is_through_lot, p.is_heritage_designated,
           p.is_in_ravine_protection_area, p.exception_number, p.existing_greenspace_sqm,
           p.existing_other_structures_sqm, p.existing_other_structures_count, p.lot_size_confidence,
           p.neighbourhood_id, n.name AS neighbourhood_name,
           p.comp_fsi_p50,  -- WF3 phase A: narrative "typical FSI" falls back to realized_fsi_p50 when this (new-build comps) is NULL
           (${bn.parcelFamilyFromZoningCaseSql('p.zoning_class')}) AS norm_family, -- R4: which family cohort the norm came from
           (nbn.id IS NULL) AS used_citywide,
           -- P2 3-level family fallback: pocket-family (nbn) -> citywide-family (cwf) -> citywide-'all' (cwa).
           COALESCE(nbn.storeys_p50, cwf.storeys_p50, cwa.storeys_p50)                     AS storeys_p50,
           COALESCE(nbn.storeys_p90, cwf.storeys_p90, cwa.storeys_p90)                     AS storeys_p90,
           COALESCE(nbn.new_builds_5yr, cwf.new_builds_5yr, cwa.new_builds_5yr)            AS new_builds_5yr,
           COALESCE(nbn.additions_5yr, cwf.additions_5yr, cwa.additions_5yr)              AS additions_5yr,
           COALESCE(nbn.renos_5yr, cwf.renos_5yr, cwa.renos_5yr)                          AS renos_5yr,
           COALESCE(nbn.suites_5yr, cwf.suites_5yr, cwa.suites_5yr)                       AS suites_5yr,
           COALESCE(nbn.demos_5yr, cwf.demos_5yr, cwa.demos_5yr)                          AS demos_5yr,
           COALESCE(nbn.realized_fsi_p50, cwf.realized_fsi_p50, cwa.realized_fsi_p50)     AS realized_fsi_p50,
           COALESCE(nbn.realized_fsi_p90, cwf.realized_fsi_p90, cwa.realized_fsi_p90)     AS realized_fsi_p90,
           COALESCE(nbn.build_ratio_p50, cwf.build_ratio_p50, cwa.build_ratio_p50)        AS build_ratio_p50,
           COALESCE(nbn.existing_build_ratio_p25, cwf.existing_build_ratio_p25, cwa.existing_build_ratio_p25) AS existing_build_ratio_p25,
           COALESCE(nbn.existing_build_ratio_p50, cwf.existing_build_ratio_p50, cwa.existing_build_ratio_p50) AS existing_build_ratio_p50,
           COALESCE(nbn.coa_approved, cwf.coa_approved, cwa.coa_approved)                 AS coa_approved,
           COALESCE(nbn.coa_refused, cwf.coa_refused, cwa.coa_refused)                    AS coa_refused,
           COALESCE(nbn.coa_approval_rate, cwf.coa_approval_rate, cwa.coa_approval_rate)  AS coa_approval_rate,
           COALESCE(nbn.window_start, cwf.window_start, cwa.window_start)                 AS window_start,
           COALESCE(nbn.window_end, cwf.window_end, cwa.window_end)                       AS window_end,
           COALESCE(nbn.sample_n, cwf.sample_n, cwa.sample_n)                             AS nbn_sample_n
    FROM parcels p
    LEFT JOIN neighbourhoods n ON n.id = p.neighbourhood_id
    -- pocket-family: this neighbourhood, the parcel's dwelling family (from zoning; literal 'all' for
    -- generic-R/non-residential — a structure_family=NULL join predicate would always be false).
    LEFT JOIN neighbourhood_build_norms nbn
      ON nbn.neighbourhood_id = p.neighbourhood_id
      AND nbn.structure_family = (${bn.parcelFamilyFromZoningCaseSql('p.zoning_class')})
    -- citywide row for the parcel's family (absent for a sparse family -> NULL -> falls through to cwa).
    LEFT JOIN neighbourhood_build_norms cwf
      ON cwf.neighbourhood_id IS NULL
      AND cwf.structure_family = (${bn.parcelFamilyFromZoningCaseSql('p.zoning_class')})
    -- citywide 'all' backstop — exactly one row (partial unique index); asserted by the precondition guard.
    CROSS JOIN (SELECT * FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all') cwa
    WHERE p.max_buildable_footprint_sqm IS NOT NULL AND p.lot_size_sqm > 0 AND (${scopeWhere}) ${incrWhere}`;
}

/** Map a streamed DB row to the optimal-config engine input object. Verbatim from :1316-1353. */
function mapRowToEngineInput(r) {
  return {
    lotSizeSqm: numOrNull(r.lot_size_sqm),
    frontageM: numOrNull(r.frontage_m),
    depthM: numOrNull(r.depth_m),
    maxBuildableFootprintSqm: numOrNull(r.max_buildable_footprint_sqm),
    fsiCap: numOrNull(r.bylaw_max_fsi),
    coverageCapFrac: r.bylaw_max_coverage_pct != null ? numOrNull(r.bylaw_max_coverage_pct) / 100 : null,
    nbhdStoreysP50: numOrNull(r.storeys_p50) ?? numOrNull(r.max_build_stories),
    nbhdStoreysP90: numOrNull(r.storeys_p90) ?? numOrNull(r.max_build_stories),
    // WF3: the EFFECTIVE envelope-storey cap for the as-of-right tier = max_build_stories. Heritage is
    // now POPULATED from stories_calc (no longer NULL), so this fallback is a dead-but-correct safety net
    // for heritage: round(gfa/footprint) == round(footprint x stories_calc / footprint) == stories_calc.
    // GUARDED on heritage_existing basis [Regression Guardian] so a hypothetical non-heritage null-stories
    // + FSI parcel can't get a spurious fractional-ratio cap (the engine's fsiCap already bounds those).
    maxBuildStories: numOrNull(r.max_build_stories)
      ?? (r.max_buildable_gfa_basis === 'heritage_existing'
          && numOrNull(r.max_buildable_footprint_sqm) > 0 && numOrNull(r.max_buildable_gfa_sqm) != null
          ? Math.round(numOrNull(r.max_buildable_gfa_sqm) / numOrNull(r.max_buildable_footprint_sqm))
          : null),
    // R2 (Spec 78 P2, plan fold #3): DETACHED-ONLY realized-FSI grounding — townhouse/multiplex cohorts
    // are thin (e.g. ~25 multiplex builds citywide) so their p90 is noisy -> they keep the by-law FSI.
    realizedFsiP90: r.norm_family === 'detached' ? numOrNull(r.realized_fsi_p90) : null,
    abutsLaneway: r.abuts_laneway === true,
    isHolding: r.zoning_holding === 'H',
    isThroughLot: r.is_through_lot === true,
    isHeritageFreeze: r.is_heritage_designated === true,
    isRavine: r.is_in_ravine_protection_area === true,
    rearYardAreaSqm: numOrNull(r.existing_greenspace_sqm),
    rearBehindMaxM: null,
    existingAncillarySqm: numOrNull(r.existing_other_structures_sqm) || 0,
    existingAccessorySuspected: (numOrNull(r.existing_other_structures_count) || 0) > 0,
    lotSizeConfidence: r.lot_size_confidence,
  };
}

/** §J nearby_builds_summary — a frozen snapshot of the (coalesced) nbhd build-norm row + a headline. Verbatim from :1358-1384. */
function buildNearbyBuildsSummary(r) {
  if (r.nbn_sample_n == null) return null;
  const where = r.used_citywide ? 'Citywide' : (r.neighbourhood_name || `Nbhd ${r.neighbourhood_id}`);
  const ratio = r.build_ratio_p50 != null ? `, ${Math.round(Number(r.build_ratio_p50) * 100)}% of the max-build footprint` : '';
  const compFsi = r.comp_fsi_p50 != null ? Number(r.comp_fsi_p50) : null;
  const pocketFsi = r.realized_fsi_p50 != null ? Number(r.realized_fsi_p50) : null;
  const typicalFsi = compFsi ?? pocketFsi;
  const compFsiBasis = compFsi != null ? 'comp' : (pocketFsi != null ? 'pocket_realized' : 'none');
  const fsiClause = typicalFsi != null ? `; comparable builds ~${typicalFsi.toFixed(2)} FSI` : '';
  const headline = `${where}: ${r.new_builds_5yr || 0} new builds + ${r.additions_5yr || 0} additions + ${r.renos_5yr || 0} renos in 5 yrs; CoA ${pct(r.coa_approval_rate)} approval; typically ${r.storeys_p50 || '?'} storeys (p90 ${r.storeys_p90 || '?'})${ratio}${fsiClause}.`;
  return {
    basis: r.used_citywide ? 'citywide_fallback' : 'neighbourhood',
    structure_family: r.norm_family,
    neighbourhood_id: r.neighbourhood_id, window_start: r.window_start, window_end: r.window_end,
    new_builds_5yr: r.new_builds_5yr, additions_5yr: r.additions_5yr, renos_5yr: r.renos_5yr,
    suites_5yr: r.suites_5yr, demos_5yr: r.demos_5yr,
    realized_fsi_p50: r.realized_fsi_p50, build_ratio_p50: r.build_ratio_p50,
    typical_fsi: typicalFsi, comp_fsi_basis: compFsiBasis,
    existing_build_ratio_p25: r.existing_build_ratio_p25, existing_build_ratio_p50: r.existing_build_ratio_p50,
    storeys_p50: r.storeys_p50, storeys_p90: r.storeys_p90,
    coa_approved: r.coa_approved, coa_refused: r.coa_refused, coa_approval_rate: r.coa_approval_rate,
    sample_n: r.nbn_sample_n, headline,
  };
}

/** Turn a streamed row into the 11 flat+JSONB write values (or throw on a per-row engine error). Verbatim from :1387-1401. */
function computeOptConfigRow(r) {
  const cfg = optcfg.computeOptimalConfig(mapRowToEngineInput(r));
  let confidence = cfg.opt_config_confidence;
  if (r.exception_number != null && confidence === 'high') confidence = 'medium';
  const units = 1 + (cfg.opt_suite_fits_full ? 1 : 0);
  const nearby = buildNearbyBuildsSummary(r);
  return [
    cfg.as_of_right.main_storeys, cfg.as_of_right.main_gfa_sqm, units,
    cfg.coa_upside.main_storeys, cfg.coa_upside.main_gfa_sqm,
    cfg.opt_suite_type || 'none', cfg.opt_suite_fits_full, cfg.opt_binding_constraint, confidence,
    JSON.stringify(cfg), nearby == null ? null : JSON.stringify(nearby),
    r.id,
  ];
}

/**
 * Batched UPDATE ... FROM (VALUES ...). 12 params/row (11 cols + id). Verbatim SQL shape from
 * :1421-1469 — `pool` param renamed `client` (the runner hands this whatever connection pass 5 runs
 * on; this file never opens/closes it).
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {Array} batch
 * @param {Set<number>} [genuineIds]
 */
async function flushOptConfigBatch(client, batch, genuineIds = new Set()) {
  if (!batch.length) return 0;
  const cols = OPTCFG_WRITE_COLS;
  const perRow = cols.length + 1;
  const tuples = [];
  const params = [];
  for (let i = 0; i < batch.length; i++) {
    const base = i * perRow;
    tuples.push(`($${base + 1}::int, $${base + 2}::int, $${base + 3}::numeric, $${base + 4}::int, $${base + 5}::int, $${base + 6}::numeric, $${base + 7}::text, $${base + 8}::boolean, $${base + 9}::text, $${base + 10}::text, $${base + 11}::jsonb, $${base + 12}::jsonb)`);
    const row = batch[i];
    params.push(row[11], row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]);
  }
  // D#5 — the "genuine" flag (10 cols, nearby_builds_summary excluded) MUST be computed against the
  // PRE-update row via the `diffed` CTE (RETURNING sees the TARGET table's post-SET values, so a naive
  // WHERE-clause guard reused inside RETURNING would always read false).
  const incomingCols = cols.join(', ');
  const genuineGuard = OPTCFG_GENUINE_COLS.map((c) => `p.${c} IS DISTINCT FROM i.${c}`).join('\n        OR ');
  const setList = cols.map((c) => `${c} = d.${c}`).join(', ');
  const sql = `
    WITH incoming(id, ${incomingCols}) AS (
      VALUES ${tuples.join(',')}
    ),
    diffed AS (
      SELECT i.*,
        (${genuineGuard}) AS genuine,
        (p.nearby_builds_summary IS DISTINCT FROM i.nearby_builds_summary) AS nearby_changed
      FROM incoming i
      JOIN parcels p ON p.id = i.id
    )
    UPDATE parcels p SET
      ${setList}
    FROM diffed d
    WHERE p.id = d.id
      AND (d.genuine OR d.nearby_changed)
    RETURNING p.id, d.genuine`;
  const res = await client.query(sql, params);
  for (const row of res.rows) {
    if (row.genuine) genuineIds.add(row.id);
  }
  return res.rowCount || 0;
}

/**
 * D4' crash-safe scope hand-off recovery (migration 240). Handles ONLY prior runs' unconsumed
 * enrich_parcels_pass3_scope rows (run_id <> the current run).
 *
 * EP-D14 (WF3 .cursor/wf3_ep_d14_pass5_recovery_scan_active_task.md C1, 2026-09-09) — REWRITTEN
 * from the per-parcel loop (`UPDATE … WHERE parcel_id = $1`, a full scan: no index leads on
 * `parcel_id` alone, `idx_pass3_scope_unconsumed` is `(run_id) WHERE consumed_at IS NULL`).
 * Ask 1 ruling (Spec 78 §P3A.1 D4' recovery bound amendment) — F6 CORRECTED (output panel,
 * 2026-09-09; the ORIGINAL "pending is a superset of the stream scope" framing had the
 * argument backwards): under `--full`, stamping a pending row WITHOUT recompute is
 * BYTE-IDENTICAL to the legacy per-parcel loop's own output, for BOTH populations the pending
 * set can contain — (a) a parcel that is NO LONGER eligible (`buildOptConfigSelectSql`'s own
 * `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0` filter now excludes it): the
 * LEGACY per-parcel query already returned `rows.length === 0` for exactly this case and
 * stamped `consumed_at` ANYWAY (`if (succeeded) { UPDATE … }` ran regardless of whether a row
 * came back) — the new set-based stamp reproduces that "0 rows found, stamp anyway" outcome
 * directly, with no query needed to discover it; (b) a parcel that IS STILL eligible: the
 * `--full` stream (`ctx.stream`, `scopeWhere:'TRUE'`) scans EVERY currently-eligible parcel in
 * THIS SAME `runPass5` invocation, so it has ALREADY recomputed and flushed that exact parcel
 * earlier in this call — re-deriving the identical deterministic value in the recovery loop
 * would write nothing new, only repeat work already committed. Excluding only parcels that
 * threw an engine error in THIS run's own stream (their scope row must survive for a future
 * run's genuine recovery — stamping them here would erase the crash-recovery marker for a
 * genuinely unprocessed parcel). `!full ⇒` the pending set CAN genuinely fall outside the
 * incremental stream's own staleness predicate, so it IS recovered — batched
 * (`enrich_parcels_scope_recovery_batch_size` ids per `ANY($1::int[])` round trip), never
 * per-parcel.
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {number} runId
 * @param {{ errors: number, errorIds?: Set<number> }} stats
 * @param {Date} stamp
 * @param {Set<number>} genuineIds
 * @param {{info:Function,warn:Function,error:Function}} log
 * @param {{ full: boolean, batchSize: number, flushClient: {query: Function} }} opts
 */
async function consumePendingScope(client, runId, stats, stamp, genuineIds, log, opts) {
  const { full, batchSize, flushClient } = opts;
  // F10 (output panel, 2026-09-09) — the descriptor declares enrich_parcels_scope_recovery_batch_size
  // on_invalid:"fail" with bounds [100,10000] (scripts/lib/step/config.js resolveConfig), which
  // SHOULD already refuse a bad value before it ever reaches here — but this loop's own
  // `i += batchSize` NEVER ADVANCES if batchSize is NaN/0/negative (an infinite loop, not merely
  // a bad batch), so it is guarded here too, defense in depth, naming the remedy rather than
  // hanging silently.
  if (!full && (!Number.isFinite(batchSize) || batchSize <= 0)) {
    throw new Error(`${TAG} consumePendingScope: batchSize must be a positive finite number, got ${batchSize} — check enrich_parcels_scope_recovery_batch_size in logic_variables`);
  }
  const pending = await client.query(
    `SELECT DISTINCT parcel_id FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL AND run_id <> $1`,
    [runId],
  );
  const pendingIds = pending.rows.map((r) => r.parcel_id);
  stats.pending_scope_count = pendingIds.length;
  stats.scope_recovery_batches = 0;
  stats.scope_recovery_recovered_count = 0;
  stats.scope_stamped_without_recompute_count = 0;
  if (!pendingIds.length) return 0;

  if (full) {
    const errorIds = Array.from(stats.errorIds || []);
    const res = await client.query(
      `UPDATE enrich_parcels_pass3_scope SET consumed_at = $2
         WHERE consumed_at IS NULL AND run_id <> $1 AND parcel_id <> ALL($3::int[])`,
      [runId, stamp, errorIds],
    );
    stats.scope_stamped_without_recompute_count = res.rowCount || 0;
    return 0;
  }

  let recovered = 0;
  for (let i = 0; i < pendingIds.length; i += batchSize) {
    const idsBatch = pendingIds.slice(i, i + batchSize);
    stats.scope_recovery_batches += 1;
    // F2 (output panel, 2026-09-09) — per-BATCH error isolation, restoring the legacy
    // per-parcel loop's own guarantee (7e3cc6e70:1489-1499, which try-wrapped the SELECT +
    // computeOptConfigRow + flush for ONE parcel) at the coarser batch granularity this
    // rewrite operates at: a genuinely thrown batch SELECT or `flushOptConfigBatch`/
    // `ctx.flushBatch` call (a statement_timeout, a constraint violation — `flushBatch`
    // itself re-throws by design, `:BEGIN/SET LOCAL/<sql>/COMMIT` catch-and-rethrow above)
    // must isolate to THIS ONE BATCH, never abort the whole recovery loop. Per-parcel
    // granularity is KNOWINGLY COARSENED to per-batch here — a batch-level failure cannot
    // identify which specific parcel(s) inside it were the cause, so the WHOLE batch's ids
    // stay excluded from the stamp (unconsumed, correctly preserved for a future recovery
    // attempt) and stats.errors counts every id in the batch, not a per-parcel guess.
    try {
      const { rows } = await client.query(
        buildOptConfigSelectSql({ full: true, scopeWhere: 'p.id = ANY($1::int[])' }),
        [idsBatch],
      );
      const batchRows = [];
      const succeededIds = new Set(idsBatch);
      for (const r of rows) {
        try {
          batchRows.push(computeOptConfigRow(r));
        } catch (err) {
          succeededIds.delete(r.id);
          stats.errors += 1;
          log.warn(TAG, `D4' recovery: optimal-config engine error on parcel ${r.id}: ${err.message}`);
        }
      }
      if (batchRows.length) {
        recovered += await flushOptConfigBatch(flushClient, batchRows, genuineIds);
      }
      if (succeededIds.size) {
        await client.query(
          `UPDATE enrich_parcels_pass3_scope SET consumed_at = $2 WHERE parcel_id = ANY($1::int[]) AND consumed_at IS NULL`,
          [Array.from(succeededIds), stamp],
        );
      }
    } catch (err) {
      stats.errors += idsBatch.length;
      log.warn(TAG, `D4' recovery: batch error (${idsBatch.length} parcel ids, batch ${stats.scope_recovery_batches}): ${err.message}`);
    }
  }
  stats.scope_recovery_recovered_count = recovered;
  return recovered;
}

/**
 * Pass 5 — optimal-config. `run(client, ctx, config)`. Runs post-commit — `client` here is whatever
 * connection the runner hands this pass AFTER passes 1-4's shared transaction commits.
 */
async function runPass5(client, ctx, config) {
  // EP-D13 H1 fix (pilot 9 commit 8 P9, 2026-09-08) — the main loop's write flush
  // (below) routes through `ctx.flushBatch` (the runner's per-batch short-transaction
  // seam, Spec 122 §5.5) rather than `client` directly: each batch commits (or rolls
  // back) on its own instead of accumulating inside one ~90-minute transaction. Duck-
  // typed to `.query()` so `flushOptConfigBatch`'s own body needs no change at all.
  // Every OTHER statement in this function (the citywide backstop check just below,
  // the reset UPDATE, the scope-consumed UPDATE, `consumePendingScope`'s own queries,
  // the final scope-prune DELETE) still uses `client` directly — now genuinely
  // autocommit per statement (no outer transaction wraps this function at all
  // anymore), matching the legacy script's own `enrichOptimalConfig(pool, ...)`,
  // where every one of these was ALSO an independent autocommit call.
  const flushClient = { query: (sql, params) => ctx.flushBatch(sql, params) };
  const cw = await client.query(`SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all' LIMIT 1`);
  if (!cw.rowCount) {
    throw new Error(`${TAG} optimal-config: no citywide (NULL,'all') neighbourhood_build_norms backstop — run compute_build_norms (permits chain) first`);
  }
  const scopeWhere = ctx.scopeWhere;
  const full = ctx.full;
  const resetCols = OPTCFG_WRITE_COLS.map((c) => `${c} = NULL`).join(', ');
  const reset = await client.query(
    `UPDATE parcels p SET ${resetCols}
       WHERE (${scopeWhere})
         AND (p.max_buildable_footprint_sqm IS NULL OR (p.lot_size_sqm > 0) IS NOT TRUE)
         AND p.opt_config_confidence IS NOT NULL`);
  const stats = { updated: 0, reset_ineligible: reset.rowCount || 0, envelope_capped: 0, suite_fits: 0, conf_high: 0, conf_medium: 0, conf_low: 0, citywide: 0, errors: 0 };
  stats.genuineIds = new Set();
  // EP-D14 (WF3 C1) — parcels whose engine computation threw in THIS run's own stream.
  // Excluded from the set-based --full recovery stamp: their scope row must survive so
  // a future run's recovery can genuinely retry them (never silently erase the D4'
  // crash-recovery marker for a parcel that was never actually recomputed).
  stats.errorIds = new Set();

  const batchSize = Number(config.enrich_parcels_optcfg_batch_size);
  let batch = [];
  // Runner amendment (commit 7d) — REVERTED from a buffered client.query select back to
  // a cursor-streamed read via ctx.stream (the legacy pipeline.streamQuery(batchSize:200)
  // fence, Spec 122 §5.5's injected I/O seam form of it). ctx.stream's own cursor
  // batchSize is enrich_parcels_pass5_stream_batch_size — DISTINCT from
  // enrich_parcels_optcfg_batch_size (batchSize, above), which still controls only the
  // WRITE flush size. Never holds more than the cursor's own batchSize rows in memory.
  const streamBatchSize = Number(config.enrich_parcels_pass5_stream_batch_size);
  for await (const r of ctx.stream(buildOptConfigSelectSql({ full, scopeWhere }), [], { batchSize: streamBatchSize })) {
    let row;
    try {
      row = computeOptConfigRow(r);
    } catch (err) {
      stats.errors += 1;
      stats.errorIds.add(r.id);
      ctx.log.warn(TAG, `optimal-config engine error on parcel ${r.id}: ${err.message}`);
      continue;
    }
    if (row[6]) stats.suite_fits += 1;
    if (row[8] === 'high') stats.conf_high += 1;
    else if (row[8] === 'medium') stats.conf_medium += 1;
    else stats.conf_low += 1;
    if (r.used_citywide) stats.citywide += 1;
    const rawP50 = numOrNull(r.storeys_p50) ?? numOrNull(r.max_build_stories);
    const effMbs = numOrNull(r.max_build_stories)
      ?? (r.max_buildable_gfa_basis === 'heritage_existing'
          && numOrNull(r.max_buildable_footprint_sqm) > 0 && numOrNull(r.max_buildable_gfa_sqm) != null
          ? Math.round(numOrNull(r.max_buildable_gfa_sqm) / numOrNull(r.max_buildable_footprint_sqm))
          : null);
    if (effMbs != null && rawP50 != null && rawP50 > effMbs) stats.envelope_capped += 1;
    batch.push(row);
    if (batch.length >= batchSize) {
      stats.updated += await flushOptConfigBatch(flushClient, batch, stats.genuineIds);
      batch = [];
      // EP-D15 (WF3 C4) — report cumulative progress through the runner-owned seam (if the
      // caller provides one; compute stays JUST compute — the write cadence/connection are
      // the runner's job, this is only a number).
      if (typeof ctx.onProgress === 'function') ctx.onProgress(stats.updated);
    }
  }
  if (batch.length) {
    stats.updated += await flushOptConfigBatch(flushClient, batch, stats.genuineIds);
    if (typeof ctx.onProgress === 'function') ctx.onProgress(stats.updated);
  }

  // D4'/S-2 — flip THIS run's own scope rows in ONE set-based UPDATE now that the loop above has
  // attempted every row it covers, THEN recover ONLY prior runs' leftover.
  const runId = ctx.scopeRunId;
  const stamp = ctx.clock.now();
  if (runId != null) {
    // F9 (output panel, 2026-09-09) — exclude THIS run's own errored parcel ids from the
    // stamp, same carve-out `consumePendingScope`'s --full branch already applies to PRIOR
    // runs (:1509 `errorIds` array). Before this fix a parcel that threw in this run's own
    // stream still had its OWN scope row (inserted by index.js's hand-off INSERT for THIS
    // run's scopeRunId) stamped consumed HERE unconditionally — contradicting the whole
    // "an errored parcel's scope row must survive for a future genuine recovery" principle
    // the rest of this function is built around.
    const thisRunErrorIds = Array.from(stats.errorIds || []);
    await client.query(
      `UPDATE enrich_parcels_pass3_scope SET consumed_at = $2 WHERE run_id = $1 AND consumed_at IS NULL AND parcel_id <> ALL($3::int[])`,
      [runId, stamp, thisRunErrorIds],
    );
  }
  stats.updated += await consumePendingScope(client, runId ?? -1, stats, stamp, stats.genuineIds, ctx.log, {
    full,
    batchSize: Number(config.enrich_parcels_scope_recovery_batch_size),
    flushClient,
  });

  // EP-D10 fix (pilot 9 commit 8 P1, Spec 123 §3.1 pin-then-fix). enrich_parcels_pass3_scope
  // is genuinely unbounded/append-only by design (D4' crash-recovery, mig 240) — every --full
  // run INSERTs a fresh (run_id, parcel_id) row per eligible parcel and nothing ever deleted
  // them (measured: 442,244 rows/run, 100% duplication by run 4). The crash-recoverable
  // GUARANTEE only needs UNCONSUMED rows (consumed_at IS NULL) to survive a crash between
  // COMMIT and pass 5's read; a row whose consumed_at has already been stamped — by THIS run's
  // own set-based UPDATE above, or by consumePendingScope's per-row recovery loop just above —
  // has nothing left to recover and is pure debris. Pruned HERE, after every row this run could
  // process has already been attempted (both the current run's own rows and any prior run's
  // straggler), so a row a slower concurrent recovery might still need is never pruned out from
  // under it — the advisory lock (identity.lock) already serializes this step to one run at a
  // time, so "concurrent" here means only THIS invocation. Deliberately unconditional (every
  // consumed row from every past run, not just this one) — there is no future use for a
  // consumed row once written, and confining the DELETE to this run's own run_id would leave
  // every PRIOR run's already-consumed rows undeleted forever, which is the exact bug being fixed.
  const pruned = await client.query(`DELETE FROM enrich_parcels_pass3_scope WHERE consumed_at IS NOT NULL`);
  stats.scope_pruned = pruned.rowCount || 0;
  return stats;
}

// ===========================================================================
// computeDeferScope (Spec 122 §3.0b) — pre-transaction defer scope count. Verbatim from :1765-1794.
// ===========================================================================

async function countScopeRows(client, whereSql) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM parcels p WHERE p.geom IS NOT NULL AND (${whereSql})`);
  return rows[0].n;
}

async function countUnconsumedBacklog(client) {
  const { rows } = await client.query(
    `SELECT count(DISTINCT parcel_id)::int AS n FROM enrich_parcels_pass3_scope WHERE consumed_at IS NULL`,
  );
  return rows[0].n;
}

async function computeDeferScope(client, threshold) {
  const pass1Where = buildPass1ScopeWhere({ full: false });
  const massingWhere = buildMassingScopeWhere({ full: false });
  const decisionWhere = buildDecisionScopeWhere({ full: false });
  const [pass1, massing, decision, combined, backlog] = await Promise.all([
    countScopeRows(client, pass1Where),
    countScopeRows(client, massingWhere),
    countScopeRows(client, decisionWhere),
    countScopeRows(client, `(${pass1Where}) OR (${massingWhere}) OR (${decisionWhere})`),
    countUnconsumedBacklog(client),
  ]);
  // N-5: additive, not unioned with `combined` — a backlog parcel that ALSO matches pass1/massing/
  // decision is double-counted, which only makes the bound MORE conservative (never less).
  const scopeCount = combined + backlog;
  const ratio = threshold > 0 ? Math.round((scopeCount / threshold) * 100) / 100 : null;
  return { scope_count: scopeCount, threshold, ratio, perPass: { pass1, massing, decision, backlog } };
}

// ===========================================================================
// D#5 — the honest aggregate records_updated. Pure JS, verbatim from :1834-1842.
// ===========================================================================

function computeAggregateRecordsUpdated({ zoningIds, maxBuildIds, existingIds, scenarioIds, optConfigGenuineIds }) {
  const touched = new Set();
  for (const id of zoningIds || []) touched.add(id);
  for (const id of maxBuildIds || []) touched.add(id);
  for (const id of existingIds || []) touched.add(id);
  for (const id of scenarioIds || []) touched.add(id);
  for (const id of optConfigGenuineIds || []) touched.add(id);
  return touched.size;
}

// ===========================================================================
// Checks — one function per declared check, dispatch keys === descriptor.checks[].id, in descriptor
// order (§5.5 (1)/(4), enforced by src/tests/step-conformance.infra.test.ts's generic compute-pairs
// corpus scan). Each reads `ctx.matched.<id>` — a flat object the runner assembles, ONE ENTRY PER
// CHECK ID, from the 5 passes' own returned stats (e.g. `matched.massing_zero_link_ghost =
// mbResult.zero_link_ghost_cnt`) plus the two step-level queries the legacy main() ran inline
// (zone_class_pct, opt_aor_without_max_gfa) and the step's own wall-clock duration. This mirrors every
// other converted step's `ctx.matched` convention (refresh-snapshot.js, link-parcels.js) — the actual
// assembly is the runner's job (commit 7d), not this file's. These functions ARE the dispatch loop's
// targets: `compute(ctx)` (module.exports, below) iterates `ctx.checks` and calls `CHECKS[id](ctx)` —
// each function below reports via `ctx.report(id, observation)`, and the runner's generic
// `scripts/lib/step/verdict.js#deriveVerdict` (Rule 10) does the audit-row/verdict-cascade routing,
// same mechanism as every other converted step (EP-D3, CLOSED — see the file-header note above).
// ===========================================================================

function parcels_with_zone_class_pct_warn(ctx) {
  ctx.report('parcels_with_zone_class_pct_warn', { value: ctx.matched.zone_class_pct, detail: ctx.matched.zone_class_pct });
}

function parcels_with_zone_class_pct_fail(ctx) {
  ctx.report('parcels_with_zone_class_pct_fail', { value: ctx.matched.zone_class_pct, detail: ctx.matched.zone_class_pct });
}

function opt_config_engine_errors(ctx) {
  const n = ctx.matched.opt_config_engine_errors || 0;
  ctx.report('opt_config_engine_errors', { violations: n, detail: n });
}

function opt_aor_without_max_gfa(ctx) {
  const n = ctx.matched.opt_aor_without_max_gfa || 0;
  ctx.report('opt_aor_without_max_gfa', { violations: n, detail: n });
}

/** plan_shape/INFO — Rule 11's own order_guarantee node (declared on this check in the descriptor)
 *  IS the assertion; there is no runtime metric to additionally report here. */
function pass5_post_commit_read_order(ctx) {
  ctx.report('pass5_post_commit_read_order', { violations: 0, detail: 'post_commit — see checks[].order_guarantee' });
}

// EP-D14 (WF3 C1) — four checks observing the rewritten consumePendingScope.
function pending_scope_parcels(ctx) {
  const n = ctx.matched.pending_scope_parcels || 0;
  ctx.report('pending_scope_parcels', { violations: n, detail: n });
}

function scope_recovery_recovered_count(ctx) {
  const n = ctx.matched.scope_recovery_recovered_count || 0;
  ctx.report('scope_recovery_recovered_count', { violations: 0, detail: n });
}

function scope_recovery_batches(ctx) {
  const n = ctx.matched.scope_recovery_batches || 0;
  ctx.report('scope_recovery_batches', { violations: 0, detail: n });
}

function scope_stamped_without_recompute_count(ctx) {
  const n = ctx.matched.scope_stamped_without_recompute_count || 0;
  ctx.report('scope_stamped_without_recompute_count', { violations: 0, detail: n });
}

function parcels_enriched_count(ctx) {
  const n = ctx.matched.parcels_enriched_count || 0;
  ctx.report('parcels_enriched_count', { violations: 0, detail: n });
}

function parcels_ambiguous_zone_count(ctx) {
  const { ambiguous = 0, scoped = 0 } = ctx.matched.parcels_ambiguous_zone_count || {};
  const pct = scoped > 0 ? Math.round((1000 * ambiguous) / scoped) / 10 : 0;
  ctx.report('parcels_ambiguous_zone_count', { value: pct, detail: { ambiguous, scoped, pct } });
}

function zoning_fsi_source_nulled_count(ctx) {
  const n = ctx.matched.zoning_fsi_source_nulled_count || 0;
  ctx.report('zoning_fsi_source_nulled_count', { violations: 0, detail: n });
}

function max_build_enriched_count(ctx) {
  const n = ctx.matched.max_build_enriched_count || 0;
  ctx.report('max_build_enriched_count', { violations: 0, detail: n });
}

function massing_zero_link_ghost(ctx) {
  const n = ctx.matched.massing_zero_link_ghost || 0;
  ctx.report('massing_zero_link_ghost', { violations: n, detail: n });
}

function max_build_coverage_defaulted_count(ctx) {
  const n = ctx.matched.max_build_coverage_defaulted_count || 0;
  ctx.report('max_build_coverage_defaulted_count', { violations: 0, detail: n });
}

function max_build_box_excluded_count(ctx) {
  const n = ctx.matched.max_build_box_excluded_count || 0;
  ctx.report('max_build_box_excluded_count', { violations: 0, detail: n });
}

function heritage_mislink_footprint_count(ctx) {
  const n = ctx.matched.heritage_mislink_footprint_count || 0;
  ctx.report('heritage_mislink_footprint_count', { violations: 0, detail: n });
}

function ravine_constrained_count(ctx) {
  const n = ctx.matched.ravine_constrained_count || 0;
  ctx.report('ravine_constrained_count', { violations: 0, detail: n });
}

function existing_structure_enriched_count(ctx) {
  const n = ctx.matched.existing_structure_enriched_count || 0;
  ctx.report('existing_structure_enriched_count', { violations: 0, detail: n });
}

function existing_mislinked_footprint_count(ctx) {
  const n = ctx.matched.existing_mislinked_footprint_count || 0;
  ctx.report('existing_mislinked_footprint_count', { violations: 0, detail: n });
}

function scenario_enriched_count(ctx) {
  const n = ctx.matched.scenario_enriched_count || 0;
  ctx.report('scenario_enriched_count', { violations: 0, detail: n });
}

function comp_candidate_pool(ctx) {
  const n = ctx.matched.comp_candidate_pool || 0;
  ctx.report('comp_candidate_pool', { violations: 0, detail: n });
}

function comparable_builds_enriched_count(ctx) {
  const n = ctx.matched.comparable_builds_enriched_count || 0;
  ctx.report('comparable_builds_enriched_count', { violations: 0, detail: n });
}

function comp_zero_comps_count(ctx) {
  const n = ctx.matched.comp_zero_comps_count || 0;
  ctx.report('comp_zero_comps_count', { violations: 0, detail: n });
}

function optimal_config_enriched_count(ctx) {
  const n = ctx.matched.optimal_config_enriched_count || 0;
  ctx.report('optimal_config_enriched_count', { violations: 0, detail: n });
}

function opt_aor_envelope_capped_count(ctx) {
  const n = ctx.matched.opt_aor_envelope_capped_count || 0;
  ctx.report('opt_aor_envelope_capped_count', { violations: 0, detail: n });
}

function opt_config_citywide_fallback_count(ctx) {
  const n = ctx.matched.opt_config_citywide_fallback_count || 0;
  ctx.report('opt_config_citywide_fallback_count', { violations: 0, detail: n });
}

function enrich_parcels_duration_ms(ctx) {
  const n = ctx.matched.enrich_parcels_duration_ms || 0;
  ctx.report('enrich_parcels_duration_ms', { violations: 0, detail: n });
}

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  parcels_with_zone_class_pct_warn,
  parcels_with_zone_class_pct_fail,
  opt_config_engine_errors,
  opt_aor_without_max_gfa,
  pass5_post_commit_read_order,
  parcels_enriched_count,
  parcels_ambiguous_zone_count,
  zoning_fsi_source_nulled_count,
  max_build_enriched_count,
  massing_zero_link_ghost,
  max_build_coverage_defaulted_count,
  max_build_box_excluded_count,
  heritage_mislink_footprint_count,
  ravine_constrained_count,
  existing_structure_enriched_count,
  existing_mislinked_footprint_count,
  scenario_enriched_count,
  comp_candidate_pool,
  comparable_builds_enriched_count,
  comp_zero_comps_count,
  optimal_config_enriched_count,
  opt_aor_envelope_capped_count,
  opt_config_citywide_fallback_count,
  enrich_parcels_duration_ms,
  pending_scope_parcels,
  scope_recovery_recovered_count,
  scope_recovery_batches,
  scope_stamped_without_recompute_count,
};

// ---------------------------------------------------------------------------
// The declared phase order (execution.phases[] names, descriptor-matching). `pass5` is marked
// `post_commit` — the runner (commit 7d) must invoke it on a SEPARATE, post-commit connection.
// ---------------------------------------------------------------------------
const passes = [
  { name: 'zoning', txn: 'shared', run: runPass1 },
  { name: 'max_build', txn: 'shared', run: runPass2 },
  { name: 'existing_structure', txn: 'shared', run: runPass3 },
  { name: 'comparable_builds', txn: 'shared', run: runPass4 },
  { name: 'optimal_config', txn: 'post_commit', run: runPass5 },
];

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else; this is the same generic
 * checks-dispatch entry point every OTHER converted compute module exports (link-parcels.js,
 * refresh-snapshot.js, …) — ENRICHER needs it too, for the identical reason: `runWithPool`
 * (scripts/lib/step/index.js:3038) calls `runnable.compute(stepCtx)` directly, AFTER
 * `runEnrichPhase` has already used the SAME export's `.passes[]`/`.readZoningContract`/
 * `.computeDeferScope`/`.computeAggregateRecordsUpdated` properties to do the actual 5-pass
 * DB work. The two roles are orthogonal, not competing: `passes[]` is the ENRICHER-specific
 * per-pass execution table `runEnrichPhase` dispatches; `compute(ctx)` is the archetype-generic
 * checks/observations dispatcher every archetype's runner calls afterward. No conformance
 * amendment is needed — the suite's `.compute` expectation already generalizes; ENRICHER is
 * simply the first archetype whose compute module needs BOTH shapes on the one export.
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
  if (!ctx.matched) return { records_meta: {} };
  // A summarized subset of runEnrichPhase's own `matched` object (:2465-2503) — the
  // per-check `ctx.report` rows already carry the full per-metric detail; records_meta is
  // the human-scannable run-level roll-up, mirroring link-parcels.js's buildLinkMeta shape.
  return {
    records_meta: {
      duration_ms: ctx.matched.enrich_parcels_duration_ms,
      zone_class_pct: ctx.matched.zone_class_pct,
      total_parcels_scanned: ctx.matched.compute ? ctx.matched.compute.total_parcels_scanned : null,
      records_updated_aggregate: ctx.matched.compute ? ctx.matched.compute.records_updated_aggregate : null,
      parcels_enriched_count: ctx.matched.parcels_enriched_count,
      max_build_enriched_count: ctx.matched.max_build_enriched_count,
      existing_structure_enriched_count: ctx.matched.existing_structure_enriched_count,
      comparable_builds_enriched_count: ctx.matched.comparable_builds_enriched_count,
      optimal_config_enriched_count: ctx.matched.optimal_config_enriched_count,
      opt_config_engine_errors: ctx.matched.opt_config_engine_errors,
    },
  };
}

// `module.exports` MUST be the `compute(ctx)` FUNCTION itself (pipeline.step's own contract,
// scripts/lib/step/index.js:3321 — `typeof compute !== 'function'` throws), decorated with the
// same static properties every other converted compute module attaches (refresh-snapshot.js,
// link-parcels.js, …) — `runnable.compute` is both called directly (checks dispatch) AND handed
// into runEnrichPhase as the `compute` arg it reads `.passes[]`/`.readZoningContract`/
// `.computeDeferScope`/`.computeAggregateRecordsUpdated` off of.
module.exports = compute;
Object.assign(module.exports, {
  compute,
  ADVISORY_LOCK_ID: 65,
  TAG,
  BASE_SRC,
  OVERLAY_MIN_COLS,
  MEMBERSHIP_COLS,
  PROVENANCE_WRITE,
  ALL_WRITE_COLS,
  OVERLAY_LAYERS,
  readZoningContract,
  checks: CHECKS,
  // pass 1
  buildPass1ScopeWhere,
  buildEnrichmentSql,
  buildUpdateSql,
  runPass1,
  // pass 2
  buildMassingScopeWhere,
  buildMaxBuildSql,
  buildMaxBuildUpdateSql,
  buildMassingStampSql,
  runPass2,
  // pass 3
  buildExistingStructureSql,
  buildExistingStructureUpdateSql,
  buildScenarioUpdateSql,
  runPass3,
  // pass 4
  COMP_WRITE_COLS,
  buildDecisionScopeWhere,
  buildCompCandidatesSql,
  buildCompCandidatesIndexSql,
  buildComparableBuildsUpdateSql,
  runPass4,
  // pass 5
  OPTCFG_WRITE_COLS,
  OPTCFG_GENUINE_COLS,
  buildOptConfigSelectSql,
  mapRowToEngineInput,
  buildNearbyBuildsSummary,
  computeOptConfigRow,
  flushOptConfigBatch,
  consumePendingScope,
  runPass5,
  // defer scope
  countScopeRows,
  countUnconsumedBacklog,
  computeDeferScope,
  // aggregate
  computeAggregateRecordsUpdated,
  // dispatch
  passes,
});
