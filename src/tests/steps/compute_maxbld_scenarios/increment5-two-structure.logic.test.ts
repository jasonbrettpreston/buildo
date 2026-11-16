// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377, M-403, M-415 (dated notes 2026-11-12/13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
// MB-27 increment 5 Part B · lane B5B-2 piece 1 · the two-structure read (plan L3-2) · RED FIRST (the parent has no add-on type,
// no suite_read declaration and no two-structure module). Rulings: BUILD-PLAN C2 "Two-structure read (L3-2)" (building types: three
// add-on types, one per row, item 11 (b), structure garden_suite with the principal of the same class); WALK2 item 11 (b).
// Oracle: the Layer 2 cells the golden 25 store for the garden_suite structure (B5A's C2a seeds through the pure core), read
// back through the module, and a row that reads both structures under the declared prefix.
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, seeds, type Json } from './golden25-harness';

const req = createRequire(path.join(ROOT, 'package.json'));
const TWO = 'scripts/lib/compute/maxbld/two-structure.js';
const CLASSES = ['detached_house', 'detached_houseplex', 'house_with_secondary_suite'];
const ADDON: Record<string, string> = { detached_house: 'detached_house_garden_suite', detached_houseplex: 'detached_houseplex_garden_suite', house_with_secondary_suite: 'house_with_secondary_suite_garden_suite' };

let T: Json;
let S: Json;
let LOTS: { cells: Json[]; options: Json[]; parcel: Json }[];
let VOCAB: Json;

beforeAll(() => {
  T = req(path.join(ROOT, TWO)) as Json;
  S = seeds();
  VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = readJson('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[];
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  LOTS = out.rows.lots.map((lot: Json) => ({
    cells: lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option),
    options: lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }),
    parcel: parcels.find((p) => p.id === lot.parcel_id) as Json,
  }));
});

const bt = (id: string | undefined) => (S.buildingTypes.rows as Json[]).find((b) => b.id === id) as Json;
const read = (lot: Json, cls: string) => T.decodeAddon(lot.cells, lot.options, bt(ADDON[cls]), { buildingTypes: S.buildingTypes, designOptions: VOCAB.design_options, notAbove: (req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json).withNotAbove });

describe('the add-on building types (BUILD-PLAN C2: three add-on types, one per row, item 11 (b))', () => {
  it('building-types.json declares one add-on type per row, naming its principal type and the class', () => {
    for (const cls of CLASSES) {
      const a = bt(ADDON[cls]);
      expect(a, ADDON[cls]).toBeTruthy();
      expect(a.addon_of).toBe(cls);
      expect(a.class).toBe(cls);
      expect(a.structure).toBe('garden_suite');
      expect(a.switch).toBe(`building_type:${ADDON[cls]}`);
      expect((S.switchboard.rows as Json[]).some((r) => r.id === a.switch && r.kind === 'building_type')).toBe(true);
    }
  });
  it('declares the one suite prefix once (suite_read)', () => {
    expect(S.buildingTypes.suite_read).toMatchObject({ structure: 'garden_suite', prefix: 'suite_' });
  });
});

describe('the two-structure read decodes the principal cells beside the garden_suite cells', () => {
  it('reads the 25 lots x 3 classes: the principal cells keep their names, every suite cell is read under the prefix, nothing is lost or malformed', () => {
    let n = 0;
    for (const lot of LOTS) {
      for (const cls of CLASSES) {
        const two = read(lot, cls);
        const house = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')).decodeCells(lot.cells, cls, 'principal').cells as Json;
        const suite = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')).decodeCells(lot.cells, cls, 'garden_suite').cells as Json;
        for (const [t, c] of Object.entries(house)) expect(two.l2[t], `${cls} ${t}`).toEqual(c);
        for (const [t, c] of Object.entries(suite)) expect(two.l2[`suite_${t}`], `${cls} suite_${t}`).toEqual(c);
        expect(Object.keys(two.l2).length).toBe(Object.keys(house).length + Object.keys(suite).length);
        expect(two.malformed).toBe(0);
        n += 1;
      }
    }
    expect(n).toBe(75);
  });
  it('the suite option runs carry the prefixed suite cells; the roof runs keep the principal cells (A0578: 4.0 / 4.0 / 60 and 6.3 / 7.5 / 120)', () => {
    const a0578 = LOTS.find((l) => read(l, 'detached_house').l2.suite_side_setback_m?.value === 0.94) as Json;
    expect(a0578).toBeTruthy();
    const two = read(a0578, 'detached_house');
    const low = two.l2Options.runs.suite_low;
    const tall = two.l2Options.runs.suite_tall;
    expect([low.suite_height_m.value, low.suite_separation_m.value, low.suite_gfa_m2.value]).toEqual([4, 4, 60]);
    expect([tall.suite_height_m.value, tall.suite_separation_m.value, tall.suite_gfa_m2.value]).toEqual([6.3, 7.5, 120]);
    expect(Object.keys(two.l2Options.runs.flat_or_shallow_roof).every((k) => !k.startsWith('suite_'))).toBe(true);
    expect(low.height_m).toBeUndefined();
  });
  it('refuses to read a type that is not an add-on, and a seed without the declaration', () => {
    expect(() => T.decodeAddon([], [], bt('detached_house'), { buildingTypes: S.buildingTypes, designOptions: VOCAB.design_options, notAbove: () => [] })).toThrow(/not an add-on/);
    expect(() => T.decodeAddon([], [], bt(ADDON.detached_house), { buildingTypes: { rows: S.buildingTypes.rows }, designOptions: VOCAB.design_options, notAbove: () => [] })).toThrow(/suite_read/);
  });
});

describe('an option value belongs to one structure', () => {
  it('throws when the same option value has cells in both structures', () => {
    const rows = [
      { class: 'detached_house', structure: 'principal', target: 'height_m', option: 'suite_low', status: 'applies', value_kind: 'number', value: 5, reason: null, winner_unit_id: 'x' },
      { class: 'detached_house', structure: 'garden_suite', target: 'height_m', option: 'suite_low', status: 'applies', value_kind: 'number', value: 4, reason: null, winner_unit_id: 'y' },
    ];
    expect(() => T.decodeAddon(rows, rows, bt(ADDON.detached_house), { buildingTypes: S.buildingTypes, designOptions: VOCAB.design_options, notAbove: () => [] })).toThrow(/both structures/);
  });
});

describe('a row reads the two structures under their names (rows.js units of the prefixed names)', () => {
  it('l2(rear_setback_m) is the house, l2(suite_rear_setback_m) is the suite, and the suite option run overlays the suite cell', () => {
    const rows = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const lot = LOTS.find((l) => read(l, 'detached_house').l2.rear_setback_m?.value === 8.5325) as Json; // A0578's house rear
    expect(lot).toBeTruthy();
    const two = read(lot, 'detached_house');
    const probe = { id: 'probe_two_structure', building_type: [ADDON.detached_house], increment: '5', form: 'expr', unit: 'm', envelope: false, expression: 'l2(rear_setback_m) − l2(suite_rear_setback_m)', switch: 'formula:probe_two_structure' };
    const s2: Json = { ...S, catalogue: { ...S.catalogue, rows: [...S.catalogue.rows, probe] }, switchboard: { ...S.switchboard, rows: [...S.switchboard.rows, { id: probe.switch, kind: 'formula', state: 'on' }] } };
    const out = rows.runRowIn('probe_two_structure', 'base', { seeds: s2, buildingType: ADDON.detached_house, l2: two.l2, l2Options: two.l2Options, perm: { code: 0, gate: null }, geometry: {}, flags: {}, neighbours: { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: 1, bt_units_floor: 1 } });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(8.5325 - 1.5, 6);
    const tall = rows.runRowIn('probe_two_structure', 'suite_tall', { seeds: s2, buildingType: ADDON.detached_house, l2: two.l2, l2Options: two.l2Options, perm: { code: 0, gate: null }, geometry: {}, flags: {}, neighbours: { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: 1, bt_units_floor: 1 } });
    expect(tall.status).toBe('computed');
    expect(tall.value).toBeCloseTo(8.5325 - 1.5, 6);
  });
});

describe('no cell or unit is silently overwritten (DeepSeek review B5B-2a, CRITICAL/HIGH, folded)', () => {
  const opts = () => ({ buildingTypes: S.buildingTypes, designOptions: VOCAB.design_options, notAbove: () => [] });
  const cell = (structure: string, target: string, value: number) => ({ class: 'detached_house', structure, target, option: null, status: 'applies', value_kind: 'number', value, reason: null, winner_unit_id: 'x' });
  it('throws when a principal target is already named like a prefixed suite target', () => {
    const rows = [cell('principal', 'suite_height_m', 5), cell('garden_suite', 'height_m', 4)];
    expect(() => T.decodeAddon(rows, [], bt(ADDON.detached_house), opts())).toThrow(/collision on suite_height_m/);
  });
  it('throws when a prefixed name collides with a layer 2 target in the unit map', () => {
    expect(() => T.suiteTargetUnits(S.buildingTypes, { height_m: { unit: 'm' }, suite_height_m: { unit: 'm2' } })).toThrow(/collides/);
  });
  it('the real vocabulary has no such collision', () => {
    expect(() => T.suiteTargetUnits(S.buildingTypes, VOCAB.dsl_target)).not.toThrow();
  });
});

describe('a suite name on a type that has no suite structure never yields a number (review HIGH, fail-open probe)', () => {
  it('a row reading l2(suite_rear_setback_m) on detached_house, whose l2 has no suite cells, is not computed', () => {
    const rows = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const lot = LOTS[0] as Json;
    const house = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')).decodeCells(lot.cells, 'detached_house', 'principal').cells as Json;
    const probe = { id: 'probe_no_suite', building_type: ['detached_house'], increment: '5', form: 'expr', unit: 'm', envelope: false, expression: 'l2(suite_rear_setback_m)', switch: 'formula:probe_no_suite' };
    const s2: Json = { ...S, catalogue: { ...S.catalogue, rows: [...S.catalogue.rows, probe] }, switchboard: { ...S.switchboard, rows: [...S.switchboard.rows, { id: probe.switch, kind: 'formula', state: 'on' }] } };
    const out = rows.runRowIn('probe_no_suite', 'base', { seeds: s2, buildingType: 'detached_house', l2: house, l2Options: { runs: {}, shared: {}, flags: {}, malformed: 0 }, perm: { code: 0, gate: null }, geometry: {}, flags: {}, neighbours: { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: 1, bt_units_floor: 1 } });
    expect(out.status).not.toBe('computed');
  });
});
