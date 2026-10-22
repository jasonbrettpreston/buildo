/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.2 (the main building, per class), P5.3, P5.9
 * Handbook:  Spec 133 §m.184-family (M-184, M-185, M-203, M-229); Spec 132 §core.9, §core.8 (R-CV); HELD on P3-Q1 (N6a freeze)
 *
 * The main building of one scenario row (P3-2, P5.2 items 1-10), a pure library. Every law number arrives through the
 * one Layer 2 accessor (maxbld-layer2-view.js) or the keyed clause literals in `clause`; every tuning number arrives in
 * `config` (the P5.9 logic variables). No law number lives here (Spec 78 §6.7).
 *
 * The geometry is the SIMPLEST reading of P5.2 items 1, 5 and 6 and is listed as a drafted ruling (REPORT, Operator
 * questions Q-G): a rectangular plate Wd x L (width across the frontage x front-to-back length); form (a) stacks full
 * plates to Hw and set-back plates above; form (b) is a symmetric gable whose roof rises from the limited walls at
 * `roofPitch` to the height limit H, the attic floor being the strip with clearance above the counted clearance, plus a
 * dormer strip of `element_width_pct` of each limited wall's length. Sub-items outside this package are OWED and named in
 * `OWED`: front-yard averaging (the caller passes `lot.frontSetbackM`), lane centreline, triangular lot, RD deep side
 * yard, RD flat-roof Hw, the free-share/set-back union (an M-29 sample item).
 *
 *   mainBuilding({view, cls, lot, config, clause}) -> {status, ...fields}
 *     lot    = {areaSqm, frontageM, depthM, partyWall, frontSetbackM|null, bufferedAreaSqm|null}
 *     config = {storeyHeightM, roofPitch, roofAssemblyDepthM, firstFloorElevationM, minDimensionM}
 *     clause = {mechanical: {share, max_sqm} | null}   (10.5.40.40(2), M-229, keyed literals)
 *   status is 'computed' | 'not_buildable:<clauses>' | 'not_evaluated:<reason>'.
 */
'use strict';

const { mechanicalAtticExclusion } = require('../../src/features/leads/lib/renovation-shared.js');

const PRINCIPAL = 'principal';
const OWED = Object.freeze(['front_averaging', 'lane_centreline', 'triangular_lot', 'deep_side_yard', 'flat_roof_wall_limit', 'free_share_union']);
const PAIRS = Object.freeze(['side', 'front_rear']);

/** Read one target: {kind:'num', v, unit} | {kind:'none', status, clause} | {kind:'ne', reason}. */
function read(view, cls, target) {
  const r = view.result(cls, PRINCIPAL, target);
  if (r.status === 'not_evaluated') return { kind: 'ne', reason: r.reason };
  if (r.status === 'not_applicable') return { kind: 'none', status: 'not_applicable', clause: r.reason };
  if (r.value_kind === 'number') return { kind: 'num', v: r.value, unit: r.winner_unit_id };
  return { kind: 'none', status: r.value_kind, clause: r.evidence_ref };
}

class NotEvaluated extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
const need = (x) => {
  if (x.kind === 'ne') throw new NotEvaluated(x.reason);
  return x;
};
/** A required number: a non-number answer means the target is not usable. */
const needNum = (x, name) => {
  need(x);
  if (x.kind !== 'num') throw new NotEvaluated(`target_not_keyed:${name}`);
  return x.v;
};
/** An optional cap: null when the law sets none (not_applicable, unlimited, unregulated). */
const cap = (x) => (need(x).kind === 'num' ? x.v : null);

function atticFor(p, dims, sh) {
  // p: {nw, Hw, H, pitch, ad, c, q, shareMin, areaMin, e}; dims: {D (slope direction), E (along the wall)}
  const base = p.Hw - p.nw * sh; // wall height above the last full plate
  const top = p.H - p.nw * sh - p.ad; // clearance where the roof meets the height limit
  const reach = (cl) => (cl < top ? Math.max((cl + p.ad - base) / p.pitch, 0) : null);
  const area = (cl) => { const x = reach(cl); return x === null ? 0 : Math.max(dims.D - 2 * x, 0) * dims.E; };
  const xc = reach(p.c);
  const dormer = (cl) => (reach(cl) === null || xc === null ? 0 : 2 * p.e * dims.E * Math.min(xc, dims.D / 2));
  const total = area(p.c) + dormer(p.c);
  const qualifying = area(p.q) + dormer(p.q);
  const counted = total > 0 && total >= p.areaMin && qualifying >= p.shareMin * total;
  return { total, counted };
}

function mainBuilding({ view, cls, lot, config, clause }) {
  try {
    return compute(view, cls, lot, config, clause);
  } catch (e) {
    if (e instanceof NotEvaluated) return { status: `not_evaluated:${e.reason}` };
    throw e;
  }
}

function compute(view, cls, lot, config, clause) {
  for (const k of ['areaSqm', 'frontageM', 'depthM']) if (!Number.isFinite(lot[k])) throw new TypeError(`mainBuilding: lot.${k} is required; a missing input is never defaulted`);
  for (const k of ['storeyHeightM', 'roofPitch', 'roofAssemblyDepthM', 'firstFloorElevationM', 'minDimensionM']) if (!Number.isFinite(config[k])) throw new TypeError(`mainBuilding: config.${k} is required (P5.9)`);
  const disclosures = [];
  const params = {};
  const front = read(view, cls, 'front_setback_m');
  const rear = read(view, cls, 'rear_setback_m');
  const side = read(view, cls, 'side_setback_m');
  const frontM = lot.frontSetbackM === null || lot.frontSetbackM === undefined ? needNum(front, 'front_setback_m') : lot.frontSetbackM;
  const rearM = needNum(rear, 'rear_setback_m');
  const sideM = needNum(side, 'side_setback_m');
  const H = needNum(read(view, cls, 'height_m'), 'height_m');
  const hwR = need(read(view, cls, 'main_wall_height_m'));
  const Hw = hwR.kind === 'num' ? Math.min(hwR.v, H) : H;
  const storeysCap = cap(read(view, cls, 'height_storeys'));
  const fsi = cap(read(view, cls, 'fsi'));
  const covPct = cap(read(view, cls, 'lot_coverage_pct'));
  const depthCap = cap(read(view, cls, 'building_depth_m'));
  const lengthCap = cap(read(view, cls, 'building_length_m'));
  const slopeCap = cap(read(view, cls, 'roof_slope_max'));
  const upperSetback = cap(read(view, cls, 'upper_storey_setback_m'));
  const elementPct = cap(read(view, cls, 'element_width_pct'));
  const sideShare = cap(read(view, cls, 'main_wall_side_share_pct'));
  const frontRearShare = cap(read(view, cls, 'main_wall_front_rear_share_pct'));
  const cCount = needNum(read(view, cls, 'attic_counted_clearance_m'), 'attic_counted_clearance_m');
  const cQual = needNum(read(view, cls, 'attic_qualifying_clearance_m'), 'attic_qualifying_clearance_m');
  const shareQual = needNum(read(view, cls, 'attic_qualifying_share_pct'), 'attic_qualifying_share_pct');
  const areaQual = needNum(read(view, cls, 'attic_qualifying_area_m2'), 'attic_qualifying_area_m2');

  // Item 1: the plate F.
  const Wd = lot.frontageM - (lot.partyWall ? sideM : 2 * sideM);
  const avail = lot.depthM - frontM - rearM;
  const L = Math.min(avail, ...[depthCap, lengthCap].filter((x) => x !== null));
  if (!(Wd >= config.minDimensionM) || !(L >= config.minDimensionM)) {
    const units = [front, rear, side].map((x) => x.unit).filter(Boolean);
    return { status: `not_buildable:${[...new Set(units)].sort().join(',')}` };
  }
  const box = Wd * L;
  const coverage = covPct === null ? Infinity : (covPct / 100) * lot.areaSqm;
  const buffered = lot.bufferedAreaSqm === null || lot.bufferedAreaSqm === undefined ? Infinity : lot.bufferedAreaSqm;
  const F = Math.min(box, coverage, buffered);
  const Lp = F / Wd; // the plate keeps the width; a smaller F shortens it

  // Items 2-4: height, wall limit, wall storeys.
  const sh = config.storeyHeightM;
  let nw = Math.max(Math.floor((Hw - config.firstFloorElevationM) / sh), 0);
  let nTotal = Math.max(Math.floor((H - config.firstFloorElevationM) / sh), 0);
  if (storeysCap !== null) nTotal = Math.min(nTotal, storeysCap);
  nw = Math.min(nw, nTotal);
  const fsiCap = fsi === null ? null : fsi * lot.areaSqm;
  const capGfa = (g) => (fsiCap === null ? g : Math.min(g, fsiCap));

  // Item 5: form (a), flat roof with a set-back storey above Hw.
  let upper = nTotal - nw;
  const s = upperSetback === null ? null : upperSetback;
  if (upper > 0 && s === null) upper = 0; // no step-back clause keyed: no storey above Hw
  const upperPlate = Math.max(F - 2 * (s || 0) * Wd, 0);
  const rawA = nw * F + upper * upperPlate;
  const gfaA = capGfa(rawA);
  const storeysA = nw + upper;

  // Item 6: form (b), pitched roof with an attic; the pair chosen builds more (item 3).
  const pitch = slopeCap === null ? config.roofPitch : Math.min(config.roofPitch, slopeCap);
  const e = elementPct === null ? 0 : elementPct / 100;
  let best = null;
  const atticAllowed = storeysCap === null || nw + 1 <= storeysCap;
  for (const pair of PAIRS) {
    const dims = pair === 'side' ? { D: Wd, E: Lp } : { D: Lp, E: Wd };
    const a = atticAllowed
      ? atticFor({ nw, Hw, H, pitch, ad: config.roofAssemblyDepthM, c: cCount, q: cQual, shareMin: shareQual / 100, areaMin: areaQual, e }, dims, sh)
      : { total: 0, counted: false };
    if (best === null || (a.counted ? a.total : 0) > (best.a.counted ? best.a.total : 0)) best = { pair, a };
  }
  let floorB = nw * F + (best.a.counted ? best.a.total : 0);
  let gfaB = capGfa(floorB);
  let atticOutside = best.a.counted ? 0 : best.a.total;
  if (best.a.counted && fsiCap !== null && clause && clause.mechanical) {
    const m = mechanicalAtticExclusion({ atticCounted: true, atticFloorAreaSqm: best.a.total, grossFloorAreaSqm: floorB, permittedMaxGfaSqm: fsiCap, clause: clause.mechanical });
    floorB = m.floor_area_sqm;
    gfaB = m.gfa_sqm;
    atticOutside = m.excluded_sqm;
    if (m.disclosure) { disclosures.push(m.disclosure.code); params[m.disclosure.code] = m.disclosure.params; }
  }
  if (best.a.total > 0 && !best.a.counted) disclosures.push('attic_outside_gfa');
  const storeysB = nw + (best.a.total > 0 && atticAllowed ? 1 : 0);
  const pairShare = best.pair === 'side' ? sideShare : frontRearShare;

  // Item 9: headline form; a tie goes to (a); the other is disclosed.
  const headline = gfaB > gfaA ? 'pitched_attic' : 'flat_setback';
  if (gfaA !== gfaB) { disclosures.push('roof_form_alternate'); params.roof_form_alternate = { X: headline === 'pitched_attic' ? gfaA : gfaB }; }
  const gfa = headline === 'pitched_attic' ? gfaB : gfaA;
  const storeys = headline === 'pitched_attic' ? storeysB : storeysA;

  // Item 10: the binding constraint (closed set); the first that holds.
  let binding = 'setback';
  if (fsiCap !== null && gfa >= fsiCap) binding = 'fsi';
  else if (storeysCap !== null && storeys >= storeysCap && (headline === 'pitched_attic' ? storeysB : storeysA) >= storeysCap && nTotal === storeysCap) binding = 'storeys';
  else if (F === coverage && coverage < box) binding = 'coverage';
  else if (F === buffered && buffered < box) binding = 'lot_dimension';
  else if (depthCap !== null && L === depthCap && depthCap < avail) binding = 'depth';
  else if (lengthCap !== null && L === lengthCap && lengthCap < avail) binding = 'length';

  return {
    status: 'computed',
    main_footprint_sqm: F,
    main_front_setback_m: frontM,
    main_rear_setback_m: rearM,
    main_side_setbacks_m: lot.partyWall ? [0, sideM] : [sideM, sideM],
    main_height_m: H,
    main_wall_limit_m: Hw,
    main_wall_pair: Hw === H ? 'none' : best.pair,
    main_wall_pair_share_pct: Hw === H ? null : pairShare,
    wall_storeys: nw,
    gfa_flat_sqm: gfaA,
    storeys_flat: storeysA,
    gfa_pitched_sqm: gfaB,
    storeys_pitched: storeysB,
    attic_outside_gfa_sqm: atticOutside,
    roof_form_headline: headline,
    main_gfa_sqm: gfa,
    main_storeys: storeys,
    roof_pitch: pitch,
    binding_constraint: binding,
    disclosures: [...new Set(disclosures)].sort(),
    disclosure_params: params,
  };
}

module.exports = { OWED, PAIRS, mainBuilding };
