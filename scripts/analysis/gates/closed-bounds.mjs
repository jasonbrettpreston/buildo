// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1, Rule 3, §5 R-BA (gate A)
//
// GATE A — every `checks[].limit` (and `checks[].warn_limit` when declared) is a
// CLOSED-ANSWER bound, never a bare prose number (Rule 1 "nothing hidden",
// Rule 3 "no second copy of a tunable", §5 R-BA's closed gate set):
//   1. `limit_from_config` / `warn_limit_from_config` names a DECLARED
//      `config.logic_variables[].name` in the SAME descriptor → OK (Ruling A-4).
//   2. `limit === "viol == 0"` EXACTLY → OK (zero tolerance, nothing to tune).
//      NOT extended to `warn_limit`: a WARN tier that can never fire is
//      decoration, not a bound (the link_neighbourhoods case).
//   3. a `{gate:'A', step, item:'checks.<id>.limit'|'checks.<id>.warn_limit'}`
//      ledger row with disposition `non_tunable`|`pending_remediation` → OK.
//   4. anything else → RED — including a `limit_from_config` naming an
//      UNDECLARED variable (it LOOKS like answer 1 while binding to nothing).
// The GATE half of §5 R-BA: `ledger.mjs` owns the row shape + the match, this
// file owns the answer set and the fleet walk (DERIVED from converted.json,
// R-AN). An ORPHAN row — its violation since fixed — is RED (R-X posture).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchLedger, loadLedger, LEDGER_REL_PATH } from './ledger.mjs';
import { readConvertedJson } from './converted-set.mjs';
import { ownerSpecsFor, identitySpecIsOwner, CENSUS_REL } from './owner-spec-diff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const GATE_A_DISPOSITIONS = ['non_tunable', 'pending_remediation'];
const ZERO_TOLERANCE = 'viol == 0';
const FIELDS = [['limit', 'limit_from_config', true], ['warn_limit', 'warn_limit_from_config', false]];
const kebab = (slug) => String(slug).replace(/_/g, '-');

/**
 * Every bound in ONE descriptor the closed answer set does not cover. PURE — no
 * disk, no ledger (answer 3 is a ledger fact, applied by `checkClosedBounds`).
 * `limit` is REQUIRED (A-4: it carries the seed default) → full answer set;
 * `warn_limit` is optional and only moves FAIL→WARN → answers 1 + 3 only.
 * @param {object} descriptor a parsed `*.descriptor.json`
 * @returns {Array<{step:string, item:string, detail:string}>}
 */
export function boundViolations(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const cfg = descriptor.config;
  const declared = new Set(
    cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables)
      ? cfg.logic_variables.map((v) => v && v.name).filter(Boolean)
      : [],
  );
  const violations = [];
  for (const check of Array.isArray(descriptor.checks) ? descriptor.checks : []) {
    if (!check || typeof check !== 'object') continue;
    const id = typeof check.id === 'string' ? check.id : '(no-id)';
    for (const [field, refKey, zeroApplies] of FIELDS) {
      if (check[field] === undefined) continue;
      const item = `checks.${id}.${field}`;
      const ref = check[refKey];
      const why = ref !== undefined
        ? (declared.has(ref) ? null : `${refKey} names "${ref}", not a declared config.logic_variables[].name in this descriptor`)
        : (zeroApplies && check[field] === ZERO_TOLERANCE
          ? null
          : zeroApplies
            ? `${field} ${JSON.stringify(check[field])} is neither ${refKey} nor exactly "${ZERO_TOLERANCE}"`
            : `${field} ${JSON.stringify(check[field])} is hard-coded with no ${refKey} (the zero-tolerance answer does not apply to a WARN tier)`);
      if (why) violations.push({ step, item, detail: why });
    }
  }
  return violations;
}

// ------------------------------------------------------------------ R-DE cross-step vocabulary

/**
 * Spec 124 R-DE (v) (McDonald's Airtight V3): step-owned logic variables are `<slug>_<name>`; `sources_*` is
 * chain-shared. These names predate the rule and are grandfathered by name (measured 2026-10-17, 187 names,
 * closed — a NEW name outside the form is RED, and renaming one of these is a migration, not this lock).
 */
export const LOGIC_VARIABLE_GRANDFATHER = Object.freeze({
  assert_data_bounds: Object.freeze(['builder_null_rate_warn_pct', 'coa_ancient_hearing_count_warn_max', 'coa_cost_gt_threshold_cad', 'coa_cost_gt_threshold_warn_max', 'coa_forward_link_sub085_warn_pct', 'coa_fsi_gt_threshold', 'coa_future_hearing_window_years', 'coa_gfa_over_lot_multiple', 'coa_gfa_over_lot_warn_max', 'coa_null_address_count_warn_max', 'cost_est_legacy_cost_ceiling_cad', 'cost_est_legacy_gfa_ceiling_sqm', 'cost_est_min_tiers', 'cost_est_null_rate_warn_pct', 'cost_outlier_ceiling_cad', 'cost_outlier_count_warn_max', 'desc_null_rate_warn_pct', 'inspection_ancient_dates_count_warn_max', 'pipeline_timezone']),
  assert_engine_health: Object.freeze(['engine_health_dead_tuple_min_rows', 'engine_health_dead_tuple_ratio_warn_max', 'engine_health_insp_dead_tuple_fail_pct', 'engine_health_insp_update_insert_fail_ratio', 'engine_health_ping_pong_ratio_warn_max', 'engine_health_seq_scan_min_rows', 'engine_health_seq_scan_ratio_warn_max', 'pipeline_timezone']),
  assert_global_coverage: Object.freeze(['coa_neighbourhood_coverage_pass_pct', 'coa_neighbourhood_coverage_warn_pct', 'coa_structure_type_coverage_pass_pct', 'coa_structure_type_coverage_warn_pct', 'cost_coverage_pass_pct', 'cost_coverage_warn_pct', 'external_coverage_pass_pct', 'external_coverage_warn_pct', 'parcel_cost_menu_coverage_pass_pct', 'parcel_cost_menu_coverage_warn_pct', 'pipeline_timezone', 'profiling_coverage_pass_pct', 'profiling_coverage_warn_pct', 'vocab_coverage_pass_pct', 'vocab_coverage_statement_timeout_minutes', 'vocab_coverage_warn_pct', 'zoning_class_coverage_pass_pct', 'zoning_class_coverage_warn_pct']),
  assert_parcel_sanity: Object.freeze(['max_build_min_dimension_m', 'mislink_footprint_lot_tol', 'parcel_sanity_bylaw_fsi_max', 'parcel_sanity_coa_fsi_max', 'parcel_sanity_comp_fsi_p50_max', 'parcel_sanity_comp_fsi_p50_min', 'parcel_sanity_cost_addition_max_cad', 'parcel_sanity_cost_coherence_tolerance_cad', 'parcel_sanity_dim_lot_tolerance_m', 'parcel_sanity_distribution_median_floor', 'parcel_sanity_distribution_median_multiplier', 'parcel_sanity_distribution_percentile', 'parcel_sanity_footprint_coverage_max_ratio', 'parcel_sanity_gfa_coherence_tolerance_sqm', 'parcel_sanity_greenspace_tolerance_sqm', 'parcel_sanity_height_per_storey_max_m', 'parcel_sanity_height_per_storey_min_m', 'parcel_sanity_lot_geom_tolerance_ratio', 'parcel_sanity_lot_size_max_sqm', 'parcel_sanity_lot_size_min_sqm', 'parcel_sanity_lowrise_bylaw_fsi_max', 'parcel_sanity_lowrise_bylaw_height_max_m', 'parcel_sanity_lowrise_cost_fb_max_cad', 'parcel_sanity_lowrise_coverage_max_pct', 'parcel_sanity_lowrise_maxbuild_height_max_m', 'parcel_sanity_lowrise_maxbuild_stories_max', 'parcel_sanity_lowrise_opt_aor_gfa_max_sqm', 'parcel_sanity_max_build_fsi_max', 'parcel_sanity_max_build_length_max_m', 'parcel_sanity_max_build_width_max_m', 'parcel_sanity_newbuild_cost_per_sqm_max', 'parcel_sanity_newbuild_cost_per_sqm_min', 'parcel_sanity_nonlowrise_opt_aor_gfa_max_sqm', 'parcel_sanity_opt_storeys_max', 'parcel_sanity_priced_newbuild_min_gfa_sqm', 'parcel_sanity_rd_maxbuild_stories_max', 'parcel_sanity_realized_fsi_p90_max', 'parcel_sanity_realized_fsi_p90_min']),
  compute_parcel_cost_estimates: Object.freeze(['compute_parcel_cost_adjustment_factor_default', 'compute_parcel_cost_batch_size', 'compute_parcel_cost_empty_menu_max_pct', 'compute_parcel_cost_engine_error_max', 'compute_parcel_cost_escalation_fallback_multiplier', 'compute_parcel_cost_escalation_min_multiplier', 'compute_parcel_cost_fsi_max_plausible', 'compute_parcel_cost_heartbeat_minutes', 'compute_parcel_cost_line_total_max_cad', 'compute_parcel_cost_lock_timeout_ms', 'compute_parcel_cost_menu_coverage_min_pct', 'compute_parcel_cost_min_population', 'compute_parcel_cost_min_priceable_area_sqm', 'compute_parcel_cost_phase_timeout_minutes', 'compute_parcel_cost_premium_default', 'compute_parcel_cost_stream_batch_size', 'cost_escalation_index', 'cost_index_stale_months', 'cost_rates_stale_months', 'product_scope_max_existing_gfa_sqm']),
  enrich_parcels: Object.freeze(['accessory_max_coverage_pct', 'car_footprint_sqm', 'garage_max_gfa_sqm', 'garage_min_footprint_sqm', 'garage_min_lot_sqm', 'garden_suite_max_gfa_sqm', 'garden_suite_min_lot_sqm', 'garden_suite_min_rear_yard_m', 'garden_suite_storeys', 'laneway_suite_max_gfa_sqm', 'laneway_suite_min_lot_sqm', 'laneway_suite_min_rear_yard_m', 'laneway_suite_storeys', 'max_build_lot_max_sqm', 'max_build_lot_min_sqm', 'max_build_min_dimension_m', 'min_soft_landscaping_pct', 'mislink_footprint_lot_tol', 'parcels_dead_tuple_ratio_warn_max', 'parcels_maintenance_timeout_minutes', 'reno_bath_gfa_pct', 'reno_coa_uplift_pct', 'reno_kitchen_gfa_pct', 'road_overlay_distance_m', 'step_post_check_concurrency', 'step_post_check_statement_timeout_minutes', 'storey_height_m']),
  link_massing: Object.freeze(['massing_garage_max_sqm', 'massing_nearest_max_distance_m', 'massing_shed_threshold_sqm']),
  link_parcel_abutments: Object.freeze(['abut_bbox_pad_deg', 'abut_min_shared_len_m', 'abut_parcels_with_abutments_warn_pct', 'abut_street_search_deg', 'abut_touch_tolerance_m', 'fya_est_max_m', 'fya_est_min_m']),
  link_parcels: Object.freeze(['spatial_match_confidence', 'spatial_match_max_distance_m']),
  link_wsib: Object.freeze(['wsib_fuzzy_match_threshold']),
  load_coa_notices: Object.freeze(['coa_notices_direction_viol_max_pct', 'coa_notices_doc_pair_rate_floor', 'coa_notices_doc_pair_rate_min_items', 'coa_notices_download_timeout_ms', 'coa_notices_fetch_pace_ms', 'coa_notices_items_min', 'coa_notices_line_y_tolerance', 'coa_notices_mail_lag_max_days', 'coa_notices_mail_lag_viol_max', 'coa_notices_max_doc_bytes', 'coa_notices_max_pages', 'coa_notices_max_text_chars', 'coa_notices_no_section_warn_max_pct', 'coa_notices_oob_sample_max', 'coa_notices_pair_rate_fail_min', 'coa_notices_pair_rate_warn_min', 'coa_notices_req_building_length_depth_m_max', 'coa_notices_req_building_length_depth_m_min', 'coa_notices_req_front_setback_m_max', 'coa_notices_req_front_setback_m_min', 'coa_notices_req_fsi_max', 'coa_notices_req_fsi_min', 'coa_notices_req_height_m_max', 'coa_notices_req_height_m_min', 'coa_notices_req_lot_area_m2_max', 'coa_notices_req_lot_area_m2_min', 'coa_notices_req_lot_coverage_pct_max', 'coa_notices_req_lot_coverage_pct_min', 'coa_notices_req_lot_frontage_m_max', 'coa_notices_req_lot_frontage_m_min', 'coa_notices_req_main_wall_height_m_max', 'coa_notices_req_main_wall_height_m_min', 'coa_notices_req_rear_setback_m_max', 'coa_notices_req_rear_setback_m_min', 'coa_notices_req_side_setback_m_max', 'coa_notices_req_side_setback_m_min', 'coa_notices_required_oob_max', 'coa_notices_retire_max_pct', 'coa_notices_unit_target_viol_max']),
  massing: Object.freeze(['building_footprints_dead_tuple_ratio_warn_max', 'building_footprints_maintenance_timeout_minutes']),
  refresh_snapshot: Object.freeze(['coa_match_conf_medium', 'pipeline_timezone', 'snapshot_coa_conf_high']),
});

/** The archetypes whose library loop is config-sized (runMaterializePhase / runBackfillFullRecompute). */
const CONFIG_BATCH_ARCHETYPES = new Set(['MATERIALIZER', 'BACKFILL']);
/** The shapes whose library loop runs at `execution.batch` (runLinkPhase / runLinkKeyedPhase). */
const DECLARED_BATCH_SHAPES = new Set(['link', 'link_keyed']);

/**
 * R-DE clauses (i), (ii), (v), (vi) on ONE descriptor. PURE: `ctx` carries the seeded logic variables, the
 * census rows and the descriptor's converted.json file (`loadVocabularyContext`).
 *   (i)  `execution.batch` is the executed size: a positive integer, or `"none"` only when no library loop
 *        sizes from it (an INGESTOR "none" carries MQ-B1's batch_why); a config-sized loop declares
 *        `batch_size_from_config` and `batch` equals that variable's seeded default.
 *   (ii) `identity.spec` is one of the step's census owner specs.
 *   (v)  logic-variable names (above).
 *   (vi) `guards.empty_source`: INGESTOR = its own write table(s) or "none"; any other archetype = tables it reads.
 * @returns {Array<{step:string, item:string, detail:string}>}
 */
export function vocabularyViolations(descriptor, ctx = {}) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const step = (descriptor.identity && descriptor.identity.name) || '(unknown-step)';
  const archetype = descriptor.identity && descriptor.identity.archetype;
  const out = [];
  const push = (item, detail) => out.push({ step, item, detail: `${detail} (Spec 124 R-DE)` });
  const e = descriptor.execution && typeof descriptor.execution === 'object' ? descriptor.execution : {};
  // (i)
  const batch = e.batch;
  const isInt = Number.isInteger(batch) && batch > 0;
  if (!isInt && batch !== 'none') push('vocab.execution.batch', `execution.batch ${JSON.stringify(batch)} is neither a positive integer nor "none"`);
  if (batch === 'none' && DECLARED_BATCH_SHAPES.has(e.shape)) push('vocab.execution.batch', `shape "${e.shape}" loops at execution.batch, so "none" has no executed size`);
  if (batch === 'none' && archetype === 'INGESTOR' && !e.batch_why) push('vocab.execution.batch', 'an INGESTOR "none" needs MQ-B1\'s batch_why');
  if (CONFIG_BATCH_ARCHETYPES.has(archetype) && !e.batch_size_from_config) push('vocab.execution.batch_size_from_config', `a ${archetype} loop is config-sized: declare batch_size_from_config`);
  if (e.batch_size_from_config) {
    const seed = ctx.seeds && ctx.seeds[e.batch_size_from_config];
    const def = seed && typeof seed === 'object' ? seed.default : undefined;
    if (!isInt || batch !== def) push('vocab.execution.batch', `batch_size_from_config "${e.batch_size_from_config}" seeds ${JSON.stringify(def)}, so execution.batch must be ${JSON.stringify(def)} (got ${JSON.stringify(batch)})`);
  }
  // (ii)
  if (ctx.censusRows && ctx.file) {
    const owners = ownerSpecsFor(ctx.file, ctx.censusRows);
    const spec = descriptor.identity && descriptor.identity.spec;
    if (!identitySpecIsOwner(spec, owners)) push('vocab.identity.spec', `identity.spec ${JSON.stringify(spec)} is not one of the census owner specs [${owners.join(', ')}]`);
  }
  // (v)
  const grand = new Set(LOGIC_VARIABLE_GRANDFATHER[step] || []);
  const cfg = descriptor.config;
  for (const v of cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables : []) {
    const name = v && v.name;
    if (typeof name !== 'string' || name.startsWith(`${step}_`) || name.startsWith('sources_') || grand.has(name)) continue;
    push(`vocab.config.logic_variables.${name}`, `logic variable "${name}" is neither "${step}_<name>" nor chain-shared "sources_<table>_<name>"`);
  }
  // (vi)
  const es = descriptor.guards && descriptor.guards.empty_source;
  if (es !== undefined) {
    const list = Array.isArray(es) ? es : [es];
    const writes = new Set((descriptor.outputs && Array.isArray(descriptor.outputs.writes) ? descriptor.outputs.writes : []).map((w) => w && w.table));
    const reads = new Set((descriptor.inputs && descriptor.inputs.reads && Array.isArray(descriptor.inputs.reads.tables) ? descriptor.inputs.reads.tables : []).map((r) => r && r.table));
    const home = archetype === 'INGESTOR' ? writes : reads;
    for (const t of list) {
      if (t === 'none' || home.has(t)) continue;
      push('vocab.guards.empty_source', `guards.empty_source "${t}" is not ${archetype === 'INGESTOR' ? 'one of this INGESTOR\'s write tables' : 'one of this step\'s read tables'}`);
    }
  }
  return out;
}

/** The disk facts `vocabularyViolations` needs, read once: seeds, census rows, and each converted descriptor's file. */
export function loadVocabularyContext(repoRoot = REPO_ROOT) {
  const seeds = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/seeds/logic_variables.json'), 'utf8'));
  const census = JSON.parse(fs.readFileSync(path.join(repoRoot, CENSUS_REL), 'utf8'));
  const censusRows = [...(census.entries || []), ...(census.exemptions || [])];
  const fileOf = new Map();
  const parsed = readConvertedJson(repoRoot);
  for (const entry of Array.isArray(parsed.converted) ? parsed.converted : []) {
    const file = String(entry && typeof entry === 'object' ? entry.file : entry).replace(/\\/g, '/');
    try {
      const d = JSON.parse(fs.readFileSync(path.join(repoRoot, descriptorPathFor(file)), 'utf8'));
      if (d && d.identity && d.identity.name) fileOf.set(d.identity.name, file);
    } catch { /* loadConvertedDescriptors already throws for an unreadable descriptor */ }
  }
  return { seeds, censusRows, fileOf };
}

/**
 * Gate A over the whole converted fleet. An ORPHAN makes `pass` false (R-X). `vocab`
 * (`loadVocabularyContext`) adds the R-DE clauses; absent → bounds only (fixtures).
 */
export function checkClosedBounds(descriptors, ledgerRows, vocab) {
  const violations = [];
  for (const d of Array.isArray(descriptors) ? descriptors : []) {
    violations.push(...boundViolations(d));
    if (vocab) {
      const name = d && d.identity && d.identity.name;
      violations.push(...vocabularyViolations(d, { ...vocab, file: vocab.fileOf ? vocab.fileOf.get(name) : undefined }));
    }
  }
  const { unallowed, orphans, allowed } = matchLedger('A', violations, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const where = (v) => `${v.step} ${v.item}`;
  const detail = (unallowed.length || orphans.length)
    ? `CLOSED-BOUNDS (gate A): ${unallowed.length} unallowed bound(s)`
      + (unallowed.length ? ` [${unallowed.map(where).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + (orphans.length ? ` [${orphans.map(where).join('; ')}]` : '')
    : `CLOSED-BOUNDS (gate A): ${violations.length} bound(s) checked, all closed `
      + `(${allowed.length} ledger-allowed, ${violations.length - allowed.length} from config/viol==0)`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed };
}

/** Descriptor path convention — `<step>.descriptor.json` beside the script (seam.js's rule). */
const descriptorPathFor = (relFile) => String(relFile).replace(/\.(js|py)$/, '') + '.descriptor.json';

/**
 * Every CONVERTED step's descriptor, in `converted.json` order (R-AN — never a
 * retyped list). Throws on a missing/unparsable descriptor: a converted entry
 * with no readable descriptor is a broken registry, never something to skip.
 * @param {string} [repoRoot]
 */
export function loadConvertedDescriptors(repoRoot = REPO_ROOT) {
  // converted-set.mjs: the ONE read — includes a pending step evaluated as-converted (item 1).
  const parsed = readConvertedJson(repoRoot);
  const read = (rel, from) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    } catch (e) {
      throw new Error(`${from} has no readable descriptor at ${rel}: ${e.message}`);
    }
  };
  return (Array.isArray(parsed.converted) ? parsed.converted : [])
    .map((relFile) => read(descriptorPathFor(relFile), `converted step ${relFile}`));
}

/** In-memory fixtures + assertions. Throws on the first failure. */
export function selfTest() {
  const d = (vars, checks) => ({
    identity: { name: 'fixture_step' },
    config: vars === null ? 'none' : { logic_variables: vars.map((name) => ({ name })) },
    checks,
  });
  const c = (over) => ({ id: 'pct_check', limit: 'pct <= 0.05', severity: 'FAIL', ...over });
  const bv = (vars, over) => boundViolations(d(vars, [c(over)]));
  const want = (got, n, msg) => { if (got.length !== n) throw new Error(`self-test FAILED (${msg}): got ${JSON.stringify(got)}`); };
  const S = 'fixture_step';
  const row = { gate: 'A', step: S, item: 'checks.pct_check.limit', disposition: 'pending_remediation', why: 'w', closing_brief: '.cursor/plan.md row A', filed: '2026-09-25', adjudicated_by: 'operator' };

  // 1/2/3 — `limit_from_config`: bare RED, declared GREEN, undeclared RED.
  want(bv([], {}), 1, '1 bare pct limit');
  if (bv([], {})[0].item !== 'checks.pct_check.limit') throw new Error('self-test FAILED (1): wrong item');
  want(bv(['pct_max'], { limit_from_config: 'pct_max' }), 0, '2 declared limit_from_config');
  const und = bv([], { limit_from_config: 'nope_var' });
  want(und, 1, '3 undeclared limit_from_config');
  if (!und[0].detail.includes('nope_var')) throw new Error('self-test FAILED (3): detail must name the missing var');
  // 4/5 — zero tolerance GREEN, `viol <= 3` RED.
  want(bv([], { limit: 'viol == 0' }), 0, '4 zero tolerance');
  want(bv([], { limit: 'viol <= 3' }), 1, '5 viol <= 3');
  // 6 — warn_limit with no warn_limit_from_config → RED, on the warn item.
  const warn = bv([], { limit: 'viol == 0', warn_limit: 'pct >= 0' });
  want(warn, 1, '6 bare warn_limit');
  if (warn[0].item !== 'checks.pct_check.warn_limit') throw new Error('self-test FAILED (6): wrong item');
  // 7 — the RED item with a matching pending ledger row → GREEN.
  const ok = checkClosedBounds([d([], [c()])], [row]);
  if (!ok.pass || ok.unallowed.length || ok.orphans.length) throw new Error(`self-test FAILED (7): ledger-allowed violation not GREEN (${JSON.stringify(ok)})`);
  // 8 — a ledger row with NO violation is an ORPHAN → RED.
  const orph = checkClosedBounds([d([], [c({ limit: 'viol == 0' })])], [row]);
  if (orph.pass || orph.orphans.length !== 1 || !orph.detail.includes('orphan')) throw new Error(`self-test FAILED (8): orphan row not RED (${JSON.stringify(orph)})`);
  // 9 — clean fleet + no rows → GREEN.
  const clean = checkClosedBounds([d([], [c({ limit: 'viol == 0' })])], []);
  if (!clean.pass || clean.blockedSlugs.length) throw new Error(`self-test FAILED (9): clean fleet not GREEN (${JSON.stringify(clean)})`);

  // 10–15 — R-DE clauses.
  const vd = (over) => ({
    identity: { name: 'fixture_step', archetype: 'LINK', spec: '43' },
    execution: { batch: 1000, shape: 'link' },
    config: { logic_variables: [{ name: 'fixture_step_floor' }] },
    guards: { empty_source: 'r' },
    inputs: { reads: { tables: [{ table: 'r' }] } },
    outputs: { writes: [{ table: 'w' }] },
    ...over,
  });
  const vctx = { seeds: { fixture_step_batch: { default: 500 } }, censusRows: [{ file: 'scripts/f.js', owner_specs: ['docs/specs/01-pipeline/43_chain_sources.md'] }], file: 'scripts/f.js' };
  const items = (over) => vocabularyViolations(vd(over), vctx).map((v) => v.item);
  want(vocabularyViolations(vd({}), vctx), 0, '10 conforming descriptor');
  if (!items({ execution: { batch: 'none', shape: 'link' } }).includes('vocab.execution.batch')) throw new Error('self-test FAILED (11): link "none"');
  if (!items({ execution: { batch: 'none', batch_size_from_config: 'fixture_step_batch' } }).includes('vocab.execution.batch')) throw new Error('self-test FAILED (12): config batch must equal its seed');
  want(vocabularyViolations(vd({ execution: { batch: 500, batch_size_from_config: 'fixture_step_batch' } }), vctx), 0, '12b seeded batch');
  if (!items({ identity: { name: 'fixture_step', archetype: 'LINK', spec: '60' } }).includes('vocab.identity.spec')) throw new Error('self-test FAILED (13): non-owner spec');
  if (!items({ config: { logic_variables: [{ name: 'floor_pct' }] } }).includes('vocab.config.logic_variables.floor_pct')) throw new Error('self-test FAILED (14): unprefixed variable');
  if (!items({ guards: { empty_source: 'elsewhere' } }).includes('vocab.guards.empty_source')) throw new Error('self-test FAILED (15): empty_source outside reads');
}

/** CLI — `--list` prints the orchestrator-pasteable row for every CURRENT unallowed violation. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('closed-bounds self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const violations = [];
    for (const d of loadConvertedDescriptors(REPO_ROOT)) violations.push(...boundViolations(d));
    const { unallowed } = matchLedger('A', violations, loadLedger(REPO_ROOT).rows);
    const out = unallowed.map((v) => ({
      gate: 'A', step: v.step, item: v.item, disposition: 'pending_remediation',
      why: (violations.find((x) => x.step === v.step && x.item === v.item) || {}).detail || '',
      closing_brief: `wf2-remediate-${kebab(v.step)}`,
      filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
    }));
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: closed-bounds.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

export { LEDGER_REL_PATH };
