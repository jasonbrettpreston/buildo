// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-198(1), M-403, M-415, M-451 (dated notes 2026-11-12/13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.13
//
// MB-27 increment 5 Part B · lane B5B-5 · P2 (a): the through-lot rear (150.7.60.20(3)(A)/(B)). RED FIRST (captured on the tree
// without the change: docs/reports/red-evidence/bylaw/inc5-through-lot-red.txt). The stored (3)(A) cell is not_evaluated
// (missing_input:abutting_front_setback_m); Layer 2 stores the 1.5 m floor as its own cell (rear_setback_through_floor_m, migration 321);
// Layer 3 reads the through-lot flag and takes max(the lot's own front setback; that Layer 2 floor). No law number in Layer 3 (R3-02).
// Oracle: McProof key v2.1 A0464 (rear 2.01 on every option cell). The loader's flag source is the hashed step (parcels.is_through_lot,
// already selected by the parcel read): its pass-through is locked here through materializeParcels.
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, seeds, goldenLotsWithEnv, type Json } from './golden25-harness';

const req = createRequire(path.join(ROOT, 'package.json'));
const ADDON: Record<string, string> = { detached_house: 'detached_house_garden_suite', detached_houseplex: 'detached_houseplex_garden_suite', house_with_secondary_suite: 'house_with_secondary_suite_garden_suite' };
const FLOOR = 'suite_rear_setback_through_floor_m';
let S: Json;
let KEY: Json[];
let LOTS: Map<string, Json>;
let CELLS: Map<string, { cells: Json[]; options: Json[] }>;
let T: Json;
let MZ: Json;
let ROWS: Json;

beforeAll(() => {
  S = seeds();
  KEY = readJson('src/tests/fixtures/layer3/golden-25/addon-key-v2.1-suite.json') as unknown as Json[];
  LOTS = goldenLotsWithEnv().lots;
  MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  T = req(path.join(ROOT, 'scripts/lib/compute/maxbld/two-structure.js')) as Json;
  ROWS = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = readJson('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[];
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  CELLS = new Map();
  for (const lot of out.rows.lots as Json[]) {
    CELLS.set(String(lot.parcel_id), {
      cells: lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option),
      options: lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }),
    });
  }
});

function inputsFor(caseId: string, cls: string, rows: Json, flags: Json | null = null): Json {
  const lot = LOTS.get(caseId.split('_')[0] as string) as Json;
  const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[]; options: Json[] };
  const bt = (S.buildingTypes.rows as Json[]).find((b) => b.id === ADDON[cls]) as Json;
  const two = T.decodeAddon(raw.cells, raw.options, bt, { buildingTypes: S.buildingTypes, designOptions: readJson('scripts/seeds/bylaw/vocab.json').design_options, notAbove: MZ.withNotAbove });
  const line = lot.line as Json;
  const p = line.parcel || {};
  const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  return {
    seeds: S, buildingType: bt.id, l2: two.l2, l2Options: two.l2Options, perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: p.frontage, lot_depth_m: p.depth, lot_area_m2: p.area }, flags: flags || { corner_lot: p.corner, through_lot: p.through },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: bt.units, bt_units_floor: bt.units_floor }, rows,
  };
}

describe('P2 (a): the declared pieces', () => {
  it('the catalogue declares the through_lot lot flag (source parcels.is_through_lot) and the row addon_suite_rear_m on exactly the add-on types, with its switch', () => {
    const cat = S.catalogue as Json;
    const f = (cat.lot_flags as Json[]).find((x) => x.id === 'through_lot') as Json;
    expect(f, 'lot flag through_lot').toBeTruthy();
    expect(f.source).toBe('parcels.is_through_lot');
    const r = (cat.rows as Json[]).find((x) => x.id === 'addon_suite_rear_m') as Json;
    expect(r, 'row addon_suite_rear_m').toBeTruthy();
    expect(r.building_type).toEqual(Object.values(ADDON));
    expect(r.expression).toContain('holds(through_lot)');
    expect(r.expression).toContain(`l2(${FLOOR})`);
    expect(r.expression).not.toMatch(/\b1\.5\b/); // R3-02: the 1.5 m is Layer 2's, never typed here
    expect((S.switchboard.rows as Json[]).some((x) => x.id === r.switch && x.kind === 'formula')).toBe(true);
  });
  it('every row that read the stored suite rear now reads addon_suite_rear_m', () => {
    const readers = (S.catalogue.rows as Json[]).filter((r) => /l2\(suite_rear_setback_m\)/.test(r.expression || ''));
    expect(readers.map((r) => r.id)).toEqual(['addon_suite_rear_m']);
  });
});

describe('P2 (a): the through-lot rear is max(own front setback, the Layer 2 floor)', () => {
  it('A0464 (a through lot): addon_suite_rear_m equals the key rear (2.01) on every option cell of the three types', () => {
    let n = 0;
    for (const k of KEY.filter((x) => String(x.case).startsWith('A0464'))) {
      for (const [name, c] of Object.entries(k.options as Record<string, Json>)) {
        const r = ROWS.runRowIn('addon_suite_rear_m', `suite_${c.arm}`, inputsFor(k.case, k.type, {})) as Json;
        expect(r.status, `${k.type} ${name}`).toBe('computed');
        expect(Math.abs(r.value - c.rear), `${k.type} ${name}: engine ${r.value} key ${c.rear}`).toBeLessThan(0.02);
        n += 1;
      }
    }
    expect(n).toBe(12);
  });
  it('A0464: the suite GFA now reproduces the key on every option cell (it refused on the stored cell before)', () => {
    let n = 0;
    for (const k of KEY.filter((x) => String(x.case).startsWith('A0464'))) {
      for (const [name, c] of Object.entries(k.options as Record<string, Json>)) {
        const inj = { addon_main_depth_m: { value: c.d }, addon_main_footprint_m2: { value: c.mainF }, addon_main_gfa_m2: { value: c.main } };
        const r = ROWS.runRowIn(`addon_suite_gfa_${c.path.toLowerCase()}_m2`, `suite_${c.arm}`, inputsFor(k.case, k.type, inj)) as Json;
        if (r.status === 'not_evaluated' && r.reason === 'below_livable_minimum' && Math.abs(c.suite - 25) < 0.02) continue;
        expect(r.status, `${k.type} ${name}`).toBe('computed');
        expect(Math.abs(r.value - c.suite), `${k.type} ${name}: engine ${r.value} key ${c.suite}`).toBeLessThan(0.02);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(8);
  });
  it('a lot that is not a through lot keeps its stored rear cell (A0094: the stored value, no floor)', () => {
    const k = KEY.find((x) => String(x.case).startsWith('A0094') && x.type === 'detached_house') as Json;
    for (const [name, c] of Object.entries(k.options as Record<string, Json>)) {
      const r = ROWS.runRowIn('addon_suite_rear_m', `suite_${c.arm}`, inputsFor(k.case, k.type, {})) as Json;
      expect(r.status, name).toBe('computed');
      expect(Math.abs(r.value - c.rear), name).toBeLessThan(0.02);
    }
  });
  it('synthetic: on a through lot the floor wins when the own front setback is under it, the front wins when over it', () => {
    const lowFront = ROWS.runRowIn('addon_suite_rear_m', 'suite_low', inputsFor('A0464_26TEY', 'detached_house', { front_setback_used_m: { value: 1.0 } })) as Json;
    expect([lowFront.status, lowFront.value]).toEqual(['computed', 1.5]);
    const highFront = ROWS.runRowIn('addon_suite_rear_m', 'suite_low', inputsFor('A0464_26TEY', 'detached_house', { front_setback_used_m: { value: 6.2 } })) as Json;
    expect([highFront.status, highFront.value]).toEqual(['computed', 6.2]);
  });
  it('synthetic: with the flag false the stored rear cell is read as before, so A0464 as a non-through lot refuses (fail closed, no floor invented)', () => {
    const r = ROWS.runRowIn('addon_suite_rear_m', 'suite_low', inputsFor('A0464_26TEY', 'detached_house', {}, { corner_lot: false, through_lot: false })) as Json;
    expect(r.status).toBe('not_evaluated');
    expect(r.reason).toBe('missing_input:abutting_front_setback_m');
  });
});

describe('P2 (a): the step passes the through-lot flag (the hashed loader edit)', () => {
  it('materializeParcels on A0464 with the parcel geometry flag carries the through lot into the add-on rear row; without it the row refuses', () => {
    const S2 = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    const lot = LOTS.get('A0464') as Json;
    const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[]; options: Json[] };
    const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
    const p = (lot.line as Json).parcel;
    const run = (through: boolean): Json[] => {
      const lookups = { seeds: S, vocab: readJson('scripts/seeds/bylaw/vocab.json'), layer2Classes: SCOPE.classes, permissionKeys: { 0: 'permitted', 1: 'prohibited', 2: 'not_evaluated' }, texts: {} };
      const src = { parcel_id: lot.parcel_id, cells: raw.cells, options: raw.options, lot: lot.source.lot, geometry: { frontage_m: p.frontage, depth_m: p.depth, lot_size_sqm: p.area, is_corner_lot: p.corner, is_through_lot: through } };
      return S2.materializeParcels([src], lookups).rows.e1 as Json[];
    };
    const find = (rows: Json[]): Json => rows.find((r) => r.building_type === ADDON.detached_house && r.field_id === 'addon_suite_rear_m') as Json;
    expect(find(run(true)).status).toBe('computed');
    expect(find(run(true)).value).toBeGreaterThanOrEqual(1.5); // this source carries no abutters, so the own front is the default; the key figure is locked above
    expect(find(run(false)).status).toBe('not_evaluated');
  });
});
