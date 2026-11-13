// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-460, M-404, M-405, M-425, M-481, M-385, M-61, M-377;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 (the fitted fields)
//
// MB-27 increment 5 · McBylaws queue · lane B5B-1 (C2b, the fitted rows on the row alone) · RED FIRST (the parent has no fitted rows).
// Rulings: FIT-a; FD-1 (a) .. FD-6 (a) with conditions C1-C21 (~/Buildo-scratch/mcbylaws/inc5/fitted/CONDITIONS-FD1-6.md); AR-7 (b)
// (~/Buildo-scratch/mcbylaws/inc5/ADDON-ALL-ROWS.md: one fitted rule on every row, houseplex units recomputed on the fitted footprint).
// Oracle: the approved McProof key v2.1 (operator "approve the key", WALK2 item 13), copied into
// src/tests/fixtures/layer3/increment-5/fitted-alone.json (its $comment names the source of each line).
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { goldenLots, parcelInput, seeds, META, req, ROOT, readJson, type Json } from './golden25-harness';

const FIX = readJson('src/tests/fixtures/layer3/increment-5/fitted-alone.json');
const FITTED = ['storeys_fit', 'footprint_fit_m2', 'depth_fit_m', 'upper_storey_depth_fit_m', 'height_fit_m'];
const TOL: Record<string, number> = { storeys_fit: 0, footprint_fit_m2: 0.01, depth_fit_m: 0.01, upper_storey_depth_fit_m: 0.01, height_fit_m: 0.001, units_fit: 0 };

let S: Json;
let LOTS: Map<string, Json>;
const bt = (s: Json, id: string) => (s.buildingTypes.rows as Json[]).find((b) => b.id === id) as Json;
function rowsOf(lot: string, type: string, edit?: (input: Json) => void, s: Json = seeds()): Json {
  const input = parcelInput(LOTS.get(lot) as Json, bt(s, type));
  if (edit) edit(input);
  return Object.fromEntries((S.buildParcelRows(input, s, META) as Json[]).map((r) => [r.field_id, r])) as Json;
}

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  LOTS = goldenLots();
});

describe('FD-1 (a) / AR-7 (b): the fitted rows on the golden 25 x 3 rows equal the McProof key v2.1 (row alone)', () => {
  const cases = (FIX.rows as Json[]).map((r) => [`${r.lot} ${r.type}`, r] as [string, Json]);
  it.each(cases)('%s', (_name, want) => {
    const rows = rowsOf(want.lot, want.type);
    if (want.status !== 'computed') {
      for (const f of FITTED) expect([f, rows[f].status]).toEqual([f, 'not_evaluated']);
      return;
    }
    const fields = want.type === 'detached_houseplex' ? [...FITTED, 'units_fit'] : FITTED;
    for (const f of fields) {
      const r = rows[f] as Json;
      expect([want.lot, f, r.status]).toEqual([want.lot, f, 'computed']);
      expect([want.lot, f, Math.abs((r.value as number) - (want[f] as number)) <= TOL[f]! + 1e-9]).toEqual([want.lot, f, true]);
    }
    // C3 (M-460): one width, front_rear_wall_width_m, for the depth and the set-back loss
    expect(Math.abs((rows.front_rear_wall_width_m.value as number) - want.width_m)).toBeLessThan(0.01);
  });
});

describe('worked examples (BUILD-PLAN golden-25 and worked examples, red first)', () => {
  it('A0175 detached house: 2 storeys of 76.63 m2, 5.81 x 13.19 m, 5.536 m high (the card)', () => {
    const r = rowsOf('A0175', 'detached_house');
    expect(r.storeys_fit.value).toBe(2);
    expect(r.footprint_fit_m2.value).toBeCloseTo(76.63, 2);
    expect(r.front_rear_wall_width_m.value).toBeCloseTo(5.81, 2);
    expect(r.depth_fit_m.value).toBeCloseTo(13.19, 2);
    expect(r.height_fit_m.value).toBeCloseTo(5.536, 3);
    expect(r.upper_storey_depth_fit_m.value).toBeCloseTo(r.depth_fit_m.value as number, 9);
  });
  it('A0561 detached house: 4 storeys of 52.33 m2, the 4th set back (11.86 m deep), never 4 x 49.83 (the set-back storey, FD-1 a)', () => {
    const r = rowsOf('A0561', 'detached_house');
    expect(r.storeys_fit.value).toBe(4);
    expect(r.footprint_fit_m2.value).toBeCloseTo(52.33, 2);
    expect(r.depth_fit_m.value).toBeCloseTo(14.66, 2);
    expect(r.upper_storey_depth_fit_m.value).toBeCloseTo(11.86, 2);
    expect(r.height_fit_m.value).toBeCloseTo(10.56, 3);
    // the fitted stack holds exactly the flat GFA: 3 full plates + 1 set-back plate (M-176(1): the GFA stays the maximum)
    const loss = (r.footprint_max_m2.value as number) - (r.setback_plate_m2.value as number);
    expect(3 * (r.footprint_fit_m2.value as number) + ((r.footprint_fit_m2.value as number) - loss)).toBeCloseTo(r.gfa_flat_m2.value as number, 6);
  });
});

describe('C7 / C4 / C14 / C16: tags, disclosure, flags and confidence', () => {
  const cat = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
  const board = readJson('scripts/seeds/bylaw/switchboard.json');
  const byId = (id: string) => (cat.rows as Json[]).find((r) => r.id === id) as Json;
  it('every fitted row is on the flat card only (design_option flat_or_shallow_roof) and reads gfa_flat_m2, never the cross-form headline', () => {
    for (const id of [...FITTED, 'units_fit']) {
      expect([id, byId(id).design_option]).toEqual([id, { roof_form: 'flat_or_shallow_roof' }]);
      expect(byId(id).expression).not.toMatch(/\bgfa_max_m2\b/);
    }
    expect(byId('storeys_fit').expression).toMatch(/\bgfa_flat_m2\b/);
  });
  it('C6: no fitted row feeds units_flat or unit_count; units_fit is the houseplex row only', () => {
    for (const id of ['units_flat', 'unit_count', 'units_pitched_a', 'units_pitched_b', 'unit_area_m2']) {
      for (const f of [...FITTED, 'units_fit']) expect([id, f, new RegExp(`\\b${f}\\b`).test(byId(id).expression)]).toEqual([id, f, false]);
    }
    expect(byId('units_fit').building_type).toEqual(['detached_houseplex']);
  });
  it('C4: the shape-is-our-choice word rides every fitted row, cited to 800.50(820)', () => {
    expect(cat.flag_words).toContain('fitted_shape_chosen');
    const r = rowsOf('A0175', 'detached_house');
    for (const f of FITTED) {
      expect([f, (r[f].flags as string[]).includes('fitted_shape_chosen')]).toEqual([f, true]);
      expect(byId(f).clauses).toContain('800.50(820)');
    }
  });
  it('C14 / C16: the height carries storeys_from_minimum_ceiling and rests on a reading row of confidence medium', () => {
    const r = rowsOf('A0175', 'detached_house');
    expect(r.height_fit_m.flags).toContain('storeys_from_minimum_ceiling');
    const sw = (board.rows as Json[]).find((x) => x.id === byId('storeys_fit').reading) as Json;
    expect([sw.kind, sw.confidence]).toEqual(['reading', 'medium']);
    // the reading is declared on storeys_fit (its `reading`); every fitted row reads storeys_fit and so rests on it (rows.js readingSwitches)
    for (const f of [...FITTED]) expect([f, (r[f].switches as Json[]).find((x) => x.id === sw.id)]).toMatchObject([f, { state: 'on', confidence: 'medium' }]);
  });
});

describe('C4 / C15 / C6: asserted bounds fail closed (never a clip) and every bound is counted', () => {
  it('C15: a fitted height (5.536 m for 2 storeys) above height_max_m (injected 5 m, the M-415 seam) refuses (fitted_height_above_max); it is never clipped', () => {
    const R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const s = seeds();
    const input = { ...parcelInput(LOTS.get('A0175') as Json, bt(s, 'detached_house')), seeds: s, rows: { height_max_m: { value: 5 } } };
    const h = R.runRow('height_fit_m', input) as Json;
    expect([h.status, h.reason, h.value]).toEqual(['not_evaluated', 'fitted_height_above_max', null]);
  });
  it('validateCatalogue refuses a dead or shadowing audit count: unknown row, core key, both or neither of reason and above, an undeclared reason (panel fold)', () => {
    const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
    const s = seeds();
    expect(C.validateCatalogue(s, ['1', '2', '3', '4', '5'])).toEqual([]);
    s.catalogue.audit_counts.push({ key: 'parcels', row: 'no_such_row', reason: 'no_such_word', above: 3 });
    const errs = C.validateCatalogue(s, ['1', '2', '3', '4', '5']) as string[];
    for (const w of ['core count', 'not a catalogue row', 'exactly one of reason or above', 'not a refuse reason']) expect([w, errs.some((e) => e.includes(w))]).toEqual([w, true]);
  });
});

describe('Q3 (b), operator ruling 2026-11-13 / AR-7 (b): units_fit counts units on the FITTED storeys, not storeys_max', () => {
  const run = (rowsIn: Record<string, number>) => {
    const R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const s = seeds();
    const rows = Object.fromEntries(Object.entries(rowsIn).map(([k, v]) => [k, { value: v }]));
    const input = { ...parcelInput(LOTS.get('A0175') as Json, bt(s, 'detached_houseplex')), seeds: s, rows };
    return R.runRow('units_fit', input) as Json;
  };
  const base = { units_max: 99, wall_storeys: 3, storeys_max: 4, footprint_max_m2: 100, setback_plate_m2: 80, footprint_fit_m2: 100, basement_units: 0 };
  it('fitted storeys below storeys_max give fewer units than the storeys_max count', () => {
    const atMax = run({ ...base, storeys_fit: 4, storeys_above_wall: 1 });
    const fitted = run({ ...base, storeys_fit: 2, storeys_above_wall: 1 });
    expect([atMax.status, fitted.status]).toEqual(['computed', 'computed']);
    expect((fitted.value as number) < (atMax.value as number)).toBe(true);
  });
});
