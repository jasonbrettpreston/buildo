// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-476, M-458 (revisions behind their own switch), M-385 / R3-01 (a lot that cannot take the house is not_buildable, never zero);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.9 (FD-1..FD-6)
//
// MB-27 increment 5 Part B · lane B5B-4 · RED FIRST (evidence docs/reports/red-evidence/bylaw/inc5-narrow-lot-red.txt, captured on the tree without the revision).
// Operator 2026-11-12 ("narrow y and through y", WALK2-20261112.md:654): a lot whose computed house is narrower than the 3.0 m minimum answers not_buildable.
// The revision is Layer 3 data on buildable_width_m behind its own switch; the 3.0 m is the setting compute_maxbld_scenarios_plate_min_dimension_m (migration 316), never a literal.
// No golden lot is this narrow (parcels 151285, 359836, 58666 are the cohort cases), so the rows are tested on declared inputs.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const SW = 'formula:buildable_width_m:increment_5';

const seeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options,
});
const num = (value: number, clause = 'c'): Json => ({ s: 'applies', kind: 'number', value, clause });
const lot = (frontage: number): Json => ({
  l2: { side_setback_m: num(0.45, '10.10.40.70(4)#(4)(A)'), side_setback_street_m: num(0.45) },
  geometry: { lot_frontage_m: frontage, lot_depth_m: 31.38, lot_area_m2: frontage * 31.38 },
  flags: { corner_lot: false },
});

describe('narrow lot: buildable_width_m under 3.0 m is not_buildable (increment 5 revision, own switch)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = seeds();
  });

  it('the switchboard declares the formula switch, on, with its ruling, and the row carries the revision', () => {
    const sw = (SEEDS.switchboard.rows as Json[]).find((x) => x.id === SW) as Json;
    expect([sw?.kind, sw?.state]).toEqual(['formula', 'on']);
    const row = (SEEDS.catalogue.rows as Json[]).find((r) => r.id === 'buildable_width_m') as Json;
    expect((row.revisions as Json[]).some((v) => v.switch === SW && v.increment === '5')).toBe(true);
  });
  it('a 2.9 m width (3.8 m frontage, 0.45 m each side) is not_buildable and carries no value', () => {
    const out = R.runRow('buildable_width_m', { ...lot(3.8), seeds: SEEDS });
    expect(out.status).toBe('not_buildable');
    expect(out.value ?? null).toBeNull();
    expect(out.switches).toContainEqual({ id: SW, state: 'on' });
  });
  it('a 3.0 m width is the minimum itself and is computed; a 4.09 m width (A0375) is unchanged', () => {
    const at = R.runRow('buildable_width_m', { ...lot(3.9), seeds: SEEDS });
    expect(at.status).toBe('computed');
    expect(at.value).toBeCloseTo(3.0, 9);
    const wide = R.runRow('buildable_width_m', { ...lot(4.99), seeds: SEEDS });
    expect(wide.status).toBe('computed');
    expect(wide.value).toBeCloseTo(4.09, 9);
  });
  it('the revision off reverts to the increment 2 formula: the 2.9 m width is computed, the switch listed as off', () => {
    const out = R.runRow('buildable_width_m', { ...lot(3.8), seeds: SEEDS, switches: { [SW]: 'off' } });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(2.9, 9);
    expect(out.switches).toContainEqual({ id: SW, state: 'off' });
  });
});
