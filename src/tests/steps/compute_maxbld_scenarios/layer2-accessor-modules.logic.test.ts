/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.1, P5.2, P5.3, P5.4, P5.13
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (logical row), §4 (status sets), §9 N6a
 * Handbook:  form C (CHAT-69.Q1, recorded at bc5cd3af, not yet on this branch), Spec 132 §core.9; Spec 133 §m.232 (M-232), §m.238; HELD on P3-Q1 (N6a freeze, operator ruling pending)
 *
 * P3-2 (PLAN §4; operator CHAT-73.nohalt): the pure modules for compute_maxbld_scenarios built on fixtures of the Spec 134
 * §3 LOGICAL result row, behind ONE accessor (scripts/lib/maxbld-layer2-view.js). Status mapping, the main building
 * (P5.2) and the houseplex units (P5.4). Vectors are hand-computed from the model written in the module headers.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
const req = (rel: string): Json => {
  expect(fs.existsSync(path.join(ROOT, rel)), `${rel} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, rel)) as Json;
};
const src = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MAP = JSON.parse(src('scripts/seeds/bylaw/layer2-map.json')) as Json;
const SCOPE = JSON.parse(src('scripts/seeds/bylaw/layer2-scope.json')) as Json;
const SPEC134 = src('docs/specs/01-pipeline/134_resolve_bylaws.md');

const VIEW = 'scripts/lib/maxbld-layer2-view.js';
const STATUS = 'scripts/lib/maxbld-scenario-status.js';
const MAIN = 'scripts/lib/maxbld-main-building.js';
const UNITS = 'scripts/lib/maxbld-houseplex-units.js';

// ---- fixtures: Layer 2 logical rows (Spec 134 §3) ---------------------------------------------------------------------
const num = (cls: string, target: string, value: number, unit = `${target}#u`): Json =>
  ({ class: cls, structure: 'principal', target, status: 'applies', value, value_kind: 'number', winner_unit_id: unit, evidence_kind: 'clause', evidence_ref: unit });
const unl = (cls: string, target: string, kind = 'unlimited'): Json =>
  ({ class: cls, structure: 'principal', target, status: 'applies', value: null, value_kind: kind, evidence_kind: 'clause', evidence_ref: `${target}#clause` });
const na = (cls: string, target: string, clause = `${target}#na`): Json =>
  ({ class: cls, structure: 'principal', target, status: 'not_applicable', reason: clause });
const ne = (cls: string, target: string, reason: string): Json => ({ class: cls, structure: 'principal', target, status: 'not_evaluated', reason });

/** A clean lot: Wd 8 x L 20 plate (frontage 10, side 1.0; depth 30, front 5, rear 5), H 10, Hw 7.5, fsi and coverage unlimited. */
function rows(cls = 'detached_house', over: Record<string, Json> = {}): Json[] {
  const base: Record<string, Json> = {
    front_setback_m: num(cls, 'front_setback_m', 5),
    rear_setback_m: num(cls, 'rear_setback_m', 5),
    side_setback_m: num(cls, 'side_setback_m', 1),
    height_m: num(cls, 'height_m', 10),
    main_wall_height_m: num(cls, 'main_wall_height_m', 7.5),
    height_storeys: na(cls, 'height_storeys'),
    fsi: unl(cls, 'fsi'),
    lot_coverage_pct: unl(cls, 'lot_coverage_pct'),
    building_depth_m: unl(cls, 'building_depth_m'),
    building_length_m: unl(cls, 'building_length_m'),
    roof_slope_max: na(cls, 'roof_slope_max'),
    upper_storey_setback_m: num(cls, 'upper_storey_setback_m', 1.4),
    element_width_pct: num(cls, 'element_width_pct', 40),
    main_wall_side_share_pct: num(cls, 'main_wall_side_share_pct', 70),
    main_wall_front_rear_share_pct: num(cls, 'main_wall_front_rear_share_pct', 50),
    attic_counted_clearance_m: num(cls, 'attic_counted_clearance_m', 1.4),
    attic_qualifying_clearance_m: num(cls, 'attic_qualifying_clearance_m', 2.0),
    attic_qualifying_share_pct: num(cls, 'attic_qualifying_share_pct', 80),
    attic_qualifying_area_m2: num(cls, 'attic_qualifying_area_m2', 10),
    dwelling_units_max: unl(cls, 'dwelling_units_max'),
  };
  return Object.values({ ...base, ...over });
}
const CLASSES = ['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house', 'house_with_secondary_suite'];
const PERMITTED = Object.fromEntries(CLASSES.map((c) => [c, { status: 'permitted' }]));
const mkView = (r: Json[], over: Json = {}): Json => req(VIEW).fromLogicalRows({ lot_gate: null, permitted_by_class: PERMITTED, rows: r, ...over });

const LOT = { areaSqm: 300, frontageM: 10, depthM: 30, partyWall: false, frontSetbackM: null, bufferedAreaSqm: null };
const CONFIG = { storeyHeightM: 3, roofPitch: 1, roofAssemblyDepthM: 0.3, firstFloorElevationM: 0, minDimensionM: 3 };
const FLAGS = { semiHalf: false, holdingZone: false, existingHouse: true, existingBasement: null, frontageM: 10, lawfullyExistingBelowZoneMin: false };

// ---- the one accessor ---------------------------------------------------------------------------------------------------
describe('P3-Q1: the one accessor (scripts/lib/maxbld-layer2-view.js)', () => {
  it('its logical result fields are exactly the Spec 134 §3 result columns a consumer reads', () => {
    const f: string[] = req(VIEW).LOGICAL_RESULT_FIELDS;
    for (const col of ['status', 'reason', 'value', 'value_kind', 'evidence_kind', 'evidence_ref', 'inputs_used']) expect(SPEC134, col).toContain(`\`${col}\``);
    expect(SPEC134).toContain('winner_unit_id');
    expect(SPEC134).toContain('losers[]');
    expect(f).toEqual(expect.arrayContaining(['status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers']));
  });

  it('every target the modules read is in the declared v1 principal scope (layer2-scope.json)', () => {
    const read = rows().map((r) => r.target);
    for (const t of read) expect(SCOPE.targets.principal, t).toContain(t);
  });

  it('result() returns the logical row; a missing result THROWS, never a default (Spec 134 I10)', () => {
    const v = mkView(rows());
    expect(v.result('detached_house', 'principal', 'height_m').value).toBe(10);
    expect(() => v.result('detached_house', 'principal', 'bedrooms')).toThrow(/never defaulted/);
    expect(() => v.permission('no_such_class')).toThrow(/never defaulted/);
  });

  it('rejects a status outside the Layer 2 stored set', () => {
    expect(() => mkView([{ ...num('detached_house', 'height_m', 10), status: 'conflict' }])).toThrow(/stored status/);
  });

  it('the stored form C resolves by_class: the representative columns, own columns, and collapsed_into', () => {
    const cell = (extra: Json): Json => ({ cell_id: 'c1', structure: 'principal', target: 'height_m', status: 'applies', value: 10, value_kind: 'number', inputs_used: [], by_class: extra });
    const v = req(VIEW).fromCellRows({
      lot: { lot_gate: null, permitted_by_class: PERMITTED },
      classes: ['detached_house', 'detached_houseplex', 'semi_detached_houseplex'],
      entries: [{ structure: 'principal', target: 'height_m', cell_id: 'c1' }],
      cellsById: { c1: cell({ detached_houseplex: 'collapsed_into:detached_house', semi_detached_houseplex: { status: 'applies', value: 12, value_kind: 'number' } }) },
    });
    expect(v.result('detached_house', 'principal', 'height_m').value).toBe(10);
    expect(v.result('detached_houseplex', 'principal', 'height_m').value).toBe(10);
    expect(v.result('semi_detached_houseplex', 'principal', 'height_m').value).toBe(12);
  });

  it('the seams are marked // P3-Q1 and no consumer module knows the physical form', () => {
    expect(src(VIEW).match(/\/\/ P3-Q1/g)!.length).toBeGreaterThanOrEqual(2);
    for (const rel of [STATUS, MAIN, UNITS]) {
      const s = src(rel);
      expect(s, rel).not.toMatch(/by_class|cell_id|profile_id|pointers|bylaw_resolution_/);
      expect(s, rel).not.toMatch(/require\('\.\/bylaw-(resolution|materialize)/);
    }
  });
});

// ---- status mapping -----------------------------------------------------------------------------------------------------
describe('P3-2: scenario status (P5.1 gates in order; M-232 total map)', () => {
  const st = (scenario: string, view: Json, flags: Json = {}, config: Json = { viabilityFrontageMinM: 6, lotViabilityMarginM: 0.5 }): Json =>
    req(STATUS).scenarioStatus({ scenario, view, flags: { ...FLAGS, ...flags }, config });

  it('maps each scenario to its Layer 2 class; the renovation class follows semi_half', () => {
    const m = req(STATUS);
    expect([m.classOf('D', FLAGS), m.classOf('H', FLAGS), m.classOf('S', FLAGS), m.classOf('2', FLAGS)]).toEqual(['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'house_with_secondary_suite']);
    expect(m.classOf('RA', FLAGS)).toBe('detached_house');
    expect(m.classOf('RI', { ...FLAGS, semiHalf: true })).toBe('semi_detached_house');
  });

  it('S exists only where semi_half holds; RF only where the owner says a basement exists', () => {
    const m = req(STATUS);
    expect(m.isProduced('S', FLAGS)).toBe(false);
    expect(m.isProduced('S', { ...FLAGS, semiHalf: true })).toBe(true);
    expect(m.isProduced('RF', FLAGS)).toBe(false);
    expect(m.isProduced('RF', { ...FLAGS, existingBasement: true })).toBe(true);
    expect(m.isProduced('D', FLAGS)).toBe(true);
  });

  it('permitted when every gate passes', () => {
    expect(st('D', mkView(rows())).status).toBe('permitted');
  });

  it('gate 1, holding: new-build rows are not_permitted:holding_zone; renovation rows are computed and disclosed', () => {
    expect(st('D', mkView(rows()), { holdingZone: true }).status).toBe('not_permitted:holding_zone');
    const r = st('RA', mkView(rows()), { holdingZone: true });
    expect(r.status).toBe('permitted');
    expect(r.disclosures).toContain('holding_zone');
  });

  it('gate 2, lot viability (M-207): below the threshold on a lawfully existing lot not_permitted:10.5.30.21(3) for D, 2, H only; inside the margin disclosed', () => {
    const f = { lawfullyExistingBelowZoneMin: true };
    expect(st('D', mkView(rows()), { ...f, frontageM: 5.9 }).status).toBe('not_permitted:10.5.30.21(3)');
    expect(st('H', mkView(rows('detached_houseplex')), { ...f, frontageM: 5.9 }).status).toBe('not_permitted:10.5.30.21(3)');
    expect(st('RA', mkView(rows()), { ...f, frontageM: 5.9 }).status).toBe('permitted');
    const near = st('D', mkView(rows()), { ...f, frontageM: 6.2 });
    expect(near.status).toBe('permitted');
    expect(near.disclosures).toContain('irregular_lot_approximation');
    expect(() => st('D', mkView(rows()), { ...f, frontageM: 6.2 }, {})).toThrow(/never defaulted/);
  });

  it('gate 3: the Layer 2 lot gate propagates unchanged, and an unauthored exception is disclosed', () => {
    expect(st('D', mkView(rows(), { lot_gate: 'ambiguous_zone' })).status).toBe('not_evaluated:ambiguous_zone');
    const r = st('D', mkView(rows(), { lot_gate: 'exception_not_authored' }));
    expect(r.status).toBe('not_evaluated:exception_not_authored');
    expect(r.disclosures).toContain('exception_not_authored');
  });

  it('a renovation with no existing-house input is not_evaluated:no_existing_house', () => {
    expect(st('RI', mkView(rows()), { existingHouse: false }).status).toBe('not_evaluated:no_existing_house');
  });

  it('the class permission: prohibited -> not_permitted:<clause>; not_evaluated reason propagates', () => {
    const p = { ...PERMITTED, detached_houseplex: { status: 'prohibited', clause: '10.20.20.40(1)' }, semi_detached_houseplex: { status: 'not_evaluated', reason: 'missing_input' } };
    const v = mkView(rows(), { permitted_by_class: p });
    expect(st('H', v).status).toBe('not_permitted:10.20.20.40(1)');
    expect(st('S', v, { semiHalf: true }).status).toBe('not_evaluated:missing_input');
  });

  it('heritage, ravine and shoreline are disclosed, never a gate', () => {
    const r = st('D', mkView(rows()), { heritage: true, ravine: true, shoreline: true });
    expect(r.status).toBe('permitted');
    expect(r.disclosures).toEqual(['heritage_designated', 'ravine_protection', 'shoreline_hazard']);
  });

  it('every status it can write is a member of the vocab layer3 forms (scenario_status; gate and reason names)', () => {
    const vocab = JSON.parse(src('scripts/seeds/bylaw/vocab.json')) as Json;
    for (const s of ['permitted', 'not_permitted', 'not_evaluated']) expect(vocab.layer3.scenario_status).toContain(s);
    for (const g of MAP.lot_gate) expect(MAP.reason_code, g).toContain(g);
  });
});

describe('P3-2: field status through layer2-map.json layer3_image (M-232, M-238)', () => {
  const fs_ = (r: Json): string => req(STATUS).fieldStatus(r, MAP);
  it('is total over the stored statuses and value kinds', () => {
    expect(fs_({ status: 'applies', value_kind: 'number', value: 3 })).toBe('computed');
    expect(fs_({ status: 'applies', value_kind: 'unlimited', evidence_ref: '10.5.40.40(1)' })).toBe('unlimited:10.5.40.40(1)');
    expect(fs_({ status: 'applies', value_kind: 'unregulated', evidence_ref: 'x.30' })).toBe('unregulated:x.30');
    expect(fs_({ status: 'not_applicable', reason: '10.5.40.40(1)(C)' })).toBe('not_applicable:10.5.40.40(1)(C)');
    expect(fs_({ status: 'not_evaluated', reason: 'missing_input' })).toBe('not_evaluated:missing_input');
  });
  it('a status or value kind with no image throws (the map is total in both directions)', () => {
    expect(() => fs_({ status: 'undecided' })).toThrow(/no Layer 3 image/);
    expect(() => fs_({ status: 'applies', value_kind: 'weird' })).toThrow(/no Layer 3 image/);
  });
  it('every Layer 3 field status it writes is in vocab layer3.field_status', () => {
    const vocab = JSON.parse(src('scripts/seeds/bylaw/vocab.json')) as Json;
    for (const s of [fs_({ status: 'applies', value_kind: 'number' }), 'unlimited', 'unregulated', 'not_applicable', 'not_evaluated']) expect(vocab.layer3.field_status).toContain(s.split(':')[0]);
  });
});

// ---- main building (P5.2) -----------------------------------------------------------------------------------------------
describe('P3-2: the main building (P5.2)', () => {
  const mb = (r: Json[] = rows(), lot: Json = LOT, config: Json = CONFIG, clause: Json | null = null, cls = 'detached_house'): Json =>
    req(MAIN).mainBuilding({ view: mkView(r), cls, lot, config, clause });

  it('item 1: plate = setback box (8 x 20 = 160) when nothing else binds', () => {
    const r = mb();
    expect(r.status).toBe('computed');
    expect(r.main_footprint_sqm).toBeCloseTo(160, 9);
  });

  it('items 2-9: flat form (a) 457.6, pitched form (b) 478.08 via the front/rear pair, headline pitched, alternate disclosed', () => {
    const r = mb();
    expect(r.wall_storeys).toBe(2);
    expect(r.gfa_flat_sqm).toBeCloseTo(457.6, 9); // 2 x 160 + (160 - 2 x 1.4 x 8)
    expect(r.storeys_flat).toBe(3);
    expect(r.gfa_pitched_sqm).toBeCloseTo(478.08, 9); // 320 + attic 158.08
    expect(r.storeys_pitched).toBe(3);
    expect(r.main_wall_pair).toBe('front_rear');
    expect(r.main_wall_pair_share_pct).toBe(50);
    expect(r.roof_form_headline).toBe('pitched_attic');
    expect(r.main_gfa_sqm).toBeCloseTo(478.08, 9);
    expect(r.disclosures).toContain('roof_form_alternate');
    expect(r.disclosure_params.roof_form_alternate.X).toBeCloseTo(457.6, 9);
    expect(r.binding_constraint).toBe('setback');
  });

  it('a failing attic is livable but outside GFA (M-203) and the flat form then heads', () => {
    const r = mb(rows('detached_house', { attic_qualifying_share_pct: num('detached_house', 'attic_qualifying_share_pct', 95) }));
    expect(r.roof_form_headline).toBe('flat_setback');
    expect(r.attic_outside_gfa_sqm).toBeCloseTo(158.08, 9); // the larger pair
    expect(r.gfa_pitched_sqm).toBeCloseTo(320, 9);
    expect(r.disclosures).toContain('attic_outside_gfa');
    expect(r.main_gfa_sqm).toBeCloseTo(457.6, 9);
  });

  it('item 8: FSI caps the GFA only where fsi applies, and FSI is then the binding constraint', () => {
    const r = mb(rows('detached_house', { fsi: num('detached_house', 'fsi', 0.8) }));
    expect(r.main_gfa_sqm).toBeCloseTo(240, 9); // 0.8 x 300
    expect(r.binding_constraint).toBe('fsi');
    const na_ = mb(rows('detached_houseplex', { fsi: na('detached_houseplex', 'fsi') }), LOT, CONFIG, null, 'detached_houseplex');
    expect(na_.main_gfa_sqm).toBeCloseTo(478.08, 9);
  });

  it('item 1: the coverage cap shortens the plate and binds', () => {
    const r = mb(rows('detached_house', { lot_coverage_pct: num('detached_house', 'lot_coverage_pct', 30) }));
    expect(r.main_footprint_sqm).toBeCloseTo(90, 9); // 30 % x 300
    expect(r.binding_constraint).toBe('coverage');
  });

  it('item 1: the depth cap binds; the buffered polygon binds', () => {
    const d = mb(rows('detached_house', { building_depth_m: num('detached_house', 'building_depth_m', 14) }));
    expect(d.main_footprint_sqm).toBeCloseTo(8 * 14, 9);
    expect(d.binding_constraint).toBe('depth');
    const b = mb(rows(), { ...LOT, bufferedAreaSqm: 100 });
    expect(b.main_footprint_sqm).toBeCloseTo(100, 9);
    expect(b.binding_constraint).toBe('lot_dimension');
  });

  it('item 1: a dimension under min_dimension_m is not_buildable, citing the setback units that made the box', () => {
    const r = mb(rows(), { ...LOT, frontageM: 4 });
    expect(r.status).toBe('not_buildable:front_setback_m#u,rear_setback_m#u,side_setback_m#u');
  });

  it('item 2: a not_applicable main-wall limit gives Hw = H (RT, M-186); no step-back storey above Hw', () => {
    const r = mb(rows('detached_house', { main_wall_height_m: na('detached_house', 'main_wall_height_m') }));
    expect(r.main_wall_limit_m).toBe(10);
    expect(r.main_wall_pair).toBe('none');
    expect(r.wall_storeys).toBe(3);
    expect(r.gfa_flat_sqm).toBeCloseTo(480, 9);
  });

  it('item 7: the storey cap applies (height_storeys) and binds', () => {
    const r = mb(rows('detached_house', { height_storeys: num('detached_house', 'height_storeys', 2) }));
    expect(r.storeys_flat).toBe(2);
    expect(r.gfa_flat_sqm).toBeCloseTo(320, 9);
    expect(r.storeys_pitched).toBe(2); // the attic would be a third storey
    expect(r.main_gfa_sqm).toBeCloseTo(320, 9);
    expect(r.binding_constraint).toBe('storeys');
  });

  it('item 4: the first-floor elevation lowers the wall storeys (spec example: H 12, Hw 9.5 -> 3 at 0, 2 at 1.0 m)', () => {
    const over = { height_m: num('detached_house', 'height_m', 12), main_wall_height_m: num('detached_house', 'main_wall_height_m', 9.5) };
    expect(mb(rows('detached_house', over), LOT, { ...CONFIG, firstFloorElevationM: 0 }).wall_storeys).toBe(3);
    expect(mb(rows('detached_house', over), LOT, { ...CONFIG, firstFloorElevationM: 1 }).wall_storeys).toBe(2);
  });

  it('item 6: the roof-slope cap (R 5:3) lowers the pitch used', () => {
    const r = mb(rows('detached_house', { roof_slope_max: num('detached_house', 'roof_slope_max', 0.5) }));
    expect(r.roof_pitch).toBe(0.5);
  });

  it('item 8: a counted attic where FSI binds gains the mechanical area outside GFA (M-229, via renovation-shared)', () => {
    const r = mb(rows('detached_house', { fsi: num('detached_house', 'fsi', 1.4) }), LOT, CONFIG, { mechanical: { share: 0.05, max_sqm: 20 } });
    // fsi cap 420; gross pitched 478.08; attic 158.08 counted; limit min(0.05 x 420, 20) = 20; floor = min(478.08, 440) = 440; gfa = 420
    expect(r.roof_form_headline).toBe('flat_setback'); // both forms hit the FSI cap: a tie goes to (a); the 20 m2 is built outside GFA
    expect(r.attic_outside_gfa_sqm).toBeCloseTo(20, 9);
    expect(r.gfa_pitched_sqm).toBeCloseTo(420, 9);
    expect(r.disclosures).toContain('mechanical_attic_excluded');
  });

  it('a not_evaluated Layer 2 input propagates its reason as the whole result', () => {
    expect(mb(rows('detached_house', { height_m: ne('detached_house', 'height_m', 'missing_input') })).status).toBe('not_evaluated:missing_input');
    expect(mb(rows('detached_house', { fsi: ne('detached_house', 'fsi', 'exception_not_authored:EX1') })).status).toBe('not_evaluated:exception_not_authored:EX1');
  });

  it('a required target that is not a number is not usable, never defaulted', () => {
    expect(mb(rows('detached_house', { height_m: unl('detached_house', 'height_m') })).status).toBe('not_evaluated:target_not_keyed:height_m');
  });

  it('a missing lot or config input throws', () => {
    expect(() => mb(rows(), { ...LOT, areaSqm: undefined })).toThrow(/never defaulted/);
    expect(() => mb(rows(), LOT, { ...CONFIG, roofPitch: undefined })).toThrow(/config\.roofPitch/);
  });

  it('a front-setback override (the scenario step\'s own averaging) replaces the Layer 2 value; a party wall zeroes one side', () => {
    const r = mb(rows(), { ...LOT, frontSetbackM: 6, partyWall: true });
    expect(r.main_front_setback_m).toBe(6);
    expect(r.main_side_setbacks_m).toEqual([0, 1]);
    expect(r.main_footprint_sqm).toBeCloseTo(9 * 19, 9);
  });

  it('is deterministic and does not mutate its inputs (re-entrant)', () => {
    const input = rows();
    const before = JSON.stringify(input);
    const a = mb(input);
    const b = mb(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('OWED sub-items are named, not silently dropped', () => {
    expect(req(MAIN).OWED).toEqual(expect.arrayContaining(['front_averaging', 'lane_centreline', 'triangular_lot', 'deep_side_yard']));
  });
});

// ---- houseplex units (P5.4) ---------------------------------------------------------------------------------------------
describe('P3-2: houseplex units (P5.4)', () => {
  const MAINR = { status: 'computed', main_footprint_sqm: 100, main_storeys: 3 };
  const CFG = { basementLivableShare: 1, circulationShare: 0.1, unitMinInteriorSqm: 30 };
  const CAPS = { semi: 4, detached: 4, detached_600_60: 6, minUnits: 2, lift: 6 };
  const LOTU = { semi: false, in600_60: false, zoneFamily: 'RD' };
  const hu = (over: Json = {}, o: Json = {}): Json => {
    const cls = o.cls || 'detached_houseplex';
    return req(UNITS).houseplexUnits({
      view: mkView(rows(cls, over)), cls, main: o.main || MAINR, config: o.config || CFG, caps: CAPS, lot: o.lot || LOTU,
    });
  };

  it('count = min(u cap, houseplex cap, floors); no u = no u cap; floors include the basement', () => {
    const r = hu();
    expect(r.status).toBe('computed');
    expect(r.dwelling_units).toBe(4);
    expect(r.unit_breakdown).toEqual([
      { floor: 3, interior_area_sqm: 90, in_gfa: true },
      { floor: 2, interior_area_sqm: 90, in_gfa: true },
      { floor: 1, interior_area_sqm: 90, in_gfa: true },
      { floor: 0, interior_area_sqm: 90, in_gfa: false },
    ]);
    expect(r.avg_unit_gfa_sqm).toBeCloseTo(90, 9);
  });

  it('M-202: a u of 3 caps at 3 (RD in 600.60 is not lifted); R in 600.60 lifts u 3 to 6; a semi is always capped at 4', () => {
    const u3 = { dwelling_units_max: num('detached_houseplex', 'dwelling_units_max', 3) };
    const tall = { ...MAINR, main_storeys: 5 };
    expect(hu(u3, { lot: { semi: false, in600_60: true, zoneFamily: 'RD' }, main: tall }).dwelling_units).toBe(3);
    expect(hu(u3, { lot: { semi: false, in600_60: true, zoneFamily: 'R' }, main: tall }).dwelling_units).toBe(6);
    expect(hu({}, { cls: 'semi_detached_houseplex', lot: { semi: true, in600_60: true, zoneFamily: 'R' }, main: tall }).dwelling_units).toBe(4);
  });

  it('floors cap the count (3 floors, no basement -> 3)', () => {
    expect(hu({}, { config: { ...CFG, basementLivableShare: 0 } }).dwelling_units).toBe(3);
  });

  it('a unit under unit_min_interior_sqm drops the count and the drop is disclosed (unit_count_reduced)', () => {
    const r = hu({}, { config: { ...CFG, unitMinInteriorSqm: 100 } });
    expect(r.dwelling_units).toBe(3); // 360 / 4 = 90 < 100; 360 / 3 = 120
    expect(r.disclosures).toEqual(['unit_count_reduced']);
    expect(r.disclosure_params.unit_count_reduced).toEqual({ n: 3, m: 100 });
  });

  it('fewer than 2 units is not_buildable:800.50(181)', () => {
    expect(hu({}, { config: { ...CFG, unitMinInteriorSqm: 200 } }).status).toBe('not_buildable:800.50(181)');
    expect(hu({}, { main: { ...MAINR, main_storeys: 1 }, config: { ...CFG, basementLivableShare: 0 } }).status).toBe('not_buildable:800.50(181)');
  });

  it('a not_evaluated u propagates; a main building that is not computed passes through', () => {
    expect(hu({ dwelling_units_max: ne('detached_houseplex', 'dwelling_units_max', 'missing_input') }).status).toBe('not_evaluated:missing_input');
    expect(hu({}, { main: { status: 'not_buildable:x' } }).status).toBe('not_buildable:x');
  });

  it('a missing caps or config input throws', () => {
    expect(() => req(UNITS).houseplexUnits({ view: mkView(rows('detached_houseplex')), cls: 'detached_houseplex', main: MAINR, config: { ...CFG, circulationShare: undefined }, caps: CAPS, lot: LOTU })).toThrow(/config\.circulationShare/);
    expect(() => req(UNITS).houseplexUnits({ view: mkView(rows('detached_houseplex')), cls: 'detached_houseplex', main: MAINR, config: CFG, caps: { ...CAPS, semi: undefined }, lot: LOTU })).toThrow(/caps\.semi/);
  });
});

describe('P3-2: purity (Spec 132 core.9)', () => {
  it('the four modules touch no database, file, env, clock or randomness', () => {
    for (const rel of [VIEW, STATUS, MAIN, UNITS]) {
      const s = src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(s, rel).not.toMatch(/process\.env|Date\.now|new Date|Math\.random|require\('(fs|node:fs|pg|child_process|node:crypto)'\)/);
    }
  });
});
