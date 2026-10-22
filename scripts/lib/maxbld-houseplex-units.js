/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.4 (houseplex units), P5.9, P5.12 (unit_count_reduced)
 * Handbook:  Spec 133 §m.202 (M-202), §m.171 (M-171 note); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * Houseplex units of one scenario row (P3-2, P5.4), a pure library. The unit cap 'u' comes through the one Layer 2
 * accessor (maxbld-layer2-view.js, target dwelling_units_max); the houseplex caps and the minimum unit count are keyed
 * clause literals passed in `caps`; the shares and the heuristic floor are P5.9 values in `config`.
 *
 *   houseplexUnits({view, cls, main, config, caps, lot}) -> {status, dwelling_units, unit_breakdown[], avg_unit_gfa_sqm, disclosures, disclosure_params}
 *     main   = the mainBuilding() result (computed): main_footprint_sqm, main_storeys
 *     config = {basementLivableShare, circulationShare, unitMinInteriorSqm}
 *     caps   = {semi (800.50(746)(A)), detached, detached_600_60 (O-8), minUnits (800.50(181)(D)), lift (M-202(2): a u below this is lifted to detached_600_60)}
 *     lot    = {semi: boolean, in600_60: boolean, zoneFamily: 'R'|'RD'|'RS'|'RT'|'RM'}
 *   status is 'computed' | 'not_buildable:800.50(181)' | 'not_evaluated:<reason>'. Bedrooms are NOT computed here (see REPORT Q-bed).
 */
'use strict';

const NOT_BUILDABLE = 'not_buildable:800.50(181)';
/** M-202(2): the lift of a 'u' below 6 inside 600.60 applies in R, RT and RM only. */
const LIFT_ZONES = Object.freeze(['R', 'RT', 'RM']);

function uCap(view, cls, lot, caps) {
  const r = view.result(cls, 'principal', 'dwelling_units_max');
  if (r.status === 'not_evaluated') return { ne: r.reason };
  if (r.status !== 'applies' || r.value_kind !== 'number') return { cap: null }; // no 'u' = no 'u' cap (M-202(3))
  const lifted = lot.in600_60 && LIFT_ZONES.includes(lot.zoneFamily) && r.value < caps.lift;
  return { cap: lifted ? caps.detached_600_60 : r.value, lifted };
}

function houseplexUnits({ view, cls, main, config, caps, lot }) {
  for (const k of ['basementLivableShare', 'circulationShare', 'unitMinInteriorSqm']) if (!Number.isFinite(config[k])) throw new TypeError(`houseplexUnits: config.${k} is required (P5.9)`);
  for (const k of ['semi', 'detached', 'detached_600_60', 'minUnits', 'lift']) if (!Number.isFinite(caps[k])) throw new TypeError(`houseplexUnits: caps.${k} is required (keyed clause literal)`);
  if (main.status !== 'computed') return { status: main.status };
  const u = uCap(view, cls, lot, caps);
  if (u.ne !== undefined) return { status: `not_evaluated:${u.ne}` };

  const hasBasement = config.basementLivableShare > 0;
  const floorAreas = [];
  for (let i = 0; i < main.main_storeys; i += 1) floorAreas.push({ floor: i + 1, area: main.main_footprint_sqm, in_gfa: true });
  if (hasBasement) floorAreas.push({ floor: 0, area: main.main_footprint_sqm * config.basementLivableShare, in_gfa: false });
  const floors = floorAreas.length;
  const houseplexCap = lot.semi ? caps.semi : lot.in600_60 ? caps.detached_600_60 : caps.detached;
  const bound = [houseplexCap, floors, ...(u.cap === null ? [] : [u.cap])];
  let count = Math.min(...bound);

  const breakdown = floorAreas
    .map((f) => ({ floor: f.floor, interior_area_sqm: f.area * (1 - config.circulationShare), in_gfa: f.in_gfa }))
    .sort((a, b) => b.floor - a.floor);
  const perUnit = (n) => breakdown.reduce((t, f) => t + f.interior_area_sqm, 0) / n;
  const disclosures = [];
  const params = {};
  const start = count;
  while (count >= caps.minUnits && perUnit(count) < config.unitMinInteriorSqm) count -= 1;
  if (count < caps.minUnits) return { status: NOT_BUILDABLE };
  if (count < start) { disclosures.push('unit_count_reduced'); params.unit_count_reduced = { n: count, m: config.unitMinInteriorSqm }; }
  return {
    status: 'computed',
    dwelling_units: count,
    unit_breakdown: breakdown,
    avg_unit_gfa_sqm: perUnit(count),
    disclosures,
    disclosure_params: params,
  };
}

module.exports = { NOT_BUILDABLE, LIFT_ZONES, houseplexUnits };
