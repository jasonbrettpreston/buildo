// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan section 23.1)
// MB-31 · stage 8 OUTPUT panel REVISE (output-panel-1102/adjudication.md RV-1..RV-4, RV-6): red first, before the fix.
//
//   RV-1 `CAT.settingDecls` carries seed `default`, `min`, `max` for every catalogue setting.
//   RV-2 `CM.censusOf(rows, U)` derives the closure / flags census from the emitted rows (never from a lookup object),
//        `CM.materializeRows` seeds `closed` with `closure_violations` and `flags_missing` at 0.
//   RV-3 `CM.READ_SQL.abutters` projects the fields the neighbour reader consumes, correlated to the batch subject (MB-31 (e): no bind of its own);
//        `NF.neighbourFacts` still reads the projected names onto its facts.
//   RV-4 `CM.contentSha` hashes the row's increment and the building-types seed sha (content, not just status).
//   RV-6 the descriptor's buildSourceSql deviation is retired once the runner binds land (MB-31 (e); before: it cited 22.1).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const DESCRIPTOR = path.join(ROOT, 'scripts/compute-maxbld-scenarios.descriptor.json');

const CAT_PATH = 'scripts/lib/compute/maxbld/catalogue.js';
const CM_PATH = 'scripts/lib/compute/compute-maxbld-scenarios.js';
const NF_PATH = 'scripts/lib/compute/maxbld/neighbour-facts.js';

const U: Json = {
  lv: { s_m: 'm' },
  l2: {},
  names: { r_a: 'm', g_m: 'm' },
  flags: [],
};

const ROWS: Json[] = [
  { status: 'computed', value: 1, flags: [], reason: null, trace: [{ kind: 'row', id: 'r_a' }, { kind: 'geometry', id: 'g_m' }, { kind: 'lv', id: 's_m' }] },
  { status: 'computed', value: 1, flags: [], reason: null, trace: [{ kind: 'fact', id: 'nowhere' }] },
  { status: 'computed', value: 1, flags: [], reason: null, trace: [{ kind: 'lv', id: 'no_setting' }] },
  { status: 'computed', value: 1, flags: [], reason: null, trace: [{ kind: 'l2', id: 'anything' }] },
  { status: 'not_evaluated', value: null, flags: [], reason: null, trace: [] },
  { status: 'not_evaluated', value: null, flags: [], reason: 'missing_input:x', trace: [] },
  { status: 'not_applicable', value: null, flags: ['f'], reason: null, trace: [] },
  { status: 'computed', value: 1, flags: [], reason: null, trace: [{ kind: 'row', id: 'r_a' }] },
];

const BASE_ROW: Json = {
  parcel_id: 1,
  building_type: 'b',
  field_id: 'r',
  increment: '1',
  status: 'computed',
  value: 1,
  unit: 'm',
  reason: null,
  flags: [],
  trace: [],
  switches: [],
  catalogue_sha: 'c',
  switchboard_sha: 's',
  settings_sha: 't',
  layer2_table_version: 'v',
  building_types_sha: 'bt',
};

describe('MB-31 OUTPUT panel 1102 fixes', () => {
  it('RV-1: settingDecls carries the seeded default, min and max', () => {
    const CAT = req(path.join(ROOT, CAT_PATH)) as Json;
    const decls = CAT.settingDecls({ settings: [{ id: 'x_m', unit: 'm' }] }, { x_m: { default: 2, min: 1, max: 4 } });
    expect(decls.x_m).toBeTypeOf('object');
    expect(decls.x_m.default).toBe(2);
    expect(decls.x_m.min).toBe(1);
    expect(decls.x_m.max).toBe(4);
  });

  it('RV-2a: censusOf derives closure_violations and flags_missing from the rows', () => {
    const CM = req(path.join(ROOT, CM_PATH)) as Json;
    expect(CM.censusOf).toBeTypeOf('function');
    const census = CM.censusOf(ROWS, U);
    expect(census).toBeTypeOf('object');
    for (const key of ['status_outside_closed_set', 'numbers_without_trace', 'not_buildable_with_value', 'closure_violations', 'flags_missing']) {
      expect(typeof census[key], key).toBe('number');
    }
    expect(census.closure_violations).toBe(2);
    expect(census.flags_missing).toBe(1);
  });

  it('RV-2b: materializeRows seeds closure_violations and flags_missing at 0', () => {
    const CM = req(path.join(ROOT, CM_PATH)) as Json;
    const out = CM.materializeRows([], { lookups: {} });
    expect(Object.prototype.hasOwnProperty.call(out.matched, 'closure_violations')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(out.matched, 'flags_missing')).toBe(true);
    expect(out.matched.closure_violations).toBe(0);
    expect(out.matched.flags_missing).toBe(0);
  });

  it('RV-3: the abutters read projects the neighbour fields and is correlated to the batch subject (MB-31 (e)), with no bind of its own', () => {
    const CM = req(path.join(ROOT, CM_PATH)) as Json;
    const NF = req(path.join(ROOT, NF_PATH)) as Json;
    const sql: string = CM.READ_SQL.abutters;
    expect(sql).toBeTypeOf('string');
    for (const needle of ['same_frontage_street', 'neighbour_residential', ' AS est', ' AS bldg_m', ' AS same_street', ' AS residential']) {
      expect(sql, needle).toContain(needle);
    }
    expect(sql).toContain('a.parcel_id = s.id');
    expect(sql).not.toMatch(/\$\d/);

    const out = NF.neighbourFacts(
      { neighbours: [{ neighbour_id: 7, est: 4.5, bldg_m: 10, est_status: 'estimated', same_street: true, residential: true }] },
      { s: 'applies', kind: 'number', value: 30, clause: 'c', reason: null },
    );
    expect(out.facts.nbr_q_n).toBe(1);
    expect(out.facts.nbr_q_bad_n).toBe(0);
    expect(out.facts.nbr_q_est_mean_m).toBe(4.5);
  });

  it('RV-4: contentSha hashes the increment and the building-types seed sha', () => {
    const CM = req(path.join(ROOT, CM_PATH)) as Json;
    expect(CM.contentSha).toBeTypeOf('function');
    const base = CM.contentSha(BASE_ROW);
    expect(base).toBeTypeOf('string');
    expect(CM.contentSha({ ...BASE_ROW, increment: '2' })).not.toBe(base);
    expect(CM.contentSha({ ...BASE_ROW, building_types_sha: 'bt2' })).not.toBe(base);
    expect(CM.contentSha({ ...BASE_ROW })).toBe(base);
  });

  // MB-31 (e) (operator "a yes" 2026-11-11, D-6 / D-7): the runner bind build of plan 22.1 landed, so the open buildSourceSql deviation retires
  it('RV-6: the buildSourceSql deviation that waited plan 22.1 is retired once the runner binds land (MB-31 (e))', () => {
    const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR, 'utf8')) as Json;
    expect(descriptor.deviations).toBe('none');
    expect(typeof req(path.join(ROOT, CM_PATH)).buildSourceSql).toBe('function');
  });
});
