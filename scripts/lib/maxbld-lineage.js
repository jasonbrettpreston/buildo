/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10 (lineage fields), P5.12, P5.14 (trust model and the
 *            missing-data register), P5.15 (INV-1..INV-23 row-level checks; INV-22 trust_level_computed)
 * Handbook:  Spec 133 §m.188 (M-188 part 6, Layer 3 lineage), §m.240 (M-240); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * Lineage assembly for compute_maxbld_scenarios (P3-6), a pure library over the P3-2..P3-5 module results. It builds the five
 * lineage fields of one row: cited_clauses, field_citations, disclosures, trust_checks and row_trust_level. Layer 2 is read
 * only through the one accessor (maxbld-layer2-view.js); the field -> Layer 2 target map is the lineage registry
 * (docs/reference/maxbld-field-lineage.json `keyed.layer2_targets`), passed IN, never retyped. No law number lives here.
 *
 *   citedClauses(results)               -> sorted unique winner_unit_ids
 *   buildAmendmentIndex(provisions)     -> {unit_id: 'none'|'in_force'|'partially_in_force'|'not_verified'}
 *   fieldCitations({view, cls, lineage, fields, amendment, structure?}) -> {field: [{unit_id, amendment_status}]}
 *   assembleDisclosures({codes, carried, registered}) -> sorted unique; an unregistered P5.12 code throws
 *   registerItems(disclosures)          -> the ML-n ids of the missing-data register touching the row
 *   trustChecks(row, ctx)               -> {checks: {INV-n: pass|fail|n/a|not_assessed}, register: [ML-n]}
 *   rowTrustLevel(input, config)        -> not_evaluated | low | disclosed | high   (P5.14, computed, never asserted)
 *   trustLevelMatches(input, config)    -> INV-22: stored level equals the computed one
 *   assembleLineage({...})              -> the five fields
 */
'use strict';

const PRINCIPAL = 'principal';
const NEW_BUILD = Object.freeze(['D', 'H', 'S', '2']);
/** Row-level invariants (runs_at "step check" in the lineage registry). INV-17, INV-24, INV-25 are generator checks; INV-22 is the level itself. */
const ROW_INVARIANTS = Object.freeze([
  'INV-1', 'INV-2', 'INV-3', 'INV-4', 'INV-5', 'INV-6', 'INV-7', 'INV-8', 'INV-9', 'INV-10', 'INV-11', 'INV-12', 'INV-13', 'INV-14', 'INV-15',
  'INV-16', 'INV-18', 'INV-19', 'INV-20', 'INV-21', 'INV-23',
]);
/** Needing the rear-suite module (P3-3), other rows of the parcel, bedrooms, or Layer 2 unit chapters: reported, never silently n/a. */
const NOT_ASSESSED = Object.freeze(['INV-2', 'INV-3', 'INV-4', 'INV-5', 'INV-6', 'INV-13', 'INV-14', 'INV-15', 'INV-18', 'INV-19']);
/** P5.1 gate_flags values; each is also its own disclosure code (lineage registry, gate_flags). */
const GATE_FLAGS = Object.freeze(['holding_zone', 'exception_not_authored', 'heritage_designated', 'ravine_protection', 'shoreline_hazard', 'triangular_lot', 'irregular_lot_approximation']);
const GATE_DISCLOSURE = Object.freeze(Object.fromEntries(GATE_FLAGS.map((f) => [f, f])));
/** P5.14 missing-data register: the disclosure codes that name each ML item. */
const DISCLOSURE_TO_ML = Object.freeze({
  suite_lot_fact_unknown: 'ML-1',
  coxwell_may_qualify: 'ML-2',
  semi_party_wall: 'ML-4',
  existing_low_confidence: 'ML-5', existing_estimated: 'ML-5', renovation_position_unknown: 'ML-5', existing_storeys_needed: 'ML-5',
  irregular_lot_approximation: 'ML-6',
  triangular_lot: 'ML-7',
  shoreline_hazard: 'ML-8',
  established_grade: 'ML-9',
  front_yard_averaging: 'ML-10', front_yard_needs_survey: 'ML-10', front_yard_not_measured: 'ML-10', front_yard_survey_required: 'ML-10',
  lane_centreline_original: 'ML-11',
  exception_not_authored: 'ML-12',
  r_pre1953_fsi_relief: 'ML-13', lawfully_existing_relief: 'ML-13',
});
const AMENDMENT_RANK = Object.freeze({ none: 0, in_force: 1, partially_in_force: 2, not_verified: 3 });
const EPS = 1e-6;

const uniqSorted = (xs) => [...new Set(xs)].sort();
const near = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

function citedClauses(results) {
  return uniqSorted(results.map((r) => r.winner_unit_id).filter((x) => x !== null && x !== undefined && x !== ''));
}

function buildAmendmentIndex(provisions) {
  const out = {};
  for (const row of provisions.rows) {
    let worst = 'none';
    for (const a of row.amendments || []) {
      const s = Object.prototype.hasOwnProperty.call(provisions.amendment_statuses, a.bylaw) ? provisions.amendment_statuses[a.bylaw] : 'not_verified';
      if ((AMENDMENT_RANK[s] === undefined ? AMENDMENT_RANK.not_verified : AMENDMENT_RANK[s]) > AMENDMENT_RANK[worst]) worst = AMENDMENT_RANK[s] === undefined ? 'not_verified' : s;
    }
    for (const u of row.units || []) out[u.unit_id] = worst;
  }
  return out;
}

function fieldCitations({ view, cls, lineage, fields, amendment, structure }) {
  const out = {};
  for (const field of fields) {
    const entry = lineage.fields.find((f) => f.field === field);
    if (!entry) throw new Error(`fieldCitations: field ${field} is not in the lineage registry`);
    const targets = (entry.keyed && entry.keyed.layer2_targets) || [];
    const units = citedClauses(targets.filter((t) => view.has(cls, structure || PRINCIPAL, t)).map((t) => view.result(cls, structure || PRINCIPAL, t)));
    out[field] = units.map((unit_id) => {
      if (!Object.prototype.hasOwnProperty.call(amendment, unit_id)) throw new Error(`fieldCitations: no amendment status for unit ${unit_id}; a missing input is never defaulted`);
      return { unit_id, amendment_status: amendment[unit_id] };
    });
  }
  return out;
}

function assembleDisclosures({ codes, carried, registered }) {
  for (const c of codes) if (!registered.includes(c)) throw new Error(`assembleDisclosures: ${JSON.stringify(c)} is not a registered P5.12 code (vocab.json disclosure_code)`);
  return uniqSorted([...codes, ...carried]);
}

function registerItems(disclosures) {
  return uniqSorted(disclosures.map((d) => DISCLOSURE_TO_ML[d]).filter(Boolean));
}

const val = (l2, target) => (l2 && l2[target] && l2[target].status === 'applies' && Number.isFinite(l2[target].value) ? l2[target].value : null);

function trustChecks(row, ctx) {
  const m = row.main && row.main.status === 'computed' ? row.main : null;
  const renovation = row.scenario.startsWith('R');
  const u = row.units && row.units.status === 'computed' ? row.units : null;
  const c = {};
  const verdict = (ok) => (ok ? 'pass' : 'fail');
  for (const id of ROW_INVARIANTS) c[id] = NOT_ASSESSED.includes(id) ? 'not_assessed' : 'n/a';

  if (NEW_BUILD.includes(row.scenario) && m) c['INV-1'] = verdict(near(row.total_gfa_sqm, m.main_gfa_sqm + (row.suite_gfa_sqm || 0)));
  else if (row.scenario === 'RA' && row.renovation && row.renovation.addition && Number.isFinite(row.renovation.addition.gfa_sqm)) {
    c['INV-1'] = verdict(near(row.total_gfa_sqm, row.renovation.existing.gfa_sqm + row.renovation.addition.gfa_sqm));
  }
  const fsi = val(ctx.layer2, 'fsi');
  if (m && fsi !== null) c['INV-7'] = verdict(m.main_gfa_sqm <= fsi * ctx.lotAreaSqm + EPS);
  const cov = val(ctx.layer2, 'lot_coverage_pct');
  if (m && cov !== null) c['INV-8'] = verdict(m.main_footprint_sqm <= (cov / 100) * ctx.lotAreaSqm + EPS);
  if (m) {
    const front = val(ctx.layer2, 'front_setback_m');
    const rear = val(ctx.layer2, 'rear_setback_m');
    const side = val(ctx.layer2, 'side_setback_m');
    const parts = [];
    if (front !== null) parts.push(m.main_front_setback_m >= front - EPS);
    if (rear !== null) parts.push(m.main_rear_setback_m >= rear - EPS);
    if (side !== null) parts.push(m.main_side_setbacks_m.every((s) => s >= -EPS && s >= 0) && Math.max(...m.main_side_setbacks_m) >= side - EPS);
    if (parts.length) c['INV-9'] = verdict(parts.every(Boolean));
  }
  if (m) {
    const h = val(ctx.layer2, 'height_m');
    const st = val(ctx.layer2, 'height_storeys');
    const parts = [];
    if (h !== null) parts.push(m.main_height_m <= h + EPS);
    if (st !== null) parts.push(m.main_storeys <= st);
    if (parts.length) c['INV-10'] = verdict(parts.every(Boolean));
  }
  if ((row.scenario === 'H' || row.scenario === 'S') && u) {
    const floors = u.unit_breakdown.length;
    c['INV-11'] = verdict(u.dwelling_units >= ctx.caps.minUnits && u.dwelling_units <= Math.min(ctx.caps.houseplexCap, floors));
  }
  if (u) c['INV-12'] = verdict(u.unit_breakdown.reduce((s, f) => s + f.interior_area_sqm, 0) <= ctx.plateSumSqm * (1 - ctx.circulationShare) + EPS);
  c['INV-16'] = verdict(row.cited_clauses.every((id) => ctx.provisionUnits.has(id)));
  const scoped = renovation ? true : row.renovation === null || row.renovation === undefined;
  c['INV-20'] = verdict(scoped && (row.existing_storeys === null || row.existing_storeys === undefined || row.existing_source === 'user_entered'));
  const flags = row.gate_flags;
  const gateOk = flags.every((f) => GATE_FLAGS.includes(f) && row.disclosures.includes(GATE_DISCLOSURE[f]))
    && (!flags.includes('holding_zone') || renovation || row.scenario_status === 'not_permitted:holding_zone');
  c['INV-21'] = verdict(gateOk);
  const coa = row.coa;
  const coaKeysOk = Object.keys(coa).every((k) => /^(coa_|suite_coa_)/.test(k));
  let coaOk = coaKeysOk;
  if (coaOk && m && coa.coa_gfa_sqm !== null) coaOk = coa.coa_factor !== null && near(coa.coa_gfa_sqm, m.main_gfa_sqm * coa.coa_factor.value);
  else if (coaOk && coa.coa_gfa_sqm === null) coaOk = typeof coa.coa_status === 'string' && coa.coa_status !== 'applies';
  c['INV-23'] = verdict(coaOk);
  return { checks: c, register: registerItems(row.disclosures) };
}

/** P5.14: the row level from its own checks, the field tiers and the gates. The CoA fields are not an input. */
function rowTrustLevel(input, config) {
  if (!config || !Number.isFinite(config.trustHighMinPassPct)) throw new TypeError('rowTrustLevel: config.trustHighMinPassPct is required (P5.9); a missing input is never defaulted');
  if (String(input.scenario_status).startsWith('not_evaluated')) return 'not_evaluated';
  const values = Object.values(input.checks);
  for (const v of values) if (!['pass', 'fail', 'n/a', 'not_assessed'].includes(v)) throw new Error(`rowTrustLevel: unknown check value ${JSON.stringify(v)}`);
  if (values.includes('fail')) return 'low';
  if (input.totalGfaTiers.some((t) => t === 'estimate' || t === 'user_input')) return 'low';
  if (input.tableVersion !== input.currentTableVersion) return 'low';
  const applicable = values.filter((v) => v !== 'n/a');
  const pct = applicable.length === 0 ? 100 : (100 * applicable.filter((v) => v === 'pass').length) / applicable.length;
  if (pct < config.trustHighMinPassPct) return 'disclosed';
  if (input.estimateInputs.length > 0 || input.gateFlags.length > 0 || input.register.length > 0) return 'disclosed';
  return 'high';
}

function trustLevelMatches(input, config) {
  return input.stored === rowTrustLevel(input, config);
}

function assembleLineage({ row, ctx, view, cls, lineage, fields, amendment, usedResults, codes, carried, registered, estimateInputs, totalGfaTiers, config, structure }) {
  const disclosures = assembleDisclosures({ codes, carried, registered });
  const withDisclosures = { ...row, disclosures };
  const trust = trustChecks(withDisclosures, ctx);
  return {
    cited_clauses: citedClauses(usedResults),
    field_citations: fieldCitations({ view, cls, lineage, fields, amendment, structure }),
    disclosures,
    trust_checks: trust,
    row_trust_level: rowTrustLevel({
      scenario_status: row.scenario_status, checks: trust.checks, register: trust.register, gateFlags: row.gate_flags,
      estimateInputs, totalGfaTiers, tableVersion: ctx.tableVersion, currentTableVersion: ctx.currentTableVersion,
    }, config),
  };
}

module.exports = {
  ROW_INVARIANTS, NOT_ASSESSED, GATE_FLAGS, GATE_DISCLOSURE, DISCLOSURE_TO_ML,
  citedClauses, buildAmendmentIndex, fieldCitations, assembleDisclosures, registerItems, trustChecks, rowTrustLevel, trustLevelMatches, assembleLineage,
};
