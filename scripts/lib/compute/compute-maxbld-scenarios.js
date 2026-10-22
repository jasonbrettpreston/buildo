'use strict';
/**
 * compute_maxbld_scenarios: the pure compute (MATERIALIZER, `execution.materialize_form: "rows"`; Layer 3 of the McBylaw scenario build).
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.1 (scenarios, gates), P5.2 (main building), P5.4 (houseplex units),
 *            P5.6/P5.7 (renovation), P5.10 (rows), P5.10a (CoA tier), P5.11 (step shape, checks), P5.14 (trust)
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the Layer 2 rows read, through the ONE accessor), docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA
 * Handbook:  Spec 132 §materializer.1 (R-EH), §core.9 (R-W: compute is pure), §x-stages.2 (R-EQ: commit 2); Spec 133 §m.188, §m.189; HELD on P3-Q1 / P3-Q15
 *
 * The runner pages `bylaw_resolution_lots` (every parcel Layer 2 resolved), calls `materializeRows` per batch and writes the two targets of
 * `outputs.writes[]` in one transaction: e1 the keyed retraction of the batch's parcels (link_full_retraction, replace_keys), e2 the guarded
 * upsert of `parcel_maxbld_scenarios`. This module holds no query beyond the declared source and post statements, no transaction, no clock, no
 * literal tunable: Layer 2 is read through scripts/lib/maxbld-layer2-view.js (the one accessor, P3-Q1), every P5.9 number arrives in
 * `config`, and the clause literals reach it from the registry scripts/analysis/phase3/phase3-literals.json (locked to the bylaw tree).
 *
 * NOT BUILT: the rear-suite add-on (P5.5, P3-3 has no module), so every suite_ column stays NULL (REAR_SUITE, NOT_POPULATED); front-yard
 * averaging, the lane centreline, the triangular-lot radius and the RD deep side yard are OWED in maxbld-main-building.js. Nothing is
 * invented for them.
 *
 * Targets (descriptor `outputs.writes[]` order; each file `eN` is `write.targetKey(N-1)`):
 *   e1 parcel_maxbld_scenarios  F replace_keys    (every parcel id of the batch: its scenario rows are cleared before the upsert)
 *   e2 parcel_maxbld_scenarios  A guarded_upsert  (one row per produced (parcel, scenario))
 */

const LV = require('../maxbld-layer2-view.js');
const ST = require('../maxbld-scenario-status.js');
const MB = require('../maxbld-main-building.js');
const HU = require('../maxbld-houseplex-units.js');
const COA = require('../maxbld-coa-tier.js');
const LN = require('../maxbld-lineage.js');
const RS = require('../../../src/features/leads/lib/renovation-shared.js');
const SCOPE = require('../../seeds/bylaw/layer2-scope.json');
const MAP = require('../../seeds/bylaw/layer2-map.json');
const VOCAB = require('../../seeds/bylaw/vocab.json');
const LINEAGE = require('../../../docs/reference/maxbld-field-lineage.json');
const LITERALS = require('../../analysis/phase3/phase3-literals.json');
const AMENDMENT = require('../../../docs/reference/maxbld-amendment-index.json');
/** M-160: the unit counts of the Layer 2 classes (D = detached_house 1, 2 = house_with_secondary_suite 2). */
const CLASS_UNITS = VOCAB.scenario_class_units;

/** Bumped when the Layer 3 logic changes; the third lineage version (Spec 78 P5.10 run lineage). */
const CODE_VERSION = 'maxbld-l3-1';
const TABLE = 'parcel_maxbld_scenarios';
/** The relations this module's SQL touches, declared so the purity gate (G2) can judge it from the commit alone, without the step descriptor. */
const DECLARED = { reads: ['bylaw_resolution_lots', 'bylaw_resolution_results', 'bylaw_resolution_texts', 'parcel_maxbld_scenarios', 'parcels'], writes: ['parcel_maxbld_scenarios'] };
const PREFIX = 'compute_maxbld_scenarios_';
const PRINCIPAL = 'principal';
/** The rear-suite add-on (P5.5) has no module (P3-3): reported, never faked. */
const REAR_SUITE = 'not_built';

/** P5.1 catalogue order; code -> name. */
const SCENARIOS = Object.freeze([
  ['D', 'detached_house'], ['H', 'detached_houseplex'], ['S', 'semi_detached_houseplex'], ['2', 'house_with_secondary_suite'],
  ['RA', 'renovation_addition'], ['RI', 'renovation_interior'], ['RB', 'renovation_basement'], ['RE', 'renovation_envelope_expansion'], ['RF', 'renovation_basement_finish'],
]);
const NEW_BUILD_NAMES = Object.freeze(['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'house_with_secondary_suite']);
const PERSISTED = Object.freeze(LINEAGE.fields.filter((f) => f.persisted !== false).map((f) => f.field));
const REGISTERED_CODES = Object.freeze(VOCAB.disclosure_code);
const NOT_EVALUATED = 'not_evaluated';

/**
 * Persisted columns no module writes yet (the explicit ratchet; the test recomputes it from a rich fixture). The rear suite and its columns
 * (P3-3), the cross-row gain fields, bedrooms, front-yard averaging basis, the lane centreline, the two nearby-CoA figures, and the owner-entered
 * existing-house fields (storeys, basement) that are NULL on every pipeline row (O-13, O-14).
 */
const NOT_POPULATED = Object.freeze([
  'existing_basement', 'existing_storeys', 'gain_reasons', 'gain_vs_detached_footprint_sqm', 'gain_vs_detached_gfa_sqm', 'gain_vs_detached_storeys', 'host_interior_sqm',
  'lot_form_basis', 'main_depth_chosen_m', 'main_front_setback_basis', 'main_gfa_with_suite_sqm', 'main_lane_centreline_setback_m', 'max_bedrooms',
  'nearby_coa_builds_count', 'nearby_coa_builds_gfa_sqm', 'same_as_scenario', 'suite_binding', 'suite_coverage_option', 'suite_gfa_sqm', 'suite_height_m',
  'suite_interior_sqm', 'suite_lane_arm', 'suite_openings_loss_sqm', 'suite_rear_setback_m', 'suite_separation_m', 'suite_setback_basis',
  'suite_side_setbacks_m', 'suite_soft_landscaping_sqm', 'suite_type', 'suite_footprint_sqm',
]);

/**
 * Columns NULL by design on every pipeline row, with a closed reason: the owner-entered figures that need the existing storeys (O-13, field_status
 * carries not_evaluated:needs_user_input:existing_storeys), the basement finish (RF needs the owner's basement and height, O-14) and the CoA
 * figures while every u is unfitted (LC-60).
 */
const NULL_BY_DESIGN = Object.freeze([
  'addition_up_gfa_sqm', 'basement_finish_livable_sqm', 'coa_factor', 'coa_gfa_sqm', 'coa_increment_sqm', 'interior_attic_gfa_sqm', 'interior_units_gain',
  'suite_coa_gfa_sqm', 'suite_coa_increment_sqm',
]);

const REQUIRED_CONFIG = Object.freeze([
  'storey_height_m', 'roof_pitch', 'roof_assembly_depth_m', 'basement_livable_share', 'circulation_share', 'unit_min_interior_sqm',
  'first_floor_elevation_m', 'min_dimension_m', 'lot_viability_margin_m', 'existing_confidence_min', 'trust_high_min_pass_pct', 'houseplex_min_units',
]);
const REQUIRED_LOT = Object.freeze(['id', 'lot_size_sqm', 'frontage_m', 'depth_m', 'zoning_class', 'rows', 'permitted', 'permitted_texts', 'layer2_table_version', 'evaluator_version']);

// ---- the clause literals, read from the registry (never typed here) ----------------------------------------------------------------------
function literal(moduleInput, regulationId) {
  const hits = LITERALS.literals.filter((l) => l.module_input === moduleInput && (regulationId === undefined || l.regulation_id === regulationId));
  if (hits.length !== 1) throw new Error(`compute_maxbld_scenarios: expected one registry literal for ${moduleInput}, found ${hits.length}`);
  return hits[0];
}
const CLAUSES = Object.freeze({
  caps: Object.freeze({
    detached: literal('caps.detached').value, semi: literal('caps.semi').value, detached_600_60: literal('caps.detached_600_60').value,
    lift: literal('caps.lift').value,
  }), // minUnits is the pinned logic variable houseplex_min_units (P3-Q8), added per batch from config
  reliefFrontageMaxM: literal('envelope.reliefFrontageMaxM').value,
  viabilityFrontageMinM: literal('config.viabilityFrontageMinM').value,
  mechanical: Object.freeze({ share: literal('clause.mechanical.share').value / 100, max_sqm: literal('clause.mechanical.max_sqm').value }),
});

// ---- source statements ------------------------------------------------------------------------------------------------------------------

/**
 * The source statements (R-EH (a)). Keyset paging over the Layer 2 lot rows (CHAT-80.QP option 4, R-JR); each lot arrives with its lot facts, its
 * gate, its positional permitted words (decoded in JS like L2-SLICES logicalRowsOf: permission_image order, texts from the dictionary) and its
 * decoded results, one JSON array of rows from the view bylaw_resolution_results (class, structure, target, the eight stored fields). losers,
 * inputs_used and disclosures are not stored and arrive null (Layer 2 recomputes them on read; this step reads none of them for a decision).
 * `semi_half` (ML-4) and `existing_confidence` (P5.6) have no producer yet and arrive as FALSE / NULL: OWED, never faked in this module.
 * @returns {{count_sql: string, batch_sql: string, batch_binds: string[]}}
 */
function buildSourceSql(_descriptor, _config, _opts) {
  return {
    count_sql: 'SELECT COUNT(*)::int AS parcels_scanned FROM bylaw_resolution_lots',
    batch_sql: `SELECT l.parcel_id AS id, l.lot_gate, l.permitted, l.table_version AS layer2_table_version, l.evaluator_version,
       ARRAY(SELECT tx.text FROM unnest(COALESCE(l.permitted_text_ids, ARRAY[]::integer[])) WITH ORDINALITY AS k (key, i)
               LEFT JOIN bylaw_resolution_texts tx ON tx.text_key = k.key ORDER BY k.i) AS permitted_texts,
       pa.lot_size_sqm, pa.frontage_m, pa.depth_m, pa.zoning_class, pa.zoning_holding, pa.is_heritage_designated, pa.is_in_ravine_protection_area,
       pa.in_sixplex_area, pa.existing_width_m, pa.existing_length_m,
       FALSE AS semi_half, NULL::numeric AS existing_confidence,
       (SELECT jsonb_agg(jsonb_build_object('class', r.class, 'structure', r.structure, 'target', r.target, 'status', r.status, 'value_kind', r.value_kind,
                                            'value', r.value, 'reason', r.reason, 'winner_unit_id', r.winner_unit_id, 'winner_layer', r.winner_layer,
                                            'evidence_kind', r.evidence_kind, 'evidence_ref', r.evidence_ref))
          FROM bylaw_resolution_results r WHERE r.parcel_id = l.parcel_id) AS rows
  FROM bylaw_resolution_lots l
  JOIN parcels pa ON pa.id = l.parcel_id
 WHERE l.parcel_id > $1
 ORDER BY l.parcel_id ASC
 LIMIT $2`,
    batch_binds: ['last_key', 'batch_size'],
  };
}

/** The positional permitted words back into the accessor's permission shape (L2-SLICES decodePermitted: permission_image order, class order). */
function decodePermitted(src, classes) {
  const keys = Object.keys(MAP.permission_image);
  const out = {};
  classes.forEach((c, i) => {
    const status = keys[src.permitted[i]];
    if (!status) throw new Error(`compute_maxbld_scenarios: lot ${src.id} permitted code ${src.permitted[i]} is not in layer2-map.json permission_image`);
    const text = src.permitted_texts[i];
    const w = { status };
    if (text !== null && text !== undefined) w[status === 'prohibited' ? 'clause' : 'reason'] = text;
    out[c] = w;
  });
  return out;
}

// ---- one batch ---------------------------------------------------------------------------------------------------------------------------

const num = (r) => (r.status === 'applies' && r.value_kind === 'number' ? r.value : null);
const cfgNum = (config, key) => {
  const k = PREFIX + key;
  if (config[k] === undefined || config[k] === null || !Number.isFinite(Number(config[k]))) throw new Error(`compute_maxbld_scenarios: logic variable ${k} is missing; a missing input is never defaulted`);
  return Number(config[k]);
};

function checkInputs(row, config) {
  for (const k of REQUIRED_CONFIG) cfgNum(config, k);
  for (const k of REQUIRED_LOT) if (row[k] === undefined || row[k] === null) throw new Error(`compute_maxbld_scenarios: lot ${row.id} is missing ${k}; a missing input is never defaulted`);
  for (const k of ['lot_gate', 'zoning_holding']) if (row[k] === undefined) throw new Error(`compute_maxbld_scenarios: lot ${row.id} is missing ${k}; a missing input is never defaulted`);
}

function tiers(code) {
  return code.startsWith('R') ? ['estimate'] : ['bylaw_derived'];
}

const FIELD_STATUS_TARGETS = Object.freeze({ fsi_status: 'fsi', coverage_status: 'lot_coverage_pct', storeys_status: 'height_storeys', main_wall_status: 'main_wall_height_m', height_status: 'height_m' });
const RENOVATION_DISCLOSURES = Object.freeze({
  RA: ['renovation_position_unknown', 'addition_above_existing', 'one_storey_extension', 'rear_addition_floor_levels', 'existing_walls_site_fact', 'existing_roof_alteration'],
  RI: ['conversion_within_building', 'attic_outside_gfa', 'unit_count_reduced'],
  RB: ['basement_excluded', 'basement_unit_grade', 'basement_headroom_code', 'basement_becomes_storey'],
  RE: [], RF: [],
});
const COMMON_EXISTING = Object.freeze(['existing_estimated', 'existing_low_confidence']);

function emptyRow() {
  const r = {};
  for (const f of PERSISTED) r[f] = null;
  return r;
}

function buildScenarioRow({ src, code, name, view, cls, flags, config, run_at, currentTableVersion }) {
  const config5 = {
    storeyHeightM: cfgNum(config, 'storey_height_m'), roofPitch: cfgNum(config, 'roof_pitch'), roofAssemblyDepthM: cfgNum(config, 'roof_assembly_depth_m'),
    firstFloorElevationM: cfgNum(config, 'first_floor_elevation_m'), minDimensionM: cfgNum(config, 'min_dimension_m'),
  };
  const share = cfgNum(config, 'basement_livable_share');
  const circ = cfgNum(config, 'circulation_share');
  const unitMin = cfgNum(config, 'unit_min_interior_sqm');
  const isReno = code.startsWith('R');
  const caps = { ...CLAUSES.caps, minUnits: cfgNum(config, 'houseplex_min_units') }; // P3-Q8: a pinned logic variable
  const row = emptyRow();
  Object.assign(row, {
    parcel_id: src.id, scenario: name, building_class: cls, first_floor_elevation_m: config5.firstFloorElevationM,
    lot_form_detected: flags.semiHalf ? 'semi_half' : 'detached', layer2_table_version: src.layer2_table_version, evaluator_version: src.evaluator_version,
    code_version: CODE_VERSION, computed_at: run_at,
  });
  const st = ST.scenarioStatus({ scenario: code, view, flags, config: { viabilityFrontageMinM: CLAUSES.viabilityFrontageMinM, lotViabilityMarginM: cfgNum(config, 'lot_viability_margin_m') } });
  let status = st.status;
  const disclosures = [...st.disclosures];
  const params = {};
  const fieldStatus = {};

  // Layer 2 field statuses (M-232 total map), whatever the scenario status
  for (const [col, target] of Object.entries(FIELD_STATUS_TARGETS)) {
    if (!view.has(cls, PRINCIPAL, target)) continue;
    const r = view.result(cls, PRINCIPAL, target);
    row[col] = target === 'height_m' ? ST.fieldStatus(r, MAP) : ST.fieldStatus(r, MAP);
    if (row[col] !== 'computed') fieldStatus[col] = row[col];
  }

  let main = null;
  let units = null;
  let reno = null;
  let coa = null;
  let totalGfa = null;
  const lot = { areaSqm: Number(src.lot_size_sqm), frontageM: Number(src.frontage_m), depthM: Number(src.depth_m), partyWall: cls.startsWith('semi'), frontSetbackM: null, bufferedAreaSqm: null };

  if (status === 'permitted') {
    main = MB.mainBuilding({ view, cls, lot, config: config5, clause: { mechanical: CLAUSES.mechanical } });
    if (main.status !== 'computed') { status = main.status; main = null; }
  }
  if (status === 'permitted' && (code === 'H' || code === 'S')) {
    units = HU.houseplexUnits({
      view, cls, main, config: { basementLivableShare: share, circulationShare: circ, unitMinInteriorSqm: unitMin }, caps,
      lot: { semi: code === 'S', in600_60: src.in_sixplex_area === true, zoneFamily: src.zoning_class },
    });
    if (units.status !== 'computed') { status = units.status; units = null; }
  }

  if (status === 'permitted') {
    const m = main;
    if (!isReno) {
      Object.assign(row, {
        main_gfa_sqm: m.main_gfa_sqm, main_footprint_sqm: m.main_footprint_sqm, main_front_setback_m: m.main_front_setback_m, main_rear_setback_m: m.main_rear_setback_m,
        main_side_setbacks_m: { side_1: m.main_side_setbacks_m[0], side_2: m.main_side_setbacks_m[1], street_side: null, beyond_17m: null },
        main_height_m: m.main_height_m, main_storeys: m.main_storeys, main_wall_limit_m: m.main_wall_limit_m, main_wall_pair: m.main_wall_pair,
        gfa_flat_sqm: m.gfa_flat_sqm, storeys_flat: m.storeys_flat, gfa_pitched_sqm: m.gfa_pitched_sqm, storeys_pitched: m.storeys_pitched,
        attic_outside_gfa_sqm: m.attic_outside_gfa_sqm, roof_form_headline: m.roof_form_headline, roof_pitch: m.roof_pitch, binding_constraint: m.binding_constraint,
        basement_livable_sqm: m.main_footprint_sqm * share, main_gfa_without_suite_sqm: m.main_gfa_sqm,
        main_depth_cap_m: num(view.result(cls, PRINCIPAL, 'building_depth_m')), main_length_cap_m: num(view.result(cls, PRINCIPAL, 'building_length_m')),
        total_gfa_sqm: m.main_gfa_sqm,
      });
      totalGfa = m.main_gfa_sqm;
      disclosures.push(...m.disclosures);
      Object.assign(params, m.disclosure_params);
      // D and 2 carry the class definition's unit count (M-160: vocab scenario_class_units house_units), never a typed number
      if (code === 'D' || code === '2') row.dwelling_units = CLASS_UNITS[cls].house_units;
      if (units) {
        Object.assign(row, { dwelling_units: units.dwelling_units, unit_breakdown: units.unit_breakdown, avg_unit_gfa_sqm: units.avg_unit_gfa_sqm });
        disclosures.push(...units.disclosures);
        Object.assign(params, units.disclosure_params);
      }
      coa = COA.coaTier({ scenario: code, mainGfaSqm: m.main_gfa_sqm, hasSuite: false, suiteGfaSqm: null }, {}, null);
    } else {
      // renovation: the envelope is P5.2 for the renovation class; the existing house is the estimate (storeys are owner input only, O-13)
      const w = Number(src.existing_width_m);
      const d = Number(src.existing_length_m);
      const confidence = src.existing_confidence === null || src.existing_confidence === undefined ? 0 : Number(src.existing_confidence);
      const fsi = num(view.result(cls, PRINCIPAL, 'fsi'));
      const depthCap = num(view.result(cls, PRINCIPAL, 'building_depth_m'));
      const lengthCap = num(view.result(cls, PRINCIPAL, 'building_length_m'));
      const read = (t) => num(view.result(cls, PRINCIPAL, t));
      const u = view.result(cls, PRINCIPAL, 'dwelling_units_max');
      const envelope = {
        footprintSqm: m.main_footprint_sqm, gfaSqm: m.main_gfa_sqm, storeys: m.main_storeys, frontageM: lot.frontageM, reliefFrontageMaxM: CLAUSES.reliefFrontageMaxM,
        rearAdditionStoreyCap: src.zoning_class === 'R', fsiCapSqm: fsi === null ? null : fsi * lot.areaSqm, depthCapM: depthCap, lengthCapM: lengthCap, extension: null,
        attic: { Hw: m.main_wall_limit_m, H: m.main_height_m, pitch: m.roof_pitch, ad: config5.roofAssemblyDepthM, c: read('attic_counted_clearance_m'), q: read('attic_qualifying_clearance_m'), shareMin: read('attic_qualifying_share_pct') / 100, areaMin: read('attic_qualifying_area_m2'), storeyHeightM: config5.storeyHeightM },
        units: { uCap: num(u), houseplexCap: cls.startsWith('semi') ? caps.semi : caps.detached, minUnits: caps.minUnits },
      };
      reno = RS.renovationResults(envelope, { widthM: w, depthM: d, storeys: null, basement: null, basementHeightM: null, confidence, source: 'estimated' }, { basementLivableShare: share, circulationShare: circ, unitMinInteriorSqm: unitMin, existingConfidenceMin: cfgNum(config, 'existing_confidence_min') });
      Object.assign(row, {
        existing_width_m: w, existing_depth_m: d, existing_footprint_sqm: reno.existing.footprint_sqm,
        existing_confidence: src.existing_confidence === null || src.existing_confidence === undefined ? null : confidence, existing_source: 'estimated', existing_low_confidence: reno.existing.low_confidence,
      });
      if (code !== 'RF' && code !== 'RE') Object.assign(row, { main_footprint_sqm: null });
      if (['RA', 'RI', 'RB', 'RE'].includes(code)) Object.assign(row, { renovation_envelope_gfa_sqm: m.main_gfa_sqm, renovation_envelope_footprint_sqm: m.main_footprint_sqm });
      if (code === 'RA') Object.assign(row, { addition_up_gfa_sqm: reno.addition.up_gfa_sqm, addition_back_footprint_sqm: reno.addition.back_footprint_sqm, addition_back_gfa_sqm: reno.addition.back_gfa_sqm, total_gfa_sqm: reno.addition.gfa_sqm === null ? null : reno.existing.gfa_sqm + reno.addition.gfa_sqm });
      if (code === 'RI') Object.assign(row, { interior_attic_gfa_sqm: reno.interior.attic_gfa_sqm, interior_units_gain: reno.interior.units_gain, dwelling_units: reno.interior.units, unit_breakdown: reno.interior.unit_breakdown, avg_unit_gfa_sqm: reno.interior.avg_unit_gfa_sqm, attic_outside_gfa_sqm: reno.interior.attic_outside_gfa_sqm });
      if (code === 'RB') Object.assign(row, { basement_livable_gain_sqm: reno.basement.livable_gain_sqm });
      if (code === 'RF') Object.assign(row, { basement_finish_livable_sqm: reno.basementFinish.livable_sqm });
      totalGfa = row.total_gfa_sqm;
      const allowed = new Set([...COMMON_EXISTING, ...RENOVATION_DISCLOSURES[code], ...(['RA', 'RI', 'RE'].includes(code) ? ['existing_storeys_needed'] : [])]);
      disclosures.push(...reno.disclosures.filter((c) => allowed.has(c)));
      for (const [k, v] of Object.entries(reno.disclosure_params)) if (allowed.has(k)) params[k] = v;
      for (const [k, v] of Object.entries(reno.needs)) if (row[k] === null || row[k] === undefined) fieldStatus[k] = v;
      coa = COA.coaTier({ scenario: code, mainGfaSqm: null, hasSuite: false, suiteGfaSqm: null }, {}, null);
    }
  } else {
    coa = COA.coaTier({ scenario: code, mainGfaSqm: null, hasSuite: false, suiteGfaSqm: null }, {}, null);
  }
  Object.assign(row, coa);
  row.scenario_status = status;

  // gate flags (P5.1 gates that hold)
  const flagSet = new Set(disclosures.filter((c) => LN.GATE_FLAGS.includes(c)));
  if (src.lot_gate === 'exception_not_authored') flagSet.add('exception_not_authored');
  row.gate_flags = [...flagSet].sort();

  // lineage (P3-6)
  row.disclosures = LN.assembleDisclosures({ codes: [...new Set(disclosures)], carried: [], registered: REGISTERED_CODES });
  row.disclosure_params = Object.fromEntries(Object.entries(params).filter(([k]) => row.disclosures.includes(k)));
  row.field_status = fieldStatus;
  const targetsOf = (field) => (LINEAGE.fields.find((f) => f.field === field).keyed || {}).layer2_targets || [];
  const populated = PERSISTED.filter((f) => row[f] !== null && row[f] !== undefined && targetsOf(f).length > 0 && targetsOf(f).every((t) => view.has(cls, PRINCIPAL, t)));
  const used = [...new Set(populated.flatMap(targetsOf))].map((t) => view.result(cls, PRINCIPAL, t));
  const l2 = {};
  for (const t of ['fsi', 'lot_coverage_pct', 'height_m', 'height_storeys', 'front_setback_m', 'rear_setback_m', 'side_setback_m']) {
    if (view.has(cls, PRINCIPAL, t)) { const r = view.result(cls, PRINCIPAL, t); l2[t] = { status: r.status, value: num(r) }; }
  }
  const plateSum = main ? main.main_footprint_sqm * (main.main_storeys + (share > 0 ? share : 0)) : 0;
  const lineage = LN.assembleLineage({
    row: { scenario: code, scenario_status: status, main, units, suite_gfa_sqm: 0, total_gfa_sqm: totalGfa, renovation: isReno && reno ? reno : null, coa, gate_flags: row.gate_flags, disclosures: row.disclosures, cited_clauses: LN.citedClauses(used), existing_storeys: null, existing_source: row.existing_source },
    ctx: { lotAreaSqm: Number(src.lot_size_sqm), layer2: l2, provisionUnits: new Set(Object.keys(AMENDMENT.index)), caps: { minUnits: caps.minUnits, houseplexCap: cls.startsWith('semi') ? caps.semi : caps.detached }, circulationShare: circ, plateSumSqm: plateSum, tableVersion: src.layer2_table_version, currentTableVersion },
    view, cls, lineage: LINEAGE, fields: populated, amendment: AMENDMENT.index, usedResults: used, codes: row.disclosures, carried: [], registered: REGISTERED_CODES,
    estimateInputs: [], totalGfaTiers: tiers(code), config: { trustHighMinPassPct: cfgNum(config, 'trust_high_min_pass_pct') },
  });
  row.cited_clauses = lineage.cited_clauses;
  row.field_citations = lineage.field_citations;
  row.trust_checks = lineage.trust_checks;
  row.row_trust_level = lineage.row_trust_level;
  return { row, code };
}

/** is_headline: per parcel, the permitted new-build row with the largest total_gfa_sqm; a tie goes to catalogue order (P5.10). */
function markHeadlines(rows, codeOf) {
  const best = new Map();
  for (const r of rows) {
    r.is_headline = false;
    if (!NEW_BUILD_NAMES.includes(r.scenario) || r.scenario_status !== 'permitted' || !Number.isFinite(r.total_gfa_sqm)) continue;
    const b = best.get(r.parcel_id);
    if (!b || r.total_gfa_sqm > b.total_gfa_sqm) best.set(r.parcel_id, r);
  }
  for (const r of best.values()) r.is_headline = true;
  void codeOf;
}

/**
 * One batch: lot rows -> the target rows (R-EH (c)). Pure. `replace_keys.e1` are the batch's parcel ids (their scenario rows are cleared first).
 * @param {object[]} sourceRows
 * @param {{config: object, run_at: string, scope?: object, currentTableVersion?: string}} ctx
 */
function materializeRows(sourceRows, ctx) {
  const { config, run_at: runAt } = ctx;
  if (!runAt) throw new Error('compute_maxbld_scenarios: run_at is required (the run clock arrives from the runner)');
  const scope = ctx.scope || SCOPE;
  if (!Array.isArray(scope.classes) || scope.classes.length === 0) throw new Error('compute_maxbld_scenarios: layer2-scope.json declares no classes (the Layer 2 class list is a prerequisite)');
  const current = ctx.currentTableVersion || AMENDMENT.layer2_table_version;
  const sorted = [...sourceRows].sort((a, b) => a.id - b.id);
  const rows = [];
  const matched = { parcels: 0, rows: 0, rows_not_evaluated: 0, rows_retracted: sorted.length, not_evaluated_by_reason: {}, scenarios_scanned: 0, violations: {} };
  for (const src of sorted) {
    checkInputs(src, config);
    const view = LV.fromLogicalRows({ lot_gate: src.lot_gate, permitted_by_class: decodePermitted(src, scope.classes), rows: src.rows });
    const flags = {
      semiHalf: src.semi_half === true, holdingZone: src.zoning_holding === true, existingHouse: Number.isFinite(Number(src.existing_width_m)) && src.existing_width_m !== null && Number.isFinite(Number(src.existing_length_m)) && src.existing_length_m !== null,
      existingBasement: null, frontageM: Number(src.frontage_m), lawfullyExistingBelowZoneMin: false,
      heritage: src.is_heritage_designated === true, ravine: src.is_in_ravine_protection_area === true, shoreline: false,
    };
    const parcelRows = [];
    for (const [code, name] of SCENARIOS) {
      if (!ST.isProduced(code, flags)) continue;
      const cls = ST.classOf(code, flags);
      parcelRows.push(buildScenarioRow({ src, code, name, view, cls, flags, config, run_at: runAt, currentTableVersion: current }).row);
    }
    markHeadlines(parcelRows);
    rows.push(...parcelRows);
    matched.parcels += 1;
  }
  matched.rows = rows.length;
  for (const r of rows) {
    if (String(r.scenario_status).startsWith(NOT_EVALUATED)) {
      matched.rows_not_evaluated += 1;
      const reason = String(r.scenario_status).split(':')[1];
      matched.not_evaluated_by_reason[reason] = (matched.not_evaluated_by_reason[reason] || 0) + 1;
    }
  }
  matched.scenarios_scanned = matched.rows;
  matched.violations = tally(rows, { currentTableVersion: current, config });
  return { rows: { e2: rows }, replace_keys: { e1: sorted.map((s) => s.id) }, matched };
}

// ---- tallies for the checks ------------------------------------------------------------------------------------------------------------

/** Row-level violation counts for the invariant checks (the same truths the post read recounts in SQL). */
function tally(rows, opts = {}) {
  const v = { scenario_totality: 0, headline_unique: 0, suite_lt_main: 0, fsi_consistent: 0, coverage_consistent: 0, units_within_cap: 0, renovation_columns_scoped: 0, trust_level_computed: 0, coa_apart: 0 };
  const byParcel = new Map();
  for (const r of rows) {
    if (!byParcel.has(r.parcel_id)) byParcel.set(r.parcel_id, []);
    byParcel.get(r.parcel_id).push(r);
    const c = (r.trust_checks && r.trust_checks.checks) || {};
    if (c['INV-7'] === 'fail') v.fsi_consistent += 1;
    if (c['INV-8'] === 'fail') v.coverage_consistent += 1;
    if (c['INV-11'] === 'fail') v.units_within_cap += 1;
    if (c['INV-20'] === 'fail') v.renovation_columns_scoped += 1;
    if (c['INV-23'] === 'fail') v.coa_apart += 1;
    if (c['INV-2'] === 'fail') v.suite_lt_main += 1;
    if (opts.config && opts.currentTableVersion && r.trust_checks && r.row_trust_level) {
      const code = (SCENARIOS.find((s) => s[1] === r.scenario) || [])[0];
      if (code && !LN.trustLevelMatches({ stored: r.row_trust_level, scenario_status: r.scenario_status, checks: c, register: r.trust_checks.register || [], gateFlags: r.gate_flags || [], estimateInputs: [], totalGfaTiers: tiers(code), tableVersion: r.layer2_table_version, currentTableVersion: opts.currentTableVersion }, { trustHighMinPassPct: cfgNum(opts.config, 'trust_high_min_pass_pct') })) v.trust_level_computed += 1;
    }
  }
  for (const list of byParcel.values()) {
    if (!list.some((r) => r.scenario === 'detached_house') || new Set(list.map((r) => r.scenario)).size !== list.length) v.scenario_totality += 1;
    if (list.filter((r) => r.is_headline).length > 1) v.headline_unique += 1;
  }
  return v;
}

/** The once-per-run post read (R-EH (e)): the table-level truths the totality and uniqueness checks recount in SQL. */
function buildPostSql(_descriptor, _config) {
  const sql = `SELECT
  (SELECT COUNT(*)::int FROM bylaw_resolution_lots l WHERE NOT EXISTS (SELECT 1 FROM ${TABLE} s WHERE s.parcel_id = l.parcel_id AND s.scenario = 'detached_house')) AS scenario_totality_db,
  (SELECT COUNT(*)::int FROM (SELECT parcel_id FROM ${TABLE} WHERE is_headline GROUP BY parcel_id HAVING COUNT(*) > 1) h) AS headline_unique_db`;
  return { post_sql: sql, post_binds: [], post_params: [] };
}

/** Derive the ratios once from the run-summed tallies and the post read (R-EH (c), (e)). */
function finalizeMatched(m, { post, count }) {
  const p = post || {};
  const n = (k) => Number(p[k]) || 0;
  const v = m.violations || {};
  return {
    ...m,
    ...v,
    scenario_totality: (v.scenario_totality || 0) + n('scenario_totality_db'),
    headline_unique: (v.headline_unique || 0) + n('headline_unique_db'),
    scenarios_scanned: Number((count || {}).parcels_scanned) || m.parcels || 0,
    not_evaluated_share_pct: m.rows ? Math.round((m.rows_not_evaluated / m.rows) * 1000) / 10 : null,
  };
}

// ---- checks (descriptor order; Spec 122 §5.5 (1), (4)). Every bound is declared data (limit / limit_from_config), never a comparison here. ----

function scenarios_scanned(ctx) { ctx.report('scenarios_scanned', { violations: 0, detail: { parcels_scanned: ctx.matched.scenarios_scanned, rows: ctx.matched.rows, rows_retracted: ctx.matched.rows_retracted } }); }
function scenario_totality(ctx) { ctx.report('scenario_totality', { violations: ctx.matched.scenario_totality }); }
function headline_unique(ctx) { ctx.report('headline_unique', { violations: ctx.matched.headline_unique }); }
function suite_lt_main(ctx) { ctx.report('suite_lt_main', { violations: ctx.matched.suite_lt_main, detail: { rear_suite: REAR_SUITE } }); }
function fsi_consistent(ctx) { ctx.report('fsi_consistent', { violations: ctx.matched.fsi_consistent }); }
function coverage_consistent(ctx) { ctx.report('coverage_consistent', { violations: ctx.matched.coverage_consistent }); }
function units_within_cap(ctx) { ctx.report('units_within_cap', { violations: ctx.matched.units_within_cap }); }
function renovation_columns_scoped(ctx) { ctx.report('renovation_columns_scoped', { violations: ctx.matched.renovation_columns_scoped }); }
function trust_level_computed(ctx) { ctx.report('trust_level_computed', { violations: ctx.matched.trust_level_computed }); }
function coa_apart(ctx) { ctx.report('coa_apart', { violations: ctx.matched.coa_apart }); }
function not_evaluated_share_pct(ctx) { ctx.report('not_evaluated_share_pct', { value: ctx.matched.not_evaluated_share_pct, detail: { rows: ctx.matched.rows, by_reason: ctx.matched.not_evaluated_by_reason } }); }

/** Spec 122 §5.5 (1): keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  scenarios_scanned, scenario_totality, headline_unique, suite_lt_main, fsi_consistent, coverage_consistent, units_within_cap,
  renovation_columns_scoped, trust_level_computed, coa_apart, not_evaluated_share_pct,
};

/**
 * §5.5 (1): run the SELECTED post checks over the runner-summed `ctx.matched` (the rows arm hands it over, R-EH), and return the declared
 * emits. The loop is the error boundary.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} - ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  const meta = {};
  for (const e of ctx.descriptor.emits || []) if (ctx.matched[e.key] !== undefined) meta[e.key] = ctx.matched[e.key];
  return { records_meta: meta };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildSourceSql = buildSourceSql;
module.exports.materializeRows = materializeRows;
module.exports.finalizeMatched = finalizeMatched;
module.exports.buildPostSql = buildPostSql;
module.exports.tally = tally;
module.exports.TABLE = TABLE;
module.exports.CODE_VERSION = CODE_VERSION;
module.exports.NOT_POPULATED = NOT_POPULATED;
module.exports.NULL_BY_DESIGN = NULL_BY_DESIGN;
module.exports.REAR_SUITE = REAR_SUITE;
module.exports.CLAUSES = CLAUSES;
module.exports.DECLARED = DECLARED;
