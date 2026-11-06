// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 7, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0d (part 1 of 5). RED FIRST: `scripts/lib/compute/maxbld/rows.js` and the
// layer-3 evaluation hooks (B5) do not exist yet.
//   LC-69 / M-392 the footprint shape switch: off by default the reading is a box (`shape_box_assumed`); on with
//          no fitted provenance it refuses (FOOT-17 `shape_factor_not_fitted`); on with a fitted factor it is
//          `shape_calibrated`. R3-01 (A0067) refuses on an undecided existing-building fact. R3-02 the same
//          factors feed `gfa_max_m2`. L31-14 storeys from the minimum ceiling.
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
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options, // operator "a" on Q-A (R3-11 fails closed without it); the switch-on, D-5
});

const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });
const NE = (r: string): Json => ({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: r });

let SEEDS: Json;
let R: Json;
const baseL2 = (): Json => ({
  rear_setback_m: cell(10),
  side_setback_m: cell(1.5),
  building_depth_m: cell(19),
  building_length_m: cell(17),
  lot_coverage_pct: cell(33),
});
const base = (): Json => ({
  seeds: SEEDS,
  l2: baseL2(),
  geometry: { lot_frontage_m: 15, lot_depth_m: 40, lot_area_m2: 600 },
  rows: { front_setback_used_m: { value: 6 } },
  flags: { corner_lot: false },
});

describe('MB-31 footprint shape switch, LC-69 / M-392 (waits B5)', () => {
  beforeAll(() => {
    SEEDS = loadSeeds();
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  });

  it('switch off (default): the reading is a box, 198 m2', () => {
    const out = R.runRow('footprint_max_m2', base());
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(198, 6);
    expect(out.flags).toContain('shape_box_assumed');
    expect(out.flags).not.toContain('shape_calibrated');
  });

  it('switch on with no provenance refuses (FOOT-17)', () => {
    const out = R.runRow('footprint_max_m2', { ...base(), switches: { 'reading:shape_calibration': 'on' } });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('shape_factor_not_fitted');
    expect(out.value).toBeNull();
  });

  it('switch on with a fitted factor: calibrated, same 198 m2', () => {
    const out = R.runRow('footprint_max_m2', {
      ...base(),
      switches: { 'reading:shape_calibration': 'on' },
      settings: { footprint_shape_factor: { value: 1, provenance: 'fit-1' } },
    });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(198, 6);
    expect(out.flags).toContain('shape_calibrated');
    expect(out.flags).not.toContain('shape_box_assumed');
  });

  it('R3-01 (A0067): an undecided existing-building fact refuses, two undecided entries', () => {
    const reason = 'existing_building_facts:lot_frontage_m';
    const out = R.runRow('footprint_max_m2', {
      seeds: SEEDS,
      l2: {
        rear_setback_m: cell(9.52),
        side_setback_m: cell(0.9),
        building_depth_m: NE(reason),
        building_length_m: NE(reason),
        lot_coverage_pct: cell(33),
      },
      geometry: { lot_frontage_m: 15.23, lot_depth_m: 38.08, lot_area_m2: 580.13 },
      rows: { front_setback_used_m: { value: 6.735 } },
      flags: { corner_lot: false },
    });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe(reason);
    expect(out.undecided).toHaveLength(2);
  });

  it('a front setback that leaves no depth room is not_buildable with a null value', () => {
    const inp = base();
    inp.rows = { front_setback_used_m: { value: 35 } };
    const out = R.runRow('footprint_max_m2', inp);
    expect(out.status).toBe('not_buildable');
    expect(out.value).toBeNull();
    const room = R.runRow('depth_room_m', inp);
    expect(room.status).toBe('not_buildable');
  });

  it('R3-02: gfa_max_m2 carries the box assumption and takes min(198 x 3, 0.6 x 600) = 360', () => {
    const inp = base();
    inp.l2 = { ...baseL2(), height_storeys: cell(3), height_m: cell(10), fsi: cell(0.6) };
    inp.switches = { 'formula:gfa_max_m2:increment_2': 'off' }; // the increment-1 formula under test (operator D-5; the MK-2 / Q-RND-SW form)
    const out = R.runRow('gfa_max_m2', inp);
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(360, 6);
    expect(out.flags).toContain('shape_box_assumed');
    const permitted = R.runRow('permitted', { seeds: SEEDS, perm: { code: 0, gate: null } });
    expect(permitted.status).toBe('permitted');
  });

  it('L31-14: storeys from the minimum ceiling, and the S-1 boundary at 8.048 m', () => {
    const unlimited = { s: 'applies', kind: 'unlimited', value: null, clause: 'c', reason: null };
    const fromCeiling = R.runRow('storeys_max', {
      seeds: SEEDS,
      l2: { height_storeys: unlimited, height_m: cell(9.0) },
    });
    expect(fromCeiling.status).toBe('computed');
    expect(fromCeiling.value).toBe(3);
    expect(fromCeiling.flags).toContain('storeys_from_minimum_ceiling');
    expect(0.512 + 3 * 2.512).toBeLessThanOrEqual(9.0);

    const stored = R.runRow('storeys_max', { seeds: SEEDS, l2: { height_storeys: cell(3), height_m: cell(9.0) } });
    expect(stored.status).toBe('computed');
    expect(stored.flags).not.toContain('storeys_from_minimum_ceiling');

    const hi = R.runRow('storeys_max', { seeds: SEEDS, l2: { height_storeys: unlimited, height_m: cell(8.048) } });
    const lo = R.runRow('storeys_max', { seeds: SEEDS, l2: { height_storeys: unlimited, height_m: cell(8.047) } });
    expect(hi.value).toBe(3);
    expect(lo.value).toBe(2);
  });
});
