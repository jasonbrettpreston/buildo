// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-191 / M-253, M-267 / M-314, M-451 (dated notes 2026-11-12/13);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10
//
// MB-27 increment 5 Part B · lane B5B-5 · P3 (a): Layer 3 reads where a stored cell comes from. RED FIRST (captured on the tree without the
// change: docs/reports/red-evidence/bylaw/inc5-exception-source-red.txt). Operator 2026-11-13 ~19:50 P3 (a): the engine reads the view's
// existing `winner_layer` (base | overlay | exception) through a declared Layer 3 reader, exception(<id>). Two catalogue consumers:
//   - AR-2 (d) (WALK2 "AR-2 = (d)"): the garden suite is not counted against "u" caps; fail closed on a Chapter 900 exception dwelling-unit
//     cap of 1 or 2 units (row addon_unit_cap_gate, reason exception_unit_cap; the split outputs refuse with it);
//   - inc-5 item 4 (WALK2 "Item 4 = (a)"): a site-specific (exception) coverage figure caps the path (A) "all buildings" total as well as the
//     house (row addon_total_cov_a_m2; 900.1.10(3); confidence medium).
// The golden 25 has no exception lot (the key: "no golden lot has an exception unit cap"), so the cases are synthetic cells on real lots.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJson, seeds, goldenLotsWithEnv, type Json } from './golden25-harness';

const req = createRequire(path.join(ROOT, 'package.json'));
const ADDON: Record<string, string> = { detached_house: 'detached_house_garden_suite', detached_houseplex: 'detached_houseplex_garden_suite', house_with_secondary_suite: 'house_with_secondary_suite_garden_suite' };
let S: Json;
let LOTS: Map<string, Json>;
let CELLS: Map<string, { cells: Json[]; options: Json[] }>;
let T: Json;
let MZ: Json;
let ROWS: Json;
let DSL: Json;

beforeAll(async () => {
  S = seeds();
  LOTS = goldenLotsWithEnv().lots;
  MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  T = req(path.join(ROOT, 'scripts/lib/compute/maxbld/two-structure.js')) as Json;
  ROWS = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  DSL = await import(path.join(ROOT, 'scripts/analysis/bylaw/dsl.mjs'));
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const out = MZ.materializeBatch(readJson('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[], env);
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

type Patch = { structure: string; target: string; value: number; layer: string | null };
/** the lot's stored cell rows with the given cells replaced by number cells won by `layer` (a synthetic exception lot) */
function patched(caseId: string, cls: string, patches: Patch[]): Json[] {
  const lot = LOTS.get(caseId.split('_')[0] as string) as Json;
  const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[] };
  return raw.cells.map((r) => {
    const p = patches.find((x) => x.structure === r.structure && x.target === r.target && r.class === cls);
    if (!p) return r;
    const row: Json = { ...r, status: 'applies', value_kind: 'number', value: p.value, reason: null, winner_unit_id: '900.3.10(1)#(1)(A)' };
    if (p.layer === null) delete (row as Json).winner_layer; else row.winner_layer = p.layer;
    return row;
  });
}

function inputsFor(caseId: string, cls: string, rows: Json, cells: Json[] | null = null): Json {
  const lot = LOTS.get(caseId.split('_')[0] as string) as Json;
  const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[]; options: Json[] };
  const bt = (S.buildingTypes.rows as Json[]).find((b) => b.id === ADDON[cls]) as Json;
  const two = T.decodeAddon(cells || raw.cells, raw.options, bt, { buildingTypes: S.buildingTypes, designOptions: readJson('scripts/seeds/bylaw/vocab.json').design_options, notAbove: MZ.withNotAbove });
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
const area = (caseId: string): number => ((LOTS.get(caseId.split('_')[0] as string) as Json).line.parcel as Json).area as number;

describe('P3 (a): the winner layer reaches Layer 3 through a declared reader', () => {
  it('the cell decoded from a view row carries `layer` when the read has winner_layer, and the shape is unchanged when it has none', () => {
    const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
    const row = { class: 'detached_house', structure: 'principal', target: 'lot_coverage_pct', status: 'applies', value_kind: 'number', value: 35, reason: null, winner_unit_id: 'u1' };
    expect(C.decodeCells([{ ...row, winner_layer: 'exception' }], 'detached_house', 'principal').cells.lot_coverage_pct).toEqual({ s: 'applies', kind: 'number', value: 35, clause: 'u1', reason: null, layer: 'exception' });
    expect(C.decodeCells([row], 'detached_house', 'principal').cells.lot_coverage_pct).toEqual({ s: 'applies', kind: 'number', value: 35, clause: 'u1', reason: null });
  });
  it('the step reads winner_layer in both Layer 2 views and the descriptor declares the column', () => {
    const step = fs.readFileSync(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js'), 'utf8') as string;
    expect(step).toMatch(/r\.winner_unit_id, r\.winner_layer\s+FROM bylaw_resolution_results r/);
    expect(step).toMatch(/o\.winner_unit_id, o\.winner_layer\s+FROM bylaw_resolution_option_results o/);
    const d = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
    for (const t of ['bylaw_resolution_results', 'bylaw_resolution_option_results']) {
      expect(((d.inputs.reads.tables as Json[]).find((x) => x.table === t) as Json).columns, t).toContain('winner_layer');
    }
  });
  it('exception(<id>) parses in a Layer 3 condition, prints canonically, names its target as a Layer 2 reference, and is refused outside Layer 3', () => {
    const c = DSL.parseCond('exception(lot_coverage_pct)', { layer: 'l3' });
    expect(c).toEqual({ type: 'exception', id: 'lot_coverage_pct' });
    expect(DSL.l3RefsOf(c).l2).toEqual(['lot_coverage_pct']);
    expect(() => DSL.parseCond('exception(lot_coverage_pct)', {})).toThrow();
  });
});

describe('P3 (a), item 4: an exception coverage figure caps the path (A) total', () => {
  const cell = (caseId: string, patches: Patch[], row = 'addon_total_cov_a_m2'): Json => ROWS.runRowIn(row, 'base', inputsFor(caseId, 'detached_house', {}, patched(caseId, 'detached_house', patches))) as Json;
  const PCT = { structure: 'principal', target: 'lot_coverage_pct' };
  const SUITE = { structure: 'garden_suite', target: 'lot_coverage_pct' };
  it('the catalogue declares addon_total_cov_a_m2 on exactly the add-on types with its switch, and the path (A) rows read it, not the stored suite coverage', () => {
    const cat = S.catalogue as Json;
    const r = (cat.rows as Json[]).find((x) => x.id === 'addon_total_cov_a_m2') as Json;
    expect(r, 'row').toBeTruthy();
    expect(r.building_type).toEqual(Object.values(ADDON));
    expect(r.expression).toContain('exception(lot_coverage_pct)');
    expect((S.switchboard.rows as Json[]).some((x) => x.id === r.switch && x.kind === 'formula')).toBe(true);
    const readers = (cat.rows as Json[]).filter((x) => /l2\(suite_lot_coverage_pct\)/.test(x.expression || ''));
    expect(readers.map((x) => x.id)).toEqual(['addon_total_cov_a_m2']);
  });
  it('the golden lot as stored (no exception): the total is the suite cell (45 %) of the lot area, unchanged', () => {
    const r = ROWS.runRowIn('addon_total_cov_a_m2', 'base', inputsFor('A0094_26TEY', 'detached_house', {})) as Json;
    expect([r.status, Math.round(r.value * 1e6) / 1e6]).toEqual(['computed', Math.round(0.45 * area('A0094_26TEY') * 1e6) / 1e6]);
  });
  it('an exception house figure under the suite cell caps the total (35 % exception: 35 % of the lot, not 45 %)', () => {
    const r = cell('A0094_26TEY', [{ ...PCT, value: 35, layer: 'exception' }]);
    expect([r.status, Math.round(r.value * 1e6) / 1e6]).toEqual(['computed', Math.round(0.35 * area('A0094_26TEY') * 1e6) / 1e6]);
  });
  it('the same 35 % from the zone (not an exception) does not cap the total: it binds the house only', () => {
    const r = cell('A0094_26TEY', [{ ...PCT, value: 35, layer: 'base' }]);
    expect(Math.round(r.value * 1e6) / 1e6).toBe(Math.round(0.45 * area('A0094_26TEY') * 1e6) / 1e6);
  });
  it('an exception figure above the suite cell never raises the total (min of the two), and one on the suite cell itself is the stored cap', () => {
    const hi = cell('A0094_26TEY', [{ ...PCT, value: 60, layer: 'exception' }]);
    expect(Math.round(hi.value * 1e6) / 1e6).toBe(Math.round(0.45 * area('A0094_26TEY') * 1e6) / 1e6);
    const suite = cell('A0094_26TEY', [{ ...SUITE, value: 40, layer: 'exception' }]);
    expect(Math.round(suite.value * 1e6) / 1e6).toBe(Math.round(0.4 * area('A0094_26TEY') * 1e6) / 1e6);
  });
  it('a cell with no source layer carried is not_evaluated through the reader (fail closed, never a guess)', () => {
    const r = cell('A0094_26TEY', [{ ...PCT, value: 35, layer: null }]);
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason)).toMatch(/layer/);
  });
});

describe('P3 (a), AR-2 (d): an exception dwelling-unit cap of 1 or 2 fails closed', () => {
  const UNITS = { structure: 'principal', target: 'dwelling_units_max' };
  const gate = (patches: Patch[]): Json => ROWS.runRowIn('addon_unit_cap_gate', 'base', inputsFor('A0094_26TEY', 'detached_house', {}, patched('A0094_26TEY', 'detached_house', patches))) as Json;
  it('the catalogue declares addon_unit_cap_gate on exactly the add-on types, with its switch and the reason word', () => {
    const cat = S.catalogue as Json;
    const r = (cat.rows as Json[]).find((x) => x.id === 'addon_unit_cap_gate') as Json;
    expect(r, 'row').toBeTruthy();
    expect(r.building_type).toEqual(Object.values(ADDON));
    expect(cat.refuse_reasons).toContain('exception_unit_cap');
    expect((S.switchboard.rows as Json[]).some((x) => x.id === r.switch && x.kind === 'formula')).toBe(true);
    expect((S.buildingTypes.split as Json).gate_rows).toEqual(['addon_unit_cap_gate']);
  });
  it('exception caps of 1 and 2 refuse; 3 and a zone ("u" label) cap of 2 do not (the suite is not counted against "u" caps)', () => {
    for (const v of [1, 2]) {
      const r = gate([{ ...UNITS, value: v, layer: 'exception' }]);
      expect([r.status, r.reason], `exception ${v}`).toEqual(['not_evaluated', 'exception_unit_cap']);
    }
    expect(gate([{ ...UNITS, value: 3, layer: 'exception' }]).status).toBe('computed');
    expect(gate([{ ...UNITS, value: 2, layer: 'base' }]).status).toBe('computed');
  });
  it('the golden lot as stored passes the gate (no golden lot has an exception unit cap)', () => {
    const r = ROWS.runRowIn('addon_unit_cap_gate', 'base', inputsFor('A0094_26TEY', 'detached_house', {})) as Json;
    expect(r.status).toBe('computed');
    for (const id of ['A0097_26TEY', 'A0175_26TEY', 'A0553_26TEY']) {
      const x = ROWS.runRowIn('addon_unit_cap_gate', 'base', inputsFor(id, 'detached_house', {})) as Json;
      expect(x.status, id).toBe('computed');
    }
  });
  it('the step: an exception cap of 2 makes every split output of the add-on type not_evaluated:exception_unit_cap; the stored cell as it is does not', () => {
    const S2 = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    const lot = LOTS.get('A0094') as Json;
    const raw = CELLS.get(String(lot.parcel_id)) as { cells: Json[]; options: Json[] };
    const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
    const p = (lot.line as Json).parcel;
    const run = (cells: Json[]): Json[] => {
      const lookups = { seeds: S, vocab: readJson('scripts/seeds/bylaw/vocab.json'), layer2Classes: SCOPE.classes, permissionKeys: { 0: 'permitted', 1: 'prohibited', 2: 'not_evaluated' }, texts: {} };
      const src = { parcel_id: lot.parcel_id, cells, options: raw.options, lot: lot.source.lot, geometry: { frontage_m: p.frontage, depth_m: p.depth, lot_size_sqm: p.area, is_corner_lot: p.corner, is_through_lot: p.through } };
      return S2.materializeParcels([src], lookups).rows.e1 as Json[];
    };
    const split = (rows: Json[]): Json => rows.find((r) => r.building_type === ADDON.detached_house && r.field_id === 'suite_gfa_sqm') as Json;
    const capped = run(patched('A0094_26TEY', 'detached_house', [{ ...UNITS, value: 2, layer: 'exception' }]));
    expect([split(capped).status, split(capped).reason]).toEqual(['not_evaluated', 'exception_unit_cap']);
    expect(split(run(raw.cells)).status).not.toBe('not_evaluated');
  });
});
