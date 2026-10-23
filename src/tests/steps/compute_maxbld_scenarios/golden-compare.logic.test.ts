/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (validation plan), P5.13
 * SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.71 (shadow before switch), m.22
 * Handbook:  operator CHAT-63.C10 (operator-keyed golden cases on one generated form), CHAT-63.C8 (calculation floors); HELD on P3-Q1
 *
 * P3-11 prep (CHAT-73.nohalt): a READ-ONLY pure comparator of Layer 3 module output against operator-keyed values, using the
 * C-10 form-def field ids (form-def.json sections S2, S4, S5). No golden data is keyed yet, so these cases are SYNTHETIC
 * and labelled as such; no file, database or live column is read. STRICT RED FIRST: ran against the missing module
 * (~/Buildo-scratch/p3build/red-p3-11.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/analysis/phase3/golden-compare.mjs';
async function mod(): Promise<Json> {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  return (await import(pathToFileURL(path.join(ROOT, REL)).href)) as Json;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LIN = require(path.join(ROOT, 'docs/reference/maxbld-field-lineage.json')) as Json;

const k = (value: number | null, unit: string, as_printed: string | null = null): Json => ({ value, unit, as_printed });
/** SYNTHETIC case A: the P3-2 vector (RD-like lot, pitched headline). */
const CASE_A: Json = {
  id: 'SYN-A', synthetic: true, scenario: 'D', family: 'detached_house', lot: { area_sqm: 300 },
  keyed: { p_gfa_total: k(478.08, 'm2', '478.1 sq.m.'), p_cov_m2: k(160, 'm2'), p_height: k(10, 'm'), p_storeys: k(3, 'storeys'), p_front: k(5, 'm'), p_rear: k(5, 'm'), p_side: k(1, 'm'), p_fsi: k(1.5936, 'ratio'), p_cov_pct: k(53.3333, 'percent'), p_mainwall: k(7.5, 'm'), p_units: k(null, 'units') },
  computed: { main_gfa_sqm: 478.08, main_footprint_sqm: 160, main_height_m: 10, main_storeys: 3, main_front_setback_m: 5, main_rear_setback_m: 5, main_side_setbacks_m: [1, 1], main_wall_limit_m: 7.5, dwelling_units: 1,
    field_citations: { main_gfa_sqm: [{ unit_id: '10.20.40.40(1)#(1)(C)', amendment_status: 'in_force' }] } },
};
/** SYNTHETIC case B: one wrong keyed value, and a unit slip. */
const CASE_B: Json = {
  id: 'SYN-B', synthetic: true, scenario: 'H', family: 'detached_houseplex', lot: { area_sqm: 400 },
  keyed: { p_gfa_total: k(520, 'm2'), p_units: k(4, 'units'), p_height: k(12, 'ft'), p_storeys: k(3, 'storeys'), p_bedrooms: k(16, 'count'), p_suite_gfa: k(30, 'm2') },
  computed: { main_gfa_sqm: 500, dwelling_units: 4, main_height_m: 12, main_storeys: 3, field_citations: { main_gfa_sqm: [{ unit_id: '10.20.40.40(1)#(1)(C)', amendment_status: 'in_force' }, { unit_id: '10.20.40.10(1)#(1)(A)', amendment_status: 'not_verified' }] } },
};
/** SYNTHETIC case C: limit rows (S5). */
const CASE_C: Json = {
  id: 'SYN-C', synthetic: true, scenario: 'D', family: 'detached_house', lot: { area_sqm: 330 },
  keyed: { p_height: k(9.5, 'm') }, computed: { main_height_m: 9.5 },
  limits: [
    { clause: '10.20.40.10(1)', bylaw_limit: k(10, 'm'), proposed: k(10.8, 'm'), granted: 'yes', examiner: k(10.8, 'm') },
    { clause: '10.20.40.40(1)', bylaw_limit: k(0.6, 'ratio'), proposed: k(0.75, 'ratio'), granted: 'modified', examiner: k(0.7, 'ratio') },
    { clause: '10.20.30.40(1)', bylaw_limit: k(null, 'percent'), proposed: k(40, 'percent'), granted: 'no', examiner: k(null, 'percent') },
  ],
  computedLimits: { '10.20.40.10(1)': 10, '10.20.40.40(1)': 0.65, '10.20.30.40(1)': null },
};
const CFG = { abs: { m: 0.05, m2: 0.5, count: 0, units: 0, storeys: 0, ratio: 0.005, percent: 0.1 }, rel: 0.001, minRows: 10 };

describe('P3-11 prep: the form-def field map (C-10 S4 ids -> Layer 3 fields)', () => {
  it('every mapped Layer 3 field exists in the lineage registry; the ids are the form-def keys', async () => {
    const m = await mod();
    const names = new Set(LIN.fields.map((f: Json) => f.field));
    for (const [id, f] of Object.entries(m.FORM_FIELD_MAP) as Array<[string, Json]>) {
      expect(id, id).toMatch(/^p_/);
      if (f.field) expect(names.has(f.field), `${id} -> ${f.field}`).toBe(true);
    }
    expect(m.FORM_FIELD_MAP.p_gfa_total.field).toBe('main_gfa_sqm');
    expect(m.FORM_FIELD_MAP.p_units.field).toBe('dwelling_units');
    expect(m.FORM_FIELD_MAP.p_cov_m2.field).toBe('main_footprint_sqm');
  });
  it('the fields with no Layer 3 output yet are listed as not covered, never silently dropped', async () => {
    const m = await mod();
    for (const id of ['p_land_front', 'p_parking', 'p_platform', 'p_suite_setbacks']) expect(m.FORM_FIELD_MAP[id].covered, id).toBe(false);
  });
});

describe('P3-11 prep: compareCase', () => {
  it('matches a keyed value within the unit tolerance and reports derived fields (FSI, coverage %)', async () => {
    const r = (await mod()).compareCase(CASE_A, CFG);
    const by = Object.fromEntries(r.fields.map((f: Json) => [f.form_id, f]));
    expect(by.p_gfa_total.status).toBe('match');
    expect(by.p_fsi.status).toBe('match'); // 478.08 / 300
    expect(by.p_cov_pct.status).toBe('match'); // 160 / 300 x 100
    expect(by.p_side.status).toBe('match');
    expect(by.p_mainwall.status).toBe('match');
    expect(r.synthetic).toBe(true);
  });

  it('blank means not shown, never zero: a null keyed value is not_keyed and is not compared', async () => {
    const r = (await mod()).compareCase(CASE_A, CFG);
    expect(r.fields.find((f: Json) => f.form_id === 'p_units').status).toBe('not_keyed');
    expect(r.counts.not_keyed).toBe(1);
  });

  it('a wrong value is a mismatch carrying keyed, computed, delta and the cited clauses, so the check can say which clause was wrong', async () => {
    const r = (await mod()).compareCase(CASE_B, CFG);
    const g = r.fields.find((f: Json) => f.form_id === 'p_gfa_total');
    expect(g.status).toBe('mismatch');
    expect(g.keyed).toBe(520);
    expect(g.computed).toBe(500);
    expect(g.delta).toBe(-20);
    expect(g.cited_clauses).toEqual(['10.20.40.10(1)#(1)(A)', '10.20.40.40(1)#(1)(C)']);
  });

  it('a keyed unit that is not the field\'s unit is unit_mismatch (no conversion is guessed)', async () => {
    const r = (await mod()).compareCase(CASE_B, CFG);
    expect(r.fields.find((f: Json) => f.form_id === 'p_height').status).toBe('unit_mismatch');
  });

  it('a field the modules do not produce yet is not_produced; a form field with no Layer 3 output is not_covered; neither is a mismatch', async () => {
    const r = (await mod()).compareCase(CASE_B, CFG);
    expect(r.fields.find((f: Json) => f.form_id === 'p_bedrooms').status).toBe('not_produced'); // bedrooms owed (Q-bed)
    expect(r.fields.find((f: Json) => f.form_id === 'p_suite_gfa').status).toBe('not_produced');
    const c = (await mod()).compareCase({ ...CASE_B, keyed: { p_parking: k(2, 'count') } }, CFG);
    expect(c.fields[0].status).toBe('not_covered');
  });

  it('an unknown form id throws (the map is closed)', async () => {
    await expect((async () => (await mod()).compareCase({ ...CASE_A, keyed: { p_made_up: k(1, 'm') } }, CFG))()).rejects.toThrow(/form id/);
  });

  it('a missing tolerance config throws (never defaulted)', async () => {
    await expect((async () => (await mod()).compareCase(CASE_A, {}))()).rejects.toThrow(/config/);
  });
});

describe('P3-11 prep: limit rows (S5)', () => {
  it('our as-of-right limit must equal the by-law limit the plan says it exceeds; the variance is proposed - limit', async () => {
    const r = (await mod()).compareLimits(CASE_C, CFG);
    expect(r.rows[0]).toMatchObject({ clause: '10.20.40.10(1)', status: 'match', variance: 0.8 });
    expect(r.rows[1]).toMatchObject({ clause: '10.20.40.40(1)', status: 'mismatch' }); // keyed 0.6, ours 0.65
    expect(r.rows[1].variance).toBeCloseTo(0.15, 9);
    expect(r.rows[2].status).toBe('not_keyed'); // blank bylaw limit: not shown, never zero
  });
  it('approved = as-of-right + granted variance: granted yes means examiner = proposed; modified means examiner between limit and proposed; no means examiner blank', async () => {
    const r = (await mod()).compareLimits(CASE_C, CFG);
    expect(r.rows[0].approved_check).toBe('consistent');
    expect(r.rows[1].approved_check).toBe('consistent'); // 0.6 <= 0.7 <= 0.75
    expect(r.rows[2].approved_check).toBe('consistent');
    const bad = (await mod()).compareLimits({ ...CASE_C, limits: [{ ...CASE_C.limits[0], examiner: k(12, 'm') }] }, CFG);
    expect(bad.rows[0].approved_check).toBe('inconsistent');
  });
});

describe('P3-11 prep: floors by scenario family (CHAT-63.C8 calculation floors: >= 10 rows per family, else pooled)', () => {
  it('summarize gives per-family match rates; families under minRows (here 11; case A has 10 compared rows) are pooled and say so', async () => {
    const m = await mod();
    const res = [m.compareCase(CASE_A, CFG), m.compareCase(CASE_B, CFG)];
    const s = m.summarize(res, { ...CFG, minRows: 11 });
    expect(s.total.match).toBeGreaterThan(0);
    expect(s.total.mismatch).toBe(1);
    expect(s.families.pooled.cases).toBe(2); // both families have < 10 rows
    expect(s.families.pooled.note).toMatch(/pooled/);
    expect(s.synthetic).toBe(true); // any synthetic case marks the whole summary synthetic: it can never set a floor
  });
  it('a synthetic case never counts toward a floor: floorEligible is false', async () => {
    const m = await mod();
    expect(m.summarize([m.compareCase(CASE_A, CFG)], CFG).floorEligible).toBe(false);
    expect(m.summarize([m.compareCase({ ...CASE_A, synthetic: false }, CFG)], CFG).floorEligible).toBe(true);
  });
});

describe('P3-11 prep: read-only and pure', () => {
  it('imports nothing and touches no file, database, env, clock or randomness', () => {
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/\bimport\b|require\(|process\.env|Date\.now|new Date|Math\.random|\bfs\b|readFile|writeFile|\bpg\b|INSERT|UPDATE/);
  });
  it('does not mutate its inputs', async () => {
    const m = await mod();
    const before = JSON.stringify(CASE_B);
    m.compareCase(CASE_B, CFG);
    expect(JSON.stringify(CASE_B)).toBe(before);
  });
});
