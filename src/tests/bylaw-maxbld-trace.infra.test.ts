// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (the trace tooling: INV-24 field
//            lineage, INV-25 answer reconciliation); docs/specs/01-pipeline/131_lot_configuration_policy.md LC-41, LC-42, LC-52
//
// Drift + dangling-reference lock for the two MaxBLD trace generators. The committed Spec 78 P5.10 / P5.15 generated
// blocks equal a regeneration from docs/reference/maxbld-field-lineage.json, and the committed answer tracker equals
// a regeneration from the answer snapshot + dispositions; a mutated registry with a dangling clause, column or logic
// variable is refused (red-first arms).
import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

let LIN: Json = {};
let TRK: Json = {};
let LIB: Json = {};
let lineage: Json = {};
let tracker: Json = {};
beforeAll(async () => {
  LIN = await load('scripts/analysis/bylaw/generate-maxbld-lineage.mjs');
  TRK = await load('scripts/analysis/bylaw/generate-answer-tracker.mjs');
  LIB = await load('scripts/analysis/bylaw/maxbld-trace-lib.mjs');
  lineage = LIN.run({ root: ROOT, mode: 'check' });
  tracker = TRK.run({ root: ROOT, mode: 'check' });
}, 120_000);

describe('field lineage (INV-24)', () => {
  it('has no dangling reference', () => { expect(lineage.problems).toEqual([]); });
  it('Spec 78 generated blocks do not drift from the registry', () => { expect(lineage.drift).toBe(false); });
  it('refuses a dangling clause, column, logic variable and invariant (red arms)', () => {
    const reg = LIB.readJson(ROOT, LIN.REGISTRY_REL);
    const spec = LIB.readText(ROOT, LIB.SPEC78_REL);
    const f = reg.fields.find((x: Json) => x.field === 'main_gfa_sqm');
    f.regulation_ids.push('10.20.40.40(99)');
    f.inputs.push({ column: 'parcels.no_such_column', migration: 'migrations/011_parcels.sql' });
    f.logic_variables.push('no_such_variable');
    f.invariants.push('INV-999');
    const { problems } = LIN.validate(ROOT, reg, spec);
    const text = problems.join('\n');
    expect(text).toMatch(/10\.20\.40\.40\(99\)/);
    expect(text).toMatch(/parcels\.no_such_column/);
    expect(text).toMatch(/no_such_variable/);
    expect(text).toMatch(/INV-999/);
  });
  it('resolves a clause path below a regulation id and rejects a missing one', () => {
    const idx = LIB.provisionsIndex(ROOT);
    expect(LIB.resolveRegulation(idx, '10.80.40.10(1)(B)(ii)')).toBeNull();
    expect(LIB.resolveRegulation(idx, '10.80.40.10(1)(Z)')).not.toBeNull();
  });
});

describe('answer tracker (INV-25)', () => {
  it('every answer has a verified disposition and the report does not drift', () => {
    expect(tracker.problems).toEqual([]);
    expect(tracker.drift).toEqual([]);
  });
  it('accounts for all 511 answers, every "wrong" carries a fix id, every disclose a code', () => {
    expect(tracker.rows.length).toBe(511);
    const s = tracker.counts.by_state;
    expect((s.INCORPORATED || 0) + (s.UNFIXED || 0) + (s.OPEN || 0)).toBe(511);
    for (const r of tracker.rows) {
      if (r.verdict === 'wrong') expect(r.fix_ids.length).toBeGreaterThan(0);
      if (r.verdict === 'disclose') expect(r.disclosure_code).not.toBe('');
    }
  });
});

describe('disclosure wording (Spec 131 LC-52)', () => {
  it('every P5.12 template is within the word cap and glosses its by-law terms', () => {
    expect(LIB.lintDisclosureTemplates(LIB.readText(ROOT, LIB.SPEC78_REL))).toEqual([]);
  });
  it('refuses an unglossed term and an over-long template (red arms)', () => {
    const bad = '### P5.12 Disclosures\n| `x_gfa` | "Not counted in GFA." | M-1 |\n| `x_long` | "' + 'word '.repeat(50).trim() + '" | M-1 |\n### P5.13';
    const problems = LIB.lintDisclosureTemplates(bad);
    expect(problems.some((p: string) => p.startsWith('x_gfa'))).toBe(true);
    expect(problems.some((p: string) => p.startsWith('x_long'))).toBe(true);
  });
});

describe('verified by named lock; no partial green (Spec 131 LC-53)', () => {
  const SRC = [
    "describe('M-205(3) / M-174(5) — rear setback', () => {",
    "  for (const zone of ['RS', 'RM']) {",
    "    it(`${zone}: depth 40 m → 10.0 m`, () => {",
    "      expect(eff(lot(zone, 'detached_house'), 'rear_setback_m').value).toBe(10);",
    '    });',
    '  }',
    "  it('a test with no assertion', () => { run(); });",
    '});',
  ].join('\n');
  const LOCK = { file: 'x.test.ts', describe: 'M-205(3) / M-174(5) — rear setback', it: '${zone}: depth 40 m → 10.0 m', asserts: ["'RS'", 'rear_setback_m'] };
  it('verifies a lock that names its test, an expect on the unit and every cited ruling', () => {
    expect(LIB.verifyLock(SRC, LOCK, ['M-205', 'M-174'])).toBeNull();
  });
  it('refuses a wrong title, an it with no expect, a missing assert token and an unnamed ruling (red arms)', () => {
    expect(LIB.verifyLock(SRC, { ...LOCK, it: '${zone}: depth 40 m' }, ['M-205'])).toMatch(/found 0 times/);
    expect(LIB.verifyLock(SRC, { ...LOCK, it: 'a test with no assertion' }, ['M-205'])).toMatch(/no expect/);
    expect(LIB.verifyLock(SRC, { ...LOCK, asserts: ["'RT'"] }, ['M-205'])).toMatch(/not in the describe block/);
    expect(LIB.verifyLock(SRC, LOCK, ['M-202'])).toMatch(/not named in the test titles/);
  });
  it('a row citing several rulings is green only when a correction cites every one', () => {
    const one = [{ id: 'COR-1', rule: 'Spec 69a M-182, M-75' }];
    expect(TRK.fixedByState(['M-180', 'M-182'], one, ['RATIFIED', 'RATIFIED']).state).toBe('UNFIXED');
    expect(TRK.fixedByState(['M-182'], one, ['RATIFIED']).state).toBe('INCORPORATED');
  });
  it('every verified_by_lock row is green only with its lock verified, or UNFIXED with a pin while its file is absent', () => {
    for (const r of tracker.rows.filter((x: Json) => x.disposition === 'verified_by_lock')) {
      expect(r.lock && r.lock.file && r.lock.describe && r.lock.it).toBeTruthy();
      if (r.state === 'INCORPORATED') expect(r.checks.join(' ')).toMatch(/lock verified/);
      else expect([r.state, r.lock.pin]).toEqual(['UNFIXED', expect.stringMatching(/@[0-9a-f]{7,}/)]);
    }
  });
});
