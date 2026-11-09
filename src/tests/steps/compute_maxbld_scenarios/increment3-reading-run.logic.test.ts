// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-397 (the uncapped O-3 reading shown beside the capped one), M-183
//            (a houseplex FSI not_applicable), M-481 (a reading row carries its confidence), M-415 (the row seam)
//
// MB-27 increment 3 · lane E · stage 4 · E7 items 2-3 · RED FIRST. Operator 2026-11-08 4a: "E7 reading-run (one second pass,
// named cell overridden) ... no storage, no night item", SIMPLE ("as simple and basic as possible ... limit scope creep").
// `runReadingRun` is one more pass over a COPY of the cells in which ONE named Layer 2 target's cell becomes not_applicable,
// only when its clause is one of the override's units. The first pass is byte-identical before and after, and `inputs` is
// never mutated. Detached_house seeds; the l2 fixture follows increment2-revisions.logic.test.ts.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = (x: unknown): Json => JSON.parse(JSON.stringify(x));

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options,
});
const num = (value: number, clause = 'c'): Json => ({ s: 'applies', kind: 'number', value, clause });

/** The same FSI-related switches the increment-2 headline tests name, so the pass is the seeded one (QD-2). */
const ON = {
  'formula:gfa_max_m2:increment_2': 'on',
  'formula:gfa_flat_m2': 'on',
  'formula:gfa_pitched_a_m2': 'on',
  'formula:gfa_pitched_b_m2': 'on',
};

describe('MB-27 increment 3 E7 (operator 4a): the reading run is one second pass, named cell overridden, nothing stored', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  // The detached_house fixture: the FSI cap (0.6 × 400 = 240 m2) is below the storeys ceiling (3 × 100 = 300 m2), so the cap
  // is what gfa_max_m2 reads. A not_applicable FSI cell (a) leaves the min cap-free, 300 m2.
  const FSI_CLAUSE = '10.80.40.40(1)#(1)(B)';
  const base = (): Json => ({
    seeds: SEEDS,
    switches: ON,
    geometry: { lot_area_m2: 400 },
    rows: {
      footprint_max_m2: { value: 100 }, storeys_max: { value: 3 },
      wall_storeys: { value: 3 }, storeys_above_wall: { value: 0 }, setback_plate_m2: { value: 0 },
    },
    l2: { fsi: num(0.6, FSI_CLAUSE) },
  });
  const head = (list: Json[]): Json => list.find((r: Json) => r.row === 'gfa_flat_m2') as Json;

  it('(b) the override on fsi, whose cell clause is in units, computes the flat headline gfa_flat_m2 without the FSI cap', () => {
    const inputs = base();
    expect(head(R.runAllRows(inputs)).value).toBe(240); // the base pass reads the cap
    const out = R.runReadingRun(inputs, { l2: 'fsi', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect([head(out).status, head(out).value]).toEqual(['computed', 300]); // 3 × 100: the storeys ceiling, uncapped
  });

  it('(a) the base pass is byte-identical before and after runReadingRun is called', () => {
    const inputs = base();
    const before = R.runAllRows(inputs);
    const snapshot = JSON.stringify(before);
    R.runReadingRun(inputs, { l2: 'fsi', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect(JSON.stringify(R.runAllRows(inputs))).toBe(snapshot);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('(c) with the cell clause NOT in units the reading run equals the base pass', () => {
    const inputs = base();
    const out = R.runReadingRun(inputs, { l2: 'fsi', as: 'not_applicable', units: ['another_clause'] });
    expect(JSON.stringify(out)).toBe(JSON.stringify(R.runAllRows(inputs)));
    expect(head(out).value).toBe(240);
  });

  it('(c2) a target other than the named one, and an unknown target, are unchanged', () => {
    const inputs = base();
    const out = R.runReadingRun(inputs, { l2: 'lot_coverage_pct', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect(JSON.stringify(out)).toBe(JSON.stringify(R.runAllRows(inputs)));
    const unknown = R.runReadingRun(inputs, { l2: 'no_such_target', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(R.runAllRows(inputs)));
  });

  it('(d) inputs.l2 is not mutated: the same object, the same cell, and an independent copy may be reused', () => {
    const inputs = base();
    const cellsBefore = clone(inputs.l2);
    const sameCell = inputs.l2.fsi;
    R.runReadingRun(inputs, { l2: 'fsi', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect(inputs.l2).toEqual(cellsBefore);
    expect(inputs.l2.fsi).toBe(sameCell);
    expect([inputs.l2.fsi.s, inputs.l2.fsi.value]).toEqual(['applies', 0.6]);
  });

  it('the second pass covers the same rows as the base pass, and inputs.l2 keeps its keys', () => {
    const inputs = base();
    const keys = Object.keys(inputs.l2);
    const out = R.runReadingRun(inputs, { l2: 'fsi', as: 'not_applicable', units: [FSI_CLAUSE] });
    expect(Object.keys(inputs.l2)).toEqual(keys);
    expect(out.length).toBe(R.runAllRows(inputs).length);
  });
});
