// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-400, M-415, M-465, M-478 (ROOF-5), M-480, M-487 (MB-27 R2: the Layer 3 option reader)
//
// MB-27 · McBylaws queue · lane R2 · stage 6. RED FIRST: Layer 3 reads one cell set per (class, structure) from
// bylaw_resolution_results and never sees an option row or slot 61 (pitched_roof_slope_min). The reader item
// (plan-reader-and-mech.md 1.4 R2; operator "L3-F2 a", "Q-r1 a", "Q-r2 a") builds:
//   - the read of the view bylaw_resolution_option_results (migration 295), declared in the descriptor (OR-1);
//   - decodeOptionCells: one cell set per run, slot 61 in every run, ROOF-5's word from Layer 2's own withNotAbove (OR-2, OR-6);
//   - the runner: one cell set per run, the memo keyed by (row, run). A row with design_option X is evaluated in run X,
//     never the caller's (OR-3); an option-less row is evaluated in the run of the row reading it and reported from the
//     base run, with no duplicated rows (Q-r1 a, OR-4); another class's option row is not_modelled (R3-11, OR-5);
//   - the headline from real option cells (OR-7), the McProof edge cases (OR-8) and R1's catalogue check (OR-9).
// The real option cells come from the 25 golden lots through the Layer 2 pure core (no database). The database read of
// the view runs only after the axis night (migration 295 applied): it is not in this file.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));

const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: VOCAB,
  layer2Classes: SCOPE.classes,
  layer2Options: SCOPE.options,
});
const G25 = 'src/tests/fixtures/layer3/golden-25';
// operator "Q-default a": the headline revision and the three GFA form rows default OFF; the reader is tested with them on
const HEADLINE_ON = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
const FLAT = 'flat_or_shallow_roof';
const PITCHED = 'pitched';
const ROOF5 = 'main_wall_limit_above_height';
const THRESHOLD = 'pitched_roof_slope_min';

const num = (v: number, clause = 'fixture'): Json => ({ s: 'applies', kind: 'number', value: v, clause, reason: null });
const na = (clause = 'fixture'): Json => ({ s: 'not_applicable', kind: null, value: null, clause, reason: null });
const viewRow = (target: string, option: string | null, v: Json, extra: Json = {}): Json => ({
  parcel_id: 1, lot_gate: null, class: 'detached_house', structure: 'principal', target, option, shared_with_base: false, ...v, ...extra,
});
const applies = (value: number, winner = 'u'): Json => ({ status: 'applies', value_kind: 'number', value, reason: null, winner_unit_id: winner });

let S: Json; // compute-maxbld-scenarios.js
let R: Json; // rows.js
let C: Json; // layer2-cells.js
let CAT: Json; // catalogue.js
let MZ: Json; // bylaw-materialize.js (Layer 2's withNotAbove)
let SEEDS: Json;
/** case name -> { parcel_id, cells (view rows of bylaw_resolution_results), options (view rows of bylaw_resolution_option_results), line } */
const LOTS = new Map<string, Json>();

/** The 25 golden lots through the Layer 2 pure core: the rows the two views return (the base 54 and the option slots). */
function materialiseGolden(): void {
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const rows = readJson(`${G25}/parcels-rows.json`) as unknown as Json[];
  const out = MZ.materializeBatch(rows, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const expected = readJsonl(`${G25}/expected.jsonl`);
  const lines = readJsonl(`${G25}/inputs.jsonl`);
  for (const lot of out.rows.lots) {
    const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;
    const cells = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option)
      .map((d: Json) => ({ parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...d }));
    const options = lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs })
      .map((d: Json) => { const { option_name: _n, ...rest } = d; return { parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...rest }; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    LOTS.set(String(e.case).split('_')[0] as string, { parcel_id: lot.parcel_id, cells, options, line: lines.find((l) => l.case === e.case) });
  }
}

/** One golden lot -> the runner inputs, read through the reader's own decoders (the base cells and the option runs). */
function lotInputs(name: string, extra: Json = {}): Json {
  const lot = LOTS.get(name) as Json;
  const base = C.decodeCells(lot.cells, 'detached_house', 'principal').cells;
  const l2Options = C.decodeOptionCells(lot.options, 'detached_house', 'principal', { designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove });
  const parcel = (lot.line || {}).parcel || {};
  return {
    seeds: SEEDS,
    l2: base,
    l2Options,
    geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area },
    flags: { corner_lot: parcel.corner === true },
    ...extra,
  };
}

const l2Entry = (res: Json, id: string): Json[] => (res.trace as Json[]).filter((t) => t.kind === 'l2' && t.id === id);

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
  CAT = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
  MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  SEEDS = loadSeeds();
  materialiseGolden();
});

describe('OR-1: the option read is declared (R-KT)', () => {
  it('READ_SQL.options reads bylaw_resolution_option_results per batch subject (MB-31 (e)), and the descriptor declares its columns', () => {
    const sql = String(S.READ_SQL.options);
    expect(sql).toMatch(/FROM\s+bylaw_resolution_option_results\b/);
    // MB-31 (e) (operator "a yes" 2026-11-11, D-6): the read is correlated to the batch subject; every class and structure is read and decodeOptionCells selects
    expect(sql).toMatch(/\bo\.parcel_id\s*=\s*s\.id\b/);
    expect(sql).not.toMatch(/\$\d/);
    const d = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
    const t = (d.inputs.reads.tables as Json[]).find((x) => x.table === 'bylaw_resolution_option_results') as Json;
    expect(t, 'descriptor: the option view is a declared read').toBeDefined();
    for (const col of ['parcel_id', 'lot_gate', 'class', 'structure', 'target', 'option', 'status', 'value_kind', 'value', 'reason', 'winner_unit_id']) {
      expect(sql, `READ_SQL.options selects ${col}`).toMatch(new RegExp(`\\b${col}\\b`));
      expect(t.columns, `descriptor column ${col}`).toContain(col);
    }
  });
});

describe('OR-2: decodeOptionCells', () => {
  const opts = (): Json => ({ designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove });
  it('a shared option row decodes to its base cell; slot 61 joins every run; the base cell set is not touched', () => {
    const lot = LOTS.get('A0179') as Json; // RM: every option row shared
    const base = C.decodeCells(lot.cells, 'detached_house', 'principal').cells;
    const o = C.decodeOptionCells(lot.options, 'detached_house', 'principal', opts());
    for (const run of [FLAT, PITCHED]) {
      expect(o.runs[run].height_m, `${run} height_m`).toEqual(base.height_m);
      expect(o.runs[run].main_wall_height_m, `${run} main_wall_height_m`).toEqual(base.main_wall_height_m);
    }
    expect(o.shared[THRESHOLD]).toMatchObject({ s: 'applies', kind: 'number', value: 0.1 });
    expect(o.runs[FLAT][THRESHOLD]).toBeUndefined(); // slot 61 is held once, in `shared`, and joined into every run by the runner
    const inputs = lotInputs('A0179');
    for (const run of ['base', FLAT, PITCHED]) expect(R.cellsOfRun(inputs, run)[THRESHOLD], `slot 61 in the ${run} run`).toEqual(o.shared[THRESHOLD]);
    expect(base[THRESHOLD]).toBeUndefined();
  });
  it('the run cell set is the base cells overlaid with the option cells (the option wins)', () => {
    const inputs = lotInputs('A0094'); // RD main wall roof-NE: flat 7.2, pitched 7.0
    expect(R.cellsOfRun(inputs, 'base').main_wall_height_m.s).toBe('not_evaluated');
    expect(R.cellsOfRun(inputs, FLAT).main_wall_height_m.value).toBe(7.2);
    expect(R.cellsOfRun(inputs, PITCHED).main_wall_height_m.value).toBe(7);
    expect(R.cellsOfRun(inputs, FLAT).fsi).toEqual(inputs.l2.fsi);
  });
  it('a duplicate (option, target) throws, an unknown option throws, another class or structure is skipped', () => {
    const a = viewRow('height_m', FLAT, applies(9));
    expect(() => C.decodeOptionCells([a, a], 'detached_house', 'principal', opts())).toThrow(/duplicate/);
    expect(() => C.decodeOptionCells([viewRow(THRESHOLD, null, applies(0.1)), viewRow(THRESHOLD, null, applies(0.1))], 'detached_house', 'principal', opts())).toThrow(/duplicate/);
    expect(() => C.decodeOptionCells([viewRow('height_m', 'gabled', applies(9))], 'detached_house', 'principal', opts())).toThrow(/unknown design option/);
    const other = C.decodeOptionCells([{ ...a, class: 'semi_detached_house' }, { ...a, structure: 'garden_suite' }], 'detached_house', 'principal', opts());
    expect(other.runs).toEqual({});
  });
  it('a malformed option row is counted and decodes not_evaluated (never a silent value)', () => {
    const o = C.decodeOptionCells([viewRow('height_m', FLAT, { status: 'applies', value_kind: 'number', value: -1 })], 'detached_house', 'principal', opts());
    expect(o.malformed).toBe(1);
    expect(o.runs[FLAT].height_m).toMatchObject({ s: 'not_evaluated', reason: 'condition_unknown:cell_malformed' });
  });
  it('option rows without Layer 2\'s withNotAbove fail closed (ROOF-5 is never dropped silently)', () => {
    expect(() => C.decodeOptionCells([viewRow('height_m', FLAT, applies(9))], 'detached_house', 'principal', { designOptions: VOCAB.design_options })).toThrow(/withNotAbove/);
  });
  it('oneParcel reads the option rows and counts their malformed cells in layer2_cell_unparseable', () => {
    const lot = LOTS.get('A0094') as Json;
    const bad = { ...lot.options[0], status: 'applies', value_kind: 'number', value: -5 };
    const lookups = { seeds: SEEDS, vocab: VOCAB, layer2Classes: SCOPE.classes, permissionKeys: { 0: 'permitted', 1: 'prohibited', 2: 'not_evaluated' }, texts: {} };
    const src = { parcel_id: lot.parcel_id, cells: lot.cells, options: [bad, ...lot.options.slice(1)], lot: { permitted: [0, 0, 0, 0, 0], permitted_text_ids: [null, null, null, null, null], lot_gate: null }, geometry: {} };
    const r = S.materializeParcels([src], lookups); // MB-31 (e): the assembled-lookups path (materializeRows is the runtime loader)
    expect(r.matched.layer2_cell_unparseable).toBe(1);
  });
});

describe('OR-3: a row is evaluated in the run its own design_option names, never the caller\'s (plan-l3-forms.md §2b lock)', () => {
  // The pitched set-back is not_applicable and so is the base one; only the flat run has 1.4 m.
  const inputs = (): Json => ({
    seeds: SEEDS,
    l2: { main_wall_height_m: num(7.2, 'base'), upper_storey_setback_m: na('base'), fsi: num(0.6), gfa_m2: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null } },
    l2Options: { runs: { [FLAT]: { upper_storey_setback_m: num(1.4, 'flat'), main_wall_height_m: num(7.2, 'flat') }, [PITCHED]: { upper_storey_setback_m: na('flat'), main_wall_height_m: num(7.2, 'flat') } }, shared: {}, flags: {} }, // MB-27 inc3 RM fix (H1): the set-back plate revision reads regulated(main_wall_height_m), so the house fixture carries the cell (input only)
    rows: { footprint_max_m2: { value: 100 }, buildable_depth_m: { value: 10 } },
    geometry: { lot_area_m2: 400 },
    switches: HEADLINE_ON,
  });
  it('setback_plate_m2 = 100 − 2 × 1.4 × (100 ÷ 10) = 72 m2 from the flat set-back, top level and when read by gfa_flat_m2', () => {
    const top = R.runRow('setback_plate_m2', inputs());
    expect([top.status, top.value]).toEqual(['computed', 72]);
    const reads = l2Entry(top, 'upper_storey_setback_m');
    expect(reads.length).toBeGreaterThan(0);
    for (const t of reads) expect(t).toMatchObject({ value: 1.4, clause: 'flat', run: FLAT });
    const flat = R.runRow('gfa_flat_m2', inputs());
    const plateRead = (flat.trace as Json[]).filter((t) => t.kind === 'row' && t.id === 'setback_plate_m2');
    expect(plateRead.length).toBeGreaterThan(0);
    for (const t of plateRead) expect(t.run, 'gfa_flat_m2 reads setback_plate_m2 in the flat run').toBe(FLAT);
  });
  it('a runner that resolved setback_plate_m2 in its caller\'s (base) run would read the not_applicable set-back: the values differ', () => {
    const noTag = JSON.parse(JSON.stringify(SEEDS));
    for (const r of noTag.catalogue.rows) delete r.design_option;
    const mutated = R.runRow('setback_plate_m2', { ...inputs(), seeds: noTag });
    expect(mutated.value).not.toBe(72);
    expect(R.runRow('setback_plate_m2', inputs()).value).toBe(72);
  });
  it('every trace entry of a row evaluated in an option run names that run; a base-run row\'s own entries name none (M-60: increment-1 rows unchanged)', () => {
    const top = R.runRow('setback_plate_m2', inputs());
    for (const t of top.trace as Json[]) expect(t.run, JSON.stringify(t)).toBe(FLAT);
    const base = R.runRow('gfa_max_m2', inputs());
    for (const t of base.trace as Json[]) {
      if (t.kind === 'row' && ['gfa_flat_m2'].includes(t.id)) expect(t.run).toBe(FLAT);
      else if (t.kind === 'row' && /^gfa_pitched_/.test(t.id)) expect(t.run).toBe(PITCHED);
      else expect(t.run, JSON.stringify(t)).toBeUndefined();
    }
  });
});

describe('OR-4: Q-r1 a, an option-less row is evaluated in the run of the row reading it and reported from the base run', () => {
  it('RD main-wall roof-NE lot A0094: wall_storeys reads 7.2 m in the flat run [10.20.40.10(4)(A)] and 7.0 m in the pitched run [(2)(A)]', () => {
    const inputs = lotInputs('A0094');
    const flat = R.runRowIn('wall_storeys', FLAT, inputs);
    const pitched = R.runRowIn('wall_storeys', PITCHED, inputs);
    // MB-27 inc3 RM fix (named move, trace only): the revision's regulated(main_wall_height_m) read adds a second l2 entry for the same cell; the value read is still the first
    expect(l2Entry(flat, 'main_wall_height_m')).toEqual([expect.objectContaining({ value: 7.2, clause: '10.20.40.10(4)#(4)(A)', run: FLAT }), expect.objectContaining({ run: FLAT })]);
    expect(l2Entry(pitched, 'main_wall_height_m')).toEqual([expect.objectContaining({ value: 7, clause: '10.20.40.10(2)#(2)(A)', run: PITCHED }), expect.objectContaining({ run: PITCHED })]);
    // floor((7.2 − 0.212) ÷ 2.512) = 2 and floor((7.0 − 0.212) ÷ 2.512) = 2
    expect([flat.status, flat.value, pitched.status, pitched.value]).toEqual(['computed', 2, 'computed', 2]);
    // attic_eave_clearance_m has no design option (Q-K2 settlement): in the pitched run it is 7.0 − 2 × 2.512 = 1.976 m, the
    // pitched wall through the pitched-run wall_storeys; reported from the base run it is undecided like wall_storeys
    const eave = R.runRowIn('attic_eave_clearance_m', PITCHED, inputs);
    expect(eave.status).toBe('computed');
    expect(eave.value).toBeCloseTo(1.976, 9);
    expect(R.runRow('attic_eave_clearance_m', inputs).status).toBe('not_evaluated');
  });
  it('the top-level wall_storeys stays not_evaluated:condition_unknown:flat_or_shallow_roof (R3-01: undecided never means a number)', () => {
    const top = R.runRow('wall_storeys', lotInputs('A0094'));
    expect([top.status, top.reason]).toEqual(['not_evaluated', 'condition_unknown:flat_or_shallow_roof']);
    const all = R.runAllRows({ ...lotInputs('A0094'), switches: HEADLINE_ON });
    const ws = all.filter((r: Json) => r.row === 'wall_storeys');
    expect(ws.length, 'one wall_storeys row, no per-run duplicate').toBe(1);
    expect([ws[0].status, ws[0].reason]).toEqual(['not_evaluated', 'condition_unknown:flat_or_shallow_roof']);
  });
  it('the memo is keyed by (row, run): the same option-less row gives different values in two runs within one call', () => {
    // wall_storeys: flat floor((7.2 − 0.212) ÷ 2.512) = 2, pitched floor((9.75 − 0.212) ÷ 2.512) = 3; storeys_max 3, F 100, plate 50
    const inputs: Json = {
      ...lotInputs('A0094'),
      l2Options: { runs: { [FLAT]: { main_wall_height_m: num(7.2) }, [PITCHED]: { main_wall_height_m: num(9.75) } }, shared: { [THRESHOLD]: num(0.1) }, flags: {} },
      rows: { storeys_max: { value: 3 }, footprint_max_m2: { value: 100 }, setback_plate_m2: { value: 50 }, roof_pitch_a: { value: 0.5 }, attic_variant_noblock_a_m2: { value: 999 }, attic_variant_block_a_m2: { value: 0 } },
      switches: HEADLINE_ON,
    };
    inputs.l2 = { ...inputs.l2, fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'fixture', reason: null }, gfa_m2: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null } };
    // one shared runner: gfa_flat_m2 = 2 × 100 + (3 − 2) × 50 = 250 (flat wall_storeys 2); gfa_pitched_a_m2 = 3 × 100 = 300 (pitched
    // wall_storeys 3, not below storeys_max). A memo keyed by row alone gives one of 300 / 999 instead, whichever run memoised first.
    const rows = R.runAllRows(inputs);
    const at = (id: string): Json => rows.find((r: Json) => r.row === id) as Json;
    expect([at('gfa_flat_m2').status, at('gfa_flat_m2').value]).toEqual(['computed', 250]);
    expect([at('gfa_pitched_a_m2').status, at('gfa_pitched_a_m2').value]).toEqual(['computed', 300]);
  });
});

describe('OR-5: R3-11 extended, another class\'s option row is not_modelled', () => {
  it('a building type of a Phase 2 class outside layer2-scope options.roof_form.classes: every design_option row is not_modelled, never the base cells', () => {
    const copy = JSON.parse(JSON.stringify(SEEDS));
    copy.buildingTypes.rows.push({ id: 'semi_detached_house', class: 'semi_detached_house', structure: 'principal', units: 1, increment: '1', switch: 'building_type:detached_house', rules: ['R3-11'] });
    copy.catalogue.rows.forEach((r: Json) => { if (r.building_type === 'detached_house') r.building_type = 'semi_detached_house'; });
    const inputs = { ...lotInputs('A0179'), seeds: copy, buildingType: 'semi_detached_house', switches: HEADLINE_ON };
    const tagged = copy.catalogue.rows.filter((r: Json) => r.design_option);
    expect(tagged.length).toBeGreaterThan(0);
    for (const r of tagged) {
      const out = R.runRow(r.id, inputs);
      expect([r.id, out.status, out.reason, out.value]).toEqual([r.id, 'not_modelled', 'roof option not resolved for semi_detached_house (MB-27.L2)', null]);
      expect(out.trace, r.id).toEqual([]);
    }
    const untagged = R.runRow('height_max_m', inputs);
    expect(untagged.status, 'an option-less row of that class still computes from its own base cells').toBe('computed');
  });
  it('operator "a" on Q-A: seeds that declare no layer2Options scope fail closed: a design_option row is not_modelled, an option-less row still computes', () => {
    const { layer2Options: _drop, ...bare } = SEEDS; // eslint-disable-line @typescript-eslint/no-unused-vars
    const inputs = { ...lotInputs('A0179'), seeds: bare, switches: HEADLINE_ON };
    const out = R.runRow('gfa_flat_m2', inputs);
    expect([out.status, out.reason, out.value]).toEqual(['not_modelled', 'roof option not resolved for detached_house (MB-27.L2)', null]);
    expect(R.runRow('height_max_m', inputs).status).toBe('computed');
  });
  it('a listed class with no option cells is not refused: its runs are the base cells (the view returns none only for a stale lot, which hides the base rows too)', () => {
    const inputs = { ...lotInputs('A0179'), l2Options: undefined };
    expect(R.runRow('half_span_a_m', { ...inputs, rows: { footprint_max_m2: { value: 100 }, buildable_depth_m: { value: 10 } } }).status).toBe('computed');
  });
});

describe('OR-6: M-478 (ROOF-5), the word comes through inputFlags from Layer 2\'s own withNotAbove, never re-derived in Layer 3', () => {
  it('A0166: flat main_wall_height_m 7.2 > flat height_m 6.5, so a row reading it in the flat run carries main_wall_limit_above_height', () => {
    const inputs = lotInputs('A0166');
    expect(inputs.l2Options.flags[FLAT].main_wall_height_m).toEqual([ROOF5]);
    expect(R.runRowIn('wall_storeys', FLAT, inputs).flags).toContain(ROOF5);
  });
  it('the pitched run (7.0 ≤ 9.5) and a lot at or below the height (A0094 flat 7.2 ≤ 9.0) do not', () => {
    const inputs = lotInputs('A0166');
    expect(R.runRowIn('wall_storeys', PITCHED, inputs).flags).not.toContain(ROOF5);
    expect((inputs.l2Options.flags[PITCHED] || {}).main_wall_height_m).toBeUndefined();
    const other = lotInputs('A0094');
    expect(R.runRowIn('wall_storeys', FLAT, other).flags).not.toContain(ROOF5);
    expect(other.l2Options.flags).toEqual({});
  });
  it('the base run never carries it (ROOF-5 is an option-row disclosure only)', () => {
    const base = { ...lotInputs('A0166'), l2: { ...lotInputs('A0166').l2, main_wall_height_m: num(7.2), height_m: num(6.5) } };
    expect(R.runRowIn('wall_storeys', 'base', base).flags).not.toContain(ROOF5);
  });
});

describe('OR-7: the headline gfa_max_m2 increment_2 from real option cells (lane K\'s REG keys); REG-11 off-switch; determinism', () => {
  const golden = (name: string): Json => readJsonl(`${G25}/expected.jsonl`).find((e) => String(e.case).startsWith(name)) as Json;
  const parcelRows = (name: string, switches: Json): Json[] => {
    const lot = LOTS.get(name) as Json;
    const line = lot.line as Json;
    const base = C.decodeCells(lot.cells, 'detached_house', 'principal').cells;
    const l2Options = C.decodeOptionCells(lot.options, 'detached_house', 'principal', { designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove });
    const parcel = line.parcel || {};
    const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
    const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
    const input = {
      parcel_id: lot.parcel_id, l2: base, l2Options, perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
      geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area }, flags: { corner_lot: parcel.corner },
      neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: 1 },
    };
    // the step reads switch states from the switchboard seed only (no per-parcel override): set them there
    const seeds = JSON.parse(JSON.stringify(SEEDS));
    for (const [id, state] of Object.entries(switches)) {
      const sw = (seeds.switchboard.rows as Json[]).find((r) => r.id === id);
      if (!sw) throw new Error(`OR-7: no switchboard row ${id}`);
      sw.state = state;
    }
    return S.buildParcelRows(input, seeds, { layer2_table_version: 'or-7', settings_sha: 'or-7' });
  };
  const gfa = (rows: Json[]): Json => rows.find((r) => r.field_id === 'gfa_max_m2') as Json;
  // REG-1 / REG-3 / REG-6 (M-479, the McProof-signed key): "unchanged" from increment 1 on these lots
  const KEY: [string, number][] = [
    ['A0182', 382.494], ['A0203', 395.08], ['A0205', 388.62], ['A0229', 498.1], ['A0277', 394.74],
    ['A0289', 195.632], ['A0457', 219.296], ['A0461', 256.344], ['A0562', 243.352],
    ['A0170', 243.47], ['A0175', 153.252], ['A0193', 264.348], ['A0354', 147.2175], ['A0388', 127.044], ['A0399', 313.086], ['A0561', 199.33], ['A0578', 192.396],
  ];
  for (const [name, want] of KEY) {
    it(`${name}: gfa_max_m2 (increment_2 on) = ${want} m2 from the stored option cells`, () => {
      const row = gfa(parcelRows(name, HEADLINE_ON));
      expect(row.status, JSON.stringify([row.reason, row.flags])).toBe('computed');
      expect(Math.abs(row.value - want)).toBeLessThanOrEqual(0.005);
    });
  }
  it('REG-11: the increment_2 switch off gives the increment-1 formula and the golden-25 increment-1 answer', () => {
    for (const name of ['A0170', 'A0354', 'A0182']) {
      const row = gfa(parcelRows(name, { ...HEADLINE_ON, 'formula:gfa_max_m2:increment_2': 'off' }));
      const key = golden(name).gfa;
      expect([name, row.status]).toEqual([name, 'computed']);
      expect(Math.abs(row.value - key.v), name).toBeLessThanOrEqual(0.01);
      expect(row.switches).toContainEqual({ id: 'formula:gfa_max_m2:increment_2', state: 'off' });
    }
  });
  it('determinism: two calls give byte-equal rows (content_sha), in either evaluation order', () => {
    const a = parcelRows('A0354', HEADLINE_ON);
    const b = parcelRows('A0354', HEADLINE_ON);
    expect(b.map((r) => r.content_sha)).toEqual(a.map((r) => r.content_sha));
    const one = R.runRow('gfa_max_m2', { ...lotInputs('A0354'), switches: HEADLINE_ON });
    const viaAll = R.runAllRows({ ...lotInputs('A0354'), switches: HEADLINE_ON }).find((r: Json) => r.row === 'gfa_max_m2');
    expect(viaAll).toEqual(one);
  });
});

describe('OR-8: edge cases (McProof scenario rule), each expected answer derived from the ruled text', () => {
  // (i) The base height_m is roof-NE (5,853 lots, plan 1.1), so storeys_max in the base run, and with it the ceiling
  // min(storeys_max × footprint_max_m2; …), is not_evaluated. M-480 (3): best_of "returns the largest evaluated candidate";
  // "No lower-bound flag is raised when the result equals ceiling" — an undecided ceiling is equal to no result, so the
  // lower-bound flags stand; a pitched_form_not_offered arm is "dropped with its reason and raises no lower bound".
  // On the real 25 this cannot be built yet (A0166's pitched arms wait for M-482's roof_slope_max reload, its footprint for
  // the neighbour facts), so the cells are constructed, the base height as the stored roof-NE reason.
  const ceilingNe = (heightBase: Json): Json => ({
    seeds: SEEDS,
    l2: {
      height_m: heightBase,
      height_storeys: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null },
      fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'fixture', reason: null },
      gfa_m2: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null },
    },
    l2Options: { runs: { [FLAT]: { height_m: num(10) }, [PITCHED]: { height_m: num(10) } }, shared: { [THRESHOLD]: num(0.1) }, flags: {} },
    rows: { footprint_max_m2: { value: 100 }, gfa_flat_m2: { value: 300 }, gfa_pitched_a_m2: { status: 'not_evaluated', reason: 'no_cited_rafter_span' }, gfa_pitched_b_m2: { status: 'not_evaluated', reason: 'pitched_form_not_offered' } },
    geometry: { lot_area_m2: 500 },
    switches: HEADLINE_ON,
  });
  it('(i) the base ceiling is not_evaluated (base height roof-NE): the largest evaluated candidate, its headline flag, the lower bound of the undecided arm, the drop of the refused arm', () => {
    const r = R.runRow('gfa_max_m2', ceilingNe({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'condition_unknown:flat_or_shallow_roof' }));
    expect(R.runRow('storeys_max', ceilingNe({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'condition_unknown:flat_or_shallow_roof' })).status).toBe('not_evaluated');
    expect([r.status, r.value]).toEqual(['computed', 300]);
    expect(r.flags).toEqual(expect.arrayContaining(['headline:gfa_flat_m2', 'headline_lower_bound:gfa_pitched_a_m2', 'dropped:gfa_pitched_b_m2']));
    expect(r.flags).not.toContain('headline_lower_bound:gfa_pitched_b_m2');
  });
  it('(i) contrast: a decided base ceiling equal to the result suppresses the lower bound (storeys_max floor((9.4 − 0 − 0.512) ÷ 2.512) = 3; 3 × 100 = 300)', () => {
    const r = R.runRow('gfa_max_m2', ceilingNe(num(9.4)));
    expect([r.status, r.value]).toEqual(['computed', 300]);
    expect(r.flags).not.toContain('headline_lower_bound:gfa_pitched_a_m2');
    expect(r.flags).toContain('dropped:gfa_pitched_b_m2');
  });
  it('(ii) slot 61 unregulated (RT, P3 R6: "a pitched roof is not limited by one"): roof_pitch < l2(pitched_roof_slope_min) never refuses or stops the pitched arm; the arm equals the arm with no minimum', () => {
    // pitch 0.5, two storeys under the wall (no attic tier): the arm is min(storeys_max × footprint; fsi × lot; gfa_m2) = 2 × 100
    const arm = (threshold: Json): Json => ({
      seeds: SEEDS,
      l2: { fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'fixture', reason: null }, gfa_m2: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null } },
      l2Options: { runs: { [FLAT]: {}, [PITCHED]: {} }, shared: { [THRESHOLD]: threshold }, flags: {} },
      rows: { roof_pitch_a: { value: 0.5 }, roof_pitch_b: { value: 0.5 }, wall_storeys: { value: 2 }, storeys_max: { value: 2 }, footprint_max_m2: { value: 100 } },
      geometry: { lot_area_m2: 500 },
      switches: HEADLINE_ON,
    });
    for (const id of ['gfa_pitched_a_m2', 'gfa_pitched_b_m2']) {
      const z = R.runRow(id, arm(num(0)));
      expect([id, z.status, z.value], 'with no minimum the arm computes').toEqual([id, 'computed', 200]);
      const u = R.runRow(id, arm({ s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null }));
      expect([id, u.status, u.reason, u.value]).toEqual([id, 'computed', null, 200]);
    }
  });
  it('(iii) slot 61 not_applicable (operator "Q-T61 (a)": "Where slot 61 pitched_roof_slope_min is unregulated ... or not_applicable, the pitched form is offered"): the arm equals the arm with no minimum', () => {
    const arm = (threshold: Json): Json => ({
      seeds: SEEDS,
      l2: { fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'fixture', reason: null }, gfa_m2: { s: 'applies', kind: 'unregulated', value: null, clause: null, reason: null } },
      l2Options: { runs: { [FLAT]: {}, [PITCHED]: {} }, shared: { [THRESHOLD]: threshold }, flags: {} },
      rows: { roof_pitch_a: { value: 0.05 }, roof_pitch_b: { value: 0.05 }, wall_storeys: { value: 2 }, storeys_max: { value: 2 }, footprint_max_m2: { value: 100 } },
      geometry: { lot_area_m2: 500 },
      switches: HEADLINE_ON,
    });
    for (const id of ['gfa_pitched_a_m2', 'gfa_pitched_b_m2']) {
      const n = R.runRow(id, arm(na('fixture')));
      expect([id, n.status, n.reason, n.value]).toEqual([id, 'computed', null, 200]);
      // the stored threshold read from the option view's shared slot still refuses below it (M-461): 0.05 < 0.1
      const t = R.runRow(id, arm(num(0.1)));
      expect([id, t.status, t.reason]).toEqual([id, 'not_evaluated', 'pitched_form_not_offered']);
    }
  });
});

describe('OR-9: R1, validateCatalogue refuses an unknown option key or value', () => {
  it('the real catalogue passes the design_option check; an unknown key or value is a violation', () => {
    const ok = CAT.validateCatalogue(SEEDS).filter((v: string) => /design_option/.test(v));
    expect(ok).toEqual([]);
    const bad = JSON.parse(JSON.stringify(SEEDS));
    const row = bad.catalogue.rows.find((r: Json) => r.id === 'gfa_flat_m2');
    row.design_option = { roof_shape: FLAT };
    expect(CAT.validateCatalogue(bad).join('\n')).toMatch(/gfa_flat_m2: design_option key roof_shape is not a vocab.design_options key/);
    row.design_option = { roof_form: 'gabled' };
    expect(CAT.validateCatalogue(bad).join('\n')).toMatch(/gfa_flat_m2: design_option roof_form value gabled is not an option/);
  });
});
