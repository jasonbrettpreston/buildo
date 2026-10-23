/**
 * renovation-shared.js — the Spec 78 P5.7 shared pure calculation (step + app)
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.7 (one pure calculation, shared by
 *            the step and the app), P5.5 / P5.2 item 6, P5.12 (`through_lot_front_line`, `mechanical_attic_excluded`),
 *            P5.13 (the M-228 / M-229 vectors);
 *            docs/specs/01-pipeline/69a_mcbylaw_register.md M-228 (through-lot front lot line), M-229 (mechanical attic
 *            area left out of GFA; amends M-171).
 * DUAL CODE PATH: to be shared by
 *   - the step's compute module compute-maxbld-scenarios.js. It is HELD outside the tree until P3-7 step commit ① (P3-HOLD-1,
 *     Spec 132 §core.1 / §x-stages.2; ~/Buildo-scratch/p3build/held/APPLY.txt), and is wired at ①.
 *   - a TS shim for the app (PIN APP-RENO), as cost-model.ts is for cost-model-shared.js.
 * This file holds the formulas that are ruled today (M-228, M-229). P5.6's renovationResults() joins it at ①.
 *
 * Purity contract (Spec 124 R-BZ / R-CA): no query, no network, no clock, no randomness, no process or module state, no
 * locale APIs. Every law number arrives in the arguments (the keyed clause literals of 10.5.40.40(2); M-229(4): "never
 * code constants"); the street names arrive from parcel data (M-228(1)). Deterministic and re-entrant.
 *
 * @module renovation-shared
 */
'use strict';

/**
 * @typedef {Object} StreetLine
 * @property {string} line_id      the lot line's id from the lot-line classification (Spec 78 P5.14 ML-1)
 * @property {string|null} street_name  the street the line separates the lot from
 */

/**
 * @typedef {Object} ThroughLotFrontLineResult
 * @property {'not_applicable'|'applies'|'undecided'} status  Spec 68 §5a part 3 statuses
 * @property {string|null} front_line_id
 * @property {string[]} rear_line_ids
 * @property {string|null} front_street
 * @property {{code: string, params: {street: string}}|null} disclosure  P5.12 `through_lot_front_line`
 * @property {string[]} candidates  the street-line ids when undecided
 */

const normStreet = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toUpperCase() : '');

/**
 * M-228 (operator 2026-10-20, "1 & 2 y"; 10.5.30.20(1)(B): "the lot line abuts a street where an adjacent lot has its
 * front lot line on the same street"). On a through lot the front lot line is the street line on the lot's own
 * address street (`parcels.primary_frontage_street_name`, the proxy for the neighbours' front street); the other
 * street line(s) are the rear lot line. (A) the 0.3 m reserve is taken as not separating (M-169(1)), so it is no input.
 * Not a through lot → `not_applicable`. The address street on no street line, or on more than one → `undecided`
 * with the candidate lines (never a guess; Spec 68 §5a part 3).
 *
 * @param {{isThroughLot: boolean, addressStreet: string|null, streetLines: StreetLine[]}} input
 * @returns {ThroughLotFrontLineResult}
 */
function throughLotFrontLine(input) {
  const { isThroughLot, addressStreet, streetLines } = input;
  const lines = Array.isArray(streetLines) ? streetLines : [];
  const none = { front_line_id: null, rear_line_ids: [], front_street: null, disclosure: null, candidates: [] };
  if (isThroughLot !== true) return { status: 'not_applicable', ...none };
  const want = normStreet(addressStreet);
  const ids = lines.map((l) => l.line_id).sort();
  const hits = want ? lines.filter((l) => normStreet(l.street_name) === want) : [];
  if (hits.length !== 1 || lines.length < 2) return { status: 'undecided', ...none, candidates: ids };
  const front = hits[0];
  const street = String(front.street_name).trim();
  return {
    status: 'applies',
    front_line_id: front.line_id,
    rear_line_ids: lines.filter((l) => l !== front).map((l) => l.line_id).sort(),
    front_street: street,
    disclosure: { code: 'through_lot_front_line', params: { street } },
    candidates: [],
  };
}

/**
 * @typedef {Object} MechanicalAtticResult
 * @property {number} excluded_sqm        attic area taken as mechanical-equipment space, left out of GFA
 * @property {number} floor_area_sqm      floor area the design builds (plates + counted attic), after the FSI cap
 * @property {number} gfa_sqm             floor_area_sqm − excluded_sqm (what FSI measures)
 * @property {number} gain_sqm            floor_area_sqm − the floor area without the exclusion
 * @property {{code: string, params: {X: number}}|null} disclosure  P5.12 `mechanical_attic_excluded`
 */

/**
 * M-229 (operator 2026-10-20, "1 & 2 y"; 10.5.40.40(2): "that area is not included in the gross floor area of the
 * building if it is not more than 5% of the permitted maximum gross floor area of the building to a maximum of 20
 * square metres"). Where the design has an attic that passes 10.5.40.40(1) (counted in GFA, M-203), up to
 * min(share × permitted maximum GFA, max_sqm) of it is mechanical-equipment area outside GFA (a permissive design
 * choice taken as met, M-172(3)). `clause` carries the keyed literals (share, max_sqm) — never constants here.
 * No counted attic (flat-roof form, or a failing attic already outside GFA, M-203) → no change (M-229(3)).
 * No permitted maximum GFA (FSI `not_applicable` / `unlimited`) → the share has no base: no exclusion, and the
 * buildable floor area is unchanged either way.
 *
 * @param {{atticCounted: boolean, atticFloorAreaSqm: number, grossFloorAreaSqm: number,
 *          permittedMaxGfaSqm: number|null, clause: {share: number, max_sqm: number}}} input
 * @returns {MechanicalAtticResult}
 */
function mechanicalAtticExclusion(input) {
  const { atticCounted, atticFloorAreaSqm, grossFloorAreaSqm, permittedMaxGfaSqm, clause } = input;
  const capped = (gross, extra) => (permittedMaxGfaSqm == null ? gross : Math.min(gross, permittedMaxGfaSqm + extra));
  const without = capped(grossFloorAreaSqm, 0);
  const attic = Number.isFinite(atticFloorAreaSqm) ? Math.max(atticFloorAreaSqm, 0) : 0;
  if (atticCounted !== true || !(attic > 0) || permittedMaxGfaSqm == null || !clause) {
    return { excluded_sqm: 0, floor_area_sqm: without, gfa_sqm: without, gain_sqm: 0, disclosure: null };
  }
  const limit = Math.min(clause.share * permittedMaxGfaSqm, clause.max_sqm);
  const excluded = Math.max(Math.min(attic, limit), 0);
  const floor = capped(grossFloorAreaSqm, excluded);
  const used = Math.min(excluded, Math.max(floor - Math.min(grossFloorAreaSqm - attic, floor), 0));
  return {
    excluded_sqm: used,
    floor_area_sqm: floor,
    gfa_sqm: floor - used,
    gain_sqm: floor - without,
    disclosure: used > 0 ? { code: 'mechanical_attic_excluded', params: { X: used } } : null,
  };
}

/**
 * P5.2 item 6, the attic test (10.5.40.40(1)): the floor area with clearance above the counted clearance, whether the test
 * counts it in GFA, and the dormer strip. One implementation for the new-build modules and the renovation interior.
 * Geometry (the simplest reading of P5.2, a drafted ruling): a symmetric gable whose roof rises from the limited walls
 * at `pitch` to the height limit `H`; `D` is the slope direction, `E` the length along the limited walls; the dormer
 * strip is `e` (share) of each limited wall's length, as deep as the counted-clearance reach.
 *
 * @param {{nw: number, Hw: number, H: number, pitch: number, ad: number, c: number, q: number, shareMin: number,
 *          areaMin: number, e: number}} p  wall storeys, wall limit, height, pitch, assembly depth, counted clearance,
 *          qualifying clearance, qualifying share (fraction), qualifying area, dormer share (fraction)
 * @param {{D: number, E: number}} dims
 * @param {number} storeyHeightM
 * @returns {{total: number, counted: boolean}}
 */
function atticFloor(p, dims, storeyHeightM) {
  const base = p.Hw - p.nw * storeyHeightM; // wall height above the last full plate
  const top = p.H - p.nw * storeyHeightM - p.ad; // clearance where the roof meets the height limit
  const reach = (cl) => (cl < top ? Math.max((cl + p.ad - base) / p.pitch, 0) : null);
  const area = (cl) => { const x = reach(cl); return x === null ? 0 : Math.max(dims.D - 2 * x, 0) * dims.E; };
  const xc = reach(p.c);
  const dormer = (cl) => (reach(cl) === null || xc === null ? 0 : 2 * p.e * dims.E * Math.min(xc, dims.D / 2));
  const total = area(p.c) + dormer(p.c);
  const qualifying = area(p.q) + dormer(p.q);
  return { total, counted: total > 0 && total >= p.areaMin && qualifying >= p.shareMin * total };
}

/**
 * P5.4, the houseplex unit count: min(u cap, houseplex cap, floors); the count drops while a unit would fall under the
 * heuristic floor; under `minUnits` the result is not_buildable. `uCap` null = no 'u' cap (M-202(3)). Per-floor interior
 * area = the floor's area x (1 - circulation share); a basement floor has in_gfa false (10.5.40.40(3)(A)).
 *
 * @param {{floors: {floor: number, area: number, in_gfa: boolean}[], uCap: number|null, houseplexCap: number,
 *          circulationShare: number, unitMinInteriorSqm: number, minUnits: number}} p
 * @returns {{status: 'computed', count: number, start: number, reduced: boolean, breakdown: object[], avg: number}|{status: 'not_buildable'}}
 */
function unitsFor(p) {
  const breakdown = p.floors
    .map((f) => ({ floor: f.floor, interior_area_sqm: f.area * (1 - p.circulationShare), in_gfa: f.in_gfa }))
    .sort((a, b) => b.floor - a.floor);
  const total = breakdown.reduce((s, f) => s + f.interior_area_sqm, 0);
  const start = Math.min(p.houseplexCap, p.floors.length, ...(p.uCap === null ? [] : [p.uCap]));
  let count = start;
  while (count >= p.minUnits && total / count < p.unitMinInteriorSqm) count -= 1;
  if (count < p.minUnits) return { status: 'not_buildable' };
  return { status: 'computed', count, start, reduced: count < start, breakdown, avg: total / count };
}

const NEEDS_STOREYS = 'not_evaluated:needs_user_input:existing_storeys';
const need = (v, name) => { if (v === undefined || v === null || !Number.isFinite(v)) throw new TypeError(`renovationResults: ${name} is required; a missing input is never defaulted`); return v; };

/**
 * P5.7: the three renovation results of Spec 78 P5.6 (plus the envelope expansion RE and the basement finish RF) from the
 * renovation envelope, the existing-house input and the P5.9 values. User-input fields are null with a closed reason in
 * `needs` until the owner enters the storeys (O-13). Every law number arrives in the arguments.
 *
 * @param {object} envelope  {footprintSqm, gfaSqm, storeys, frontageM, reliefFrontageMaxM, rearAdditionStoreyCap, fsiCapSqm|null,
 *   depthCapM|null, lengthCapM|null, extension: {extraLengthM, maxWidthShare}|null, attic: {Hw,H,pitch,ad,c,q,shareMin,areaMin,storeyHeightM},
 *   units: {uCap|null, houseplexCap, minUnits}}
 * @param {object} house  {widthM, depthM, storeys|null, basement: boolean|null, basementHeightM|null, confidence, source}
 * @param {object} config  {basementLivableShare, circulationShare, unitMinInteriorSqm, existingConfidenceMin}
 */
function renovationResults(envelope, house, config) {
  const w = need(house.widthM, 'existingHouse.widthM');
  const d = need(house.depthM, 'existingHouse.depthM');
  for (const k of ['basementLivableShare', 'circulationShare', 'unitMinInteriorSqm', 'existingConfidenceMin']) need(config[k], `config.${k}`);
  for (const k of ['footprintSqm', 'gfaSqm', 'storeys', 'frontageM', 'reliefFrontageMaxM']) need(envelope[k], `envelope.${k}`);
  const disclosures = new Set(['renovation_position_unknown', 'existing_walls_site_fact', 'existing_roof_alteration']);
  const params = {};
  const needs = {};
  const fp = w * d;
  const known = Number.isFinite(house.storeys);
  const st = known ? house.storeys : null;
  const egfa = known ? fp * st : null;
  const flag = (field) => { needs[field] = NEEDS_STOREYS; disclosures.add('existing_storeys_needed'); };
  if (house.source === 'estimated') disclosures.add('existing_estimated');
  const lowConfidence = need(house.confidence, 'existingHouse.confidence') < config.existingConfidenceMin;
  if (lowConfidence) disclosures.add('existing_low_confidence');

  // RA: back room (area difference, bound by the envelope), up room (10.5.40.71(3)), one-storey extension (M-206).
  const backFp = Math.max(envelope.footprintSqm - fp, 0);
  const ext = envelope.extension ? envelope.extension.extraLengthM * envelope.extension.maxWidthShare * w : 0;
  if (envelope.extension) disclosures.add('one_storey_extension');
  let backStoreys = envelope.storeys;
  if (envelope.rearAdditionStoreyCap) {
    disclosures.add('rear_addition_floor_levels');
    backStoreys = known ? Math.min(envelope.storeys, st) : null;
  }
  const backGfa = backStoreys === null ? null : backFp * backStoreys + ext;
  if (backGfa === null) flag('addition_back_gfa_sqm');
  let upGfa = null;
  if (known) {
    const relief = envelope.frontageM <= envelope.reliefFrontageMaxM;
    if (relief) disclosures.add('addition_above_existing');
    const caps = [d, ...[envelope.depthCapM, envelope.lengthCapM].filter((x) => x !== null && x !== undefined)];
    const plate = Math.min(relief ? fp : Math.min(fp, envelope.footprintSqm), w * Math.min(...caps));
    upGfa = plate * Math.max(envelope.storeys - st, 0);
    if (envelope.fsiCapSqm !== null && envelope.fsiCapSqm !== undefined) upGfa = Math.min(upGfa, Math.max(envelope.fsiCapSqm - egfa, 0));
  } else {
    flag('addition_up_gfa_sqm');
  }
  const additionGfa = upGfa === null || backGfa === null ? null : upGfa + backGfa;
  if (additionGfa === null) needs.addition_gfa_sqm = NEEDS_STOREYS;

  // RE: keep the house and build out to the full renovation envelope.
  const expansion = egfa === null ? null : Math.max(envelope.gfaSqm - egfa, 0);
  if (expansion === null) flag('renovation_envelope_expansion_gfa_sqm');

  // RI: attic conversion inside the existing box, unit conversion over the existing floors (+ basement).
  const interior = { attic_gfa_sqm: null, attic_outside_gfa_sqm: null, units: null, units_gain: null, unit_breakdown: null, avg_unit_gfa_sqm: null };
  if (known) {
    const a = envelope.attic;
    const p = { nw: st, Hw: a.Hw, H: a.H, pitch: a.pitch, ad: a.ad, c: a.c, q: a.q, shareMin: a.shareMin, areaMin: a.areaMin, e: 0 };
    const x = atticFloor(p, { D: w, E: d }, a.storeyHeightM);
    const y = atticFloor(p, { D: d, E: w }, a.storeyHeightM);
    const best = y.counted === x.counted ? (y.total > x.total ? y : x) : (y.counted ? y : x);
    interior.attic_gfa_sqm = best.counted ? best.total : 0;
    interior.attic_outside_gfa_sqm = best.counted ? 0 : best.total;
    if (best.total > 0 && !best.counted) disclosures.add('attic_outside_gfa');
    const floors = [];
    for (let i = 0; i < st; i += 1) floors.push({ floor: i + 1, area: fp, in_gfa: true });
    if (config.basementLivableShare > 0) floors.push({ floor: 0, area: fp * config.basementLivableShare, in_gfa: false });
    const u = unitsFor({ floors, uCap: envelope.units.uCap, houseplexCap: envelope.units.houseplexCap, circulationShare: config.circulationShare, unitMinInteriorSqm: config.unitMinInteriorSqm, minUnits: envelope.units.minUnits });
    if (u.status === 'computed') {
      interior.units = u.count;
      interior.units_gain = u.count - 1;
      interior.unit_breakdown = u.breakdown;
      interior.avg_unit_gfa_sqm = u.avg;
      if (u.reduced) { disclosures.add('unit_count_reduced'); params.unit_count_reduced = { n: u.count, m: config.unitMinInteriorSqm }; }
    } else {
      interior.units = 1;
      interior.units_gain = 0;
    }
  } else {
    flag('interior_attic_gfa_sqm');
    needs.interior_units_gain = NEEDS_STOREYS;
  }
  disclosures.add('conversion_within_building');

  // RB: underpinning; the livable gain is outside GFA (10.5.40.40(3)(A)).
  const livable = fp * config.basementLivableShare;
  disclosures.add('basement_excluded');
  params.basement_excluded = { A: livable };
  for (const c of ['basement_unit_grade', 'basement_headroom_code', 'basement_becomes_storey']) disclosures.add(c);

  // RF: basement renovation without underpinning, only where the owner says a basement exists and enters its height.
  const finish = house.basement === true && Number.isFinite(house.basementHeightM) ? livable : null;

  return {
    existing: { footprint_sqm: fp, gfa_sqm: egfa, low_confidence: lowConfidence },
    addition: { back_footprint_sqm: backFp + ext, back_gfa_sqm: backGfa, up_gfa_sqm: upGfa, gfa_sqm: additionGfa },
    envelopeExpansion: { gfa_sqm: expansion },
    interior,
    basement: { livable_gain_sqm: livable, in_gfa: false, unit_possible: livable * (1 - config.circulationShare) >= config.unitMinInteriorSqm },
    basementFinish: { livable_sqm: finish },
    needs,
    disclosures: [...disclosures].sort(),
    disclosure_params: params,
  };
}

module.exports = { throughLotFrontLine, mechanicalAtticExclusion, atticFloor, unitsFor, renovationResults };
