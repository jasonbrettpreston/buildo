// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-457..M-487 (MB-27 increment 2; McProof-signed answer key, M-479)
//
// MB-27 · McBylaws queue · lane K · stage 6. The increment-2 worked examples (Arithmetic and Ruling layers of
// ~/Buildo-scratch/mcbylaws/inc2/worked-examples.v2-draft.md) as fixtures, each run through the catalogue rows by the
// one runner (`runRow`). The increment-2 headline revision is switched on for every example (the examples ARE the
// increment-2 key) unless the example sets the switch itself. An example the key marks "inputs pending reload" is
// recorded, not asserted, until the MB-27.L2 axis night (it.todo); an example with no checks is a Source, process or
// disclosure statement the rows do not compute.
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

describe('MB-27 increment 2 worked examples (the McProof-signed key, M-479)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
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
    it(`${ex.id}: ${String(ex.key_answer).slice(0, 100)}`, () => {
      const inp = ex.inputs || {};
      const l2: Json = {};
      for (const [k, v] of Object.entries(inp.l2 || {})) l2[k] = cell(v);
      const rows: Json = {};
      for (const [k, v] of Object.entries(inp.rows || {})) rows[k] = slot(v);
      const inputs = { seeds: SEEDS, l2, rows, geometry: inp.geometry || {}, flags: inp.flags || {}, switches: { ...HEADLINE_ON, ...(inp.switches || {}) } };
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
