// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72 (a Layer 3 row is an expression over declared names; existing grammar only),
//            M-496 (the circulation share 0.10 and the minimum unit size 30 m2 net), M-481 (a reading row carries its confidence), R3-01
//
// MB-27 increment 3 · lane E · E8 · RED FIRST. Operator 2026-11-08 (late): units form (i), existing grammar only (no new DSL construct, no
// evaluator move); inc3 plan-delta.md "branch-lock red tests". Lane T: every golden lot reaches units = 4, so each branch is locked here by
// hand arithmetic on a small fixture, not by a golden lot. Settings: circulation share 0.10 (livable = 0.9 x floor area), minimum unit 30 m2
// net, cap 4 (units_max). Floors counted: min(wall_storeys; storeys_max) full floors at footprint_max_m2, storeys_above_wall at setback_plate_m2
// (flat form) or the counted attic (pitched form), and the basement at the footprint (DL-17 (i) a).
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

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

describe('MB-27 increment 3 E8 (units form (i)): the area count, the cap, bedrooms and per-unit area, by branch', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  const inputs = (rows: Json, bedrooms = 12): Json => ({
    seeds: SEEDS,
    buildingType: 'detached_houseplex',
    geometry: { lot_area_m2: 400 },
    rows: { storeys_max: { value: 3 }, units_max: { value: 4 }, setback_plate_m2: { value: 0 }, attic_counted_a_m2: { value: 0 }, attic_counted_b_m2: { value: 0 }, ...rows },
    l2: { bedrooms: num(bedrooms) },
    neighbours: { bt_units: 4 },
  });
  const pick = (list: Json[], id: string): Json => list.find((r: Json) => r.row === id) as Json;

  // (a) min() below the cap: F = 40, 2 wall storeys, nothing above: floor(0.9 x 40 / 30) = 1 per floor, 2 floors + the basement = 3.
  const A = (): Json => inputs({ footprint_max_m2: { value: 40 }, wall_storeys: { value: 2 }, storeys_above_wall: { value: 0 }, gfa_max_m2: { value: 101 } });
  // (b) the cap: F = 100: 3 per floor x 2 + 1 (plate 60 m2: floor(54 / 30)) + 3 (basement) = 10, clamped to 4.
  const B = (): Json => inputs({ footprint_max_m2: { value: 100 }, wall_storeys: { value: 2 }, storeys_above_wall: { value: 1 }, setback_plate_m2: { value: 60 }, gfa_max_m2: { value: 260 } });

  it('(a) the area count below the cap wins: units = 3, not 4', () => {
    const u = pick(R.runAllRows(A()), 'unit_count');
    expect([u.status, u.value]).toEqual(['computed', 3]);
  });

  it('(b) the cap clamps: the area count is 10 and units = 4', () => {
    const u = pick(R.runAllRows(B()), 'unit_count');
    expect([u.status, u.value]).toEqual(['computed', 4]);
  });

  it('(c) bedrooms with units <> 4 is not_evaluated with its reason (R3-01), never a number', () => {
    const b = pick(R.runAllRows(A()), 'houseplex_bedrooms');
    expect(b.status).toBe('not_evaluated');
    expect(String(b.reason)).toMatch(/units/);
    expect(b.value).toBeNull();
  });

  it('(d) units = 4 shows the stored Layer 2 bedrooms', () => {
    const b = pick(R.runAllRows(B()), 'houseplex_bedrooms');
    expect([b.status, b.value]).toEqual(['computed', 12]);
  });

  it('per-unit area (3a): 0.9 x (headline GFA + basement F) / units, unrounded', () => {
    const p = pick(R.runAllRows(A()), 'unit_area_m2');
    expect(p.status).toBe('computed');
    expect(p.value).toBeCloseTo((0.9 * (101 + 40)) / 3, 9); // 42.3
  });

  it('the house type carries none of the houseplex rows (no detached_house cell moves)', () => {
    const ids = R.runAllRows({ ...A(), buildingType: 'detached_house' }).map((r: Json) => r.row);
    for (const id of ['unit_count', 'houseplex_bedrooms', 'unit_area_m2', 'basement_units', 'basement_livable_m2']) expect(ids).not.toContain(id);
  });
});
