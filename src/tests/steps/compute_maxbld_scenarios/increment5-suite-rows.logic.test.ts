// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-403, M-415, M-451 (dated notes 2026-11-12/13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
// MB-27 increment 5 Part B · lane B5B-2 piece 2 · the garden suite's Layer 3 rows on the add-on types, run per arm
// (runRowIn(id, 'suite_low' | 'suite_tall')), with the house depth / footprint / GFA of a candidate injected through the M-415 seam.
// Oracle: McProof key v2.1, the 75 house x type cells' arm x path options (fixture addon-key-v2.1-suite.json). RED FIRST.
// Corner street side (reading 2): max(the house's street-side yard, else its interior side; the stored Layer 2 floor term side_setback_street_floor_m, migration 321, P1 b),
// B5B-4: the corner lots no longer refuse (red first: evidence docs/reports/red-evidence/bylaw/inc5-corner-width-red.txt). Corner street side, M-198(2) as ruled (item 6 reading 2, D-6 a, P1 b):
// max(the stored floor; (own front + the house street-side yard) / 2; the house street-side yard), the key's own form (handcalc2-addon.mjs:53); the corner cells compare to the key like the rest.
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, seeds, goldenLotsWithEnv, type Json } from './golden25-harness';

const req = createRequire(path.join(ROOT, 'package.json'));
const ADDON: Record<string, string> = { detached_house: 'detached_house_garden_suite', detached_houseplex: 'detached_houseplex_garden_suite', house_with_secondary_suite: 'house_with_secondary_suite_garden_suite' };
const SUITE_ROWS = ['addon_storeys', 'addon_main_depth_m', 'addon_main_footprint_m2', 'addon_main_gfa_m2', 'addon_main_footprint_b_m2', 'addon_suite_width_m', 'addon_suite_region_depth_m', 'addon_suite_footprint_b_m2', 'addon_suite_footprint_a_m2', 'addon_suite_gfa_b_m2', 'addon_suite_gfa_a_m2'];

// the stored garden-suite rear cell a lot refuses: Layer 3 does not invent it (A0464's through-lot proxy is OPEN with the corner floor)
const REFUSED_STORED: Record<string, string> = { A0388: 'named_lots_only' }; // B5B-6 (named re-pin): A0464 is no longer refused: the through-lot rear is max(own front, the Layer 2 floor 1.5 m) since P2 a (through_lot flag, addon_suite_rear_m), 2.01 m, equal to the key
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

function inputsFor(caseId: string, cls: string, rows: Json): Json {
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

describe('the suite rows are catalogue rows on the three add-on types, each with its switch', () => {
  it('declares the eleven rows on exactly the add-on types, each with a formula switch, and the four 316 settings', () => {
    const cat = S.catalogue as Json;
    for (const id of SUITE_ROWS) {
      const r = (cat.rows as Json[]).find((x) => x.id === id) as Json;
      expect(r, id).toBeTruthy();
      expect(r.building_type, id).toEqual(Object.values(ADDON));
      expect((S.switchboard.rows as Json[]).some((x) => x.id === r.switch && x.kind === 'formula'), id).toBe(true);
    }
    for (const id of ['compute_maxbld_scenarios_plate_min_dimension_m', 'compute_maxbld_scenarios_suite_gfa_lt_main_margin_sqm', 'compute_maxbld_scenarios_min_suite_gfa_m2', 'compute_maxbld_scenarios_min_main_dwelling_gfa_m2']) {
      expect((cat.settings as Json[]).some((x) => x.id === id), id).toBe(true);
    }
  });
});

describe('the suite GFA at a key candidate (arm x path, the key house depth, footprint and GFA injected) equals the key suite GFA', () => {
  it('reproduces every key option cell the stored cells allow within the key grid (0.02 m2), corner lots included (P1 b)', () => {
    let compared = 0;
    let corner = 0;
    let refused = 0;
    let boundary = 0;
    const bad: string[] = [];
    const rows = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    for (const k of KEY) {
      const lot = LOTS.get(k.case.split('_')[0]) as Json;
      const isCorner = !!(lot.line.parcel || {}).corner;
      for (const [name, c] of Object.entries(k.options as Record<string, Json>)) {
        const inj = { addon_main_depth_m: { value: c.d }, addon_main_footprint_m2: { value: c.mainF }, addon_main_gfa_m2: { value: c.main } };
        const res = rows.runRowIn(`addon_suite_gfa_${c.path.toLowerCase()}_m2`, `suite_${c.arm}`, inputsFor(k.case, k.type, inj)) as Json;
        const refusal = REFUSED_STORED[k.case.split('_')[0] as string];
        if (refusal) {
          // a stored suite cell the layer 2 pass refuses (a named lot, the through-lot proxy): fail closed, the key's own figure is not reproduced here
          expect(res.status, `${k.case} ${k.type} ${name}`).toBe('not_evaluated');
          expect(res.reason, `${k.case} ${k.type} ${name}`).toBe(refusal);
          refused += 1;
          continue;
        }
        // the key's suite sits exactly on the 25 m2 livable minimum at its exact optimum depth (4 decimals): the boundary is the minimum itself
        if (res.status === 'not_evaluated' && res.reason === 'below_livable_minimum' && Math.abs(c.suite - 25) < 0.02) { boundary += 1; continue; }
        if (res.status !== 'computed') { bad.push(`${k.case} ${k.type} ${name}: ${res.status} ${res.reason}`); continue; }
        compared += 1;
        if (isCorner) corner += 1;
        if (!(Math.abs(res.value - c.suite) < 0.02)) bad.push(`${k.case} ${k.type} ${name}: engine ${res.value} key ${c.suite}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(compared).toBeGreaterThan(100);
    expect(corner).toBeGreaterThan(0);
    expect(refused).toBe(12); // A0388 (stored rear: named_lots_only) x 3 types x 4 options; was 24 with A0464 (B5B-6, P2 a)
    expect(boundary).toBeGreaterThan(0);
  });
});

describe('a malformed cell is counted once (OR-2 under the add-on read)', () => {
  it('decodeAddon reports the suite structure own malformed count, so the step does not count the principal cells twice', () => {
    const T = req(path.join(ROOT, 'scripts/lib/compute/maxbld/two-structure.js')) as Json;
    const raw = CELLS.get(String((LOTS.get('A0094') as Json).parcel_id)) as { cells: Json[]; options: Json[] };
    const bt = (S.buildingTypes.rows as Json[]).find((b) => b.id === ADDON.detached_house) as Json;
    const bad = { ...raw.options[0], status: 'applies', value_kind: 'number', value: -5 };
    const two = T.decodeAddon(raw.cells, [bad, ...raw.options.slice(1)], bt, { buildingTypes: S.buildingTypes, designOptions: readJson('scripts/seeds/bylaw/vocab.json').design_options, notAbove: (req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json).withNotAbove });
    expect(two.malformed).toBeGreaterThanOrEqual(two.malformedSuite);
    expect(two.malformedSuite).toBe(0);
    expect(two.malformed).toBe(1);
  });
});
