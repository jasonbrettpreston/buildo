'use strict';
/**
 * The ONE shared compute module of the two lead-zoning ENRICHERs (Spec 66 WF3):
 *   enrich_permits     — the dominant linked parcel's feed onto `permits` through `permit_parcels`
 *   enrich_coa_zoning  — the same feed onto `coa_applications` through `lead_parcels` (stored lead_id, DEC-4)
 *
 * Operator-approved 2026-10-18 (wave-4 plan question 9): two thin step shells over ONE shared compute
 * module. Each slug keeps the per-slug compute entry the tooling resolves by the shell's basename
 * (`scripts/lib/compute/enrich-permits.js`, `scripts/lib/compute/enrich-coa-zoning.js`); both entries are
 * one line, `module.exports = require('../enrich-lead-zoning').forTarget(<target>)`, so every SQL text,
 * pass, hook and check below exists exactly once. The module lives in scripts/lib/ (a compute CLOSURE module),
 * not scripts/lib/compute/: every compute entry pairs to a manifest step file by basename (step-conformance
 * §5.5), and this module serves two. Gate E scans it as closure (G0, G1-G4; G2 against the exported DECLARED).
 *
 * Ported from the legacy `scripts/enrich-permits.js` (frozen oracle
 * `src/tests/steps/enrich_permits/fixtures/legacy-enrich-permits.js.txt`). The materialize, the guarded
 * UPDATE and the orphan nullify are byte-identical SQL; what moved:
 *   - the temp-table DDL                  -> `ctx.tempTable` (runner seam, R-BZ G4)
 *   - the guarded UPDATE                  -> `ctx.joinUpdate(0, …)` (set_based_join_update)
 *   - the orphan nullify                  -> `ctx.retract(1, [])` (set_based_null_retract, declared set_values)
 *   - the 16 information_schema probes    -> `database.min_migration` (R-BZ G3; ruled draft, see notes)
 *   - the two logic_variables SQL reads   -> declared `config.logic_variables` (R-BZ G1)
 *   - the pipeline_runs recency read      -> the `contract_read` hook through `hookCtx.producer` (R-BZ G1),
 *                                            which RETURNS the two run stamps and never throws (G8)
 *   - `Date.now()` duration               -> the runner's `<slug>_duration_ms` (G6)
 *   - the audit table                     -> declared checks, one per legacy row
 *   - the 80 / +3 / 0.90 / 88 / 72 / 97 / 66 literals -> step-owned logic variables (migration 273)
 *
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (DEC-1…DEC-5)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §4D (propagated opt/comp columns)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ, R-DF
 */

const mb = require('./max-build');
const { OPT_COMP_PROP_COLS } = require('./optimal-config-cols');
const { COST_PROP_COLS } = require('./parcel-cost-cols');

/** Scalar zoning fields copied verbatim from the dominant parcel. */
const SCALARS = ['zoning_class', 'bylaw_max_coverage_pct', 'bylaw_max_fsi', 'bylaw_max_height_m', 'exception_number'];
/** §8e ravine columns (Spec 59), aggregated across linked parcels. */
const RAVINE_COLS = ['is_in_ravine_protection_area', 'ravine_distance_m'];
/** §8e heritage columns (Spec 61), Part-IV-wins precedence. */
const HERITAGE_COLS = ['is_heritage_designated', 'heritage_designation_type', 'heritage_designation_date'];
/** §8e centreline columns (Spec 62). */
const CENTRELINE_COLS = ['is_corner_lot', 'is_through_lot', 'primary_frontage_street_name', 'abuts_laneway'];
/** Max-build lot inputs + envelope outputs (Spec 65), from the DOMINANT parcel. */
const MAXBUILD_COLS = mb.LOT_MAXBUILD_COLS;
/** Existing-structure columns (Spec 65 Phase 1), from the dominant parcel. */
const EXISTING_STRUCTURE_COLS = mb.EXISTING_COLS;
/** Scenario GFA columns (Spec 65 Phase 2), from the dominant parcel. */
const SCENARIO_COLS = mb.SCENARIO_COLS;
/** The 7 parcel overlay-membership booleans (bool_or'd into overlay_summary, permits only). */
const OVERLAY_FLAGS = ['in_policy_area', 'on_policy_road', 'in_rooming_house_overlay',
  'in_parking_zone_overlay', 'in_building_setback_overlay', 'on_priority_retail', 'in_queenstw_eat_overlay'];

/** Per-target config (DEC-1/2/4). `slug` is the owning step; `prefix` the audit-row metric prefix. */
const CFG = {
  permits: {
    slug: 'enrich_permits',
    prefix: 'permits',
    table: 'permits',
    leadAlias: 'p',
    leadKey: ['permit_num', 'revision_num'],
    from: 'permits p',
    linkJoin: 'JOIN permit_parcels pp ON pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num',
    linkAlias: 'pp',
    confidence: 'pp.confidence',
    keySelect: 'p.permit_num, p.revision_num',
    jsonbExtra: `ag.applicable_bylaws AS applicable_bylaws,
         jsonb_build_object(${OVERLAY_FLAGS.map((f) => `'${f}', ag.ov_${f}`).join(', ')},
           'detail', dom.zoning_overlays) AS overlay_summary,`,
    jsonbCols: ['applicable_bylaws', 'overlay_summary'],
    zeroMetric: 'permits_construction_count_zero',
    auditName: 'Permit zoning enrichment',
  },
  coa: {
    slug: 'enrich_coa_zoning',
    prefix: 'coa',
    table: 'coa_applications',
    leadAlias: 'c',
    leadKey: ['id'],
    from: 'coa_applications c',
    linkJoin: 'JOIN lead_parcels lp ON lp.lead_id = c.lead_id', // DEC-4: stored key, never re-derive
    linkAlias: 'lp',
    confidence: 'lp.confidence',
    keySelect: 'c.id',
    jsonbExtra: `jsonb_build_object(
           'base', jsonb_build_object('zoning_class', dom.zoning_class, 'bylaw_max_fsi', dom.bylaw_max_fsi,
             'bylaw_max_coverage_pct', dom.bylaw_max_coverage_pct, 'bylaw_max_height_m', dom.bylaw_max_height_m,
             'exception_number', dom.exception_number),
           'parcels', ag.applicable_bylaws) AS variance_context,`,
    jsonbCols: ['variance_context'],
    zeroMetric: 'coa_row_count_zero',
    auditName: 'CoA zoning enrichment',
  },
};

/** Step slug -> target (the post_phase hook reads the descriptor's identity). */
const TARGET_OF = { enrich_permits: 'permits', enrich_coa_zoning: 'coa' };

/**
 * G2's declared set for this shared module (it has no sibling descriptor): the union of both slugs'
 * declared reads and writes. Each slug's own descriptor declares its half.
 */
const DECLARED = {
  reads: ['parcels', 'permits', 'permit_parcels', 'permit_type_classifications', 'coa_applications', 'lead_parcels', 'lead_zoning_enrich'],
  writes: ['permits', 'coa_applications'],
};

function cfgFor(target) {
  const c = CFG[target];
  if (!c) throw new Error(`[enrich-lead-zoning] unknown target ${JSON.stringify(target)} — one of ${Object.keys(CFG).join('|')}`);
  return c;
}

/** Every column the guarded UPDATE writes (zoning_enriched_at, the run-clock column, is separate). */
function allWriteCols(target) {
  const c = cfgFor(target);
  return [...SCALARS, ...c.jsonbCols, 'zoning_parcel_count', 'zoning_dominant_parcel_id', 'zoning_dominant_parcel_method', ...RAVINE_COLS, ...HERITAGE_COLS, ...CENTRELINE_COLS, ...MAXBUILD_COLS, ...EXISTING_STRUCTURE_COLS, ...SCENARIO_COLS, ...OPT_COMP_PROP_COLS, ...COST_PROP_COLS];
}

/** The NOT NULL booleans the orphan nullify resets to false (every other write column goes to NULL). */
function nullifyFalseCols() {
  return [...RAVINE_COLS.slice(0, 1), HERITAGE_COLS[0], 'is_corner_lot', 'is_through_lot', 'abuts_laneway', ...mb.MAX_BUILD_BOOL_COLS];
}

// ---------------------------------------------------------------------------
// The materialize SELECT (DEC-1/3/4) — verbatim from the legacy buildEnrichmentSql, minus the
// `CREATE TEMP TABLE … AS` wrapper `ctx.tempTable` owns.
// ---------------------------------------------------------------------------
function buildEnrichmentSelectSql({ target, scopeWhere = 'TRUE' }) {
  const c = cfgFor(target);
  const key = c.leadKey.join(', ');
  const qkey = c.leadKey.map((k) => `${c.leadAlias}.${k}`).join(', ');
  return `WITH cand AS (
  SELECT ${c.keySelect},
         par.id AS parcel_id, par.zoning_class, par.bylaw_max_coverage_pct, par.bylaw_max_fsi,
         par.bylaw_max_height_m, par.exception_number, par.zoning_overlays, par.lot_size_sqm,
         par.is_in_ravine_protection_area, par.ravine_distance_m,
         par.is_heritage_designated, par.heritage_designation_type, par.heritage_designation_date,
         par.is_corner_lot, par.is_through_lot, par.primary_frontage_street_name, par.abuts_laneway,
         ${MAXBUILD_COLS.filter((col) => col !== 'lot_size_sqm').map((col) => `par.${col}`).join(', ')},
         ${EXISTING_STRUCTURE_COLS.map((col) => `par.${col}`).join(', ')},
         ${SCENARIO_COLS.map((col) => `par.${col}`).join(', ')},
         ${OPT_COMP_PROP_COLS.map((col) => `par.${col}`).join(', ')},
         ${COST_PROP_COLS.map((col) => `par.${col}`).join(', ')},
         ${OVERLAY_FLAGS.map((f) => `par.${f}`).join(', ')},
         ${c.confidence} AS confidence,
         par.lot_size_sqm / NULLIF(SUM(par.lot_size_sqm) OVER (PARTITION BY ${qkey}), 0) AS area_share,
         ROW_NUMBER() OVER (PARTITION BY ${qkey}
           ORDER BY par.lot_size_sqm DESC NULLS LAST, ${c.confidence} DESC NULLS LAST, par.id ASC) AS rn
  FROM ${c.from}
  ${c.linkJoin}
  JOIN parcels par ON par.id = ${c.linkAlias}.parcel_id
  WHERE (${scopeWhere})
),
ag AS (
  SELECT ${key},
    jsonb_agg(jsonb_build_object(
      'parcel_id', parcel_id, 'zoning_class', zoning_class, 'bylaw_max_fsi', bylaw_max_fsi,
      'bylaw_max_coverage_pct', bylaw_max_coverage_pct, 'bylaw_max_height_m', bylaw_max_height_m,
      'exception_number', exception_number, 'area_share', round(area_share::numeric, 4))
      ORDER BY area_share DESC NULLS LAST, parcel_id) AS applicable_bylaws,
    COUNT(*)                         AS zoning_parcel_count,
    COUNT(DISTINCT zoning_class)     AS distinct_zones,
    -- §8e L12 ravine propagation: any linked parcel inside → true; signed distance =
    -- MIN(ABS) over linked parcels × sign(any-inside). MIN ignores NULLs, so a lead
    -- whose parcels all have NULL distance gets NULL (orphan semantic, §11.2).
    COALESCE(bool_or(is_in_ravine_protection_area), false) AS new_in_ravine,
    MIN(ABS(ravine_distance_m))      AS min_abs_dist,
    -- §8e L12 heritage propagation: any linked parcel designated → true; type via Part-IV-wins
    -- precedence (has_part_iv > has_part_v_hcd); date = MIN(date) of the winning type's parcels.
    COALESCE(bool_or(is_heritage_designated), false)                                    AS new_heritage,
    bool_or(heritage_designation_type = 'part_iv_individual')                           AS has_part_iv,
    bool_or(heritage_designation_type = 'part_v_hcd')                                   AS has_part_v_hcd,
    MIN(heritage_designation_date) FILTER (WHERE heritage_designation_type = 'part_iv_individual') AS part_iv_date,
    MIN(heritage_designation_date) FILTER (WHERE heritage_designation_type = 'part_v_hcd')         AS part_v_date,
    -- §8e L12 centreline propagation: corner/through via bool_or (a consolidated multi-parcel lead
    -- can be both — no mutual-exclusivity carve-out, F-S6). primary_frontage_street_name (§11.1):
    -- smallest-parcel_id non-NULL value — array_agg ORDER BY parcel_id FILTER drops NULLs, [1] of
    -- an empty filtered array is NULL (correct orphan semantic). parcel_id = the cand alias of par.id.
    COALESCE(bool_or(is_corner_lot), false)  AS new_is_corner_lot,
    COALESCE(bool_or(is_through_lot), false) AS new_is_through_lot,
    COALESCE(bool_or(abuts_laneway), false)  AS new_abuts_laneway,
    (array_agg(primary_frontage_street_name ORDER BY parcel_id) FILTER (WHERE primary_frontage_street_name IS NOT NULL))[1] AS new_primary_frontage,
    ${OVERLAY_FLAGS.map((f) => `bool_or(${f}) AS ov_${f}`).join(',\n    ')}
  FROM cand GROUP BY ${key}
)
SELECT ${c.leadKey.map((k) => `dom.${k}`).join(', ')},
       ${SCALARS.map((s) => `dom.${s}`).join(', ')},
       ${c.jsonbExtra}
       ag.zoning_parcel_count,
       dom.parcel_id AS zoning_dominant_parcel_id,
       'max_area'::text AS zoning_dominant_parcel_method,
       ag.new_in_ravine AS is_in_ravine_protection_area,
       ag.min_abs_dist * CASE WHEN ag.new_in_ravine THEN -1 ELSE 1 END AS ravine_distance_m,
       ag.new_heritage AS is_heritage_designated,
       -- L12 Part-IV-wins; outer new_heritage guard keeps type/date NULL when undesignated (invariant-explicit).
       CASE WHEN ag.new_heritage
            THEN (CASE WHEN ag.has_part_iv THEN 'part_iv_individual'
                       WHEN ag.has_part_v_hcd THEN 'part_v_hcd' ELSE NULL END)
            ELSE NULL END AS heritage_designation_type,
       CASE WHEN ag.new_heritage
            THEN (CASE WHEN ag.has_part_iv THEN ag.part_iv_date
                       WHEN ag.has_part_v_hcd THEN ag.part_v_date ELSE NULL END)
            ELSE NULL END AS heritage_designation_date,
       ag.new_is_corner_lot AS is_corner_lot,
       ag.new_is_through_lot AS is_through_lot,
       ag.new_abuts_laneway AS abuts_laneway,
       ag.new_primary_frontage AS primary_frontage_street_name,
       -- §8e max-build propagation (Spec 65): lot INPUTS + envelope OUTPUTS from the DOMINANT parcel
       -- (rn=1). max_build_confidence degrades to 'low' on a multi-parcel assembly (no coherent envelope).
       ${MAXBUILD_COLS.filter((col) => col !== 'max_build_confidence').map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       CASE WHEN ag.zoning_parcel_count > 1 THEN 'low' ELSE dom.max_build_confidence END AS max_build_confidence,
       ${EXISTING_STRUCTURE_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ${SCENARIO_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ${OPT_COMP_PROP_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ${COST_PROP_COLS.map((col) => `dom.${col} AS ${col}`).join(',\n       ')},
       ag.distinct_zones
FROM cand dom
JOIN ag USING (${key})
WHERE dom.rn = 1;`;
}

/** The guarded UPDATE (verbatim legacy buildUpdateSql): every write column IS DISTINCT FROM guarded. */
function buildUpdateSql({ target }) {
  const c = cfgFor(target);
  const cols = allWriteCols(target);
  const set = cols.map((col) => `${col} = e.${col}`).join(',\n    ');
  const guard = cols.map((col) => `${c.leadAlias}.${col} IS DISTINCT FROM e.${col}`).join('\n      OR ');
  const join = c.leadKey.map((k) => `${c.leadAlias}.${k} = e.${k}`).join(' AND ');
  return `
UPDATE ${c.table} ${c.leadAlias} SET
    ${set},
    zoning_enriched_at = $1
FROM lead_zoning_enrich e
WHERE ${join}
  AND (
      ${guard}
  );`;
}

/**
 * The orphan-nullify SCOPE — declared byte-for-byte as `outputs.writes[1].write_discipline.scope` in each
 * slug's descriptor (the runner generates `UPDATE <table> SET <declared set_values> WHERE <scope> AND
 * (<guard>)`). Returned here only so the suite can prove the two agree.
 */
function nullifyScope({ target }) {
  const c = cfgFor(target);
  return target === 'permits'
    ? `NOT EXISTS (SELECT 1 FROM permit_parcels pp WHERE pp.permit_num = ${c.table}.permit_num AND pp.revision_num = ${c.table}.revision_num)`
    : `NOT EXISTS (SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = ${c.table}.lead_id)`;
}

// ---------------------------------------------------------------------------
// The contract_read hook — the two run stamps the centreline recency precondition compares. Reads the
// run ledger ONLY through the runner's producer reader (R-BZ G1) and NEVER throws (G8): the pass makes the
// decision, after the runner has opened its transaction, exactly where the legacy HALT ran.
// ---------------------------------------------------------------------------
async function readFeedContract(hookCtx) {
  const centreline = await hookCtx.producer('enrich_centreline', { chains: ['sources'], statuses: ['completed'] });
  const parcels = await hookCtx.producer('parcels', { chains: ['sources'], statuses: ['completed'] });
  return {
    layers: {},
    centreline_completed_at: centreline.completed_at,
    centreline_read: centreline.reason,
    parcels_completed_at: parcels.completed_at,
    parcels_read: parcels.reason,
  };
}

// ---------------------------------------------------------------------------
// Preconditions (Spec 58 §10 / §8e DEC-D, DEC-F, L24b, L24c) — the legacy HALTs, same messages. Each reads
// a declared table (parcels) on the pass client; none reads the run ledger or the catalog.
// ---------------------------------------------------------------------------
const TAG = '[enrich-permits]';

async function assertFeedsEnriched(client, ctx, config, target) {
  const wf2 = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE zoning_enriched_at IS NOT NULL');
  const ravine = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE ravine_dataset_version_when_enriched IS NOT NULL');
  const heritage = await client.query('SELECT COUNT(*)::int AS n FROM parcels WHERE heritage_dataset_version_when_enriched IS NOT NULL');
  if (Number(wf2.rows[0].n) === 0) {
    throw new Error(`${TAG} no parcel has zoning_enriched_at — WF2 (enrich-parcels) has not run; cannot enrich permits/CoA`);
  }
  if (Number(ravine.rows[0].n) === 0) {
    throw new Error(`${TAG} no parcel has ravine_dataset_version_when_enriched — enrich-ravines (§8d) has not run; cannot propagate ravine to permits/CoA`);
  }
  if (Number(heritage.rows[0].n) === 0) {
    throw new Error(`${TAG} no parcel has heritage_dataset_version_when_enriched — enrich-heritage (§8d) has not run; cannot propagate heritage to permits/CoA`);
  }
  const contract = ctx.contract || {};
  const enrichedAt = contract.centreline_completed_at;
  const parcelsAt = contract.parcels_completed_at;
  if (!enrichedAt) {
    throw new Error(`${TAG} no successful enrich_centreline run — §8d has not run; cannot propagate centreline to permits/CoA`);
  }
  if (parcelsAt && new Date(enrichedAt).getTime() < new Date(parcelsAt).getTime()) {
    throw new Error(`${TAG} enrich_centreline (${enrichedAt}) predates the latest load-parcels (${parcelsAt}) — parcels reloaded after centreline enrichment; re-run enrich_centreline (§8d)`);
  }
  // L24c — the ratio and its floor are compared in SQL against the declared variable (bound as a
  // parameter), so the compute holds no threshold literal.
  const threshold = config[`${cfgFor(target).slug}_centreline_coverage_min`];
  const cov = (await client.query(`
    SELECT pct, pct >= $1::float AS ok FROM (
      SELECT COUNT(*) FILTER (WHERE centreline_dataset_version_when_enriched IS NOT NULL)::float
           / NULLIF(COUNT(*) FILTER (WHERE geom IS NOT NULL), 0) AS pct
      FROM parcels) s`, [threshold])).rows[0];
  if (cov.pct === null) {
    throw new Error(`${TAG} no valid-geom parcels — cannot assess centreline coverage`);
  }
  if (cov.ok !== true) {
    throw new Error(`${TAG} centreline parcels coverage ${(Number(cov.pct) * 100).toFixed(1)}% < ${(Number(threshold) * 100).toFixed(1)}% min — §8d only partially enriched; refusing to propagate (would mark most leads false/false/NULL). Override via logic_variables.${cfgFor(target).slug}_centreline_coverage_min.`);
  }
}

// ---------------------------------------------------------------------------
// The two passes — one write each, ONE shared transaction (the legacy single withTransaction).
// ---------------------------------------------------------------------------
function makeEnrichPass(target) {
  return async function runEnrichPass(client, ctx, config) {
    const c = cfgFor(target);
    await assertFeedsEnriched(client, ctx, config, target);
    await ctx.tempTable({ name: 'lead_zoning_enrich', selectSql: buildEnrichmentSelectSql({ target, scopeWhere: 'TRUE' }) });
    const stats = (await client.query(`
    SELECT COUNT(*)::int AS enriched_leads,
           COUNT(*) FILTER (WHERE zoning_parcel_count > 1)::int AS multi_parcel,
           COUNT(*) FILTER (WHERE distinct_zones > 1)::int      AS heterogeneous
    FROM lead_zoning_enrich`)).rows[0];
    const total = (await client.query(`SELECT COUNT(*)::int AS n FROM ${c.from} WHERE (TRUE)`)).rows[0].n;
    const updated = await ctx.joinUpdate(0, buildUpdateSql({ target }), [ctx.clock.now()]);
    ctx.onProgress(updated);
    return {
      scoped: Number(total),
      updated,
      gaps: Number(total) - Number(stats.enriched_leads),
      multiParcel: Number(stats.multi_parcel),
      heterogeneous: Number(stats.heterogeneous),
    };
  };
}

function makeOrphanPass() {
  return async function runOrphanPass(client, ctx) {
    const orphansCleared = await ctx.retract(1, []);
    return { orphansCleared };
  };
}

// ---------------------------------------------------------------------------
// The post_phase hook — the legacy post-commit observation reads, on the pool, AFTER the shared
// transaction committed (the same read-after-write order as legacy). Bounds are never compared here.
// ---------------------------------------------------------------------------
async function computePostPhase(pool, { passRaw, descriptor }) {
  const target = TARGET_OF[descriptor.identity.name];
  const c = cfgFor(target);
  const enrich = passRaw[`zoning_${target}`] || {};
  const orphan = passRaw[`orphan_nullify_${target}`] || {};
  const g = target === 'permits'
    ? (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE ptc.class='construction')::int AS denom,
             COUNT(*) FILTER (WHERE ptc.class='construction' AND p.zoning_class IS NOT NULL)::int AS num
      FROM permits p LEFT JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type`)).rows[0]
    : (await pool.query(
      'SELECT COUNT(*)::int AS denom, COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)::int AS num FROM coa_applications')).rows[0];
  const nr = (await pool.query(`
    SELECT ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_fsi IS NULL)/NULLIF(COUNT(*),0),1) AS fsi,
           ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NULL)/NULLIF(COUNT(*),0),1) AS cov,
           ROUND(100.0*COUNT(*) FILTER (WHERE bylaw_max_height_m IS NULL)/NULLIF(COUNT(*),0),1) AS height
    FROM ${c.table}`)).rows[0];
  const rv = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_in_ravine_protection_area)::int AS in_ravine,
             COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)::int AS with_dist
      FROM ${c.table}`)).rows[0];
  const hr = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_heritage_designated)::int                          AS designated,
             COUNT(*) FILTER (WHERE heritage_designation_type = 'part_iv_individual')::int AS part_iv,
             COUNT(*) FILTER (WHERE heritage_designation_type = 'part_v_hcd')::int         AS part_v
      FROM ${c.table}`)).rows[0];
  const cl = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_corner_lot)::int                            AS corner,
             COUNT(*) FILTER (WHERE is_through_lot)::int                           AS through_lot,
             COUNT(*) FILTER (WHERE abuts_laneway)::int                            AS abuts_laneway,
             COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)::int AS frontage
      FROM ${c.table}`)).rows[0];
  const me = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)::int        AS with_lot_conf,
             COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)::int AS with_footprint,
             COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)::int       AS with_gfa,
             COUNT(*) FILTER (WHERE max_build_confidence = 'high')::int           AS mb_high,
             COUNT(*) FILTER (WHERE max_build_confidence = 'medium')::int         AS mb_medium,
             COUNT(*) FILTER (WHERE max_build_confidence = 'low')::int            AS mb_low,
             COUNT(*) FILTER (WHERE garden_suite_fits)::int                       AS suite_fits,
             COUNT(*) FILTER (WHERE envelope_constrained)::int                    AS constrained,
             COUNT(*) FILTER (WHERE max_build_stories_aggressive IS NOT NULL)::int AS with_aggressive,
             COUNT(*) FILTER (WHERE market_exceeds_bylaw)::int                     AS market_exceeds,
             COUNT(*) FILTER (WHERE neighbourhood_cost_premium IS NOT NULL AND neighbourhood_cost_premium > 1.00)::int AS premium_above_1
      FROM ${c.table}`)).rows[0];
  const ex = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)::int      AS with_footprint,
             COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)::int            AS with_gfa,
             COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')::int      AS conf_high,
             COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')::int       AS conf_low,
             COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)::int         AS with_greenspace,
             COUNT(*) FILTER (WHERE existing_data_quality_flag = '${mb.MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT}')::int AS mislinked
      FROM ${c.table}`)).rows[0];
  const oc = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)::int AS with_opt,
             COUNT(*) FILTER (WHERE opt_suite_fits_full)::int               AS suite_fits,
             COUNT(*) FILTER (WHERE comp_count IS NOT NULL)::int            AS with_comp,
             COUNT(*) FILTER (WHERE comp_build_ratio_p50 IS NOT NULL)::int  AS with_comp_br
      FROM ${c.table}`)).rows[0];
  const sc = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)::int AS with_coa,
             COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)::int        AS with_floor,
             COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)::int   AS with_pot2,
             COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)::int   AS with_pot3,
             COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)::int      AS with_range,
             COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)::int   AS with_kitchen,
             COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)::int      AS with_bath
      FROM ${c.table}`)).rows[0];
  const acc = (await pool.query(`
      SELECT COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)::int        AS garage_fits,
             COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')::int     AS garage_aor,
             COUNT(*) FILTER (WHERE garage_permission = 'coa_required')::int    AS garage_coa,
             COUNT(*) FILTER (WHERE rear_suite_type = 'laneway')::int           AS suite_laneway,
             COUNT(*) FILTER (WHERE rear_suite_type = 'garden')::int            AS suite_garden,
             COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')::int  AS suite_aor,
             COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')::int AS suite_coa
      FROM ${c.table}`)).rows[0];
  const dis = target === 'permits'
    ? {
      geometry: Number((await pool.query(
        "SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'RNFP' AND is_in_ravine_protection_area = false")).rows[0].n),
      heritage: Number((await pool.query(
        "SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'Heritage' AND is_heritage_designated = false")).rows[0].n),
    }
    : null;
  const pct = g.denom ? Math.round((1000 * g.num) / g.denom) / 10 : null;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const p = c.prefix;
  const updated = Number(enrich.updated || 0);
  return {
    matched: {
      target,
      coverage_denominator_zero: pct === null,
      [`${p}_zoning_class_coverage_pct`]: pct,
      [`${p}_enriched_count`]: updated,
      [`${p}_no_parcel_link_count`]: num(enrich.gaps),
      [`${p}_unlink_cleared_count`]: Number(orphan.orphansCleared || 0),
      [`${p}_multi_parcel_count`]: num(enrich.multiParcel),
      [`${p}_heterogeneous_assembly_count`]: num(enrich.heterogeneous),
      [`${p}_bylaw_max_fsi_null_pct`]: num(nr.fsi),
      [`${p}_bylaw_max_coverage_pct_null_pct`]: num(nr.cov),
      [`${p}_bylaw_max_height_m_null_pct`]: num(nr.height),
      [`${p}_in_ravine_count`]: rv.in_ravine,
      [`${p}_with_ravine_distance_count`]: rv.with_dist,
      [`${p}_heritage_designated_count`]: hr.designated,
      [`${p}_part_iv_count`]: hr.part_iv,
      [`${p}_part_v_hcd_count`]: hr.part_v,
      [`${p}_corner_lot_count`]: cl.corner,
      [`${p}_through_lot_count`]: cl.through_lot,
      [`${p}_abuts_laneway_count`]: cl.abuts_laneway,
      [`${p}_with_frontage_name_count`]: cl.frontage,
      [`${p}_with_lot_confidence_count`]: me.with_lot_conf,
      [`${p}_max_buildable_footprint_count`]: me.with_footprint,
      [`${p}_max_buildable_gfa_count`]: me.with_gfa,
      [`${p}_max_build_confidence_high_count`]: me.mb_high,
      [`${p}_max_build_confidence_medium_count`]: me.mb_medium,
      [`${p}_max_build_confidence_low_count`]: me.mb_low,
      [`${p}_garden_suite_fits_count`]: me.suite_fits,
      [`${p}_envelope_constrained_count`]: me.constrained,
      [`${p}_max_build_stories_aggressive_count`]: me.with_aggressive,
      [`${p}_market_exceeds_bylaw_count`]: me.market_exceeds,
      [`${p}_neighbourhood_premium_above_1_count`]: me.premium_above_1,
      [`${p}_imagery_roof_footprint_count`]: ex.with_footprint,
      [`${p}_imagery_roof_gfa_count`]: ex.with_gfa,
      [`${p}_existing_structure_confidence_high_count`]: ex.conf_high,
      [`${p}_existing_structure_confidence_low_count`]: ex.conf_low,
      [`${p}_existing_greenspace_count`]: ex.with_greenspace,
      [`${p}_existing_mislinked_footprint_count`]: ex.mislinked,
      [`${p}_optimal_config_count`]: oc.with_opt,
      [`${p}_opt_suite_fits_full_count`]: oc.suite_fits,
      [`${p}_comparable_builds_count`]: oc.with_comp,
      [`${p}_comp_build_ratio_p50_count`]: oc.with_comp_br,
      [`${p}_max_newbuild_coa_gfa_count`]: sc.with_coa,
      [`${p}_cur_floor_gfa_count`]: sc.with_floor,
      [`${p}_cur_pot_2story_gfa_count`]: sc.with_pot2,
      [`${p}_cur_pot_3story_gfa_count`]: sc.with_pot3,
      [`${p}_cur_gfa_range_basis_count`]: sc.with_range,
      [`${p}_cur_est_kitchen_gfa_count`]: sc.with_kitchen,
      [`${p}_cur_est_bath_gfa_count`]: sc.with_bath,
      [`${p}_garage_fits_count`]: acc.garage_fits,
      [`${p}_garage_permission_as_of_right_count`]: acc.garage_aor,
      [`${p}_garage_permission_coa_required_count`]: acc.garage_coa,
      [`${p}_rear_suite_laneway_count`]: acc.suite_laneway,
      [`${p}_rear_suite_garden_count`]: acc.suite_garden,
      [`${p}_rear_suite_permission_as_of_right_count`]: acc.suite_aor,
      [`${p}_rear_suite_permission_coa_required_count`]: acc.suite_coa,
      ...(dis ? { permit_type_geometry_disagreement: dis.geometry, permit_type_heritage_disagreement: dis.heritage } : {}),
    },
    compute: {
      records_total_aggregate: Number(enrich.scoped || 0),
      records_new_aggregate: 0,
      records_updated_aggregate: updated,
    },
  };
}

// ---------------------------------------------------------------------------
// Checks — one per legacy audit row, in the legacy order. Every bound is DECLARED (limit /
// warn_limit + *_from_config); a check only reports what the post_phase hook measured.
// ---------------------------------------------------------------------------
/** The ordered legacy audit-row metric ids for a target (the zero-denominator row first). */
function checkIds(target) {
  const p = cfgFor(target).prefix;
  const counts = [
    'enriched_count', 'no_parcel_link_count', 'unlink_cleared_count', 'multi_parcel_count', 'heterogeneous_assembly_count',
  ].map((k) => `${p}_${k}`);
  const nulls = [`${p}_bylaw_max_fsi_null_pct`, `${p}_bylaw_max_coverage_pct_null_pct`, `${p}_bylaw_max_height_m_null_pct`];
  const obs = [
    'in_ravine_count', 'with_ravine_distance_count', 'heritage_designated_count', 'part_iv_count', 'part_v_hcd_count',
    'corner_lot_count', 'through_lot_count', 'abuts_laneway_count', 'with_frontage_name_count',
    'with_lot_confidence_count', 'max_buildable_footprint_count', 'max_buildable_gfa_count',
    'max_build_confidence_high_count', 'max_build_confidence_medium_count', 'max_build_confidence_low_count',
    'garden_suite_fits_count', 'envelope_constrained_count', 'max_build_stories_aggressive_count',
    'market_exceeds_bylaw_count', 'neighbourhood_premium_above_1_count',
    'imagery_roof_footprint_count', 'imagery_roof_gfa_count', 'existing_structure_confidence_high_count',
    'existing_structure_confidence_low_count', 'existing_greenspace_count', 'existing_mislinked_footprint_count',
    'optimal_config_count', 'opt_suite_fits_full_count', 'comparable_builds_count', 'comp_build_ratio_p50_count',
    'max_newbuild_coa_gfa_count', 'cur_floor_gfa_count', 'cur_pot_2story_gfa_count', 'cur_pot_3story_gfa_count',
    'cur_gfa_range_basis_count', 'cur_est_kitchen_gfa_count', 'cur_est_bath_gfa_count',
    'garage_fits_count', 'garage_permission_as_of_right_count', 'garage_permission_coa_required_count',
    'rear_suite_laneway_count', 'rear_suite_garden_count', 'rear_suite_permission_as_of_right_count',
    'rear_suite_permission_coa_required_count',
  ].map((k) => `${p}_${k}`);
  const dis = target === 'permits' ? ['permit_type_geometry_disagreement', 'permit_type_heritage_disagreement'] : [];
  return [cfgFor(target).zeroMetric, `${p}_zoning_class_coverage_pct`, ...counts, ...nulls, ...obs, ...dis, `${cfgFor(target).slug}_duration_ms`];
}

function makeChecks(target) {
  const c = cfgFor(target);
  const p = c.prefix;
  const checks = {};
  // The zero-denominator marker (legacy emitted it only on an empty denominator; now always a row).
  const named = (id, body) => ({ [id](ctx) { return body(ctx); } })[id];
  checks[c.zeroMetric] = named(c.zeroMetric, (ctx) => ctx.report(c.zeroMetric, { violations: 0, detail: ctx.matched.coverage_denominator_zero === true }));
  // F-H12 (DEC-5): limit = the PASS floor, warn_limit = the FAIL floor, severity FAIL. An empty
  // denominator is INERT (renders INFO, value null) — the legacy null-coverage INFO row.
  checks[`${p}_zoning_class_coverage_pct`] = named(`${p}_zoning_class_coverage_pct`, (ctx) => {
    const v = ctx.matched[`${p}_zoning_class_coverage_pct`];
    ctx.report(`${p}_zoning_class_coverage_pct`, v === null ? { value: null, inert: true } : { value: v });
  });
  for (const id of checkIds(target)) {
    if (checks[id]) continue;
    if (id === `${c.slug}_duration_ms`) {
      checks[id] = named(id, (ctx) => ctx.report(id, { violations: 0, detail: ctx.elapsed_ms }));
    } else if (id.endsWith('_null_pct') && !id.endsWith('_height_m_null_pct')) {
      // Structural null rates (WF2 P6.5): WARN above the declared floor, never FAIL; null -> INFO.
      checks[id] = named(id, (ctx) => {
        const v = ctx.matched[id];
        ctx.report(id, v === null ? { value: null, inert: true } : { value: v });
      });
    } else if (id.startsWith('permit_type_')) {
      checks[id] = named(id, (ctx) => ctx.report(id, { violations: ctx.matched[id] }));
    } else {
      checks[id] = named(id, (ctx) => ctx.report(id, { violations: 0, detail: ctx.matched[id] }));
    }
  }
  return checks;
}

function makeCompute(target) {
  const checks = makeChecks(target);
  async function compute(ctx) {
    for (const id of ctx.checks) {
      const check = checks[id];
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
    return { records_meta: { duration_ms: ctx.elapsed_ms, target } };
  }
  const passes = [
    { name: `zoning_${target}`, txn: 'shared', run: makeEnrichPass(target) },
    { name: `orphan_nullify_${target}`, txn: 'shared', run: makeOrphanPass() },
  ];
  return Object.assign(compute, {
    checks,
    passes,
    readFeedContract,
    computePostPhase,
    target,
  });
}

/** The per-slug compute (what `scripts/lib/compute/enrich-permits.js` / `enrich-coa-zoning.js` export). */
function forTarget(target) {
  cfgFor(target);
  return makeCompute(target);
}

module.exports = {
  forTarget,
  DECLARED,
  CFG,
  TARGET_OF,
  SCALARS,
  OVERLAY_FLAGS,
  allWriteCols,
  nullifyFalseCols,
  nullifyScope,
  checkIds,
  buildEnrichmentSelectSql,
  buildUpdateSql,
  readFeedContract,
  computePostPhase,
};
