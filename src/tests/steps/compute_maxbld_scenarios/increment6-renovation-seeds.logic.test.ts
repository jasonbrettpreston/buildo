// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-189 (the max-build scenarios step), M-377 / M-378 (Layer 3 rows and the
//            switchboard are data), M-403 (LC-16), M-481 (a value carries its label), M-497 (what a unit governs);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.1 (the renovation rows), P5.2, P5.12
//
// MB-27 increment 6 (renovations) · lane INC6-B · operator rulings 2026-11-13 items 1-12 and UB-1..10 (DECISIONS-v2.md) ·
// McProof key approved 2026-11-13 · RED FIRST: no renovation building-type row, no increment-6 catalogue row, no renovation
// setting and no `renovation` block exist on the tree, so every case below fails on the missing data, never on a typo.
//   (1) the six renovation types (renovation_addition RA, renovation_expand RE, renovation_interior RI, renovation_basement_new RB,
//       renovation_basement_finish RF, renovation_basement_underpinned UB) are building-types rows: class detached_house, principal,
//       increment "6", their own switch, LC-16, and no add-on (item 8a: no garden suite on a renovation row).
//   (2) each has its building_type switch, on; every increment-6 catalogue row names only existing building types, is paired with its
//       switchboard formula row (the pairing the switchboard test pins), keeps its clauses and its unit.
//   (3) the two settings are laws in data: the suite interior share (0.85, bounded, labelled an operator value) and the basement
//       livable share (1.0 under a ceiling); there is no setting that would stand in for the owner's storeys (item 4 b).
//   (4) the SEMI SEAM (UB-7): building-types.json declares the envelope type per half-lot, both halves the detached house today, and
//       the envelope seal is taken only through that map: one reader, named in the map, and no other maxbld module asks the seam.
//   (5) the retired-module guard: the increment-6 module names no retired engine.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const RENO_ROWS = ['RA', 'RE', 'RI', 'RB', 'RF', 'UB'];
const RENO_TYPES: Record<string, string> = {
  RA: 'renovation_addition',
  RE: 'renovation_expand',
  RI: 'renovation_interior',
  RB: 'renovation_basement_new',
  RF: 'renovation_basement_finish',
  UB: 'renovation_basement_underpinned',
};
const RENO_MODULE = path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js');
const MAXBLD_DIR = path.join(ROOT, 'scripts/lib/compute/maxbld');
const SUITE_SHARE = 'compute_maxbld_scenarios_suite_interior_gfa_share';
const BASEMENT_SHARE = 'compute_maxbld_scenarios_reno_basement_livable_share';

const seeds = (): Json => ({
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
});
const rowOf = (rows: Json[], id: string): Json => rows.find((r) => r.id === id) as Json;
const boardIds = (sw: Json): string[] => (sw.rows as Json[]).map((s) => s.id);
const newCatalogueRows = (cat: Json): Json[] => (cat.rows as Json[]).filter((r) => r.increment === '6');
const withoutComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
const maxbldSources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
  };
  walk(MAXBLD_DIR);
  return out;
};

describe('increment 6 (1): the six renovation types are building-types rows', () => {
  it('each row is class detached_house, principal, increment 6, switched by building_type:<id>, ruled LC-16', () => {
    const rows = seeds().buildingTypes.rows as Json[];
    for (const code of RENO_ROWS) {
      const id = RENO_TYPES[code] as string;
      const row = rowOf(rows, id);
      expect([row?.class, row?.structure, row?.increment, row?.switch], id).toEqual(['detached_house', 'principal', '6', `building_type:${id}`]);
      expect((row?.rules as string[]) ?? [], id).toContain('LC-16');
    }
  });
  it('no renovation row is an add-on (item 8a: no garden suite on a renovation row)', () => {
    const rows = seeds().buildingTypes.rows as Json[];
    for (const code of RENO_ROWS) expect(rowOf(rows, RENO_TYPES[code] as string)?.addon_of ?? null, RENO_TYPES[code]).toBeNull();
  });
});

describe('increment 6 (2): the switches and the new catalogue rows', () => {
  it('each renovation type has its building_type switch, on', () => {
    const sw = seeds().switchboard;
    for (const code of RENO_ROWS) {
      const s = rowOf(sw.rows as Json[], `building_type:${RENO_TYPES[code]}`);
      expect([s?.kind, s?.state], RENO_TYPES[code]).toEqual(['building_type', 'on']);
    }
  });
  it('every increment-6 catalogue row names only existing building types, carries clauses and a unit, and has its formula switch', () => {
    const s = seeds();
    const ids = new Set((s.buildingTypes.rows as Json[]).map((b) => b.id));
    const rows = newCatalogueRows(s.catalogue);
    expect(rows.length).toBeGreaterThan(0);
    const board = boardIds(s.switchboard);
    const unpaired = rows.filter((r) => !board.includes(`formula:${r.id}:increment_6`) && !board.includes(`formula:${r.id}`)).map((r) => r.id);
    expect(unpaired).toEqual([]);
    const unknown = rows.filter((r) => !Array.isArray(r.building_type) || !r.building_type.length || r.building_type.some((b: string) => !ids.has(b))).map((r) => r.id);
    expect(unknown).toEqual([]);
    const bare = rows.filter((r) => !Array.isArray(r.clauses) || !r.clauses.length || typeof r.unit !== 'string' || !r.unit.length).map((r) => r.id);
    expect(bare).toEqual([]);
  });
});

describe('increment 6 (3): the settings are law in data', () => {
  it('the suite interior share is 0.85, bounded, and labelled an operator value', () => {
    const v = seeds().logicVariables[SUITE_SHARE] as Json;
    expect(v?.default).toBeCloseTo(0.85, 9);
    expect(typeof v?.min).toBe('number');
    expect(typeof v?.max).toBe('number');
    expect(v?.min).toBeLessThanOrEqual(v.default);
    expect(v?.max).toBeGreaterThanOrEqual(v.default);
    expect(String(v?.description)).toContain('operator value');
  });
  it('the basement livable share is 1.0 under a ceiling of 1.0', () => {
    const v = seeds().logicVariables[BASEMENT_SHARE] as Json;
    expect(v?.default).toBeCloseTo(1.0, 9);
    expect(v?.max).toBeCloseTo(1.0, 9);
    expect(typeof v?.min).toBe('number');
    expect(v.min).toBeLessThanOrEqual(v.default);
    expect(String(v?.description)).toContain('operator value');
  });
  it('no setting stands in for the owner storeys (item 4 b)', () => {
    expect(Object.keys(seeds().logicVariables)).not.toContain('reno_assumed_storeys');
  });
});

describe('increment 6 (4): the semi seam (UB-7)', () => {
  const seam = (): Json => (seeds().buildingTypes.renovation as Json)?.envelope_by_half_lot as Json;
  const mapReader = (): string => {
    const named = seam()?.reader as string;
    expect(typeof named).toBe('string');
    const files = maxbldSources().filter((f) => path.basename(f) === named);
    expect(files).toHaveLength(1);
    return files[0] as string;
  };

  it('the map keys the strings "false" and "true", each to an existing building type, and names its reader file', () => {
    const map = seam();
    expect(Object.keys(map ?? {}).sort()).toEqual(['false', 'reader', 'true']);
    const ids = new Set((seeds().buildingTypes.rows as Json[]).map((b) => b.id));
    expect(ids.has(map.false)).toBe(true);
    expect(ids.has(map.true)).toBe(true);
    expect(maxbldSources().map((f) => path.basename(f))).toContain(map.reader);
  });
  it('both halves take the detached house envelope today (UB-7)', () => {
    expect([seam().false, seam().true]).toEqual(['detached_house', 'detached_house']);
  });
  it('the seam is read through the map only: no other maxbld module carries the semi envelope type', () => {
    const reader = mapReader();
    const leaks = maxbldSources()
      .filter((f) => f !== reader && /semi_detached_house/.test(withoutComments(readText(path.relative(ROOT, f)))))
      .map((f) => path.relative(ROOT, f));
    expect(leaks).toEqual([]);
  });
});

describe('increment 6 (5): the increment-6 module names no retired engine', () => {
  it('renovation.js exists and mentions no retired module', () => {
    const src = readText(path.relative(ROOT, RENO_MODULE));
    expect(src.includes('renovation-shared')).toBe(false);
    expect(typeof (req(RENO_MODULE) as Json).renovationResults).toBe('function');
  });
});
