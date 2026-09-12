/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 *
 * Global Data Completeness Profile — THE DOMAIN LOGIC ONLY.
 *
 * Ported from `scripts/quality/assert-global-coverage.js` (pre-conversion, 1,464 L) per
 * `docs/reports/2026-09-11-batch1-i1-assert-global-coverage-assessment.md`. Every SQL
 * statement below is VERBATIM from the pre-conversion file (statement-for-statement,
 * §1.2 of the assessment report) — this file only relocates them behind memoized,
 * ctx-scoped loaders so 303 declared checks (§2.3 census, unrolled — see
 * `scripts/lib/assert-global-coverage-fields.js`) can each read ONE field out of a
 * result set fetched at most once per run, per branch.
 *
 * ⚠️ THIS FILE IS SHAPED BY §5.5, same five rules as every other compute:
 *   1. Checks are DATA (`scripts/lib/assert-global-coverage-fields.js` CHECK_DEFS),
 *      not 303 hand-typed functions — Ask A1's ruling ("tool-generate the checks[]
 *      array... not hand-typed from scratch") applies identically on the compute side:
 *      one generic evaluator per BUILDER KIND (coverage/info/calibrated/external/
 *      vocab/invariant/distribution/scope-drift), dispatched by CHECK_DEFS[i].builder.
 *   2. `compute(ctx)` iterates `ctx.checks` (the SELECTED ids) and nothing else.
 *   3. Every observation goes through `ctx.report(id, …)`; no `console.*` (`ctx.log`).
 *   4. Every I/O goes through `ctx.pool` (this step's DB seam — PH-5 §3.1: "DB seam =
 *      ctx.pool"; ASSERT's usual HTTP-only shape does not apply here — this step's
 *      entire subject IS the live database) — no bare `pg`, no `fetch` (none used),
 *      no `Date.now()`/`new Date()` (none used — the 6 clock-relative reads are all
 *      SQL-side `NOW()`/`CURRENT_DATE`, §3.2 of the assessment report). Every tunable
 *      goes through `ctx.config` (20 logic_variables — 6 pre-existing + 14 newly
 *      adjudicated, report §2.4).
 *   5. Branch loaders appear first; the generic per-builder evaluators next; the
 *      dispatch table (`CHECKS`) last, built FROM `CHECK_DEFS` so the descriptor and
 *      the compute can never silently drift on which checks exist.
 *
 * ⚠️ THREE NAMED, DOCUMENTED CONVERSION CONSEQUENCES (none silent — see the commit 7
 * report's G2′ section for the full leaf-diff list):
 *   (a) INFO rows' `threshold` renders the declared bound string (e.g. `"viol == 0"`)
 *       instead of the pre-conversion `null` — the SAME shape every other converted
 *       INFO-severity check in this estate already carries (`enrich_parcels` precedent).
 *   (b) The `envelope_constraint_reason` per-value loop (pre-conversion: N dynamic
 *       INFO rows, one per distinct reason) collapses into ONE declared
 *       `kind:"distribution"` check whose `detail` carries the full per-reason
 *       breakdown — a fixed check id is required for a static `checks[]` declaration;
 *       the full data is still present, just reshaped (one row, not N).
 *   (c) The two self-retiring pairs (C3/C7 `enriched_status_status_scope_drift`[+
 *       `_retighten`], and the accepted-baseline `coa_cost_coverage_gate_accepted`[+
 *       `_retighten`]) are ALWAYS present as declared rows now (reading PASS/INFO when
 *       inert) rather than vanishing at 0 — Nothing Hidden over pre-conversion's
 *       "0 rows when self-retired" shape.
 */
'use strict';

const { resolveAndCountTriple } = require('../vocab-coverage');
const { safeParseIntOrNull } = require('../safe-math');
const { SKIP_PHASES_SQL } = require('../lifecycle-phase');
const { readEntityTracingVerdict } = require('../read-entity-tracing-verdict');
const { CHECK_DEFS, VOCAB_COVERAGE, COA_STRUCTURE_TYPE_VOCAB } = require('../assert-global-coverage-fields');

// ---------------------------------------------------------------------------
// Path + parsing helpers
// ---------------------------------------------------------------------------

/** Read a dotted path (`'ca.address_pop'`) out of a plain object tree. */
function getPath(obj, path) {
  if (path === null || path === undefined) return null;
  return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), obj);
}

/** `X || null` — a zero/absent denominator reads as "no denominator", matching every pre-conversion call site. */
function denomOrNull(v) {
  return v === null || v === undefined || v === 0 ? null : v;
}

/** Blanket-parse an aggregate row's count columns (every column in these queries is a COUNT/EXTRACT — safe). */
function parseCountRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v === 'number') { out[k] = v; continue; }
    const n = typeof v === 'string' && /^-?\d+$/.test(v) ? parseInt(v, 10) : NaN;
    out[k] = Number.isFinite(n) ? n : v;
  }
  return out;
}

const pct = (populated, denominator) => {
  const denom = denomOrNull(denominator);
  return (denom !== null && Number.isFinite(populated))
    ? Math.round((populated / denom) * 1000) / 10
    : null;
};

// ---------------------------------------------------------------------------
// Branch loaders — VERBATIM SQL, memoized per ctx (one round trip per branch per run,
// regardless of how many of that branch's checks are selected). Mirrors the CSV_HEADER_MEMO
// pattern in scripts/lib/compute/assert-schema.js, extended from HTTP to ctx.pool.
// ---------------------------------------------------------------------------

const BRANCH_MEMO = new WeakMap();

function memo(ctx, key, loader) {
  let byKey = BRANCH_MEMO.get(ctx);
  if (!byKey) { byKey = new Map(); BRANCH_MEMO.set(ctx, byKey); }
  if (!byKey.has(key)) byKey.set(key, loader());
  return byKey.get(key);
}

// Spec 88 §2.10 — the 15 propagated cost/FSI scalars, as a reusable SELECT fragment.
const { COST_PROP_COLS } = require('../parcel-cost-cols');
const COST_PROP_FILTER_SQL = COST_PROP_COLS.map((c) => `COUNT(*) FILTER (WHERE ${c} IS NOT NULL) AS ${c}_pop`).join(',\n          ');

async function loadCoaBranch(ctx) {
  return memo(ctx, 'coa', async () => {
    const pool = ctx.pool;
    const { rows: [caRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                                        AS coa_total,
          COUNT(*) FILTER (WHERE linked_permit_num IS NULL)                               AS unlinked_total,
          COUNT(*) FILTER (WHERE decision = 'Approved')                                   AS approved_total,
          COUNT(*) FILTER (WHERE address IS NOT NULL)                                     AS address_pop,
          COUNT(*) FILTER (WHERE ward IS NOT NULL)                                        AS ward_pop,
          COUNT(*) FILTER (WHERE decision IS NOT NULL)                                    AS decision_pop,
          COUNT(*) FILTER (WHERE application_number IS NOT NULL)                          AS app_num_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL)                           AS linked_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL AND linked_confidence IS NOT NULL) AS confidence_pop,
          COUNT(*) FILTER (WHERE decision = 'Approved' AND linked_permit_num IS NULL)     AS approved_unlinked,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL)  AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE lifecycle_stalled = true AND linked_permit_num IS NULL)   AS lifecycle_stalled_true_pop,
          COUNT(*) FILTER (WHERE lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL) AS lifecycle_classified_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NULL)                                 AS unclassified_count,
          COUNT(*) FILTER (WHERE parcel_linked_at IS NOT NULL)                            AS parcel_linked_pop,
          COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL)                            AS neighbourhood_id_pop,
          COUNT(*) FILTER (WHERE scope_tags IS NOT NULL)                                  AS scope_tags_pop,
          COUNT(*) FILTER (WHERE structure_type IS NOT NULL)                              AS structure_type_pop,
          COUNT(*) FILTER (WHERE scope_classified_at IS NOT NULL)                         AS scope_classified_pop,
          COUNT(*) FILTER (WHERE trade_classified_at IS NOT NULL)                         AS trade_classified_pop,
          COUNT(*) FILTER (WHERE cost_classified_at IS NOT NULL)                          AS cost_classified_pop,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)                              AS estimated_cost_pop,
          COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)                                AS zoning_class_pop,
          COUNT(*) FILTER (WHERE zoning_enriched_at IS NOT NULL)                          AS zoning_enriched_pop,
          COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NOT NULL)                      AS bylaw_max_coverage_pct_pop,
          COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL)                               AS bylaw_max_fsi_pop,
          COUNT(*) FILTER (WHERE bylaw_max_height_m IS NOT NULL)                          AS bylaw_max_height_m_pop,
          COUNT(*) FILTER (WHERE exception_number IS NOT NULL)                            AS exception_number_pop,
          COUNT(*) FILTER (WHERE variance_context IS NOT NULL)                            AS variance_context_pop,
          COUNT(*) FILTER (WHERE zoning_parcel_count IS NOT NULL)                         AS zoning_parcel_count_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_id IS NOT NULL)                   AS zoning_dominant_parcel_id_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_method IS NOT NULL)               AS zoning_dominant_parcel_method_pop,
          COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                            AS in_ravine_pop,
          COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)                           AS ravine_distance_pop,
          COUNT(*) FILTER (WHERE is_heritage_designated)                                  AS heritage_designated_pop,
          COUNT(*) FILTER (WHERE heritage_designation_type IS NOT NULL)                   AS heritage_type_pop,
          COUNT(*) FILTER (WHERE heritage_designation_date IS NOT NULL)                   AS heritage_date_pop,
          COUNT(*) FILTER (WHERE is_corner_lot)                                           AS corner_lot_pop,
          COUNT(*) FILTER (WHERE is_through_lot)                                          AS through_lot_pop,
          COUNT(*) FILTER (WHERE abuts_laneway)                                           AS abuts_laneway_pop,
          COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)                AS frontage_name_pop,
          COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)                         AS lot_size_conf_pop,
          COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)                 AS max_footprint_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)                       AS max_gfa_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'fsi')                         AS max_gfa_fsi_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_box')                AS max_gfa_cov_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_only')               AS max_gfa_cov_only_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'high')                           AS mb_conf_high_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'medium')                         AS mb_conf_medium_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'low')                            AS mb_conf_low_pop,
          COUNT(*) FILTER (WHERE garden_suite_fits)                                       AS suite_fits_pop,
          COUNT(*) FILTER (WHERE envelope_constrained)                                    AS env_constrained_pop,
          COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)                       AS existing_footprint_pop,
          COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)                             AS existing_gfa_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')                  AS existing_conf_high_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')                   AS existing_conf_low_pop,
          COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)                     AS existing_greenspace_pop,
          COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)                    AS scen_coa_pop,
          COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)                           AS scen_floor_pop,
          COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)                      AS scen_pot2_pop,
          COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)                      AS scen_pot3_pop,
          COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)                         AS scen_range_pop,
          COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)                     AS scen_kitchen_pop,
          COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)                        AS scen_bath_pop,
          COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)                          AS garage_fits_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')                       AS garage_aor_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'coa_required')                      AS garage_coa_pop,
          COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)                       AS opt_config_pop,
          COUNT(*) FILTER (WHERE comp_count IS NOT NULL)                                  AS comp_pop,
          COUNT(*) FILTER (WHERE rear_suite_type IS NOT NULL)                             AS rear_suite_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')                   AS rear_suite_aor_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')                  AS rear_suite_coa_pop,
          ${COST_PROP_FILTER_SQL},
          EXTRACT(days FROM NOW() - MAX(last_seen_at))::int                               AS days_since_latest
        FROM coa_applications
      `);
    const ca = parseCountRow(caRaw);

    const { rows: [cxRaw] } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM lead_trades   WHERE lead_id LIKE 'coa:%')                  AS lead_trades_coa_rows,
          (SELECT COUNT(*) FROM lead_products WHERE lead_id LIKE 'coa:%')                  AS lead_products_coa_rows,
          (SELECT COUNT(*) FROM lead_parcels  WHERE lead_id LIKE 'coa:%')                  AS lead_parcels_coa_rows,
          (SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%')                 AS cost_estimates_coa_rows,
          (SELECT COUNT(*) FROM phase_stay_calibration WHERE permit_type IS NULL)          AS calibration_coa_rows
      `);
    const cx = parseCountRow(cxRaw);

    const { rows: [cmRaw] } = await pool.query(`
        SELECT
          COUNT(DISTINCT permit_num) FILTER (WHERE permit_num LIKE 'PRE-%')                AS pre_permit_total,
          COUNT(*) FILTER (WHERE permit_num LIKE 'PRE-%' AND issued_date < NOW() - INTERVAL '18 months') AS aged_pre_permits,
          (SELECT COUNT(*) FROM data_quality_snapshots WHERE snapshot_date = CURRENT_DATE) AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots WHERE captured_at > NOW() - INTERVAL '25 hours') AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT application_number, COUNT(*) FROM coa_applications GROUP BY 1 HAVING COUNT(*) > 1
          ) sub)                                                                             AS dup_coa_pks
        FROM permits
      `);
    const cm = parseCountRow(cmRaw);

    const { rows: [csSchemaRaw] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'coa_applications'
      `);
    const csSchema = parseCountRow(csSchemaRaw);

    const coaTotal = ca.coa_total || 0;
    const linkedTotal = ca.linked_pop || 0;
    const lifecyclePhaseTotal = ca.lifecycle_phase_pop || 0;
    const unlinkedTotal = ca.unlinked_total || 0;
    const daysSinceLatest = ca.days_since_latest ?? 0;

    return { ca, cx, cm, csSchema, coaTotal, linkedTotal, lifecyclePhaseTotal, unlinkedTotal, daysSinceLatest };
  });
}

async function loadSourcesBranch(ctx) {
  return memo(ctx, 'sources', async () => {
    const pool = ctx.pool;
    const { rows: [ppRaw] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE zoning_enriched_at IS NOT NULL)          AS enriched,
          COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)                AS zoning_class_pop,
          COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL)              AS bylaw_max_fsi_pop,
          COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL) AS mb_footprint_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)       AS mb_gfa_pop,
          COUNT(*) FILTER (WHERE max_build_stories IS NOT NULL)           AS mb_stories_pop,
          COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)       AS opt_conf_pop,
          COUNT(*) FILTER (WHERE opt_aor_gfa_sqm IS NOT NULL)             AS opt_aor_pop,
          COUNT(*) FILTER (WHERE opt_coa_gfa_sqm IS NOT NULL)             AS opt_coa_pop,
          COUNT(*) FILTER (WHERE comp_count IS NOT NULL)                  AS comp_pop,
          COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL)            AS nbhd_pop,
          COUNT(*) FILTER (WHERE cost_fb_total IS NOT NULL)              AS cost_fb_pop,
          COUNT(*) FILTER (WHERE envelope_constrained)                   AS env_constrained_pop
        FROM parcels
      `);
    const pp = parseCountRow(ppRaw);
    const enriched = pp.enriched || 0;

    const { rows: [mbcRaw] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE has_bldg)                                          AS resid_with_bldg,
          COUNT(*) FILTER (WHERE has_bldg AND max_buildable_footprint_sqm IS NOT NULL) AS mb_footprint_pop,
          COUNT(*) FILTER (WHERE has_bldg AND max_buildable_gfa_sqm IS NOT NULL)       AS mb_gfa_pop,
          COUNT(*) FILTER (WHERE has_bldg AND max_build_stories IS NOT NULL)           AS mb_stories_pop,
          COUNT(*) FILTER (WHERE has_bldg AND opt_aor_gfa_sqm IS NOT NULL)             AS opt_aor_pop
        FROM (
          SELECT p.max_buildable_footprint_sqm, p.max_buildable_gfa_sqm, p.max_build_stories, p.opt_aor_gfa_sqm,
                 EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id) AS has_bldg
          FROM parcels p
          WHERE p.zoning_class IS NOT NULL AND upper(p.zoning_class) LIKE 'R%'
        ) q
      `);
    const mbc = parseCountRow(mbcRaw);
    const residWithBldgEnv = mbc.resid_with_bldg || 0;

    const reasonDistResult = await pool.query(`
        SELECT envelope_constraint_reason AS reason, COUNT(*)::int AS n
        FROM parcels WHERE envelope_constraint_reason IS NOT NULL
        GROUP BY envelope_constraint_reason ORDER BY n DESC
      `);
    const reasonDist = reasonDistResult.rows.map((r) => ({ reason: r.reason, n: typeof r.n === 'string' ? parseInt(r.n, 10) : r.n }));

    const { rows: [pcmRaw] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE has_bldg)                                    AS resid_with_bldg,
          COUNT(*) FILTER (WHERE has_bldg AND parcel_cost_menu IS NOT NULL)   AS resid_with_bldg_menu,
          COUNT(*) FILTER (WHERE parcel_cost_menu IS NOT NULL)                AS any_menu
        FROM (
          SELECT p.parcel_cost_menu,
                 EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id) AS has_bldg
          FROM parcels p
          WHERE p.zoning_class IS NOT NULL AND upper(p.zoning_class) LIKE 'R%'
        ) q
      `);
    const pcm = parseCountRow(pcmRaw);
    const residWithBldg = pcm.resid_with_bldg || 0;

    return { pp, mbc, pcm, reasonDist, enriched, residWithBldgEnv, residWithBldg };
  });
}

async function loadPermitsBranch(ctx) {
  return memo(ctx, 'permits', async () => {
    const pool = ctx.pool;
    const { rows: [paRaw] } = await pool.query(`
        SELECT
          COUNT(*) AS permits_total,
          COUNT(*) FILTER (WHERE permit_type IS NOT NULL)                      AS permit_type_pop,
          COUNT(*) FILTER (WHERE structure_type IS NOT NULL)                   AS structure_type_pop,
          COUNT(*) FILTER (WHERE work IS NOT NULL)                             AS work_pop,
          COUNT(*) FILTER (WHERE street_num IS NOT NULL)                       AS street_num_pop,
          COUNT(*) FILTER (WHERE street_name IS NOT NULL)                      AS street_name_pop,
          COUNT(*) FILTER (WHERE street_name_normalized IS NOT NULL)           AS street_name_norm_pop,
          COUNT(*) FILTER (WHERE street_type IS NOT NULL)                      AS street_type_pop,
          COUNT(*) FILTER (WHERE street_direction IS NOT NULL)                 AS street_direction_pop,
          COUNT(*) FILTER (WHERE city IS NOT NULL)                             AS city_pop,
          COUNT(*) FILTER (WHERE postal IS NOT NULL)                           AS postal_pop,
          COUNT(*) FILTER (WHERE geo_id IS NOT NULL)                           AS geo_id_pop,
          COUNT(*) FILTER (WHERE building_type IS NOT NULL)                    AS building_type_pop,
          COUNT(*) FILTER (WHERE category IS NOT NULL)                         AS category_pop,
          COUNT(*) FILTER (WHERE application_date IS NOT NULL)                 AS application_date_pop,
          COUNT(*) FILTER (WHERE issued_date IS NOT NULL)                      AS issued_date_pop,
          COUNT(*) FILTER (WHERE completed_date IS NOT NULL)                   AS completed_date_pop,
          COUNT(*) FILTER (WHERE status IS NOT NULL)                           AS status_pop,
          COUNT(*) FILTER (WHERE description IS NOT NULL)                      AS description_pop,
          COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL)                   AS est_const_cost_pop,
          COUNT(*) FILTER (WHERE builder_name IS NOT NULL)                     AS builder_name_pop,
          COUNT(*) FILTER (WHERE owner IS NOT NULL)                            AS owner_pop,
          COUNT(*) FILTER (WHERE dwelling_units_created IS NOT NULL)           AS dwell_created_pop,
          COUNT(*) FILTER (WHERE dwelling_units_lost IS NOT NULL)              AS dwell_lost_pop,
          COUNT(*) FILTER (WHERE ward IS NOT NULL)                             AS ward_pop,
          COUNT(*) FILTER (WHERE council_district IS NOT NULL)                 AS council_district_pop,
          COUNT(*) FILTER (WHERE current_use IS NOT NULL)                      AS current_use_pop,
          COUNT(*) FILTER (WHERE proposed_use IS NOT NULL)                     AS proposed_use_pop,
          COUNT(*) FILTER (WHERE housing_units IS NOT NULL)                    AS housing_units_pop,
          COUNT(*) FILTER (WHERE storeys IS NOT NULL)                          AS storeys_pop,
          COUNT(*) FILTER (WHERE data_hash IS NOT NULL)                        AS data_hash_pop,
          COUNT(*) FILTER (WHERE raw_json IS NOT NULL)                         AS raw_json_pop,
          COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL)                     AS last_seen_at_pop,
          COUNT(*) FILTER (WHERE enriched_status IS NOT NULL)                  AS enriched_status_pop,
          COUNT(*) FILTER (WHERE project_type IS NOT NULL)                     AS project_type_pop,
          COUNT(*) FILTER (WHERE array_length(scope_tags, 1) IS NOT NULL)      AS scope_tags_pop,
          COUNT(*) FILTER (WHERE scope_classified_at IS NOT NULL)              AS scope_classified_pop,
          COUNT(*) FILTER (WHERE scope_source IS NOT NULL)                     AS scope_source_pop,
          COUNT(*) FILTER (WHERE latitude IS NOT NULL)                         AS latitude_pop,
          COUNT(*) FILTER (WHERE longitude IS NOT NULL)                        AS longitude_pop,
          COUNT(*) FILTER (WHERE location IS NOT NULL)                         AS location_pop,
          COUNT(*) FILTER (WHERE geocoded_at IS NOT NULL)                      AS geocoded_at_pop,
          COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL
                             AND neighbourhood_id != -1)                       AS neighbourhood_pop,
          COUNT(*) FILTER (WHERE permit_type != 'BLD')                         AS non_bld_total,
          COUNT(*) FILTER (WHERE permit_type != 'BLD'
                             AND array_length(scope_tags, 1) IS NOT NULL)      AS non_bld_scope_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL)                  AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL
                             AND phase_started_at IS NOT NULL)                 AS phase_started_pop,
          COUNT(*) FILTER (WHERE lifecycle_stalled = true)                     AS lifecycle_stalled_pop,
          COUNT(*) FILTER (WHERE lifecycle_classified_at IS NOT NULL)          AS lifecycle_classified_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NULL)                      AS unclassified_count,
          COUNT(*) FILTER (WHERE status IN ('Pending Closed','Closed'))        AS stale_total,
          COUNT(*) FILTER (WHERE status IN ('Pending Closed','Closed')
                             AND completed_date IS NOT NULL)                   AS stale_with_date,
          COUNT(DISTINCT permit_num) FILTER (WHERE permit_num LIKE 'PRE-%')    AS pre_permit_count,
          COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)                     AS zoning_class_pop,
          COUNT(*) FILTER (WHERE zoning_enriched_at IS NOT NULL)               AS zoning_enriched_pop,
          COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NOT NULL)           AS bylaw_max_coverage_pct_pop,
          COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL)                    AS bylaw_max_fsi_pop,
          COUNT(*) FILTER (WHERE bylaw_max_height_m IS NOT NULL)               AS bylaw_max_height_m_pop,
          COUNT(*) FILTER (WHERE exception_number IS NOT NULL)                 AS exception_number_pop,
          COUNT(*) FILTER (WHERE applicable_bylaws IS NOT NULL)                AS applicable_bylaws_pop,
          COUNT(*) FILTER (WHERE overlay_summary IS NOT NULL)                  AS overlay_summary_pop,
          COUNT(*) FILTER (WHERE zoning_parcel_count IS NOT NULL)              AS zoning_parcel_count_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_id IS NOT NULL)        AS zoning_dominant_parcel_id_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_method IS NOT NULL)    AS zoning_dominant_parcel_method_pop,
          COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                AS in_ravine_pop,
          COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)               AS ravine_distance_pop,
          COUNT(*) FILTER (WHERE is_heritage_designated)                      AS heritage_designated_pop,
          COUNT(*) FILTER (WHERE heritage_designation_type IS NOT NULL)       AS heritage_type_pop,
          COUNT(*) FILTER (WHERE heritage_designation_date IS NOT NULL)       AS heritage_date_pop,
          COUNT(*) FILTER (WHERE is_corner_lot)                               AS corner_lot_pop,
          COUNT(*) FILTER (WHERE is_through_lot)                              AS through_lot_pop,
          COUNT(*) FILTER (WHERE abuts_laneway)                               AS abuts_laneway_pop,
          COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)    AS frontage_name_pop,
          COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)             AS lot_size_conf_pop,
          COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)     AS max_footprint_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)           AS max_gfa_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'fsi')             AS max_gfa_fsi_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_box')    AS max_gfa_cov_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_only')   AS max_gfa_cov_only_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'high')               AS mb_conf_high_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'medium')             AS mb_conf_medium_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'low')                AS mb_conf_low_pop,
          COUNT(*) FILTER (WHERE garden_suite_fits)                           AS suite_fits_pop,
          COUNT(*) FILTER (WHERE envelope_constrained)                        AS env_constrained_pop,
          COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)          AS existing_footprint_pop,
          COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)                AS existing_gfa_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')      AS existing_conf_high_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')       AS existing_conf_low_pop,
          COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)         AS existing_greenspace_pop,
          COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)        AS scen_coa_pop,
          COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)               AS scen_floor_pop,
          COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)          AS scen_pot2_pop,
          COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)          AS scen_pot3_pop,
          COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)             AS scen_range_pop,
          COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)         AS scen_kitchen_pop,
          COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)            AS scen_bath_pop,
          COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)              AS garage_fits_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')           AS garage_aor_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'coa_required')          AS garage_coa_pop,
          COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)           AS opt_config_pop,
          COUNT(*) FILTER (WHERE comp_count IS NOT NULL)                      AS comp_pop,
          COUNT(*) FILTER (WHERE rear_suite_type IS NOT NULL)                 AS rear_suite_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')       AS rear_suite_aor_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')      AS rear_suite_coa_pop,
          ${COST_PROP_FILTER_SQL}
        FROM permits
      `);
    const pa = parseCountRow(paRaw);
    const permitsTotal = pa.permits_total || 0;
    const geocodedTotal = pa.latitude_pop || 0;
    const lifecyclePhaseTotal = pa.lifecycle_phase_pop || 0;
    const staleTotal = pa.stale_total || 0;
    const zoningEnrichedTotal = pa.zoning_enriched_pop || 0;

    const { rows: [eaRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                    AS entities_total,
          COUNT(*) FILTER (WHERE legal_name IS NOT NULL)              AS legal_name_pop,
          COUNT(*) FILTER (WHERE name_normalized IS NOT NULL)         AS name_normalized_pop,
          COUNT(*) FILTER (WHERE permit_count IS NOT NULL)            AS permit_count_pop,
          COUNT(*) FILTER (WHERE entity_type IS NOT NULL)             AS entity_type_pop,
          COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL)            AS last_seen_at_pop,
          COUNT(*) FILTER (WHERE is_wsib_registered = true)           AS wsib_registered_pop,
          COUNT(*) FILTER (WHERE primary_phone IS NOT NULL)           AS phone_pop,
          COUNT(*) FILTER (WHERE primary_email IS NOT NULL)           AS email_pop,
          COUNT(*) FILTER (WHERE website IS NOT NULL)                 AS website_pop
        FROM entities
      `);
    const ea = parseCountRow(eaRaw);
    const entitiesTotal = ea.entities_total || 0;

    const { rows: [bndRaw] } = await pool.query(`
        SELECT
          COUNT(DISTINCT p.builder_name)    AS builder_name_total,
          COUNT(DISTINCT e.name_normalized) AS matched_builder_names
        FROM permits p
        LEFT JOIN entities e ON e.name_normalized = p.builder_name
        WHERE p.builder_name IS NOT NULL AND p.permit_num NOT LIKE 'PRE-%'
      `);
    const bnd = parseCountRow(bndRaw);
    const builderNameTotal = bnd.builder_name_total || 0;
    const matchedBuilderNames = bnd.matched_builder_names || 0;

    const { rows: [waRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                     AS wsib_total,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL)         AS linked_pop,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL
            AND match_confidence IS NOT NULL)                          AS confidence_pop
        FROM wsib_registry
      `);
    const wa = parseCountRow(waRaw);
    const wsibTotal = wa.wsib_total || 0;

    const { rows: [pbRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                                  AS pb_total,
          COUNT(*) FILTER (WHERE pb.is_primary IS NOT NULL)                         AS is_primary_pop,
          COUNT(*) FILTER (WHERE pb.structure_type IS NOT NULL)                     AS structure_type_pop,
          COUNT(*) FILTER (WHERE pb.match_type IS NOT NULL)                         AS match_type_pop,
          COUNT(*) FILTER (WHERE pb.confidence IS NOT NULL)                         AS confidence_pop,
          COUNT(*) FILTER (WHERE pb.linked_at IS NOT NULL)                          AS linked_at_pop,
          COUNT(*) FILTER (WHERE bf.footprint_area_sqm IS NOT NULL)                 AS area_sqm_pop,
          COUNT(*) FILTER (WHERE bf.max_height_m IS NOT NULL)                       AS height_m_pop
        FROM parcel_buildings pb
        LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      `);
    const pb = parseCountRow(pbRaw);
    const pbTotal = pb.pb_total || 0;

    const { rows: [ptRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                     AS pt_total,
          COUNT(*) FILTER (WHERE tier IS NOT NULL)                     AS tier_pop,
          COUNT(*) FILTER (WHERE confidence IS NOT NULL)               AS confidence_pop,
          COUNT(*) FILTER (WHERE is_active IS NOT NULL)                AS is_active_pop,
          COUNT(*) FILTER (WHERE phase IS NOT NULL)                    AS phase_pop,
          COUNT(*) FILTER (WHERE lead_score IS NOT NULL)               AS lead_score_pop,
          COUNT(*) FILTER (WHERE classified_at IS NOT NULL)            AS classified_at_pop
        FROM permit_trades
      `);
    const pt = parseCountRow(ptRaw);
    const ptTotal = pt.pt_total || 0;

    const { rows: [ceRaw] } = await pool.query(`
        SELECT
          COUNT(*)                                                          AS ce_total,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)                AS estimated_cost_pop,
          COUNT(*) FILTER (WHERE cost_source IS NOT NULL)                   AS cost_source_pop,
          COUNT(*) FILTER (WHERE cost_tier IS NOT NULL)                     AS cost_tier_pop,
          COUNT(*) FILTER (WHERE cost_range_low IS NOT NULL)                AS cost_range_low_pop,
          COUNT(*) FILTER (WHERE cost_range_high IS NOT NULL)               AS cost_range_high_pop,
          COUNT(*) FILTER (WHERE premium_factor IS NOT NULL)                AS premium_factor_pop,
          COUNT(*) FILTER (WHERE complexity_score IS NOT NULL)              AS complexity_score_pop,
          COUNT(*) FILTER (WHERE model_version IS NOT NULL)                 AS model_version_pop,
          COUNT(*) FILTER (WHERE is_geometric_override IS NOT NULL)         AS is_geometric_override_pop,
          COUNT(*) FILTER (WHERE modeled_gfa_sqm IS NOT NULL)               AS modeled_gfa_sqm_pop,
          COUNT(*) FILTER (WHERE effective_area_sqm IS NOT NULL)            AS effective_area_sqm_pop,
          COUNT(*) FILTER (WHERE trade_contract_values IS NOT NULL)         AS trade_contract_values_pop,
          COUNT(*) FILTER (WHERE computed_at IS NOT NULL)                   AS computed_at_pop
        FROM cost_estimates
      `);
    const ce = parseCountRow(ceRaw);
    const ceTotal = ce.ce_total || 0;

    const { rows: [miscRaw] } = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_parcels)                                                            AS permits_with_parcel,
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_trades WHERE is_active = true)                                     AS permits_with_active_trade,
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM cost_estimates)                                                            AS permits_with_cost_estimate,
          (SELECT COUNT(DISTINCT pp.permit_num || '--' || pp.revision_num)
             FROM permit_parcels pp
             JOIN permits p ON p.permit_num = pp.permit_num
                           AND p.revision_num = pp.revision_num
            WHERE p.latitude IS NOT NULL)                                                   AS pp_linked_geocoded,
          (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings)                          AS massing_linked_parcels,
          (SELECT COUNT(*) FROM parcels
            WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL)                    AS parcels_with_centroid,
          (SELECT COUNT(*) FROM parcels)                                                    AS parcels_total,
          (SELECT COUNT(*) FROM parcels WHERE lot_size_sqm IS NOT NULL)                     AS parcels_with_area,
          (SELECT COUNT(*) FROM phase_calibration WHERE median_days IS NOT NULL)            AS calibration_rows,
          (SELECT COUNT(*) FROM coa_applications WHERE linked_permit_num IS NOT NULL)       AS coa_linked_pop,
          (SELECT COUNT(*) FROM coa_applications)                                           AS coa_total,
          (SELECT COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL) AS coa_lifecycle_phase_pop,
          (SELECT COUNT(*) FROM coa_applications
            WHERE decision = 'Approved' AND linked_permit_num IS NULL)                      AS coa_approved_unlinked,
          (SELECT COUNT(*) FROM coa_applications WHERE decision = 'Approved')               AS coa_approved_total,
          (SELECT COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL)           AS coa_unlinked_total,
          (SELECT COUNT(*) FROM tracked_projects WHERE status != 'archived')               AS tracked_active,
          (SELECT COUNT(*) FROM tracked_projects)                                           AS tracked_total,
          (SELECT COUNT(*) FROM lead_analytics)                                             AS lead_analytics_total,
          (SELECT COUNT(*) FROM data_quality_snapshots
            WHERE snapshot_date = CURRENT_DATE)                                             AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots
            WHERE captured_at > NOW() - INTERVAL '25 hours')                               AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT permit_num, revision_num FROM permits
             GROUP BY 1, 2 HAVING COUNT(*) > 1
          ) sub)                                                                            AS dup_permit_pks
      `);
    const misc = parseCountRow(miscRaw);

    const { rows: [tfdRaw] } = await pool.query(`
        SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num) AS forecast_eligible_permits
          FROM permits p
          JOIN permit_trades pt ON pt.permit_num = p.permit_num
                               AND pt.revision_num = p.revision_num
                               AND pt.is_active = true
         WHERE p.permit_num NOT LIKE 'PRE-%'
           AND p.lifecycle_phase IS NOT NULL
           AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
           AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'
      `);
    const tfd = parseCountRow(tfdRaw);
    const forecastEligible = tfd.forecast_eligible_permits || 0;

    const { rows: [tfaRaw] } = await pool.query(`
        SELECT
          COUNT(*) AS forecast_total,
          COUNT(DISTINCT permit_num || '--' || revision_num)                                           AS forecast_total_permits,
          COUNT(DISTINCT permit_num || '--' || revision_num)
            FILTER (WHERE predicted_start IS NOT NULL)                                                 AS predicted_start_permits,
          COUNT(DISTINCT permit_num || '--' || revision_num)
            FILTER (WHERE urgency IS NOT NULL AND urgency NOT IN ('unknown'))                          AS urgency_classified_permits,
          COUNT(*) FILTER (WHERE trade_slug IS NOT NULL)                                               AS trade_slug_pop,
          COUNT(*) FILTER (WHERE target_window IS NOT NULL)                                            AS target_window_pop,
          COUNT(*) FILTER (WHERE confidence IS NOT NULL)                                               AS confidence_pop,
          COUNT(*) FILTER (WHERE calibration_method IS NOT NULL)                                       AS calibration_method_pop,
          COUNT(*) FILTER (WHERE sample_size IS NOT NULL)                                              AS sample_size_pop,
          COUNT(*) FILTER (WHERE median_days IS NOT NULL)                                              AS median_days_pop,
          COUNT(*) FILTER (WHERE p25_days IS NOT NULL)                                                 AS p25_days_pop,
          COUNT(*) FILTER (WHERE p75_days IS NOT NULL)                                                 AS p75_days_pop,
          COUNT(*) FILTER (WHERE opportunity_score IS NOT NULL)                                        AS opportunity_score_pop,
          COUNT(*) FILTER (WHERE computed_at IS NOT NULL)                                              AS computed_at_pop,
          COUNT(*) FILTER (WHERE urgency IS NULL OR urgency <> 'expired')                              AS opp_score_denom,
          COUNT(*) FILTER (WHERE (urgency IS NULL OR urgency <> 'expired') AND opportunity_score > 0)  AS opp_score_pop
        FROM trade_forecasts
        WHERE permit_num NOT LIKE 'PRE-%'
      `);
    const tfa = parseCountRow(tfaRaw);
    const forecastTotal = tfa.forecast_total || 0;
    const oppScoreDenom = tfa.opp_score_denom || 0;

    const { rows: [pSchemaRaw] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'permits'
      `);
    const pSchema = parseCountRow(pSchemaRaw);

    const { rows: etRuns } = await pool.query(`
        SELECT records_meta FROM pipeline_runs
         WHERE pipeline = 'assert_entity_tracing'
         ORDER BY started_at DESC LIMIT 1
      `);
    const etVerdictNum = readEntityTracingVerdict(etRuns[0]) === 'PASS' ? 1 : 0;

    const { rows: leadIntegrity } = await pool.query(`
        SELECT
          (SELECT COUNT(*)
             FROM permits p
             JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
            WHERE ptc.class = 'administrative' AND p.lead_id IS NOT NULL) AS admin_drift,
          (SELECT COUNT(*) FROM (
             SELECT lead_id FROM permits
              WHERE lead_id IS NOT NULL
              GROUP BY lead_id HAVING COUNT(*) > 1) d)                    AS dupe_groups
      `);
    const adminDrift = safeParseIntOrNull(leadIntegrity[0].admin_drift) ?? 0;
    const dupeGroups = safeParseIntOrNull(leadIntegrity[0].dupe_groups) ?? 0;

    const { rows: scopeDrift } = await pool.query(`
        SELECT COUNT(*)::int AS n FROM permits
         WHERE enriched_status IS NOT NULL AND status IS DISTINCT FROM 'Inspection'
      `);
    const driftRows = safeParseIntOrNull(scopeDrift[0].n) ?? 0;

    const trackedTotal = misc.tracked_total || 0;
    const trackedActive = misc.tracked_active || 0;

    return {
      pa, ea, bnd, wa, pb, pt, ce, misc, tfd, tfa, pSchema,
      permitsTotal, geocodedTotal, lifecyclePhaseTotal, staleTotal, zoningEnrichedTotal,
      entitiesTotal, builderNameTotal, matchedBuilderNames, wsibTotal, pbTotal, ptTotal, ceTotal,
      forecastEligible, forecastTotal, oppScoreDenom, trackedTotal, trackedActive,
      etVerdictNum, adminDrift, dupeGroups, driftRows,
    };
  });
}

async function loadBranch(ctx, loaderKey) {
  if (loaderKey === 'coa') return loadCoaBranch(ctx);
  if (loaderKey === 'sources') return loadSourcesBranch(ctx);
  if (loaderKey === 'permits') return loadPermitsBranch(ctx);
  return null;
}

// ---------------------------------------------------------------------------
// Per-builder-kind evaluators — one generic function per BUILDER KIND (not per
// check); CHECK_DEFS supplies the per-check data (§5.5 (1) generalized to a data-
// driven descriptor rather than 303 near-identical hand-typed functions).
// ---------------------------------------------------------------------------

async function evalCoverageLike(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const populated = getPath(branch, def.pop);
  const denominator = def.denom ? getPath(branch, def.denom) : null;
  const p = pct(populated, denominator);
  ctx.report(def.id, { value: p, detail: p !== null ? `${p}%` : populated });
}

async function evalInfo(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.pop);
  ctx.report(def.id, { violations: Number.isFinite(value) ? value : 0 });
}

async function evalInvariant(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.pop);
  ctx.report(def.id, { violations: Number.isFinite(value) ? value : 0 });
}

async function evalScopeDrift(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const value = getPath(branch, def.pop);
  ctx.report(def.id, { violations: Number.isFinite(value) ? value : 0 });
}

async function evalDistribution(ctx, def) {
  const branch = await loadBranch(ctx, def.loader);
  const rows = getPath(branch, def.pop) || [];
  ctx.report(def.id, { violations: 0, detail: { by_reason: rows.map((r) => ({ reason: r.reason, count: r.n })) } });
}

async function evalVocab(ctx, def) {
  const t = def.vocabTriple;
  const result = await resolveAndCountTriple(ctx.pool, t, { logWarn: ctx.log.warn });
  if (result.unresolved) {
    ctx.report(def.id, { value: null, detail: `unresolved: ${result.unresolved}` });
    return;
  }
  if (!result.vocab_size) {
    ctx.report(def.id, { value: null, detail: `${result.present}/0` });
    return;
  }
  const p = Math.round((result.present / result.vocab_size) * 1000) / 10;
  ctx.report(def.id, { value: p, detail: `${result.present}/${result.vocab_size} (${p}%)` });
}

const EVALUATORS = {
  coverage: evalCoverageLike,
  calibrated: evalCoverageLike,
  external: evalCoverageLike,
  info: evalInfo,
  invariant: evalInvariant,
  scope_drift_warn: evalScopeDrift,
  scope_drift_retighten: evalScopeDrift,
  distribution: evalDistribution,
  vocab: evalVocab,
};

// ---------------------------------------------------------------------------
// Dispatch table — built FROM CHECK_DEFS (single source of truth with the descriptor
// generator, `scripts/generate-assert-global-coverage-descriptor.js`).
// ---------------------------------------------------------------------------

const DEFS_BY_ID = new Map(CHECK_DEFS.map((d) => [d.id, d]));

const CHECKS = {};
for (const def of CHECK_DEFS) {
  const evaluator = EVALUATORS[def.builder];
  if (!evaluator) throw new Error(`assert-global-coverage compute: no evaluator for builder "${def.builder}" (check ${def.id})`);
  const dispatchFn = (ctx) => evaluator(ctx, def);
  // §5.2/§5.5 conformance ("dispatch keys are exactly the descriptor's check ids") expects a
  // NAMED function per id — with 305 generated (not hand-typed, Ask A1) dispatch entries, the
  // name is stamped onto the generated closure rather than writing 305 declarations by hand.
  Object.defineProperty(dispatchFn, 'name', { value: def.id, configurable: true });
  CHECKS[def.id] = dispatchFn;
}

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. The dispatch loop is the
 * error boundary (peel 8b precedent, assert-schema): whatever a check throws becomes
 * `{ error }` under that check's own id.
 */
async function compute(ctx) {
  ctx.log.info(`[${ctx.descriptor.identity.name}]`, '=== Global Data Completeness Profile ===');
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
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.CHECK_DEFS_BY_ID = DEFS_BY_ID;
