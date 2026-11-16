// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-403, M-390, M-415 (dated notes 2026-11-13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
//
// MB-27 increment 5 Part B · lane B5B-6 · the last candidate depths of the split, each declared in data (D-65, operator
// 2026-11-12 "Q2 a, Q6a"; D-65 ratified only in that form): (1) a crossing that declares refine_steps (the pitched-B house
// meets its ceiling on a curved row), (2) the four rafter-span edges of the pitched-B half span as row candidates, (3) the
// path (A) house-first allocation for the pitched-B form. Oracle: McProof key v2.1 (fixture addon-key-v2.1-suite.json).
// RED FIRST (docs/reports/red-evidence/bylaw/inc5-split-d65-red.txt). Zero regression over the 270 cells is the split lock
// (increment5-split.logic.test.ts: every cell not refused by the stored cell equals the key within 0.02 m2).
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, seeds, goldenLotsWithEnv, type Json } from './golden25-harness';

const req = createRequire(path.join(ROOT, 'package.json'));
const ADDON: Record<string, string> = { detached_house: 'detached_house_garden_suite', detached_houseplex: 'detached_houseplex_garden_suite', house_with_secondary_suite: 'house_with_secondary_suite_garden_suite' };
let S: Json;
let KEY: Json[];
let LOTS: Map<string, Json>;
let CELLS: Map<string, { cells: Json[]; options: Json[] }>;
beforeAll(() => {
  S = seeds();
  KEY = readJson('src/tests/fixtures/layer3/golden-25/addon-key-v2.1-suite.json') as unknown as Json[];
  LOTS = goldenLotsWithEnv().lots;
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
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

function inputsFor(caseId: string, cls: string, rows: Json = {}): Json {
  const lot = LOTS.get(caseId.split('_')[0] as string) as Json;
  const T = req(path.join(ROOT, 'scripts/lib/compute/maxbld/two-structure.js')) as Json;
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[]; options: Json[] };
  const bt = (S.buildingTypes.rows as Json[]).find((b) => b.id === ADDON[cls]) as Json;
  const two = T.decodeAddon(raw.cells, raw.options, bt, { buildingTypes: S.buildingTypes, designOptions: readJson('scripts/seeds/bylaw/vocab.json').design_options, notAbove: MZ.withNotAbove });
  const line = lot.line as Json;
  const p = line.parcel || {};
  const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  return {
    seeds: S, buildingType: bt.id, l2: two.l2, l2Options: two.l2Options, perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: p.frontage, lot_depth_m: p.depth, lot_area_m2: p.area }, flags: { corner_lot: p.corner, through_lot: p.through },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: bt.units, bt_units_floor: bt.units_floor }, rows,
  };
}


const total = (caseId: string, cls: string, cell: string): number => {
  const split = req(path.join(ROOT, 'scripts/lib/compute/maxbld/split.js')) as Json;
  const r = split.chooseSplit(inputsFor(caseId, cls), S.buildingTypes.split, S) as Json;
  const [arm, p] = cell.split('/');
  return (r.options[`suite_${arm}/${p}`] as Json).total;
};
const keyTotal = (caseId: string, cls: string, cell: string): number => {
  const k = KEY.find((x) => x.case === caseId && x.type === cls) as Json;
  const c = (k.options as Json)[cell];
  return c.main + c.suite;
};

describe('D-65 candidate kinds are declared in data', () => {
  it('names the refined crossing, the four rafter-span rows and the pitched-B allocation, and every row exists', () => {
    const d = S.buildingTypes.split as Json;
    const ids = new Set((S.catalogue.rows as Json[]).map((r) => r.id));
    const crossing = (d.common_candidates as Json[]).find((c) => c.kind === 'crossing' && c.refine_steps !== undefined) as Json;
    expect(Number.isInteger(crossing.refine_steps) && crossing.refine_steps > 0).toBe(true);
    expect([crossing.a, crossing.b]).toEqual(['addon_pitched_b_raw_m2', 'addon_ceiling_m2']);
    const edges = (d.common_candidates as Json[]).filter((c) => /^addon_cand_rafter_span_\d_b_m$/.test(c.row ?? ''));
    expect(edges.map((c) => c.row)).toEqual([1, 2, 3, 4].map((k) => `addon_cand_rafter_span_${k}_b_m`));
    const pathA = (d.paths as Json[]).find((p) => p.id === 'A') as Json;
    expect(pathA.allocations.map((a: Json) => a.id)).toEqual(['suite_first', 'house_first', 'house_first_pitched_b']);
    for (const id of [crossing.a, crossing.b, ...edges.map((c) => c.row), 'addon_main_footprint_min_pitched_b_a_m2']) expect(ids.has(id), id).toBe(true);
  });
});

describe('the refined crossing (A0553: the pitched-B house reaches its ceiling at d 3.5582)', () => {
  it('A0553 detached low/A and low/B equal the key within 0.02 m2 (the engine was 192.8725 against 195.8669)', () => {
    for (const cell of ['low/A', 'low/B']) expect(Math.abs(total('A0553_26TEY', 'detached_house', cell) - keyTotal('A0553_26TEY', 'detached_house', cell)), cell).toBeLessThan(0.02);
  });
});

describe('the rafter-span edges (A0561: the pitched-B form is offered up to half span 7.66 m, depth 15.32 m)', () => {
  it('the edge rows are twice the settings, and A0561 detached tall/A equals the key within 0.02 m2 (was 275.4101 against 277.2098)', () => {
    const rowsLib = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    const got = rowsLib.runRowsIn([1, 2, 3, 4].map((k) => `addon_cand_rafter_span_${k}_b_m`), 'suite_tall', inputsFor('A0561_26TEY', 'detached_house')) as Json;
    expect(Object.values(got).every((r: Json) => r.status === 'computed' && r.value > 0)).toBe(true);
    expect((got.addon_cand_rafter_span_4_b_m as Json).value).toBeCloseTo(15.32, 6);
    expect(Math.abs(total('A0561_26TEY', 'detached_house', 'tall/A') - keyTotal('A0561_26TEY', 'detached_house', 'tall/A'))).toBeLessThan(0.02);
  });
});

describe('the path (A) house-first allocation for the pitched-B form (Q6 a)', () => {
  it('A0561 detached low/A and tall/A choose the pitched-B allocation and equal the key within 0.02 m2', () => {
    const split = req(path.join(ROOT, 'scripts/lib/compute/maxbld/split.js')) as Json;
    const r = split.chooseSplit(inputsFor('A0561_26TEY', 'detached_house'), S.buildingTypes.split, S) as Json;
    for (const cell of ['low/A', 'tall/A']) {
      expect(Math.abs(total('A0561_26TEY', 'detached_house', cell) - keyTotal('A0561_26TEY', 'detached_house', cell)), cell).toBeLessThan(0.02);
    }
    expect((r.options['suite_tall/A'] as Json).allocation).toBe('house_first_pitched_b');
  });
});
