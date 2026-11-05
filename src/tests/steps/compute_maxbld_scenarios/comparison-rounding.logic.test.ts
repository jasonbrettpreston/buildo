// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-461, M-470 (MB-27 increment 2; the evaluator contract "Both values are rounded at 9 places first", evaluate-l3.mjs compare / bestOf)
//
// MB-27 · McBylaws queue · lane K · stage 6, a separate change held for an operator ruling. RED FIRST: the step's runner
// passes the evaluator `round9: (x) => x` (rows.js), so a comparison the key states at an exact decimal edge is decided
// by binary noise: PITCH-9 (pitch (7.3 − 7.0) ÷ 3 = 0.1 exactly at the 1:10 threshold, "offered") and the block /
// no-block ties of ATTIC-13 (arm B) and ATTIC-15 A0354 (arm A), where the key takes the block. golden-25 stays green.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const loadSeeds = (): Json => {
  const vocab = readJson('scripts/seeds/bylaw/vocab.json');
  // until P3 lands on the base: the threshold target P3 adds (M-465 (4)); a no-op once vocab.json declares it
  vocab.dsl_target.pitched_roof_slope_min = vocab.dsl_target.pitched_roof_slope_min || { unit: 'ratio' };
  return {
    catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
    switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
    buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
    logicVariables: readJson('scripts/seeds/logic_variables.json'),
    vocab,
    layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  };
};
const n = (value: number): Json => ({ s: 'applies', kind: 'number', value, clause: 'example' });
const UNREG: Json = { s: 'applies', kind: 'unregulated', value: null, clause: null };
const UNLIM: Json = { s: 'applies', kind: 'unlimited', value: null, clause: 'example' };
const ATTIC: Json = { attic_counted_clearance_m: n(1.4), attic_qualifying_clearance_m: n(2), attic_qualifying_share_pct: n(80), attic_qualifying_area_m2: n(10), element_width_pct: n(40), pitched_roof_slope_min: n(0.1), roof_slope_max: UNREG };

describe('MB-27 comparisons at 9 places in the step runner (held for a ruling)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('PITCH-9: H 7.3, Hw 7.0, half-span 3: the pitch is 0.1, the 1:10 edge, so the pitched form is offered (2 x F = 200)', () => {
    const out = R.runRow('gfa_pitched_a_m2', {
      seeds: SEEDS, geometry: { lot_area_m2: 1000 },
      l2: { height_m: n(7.3), main_wall_height_m: n(7), roof_slope_max: UNREG, pitched_roof_slope_min: n(0.1), fsi: UNLIM },
      rows: { front_rear_wall_width_m: { value: 6 }, footprint_max_m2: { value: 100 }, storeys_max: { value: 2 } },
      switches: { 'formula:gfa_pitched_a_m2': 'on' }, // the form under test; Q-default a switches it off by default (operator Q-RND-SW a)
    });
    expect([out.status, out.value]).toEqual(['computed', 200]);
  });

  it('ATTIC-13 arm B (A0179): block and no-block tie at 3 x F; the key takes the block, counted 0.5 x 79.1505 = 39.575', () => {
    const out = R.runRow('attic_counted_b_m2', {
      seeds: SEEDS, geometry: { lot_area_m2: 600 },
      l2: { ...ATTIC, fsi: UNLIM, main_wall_height_m: n(7), height_m: n(9.5), main_wall_side_share_pct: n(70), main_wall_front_rear_share_pct: n(50) },
      rows: { footprint_max_m2: { value: 79.1505 }, storeys_max: { value: 3 }, half_span_a_m: { value: 2.925 }, half_span_b_m: { value: 6.765 } },
    });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(39.575, 3);
  });

  it('ATTIC-15 A0354 arm A: the same tie; the key takes the block, counted 0.7 x 114.50286 = 80.152', () => {
    const out = R.runRow('attic_counted_a_m2', {
      seeds: SEEDS, geometry: { lot_area_m2: 147.2175 },
      l2: { ...ATTIC, fsi: n(1), main_wall_height_m: n(7), main_wall_side_share_pct: n(70) },
      rows: { footprint_max_m2: { value: 114.50285714285715 }, storeys_max: { value: 3 }, half_span_a_m: { value: 3.3677 }, roof_pitch_a: { value: 0.44541 } },
    });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(80.152, 3);
  });
});
