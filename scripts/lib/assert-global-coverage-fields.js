'use strict';
/**
 * assert-global-coverage-fields.js — the SINGLE declared source of truth for every
 * `assert_global_coverage` check: descriptor generation (`scripts/quality/
 * assert-global-coverage.descriptor.json`) AND the compute dispatch table
 * (`scripts/lib/compute/assert-global-coverage.js`) both read this ONE array, so the
 * two can never silently drift (mirrors the row-builder census methodology, Ask A1 —
 * "tool-generate the checks[] array... not hand-typed from scratch").
 *
 * Pure data + pure helpers — no I/O, no `pg`, no `ctx`. Safe to `require()` from a
 * compute module (Spec 122 §5.5 (3) — a pure `scripts/lib/` leaf is allowed).
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.10 (COST_PROP_COLS)
 *
 * Ported verbatim from `scripts/quality/assert-global-coverage.js` (pre-conversion,
 * 1,464 L) per `docs/reports/2026-09-11-batch1-i1-assert-global-coverage-assessment.md`
 * §2.3 (the 273-row builder census) and §2.4 (the operator's PH-3 adjudication — 14 new
 * logic_variables, 7 pairs).
 */

const { COST_PROP_COLS } = require('./parcel-cost-cols');

/** id-safe slug: lowercase, non [a-z0-9] runs -> '_', trim/collapse. Matches step.schema.json's `^[a-z][a-z0-9_]*$`. */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

// ---------------------------------------------------------------------------
// Vocabulary-coverage matrix (Spec 49 §3/§4). VERBATIM port of the source file's
// `VOCAB_COVERAGE` array — §3.0 correction 1 of the assessment report: 4 entries,
// not 3 (the assert_global_coverage.js source array itself was always correct;
// the report's own prose miscounted it at commit 3, corrected at commit 3 note).
// ---------------------------------------------------------------------------
const VOCAB_COVERAGE = [
  { id: 'vocab_permit_trades_trade_id', stepTarget: 'Step 13 — classify_permits', dataTable: 'permit_trades', dataColumn: 'trade_id', dataFilter: null, vocabTable: 'trades', vocabColumn: 'id', vocabFilter: "kind != 'deprecated'" },
  { id: 'vocab_permit_products_product_id', stepTarget: 'Step 13 — classify_permits (products)', dataTable: 'permit_products', dataColumn: 'product_id', dataFilter: null, vocabTable: 'product_groups', vocabColumn: 'id', vocabFilter: null },
  { id: 'vocab_coa_lead_trades_trade_id', stepTarget: 'CoA Step 7 — classify_coa_trades', dataTable: 'lead_trades', dataColumn: 'trade_id', dataFilter: "lead_id LIKE 'coa:%'", vocabTable: 'trades', vocabColumn: 'id', vocabFilter: "kind != 'deprecated'" },
  { id: 'vocab_permits_neighbourhood_id', stepTarget: 'Step 10 — link_neighbourhoods', dataTable: 'permits', dataColumn: 'neighbourhood_id', dataFilter: 'neighbourhood_id <> -1', vocabTable: 'neighbourhoods', vocabColumn: 'id', vocabFilter: null },
];

// The CoA-only inline vocab triple (source `:446-450`) — structure_type, called directly
// (NOT part of the shared VOCAB_COVERAGE loop, so it stays CoA-scoped).
const COA_STRUCTURE_TYPE_VOCAB = {
  id: 'vocab_coa_structure_type',
  stepTarget: 'CoA Step 5 — classify_coa_scope',
  dataTable: 'coa_applications', dataColumn: 'structure_type', dataFilter: "lead_id LIKE 'coa:%'",
  vocabTable: 'scope_intensity_matrix', vocabColumn: 'structure_type', vocabFilter: "structure_type NOT IN ('Other','Unknown')",
};

// ---------------------------------------------------------------------------
// The 20 logic_variables this step consumes: 6 pre-existing + 14 newly-adjudicated
// (report §2.4). All 20 feed a PASS/WARN boundary directly (Rule 3) -> on_invalid: "fail".
// ---------------------------------------------------------------------------
const LOGIC_VAR_DEFS = [
  { name: 'profiling_coverage_pass_pct', default: 90, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: coverage >= this integer pct -> PASS (spec 49)' },
  { name: 'profiling_coverage_warn_pct', default: 70, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: coverage >= this integer pct -> WARN, else FAIL (spec 49)' },
  { name: 'vocab_coverage_pass_pct', default: 90, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: vocabulary coverage >= this integer pct -> PASS (spec 49 §3)' },
  { name: 'vocab_coverage_warn_pct', default: 70, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: vocabulary coverage >= this integer pct -> WARN, else FAIL (spec 49 §3)' },
  { name: 'cost_coverage_pass_pct', default: 55, min: 0, max: 100, group: 'Cost Audit Thresholds', description: 'assert-global-coverage: WF3 F4 archetype-era cost-coverage floor for Step-14 cost_estimates rows -> PASS' },
  { name: 'cost_coverage_warn_pct', default: 50, min: 0, max: 100, group: 'Cost Audit Thresholds', description: 'assert-global-coverage: WF3 F4 cost-coverage floor -> WARN, else FAIL' },
  // IL-3 / DEC-1 (#406) — CoA :360 + permits :1102, one pair, two call sites.
  { name: 'zoning_class_coverage_pass_pct', default: 80, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: zoning_class calibrated coverage (DEC-1, #406) -> PASS (CoA + permits)' },
  { name: 'zoning_class_coverage_warn_pct', default: 75, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: zoning_class calibrated coverage (DEC-1, #406) -> WARN, else FAIL' },
  // IL-9 — CoA :352.
  { name: 'coa_neighbourhood_coverage_pass_pct', default: 95, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: CoA neighbourhood_id calibrated coverage -> PASS' },
  { name: 'coa_neighbourhood_coverage_warn_pct', default: 90, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: CoA neighbourhood_id calibrated coverage -> WARN, else FAIL' },
  // IL-10 — CoA :439.
  { name: 'coa_structure_type_coverage_pass_pct', default: 45, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: CoA structure_type calibrated coverage (description-classifier ceiling ~52%) -> PASS' },
  { name: 'coa_structure_type_coverage_warn_pct', default: 35, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: CoA structure_type calibrated coverage -> WARN, else FAIL' },
  // IL-11 — sources :573 (zoning_class).
  { name: 'sources_zoning_class_coverage_pass_pct', default: 90, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: sources-chain parcels.zoning_class calibrated coverage -> PASS' },
  { name: 'sources_zoning_class_coverage_warn_pct', default: 85, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: sources-chain parcels.zoning_class calibrated coverage -> WARN, else FAIL' },
  // IL-11 — sources :575-578 (max-build block, 4 checks, has_bldg-scoped).
  { name: 'sources_maxbuild_coverage_pass_pct', default: 88, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: sources-chain max-build/opt envelope calibrated coverage (residential w/ building) -> PASS' },
  { name: 'sources_maxbuild_coverage_warn_pct', default: 75, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: sources-chain max-build/opt envelope calibrated coverage (residential w/ building) -> WARN, else FAIL' },
  // IL-12 — sources :617 (parcel_cost_menu, has_bldg-scoped).
  { name: 'parcel_cost_menu_coverage_pass_pct', default: 85, min: 0, max: 100, group: 'Cost Audit Thresholds', description: 'assert-global-coverage: sources-chain parcel_cost_menu calibrated coverage (residential w/ building) -> PASS' },
  { name: 'parcel_cost_menu_coverage_warn_pct', default: 80, min: 0, max: 100, group: 'Cost Audit Thresholds', description: 'assert-global-coverage: sources-chain parcel_cost_menu calibrated coverage (residential w/ building) -> WARN, else FAIL' },
  // IL-8 — permits :1073,:1075 (externalRow's own hard-coded 10/5, promoted to a var).
  { name: 'external_coverage_pass_pct', default: 10, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: scraper-sourced (external) field coverage -> PASS (AGC-D3)' },
  { name: 'external_coverage_warn_pct', default: 5, min: 0, max: 100, group: 'Coverage & Quality', description: 'assert-global-coverage: scraper-sourced (external) field coverage -> WARN, else FAIL (AGC-D3)' },
];

// ---------------------------------------------------------------------------
// CHECK_DEFS — the 273-row builder census (report §2.3), mechanically disposed.
//
// Fields:
//   id         - unique, `^[a-z][a-z0-9_]*$`
//   chain      - 'coa' | 'permits' | 'sources' | ['permits','coa'] (shared, sources-excluded)
//   builder    - 'coverage' | 'info' | 'calibrated' | 'external' | 'invariant' | 'distribution'
//   loader     - which branch loader supplies the data object: 'coa' | 'permits' | 'sources' | 'none'
//   pop        - dotted path into the loader's returned object for the populated count
//   denom      - dotted path for the denominator, or null (raw count, no percentage)
//   passVar / warnVar - for 'calibrated'/'external' only: the logic_variables names
//   stepTarget / field - the ORIGINAL (stepTarget, field) pair, for `why`/metric-label parity
// ---------------------------------------------------------------------------
const CHECK_DEFS = [];

function push(def) {
  CHECK_DEFS.push(def);
}

// ============================= CoA chain =============================
push({ id: 'coa_step1_columns_present', chain: 'coa', builder: 'info', loader: 'coa', pop: 'csSchema.cols', denom: null, stepTarget: 'CoA Step 1 — assert_schema', field: 'coa_applications.columns_present' });
push({ id: 'coa_step2_address', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.address_pop', denom: 'coaTotal', stepTarget: 'CoA Step 2 — load_coa', field: 'coa_applications.address' });
push({ id: 'coa_step2_ward', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.ward_pop', denom: 'coaTotal', stepTarget: 'CoA Step 2 — load_coa', field: 'coa_applications.ward' });
push({ id: 'coa_step2_decision', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.decision_pop', denom: 'coaTotal', stepTarget: 'CoA Step 2 — load_coa', field: 'coa_applications.decision' });
push({ id: 'coa_step2_application_number', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.app_num_pop', denom: 'coaTotal', stepTarget: 'CoA Step 2 — load_coa', field: 'coa_applications.application_number' });
push({ id: 'coa_step3_days_since_latest', chain: 'coa', builder: 'info', loader: 'coa', pop: 'daysSinceLatest', denom: null, stepTarget: 'CoA Step 3 — assert_coa_freshness', field: 'coa_applications.days_since_latest' });
push({ id: 'coa_step4_parcel_linked_at', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.parcel_linked_pop', denom: 'coaTotal', stepTarget: 'CoA Step 4 — link_coa_to_parcels', field: 'coa_applications.parcel_linked_at' });
push({ id: 'coa_step4_lead_parcels_rows', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cx.lead_parcels_coa_rows', denom: null, stepTarget: 'CoA Step 4 — link_coa_to_parcels', field: 'lead_parcels.coa_rows' });
push({ id: 'coa_step4_neighbourhood_id', chain: 'coa', builder: 'calibrated', loader: 'coa', pop: 'ca.neighbourhood_id_pop', denom: 'cx.lead_parcels_coa_rows', passVar: 'coa_neighbourhood_coverage_pass_pct', warnVar: 'coa_neighbourhood_coverage_warn_pct', stepTarget: 'CoA Step 4 — link_coa_to_parcels', field: 'coa_applications.neighbourhood_id' });
push({ id: 'coa_step4b_zoning_class', chain: 'coa', builder: 'calibrated', loader: 'coa', pop: 'ca.zoning_class_pop', denom: 'coaTotal', passVar: 'zoning_class_coverage_pass_pct', warnVar: 'zoning_class_coverage_warn_pct', stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.zoning_class' });
push({ id: 'coa_step4b_zoning_enriched_at', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.zoning_enriched_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.zoning_enriched_at' });
push({ id: 'coa_step4b_bylaw_max_coverage_pct', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.bylaw_max_coverage_pct_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.bylaw_max_coverage_pct' });
push({ id: 'coa_step4b_bylaw_max_fsi', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.bylaw_max_fsi_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.bylaw_max_fsi' });
push({ id: 'coa_step4b_bylaw_max_height_m', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.bylaw_max_height_m_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.bylaw_max_height_m' });
push({ id: 'coa_step4b_exception_number', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.exception_number_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.exception_number' });
push({ id: 'coa_step4b_variance_context', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.variance_context_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.variance_context' });
push({ id: 'coa_step4b_zoning_parcel_count', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.zoning_parcel_count_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.zoning_parcel_count' });
push({ id: 'coa_step4b_zoning_dominant_parcel_id', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.zoning_dominant_parcel_id_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.zoning_dominant_parcel_id' });
push({ id: 'coa_step4b_zoning_dominant_parcel_method', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.zoning_dominant_parcel_method_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.zoning_dominant_parcel_method' });
push({ id: 'coa_step4b_is_in_ravine_protection_area', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.in_ravine_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.is_in_ravine_protection_area' });
push({ id: 'coa_step4b_ravine_distance_m', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.ravine_distance_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.ravine_distance_m' });
push({ id: 'coa_step4b_is_heritage_designated', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.heritage_designated_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.is_heritage_designated' });
push({ id: 'coa_step4b_heritage_designation_type', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.heritage_type_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.heritage_designation_type' });
push({ id: 'coa_step4b_heritage_designation_date', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.heritage_date_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.heritage_designation_date' });
push({ id: 'coa_step4b_is_corner_lot', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.corner_lot_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.is_corner_lot' });
push({ id: 'coa_step4b_is_through_lot', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.through_lot_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.is_through_lot' });
push({ id: 'coa_step4b_abuts_laneway', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.abuts_laneway_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.abuts_laneway' });
push({ id: 'coa_step4b_primary_frontage_street_name', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.frontage_name_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.primary_frontage_street_name' });
push({ id: 'coa_step4b_lot_size_confidence', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.lot_size_conf_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.lot_size_confidence' });
push({ id: 'coa_step4b_max_buildable_footprint_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.max_footprint_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_buildable_footprint_sqm' });
push({ id: 'coa_step4b_max_buildable_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.max_gfa_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_buildable_gfa_sqm' });
push({ id: 'coa_step4b_max_buildable_gfa_basis_fsi', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.max_gfa_fsi_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_buildable_gfa_basis_fsi' });
push({ id: 'coa_step4b_max_buildable_gfa_basis_coverage_box', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.max_gfa_cov_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_buildable_gfa_basis_coverage_box' });
push({ id: 'coa_step4b_max_buildable_gfa_basis_coverage_only', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.max_gfa_cov_only_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_buildable_gfa_basis_coverage_only' });
push({ id: 'coa_step4b_max_build_confidence_high', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.mb_conf_high_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_build_confidence_high' });
push({ id: 'coa_step4b_max_build_confidence_medium', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.mb_conf_medium_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_build_confidence_medium' });
push({ id: 'coa_step4b_max_build_confidence_low', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.mb_conf_low_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_build_confidence_low' });
push({ id: 'coa_step4b_garden_suite_fits', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.suite_fits_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.garden_suite_fits' });
push({ id: 'coa_step4b_envelope_constrained', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.env_constrained_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.envelope_constrained' });
push({ id: 'coa_step4b_imagery_roof_footprint_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.existing_footprint_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.imagery_roof_footprint_sqm' });
push({ id: 'coa_step4b_imagery_roof_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.existing_gfa_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.imagery_roof_gfa_sqm' });
push({ id: 'coa_step4b_existing_structure_confidence_high', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.existing_conf_high_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.existing_structure_confidence_high' });
push({ id: 'coa_step4b_existing_structure_confidence_low', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.existing_conf_low_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.existing_structure_confidence_low' });
push({ id: 'coa_step4b_existing_greenspace_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.existing_greenspace_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.existing_greenspace_sqm' });
push({ id: 'coa_step4b_max_newbuild_coa_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_coa_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_newbuild_coa_gfa_sqm' });
push({ id: 'coa_step4b_cur_floor_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_floor_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_floor_gfa_sqm' });
push({ id: 'coa_step4b_cur_pot_2story_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_pot2_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_pot_2story_gfa_sqm' });
push({ id: 'coa_step4b_cur_pot_3story_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_pot3_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_pot_3story_gfa_sqm' });
push({ id: 'coa_step4b_cur_gfa_range_basis', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_range_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_gfa_range_basis' });
push({ id: 'coa_step4b_cur_est_kitchen_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_kitchen_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_est_kitchen_gfa_sqm' });
push({ id: 'coa_step4b_cur_est_bath_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.scen_bath_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.cur_est_bath_gfa_sqm' });
push({ id: 'coa_step4b_max_garage_gfa_sqm', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.garage_fits_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.max_garage_gfa_sqm' });
push({ id: 'coa_step4b_garage_permission_as_of_right', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.garage_aor_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.garage_permission_as_of_right' });
push({ id: 'coa_step4b_garage_permission_coa_required', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.garage_coa_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.garage_permission_coa_required' });
push({ id: 'coa_step4b_rear_suite_type', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.rear_suite_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.rear_suite_type' });
push({ id: 'coa_step4b_rear_suite_permission_as_of_right', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.rear_suite_aor_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.rear_suite_permission_as_of_right' });
push({ id: 'coa_step4b_rear_suite_permission_coa_required', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.rear_suite_coa_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.rear_suite_permission_coa_required' });
push({ id: 'coa_step4b_opt_config_confidence', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.opt_config_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.opt_config_confidence' });
push({ id: 'coa_step4b_comp_count', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.comp_pop', denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: 'coa_applications.comp_count' });
for (const c of COST_PROP_COLS) {
  push({ id: `coa_step4b_cost_prop_${c}`, chain: 'coa', builder: 'info', loader: 'coa', pop: `ca.${c}_pop`, denom: null, stepTarget: 'CoA Step 4b — enrich_coa_zoning', field: `coa_applications.${c}` });
}
push({ id: 'coa_step5_scope_tags', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.scope_tags_pop', denom: 'coaTotal', stepTarget: 'CoA Step 5 — classify_coa_scope', field: 'coa_applications.scope_tags' });
push({ id: 'coa_step5_scope_classified_at', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.scope_classified_pop', denom: 'coaTotal', stepTarget: 'CoA Step 5 — classify_coa_scope', field: 'coa_applications.scope_classified_at' });
push({ id: 'coa_step5_structure_type', chain: 'coa', builder: 'calibrated', loader: 'coa', pop: 'ca.structure_type_pop', denom: 'coaTotal', passVar: 'coa_structure_type_coverage_pass_pct', warnVar: 'coa_structure_type_coverage_warn_pct', stepTarget: 'CoA Step 5 — classify_coa_scope', field: 'coa_applications.structure_type' });
push({ id: COA_STRUCTURE_TYPE_VOCAB.id, chain: 'coa', builder: 'vocab', loader: 'none', vocabTriple: COA_STRUCTURE_TYPE_VOCAB, stepTarget: COA_STRUCTURE_TYPE_VOCAB.stepTarget, field: 'coa_applications.structure_type vocab' });
push({ id: 'coa_step6_trade_classified_at', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.trade_classified_pop', denom: 'coaTotal', stepTarget: 'CoA Step 6 — classify_coa_trades', field: 'coa_applications.trade_classified_at' });
push({ id: 'coa_step6_lead_trades_rows', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cx.lead_trades_coa_rows', denom: null, stepTarget: 'CoA Step 6 — classify_coa_trades', field: 'lead_trades.coa_rows' });
push({ id: 'coa_step6_lead_products_rows', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cx.lead_products_coa_rows', denom: null, stepTarget: 'CoA Step 6 — classify_coa_trades', field: 'lead_products.coa_rows' });
push({ id: 'coa_step7_cost_classified_at', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.cost_classified_pop', denom: 'coaTotal', stepTarget: 'CoA Step 7 — compute_coa_cost_estimates', field: 'coa_applications.cost_classified_at' });
// Pipeline Rehab P4 (2026-08-03) — PRODUCER-SIDE accepted baseline (Spec 48 §4.6/§4.9).
// Original: a would-be FAIL below the global passPct is downgraded to WARN unconditionally
// (never re-FAILs no matter how low), self-retiring at >= passPct. `warnLimitLiteral: 'pct >= 0'`
// (a fixed, non-config floor — always true for any real percentage) reproduces exactly that
// "PASS >= passPct, else always WARN" shape without a config-driven warn tier.
push({ id: 'coa_step7_estimated_cost', chain: 'coa', builder: 'calibrated', loader: 'coa', pop: 'ca.estimated_cost_pop', denom: 'coaTotal', passVar: 'profiling_coverage_pass_pct', warnLimitLiteral: 'pct >= 0', stepTarget: 'CoA Step 7 — compute_coa_cost_estimates', field: 'coa_applications.estimated_cost' });
// The self-announcing accepted-WARN companion pair (Spec 48 §4.9) — declared as their OWN checks
// rather than conditionally-spread extra rows (the checks[] framework always emits one row per
// declared check; a declared-but-inert reading at >= passPct is the Nothing-Hidden-consistent
// difference from the pre-conversion "0 rows when self-retired" shape — a named, documented
// conversion consequence, not a silent one).
// severityOverride: 'WARN' — measured live (commit 7 G2' capture): the plain 'coverage'
// builder's default FAIL severity flipped the WHOLE coa-chain verdict from WARN to FAIL,
// because 61.2% sits BELOW the global 70% warn floor too. The pre-conversion
// acceptedBaselineRows() companion is BY DESIGN a WARN-only signal (Spec 48 §4.9 — "the
// would-be FAIL is downgraded to WARN"); this row must never itself escalate a chain's
// verdict past WARN, or the accepted-baseline mechanism defeats its own purpose.
push({ id: 'coa_cost_coverage_gate_accepted', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.estimated_cost_pop', denom: 'coaTotal', severityOverride: 'WARN', stepTarget: 'CoA Step 7 — compute_coa_cost_estimates', field: 'coa_applications.estimated_cost (accepted-baseline companion, Spec 48 §4.9)' });
push({ id: 'coa_cost_coverage_gate_accepted_retighten', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.estimated_cost_pop', denom: null, stepTarget: 'CoA Step 7 — compute_coa_cost_estimates', field: 'coa_applications.estimated_cost (retighten condition, Spec 48 §4.9)' });
push({ id: 'coa_step7_cost_estimates_rows', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cx.cost_estimates_coa_rows', denom: null, stepTarget: 'CoA Step 7 — compute_coa_cost_estimates', field: 'cost_estimates.coa_rows' });
push({ id: 'coa_step8_linked_permit_num', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'linkedTotal', denom: 'coaTotal', stepTarget: 'CoA Step 8 — link_coa', field: 'coa_applications.linked_permit_num' });
push({ id: 'coa_step8_linked_confidence', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.confidence_pop', denom: 'linkedTotal', stepTarget: 'CoA Step 8 — link_coa', field: 'coa_applications.linked_confidence' });
push({ id: 'coa_step9_snapshot_today', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cm.snapshot_today', denom: null, stepTarget: 'CoA Step 9 — refresh_snapshot', field: 'data_quality_snapshots.today' });
push({ id: 'coa_step10_duplicate_pks', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cm.dup_coa_pks', denom: null, stepTarget: 'CoA Step 10 — assert_data_bounds', field: 'coa_applications.duplicate_pks' });
push({ id: 'coa_step11_engine_health_today', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cm.engine_health_today', denom: null, stepTarget: 'CoA Step 11 — assert_engine_health', field: 'engine_health_snapshots.today' });
push({ id: 'coa_step12_lifecycle_phase', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'lifecyclePhaseTotal', denom: 'unlinkedTotal', stepTarget: 'CoA Step 12 — classify_lifecycle_phase', field: 'coa_applications.lifecycle_phase' });
push({ id: 'coa_step12_lifecycle_stalled', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.lifecycle_stalled_true_pop', denom: null, stepTarget: 'CoA Step 12 — classify_lifecycle_phase', field: 'coa_applications.lifecycle_stalled' });
push({ id: 'coa_step12_lifecycle_classified_at', chain: 'coa', builder: 'coverage', loader: 'coa', pop: 'ca.lifecycle_classified_pop', denom: 'unlinkedTotal', stepTarget: 'CoA Step 12 — classify_lifecycle_phase', field: 'coa_applications.lifecycle_classified_at' });
push({ id: 'coa_step13_unclassified_count', chain: 'coa', builder: 'info', loader: 'coa', pop: 'ca.unclassified_count', denom: null, stepTarget: 'CoA Step 13 — assert_lifecycle_phase_distribution', field: 'coa_applications.unclassified_count' });
push({ id: 'coa_step14_calibration_rows', chain: 'coa', builder: 'info', loader: 'coa', pop: 'cx.calibration_coa_rows', denom: null, stepTarget: 'CoA Step 14 — compute_phase_calibration', field: 'phase_stay_calibration.coa_rows' });

// ============================= Sources chain =============================
push({ id: 'src_zoning_class', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'pp.zoning_class_pop', denom: 'enriched', passVar: 'sources_zoning_class_coverage_pass_pct', warnVar: 'sources_zoning_class_coverage_warn_pct', stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.zoning_class' });
push({ id: 'src_max_buildable_footprint_sqm', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'mbc.mb_footprint_pop', denom: 'residWithBldgEnv', passVar: 'sources_maxbuild_coverage_pass_pct', warnVar: 'sources_maxbuild_coverage_warn_pct', stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.max_buildable_footprint_sqm (residential w/ building)' });
push({ id: 'src_max_buildable_gfa_sqm', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'mbc.mb_gfa_pop', denom: 'residWithBldgEnv', passVar: 'sources_maxbuild_coverage_pass_pct', warnVar: 'sources_maxbuild_coverage_warn_pct', stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.max_buildable_gfa_sqm (residential w/ building)' });
push({ id: 'src_max_build_stories', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'mbc.mb_stories_pop', denom: 'residWithBldgEnv', passVar: 'sources_maxbuild_coverage_pass_pct', warnVar: 'sources_maxbuild_coverage_warn_pct', stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.max_build_stories (residential w/ building)' });
push({ id: 'src_opt_aor_gfa_sqm', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'mbc.opt_aor_pop', denom: 'residWithBldgEnv', passVar: 'sources_maxbuild_coverage_pass_pct', warnVar: 'sources_maxbuild_coverage_warn_pct', stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.opt_aor_gfa_sqm (residential w/ building)' });
push({ id: 'src_bylaw_max_fsi', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.bylaw_max_fsi_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.bylaw_max_fsi' });
push({ id: 'src_opt_config_confidence', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.opt_conf_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.opt_config_confidence' });
push({ id: 'src_opt_coa_gfa_sqm', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.opt_coa_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.opt_coa_gfa_sqm' });
push({ id: 'src_comp_count', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.comp_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.comp_count' });
push({ id: 'src_neighbourhood_id', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.nbhd_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.neighbourhood_id' });
push({ id: 'src_cost_fb_total', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.cost_fb_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.cost_fb_total' });
push({ id: 'src_envelope_constrained_true', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pp.env_constrained_pop', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: 'parcels.envelope_constrained (TRUE)' });
push({ id: 'src_envelope_constraint_reason_distribution', chain: 'sources', builder: 'distribution', loader: 'sources', pop: 'reasonDist', denom: null, stepTarget: 'Sources Step — enrich_parcels', field: "parcels.envelope_constraint_reason distribution" });
push({ id: 'src_parcel_cost_menu_resid_bldg', chain: 'sources', builder: 'calibrated', loader: 'sources', pop: 'pcm.resid_with_bldg_menu', denom: 'residWithBldg', passVar: 'parcel_cost_menu_coverage_pass_pct', warnVar: 'parcel_cost_menu_coverage_warn_pct', stepTarget: 'Sources Step — compute_parcel_cost_estimates', field: 'parcels.parcel_cost_menu (residential w/ building)' });
push({ id: 'src_parcel_cost_menu_any', chain: 'sources', builder: 'info', loader: 'sources', pop: 'pcm.any_menu', denom: null, stepTarget: 'Sources Step — compute_parcel_cost_estimates', field: 'parcels.parcel_cost_menu (any residential)' });

// ============================= Permits chain =============================
push({ id: 'p_step1_columns_present', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pSchema.cols', denom: null, stepTarget: 'Step 1 — assert_schema', field: 'permits.columns_present' });
push({ id: 'p_step2_permit_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.permit_type_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.permit_type' });
push({ id: 'p_step2_structure_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.structure_type_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.structure_type' });
push({ id: 'p_step2_work', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.work_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.work' });
push({ id: 'p_step2_street_num', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.street_num_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.street_num' });
push({ id: 'p_step2_street_name', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.street_name_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.street_name' });
push({ id: 'p_step2_street_name_normalized', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.street_name_norm_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.street_name_normalized' });
push({ id: 'p_step2_street_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.street_type_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.street_type' });
push({ id: 'p_step2_street_direction', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.street_direction_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.street_direction' });
push({ id: 'p_step2_city', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.city_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.city' });
push({ id: 'p_step2_postal', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.postal_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.postal' });
push({ id: 'p_step2_geo_id', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.geo_id_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.geo_id' });
push({ id: 'p_step2_building_type', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.building_type_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.building_type' });
push({ id: 'p_step2_category', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.category_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.category' });
push({ id: 'p_step2_application_date', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.application_date_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.application_date' });
push({ id: 'p_step2_issued_date', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.issued_date_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.issued_date' });
push({ id: 'p_step2_completed_date', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.completed_date_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.completed_date' });
push({ id: 'p_step2_status', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.status_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.status' });
push({ id: 'p_step2_description', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.description_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.description' });
push({ id: 'p_step2_est_const_cost', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.est_const_cost_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.est_const_cost' });
push({ id: 'p_step2_builder_name', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.builder_name_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.builder_name' });
push({ id: 'p_step2_owner', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.owner_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.owner' });
push({ id: 'p_step2_dwelling_units_created', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.dwell_created_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.dwelling_units_created' });
push({ id: 'p_step2_dwelling_units_lost', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.dwell_lost_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.dwelling_units_lost' });
push({ id: 'p_step2_ward', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.ward_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.ward' });
push({ id: 'p_step2_council_district', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.council_district_pop', denom: null, stepTarget: 'Step 2 — load_permits', field: 'permits.council_district' });
push({ id: 'p_step2_current_use', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.current_use_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.current_use' });
push({ id: 'p_step2_proposed_use', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.proposed_use_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.proposed_use' });
push({ id: 'p_step2_housing_units', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.housing_units_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.housing_units' });
push({ id: 'p_step2_storeys', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.storeys_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.storeys' });
push({ id: 'p_step2_data_hash', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.data_hash_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.data_hash' });
push({ id: 'p_step2_raw_json', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.raw_json_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.raw_json' });
push({ id: 'p_step2_last_seen_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.last_seen_at_pop', denom: 'permitsTotal', stepTarget: 'Step 2 — load_permits', field: 'permits.last_seen_at' });
push({ id: 'p_step3_status_stale_total', chain: 'permits', builder: 'info', loader: 'permits', pop: 'staleTotal', denom: null, stepTarget: 'Step 3 — close_stale_permits', field: 'permits.status (stale total)' });
push({ id: 'p_step3_completed_date', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.stale_with_date', denom: null, stepTarget: 'Step 3 — close_stale_permits', field: 'permits.completed_date' });
push({ id: 'p_step4_enriched_status', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.enriched_status_pop', denom: null, stepTarget: 'Step 4 — classify_permit_phase', field: 'permits.enriched_status' });
push({ id: 'p_step5_project_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.project_type_pop', denom: 'permitsTotal', stepTarget: 'Step 5 — classify_scope', field: 'permits.project_type' });
push({ id: 'p_step5_scope_tags', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.scope_tags_pop', denom: 'permitsTotal', stepTarget: 'Step 5 — classify_scope', field: 'permits.scope_tags' });
push({ id: 'p_step5_scope_classified_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.scope_classified_pop', denom: 'permitsTotal', stepTarget: 'Step 5 — classify_scope', field: 'permits.scope_classified_at' });
push({ id: 'p_step5_scope_source', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.scope_source_pop', denom: 'permitsTotal', stepTarget: 'Step 5 — classify_scope', field: 'permits.scope_source' });
push({ id: 'p_step6_builder_entity_match', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'matchedBuilderNames', denom: 'builderNameTotal', stepTarget: 'Step 6 — extract_builders', field: 'entities.name_normalized (permit builders)' });
push({ id: 'p_step6_legal_name', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ea.legal_name_pop', denom: 'entitiesTotal', stepTarget: 'Step 6 — extract_builders', field: 'entities.legal_name' });
push({ id: 'p_step6_permit_count', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ea.permit_count_pop', denom: 'entitiesTotal', stepTarget: 'Step 6 — extract_builders', field: 'entities.permit_count' });
push({ id: 'p_step6_entity_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ea.entity_type_pop', denom: 'entitiesTotal', stepTarget: 'Step 6 — extract_builders', field: 'entities.entity_type' });
push({ id: 'p_step6_last_seen_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ea.last_seen_at_pop', denom: 'entitiesTotal', stepTarget: 'Step 6 — extract_builders', field: 'entities.last_seen_at' });
push({ id: 'p_step6_primary_phone', chain: 'permits', builder: 'info', loader: 'permits', pop: 'ea.phone_pop', denom: null, stepTarget: 'Step 6 — extract_builders', field: 'entities.primary_phone (via entities chain — Spec 45)' });
push({ id: 'p_step6_primary_email', chain: 'permits', builder: 'info', loader: 'permits', pop: 'ea.email_pop', denom: null, stepTarget: 'Step 6 — extract_builders', field: 'entities.primary_email (via entities chain — Spec 45)' });
push({ id: 'p_step6_website', chain: 'permits', builder: 'info', loader: 'permits', pop: 'ea.website_pop', denom: null, stepTarget: 'Step 6 — extract_builders', field: 'entities.website (via entities chain — Spec 45)' });
push({ id: 'p_step7_is_wsib_registered', chain: 'permits', builder: 'external', loader: 'permits', pop: 'ea.wsib_registered_pop', denom: 'entitiesTotal', passVar: 'external_coverage_pass_pct', warnVar: 'external_coverage_warn_pct', stepTarget: 'Step 7 — link_wsib', field: 'entities.is_wsib_registered' });
push({ id: 'p_step7_wsib_linked_entity_id', chain: 'permits', builder: 'external', loader: 'permits', pop: 'wa.linked_pop', denom: 'wsibTotal', passVar: 'external_coverage_pass_pct', warnVar: 'external_coverage_warn_pct', stepTarget: 'Step 7 — link_wsib', field: 'wsib_registry.linked_entity_id' });
push({ id: 'p_step7_wsib_match_confidence', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'wa.confidence_pop', denom: 'wa.linked_pop', stepTarget: 'Step 7 — link_wsib', field: 'wsib_registry.match_confidence' });
push({ id: 'p_step8_latitude', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.latitude_pop', denom: 'permitsTotal', stepTarget: 'Step 8 — geocode_permits', field: 'permits.latitude' });
push({ id: 'p_step8_longitude', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.longitude_pop', denom: 'permitsTotal', stepTarget: 'Step 8 — geocode_permits', field: 'permits.longitude' });
push({ id: 'p_step8_location', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.location_pop', denom: 'permitsTotal', stepTarget: 'Step 8 — geocode_permits', field: 'permits.location' });
push({ id: 'p_step8_geocoded_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.geocoded_at_pop', denom: 'permitsTotal', stepTarget: 'Step 8 — geocode_permits', field: 'permits.geocoded_at' });
push({ id: 'p_step9_permits_linked', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.permits_with_parcel', denom: 'permitsTotal', stepTarget: 'Step 9 — link_parcels', field: 'permit_parcels.permits_linked' });
push({ id: 'p_step9_match_type_geocoded', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.pp_linked_geocoded', denom: 'geocodedTotal', stepTarget: 'Step 9 — link_parcels', field: 'permit_parcels.match_type (geocoded)' });
push({ id: 'p_step9_confidence_geocoded', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.pp_linked_geocoded', denom: 'geocodedTotal', stepTarget: 'Step 9 — link_parcels', field: 'permit_parcels.confidence (geocoded)' });
push({ id: 'p_step9_linked_at_geocoded', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.pp_linked_geocoded', denom: 'geocodedTotal', stepTarget: 'Step 9 — link_parcels', field: 'permit_parcels.linked_at (geocoded)' });
push({ id: 'p_step9_lot_size_sqm', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.parcels_with_area', denom: 'misc.parcels_total', stepTarget: 'Step 9 — link_parcels', field: 'parcels.lot_size_sqm' });
push({ id: 'p_step9b_zoning_class', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'pa.zoning_class_pop', denom: 'permitsTotal', passVar: 'zoning_class_coverage_pass_pct', warnVar: 'zoning_class_coverage_warn_pct', stepTarget: 'Step 9b — enrich_permits', field: 'permits.zoning_class' });
push({ id: 'p_step9b_zoning_enriched_at', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.zoning_enriched_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.zoning_enriched_at' });
push({ id: 'p_step9b_bylaw_max_coverage_pct', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.bylaw_max_coverage_pct_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.bylaw_max_coverage_pct' });
push({ id: 'p_step9b_bylaw_max_fsi', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.bylaw_max_fsi_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.bylaw_max_fsi' });
push({ id: 'p_step9b_bylaw_max_height_m', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.bylaw_max_height_m_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.bylaw_max_height_m' });
push({ id: 'p_step9b_exception_number', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.exception_number_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.exception_number' });
push({ id: 'p_step9b_applicable_bylaws', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.applicable_bylaws_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.applicable_bylaws' });
push({ id: 'p_step9b_overlay_summary', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.overlay_summary_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.overlay_summary' });
push({ id: 'p_step9b_zoning_parcel_count', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.zoning_parcel_count_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.zoning_parcel_count' });
push({ id: 'p_step9b_zoning_dominant_parcel_id', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.zoning_dominant_parcel_id_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.zoning_dominant_parcel_id' });
push({ id: 'p_step9b_zoning_dominant_parcel_method', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.zoning_dominant_parcel_method_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.zoning_dominant_parcel_method' });
push({ id: 'p_step9b_is_in_ravine_protection_area', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.in_ravine_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.is_in_ravine_protection_area' });
push({ id: 'p_step9b_ravine_distance_m', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.ravine_distance_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.ravine_distance_m' });
push({ id: 'p_step9b_is_heritage_designated', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.heritage_designated_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.is_heritage_designated' });
push({ id: 'p_step9b_heritage_designation_type', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.heritage_type_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.heritage_designation_type' });
push({ id: 'p_step9b_heritage_designation_date', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.heritage_date_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.heritage_designation_date' });
push({ id: 'p_step9b_is_corner_lot', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.corner_lot_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.is_corner_lot' });
push({ id: 'p_step9b_is_through_lot', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.through_lot_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.is_through_lot' });
push({ id: 'p_step9b_abuts_laneway', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.abuts_laneway_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.abuts_laneway' });
push({ id: 'p_step9b_primary_frontage_street_name', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.frontage_name_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.primary_frontage_street_name' });
push({ id: 'p_step9b_lot_size_confidence', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.lot_size_conf_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.lot_size_confidence' });
push({ id: 'p_step9b_max_buildable_footprint_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.max_footprint_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_buildable_footprint_sqm' });
push({ id: 'p_step9b_max_buildable_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.max_gfa_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_buildable_gfa_sqm' });
push({ id: 'p_step9b_max_buildable_gfa_basis_fsi', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.max_gfa_fsi_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_buildable_gfa_basis_fsi' });
push({ id: 'p_step9b_max_buildable_gfa_basis_coverage_box', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.max_gfa_cov_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_buildable_gfa_basis_coverage_box' });
push({ id: 'p_step9b_max_buildable_gfa_basis_coverage_only', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.max_gfa_cov_only_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_buildable_gfa_basis_coverage_only' });
push({ id: 'p_step9b_max_build_confidence_high', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.mb_conf_high_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_build_confidence_high' });
push({ id: 'p_step9b_max_build_confidence_medium', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.mb_conf_medium_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_build_confidence_medium' });
push({ id: 'p_step9b_max_build_confidence_low', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.mb_conf_low_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_build_confidence_low' });
push({ id: 'p_step9b_garden_suite_fits', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.suite_fits_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.garden_suite_fits' });
push({ id: 'p_step9b_envelope_constrained', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.env_constrained_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.envelope_constrained' });
push({ id: 'p_step9b_imagery_roof_footprint_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.existing_footprint_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.imagery_roof_footprint_sqm' });
push({ id: 'p_step9b_imagery_roof_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.existing_gfa_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.imagery_roof_gfa_sqm' });
push({ id: 'p_step9b_existing_structure_confidence_high', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.existing_conf_high_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.existing_structure_confidence_high' });
push({ id: 'p_step9b_existing_structure_confidence_low', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.existing_conf_low_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.existing_structure_confidence_low' });
push({ id: 'p_step9b_existing_greenspace_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.existing_greenspace_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.existing_greenspace_sqm' });
push({ id: 'p_step9b_max_newbuild_coa_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_coa_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_newbuild_coa_gfa_sqm' });
push({ id: 'p_step9b_cur_floor_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_floor_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_floor_gfa_sqm' });
push({ id: 'p_step9b_cur_pot_2story_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_pot2_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_pot_2story_gfa_sqm' });
push({ id: 'p_step9b_cur_pot_3story_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_pot3_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_pot_3story_gfa_sqm' });
push({ id: 'p_step9b_cur_gfa_range_basis', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_range_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_gfa_range_basis' });
push({ id: 'p_step9b_cur_est_kitchen_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_kitchen_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_est_kitchen_gfa_sqm' });
push({ id: 'p_step9b_cur_est_bath_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.scen_bath_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.cur_est_bath_gfa_sqm' });
push({ id: 'p_step9b_max_garage_gfa_sqm', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.garage_fits_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.max_garage_gfa_sqm' });
push({ id: 'p_step9b_garage_permission_as_of_right', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.garage_aor_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.garage_permission_as_of_right' });
push({ id: 'p_step9b_garage_permission_coa_required', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.garage_coa_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.garage_permission_coa_required' });
push({ id: 'p_step9b_opt_config_confidence', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.opt_config_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.opt_config_confidence' });
push({ id: 'p_step9b_comp_count', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.comp_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.comp_count' });
push({ id: 'p_step9b_rear_suite_type', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.rear_suite_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.rear_suite_type' });
push({ id: 'p_step9b_rear_suite_permission_as_of_right', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.rear_suite_aor_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.rear_suite_permission_as_of_right' });
push({ id: 'p_step9b_rear_suite_permission_coa_required', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.rear_suite_coa_pop', denom: null, stepTarget: 'Step 9b — enrich_permits', field: 'permits.rear_suite_permission_coa_required' });
for (const c of COST_PROP_COLS) {
  push({ id: `p_step9b_cost_prop_${c}`, chain: 'permits', builder: 'info', loader: 'permits', pop: `pa.${c}_pop`, denom: null, stepTarget: 'Step 9b — enrich_permits', field: `permits.${c}` });
}
push({ id: 'p_step10_neighbourhood_id', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.neighbourhood_pop', denom: 'permitsTotal', stepTarget: 'Step 10 — link_neighbourhoods', field: 'permits.neighbourhood_id' });
push({ id: 'p_step11_parcels_with_centroid', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.parcels_with_centroid', denom: null, stepTarget: 'Step 11 — link_massing', field: 'parcels.with_centroid' });
push({ id: 'p_step11_parcel_buildings_linked_parcels', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.massing_linked_parcels', denom: null, stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.linked_parcels' });
push({ id: 'p_step11_is_primary', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.is_primary_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.is_primary' });
push({ id: 'p_step11_structure_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.structure_type_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.structure_type' });
push({ id: 'p_step11_match_type', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.match_type_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.match_type' });
push({ id: 'p_step11_confidence', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.confidence_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.confidence' });
push({ id: 'p_step11_linked_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.linked_at_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'parcel_buildings.linked_at' });
push({ id: 'p_step11_footprint_area_sqm', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.area_sqm_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'building_footprints.footprint_area_sqm' });
push({ id: 'p_step11_max_height_m', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pb.height_m_pop', denom: 'pbTotal', stepTarget: 'Step 11 — link_massing', field: 'building_footprints.max_height_m' });
push({ id: 'p_step12_scope_tags_non_bld', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.non_bld_scope_pop', denom: 'pa.non_bld_total', stepTarget: 'Step 12 — link_similar', field: 'permits.scope_tags (non-BLD)' });
push({ id: 'p_step13_permits_with_active_trade', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.permits_with_active_trade', denom: 'permitsTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.permits_with_active_trade' });
push({ id: 'p_step13_tier', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.tier_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.tier' });
push({ id: 'p_step13_confidence', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.confidence_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.confidence' });
push({ id: 'p_step13_is_active', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.is_active_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.is_active' });
push({ id: 'p_step13_phase', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.phase_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.phase' });
push({ id: 'p_step13_lead_score', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.lead_score_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.lead_score' });
push({ id: 'p_step13_classified_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pt.classified_at_pop', denom: 'ptTotal', stepTarget: 'Step 13 — classify_permits', field: 'permit_trades.classified_at' });
push({ id: 'p_step14_permits_covered', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.permits_with_cost_estimate', denom: 'permitsTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.permits_covered' });
push({ id: 'p_step14_estimated_cost', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.estimated_cost_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.estimated_cost' });
push({ id: 'p_step14_cost_source', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.cost_source_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.cost_source' });
push({ id: 'p_step14_cost_tier', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.cost_tier_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.cost_tier' });
push({ id: 'p_step14_cost_range_low', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.cost_range_low_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.cost_range_low' });
push({ id: 'p_step14_cost_range_high', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.cost_range_high_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.cost_range_high' });
push({ id: 'p_step14_premium_factor', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.premium_factor_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.premium_factor' });
push({ id: 'p_step14_complexity_score', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.complexity_score_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.complexity_score' });
push({ id: 'p_step14_model_version', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.model_version_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.model_version' });
push({ id: 'p_step14_is_geometric_override', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.is_geometric_override_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.is_geometric_override' });
push({ id: 'p_step14_modeled_gfa_sqm', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.modeled_gfa_sqm_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.modeled_gfa_sqm' });
push({ id: 'p_step14_effective_area_sqm', chain: 'permits', builder: 'calibrated', loader: 'permits', pop: 'ce.effective_area_sqm_pop', denom: 'ceTotal', passVar: 'cost_coverage_pass_pct', warnVar: 'cost_coverage_warn_pct', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.effective_area_sqm' });
push({ id: 'p_step14_trade_contract_values', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.trade_contract_values_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.trade_contract_values' });
push({ id: 'p_step14_computed_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'ce.computed_at_pop', denom: 'ceTotal', stepTarget: 'Step 14 — compute_cost_estimates', field: 'cost_estimates.computed_at' });
push({ id: 'p_step15_rows_with_median', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.calibration_rows', denom: null, stepTarget: 'Step 15 — compute_timing_calibration_v2', field: 'phase_calibration.rows_with_median' });
push({ id: 'p_step16_linked_permit_num', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.coa_linked_pop', denom: 'misc.coa_total', stepTarget: 'Step 16 — link_coa', field: 'coa_applications.linked_permit_num' });
push({ id: 'p_step18_snapshot_today', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.snapshot_today', denom: null, stepTarget: 'Step 18 — refresh_snapshot', field: 'data_quality_snapshots.today' });
push({ id: 'p_step19_duplicate_pks', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.dup_permit_pks', denom: null, stepTarget: 'Step 19 — assert_data_bounds', field: 'permits.duplicate_pks' });
push({ id: 'p_step20_engine_health_today', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.engine_health_today', denom: null, stepTarget: 'Step 20 — assert_engine_health', field: 'engine_health_snapshots.today' });
push({ id: 'p_step21_lifecycle_phase', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'lifecyclePhaseTotal', denom: 'permitsTotal', stepTarget: 'Step 21 — classify_lifecycle_phase', field: 'permits.lifecycle_phase' });
push({ id: 'p_step21_phase_started_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.phase_started_pop', denom: 'lifecyclePhaseTotal', stepTarget: 'Step 21 — classify_lifecycle_phase', field: 'permits.phase_started_at' });
push({ id: 'p_step21_lifecycle_stalled', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.lifecycle_stalled_pop', denom: null, stepTarget: 'Step 21 — classify_lifecycle_phase', field: 'permits.lifecycle_stalled' });
push({ id: 'p_step21_lifecycle_classified_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'pa.lifecycle_classified_pop', denom: 'permitsTotal', stepTarget: 'Step 21 — classify_lifecycle_phase', field: 'permits.lifecycle_classified_at' });
push({ id: 'p_step21_coa_lifecycle_phase', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'misc.coa_lifecycle_phase_pop', denom: 'misc.coa_unlinked_total', stepTarget: 'Step 21 — classify_lifecycle_phase', field: 'coa_applications.lifecycle_phase' });
push({ id: 'p_step22_unclassified_count', chain: 'permits', builder: 'info', loader: 'permits', pop: 'pa.unclassified_count', denom: null, stepTarget: 'Step 22 — assert_lifecycle_phase_distribution', field: 'permits.unclassified_count' });
push({ id: 'p_step23_permits_covered', chain: 'permits', builder: 'info', loader: 'permits', pop: 'tfa.forecast_total_permits', denom: null, stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.permits_covered' });
push({ id: 'p_step23_predicted_start', chain: 'permits', builder: 'info', loader: 'permits', pop: 'tfa.predicted_start_permits', denom: null, stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.predicted_start' });
push({ id: 'p_step23_urgency_classified', chain: 'permits', builder: 'info', loader: 'permits', pop: 'tfa.urgency_classified_permits', denom: null, stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.urgency (classified)' });
push({ id: 'p_step23_trade_slug', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.trade_slug_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.trade_slug' });
push({ id: 'p_step23_target_window', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.target_window_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.target_window' });
push({ id: 'p_step23_confidence', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.confidence_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.confidence' });
push({ id: 'p_step23_calibration_method', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.calibration_method_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.calibration_method' });
push({ id: 'p_step23_sample_size', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.sample_size_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.sample_size' });
push({ id: 'p_step23_median_days', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.median_days_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.median_days' });
push({ id: 'p_step23_p25_days', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.p25_days_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.p25_days' });
push({ id: 'p_step23_p75_days', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.p75_days_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.p75_days' });
push({ id: 'p_step23_opportunity_score', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.opp_score_pop', denom: 'oppScoreDenom', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.opportunity_score' });
push({ id: 'p_step23_computed_at', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.computed_at_pop', denom: 'forecastTotal', stepTarget: 'Step 23 — compute_trade_forecasts', field: 'trade_forecasts.computed_at' });
push({ id: 'p_step24_opportunity_score_gt0', chain: 'permits', builder: 'coverage', loader: 'permits', pop: 'tfa.opp_score_pop', denom: 'oppScoreDenom', stepTarget: 'Step 24 — compute_opportunity_scores', field: 'trade_forecasts.opportunity_score (>0)' });
push({ id: 'p_step25_tracked_active', chain: 'permits', builder: 'info', loader: 'permits', pop: 'trackedActive', denom: null, stepTarget: 'Step 25 — update_tracked_projects', field: 'tracked_projects.active' });
push({ id: 'p_step25_lead_analytics_rows', chain: 'permits', builder: 'info', loader: 'permits', pop: 'misc.lead_analytics_total', denom: null, stepTarget: 'Step 25 — update_tracked_projects', field: 'lead_analytics.rows' });
push({ id: 'p_step26_entity_tracing_last_verdict', chain: 'permits', builder: 'info', loader: 'permits', pop: 'etVerdictNum', denom: null, stepTarget: 'Step 26 — assert_entity_tracing', field: 'entity_tracing.last_verdict' });

// ============================= Invariants (permits branch only, C6 + C3/C7) =============================
push({ id: 'lead_id_administrative_drift', chain: 'permits', builder: 'invariant', loader: 'permits', pop: 'adminDrift', denom: null, stepTarget: '(C6 — migration 138_a/241)', field: 'lead_id_administrative_drift' });
push({ id: 'lead_id_duplicate_groups', chain: 'permits', builder: 'invariant', loader: 'permits', pop: 'dupeGroups', denom: null, stepTarget: '(C6 — lead_id uniqueness)', field: 'lead_id_duplicate_groups' });
push({ id: 'enriched_status_status_scope_drift', chain: 'permits', builder: 'scope_drift_warn', loader: 'permits', pop: 'driftRows', denom: null, stepTarget: '(C3/C7 — Spec 48 §4.9)', field: 'enriched_status_status_scope_drift' });
push({ id: 'enriched_status_status_scope_drift_retighten', chain: 'permits', builder: 'scope_drift_retighten', loader: 'permits', pop: 'driftRows', denom: null, stepTarget: '(C3/C7 — Spec 48 §4.9)', field: 'enriched_status_status_scope_drift_retighten' });

// ============================= Shared vocab loop (permits + coa, NOT sources) =============================
for (const t of VOCAB_COVERAGE) {
  push({ id: t.id, chain: ['permits', 'coa'], builder: 'vocab', loader: 'none', vocabTriple: t, stepTarget: t.stepTarget, field: `${t.dataColumn} vocab (${t.stepTarget})` });
}

module.exports = { CHECK_DEFS, LOGIC_VAR_DEFS, VOCAB_COVERAGE, COA_STRUCTURE_TYPE_VOCAB, slugify };
