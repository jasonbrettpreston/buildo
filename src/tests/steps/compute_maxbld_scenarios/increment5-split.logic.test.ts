// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-403, M-390, M-415 (dated notes 2026-11-13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
// MB-27 increment 5 Part B · lane B5B-3 · the split pass declared in data (building-types.json `split`, split.js): candidate depths
// of three declared kinds, the arms x paths x allocations, the tie rule FD-3 a (ANSWER-KEY.md:48), the output rows, AR-6 (b).
// Oracle: McProof key v2.1 (fixture addon-key-v2.1-suite.json: 270 arm x path cells of the 69 house x type cells). RED FIRST.
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

const KNOWN_DIFF: Record<string, string> = {
  // none: the last eight cells (pitched-B ceiling crossing, pitched-B rafter-span edge, the pitched-B house-first allocation) close through the D-65 candidates declared in data (increment5-split-d65.logic.test.ts, B5B-6); the engine is never above the key on any cell
};
const REFUSED_LOTS = ['A0388']; // B5B-6 (named re-pin): A0464 computes since P2 a (through_lot flag, addon_suite_rear_m); // stored suite rear named_lots_only / through-lot proxy (c): refused by the stored cell (A0578 reads the corner floor since P1 b, B5B-4)

describe('the split is declared in data', () => {
  it('names the rows, the settings and the three candidate kinds, and every row it names exists', () => {
    const d = S.buildingTypes.split as Json;
    const ids = new Set((S.catalogue.rows as Json[]).map((r) => r.id));
    const named = [d.main_gfa_row, d.storeys_row, d.suite_width_row, d.range.max_row, d.width_row, d.alone.gfa_row];
    for (const p of d.paths) { named.push(p.suite_gfa_row, p.suite_footprint_row); for (const a of p.allocations) named.push(a.footprint_row); }
    for (const c of [...d.common_candidates, ...d.paths.flatMap((p: Json) => p.candidates)]) { expect(['range_end', 'row', 'crossing']).toContain(c.kind); named.push(...[c.row, c.a, c.b].filter(Boolean)); }
    for (const id of named) expect(ids.has(id), id).toBe(true);
  });
});

describe('the split reproduces key v2.1 on every cell it covers (the key is not changed)', () => {
  it('equal totals within 0.02 m2 on 258 cells; no cell differs; A0388 refuses by the stored cell', () => {
    const split = req(path.join(ROOT, 'scripts/lib/compute/maxbld/split.js')) as Json;
    const decl = S.buildingTypes.split as Json;
    let same = 0;
    const differ: Record<string, string> = {};
    const refused: string[] = [];
    for (const k of KEY) {
      const r = split.chooseSplit(inputsFor(k.case, k.type), decl, S) as Json;
      for (const [name, c] of Object.entries(k.options as Record<string, Json>)) {
        const m = r.options[`suite_${name}`] as Json | undefined;
        const keyTotal = c.main + c.suite;
        if (!m) { if (REFUSED_LOTS.includes(k.case.split('_')[0])) { refused.push(`${k.case} ${k.type} ${name}`); continue; } throw new Error(`no candidate for ${k.case} ${k.type} ${name}`); }
        if (Math.abs(m.total - keyTotal) < 0.02) { same += 1; continue; }
        differ[`${k.case} ${k.type} ${name}`] = `${m.total.toFixed(4)} vs ${keyTotal.toFixed(4)}`;
        expect(m.total, `${k.case} ${k.type} ${name}`).toBeLessThan(keyTotal); // never above the approved key
      }
    }
    expect(differ).toEqual(KNOWN_DIFF);
    expect(same).toBe(258); // 226 + the 12 A0578 corner cells (P1 b) + the 8 cells the D-65 candidates close (B5B-6) + the 12 A0464 through-lot cells (P2 a)
    expect(refused.length).toBe(12); // A0388 x 3 types x 4 options
  });
});

describe('FD-3 a: the tie rule (ANSWER-KEY.md:48)', () => {
  const split = () => req(path.join(ROOT, 'scripts/lib/compute/maxbld/split.js')) as Json;
  const c = (o: Json) => ({ total: 100, path: 'A', main: 60, mainFootprint: 30, ...o });
  it('the larger total wins; equal total: path B; then the larger main GFA; then the larger main footprint', () => {
    const { better } = split();
    expect(better(c({ total: 101 }), c({ path: 'B' }), 'B')).toBe(true);
    expect(better(c({ path: 'B' }), c({ path: 'A' }), 'B')).toBe(true);
    expect(better(c({ path: 'A' }), c({ path: 'B' }), 'B')).toBe(false);
    expect(better(c({ main: 61 }), c({}), 'B')).toBe(true);
    expect(better(c({ mainFootprint: 31 }), c({}), 'B')).toBe(true);
    expect(better(c({}), c({}), 'B')).toBe(false);
  });
});

describe('a lot with no room for a suite answers no candidate (AR-6 b, A0375)', () => {
  it('A0375 (a corner lot) has no candidate: the corner street side (the stored floor, P1 b) leaves a suite width under the 3.0 m minimum', () => {
    const split = req(path.join(ROOT, 'scripts/lib/compute/maxbld/split.js')) as Json;
    const r = split.chooseSplit(inputsFor('A0375_26TEY', 'detached_house'), S.buildingTypes.split, S) as Json;
    expect(r.best).toBeNull();
    expect(r.suiteWidth).toBeCloseTo(2.8775, 4); // P1 b: width = frontage - side - max(floor; (front + house street yard) / 2; house street yard), under the 3.0 m plate minimum
  });
});
