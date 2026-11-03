// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 19.7, 20.2)
//
// MB-31 · E31-01 oracle-only brief B0c. RED FIRST: the C1 seed rows, the B12 descriptor and the B8 catalogue
// module do not exist yet.
//   Part 1 pins the settings seed: every catalogue setting is a live logic variable with its bounds, its pinned
//          values, its citations and its units.
//   Part 2 proves the run is REFUSED before compute: `resolveConfig` rejects an out-of-bounds or missing settings
//          row, and the error names the setting (SB-1, SB-2, SB-3, SB-6, SB-4). The message wording
//          `setting_out_of_bounds` is an OPEN decision (D-1) and is deliberately NOT asserted.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runnerVariableRows } from '../../helpers/runner-variables';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href) as Promise<Json>;
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const LV_PATH = 'scripts/seeds/logic_variables.json';
const DESCRIPTOR_PATH = 'scripts/compute-maxbld-scenarios.descriptor.json';
const RING_DEPTH = 'fya_placeholder_ring_depth';
const RING_MIN_N = 'fya_placeholder_ring_min_n';
const POPULATION = [
  '6640', '30065', '30554', '33830', '119522', '120669', '122034', '153191', '159079', '169742', '170105', '173273',
  '205238', '216666', '258388', '274216', '283723', '304365', '313999', '403569', '410720', '427312', '428050', '442123',
  '461807',
];
const POPULATION_INTS = POPULATION.map(Number);

describe('MB-31 settings seeds (waits C1 seeds)', () => {
  let CAT: Json;
  let LV: Json;
  beforeAll(() => {
    CAT = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
    LV = readJson(LV_PATH);
  });

  it('every catalogue setting is a live logic variable', () => {
    for (const setting of CAT.settings) expect(LV[setting.id], setting.id).toBeTruthy();
  });

  it('pinned settings carry min === max === default', () => {
    const pinned: Array<[string, number]> = [
      ['s1_ceiling_min_m', 2.3],
      ['s1_floor_assembly_m', 0.212],
      ['s1_parapet_m', 0.3],
      ['s2_first_floor_above_grade_m', 0],
      ['footprint_shape_factor', 1],
    ];
    for (const [id, value] of pinned) {
      expect(LV[id].default, id).toBe(value);
      expect(LV[id].min, id).toBe(value);
      expect(LV[id].max, id).toBe(value);
    }
  });

  it('the FS-SB2a ring settings are calibration provisional with a 2..4 depth window', () => {
    expect(LV[RING_DEPTH].default).toBe(2);
    expect(LV[RING_DEPTH].min).toBe(2);
    expect(LV[RING_DEPTH].max).toBe(4);
    expect(LV[RING_MIN_N].default).toBe(1);
    expect(LV[RING_MIN_N].min).toBe(1);
    expect(LV[RING_MIN_N].max).toBe(4);
    for (const id of [RING_DEPTH, RING_MIN_N]) {
      expect(LV[id].description.startsWith('CARD-fs-sb2a'), id).toBe(true);
      expect(LV[id].description, id).toContain('Calibration provisional');
    }
  });

  it('the population parcel list is the pinned list of ids', () => {
    expect(LV.compute_maxbld_scenarios_population_parcel_ids.default).toEqual(POPULATION);
    const compute = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    expect(compute.populationIds(LV.compute_maxbld_scenarios_population_parcel_ids.default)).toEqual(POPULATION_INTS);
  });

  it('the porch allowance no longer averages, and the four FS-SB2a street/zone placeholders say so', () => {
    expect(LV.fya_porch_allowance_m.description).not.toContain('max(averaged');
    for (const id of [
      'fya_placeholder_street_radius_m',
      'fya_placeholder_street_min_n',
      'fya_placeholder_zone_radius_m',
      'fya_placeholder_zone_min_n',
    ]) {
      expect(LV[id].description, id).toContain('Amended by FS-SB2a');
    }
  });

  it('each catalogue setting unit agrees with its seed numeric type', () => {
    for (const setting of CAT.settings) {
      expect(typeof LV[setting.id].default, setting.id).toBe('number');
      expect(LV[setting.id].unit ?? setting.unit, setting.id).toBe(setting.unit);
    }
  });
});

describe('MB-31 run refusal before compute (waits B12 descriptor)', () => {
  let D: Json;
  let catalogue: Json;
  let descriptor: Json;

  beforeAll(async () => {
    D = await mod('scripts/analysis/bylaw/dsl.mjs');
    catalogue = readJson('scripts/seeds/bylaw/layer3-catalogue.json');
    descriptor = readJson(DESCRIPTOR_PATH);
  });

  /**
   * A fake pool shaped like the one in `src/tests/step-library.logic.test.ts`: it answers the runner-owned
   * `step_*` read with the seed values, then whatever `logicVars` rows the test hands it (absent = no row).
   */
  function fakePool(logicVars: Record<string, unknown> = {}) {
    const runnerRows = runnerVariableRows();
    const rows = Object.entries(logicVars).map(([variable_key, variable_value]) => ({
      variable_key,
      variable_value: Array.isArray(variable_value) ? 0 : variable_value,
      variable_value_json: Array.isArray(variable_value) ? variable_value : null,
    }));
    const record = async () => ({ rows: [...runnerRows, ...rows] });
    return { query: record, connect: async () => ({ query: record, release: () => {} }) };
  }

  const decls = (): Json[] => descriptor.config.logic_variables;
  const declOf = (id: string): Json => decls().find((d: Json) => d.name === id) as Json;
  const happy = (): Record<string, unknown> => {
    const registry = readJson(LV_PATH);
    const out: Record<string, unknown> = {};
    for (const d of decls()) out[d.name] = registry[d.name]?.default;
    return out;
  };
  const resolveWith = async (overrides: Record<string, unknown>) => {
    const { resolveConfig } = req(path.join(ROOT, 'scripts/lib/step/config.js')) as Json;
    return resolveConfig(fakePool({ ...happy(), ...overrides }), descriptor);
  };

  it('the descriptor declares the ring settings bounded, on_invalid fail, strict validation', () => {
    const depth = declOf(RING_DEPTH);
    expect(depth.min).toBe(2);
    expect(depth.max).toBe(4);
    expect(depth.on_invalid).toBe('fail');
    const minN = declOf(RING_MIN_N);
    expect(minN.min).toBe(1);
    expect(minN.max).toBe(4);
    expect(minN.on_invalid).toBe('fail');
    expect(descriptor.config.validation).toBe('strict');
  });

  it('the descriptor list_of for the population list is the same closed set', () => {
    expect(declOf('compute_maxbld_scenarios_population_parcel_ids').list_of).toEqual(POPULATION);
  });

  it('every lv() id the catalogue rows read is declared in the descriptor', () => {
    const declared = new Set(decls().map((d: Json) => d.name));
    for (const row of catalogue.rows.filter((r: Json) => r.form === 'expr')) {
      for (const id of D.l3RefsOf(D.parseExpr(row.expression, { layer: 'l3' })).lv) {
        expect(declared.has(id), `${row.id} -> lv(${id})`).toBe(true);
      }
    }
  });

  it('SB-1 / SB-2: a ring depth below 2 or above 4 refuses the run and names the setting', async () => {
    await expect(resolveWith({ [RING_DEPTH]: 1 })).rejects.toThrow(new RegExp(RING_DEPTH));
    await expect(resolveWith({ [RING_DEPTH]: 5 })).rejects.toThrow(new RegExp(RING_DEPTH));
  });

  it('SB-3: an unseeded ring depth refuses the run and names the setting', async () => {
    const { resolveConfig } = req(path.join(ROOT, 'scripts/lib/step/config.js')) as Json;
    await expect(resolveConfig(fakePool(happy()), descriptor)).resolves.toBeTruthy();
    const without = happy();
    delete without[RING_DEPTH];
    await expect(resolveConfig(fakePool(without), descriptor)).rejects.toThrow(new RegExp(RING_DEPTH));
  });

  it('SB-6 / SB-4: a ring min_n of 0 or 5 refuses the run and names the setting', async () => {
    await expect(resolveWith({ [RING_MIN_N]: 0 })).rejects.toThrow(new RegExp(RING_MIN_N));
    await expect(resolveWith({ [RING_MIN_N]: 5 })).rejects.toThrow(new RegExp(RING_MIN_N));
  });
});
