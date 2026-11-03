// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; increment 1 acceptance, ~/Buildo-scratch/mcbylaws/MB-31/inc1-plan.md sections 0 and 2.3)
//
// MB-31 increment 1 acceptance, mode A: MB-18 (k) in, (j) (i) (l) out. The 25 golden cases are replayed through
// the step's OWN compute (`buildParcelRows`) and compared cell by cell against the answer key; the key's own
// consistency (manifest shas, the McProof check, the 175-cell census) is checked first.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((l: string) => l.trim() !== '')
    .map((l: string) => JSON.parse(l));

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});

const FIX = 'src/tests/fixtures/layer3/golden-25';
const MANIFEST_SHA = '79efb4e262057f1c70d51f890c7cedd1cb5c290ab40a94e58719a4a7de846c3d';
const META: Json = { layer2_table_version: 'golden-25', settings_sha: 'golden-25' };
const MANIFESTED = ['inputs.jsonl', 'expected.jsonl', 'refusals.json', 'mcproof-e25.json', 'source-inputs.jsonl', 'parcels-rows.json', 'flag-corrections.json'];
/** The tolerances of the independent McProof check (front, footprint, gfa, height, storeys, units). */
const TOL = { front: 0.0005, footprint: 0.005, gfa: 0.01, height: 1e-9, storeys: 1e-9, units: 1e-9 } as Record<string, number>;
/** The seven compared cells: field id of the step's rows -> key of the expected case. */
const FIELDS: [string, string][] = [
  ['permitted', 'permitted'],
  ['front_setback_used_m', 'front'],
  ['footprint_max_m2', 'footprint'],
  ['height_max_m', 'height'],
  ['storeys_max', 'storeys'],
  ['gfa_max_m2', 'gfa'],
  ['units_max', 'units'],
];

const sha256 = (rel: string): string => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
const sorted = (list: any): string[] => [...new Set(Array.isArray(list) ? list.map((x: any) => String(x)) : [])].sort();

/** One `phase2` entry -> the Layer 2 cell the step decodes (mode A: the unknown targets stay absent). */
const toCell = (c: Json): Json => {
  if (c.status === 'not_evaluated') return { s: 'not_evaluated', kind: null, value: null, clause: null, reason: c.reason };
  if (c.status === 'not_applicable') return { s: 'not_applicable', clause: c.clause, reason: null };
  return { s: 'applies', kind: c.kind, value: c.value, clause: c.clause, reason: null };
};

/** One `inputs.jsonl` line + the case's expected parcel id -> the parcel input `buildParcelRows` reads. */
const parcelInput = (line: Json, parcelId: number): Json => {
  const parcel = line.parcel || {};
  const l2: Json = {};
  for (const [target, c] of Object.entries(line.phase2 || {})) l2[target] = toCell(c as Json);
  const neighbours = (line.abutments || []).map((a: Json) => ({
    same_street: a.sameStreet,
    residential: a.res,
    bldg_m: a.bldg,
    est: a.est,
    est_status: a.st,
  }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  return {
    parcel_id: parcelId,
    l2,
    perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area },
    flags: { corner_lot: parcel.corner },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: 1 },
  };
};

describe('MB-31 increment 1 acceptance: the 25 golden cases (mode A: MB-18 (k) in, (j) (i) (l) out)', () => {
  let S: Json;
  let SEEDS: Json;
  const cases: Json[] = readJsonl(`${FIX}/inputs.jsonl`);
  const expected: Json[] = readJsonl(`${FIX}/expected.jsonl`);
  const refusals: Json = readJson(`${FIX}/refusals.json`);
  beforeAll(() => {
    S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('the fixture files match their manifest', () => {
    const manifest = readJson(`${FIX}/manifest.json`);
    for (const name of MANIFESTED) {
      expect(manifest.files[name], `${name}: manifest entry`).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256(`${FIX}/${name}`), `${name}: sha256 against manifest.json`).toBe(manifest.files[name]);
    }
    expect(sha256(`${FIX}/manifest.json`), 'manifest.json: sha256 against MANIFEST_SHA').toBe(MANIFEST_SHA);
  });

  it('the McProof check of the answer key is clean', () => {
    const rows = readJson(`${FIX}/mcproof-e25.json`);
    expect(Array.isArray(rows), 'mcproof-e25.json is an array').toBe(true);
    expect(rows.length, 'mcproof-e25.json: 25 rows').toBe(25);
    expect(rows.filter((r: Json) => !r.ok), 'mcproof-e25.json: every row ok').toEqual([]);
  });

  it('there are 175 cells: 25 permitted, 137 numbers, 13 refusals', () => {
    const census = { permitted: 0, number: 0, not_evaluated: 0 };
    for (const e of expected) {
      for (const [, key] of FIELDS) {
        const cell = e[key] || {};
        if (key === 'permitted') census.permitted += 1;
        else if (cell.s === 'number') census.number += 1;
        else if (cell.s === 'not_evaluated') census.not_evaluated += 1;
      }
    }
    expect(census.permitted, 'census: permitted cells').toBe(25);
    expect(census.number, 'census: number cells').toBe(137);
    expect(census.not_evaluated, 'census: not_evaluated cells').toBe(13);
    expect(expected.length * FIELDS.length, 'census: 175 cells in all').toBe(175);
    const listed = refusals.cells || [];
    expect(listed.length, 'refusals.json: 13 entries').toBe(13);
    for (const e of expected) {
      for (const [, key] of FIELDS) {
        if (key === 'permitted' || (e[key] || {}).s !== 'not_evaluated') continue;
        const entry = listed.filter((r: Json) => r.case === e.case && r.cell === key);
        expect(entry.length, `${e.case}/${key}: one refusals.json entry`).toBe(1);
      }
    }
  });

  it('the flag corrections of the answer key are exactly the recorded ones', () => {
    const corrections = readJson(`${FIX}/flag-corrections.json`);
    const cells: Json[] = corrections.cells || [];
    expect(cells.length, 'flag-corrections.json: 21 entries').toBe(21);
    for (const entry of cells) {
      const e = expected.find((x: Json) => x.case === entry.case);
      expect(e, `flag corrections: a case ${entry.case} in expected.jsonl`).toBeDefined();
      const cell = (e || {})[entry.cell] || {};
      expect(sorted(cell.flags), `flag corrections: ${entry.case}/${entry.cell} flags`).toEqual(sorted(entry.to));
    }
  });

  for (const expectedCase of expected) {
    it(`case ${expectedCase.case}`, () => {
      const line = cases.find((c: Json) => c.case === expectedCase.case);
      expect(line, `case ${expectedCase.case}: a line in inputs.jsonl`).toBeDefined();
      const rows: Json[] = S.buildParcelRows(parcelInput(line as Json, expectedCase.parcel_id), SEEDS, META);
      const house = rows.filter((r: Json) => r.building_type === 'detached_house');
      const byField = new Map(house.map((r: Json) => [r.field_id, r]));
      const labels = house.map((r: Json) => r.field_id);

      for (const [field, key] of FIELDS) {
        const expectedCell = expectedCase[key] || {};
        const where = `case ${expectedCase.case}/${key}`;
        const row = byField.get(field);
        expect(row, `${where}: a row for ${field} (have ${labels.join(', ')})`).toBeDefined();
        if (key === 'permitted') {
          expect((row as Json).status, `${where}: permitted status`).toBe('permitted');
        } else if (expectedCell.s === 'number') {
          expect((row as Json).status, `${where}: computed status`).toBe('computed');
          const tol = TOL[key] ?? 0;
          expect(Math.abs((row as Json).value - expectedCell.v), `${where}: value ${(row as Json).value} vs ${expectedCell.v} (tol ${tol})`).toBeLessThanOrEqual(tol);
        } else {
          expect((row as Json).status, `${where}: not_evaluated status`).toBe('not_evaluated');
          const entry = (refusals.cells || []).find((r: Json) => r.case === expectedCase.case && r.cell === key);
          expect(entry, `${where}: a refusals.json entry`).toBeDefined();
          const stems: string[] = (entry || {}).reason_stems_any || [];
          const reason = String((row as Json).reason ?? '');
          expect(stems.some((s: string) => reason.includes(s)), `${where}: reason ${JSON.stringify(reason)} carries one of ${JSON.stringify(stems)}`).toBe(true);
        }
        expect(sorted((row as Json).flags), `${where}: flags`).toEqual(sorted(expectedCell.flags ?? []));
      }
    });
  }
});
