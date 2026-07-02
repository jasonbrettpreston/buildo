#!/usr/bin/env node
/**
 * Enrich Parcel Zoning (Spec 58 WF2 / Spec 65) — spatially joins parcels.geom
 * against the 10 zoning tables (migration 164) and writes the full Toronto
 * zoning by-law feed onto parcels via one set-based UPDATE.
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

// §R4 — logic-var schema (validated against RESOLVED post-default values in main()). Covers the
// pre-existing road_overlay_distance_m + the Phase-2 externalized reno factors + storey height.
// Bounds MUST mirror scripts/seeds/logic_variables.json (min/max) so a bad operator override FAILs
// loudly here (SC-3) rather than producing physically-nonsensical GFAs/storey counts. .strict() so a
// mistyped key (e.g. reno_coa_uplift_percent) raises instead of silently falling back to the default.
const LOGIC_VARS_SCHEMA = z.object({
  road_overlay_distance_m: z.coerce.number().finite().min(0).max(100),
  reno_coa_uplift_pct: z.coerce.number().finite().min(0).max(1),
  reno_kitchen_gfa_pct: z.coerce.number().finite().min(0.01).max(1),
  reno_bath_gfa_pct: z.coerce.number().finite().min(0.01).max(1),
  mislink_footprint_lot_tol: z.coerce.number().finite().min(0).max(1),  // WF3-A mislink guard tolerance
  storey_height_m: z.coerce.number().finite().min(2).max(6),
  // Phase 3 accessory + externalized garden-suite by-law constants (bounds mirror logic_variables.json).
  garage_min_lot_sqm: z.coerce.number().finite().min(100).max(2000),
  garage_max_gfa_sqm: z.coerce.number().finite().min(10).max(200),
  garage_min_footprint_sqm: z.coerce.number().finite().min(5).max(200),
  accessory_max_coverage_pct: z.coerce.number().finite().min(0.05).max(1.0),
  car_footprint_sqm: z.coerce.number().finite().min(10).max(40),
  laneway_suite_max_gfa_sqm: z.coerce.number().finite().min(20).max(400),
  laneway_suite_min_lot_sqm: z.coerce.number().finite().min(100).max(2000),
  laneway_suite_min_rear_yard_m: z.coerce.number().finite().min(2).max(30),
  min_soft_landscaping_pct: z.coerce.number().finite().min(0.05).max(0.90),
  laneway_suite_storeys: z.coerce.number().finite().min(1).max(4),
  garden_suite_storeys: z.coerce.number().finite().min(1).max(4),
  garden_suite_min_lot_sqm: z.coerce.number().finite().min(100).max(2000),
  garden_suite_min_rear_yard_m: z.coerce.number().finite().min(2).max(30),
  garden_suite_max_gfa_sqm: z.coerce.number().finite().min(10).max(200),
}).strict();
const {
  PRECEDENCE_RULES,
  AMBIGUOUS_DOMINANT_SHARE_MAX,
  DOMINANT_ORDER_BY,
  sqlAggregate,
} = require('./lib/zoning-precedence');
const mb = require('./lib/max-build');
const optcfg = require('./lib/optimal-config'); // Spec 78 Phase 3A — optimal-config engine
const bn = require('./lib/build-norms'); // Spec 78 P2 — parcelFamilyFromZoning family-aware norm read

// §R2 — advisory lock = spec number.
const ADVISORY_LOCK_ID = 65;
const PIPELINE_NAME = 'sources:enrich_parcels'; // chain-prefixed (matches manifest)
const PRODUCER_NAME = 'sources:load_zoning';    // Spec 58 producer we consume (§9)
const TAG = '[enrich-parcels]';

// Parcel column -> base-table (zoning_bylaw_areas) source column. These 20 are the
// dominant / MIN / MAX columns (rule lives in PRECEDENCE_RULES).
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
// Provenance written by the UPDATE (NOT zoning_enriched_at — that is always set,
// outside the IS DISTINCT FROM guard, so re-runs touch 0 rows).
const PROVENANCE_WRITE = [
  'zoning_overlays', 'zoning_base_source_id', 'zoning_dominant_area_share',
  'zoning_is_ambiguous', 'zoning_base_source_dataset_version',
];
const ALL_WRITE_COLS = [
  ...Object.keys(BASE_SRC), ...OVERLAY_MIN_COLS, ...MEMBERSHIP_COLS, ...PROVENANCE_WRITE,
];

// The 9 overlay layers keyed by their Spec 58 §9 `zoning_layers_loaded` snake-case
// key. Drives both stale-skip (consumer protocol §2 item 4) and the
// `<key>_overlay_stale` audit rows. `numeric` layers feed dedicated columns;
// `poly`/`line` layers feed the boolean membership columns.
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

// Belt-and-braces: the rule map and BASE_SRC must agree on the base columns.
for (const c of Object.keys(BASE_SRC)) {
  if (!PRECEDENCE_RULES[c]) throw new Error(`${TAG} BASE_SRC column ${c} has no precedence rule`);
}

// ---------------------------------------------------------------------------
// Preconditions (Gemini-B / D9) — the spatial join is non-viable without these.
// ---------------------------------------------------------------------------
async function assertPreconditions(client) {
  const pg = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  if (pg.rows.length === 0) {
    throw new Error(`${TAG} PostGIS extension not installed — cannot run the zoning spatial join`);
  }
  const idx = await client.query(
    `SELECT 1 FROM pg_indexes
      WHERE tablename = 'parcels' AND indexdef ILIKE '%gist%' AND indexdef ILIKE '%geom%' LIMIT 1`,
  );
  if (idx.rows.length === 0) {
    throw new Error(`${TAG} no GiST index on parcels.geom (expected idx_parcels_geom_gist, migration 039) — refusing to run a sequential-scan join`);
  }
}

// ---------------------------------------------------------------------------
// Consumer read protocol (Spec 58 §9 + §11) — reconcile skip-forwarding (D2).
// ---------------------------------------------------------------------------
async function readZoningContract(pool) {
  const latest = await pool.query(
    `SELECT status, records_meta FROM pipeline_runs WHERE pipeline = $1 ORDER BY started_at DESC LIMIT 1`,
    [PRODUCER_NAME],
  );
  if (latest.rows.length && latest.rows[0].status === 'failed') {
    throw new Error(`${TAG} latest ${PRODUCER_NAME} run FAILED — halting (will not enrich against stale zoning)`);
  }
  // Most-recent run carrying a real layer map (Spec 58 §11 forwards it on skip runs).
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

// ---------------------------------------------------------------------------
// SQL builder (DEC-3 — pure set-based; decomposed temp-table → trivial UPDATE).
// scopeWhere is a trusted internal/test predicate over alias `p`. roadDist is $1.
// ---------------------------------------------------------------------------
function buildEnrichmentSql({ scopeWhere = 'TRUE', full = false, staleOverlays = new Set() }) {
  // SECURITY — scopeWhere is interpolated verbatim into the SQL. It MUST come from
  // trusted code only (main() passes the literal 'TRUE'; tests pass literal predicates).
  // NEVER pass user/request-derived input here — it would be a SQL-injection vector.
  const incremental = full
    ? 'TRUE'
    : `(p.zoning_enriched_at IS NULL OR EXISTS (
         SELECT 1 FROM zoning_bylaw_areas zv
         WHERE zv.geom && p.geom AND ST_Intersects(p.geom, zv.geom)
           AND zv.source_dataset_version > p.zoning_enriched_at))`;

  const baseAgg = Object.entries(BASE_SRC)
    .map(([col, src]) => `      ${sqlAggregate(col, src)} AS ${col}`)
    .join(',\n');

  // Membership overlays — set-based DISTINCT join CTEs (one GIST spatial join each),
  // NOT per-parcel correlated EXISTS (which is O(parcels) and does not scale to 486K).
  // Polygon overlays use ST_Intersects + NOT ST_Touches (drop edge/point-only contacts,
  // consistent with the base join). LineString overlays use a geometry-bbox prefilter on
  // the GiST index before the exact ::geography ST_DWithin (PERF — spike §4). The bbox is
  // expanded by metres÷78000: at Toronto's latitude a degree of LONGITUDE is only ~80.5 km
  // (111320·cos 43.7°), so dividing by 78000 (< 80500) guarantees the box is ≥ roadDist in
  // EVERY direction — a tighter 111320 divisor would under-cover E-W and silently miss roads.
  const mem = OVERLAY_LAYERS.filter((l) => l.col); // poly + line layers
  const active = mem.filter((l) => !staleOverlays.has(l.key));
  const memberCtes = active.map((l) =>
    `mem_${l.col} AS (
  SELECT DISTINCT s.parcel_id FROM scope s
  JOIN ${l.table} o ON ${l.kind === 'line'
      ? 'o.geom && ST_Expand(s.geom, ($1 / 78000.0)) AND ST_DWithin(s.geom::geography, o.geom::geography, $1)'
      : 'o.geom && s.geom AND ST_Intersects(s.geom, o.geom) AND NOT ST_Touches(s.geom, o.geom)'}
)`).join(',\n');
  // Stale overlays degrade to FALSE (consumer protocol §2 item 4 — base-only).
  const memberSelect = mem
    .map((l) => staleOverlays.has(l.key)
      ? `  false AS ${l.col}`
      : `  (mem_${l.col}.parcel_id IS NOT NULL) AS ${l.col}`).join(',\n');
  const memberJoins = active
    .map((l) => `LEFT JOIN mem_${l.col} ON mem_${l.col}.parcel_id = s.parcel_id`).join('\n');

  // Numeric overlays (height, lot_coverage) — skipped entirely when stale (degrade to
  // base; coverage falls back to the base column, height/stories become NULL).
  const heightStale = staleOverlays.has('height_overlay');
  const covStale = staleOverlays.has('lot_coverage_overlay');
  const heightCte = heightStale ? '' : `height_agg AS (
  SELECT s.parcel_id, MIN(h.height_max_m) AS bylaw_max_height_m, MIN(h.ht_stories) AS bylaw_max_stories
  FROM scope s JOIN zoning_height_overlay h ON h.geom && s.geom AND ST_Intersects(s.geom, h.geom)
  GROUP BY s.parcel_id
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
         -- fsi_max > 10 is corrupt data (real RD/RS/RM ≤ ~2, RA apartment ≤ ~8-10; CR is exempt —
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
      -- unequal every run → multi-zone parcels never reach their idempotent fixed point).
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
  );`;
}

// ---------------------------------------------------------------------------
// Engine — runs on a single `client` (caller owns the transaction). Returns counts.
// ---------------------------------------------------------------------------
async function enrichParcels(client, opts = {}) {
  const { scopeWhere = 'TRUE', full = false, roadDist = 5, runAt = null, staleOverlays = new Set() } = opts;
  await client.query('DROP TABLE IF EXISTS parcel_zoning_enrich');
  await client.query(buildEnrichmentSql({ scopeWhere, full, staleOverlays }), [roadDist]);

  // Stats incl. per-attr sparse null-rates (DEC-4 — INFO, never gated).
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

  const stamp = runAt || (await pipeline.getDbTimestamp(client));
  const upd = await client.query(buildUpdateSql(), [stamp]);

  return {
    scoped: Number(s.scoped),
    updated: upd.rowCount,
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

// ---------------------------------------------------------------------------
// Max-build envelope (Spec 65 § Max-build) — SECOND set-based UPDATE pass. Reads the
// already-written zoning feed (bylaw_max_*) + lot dims (frontage_m/depth_m) + geom + the
// massing join, computes a lot-validated 3D envelope. Deliberately SEPARATE from the zoning
// engine: own MAX_BUILD_COLS array + own UPDATE — NOT in ALL_WRITE_COLS / buildEnrichmentSql
// (protects the 36-col regression lock + idempotency fences). Runs in the SAME transaction
// AFTER enrichParcels, so parcel_zoning_enrich (ON COMMIT DROP) is still visible for scoping.
// ---------------------------------------------------------------------------
function buildMaxBuildSql({ scopeWhere = 'TRUE', full = false, storeyHeight = mb.RESIDENTIAL_STOREY_HEIGHT_M, acc = {} }) {
  // SECURITY — scopeWhere is interpolated verbatim; trusted internal/test predicate only.
  // Incremental: first-time (lot_size_confidence NULL) OR a parcel whose zoning was re-enriched
  // this run (present in parcel_zoning_enrich). --full recomputes all (use after a massing/lot reload).
  const incremental = full
    ? 'TRUE'
    : `(p.lot_size_confidence IS NULL OR EXISTS (SELECT 1 FROM parcel_zoning_enrich z WHERE z.parcel_id = p.parcel_id))`;
  const { LOT_TOLERANCE: tol, LOT_MIN_SQM, LOT_MAX_SQM, RAVINE_SETBACK_M } = mb;
  // Phase-3 accessory + (now externalized) garden-suite by-law constants — values from logic_variables
  // (resolved in main()), defaults from max-build.js. Interpolated as numeric literals (Number()).
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
         -- WF3-C2: parcel→neighbourhood (centroid-in-polygon, deterministic tiebreak). LEFT JOINs can't
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
  SELECT pb.parcel_id AS pid,
         SUM(bf.footprint_area_sqm) FILTER (WHERE pb.is_primary)::numeric AS existing_footprint_sqm,
         MAX(bf.estimated_stories) FILTER (WHERE pb.is_primary) AS existing_stories,
         SUM(bf.footprint_area_sqm)::numeric AS existing_total_footprint_sqm
  FROM parcel_buildings pb JOIN building_footprints bf ON bf.id = pb.building_id
  GROUP BY pb.parcel_id
),
sb AS (
  SELECT s.*, m.existing_footprint_sqm, m.existing_stories, m.existing_total_footprint_sqm,
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
    GREATEST(0, (CASE WHEN is_corner_lot THEN frontage_m - front_setback - flankage_setback
                      ELSE frontage_m - side_count * side_setback END)  -- WF3-B: party-wall side_count (was 2×)
                - (CASE WHEN is_in_ravine_protection_area THEN ${RAVINE_SETBACK_M} ELSE 0 END)) AS width_raw,
    GREATEST(0, (CASE WHEN is_through_lot THEN depth_m - 2 * front_setback
                      ELSE depth_m - front_setback - rear_setback END)
                - (CASE WHEN is_in_ravine_protection_area THEN ${RAVINE_SETBACK_M} ELSE 0 END)) AS length_raw
  FROM tier
),
geo AS (
  SELECT box.*,
    NULLIF(width_raw, 0) AS width_m,
    NULLIF(length_raw, 0) AS length_m,
    CASE WHEN width_raw > 0 AND length_raw > 0 THEN round(width_raw * length_raw, 2) END AS box_area,
    -- uniform negative buffer (shape-aware, dir-blind): side setback (party-wall-scaled, WF3-B) + ravine. Empty (lot < 2×inset) → NULL.
    NULLIF(round(ST_Area(ST_Buffer(geom::geography, -(side_setback * side_count / 2.0 + ravine_red)))::numeric, 2), 0) AS buffer_area,
    CASE WHEN bylaw_max_coverage_pct IS NOT NULL THEN round(lot_size_sqm * bylaw_max_coverage_pct / 100.0, 2) END AS coverage_cap,
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
    -- LEAST ignores NULLs → footprint = min of whatever measures exist (buffer ⋂ box ⋂ coverage cap).
    LEAST(buffer_area, box_area, coverage_cap) AS footprint_calc,
    is_heritage_designated AS heritage,
    (is_heritage_designated AND existing_footprint_sqm IS NULL) AS heritage_no_massing,
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
  CASE WHEN emit AND NOT heritage THEN width_m END AS max_build_width_m,
  CASE WHEN emit AND NOT heritage THEN length_m END AS max_build_length_m,
  CASE WHEN emit AND NOT heritage THEN bylaw_max_height_m END AS max_build_height_m,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN existing_stories
       ELSE stories_calc END AS max_build_stories,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN 'existing'
       WHEN bylaw_max_stories IS NOT NULL THEN 'bylaw'
       WHEN pocket_p50 IS NOT NULL THEN 'pocket'
       WHEN bylaw_max_height_m IS NOT NULL AND bylaw_max_height_m > 0 THEN 'derived'
       ELSE NULL END AS max_build_stories_basis,
  -- WF3-C2: market-realized ceiling (p90, UNCAPPED) + the variance hotspot; neighbourhood link + premium (ALL parcels, ungated).
  CASE WHEN NOT emit OR heritage_no_massing OR heritage THEN NULL ELSE pocket_p90 END AS max_build_stories_aggressive,
  COALESCE(emit AND NOT heritage AND pocket_p90 IS NOT NULL AND height_implied IS NOT NULL AND pocket_p90 > height_implied, false) AS market_exceeds_bylaw,
  neighbourhood_id,
  round((${mb.buildPremiumCase('nbhd_income')})::numeric, 2) AS neighbourhood_cost_premium,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN 'heritage_existing' ELSE 'rect_approx' END AS max_build_basis,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN round(existing_footprint_sqm * COALESCE(existing_stories, 1), 2)
       ELSE LEAST(gfa_box, fsi_cap) END AS max_buildable_gfa_sqm,
  CASE WHEN NOT emit OR heritage_no_massing THEN NULL
       WHEN heritage THEN 'heritage_existing'
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
    WHEN NOT emit THEN 'low_lot_confidence'
    WHEN heritage_no_massing THEN 'heritage_no_massing'
    WHEN heritage THEN 'heritage'
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
            >= ${minSoftPct} * lot_size_sqm THEN 'as_of_right' ELSE 'coa_required' END AS rear_suite_permission
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
  );`;
}

async function enrichMaxBuild(client, opts = {}) {
  const { scopeWhere = 'TRUE', full = false, storeyHeight = mb.RESIDENTIAL_STOREY_HEIGHT_M, acc = {} } = opts;
  await client.query('DROP TABLE IF EXISTS parcel_max_build');
  await client.query(buildMaxBuildSql({ scopeWhere, full, storeyHeight, acc }));
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
      COUNT(*) FILTER (WHERE neighbourhood_cost_premium IS NOT NULL AND neighbourhood_cost_premium > 1.00)::int AS premium_above_1
    FROM parcel_max_build`);
  const upd = await client.query(buildMaxBuildUpdateSql());
  return { ...stats.rows[0], updated: upd.rowCount };
}

// ---------------------------------------------------------------------------
// Existing-structure (Spec 65 Phase 1) — THIRD set-based UPDATE pass. SEPARATE from the
// max-build pass (its `massing` CTE is SUM…FILTER(is_primary) GROUP BY, feeding the heritage
// freeze — left byte-identical). Reads the PRIMARY linked building (one row/parcel by mig 081's
// partial unique index, so no GROUP BY) for footprint/stories/height/geom/confidence; an `allb`
// CTE aggregates non-primary count/Σ; greenspace = lot − primary − other (no ST_Union — perf).
// Runs in the SAME txn after enrichMaxBuild, scoped to parcel_max_build (the incremental set).
// ---------------------------------------------------------------------------
function buildExistingStructureSql({ scopeWhere = 'TRUE', full = false, reno = {} }) {
  const incremental = full
    ? 'TRUE'
    : '(p.imagery_roof_footprint_sqm IS NULL OR EXISTS (SELECT 1 FROM parcel_max_build z WHERE z.parcel_id = p.parcel_id))';
  const confMin = mb.EXISTING_CONFIDENCE_HIGH_MIN;
  // Phase-2 scenario factors (externalized logic-vars; defaults from max-build.js).
  const coaUplift = Number(reno.coaUplift ?? mb.RENO_COA_UPLIFT_PCT_DEFAULT);
  const kitchenPct = Number(reno.kitchenPct ?? mb.RENO_KITCHEN_GFA_PCT_DEFAULT);
  const bathPct = Number(reno.bathPct ?? mb.RENO_BATH_GFA_PCT_DEFAULT);
  // WF3-A mislink guard tolerance (externalized logic-var mislink_footprint_lot_tol; default 0.05).
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
  -- raw 4326 (degree) geom distorts the minimum-rotated rectangle at Toronto's latitude (1° lon ≈ 0.72°
  -- lat), inflating length ~7% (measured n=272). 2952 is already metres → no ::geography cast. Areal geoms only.
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
  -- (block/neighbour attribution). g.eff_footprint is NULL when mislinked → the WHOLE existing
  -- structure resolves NULL; existing_data_quality_flag records why. Footprint is otherwise trusted.
  -- imagery_roof_footprint_sqm (mig 201 rename): massing roof footprint — imagery, ±20–38% unreliable.
  CASE WHEN g.eff_footprint IS NOT NULL THEN ROUND(g.eff_footprint, 2) END AS imagery_roof_footprint_sqm,
  NULL::integer AS existing_stories,   -- RETIRED (WF3-A): massing estimated_stories tree-contaminated (mode 3 storeys on bungalows)
  NULL::numeric AS existing_height_m,  -- RETIRED (WF3-A): massing max_height_m catches canopy, not roof (bungalows to 85-95 m)
  -- imagery_roof_gfa_sqm (mig 201 rename): imagery roof footprint × 2 (typical 2-storey menu option).
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
  NULL::numeric AS cur_basement_gfa_sqm,       -- DEPRECATED (WF3-A) → folded into cur_floor_gfa_sqm
  NULL::numeric AS cur_storey_gfa_sqm,         -- DEPRECATED (WF3-A) → depended on retired existing_stories
  NULL::numeric AS cur_interior_reno_gfa_sqm,  -- DEPRECATED (WF3-A) → folded into cur_pot_2story_gfa_sqm
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
  );`;
}

// Sibling UPDATE for the Phase-2 scenario GFAs — reads the SAME parcel_existing_struct temp table
// (which now also SELECTs SCENARIO_COLS); distinct array + own IS-DISTINCT-FROM guard so the
// EXISTING_COLS update stays byte-stable.
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
  );`;
}

async function enrichExistingStructure(client, opts = {}) {
  const { scopeWhere = 'TRUE', full = false, reno = {} } = opts;
  await client.query('DROP TABLE IF EXISTS parcel_existing_struct');
  await client.query(buildExistingStructureSql({ scopeWhere, full, reno }));
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
  return { ...stats.rows[0], updated: upd.rowCount, scenarioUpdated: updScenario.rowCount };
}

// ---------------------------------------------------------------------------
// Comparable-builds pass (Spec 78 Phase 3C) — §K parcel-level named comps via a spatial kNN. Runs
// INSIDE the main txn (4th SQL pass): reads the same-txn max-build envelope + imagery_roof footprint +
// committed permits/coa. Materializes the permitted-parcel candidate set ONCE (~9.6K rows) into a temp
// table with a GiST geom index, then per residential subject does a LATERAL kNN (over-fetch 50 nearest,
// post-filter zoning + lot/frontage ±20%, top-10 by similarity, jsonb_agg). NOT a 486K cross-join.
// ---------------------------------------------------------------------------

const COMP_WRITE_COLS = ['comparable_builds', 'comp_count', 'comp_dominant_build', 'comp_build_ratio_p50', 'comp_fsi_p50'];
const COMP_LOT_TOL = 0.2;        // ±20% lot-size / frontage similarity window
const COMP_KNN_OVERFETCH = 50;   // GiST kNN over-fetch before the similarity post-filter
const COMP_TOP_N = 10;           // comps kept per subject
const COMP_OVER_CAPTURE_CLAMP = 1.1; // build_ratio above this = massing over-capture → excluded from p50

// Candidate set: parcels with a recent (5-yr) new-build/addition permit — the principal such permit
// supplies the address + what-built + realized GFA/FSI; the build_ratio is massing-footprint ÷ max-build.
function buildCompCandidatesSql() {
  // Start from the SMALL filtered permit set (~9.6K), pre-aggregate the principal permit + CoA decision
  // per parcel (DISTINCT ON), THEN join parcels — NOT a parcels(486K)-driven scan with a per-row CoA
  // LATERAL (which was a >90s plan). build_ratio = imagery roof footprint ÷ max-build (massing realized).
  return `
  CREATE TEMP TABLE comp_cand ON COMMIT DROP AS
  WITH recent AS (
    SELECT DISTINCT ON (pr.zoning_dominant_parcel_id)
      pr.zoning_dominant_parcel_id AS pid, pr.street_num, pr.street_name,
      pr.project_type, pr.residential_sqm, pr.storeys, pr.structure_type
    FROM permits pr
    WHERE pr.project_type IN ('new_build','addition')
      AND pr.issued_date >= (now()::date - interval '5 years')
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
    CASE WHEN pa.lot_size_sqm > 0 AND r.residential_sqm > 0 THEN round(r.residential_sqm / pa.lot_size_sqm, 2) END AS permit_fsi,
    CASE WHEN pa.max_buildable_footprint_sqm > 0 AND pa.imagery_roof_footprint_sqm > 0
         THEN round(pa.imagery_roof_footprint_sqm / pa.max_buildable_footprint_sqm, 2) END AS build_ratio,
    coa.decision AS coa_decision
  FROM recent r
  JOIN parcels pa ON pa.id = r.pid
  LEFT JOIN coa ON coa.pid = r.pid
  WHERE pa.geom IS NOT NULL AND pa.zoning_class IS NOT NULL AND pa.lot_size_sqm > 0;
  CREATE INDEX comp_cand_gix ON comp_cand USING gist (geom);
  ANALYZE comp_cand;`;
}

// SECURITY — scopeWhere is interpolated verbatim; trusted internal/test predicate only (never user input).
function buildComparableBuildsUpdateSql({ full = false, scopeWhere = 'TRUE' } = {}) {
  const incr = full ? '' : 'AND sp.comp_count IS NULL';
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
        FILTER (WHERE m.build_ratio IS NOT NULL AND m.build_ratio <= ${COMP_OVER_CAPTURE_CLAMP}) AS br_p50,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY m.permit_fsi) FILTER (WHERE m.permit_fsi IS NOT NULL) AS fsi_p50
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
        -- GiST kNN: the 50 nearest candidates (index-served), excluding the subject itself.
        SELECT c.*, c.geom <-> s.geom AS dist
        FROM comp_cand c
        WHERE c.id <> s.id
        ORDER BY c.geom <-> s.geom
        LIMIT ${COMP_KNN_OVERFETCH}
      ) near
      -- post-filter to genuinely comparable lots, then keep the 10 most similar (|Δlot| + |Δfrontage|·10).
      -- R4 (Spec 78 P2): match on dwelling FAMILY — a specific-family subject (detached/townhouse/multiplex)
      -- pools comps of the same BUILT form (so RD + RS both count as detached); a generic 'all' subject
      -- (R/RA/RAC) keeps the exact-zoning match. Replaces the old bare near.zoning_class = s.zoning_class.
      WHERE (near.comp_family = s.subj_family OR (s.subj_family = 'all' AND near.zoning_class = s.zoning_class))
        AND near.lot_size_sqm BETWEEN s.lot_size_sqm * ${1 - COMP_LOT_TOL} AND s.lot_size_sqm * ${1 + COMP_LOT_TOL}
        AND (s.frontage_m IS NULL OR near.frontage_m IS NULL
             OR near.frontage_m BETWEEN s.frontage_m * ${1 - COMP_LOT_TOL} AND s.frontage_m * ${1 + COMP_LOT_TOL})
      ORDER BY (abs(near.lot_size_sqm - s.lot_size_sqm) + abs(coalesce(near.frontage_m, 0) - coalesce(s.frontage_m, 0)) * 10)
      LIMIT ${COMP_TOP_N}
    ) m
    GROUP BY s.id
  ) agg
  WHERE p.id = agg.id;`;
}

async function enrichComparableBuilds(client, { full = false, scopeWhere = 'TRUE' } = {}) {
  const eligible = `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0 AND zoning_class IS NOT NULL`;
  // FULL re-run: clear stale comp data for the scope first, so a parcel whose comps disappeared resets.
  if (full) {
    await client.query(`UPDATE parcels SET comparable_builds = NULL, comp_count = NULL, comp_dominant_build = NULL,
      comp_build_ratio_p50 = NULL, comp_fsi_p50 = NULL WHERE ${eligible} AND (${scopeWhere})`);
  }
  await client.query(buildCompCandidatesSql());
  const cand = (await client.query('SELECT count(*)::int AS n FROM comp_cand')).rows[0].n;
  const upd = await client.query(buildComparableBuildsUpdateSql({ full, scopeWhere }));
  // Mark eligible subjects that matched NO comps as comp_count = 0 (a clean "processed" marker, so the
  // incremental `comp_count IS NULL` skip is correct and the zero-comp count is real, not hidden as NULL).
  const zeroFilled = await client.query(
    `UPDATE parcels p SET comp_count = 0 WHERE ${eligible} AND p.comp_count IS NULL AND (${scopeWhere})`);
  const dist = (await client.query(
    `SELECT count(*) FILTER (WHERE comp_count > 0)::int AS with_comps,
            count(*) FILTER (WHERE comp_count = 0)::int AS zero_comps,
            count(*) FILTER (WHERE comp_build_ratio_p50 IS NOT NULL)::int AS with_br
     FROM parcels WHERE ${eligible} AND (${scopeWhere})`)).rows[0];
  return { candidates: cand, updated: upd.rowCount, zero_filled: zeroFilled.rowCount, ...dist };
}

// ---------------------------------------------------------------------------
// Optimal-config pass (Spec 78 Phase 3A) — JS-streaming. Unlike the SQL passes above, this consumes
// the per-row pure engine `optimal-config.js#computeOptimalConfig`, so it STREAMS eligible parcels
// (joined to neighbourhood_build_norms with a citywide fallback), computes in JS, and batch-UPDATEs.
// Runs AFTER the SQL passes COMMIT (streamQuery uses a separate connection — it can't see uncommitted
// txn writes), reading the max-build envelope + zoning caps they wrote.
// ---------------------------------------------------------------------------

const OPTCFG_WRITE_COLS = [
  'opt_aor_storeys', 'opt_aor_gfa_sqm', 'opt_aor_units', 'opt_coa_storeys', 'opt_coa_gfa_sqm',
  'opt_suite_type', 'opt_suite_fits_full', 'opt_binding_constraint', 'opt_config_confidence',
  'optimal_config', 'nearby_builds_summary',
];
const OPTCFG_BATCH = 500;

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The streaming read: eligible parcels + the max-build/zoning inputs + the nbhd norms (per-nbhd with a
 *  citywide-fallback CROSS JOIN). `full` recomputes all eligible; incremental does only the not-yet-configured. */
function buildOptConfigSelectSql({ full = false, scopeWhere = 'TRUE' } = {}) {
  const incrWhere = full ? '' : 'AND p.opt_config_confidence IS NULL';
  return `
    SELECT p.id, p.lot_size_sqm, p.frontage_m, p.depth_m, p.max_buildable_footprint_sqm,
           p.bylaw_max_fsi, p.bylaw_max_coverage_pct, p.max_build_stories,
           p.abuts_laneway, p.zoning_holding, p.is_through_lot, p.is_heritage_designated,
           p.is_in_ravine_protection_area, p.exception_number, p.existing_greenspace_sqm,
           p.existing_other_structures_sqm, p.existing_other_structures_count, p.lot_size_confidence,
           p.neighbourhood_id, n.name AS neighbourhood_name,
           (${bn.parcelFamilyFromZoningCaseSql('p.zoning_class')}) AS norm_family, -- R4: which family cohort the norm came from
           (nbn.id IS NULL) AS used_citywide,
           -- P2 3-level family fallback: pocket-family (nbn) → citywide-family (cwf) → citywide-'all' (cwa).
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
    -- citywide row for the parcel's family (absent for a sparse family → NULL → falls through to cwa).
    LEFT JOIN neighbourhood_build_norms cwf
      ON cwf.neighbourhood_id IS NULL
      AND cwf.structure_family = (${bn.parcelFamilyFromZoningCaseSql('p.zoning_class')})
    -- citywide 'all' backstop — exactly one row (partial unique index); asserted by the precondition guard.
    CROSS JOIN (SELECT * FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all') cwa
    WHERE p.max_buildable_footprint_sqm IS NOT NULL AND p.lot_size_sqm > 0 AND (${scopeWhere}) ${incrWhere}`;
}

/** Map a streamed DB row to the optimal-config engine input object. */
function mapRowToEngineInput(r) {
  return {
    lotSizeSqm: numOrNull(r.lot_size_sqm),
    frontageM: numOrNull(r.frontage_m),
    depthM: numOrNull(r.depth_m),
    maxBuildableFootprintSqm: numOrNull(r.max_buildable_footprint_sqm),
    fsiCap: numOrNull(r.bylaw_max_fsi),
    coverageCapFrac: r.bylaw_max_coverage_pct != null ? numOrNull(r.bylaw_max_coverage_pct) / 100 : null,
    // storeys: prefer the nbhd build-norm p50/p90; fall back to the parcel's own max_build_stories.
    nbhdStoreysP50: numOrNull(r.storeys_p50) ?? numOrNull(r.max_build_stories),
    nbhdStoreysP90: numOrNull(r.storeys_p90) ?? numOrNull(r.max_build_stories),
    // R2 (Spec 78 P2, plan fold #3): DETACHED-ONLY realized-FSI grounding — townhouse/multiplex cohorts
    // are thin (e.g. ~25 multiplex builds citywide) so their p90 is noisy → they keep the by-law FSI.
    realizedFsiP90: r.norm_family === 'detached' ? numOrNull(r.realized_fsi_p90) : null,
    abutsLaneway: r.abuts_laneway === true,          // boolean source — engine's fallback gate
    isHolding: r.zoning_holding === 'H',
    isThroughLot: r.is_through_lot === true,
    isHeritageFreeze: r.is_heritage_designated === true, // heritage → CoA for a suite (conservative)
    isRavine: r.is_in_ravine_protection_area === true,
    // 3A: existing greenspace is the open-yard proxy for rearYardAreaSqm; rearBehindMaxM null → the
    // engine does an area-only suite fit (precise ST_Difference position geom is a Phase-3 refinement).
    rearYardAreaSqm: numOrNull(r.existing_greenspace_sqm),
    rearBehindMaxM: null,
    existingAncillarySqm: numOrNull(r.existing_other_structures_sqm) || 0,
    existingAccessorySuspected: (numOrNull(r.existing_other_structures_count) || 0) > 0,
    lotSizeConfidence: r.lot_size_confidence,
  };
}

function pct(x) { return x == null ? '?' : `${Math.round(Number(x) * 100)}%`; }

/** §J nearby_builds_summary — a frozen snapshot of the (coalesced) nbhd build-norm row + a headline. */
function buildNearbyBuildsSummary(r) {
  if (r.nbn_sample_n == null) return null;
  const where = r.used_citywide ? 'Citywide' : (r.neighbourhood_name || `Nbhd ${r.neighbourhood_id}`);
  const ratio = r.build_ratio_p50 != null ? `, ${Math.round(Number(r.build_ratio_p50) * 100)}% of the max-build footprint` : '';
  const headline = `${where}: ${r.new_builds_5yr || 0} new builds + ${r.additions_5yr || 0} additions + ${r.renos_5yr || 0} renos in 5 yrs; CoA ${pct(r.coa_approval_rate)} approval; typically ${r.storeys_p50 || '?'} storeys (p90 ${r.storeys_p90 || '?'})${ratio}.`;
  return {
    basis: r.used_citywide ? 'citywide_fallback' : 'neighbourhood',
    structure_family: r.norm_family, // R4: the dwelling-family cohort these norms were read from
    neighbourhood_id: r.neighbourhood_id, window_start: r.window_start, window_end: r.window_end,
    new_builds_5yr: r.new_builds_5yr, additions_5yr: r.additions_5yr, renos_5yr: r.renos_5yr,
    suites_5yr: r.suites_5yr, demos_5yr: r.demos_5yr,
    realized_fsi_p50: r.realized_fsi_p50, build_ratio_p50: r.build_ratio_p50,
    existing_build_ratio_p25: r.existing_build_ratio_p25, existing_build_ratio_p50: r.existing_build_ratio_p50,
    storeys_p50: r.storeys_p50, storeys_p90: r.storeys_p90,
    coa_approved: r.coa_approved, coa_refused: r.coa_refused, coa_approval_rate: r.coa_approval_rate,
    sample_n: r.nbn_sample_n, headline,
  };
}

/** Turn a streamed row into the 11 flat+JSONB write values (or null on a per-row engine error). */
function computeOptConfigRow(r) {
  const cfg = optcfg.computeOptimalConfig(mapRowToEngineInput(r));
  // Exception/site-specific provisions aren't parsed → never claim 'high' confidence (queued item 2).
  let confidence = cfg.opt_config_confidence;
  if (r.exception_number != null && confidence === 'high') confidence = 'medium';
  const units = 1 + (cfg.opt_suite_fits_full ? 1 : 0);
  const nearby = buildNearbyBuildsSummary(r); // null when the parcel has no build-norm sample
  return [
    cfg.as_of_right.main_storeys, cfg.as_of_right.main_gfa_sqm, units,
    cfg.coa_upside.main_storeys, cfg.coa_upside.main_gfa_sqm,
    cfg.opt_suite_type || 'none', cfg.opt_suite_fits_full, cfg.opt_binding_constraint, confidence,
    JSON.stringify(cfg), nearby == null ? null : JSON.stringify(nearby), // SQL NULL, not the 'null' literal
    r.id,
  ];
}

/** Batched UPDATE … FROM (VALUES …). 12 params/row (11 cols + id); ~500 rows/batch. */
async function flushOptConfigBatch(pool, batch) {
  if (!batch.length) return 0;
  const cols = OPTCFG_WRITE_COLS;
  const perRow = cols.length + 1; // + id
  const tuples = [];
  const params = [];
  for (let i = 0; i < batch.length; i++) {
    const base = i * perRow;
    tuples.push(`($${base + 1}::int, $${base + 2}::int, $${base + 3}::numeric, $${base + 4}::int, $${base + 5}::int, $${base + 6}::numeric, $${base + 7}::text, $${base + 8}::boolean, $${base + 9}::text, $${base + 10}::text, $${base + 11}::jsonb, $${base + 12}::jsonb)`);
    // batch[i] is [storeys,gfa,units,coaStoreys,coaGfa,type,fits,binding,conf,cfgJson,nearbyJson,id]
    // VALUES tuple order = (id, aor_storeys, aor_gfa, units, coa_storeys, coa_gfa, type, fits, binding, conf, cfg, nearby)
    const row = batch[i];
    params.push(row[11], row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]);
  }
  const sql = `
    UPDATE parcels p SET
      opt_aor_storeys = v.opt_aor_storeys, opt_aor_gfa_sqm = v.opt_aor_gfa_sqm, opt_aor_units = v.opt_aor_units,
      opt_coa_storeys = v.opt_coa_storeys, opt_coa_gfa_sqm = v.opt_coa_gfa_sqm,
      opt_suite_type = v.opt_suite_type, opt_suite_fits_full = v.opt_suite_fits_full,
      opt_binding_constraint = v.opt_binding_constraint, opt_config_confidence = v.opt_config_confidence,
      optimal_config = v.optimal_config, nearby_builds_summary = v.nearby_builds_summary
    FROM (VALUES ${tuples.join(',')})
      AS v(id, opt_aor_storeys, opt_aor_gfa_sqm, opt_aor_units, opt_coa_storeys, opt_coa_gfa_sqm,
           opt_suite_type, opt_suite_fits_full, opt_binding_constraint, opt_config_confidence,
           optimal_config, nearby_builds_summary)
    WHERE p.id = v.id`;
  const res = await pool.query(sql, params);
  return res.rowCount || 0;
}

async function enrichOptimalConfig(pool, { full = false, scopeWhere = 'TRUE' } = {}) {
  // Precondition: the citywide (NULL,'all') backstop row MUST exist — the SELECT's cwa CROSS JOIN is
  // filtered to structure_family='all', so without it the whole pass yields 0 rows → silent no-op
  // (review C1). compute-build-norms writes the 'all' backstop UNCONDITIONALLY (P2).
  const cw = await pool.query(`SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all' LIMIT 1`);
  if (!cw.rowCount) {
    throw new Error(`${TAG} optimal-config: no citywide (NULL,'all') neighbourhood_build_norms backstop — run compute_build_norms (permits chain) first`);
  }
  const stats = { updated: 0, suite_fits: 0, conf_high: 0, conf_medium: 0, conf_low: 0, citywide: 0, errors: 0 };
  let batch = [];
  for await (const r of pipeline.streamQuery(pool, buildOptConfigSelectSql({ full, scopeWhere }), [], { batchSize: 200 })) {
    let row;
    try {
      row = computeOptConfigRow(r);
    } catch (err) {
      stats.errors += 1;
      pipeline.log.warn(TAG, `optimal-config engine error on parcel ${r.id}: ${err.message}`);
      continue;
    }
    if (row[6]) stats.suite_fits += 1;                 // opt_suite_fits_full
    if (row[8] === 'high') stats.conf_high += 1;
    else if (row[8] === 'medium') stats.conf_medium += 1;
    else stats.conf_low += 1;
    if (r.used_citywide) stats.citywide += 1;
    batch.push(row);
    if (batch.length >= OPTCFG_BATCH) { stats.updated += await flushOptConfigBatch(pool, batch); batch = []; }
  }
  if (batch.length) stats.updated += await flushOptConfigBatch(pool, batch);
  return stats;
}

// ---------------------------------------------------------------------------
// Observability — row-derived verdict cascade (Spec 47 §8.2).
// ---------------------------------------------------------------------------
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const full = process.argv.includes('--full');
    const t0 = Date.now();
    const { logicVars } = await loadMarketplaceConfigs(pool, 'enrich_parcels').catch((err) => {
      pipeline.log.warn(TAG, `config load failed, using defaults: ${err.message}`);
      return { logicVars: {} };
    });
    // Resolve + validate logic-vars (§R4/R5). Defaults from max-build.js; validate the RESOLVED
    // values (post-default) so an operator's bad override FAILs loudly without making a fresh/test
    // DB fragile. Schema covers road_overlay_distance_m too (previously unvalidated).
    const resolvedVars = {
      road_overlay_distance_m: Number(logicVars?.road_overlay_distance_m ?? 5),
      reno_coa_uplift_pct: Number(logicVars?.reno_coa_uplift_pct ?? mb.RENO_COA_UPLIFT_PCT_DEFAULT),
      reno_kitchen_gfa_pct: Number(logicVars?.reno_kitchen_gfa_pct ?? mb.RENO_KITCHEN_GFA_PCT_DEFAULT),
      reno_bath_gfa_pct: Number(logicVars?.reno_bath_gfa_pct ?? mb.RENO_BATH_GFA_PCT_DEFAULT),
      mislink_footprint_lot_tol: Number(logicVars?.mislink_footprint_lot_tol ?? mb.MISLINK_FOOTPRINT_LOT_TOL_DEFAULT),
      storey_height_m: Number(logicVars?.storey_height_m ?? mb.RESIDENTIAL_STOREY_HEIGHT_M),
      // Phase 3 accessory + externalized garden-suite (defaults from max-build.js).
      garage_min_lot_sqm: Number(logicVars?.garage_min_lot_sqm ?? mb.GARAGE_MIN_LOT_SQM),
      garage_max_gfa_sqm: Number(logicVars?.garage_max_gfa_sqm ?? mb.GARAGE_MAX_GFA_SQM),
      garage_min_footprint_sqm: Number(logicVars?.garage_min_footprint_sqm ?? mb.GARAGE_MIN_FOOTPRINT_SQM),
      accessory_max_coverage_pct: Number(logicVars?.accessory_max_coverage_pct ?? mb.ACCESSORY_MAX_COVERAGE_PCT),
      car_footprint_sqm: Number(logicVars?.car_footprint_sqm ?? mb.CAR_FOOTPRINT_SQM),
      laneway_suite_max_gfa_sqm: Number(logicVars?.laneway_suite_max_gfa_sqm ?? mb.LANEWAY_SUITE_MAX_GFA_SQM),
      laneway_suite_min_lot_sqm: Number(logicVars?.laneway_suite_min_lot_sqm ?? mb.LANEWAY_SUITE_MIN_LOT_SQM),
      laneway_suite_min_rear_yard_m: Number(logicVars?.laneway_suite_min_rear_yard_m ?? mb.LANEWAY_SUITE_MIN_REAR_YARD_M),
      min_soft_landscaping_pct: Number(logicVars?.min_soft_landscaping_pct ?? mb.MIN_SOFT_LANDSCAPING_PCT),
      laneway_suite_storeys: Number(logicVars?.laneway_suite_storeys ?? mb.LANEWAY_SUITE_STOREYS),
      garden_suite_storeys: Number(logicVars?.garden_suite_storeys ?? mb.GARDEN_SUITE_STOREYS),
      garden_suite_min_lot_sqm: Number(logicVars?.garden_suite_min_lot_sqm ?? mb.GARDEN_SUITE_MIN_LOT_SQM),
      garden_suite_min_rear_yard_m: Number(logicVars?.garden_suite_min_rear_yard_m ?? mb.GARDEN_SUITE_MIN_REAR_YARD_M),
      garden_suite_max_gfa_sqm: Number(logicVars?.garden_suite_max_gfa_sqm ?? mb.GARDEN_SUITE_MAX_GFA_SQM),
    };
    const vparse = LOGIC_VARS_SCHEMA.safeParse(resolvedVars);
    if (!vparse.success) {
      throw new Error(`${TAG} invalid logic_variables: ${vparse.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
    const roadDist = resolvedVars.road_overlay_distance_m;
    const storeyHeight = resolvedVars.storey_height_m;
    const reno = { coaUplift: resolvedVars.reno_coa_uplift_pct, kitchenPct: resolvedVars.reno_kitchen_gfa_pct, bathPct: resolvedVars.reno_bath_gfa_pct, mislinkTol: resolvedVars.mislink_footprint_lot_tol };
    // Phase 3 accessory params passed to enrichMaxBuild → buildMaxBuildSql.
    const acc = {
      gardenMinLot: resolvedVars.garden_suite_min_lot_sqm, gardenMinRearYard: resolvedVars.garden_suite_min_rear_yard_m,
      gardenMaxGfa: resolvedVars.garden_suite_max_gfa_sqm, garageMinLot: resolvedVars.garage_min_lot_sqm,
      garageMaxGfa: resolvedVars.garage_max_gfa_sqm, garageMinFootprint: resolvedVars.garage_min_footprint_sqm,
      accessoryMaxCovPct: resolvedVars.accessory_max_coverage_pct, carFootprint: resolvedVars.car_footprint_sqm,
      lanewayMaxGfa: resolvedVars.laneway_suite_max_gfa_sqm, lanewayMinLot: resolvedVars.laneway_suite_min_lot_sqm,
      lanewayMinRearYard: resolvedVars.laneway_suite_min_rear_yard_m, minSoftPct: resolvedVars.min_soft_landscaping_pct,
      lanewayStoreys: resolvedVars.laneway_suite_storeys, gardenStoreys: resolvedVars.garden_suite_storeys,
    };

    // Spec 58 §9/§11 consumer protocol — HALTs on missing/failed/no-base producer.
    const contract = await readZoningContract(pool);

    const auditRows = [];
    if (contract.partial) {
      auditRows.push({ metric: 'zoning_overlays_partial', value: contract.partial, status: 'WARN' });
    }
    if (contract.baseCommittedAfterOverlayFailed) {
      auditRows.push({ metric: 'base_committed_after_overlay_failed', value: true, status: 'WARN' });
    }
    // Consumer protocol §2 item 4 — degrade overlays the producer did NOT load.
    const staleOverlays = new Set(
      OVERLAY_LAYERS.filter((l) => contract.layers[l.key] === false).map((l) => l.key),
    );
    for (const key of staleOverlays) {
      auditRows.push({ metric: `${key}_overlay_stale`, value: true, status: 'WARN' });
    }

    let result;
    let mbResult;
    let exResult;
    let compResult;
    await pipeline.withTransaction(pool, async (client) => {
      await assertPreconditions(client);
      const runAt = await pipeline.getDbTimestamp(client);
      result = await enrichParcels(client, { scopeWhere: 'TRUE', full, roadDist, runAt, staleOverlays });
      // Second pass — max-build envelope (Spec 65 §). Same txn: parcel_zoning_enrich (ON COMMIT
      // DROP) is still visible for incremental scoping; reads the zoning feed just written above.
      mbResult = await enrichMaxBuild(client, { scopeWhere: 'TRUE', full, storeyHeight, acc });
      // Third pass — existing structure (Spec 65 Phase 1) + reno/build scenarios (Phase 2). Same txn:
      // parcel_max_build (ON COMMIT DROP) visible for scoping; reads the PRIMARY building (massing)
      // + the max-build cols written above; computes SCENARIO_COLS via a sibling UPDATE.
      exResult = await enrichExistingStructure(client, { scopeWhere: 'TRUE', full, reno });
      // Fourth pass — comparable builds (Spec 78 Phase 3C). Same txn: reads the max-build envelope +
      // imagery_roof footprint just written + committed permits/coa; writes the disjoint comp_* columns.
      compResult = await enrichComparableBuilds(client, { scopeWhere: 'TRUE', full });
    });

    // Fifth pass — optimal config (Spec 78 Phase 3A). Runs AFTER the txn COMMITS: it is a JS-streaming
    // pass (consumes the per-row engine optimal-config.js) and reads the just-committed max-build
    // envelope on a separate connection. Cross-chain read of neighbourhood_build_norms (permits chain).
    const ocResult = await enrichOptimalConfig(pool, { full });

    const totalParcels = await pool
      .query('SELECT COUNT(*)::int AS n FROM parcels WHERE geom IS NOT NULL')
      .then((r) => r.rows[0].n);
    const withZone = await pool
      .query('SELECT COUNT(*)::int AS n FROM parcels WHERE zoning_class IS NOT NULL')
      .then((r) => r.rows[0].n);
    const zonePct = totalParcels ? Math.round((1000 * withZone) / totalParcels) / 10 : 0;

    // Hard gate (DEC-4): zoning_class coverage. fsi/coverage/height are sparse-by-design INFO.
    auditRows.push({
      metric: 'parcels_with_zone_class_pct', value: zonePct,
      status: zonePct >= 95 ? 'PASS' : zonePct >= 90 ? 'WARN' : 'FAIL',
    });
    auditRows.push({ metric: 'parcels_enriched_count', value: result.updated, status: 'INFO' });
    auditRows.push({ metric: 'parcels_no_base_zone_count', value: result.gaps, status: 'INFO' });
    auditRows.push({ metric: 'parcels_multi_zone_count', value: result.multiZone, status: 'INFO' });
    auditRows.push({
      metric: 'parcels_ambiguous_zone_count', value: result.ambiguous,
      status: result.scoped && result.ambiguous > 0.05 * result.scoped ? 'WARN' : 'INFO',
    });
    auditRows.push({ metric: 'parcels_zone_conflict_count', value: result.conflicts, status: 'INFO' });
    // WF3 B2 source-plausibility guard: corrupt R-zone fsi_max > 10 source rows nulled before
    // aggregation. INFO (endemic ~handful of bad source rows — WARN would pin the step permanently).
    auditRows.push({ metric: 'zoning_fsi_source_nulled_count', value: result.fsiSourceNulled, status: 'INFO' });
    // Sparse-by-design null rates (DEC-4) — INFO only, never gated.
    auditRows.push({ metric: 'bylaw_max_fsi_null_pct', value: result.fsiNullPct, status: 'INFO' });
    auditRows.push({ metric: 'bylaw_max_coverage_pct_null_pct', value: result.coverageNullPct, status: 'INFO' });
    auditRows.push({ metric: 'bylaw_max_height_m_null_pct', value: result.heightNullPct, status: 'INFO' });
    // --- Max-build envelope (Spec 65 §) — all INFO, never gated (sparse-by-design, FSI ~5%). ---
    auditRows.push({ metric: 'max_build_enriched_count', value: mbResult.updated, status: 'INFO' });
    // lot_size_confidence tier distribution (operator trust signal — INFO, not a WARN gate).
    auditRows.push({ metric: 'lot_size_confidence_high_count', value: mbResult.lot_high, status: 'INFO' });
    auditRows.push({ metric: 'lot_size_confidence_medium_count', value: mbResult.lot_medium, status: 'INFO' });
    auditRows.push({ metric: 'lot_size_confidence_low_count', value: mbResult.lot_low, status: 'INFO' });
    // Per-output-field populated counts — keep footprint/GFA gap visible behind the unified confidence.
    auditRows.push({ metric: 'max_buildable_footprint_count', value: mbResult.with_footprint, status: 'INFO' });
    auditRows.push({ metric: 'max_buildable_gfa_count', value: mbResult.with_gfa, status: 'INFO' });
    auditRows.push({ metric: 'max_build_box_count', value: mbResult.with_box, status: 'INFO' });
    auditRows.push({ metric: 'max_buildable_gfa_basis_fsi_count', value: mbResult.gfa_fsi, status: 'INFO' });
    auditRows.push({ metric: 'max_buildable_gfa_basis_coverage_box_count', value: mbResult.gfa_coverage, status: 'INFO' });
    // max_build_confidence tier distribution.
    auditRows.push({ metric: 'max_build_confidence_high_count', value: mbResult.mb_high, status: 'INFO' });
    auditRows.push({ metric: 'max_build_confidence_medium_count', value: mbResult.mb_medium, status: 'INFO' });
    auditRows.push({ metric: 'max_build_confidence_low_count', value: mbResult.mb_low, status: 'INFO' });
    auditRows.push({ metric: 'garden_suite_fits_count', value: mbResult.suite_fits, status: 'INFO' });
    auditRows.push({ metric: 'envelope_constrained_count', value: mbResult.constrained, status: 'INFO' });
    // WF3-C2: pocket-storey basis distribution (derived should shrink) + market hotspot + neighbourhood premium coverage.
    auditRows.push({ metric: 'max_build_stories_basis_bylaw_count', value: mbResult.basis_bylaw, status: 'INFO' });
    auditRows.push({ metric: 'max_build_stories_basis_pocket_count', value: mbResult.basis_pocket, status: 'INFO' });
    auditRows.push({ metric: 'max_build_stories_basis_derived_count', value: mbResult.basis_derived, status: 'INFO' });
    auditRows.push({ metric: 'market_exceeds_bylaw_count', value: mbResult.market_exceeds, status: 'INFO' });
    auditRows.push({ metric: 'neighbourhood_join_count', value: mbResult.with_nbhd, status: 'INFO' });
    auditRows.push({ metric: 'neighbourhood_premium_above_1_count', value: mbResult.premium_above_1, status: 'INFO' });
    // WF3-B party-wall transparency: how many attached (semi/townhouse) parcels got the modal side_count<2
    // footprint widening (the documented approximation). zoning_class isn't on parcel_max_build → query parcels.
    const attachedModal = await pool
      .query(`SELECT COUNT(*)::int AS n FROM parcels WHERE zoning_class IN ('RS','RT') AND max_buildable_footprint_sqm IS NOT NULL`)
      .then((r) => r.rows[0].n);
    auditRows.push({ metric: 'attached_modal_side_count_parcels', value: attachedModal, status: 'INFO' });
    // --- Accessory fit (Spec 65 Phase 3) — all INFO; permission distribution makes the CoA split visible. ---
    auditRows.push({ metric: 'garage_fits_count', value: mbResult.garage_fits_cnt, status: 'INFO' });
    auditRows.push({ metric: 'garage_permission_as_of_right_count', value: mbResult.garage_aor, status: 'INFO' });
    auditRows.push({ metric: 'garage_permission_coa_required_count', value: mbResult.garage_coa, status: 'INFO' });
    auditRows.push({ metric: 'rear_suite_laneway_count', value: mbResult.suite_laneway, status: 'INFO' });
    auditRows.push({ metric: 'rear_suite_garden_count', value: mbResult.suite_garden, status: 'INFO' });
    auditRows.push({ metric: 'rear_suite_permission_as_of_right_count', value: mbResult.suite_aor, status: 'INFO' });
    auditRows.push({ metric: 'rear_suite_permission_coa_required_count', value: mbResult.suite_coa, status: 'INFO' });
    // --- Existing structure (Spec 65 Phase 1) — all INFO, never gated (NULL on no-massing). ---
    auditRows.push({ metric: 'existing_structure_enriched_count', value: exResult.updated, status: 'INFO' });
    auditRows.push({ metric: 'imagery_roof_footprint_count', value: exResult.with_footprint, status: 'INFO' });
    auditRows.push({ metric: 'imagery_roof_gfa_count', value: exResult.with_gfa, status: 'INFO' });
    auditRows.push({ metric: 'existing_dims_count', value: exResult.with_dims, status: 'INFO' });
    auditRows.push({ metric: 'existing_structure_confidence_high_count', value: exResult.conf_high, status: 'INFO' });
    auditRows.push({ metric: 'existing_structure_confidence_low_count', value: exResult.conf_low, status: 'INFO' });
    auditRows.push({ metric: 'existing_other_structures_present_count', value: exResult.with_other, status: 'INFO' });
    auditRows.push({ metric: 'existing_greenspace_count', value: exResult.with_greenspace, status: 'INFO' });
    // --- Reno/build scenarios (Spec 65 Phase 2) — all INFO; + resolved-factor provenance. ---
    auditRows.push({ metric: 'max_newbuild_coa_gfa_count', value: exResult.with_coa, status: 'INFO' });
    // WF3-A current-building GFA range (menu of priceable scope options off the known footprint).
    auditRows.push({ metric: 'cur_floor_gfa_count', value: exResult.with_floor, status: 'INFO' });
    auditRows.push({ metric: 'cur_pot_2story_gfa_count', value: exResult.with_pot2, status: 'INFO' });
    auditRows.push({ metric: 'cur_pot_3story_gfa_count', value: exResult.with_pot3, status: 'INFO' });
    auditRows.push({ metric: 'cur_gfa_range_basis_count', value: exResult.with_range, status: 'INFO' });
    auditRows.push({ metric: 'existing_mislinked_footprint_count', value: exResult.mislinked, status: 'INFO' });
    auditRows.push({ metric: 'cur_est_kitchen_gfa_count', value: exResult.with_kitchen, status: 'INFO' });
    auditRows.push({ metric: 'cur_est_bath_gfa_count', value: exResult.with_bath, status: 'INFO' });
    auditRows.push({ metric: 'scenario_enriched_count', value: exResult.scenarioUpdated, status: 'INFO' });
    // Resolved-factor provenance (operator sees what % was applied — transparency initiative).
    auditRows.push({ metric: 'reno_coa_uplift_pct_applied', value: reno.coaUplift, status: 'INFO' });
    auditRows.push({ metric: 'reno_kitchen_gfa_pct_applied', value: reno.kitchenPct, status: 'INFO' });
    auditRows.push({ metric: 'reno_bath_gfa_pct_applied', value: reno.bathPct, status: 'INFO' });
    auditRows.push({ metric: 'mislink_footprint_lot_tol_applied', value: reno.mislinkTol, status: 'INFO' });
    auditRows.push({ metric: 'storey_height_m_applied', value: storeyHeight, status: 'INFO' });
    // --- Comparable builds (Spec 78 Phase 3C) — all INFO; comp_count distribution = the comp-evidence reach. ---
    auditRows.push({ metric: 'comp_candidate_pool', value: compResult.candidates, status: 'INFO' });
    auditRows.push({ metric: 'comparable_builds_enriched_count', value: compResult.updated, status: 'INFO' });
    auditRows.push({ metric: 'comp_zero_filled_count', value: compResult.zero_filled, status: 'INFO' });
    auditRows.push({ metric: 'comp_with_comps_count', value: compResult.with_comps, status: 'INFO' });
    auditRows.push({ metric: 'comp_zero_comps_count', value: compResult.zero_comps, status: 'INFO' });
    auditRows.push({ metric: 'comp_build_ratio_p50_count', value: compResult.with_br, status: 'INFO' });
    // --- Optimal config (Spec 78 Phase 3A) — config-tier/suite/confidence distribution; errors gated. ---
    auditRows.push({ metric: 'optimal_config_enriched_count', value: ocResult.updated, status: 'INFO' });
    auditRows.push({ metric: 'opt_suite_fits_full_count', value: ocResult.suite_fits, status: 'INFO' });
    auditRows.push({ metric: 'opt_config_confidence_high_count', value: ocResult.conf_high, status: 'INFO' });
    auditRows.push({ metric: 'opt_config_confidence_medium_count', value: ocResult.conf_medium, status: 'INFO' });
    auditRows.push({ metric: 'opt_config_confidence_low_count', value: ocResult.conf_low, status: 'INFO' });
    auditRows.push({ metric: 'opt_config_citywide_fallback_count', value: ocResult.citywide, status: 'INFO' });
    auditRows.push({ metric: 'opt_config_engine_errors', value: ocResult.errors, threshold: '== 0', status: ocResult.errors > 0 ? 'FAIL' : 'INFO' });
    auditRows.push({ metric: 'enrich_parcels_duration_ms', value: Date.now() - t0, status: 'INFO' });

    pipeline.emitSummary({
      records_total: null, // Enrich archetype — does not create rows (Spec 47 §11)
      records_new: null,
      records_updated: result.updated,
      records_meta: {
        audit_table: {
          phase: ADVISORY_LOCK_ID,
          name: 'Parcel zoning enrichment',
          verdict: verdictCascade(auditRows),
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {
        // Full read-column sets — must match what the enrichment SQL actually reads (Spec 65 §3b).
        zoning_bylaw_areas: ['source_id', 'zn_zone', 'zn_string', 'gen_zone', 'zn_holding', 'zone_status', 'fsi_max', 'coverage_max_pct', 'units_max', 'density_max', 'frontage_min_m', 'area_min_sqm', 'standard_setback', 'pct_commercial_max', 'pct_residential_max', 'pct_employment_max', 'pct_office_max', 'exception_number', 'exception_text', 'bylaw_chapter', 'bylaw_section', 'bylaw_exception_ref', 'geom', 'source_dataset_version'],
        zoning_height_overlay: ['source_id', 'height_max_m', 'ht_stories', 'geom', 'source_dataset_version'],
        zoning_lot_coverage_overlay: ['source_id', 'coverage_max_pct_override', 'geom', 'source_dataset_version'],
        zoning_policy_area_overlay: ['source_id', 'geom', 'source_dataset_version'],
        zoning_policy_road_overlay: ['source_id', 'road_name', 'geom', 'source_dataset_version'],
        zoning_rooming_house_overlay: ['source_id', 'geom', 'source_dataset_version'],
        zoning_parking_zone_overlay: ['source_id', 'geom', 'source_dataset_version'],
        zoning_building_setback_overlay: ['source_id', 'geom', 'source_dataset_version'],
        zoning_priority_retail_overlay: ['source_id', 'geom', 'source_dataset_version'],
        zoning_queenstw_eat_overlay: ['source_id', 'geom', 'source_dataset_version'],
        // parcels: zoning identity/stamp (pass 1) + the max-build pass-2 read columns (lot dims +
        // already-written zoning feed + ravine/heritage/centreline flags it consumes).
        parcels: ['id', 'parcel_id', 'geom', 'zoning_enriched_at', 'lot_size_sqm', 'frontage_m', 'depth_m',
          'bylaw_max_height_m', 'bylaw_max_stories', 'bylaw_max_fsi', 'bylaw_max_coverage_pct', 'bylaw_standard_setback_m',
          'zoning_class', 'zoning_is_ambiguous', 'is_corner_lot', 'is_through_lot',
          'is_in_ravine_protection_area', 'is_heritage_designated', 'lot_size_confidence', 'abuts_laneway',
          // Phase 2 scenario pass + Phase 3C comp pass read these max-build/imagery outputs (same txn).
          'max_buildable_gfa_sqm', 'max_build_stories', 'max_buildable_footprint_sqm', 'imagery_roof_footprint_sqm'],
        // Massing join — heritage freeze (max-build pass) + existing-structure pass (Phase 1):
        // existing pass also reads pb.confidence + bf.geom/max_height_m.
        parcel_buildings: ['parcel_id', 'building_id', 'is_primary', 'confidence'],
        building_footprints: ['id', 'footprint_area_sqm', 'estimated_stories', 'max_height_m', 'geom'],
        // Optimal-config pass (Spec 78 Phase 3A) — cross-chain read of the neighbourhood build-norms
        // (id read for the used_citywide flag). neighbourhoods.avg_household_income +
        // neighbourhood_storey_norms are read by the max-build pass (WF3-C2 LATERAL) — declared here.
        neighbourhood_build_norms: ['id', 'neighbourhood_id', 'structure_family', 'storeys_p50', 'storeys_p90', 'new_builds_5yr', 'additions_5yr', 'renos_5yr', 'suites_5yr', 'demos_5yr', 'realized_fsi_p50', 'realized_fsi_p90', 'build_ratio_p50', 'existing_build_ratio_p25', 'existing_build_ratio_p50', 'coa_approved', 'coa_refused', 'coa_approval_rate', 'window_start', 'window_end', 'sample_n'],
        neighbourhood_storey_norms: ['neighbourhood_id', 'storeys_p50', 'storeys_p90'],
        neighbourhoods: ['id', 'name', 'avg_household_income'],
        // Comparable-builds pass (Spec 78 Phase 3C) — the permitted-parcel candidate set + CoA decision.
        permits: ['zoning_dominant_parcel_id', 'project_type', 'issued_date', 'street_num', 'street_name', 'residential_sqm', 'storeys', 'structure_type'],
        coa_applications: ['zoning_dominant_parcel_id', 'decision', 'decision_date', 'hearing_date'],
      },
      { parcels: [...ALL_WRITE_COLS, ...mb.MAX_BUILD_COLS, ...mb.EXISTING_COLS, ...mb.SCENARIO_COLS, ...COMP_WRITE_COLS, ...OPTCFG_WRITE_COLS, 'zoning_enriched_at'] },
    );

    pipeline.log.info(TAG, `enriched ${result.updated} parcels (zone_class ${zonePct}%, gaps ${result.gaps}, ambiguous ${result.ambiguous}, conflicts ${result.conflicts})`);
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

if (require.main === module) {
  pipeline.run('enrich-parcels', main);
}

module.exports = {
  ADVISORY_LOCK_ID,
  BASE_SRC,
  ALL_WRITE_COLS,
  assertPreconditions,
  readZoningContract,
  buildEnrichmentSql,
  buildUpdateSql,
  enrichParcels,
  buildMaxBuildSql,
  buildMaxBuildUpdateSql,
  enrichMaxBuild,
  buildExistingStructureSql,
  buildExistingStructureUpdateSql,
  buildScenarioUpdateSql,
  enrichExistingStructure,
  // Spec 78 Phase 3C — comparable-builds pass.
  COMP_WRITE_COLS,
  buildCompCandidatesSql,
  buildComparableBuildsUpdateSql,
  enrichComparableBuilds,
  // Spec 78 Phase 3A — optimal-config pass.
  OPTCFG_WRITE_COLS,
  buildOptConfigSelectSql,
  mapRowToEngineInput,
  buildNearbyBuildsSummary,
  computeOptConfigRow,
  enrichOptimalConfig,
  verdictCascade,
};
