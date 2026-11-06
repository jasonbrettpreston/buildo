// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-457..M-487 (MB-27 increment 2; McProof-signed answer key, M-479)
//
// MB-27 · McBylaws queue · lane K · stage 6. The increment-2 worked examples (Arithmetic and Ruling layers of
// ~/Buildo-scratch/mcbylaws/inc2/worked-examples.v2-draft.md) as fixtures, each run through the catalogue rows by the
// one runner (`runRow`). The increment-2 headline revision is switched on for every example (the examples ARE the
// increment-2 key) unless the example sets the switch itself. An example the key marks "inputs pending reload" is
// recorded, not asserted, until the MB-27.L2 axis night (it.todo); an example with no checks is a Source, process or
// disclosure statement the rows do not compute.
// MB-27 switch-on D-3 (operator "all recommended", the plan's R2 item 7): an example that names its golden lot (`case`) runs
// on that lot's real stored cells, the {base, flat_or_shallow_roof, pitched} cell sets of the 25 golden lots through the
// Layer 2 pure core and the reader's own decoders (the OR-7 loader); its `inputs` stay as the key's encoding and are not read.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const FIXTURE = 'src/tests/fixtures/layer3/increment-2/examples.json';
// operator "Q-default a": these four default OFF; the examples are the increment-2 key, so they run with them on
const HEADLINE_ON = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options, // operator "a" on Q-A: R3-11 extended fails closed without the declared scope
});
const cell = (c: any): Json => {
  if (typeof c === 'number') return { s: 'applies', kind: 'number', value: c, clause: 'example' };
  if (c && c.unregulated) return { s: 'applies', kind: 'unregulated', value: null, clause: null };
  if (c && c.unlimited) return { s: 'applies', kind: 'unlimited', value: null, clause: 'example' };
  if (c && c.not_applicable !== undefined) return { s: 'not_applicable', clause: String(c.not_applicable) };
  if (c && c.not_evaluated !== undefined) return { s: 'not_evaluated', kind: null, value: null, clause: null, reason: String(c.not_evaluated) };
  throw new Error(`fixture: bad l2 cell ${JSON.stringify(c)}`);
};
const slot = (v: any): Json => (typeof v === 'number' ? { value: v } : v && v.not_evaluated !== undefined ? { status: 'not_evaluated', reason: v.not_evaluated } : v);

const examples = readJson(FIXTURE) as unknown as Json[]; // the fixture file is a JSON array (readJson is typed for an object)
const G25 = 'src/tests/fixtures/layer3/golden-25';
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));

/** D-3: the 25 golden lots through the Layer 2 pure core (the OR-7 loader): case name -> the runner inputs of its real cells. */
function goldenLots(): Map<string, Json> {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
  const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const out = MZ.materializeBatch(readJson(`${G25}/parcels-rows.json`) as unknown as Json[], env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const expected = readJsonl(`${G25}/expected.jsonl`);
  const lines = readJsonl(`${G25}/inputs.jsonl`);
  const lots = new Map<string, Json>();
  for (const lot of out.rows.lots) {
    const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;
    const cells = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option)
      .map((d: Json) => ({ parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...d }));
    const options = lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs })
      .map((d: Json) => { const { option_name: _n, ...rest } = d; return { parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...rest }; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    const line = (lines.find((l) => l.case === e.case) || {}) as Json;
    const parcel = line.parcel || {};
    const neighbours = (line.abutments || []).map((x: Json) => ({ same_street: x.sameStreet, residential: x.res, bldg_m: x.bldg, est: x.est, est_status: x.st }));
    const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
    lots.set(String(e.case).split('_')[0] as string, {
      l2: C.decodeCells(cells, 'detached_house', 'principal').cells,
      l2Options: C.decodeOptionCells(options, 'detached_house', 'principal', { designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove }),
      geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area },
      flags: { corner_lot: parcel.corner === true },
      neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: 1 },
    });
  }
  return lots;
}

describe('MB-27 increment 2 worked examples (the McProof-signed key, M-479)', () => {
  let R: Json;
  let SEEDS: Json;
  let LOTS: Map<string, Json>;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
    LOTS = goldenLots();
  });

  it('every fixture id is unique and names an example layer the rows can answer', () => {
    const ids = examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of examples) expect(['Arithmetic', 'Ruling'], e.id).toContain(e.layer);
  });

  for (const ex of examples) {
    if (!Array.isArray(ex.checks) || ex.checks.length === 0) continue;
    if (ex.at_switch_on) {
      // operator "Q-default a": "Increment 2's examples go green on the 25 at the switch-on" (after the axis night and R2)
      it.todo(`${ex.id} (on the 25: asserted at the increment-2 switch-on, Q-DEFAULT a): ${String(ex.key_answer).slice(0, 80)}`);
      continue;
    }
    if (ex.pending_reload) {
      it.todo(`${ex.id} (inputs pending reload, MB-27.L2 axis night): ${String(ex.key_answer).slice(0, 80)}`);
      continue;
    }
    it(`${ex.id}${ex.case ? ` (on ${ex.case}'s real cells)` : ''}: ${String(ex.key_answer).slice(0, 100)}`, () => {
      const inp = ex.inputs || {};
      const lot = ex.case ? LOTS.get(String(ex.case)) : null;
      if (ex.case && !lot) throw new Error(`${ex.id}: case ${ex.case} is not a golden-25 lot`);
      const l2: Json = {};
      for (const [k, v] of Object.entries(inp.l2 || {})) l2[k] = cell(v);
      const rows: Json = {};
      for (const [k, v] of Object.entries(inp.rows || {})) rows[k] = slot(v);
      const switches = { ...HEADLINE_ON, ...(inp.switches || {}) };
      const inputs = lot ? { seeds: SEEDS, ...lot, switches } : { seeds: SEEDS, l2, rows, geometry: inp.geometry || {}, flags: inp.flags || {}, switches };
      for (const ch of ex.checks) {
        const got = R.runRow(ch.row, inputs);
        const at = `${ex.id}/${ch.row}`;
        if (ch.status) expect(`${got.status}:${got.reason ?? ''}`, at).toMatch(new RegExp(`^${ch.status}:`));
        if (typeof ch.value === 'number') {
          expect(typeof got.value, `${at}: a number`).toBe('number');
          expect(Math.abs(got.value - ch.value), `${at}: ${got.value} vs key ${ch.value}`).toBeLessThanOrEqual(typeof ch.tol === 'number' ? ch.tol : 0.005);
        }
        if (ch.reason_includes) expect(String(got.reason ?? ''), at).toContain(ch.reason_includes);
        for (const f of ch.flags_include || []) expect(got.flags, `${at}: flag ${f}`).toContain(f);
        for (const f of ch.flags_exclude || []) expect(got.flags, `${at}: no flag ${f}`).not.toContain(f);
      }
    });
  }
});
