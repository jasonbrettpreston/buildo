// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 18, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0c. RED FIRST: `scripts/seeds/bylaw/switchboard.json` and
// `scripts/lib/compute/maxbld/rows.js` do not exist yet.
//   M-378 the switchboard is DATA: twelve rows, one per live switch, provably unique, exactly one `off`.
//   B9    `runRow` honours it: a switched-off formula or building type makes the row `not_evaluated` with a
//         `switched_off:` reason and a NULL value (never 0); the permission row reports its switches; the clause
//         switch (waits B5) refuses a cell by its own clause id.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const KINDS = ['building_type', 'formula', 'reading', 'clause'];

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});

const heightCell = (clause: string | null): Json => ({ height_m: { s: 'applies', kind: 'number', value: 9, clause, reason: null } });

describe('MB-31 switchboard data (M-378)', () => {
  let SW: Json;
  let CAT: Json;
  beforeAll(() => {
    SW = readJson('scripts/seeds/bylaw/switchboard.json');
    CAT = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
  });

  it('schema, twelve rows, unique ids, closed kind/state vocabularies', () => {
    expect(SW.schema).toBe('switchboard-v1');
    expect(SW.rows).toHaveLength(12);
    const ids = SW.rows.map((r: Json) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of SW.rows) {
      expect(KINDS).toContain(row.kind);
      expect(['on', 'off']).toContain(row.state);
    }
  });

  it('the only off row is reading:shape_calibration', () => {
    expect(SW.rows.filter((r: Json) => r.state === 'off').map((r: Json) => r.id)).toEqual(['reading:shape_calibration']);
  });

  it('one formula switch per catalogue row plus the detached_house building type', () => {
    const ids = SW.rows.map((r: Json) => r.id);
    for (const row of CAT.rows) expect(ids, row.id).toContain(`formula:${row.id}`);
    expect(ids).toContain('building_type:detached_house');
  });
});

describe('MB-31 switchboard behaviour (B9)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('S1 a switched-off formula is not_evaluated with a switched_off reason and a null value', () => {
    const out = R.runRow('height_max_m', {
      seeds: SEEDS,
      l2: heightCell('c'),
      switches: { 'formula:height_max_m': 'off' },
    });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('switched_off:formula:height_max_m');
    expect(out.value).toBeNull();
  });

  it('S2 a switched-off building type refuses the row the same way', () => {
    const out = R.runRow('height_max_m', {
      seeds: SEEDS,
      l2: heightCell('c'),
      switches: { 'building_type:detached_house': 'off' },
    });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason.startsWith('switched_off:')).toBe(true);
  });

  it('S4 permitted: the switch list, the gate and every permission code', () => {
    const ok = R.runRow('permitted', { seeds: SEEDS, perm: { code: 0, gate: null } });
    expect(ok.status).toBe('permitted');
    expect(ok.switches.map((s: Json) => s.id)).toEqual(['formula:permitted', 'building_type:detached_house']);
    for (const s of ok.switches) expect(s.state).toBe('on');

    const prohibited = R.runRow('permitted', { seeds: SEEDS, perm: { code: 1, gate: null, clause: '10.20.20.40(1)' } });
    expect(prohibited.status).toBe('not_permitted');
    expect(prohibited.reason).toBe('10.20.20.40(1)');

    const gated = R.runRow('permitted', { seeds: SEEDS, perm: { code: 0, gate: 'lot_metric_missing' } });
    expect(gated.status).toBe('not_permitted');
    expect(gated.reason).toBe('lot_gate:lot_metric_missing');

    const unknown = R.runRow('permitted', { seeds: SEEDS, perm: { code: 2, gate: null, reason: 'condition_unknown:x' } });
    expect(unknown.status).toBe('not_evaluated');
    expect(unknown.reason).toBe('condition_unknown:x');
  });
});

describe('MB-31 clause switch (waits B5)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('a clause switched off in the switchboard refuses the row that read it', () => {
    const out = R.runRow('height_max_m', {
      seeds: SEEDS,
      l2: heightCell('10.20.40.10(1)#(1)(A)'),
      switches: { 'clause:10.20.40.10(1)#(1)(A)': 'off' },
    });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('clause_switched_off:10.20.40.10(1)#(1)(A)');
  });

  it('the same row with no switch override computes its value', () => {
    const out = R.runRow('height_max_m', { seeds: SEEDS, l2: heightCell('10.20.40.10(1)#(1)(A)') });
    expect(out.status).toBe('computed');
    expect(out.value).toBe(9);
  });
});
