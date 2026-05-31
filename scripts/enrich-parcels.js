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
const {
  PRECEDENCE_RULES,
  AMBIGUOUS_DOMINANT_SHARE_MAX,
  DOMINANT_ORDER_BY,
  sqlAggregate,
} = require('./lib/zoning-precedence');

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
         z.fsi_max, z.units_max, z.density_max, z.pct_commercial_max, z.pct_residential_max,
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
    fsiNullPct: s.fsi_null_pct === null ? null : Number(s.fsi_null_pct),
    coverageNullPct: s.coverage_null_pct === null ? null : Number(s.coverage_null_pct),
    heightNullPct: s.height_null_pct === null ? null : Number(s.height_null_pct),
  };
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
    const roadDist = Number(logicVars?.road_overlay_distance_m ?? 5);

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
    await pipeline.withTransaction(pool, async (client) => {
      await assertPreconditions(client);
      const runAt = await pipeline.getDbTimestamp(client);
      result = await enrichParcels(client, { scopeWhere: 'TRUE', full, roadDist, runAt, staleOverlays });
    });

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
    // Sparse-by-design null rates (DEC-4) — INFO only, never gated.
    auditRows.push({ metric: 'bylaw_max_fsi_null_pct', value: result.fsiNullPct, status: 'INFO' });
    auditRows.push({ metric: 'bylaw_max_coverage_pct_null_pct', value: result.coverageNullPct, status: 'INFO' });
    auditRows.push({ metric: 'bylaw_max_height_m_null_pct', value: result.heightNullPct, status: 'INFO' });
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
        parcels: ['parcel_id', 'geom', 'zoning_enriched_at'],
      },
      { parcels: [...ALL_WRITE_COLS, 'zoning_enriched_at'] },
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
  verdictCascade,
};
