// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 18, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0d (part 3 of 5). RED FIRST: `scripts/lib/compute/compute-maxbld-scenarios.js`
// does not exist yet.
//   G68-11 two calls of `buildParcelRows` on the same input produce byte-identical row content: the content_sha
//          list is equal, the status/value/reason triple list hashes the same, and re-ordering the parcel input
//          keys changes nothing (canonical JSON, not map order). One parcel yields ten rows.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
});

const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });
const GEOMETRY: Json = { lot_frontage_m: 15, lot_depth_m: 40, lot_area_m2: 600 };
const UNREGULATED: Json = { s: 'applies', kind: 'unregulated', value: null, clause: 'c', reason: null };
const META: Json = { layer2_table_version: 'v-test', settings_sha: 's-test' };
const SHA_INPUTS = 'sha256';

const makeParcel = (reverse: boolean): Json => {
  const entries: [string, any][] = [
    ['parcel_id', 205238],
    [
      'l2',
      {
        rear_setback_m: cell(10),
        side_setback_m: cell(1.5),
        building_depth_m: cell(19),
        building_length_m: cell(17),
        lot_coverage_pct: cell(33),
        height_m: cell(10),
        height_storeys: cell(3),
        fsi: cell(0.6),
        dwelling_units_max: UNREGULATED,
      },
    ],
    ['perm', { code: 0, gate: null }],
    ['geometry', GEOMETRY],
    ['flags', { corner_lot: false }],
    ['neighbours', { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: 1 }],
  ];
  return Object.fromEntries(reverse ? [...entries].reverse() : entries);
};

const triple = (rows: Json[]): string =>
  crypto
    .createHash(SHA_INPUTS)
    .update(JSON.stringify(rows.map((r) => ({ status: r.status, value: r.value, reason: r.reason }))))
    .digest('hex');

describe('MB-31 determinism, G68-11 (waits B5)', () => {
  let S: Json;
  let SEEDS: Json;
  beforeAll(() => {
    S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('two calls on the same parcel give one hundred and two equal rows', () => {
    const a = S.buildParcelRows(makeParcel(false), SEEDS, META);
    const b = S.buildParcelRows(makeParcel(false), SEEDS, META);
    expect(a).toHaveLength(102); // MB-27 inc3 E8 (DL-21 a): 47 house rows plus 47 houseplex rows (every row lists both types) plus 8 houseplex-only rows; was 47 // MB-27 switch-on (operator D-5): the three GFA form rows are shown with their switches on; was 44 (D3 a), was 10
    expect(b).toHaveLength(102);
    const pick = (rows: Json[]) => rows.map((r) => [r.field_id, r.status, r.value, r.reason, r.content_sha]);
    expect(pick(a)).toEqual(pick(b));
  });

  it('key order of the parcel input does not change the content hashes', () => {
    const a = S.buildParcelRows(makeParcel(false), SEEDS, META);
    const c = S.buildParcelRows(makeParcel(true), SEEDS, META);
    expect(c.map((r: Json) => r.content_sha)).toEqual(a.map((r: Json) => r.content_sha));
  });

  it('the status/value/reason triple list hashes the same across both calls', () => {
    const a = S.buildParcelRows(makeParcel(false), SEEDS, META);
    const b = S.buildParcelRows(makeParcel(false), SEEDS, META);
    const ha = triple(a);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
    expect(triple(b)).toBe(ha);
  });
});
