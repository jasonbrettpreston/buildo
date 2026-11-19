// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-BA (the closed gate set stays closed) and R-BG (a rule changes by a row plus an Operator-Ruling trailer);
//            MORNING-DECISIONS.md:725 (the eight automatic checks) and :750 (re-use obviously): the policy ledger MATCHES through scripts/analysis/gates/ledger.mjs matchLedger.
//
// Logic locks for scripts/analysis/policy-checks/lib.mjs: the ruling-id and quote validation, the one-row-one-violation and orphan behaviour (through matchLedger), and the Operator-Ruling trailer check.
// No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const LIB = 'scripts/analysis/policy-checks/lib.mjs';
const L: Json = await import(pathToFileURL(path.join(ROOT, LIB)).href).catch((err: unknown) => ({ importError: String(err) }));

const row = (over: Json = {}): Json => ({ rule: 'chk5-producer', item: 'await db.query("INSERT INTO t (a) VALUES (1)")', ruling: 'MD:2026-11-18:744', quote: 'Add to the named list..', ...over });
const hit = (over: Json = {}): Json => ({ rule: 'chk5-producer', file: 'src/lib/w.ts', line: 1, msg: 'x', item: 'await db.query("INSERT INTO t (a) VALUES (1)")', ...over });

describe('policy-checks lib: module surface and re-use', () => {
  it('loads', () => {
    expect(L.importError).toBeUndefined();
    for (const k of ['validateLedger', 'applyLedger', 'trailerCheck', 'finding', 'globRe', 'stripComments']) expect(typeof L[k]).toBe('function');
  });
  it('matches through ledger.mjs matchLedger (imported, not copied) and leaves the closed step-gate set alone', () => {
    const src = fs.readFileSync(path.join(ROOT, LIB), 'utf8');
    expect(src).toMatch(/import \{ matchLedger \} from '\.\.\/gates\/ledger\.mjs'/);
    expect(src).not.toMatch(/function matchLedger|const matchLedger/);
    const ledgerSrc = fs.readFileSync(path.join(ROOT, 'scripts/analysis/gates/ledger.mjs'), 'utf8');
    expect(ledgerSrc).toContain("export const GATES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'K'];");
  });
});

describe('validateLedger', () => {
  it('GREEN: a row with a dated-note ruling id and a verbatim quote', () => {
    expect(L.validateLedger!([row()])).toEqual([]);
    expect(L.validateLedger!([row({ ruling: 'M-61' }), row({ item: 'b', ruling: 'D-12' })])).toEqual([]);
    expect(L.validateLedger!([])).toEqual([]);
  });
  it('RED: M-246 (the dated-note convention) is not an approval', () => {
    expect(L.validateLedger!([row({ ruling: 'M-246' })]).join('\n')).toContain('M-246');
  });
  it('RED: an invented ruling id, a missing quote, an unknown key, a bad rule id, a non-array', () => {
    expect(L.validateLedger!([row({ ruling: 'yes' })])).toHaveLength(1);
    expect(L.validateLedger!([row({ quote: 'short' })])).toHaveLength(1);
    expect(L.validateLedger!([row({ extra: 1 })]).join('\n')).toContain('closed row shape');
    expect(L.validateLedger!([row({ rule: 'whatever' })])).toHaveLength(1);
    expect(L.validateLedger!({})).toHaveLength(1);
  });
});

describe('applyLedger (one row allows exactly ONE violation; orphans)', () => {
  it('a finding with no row is unallowed; a row allows its finding', () => {
    expect(L.applyLedger!([hit()], []).unallowed).toHaveLength(1);
    expect(L.applyLedger!([hit()], [row()]).unallowed).toEqual([]);
  });
  it('RED collision: a row spent on one site leaves a second site with the same key unallowed', () => {
    const r = L.applyLedger!([hit({ file: 'a.ts' }), hit({ file: 'b.ts' })], [row()]);
    expect(r.unallowed).toHaveLength(1);
    expect(r.unallowed[0].file).toBe('b.ts');
  });
  it('a row for a different rule or item allows nothing', () => {
    expect(L.applyLedger!([hit()], [row({ rule: 'chk5-reader' })]).unallowed).toHaveLength(1);
    expect(L.applyLedger!([hit()], [row({ item: 'other text' })]).unallowed).toHaveLength(1);
  });
  it('RED orphan: in --all mode a row of a tree rule with no violation is reported; never in a staged run, never for a rule not in treeRules', () => {
    const rows = [row({ item: 'gone' })];
    expect(L.applyLedger!([], rows, { all: true, treeRules: ['chk5-producer'] }).orphans).toEqual(rows);
    expect(L.applyLedger!([], rows, { all: false, treeRules: ['chk5-producer'] }).orphans).toEqual([]);
    expect(L.applyLedger!([], rows, { all: true, treeRules: ['chk5-reader'] }).orphans).toEqual([]);
  });
  it('GREEN: a row that is used is not an orphan', () => {
    expect(L.applyLedger!([hit()], [row()], { all: true, treeRules: ['chk5-producer'] }).orphans).toEqual([]);
  });
});

describe('trailerCheck (commit-msg leg)', () => {
  it('RED: an added row whose ruling id is not in an Operator-Ruling trailer; GREEN with it', () => {
    expect(L.trailerCheck!([row({ ruling: 'D-12' })], 'feat(1_x): y')).toHaveLength(1);
    expect(L.trailerCheck!([row({ ruling: 'D-12' })], 'feat(1_x): y\n\nOperator-Ruling: "yes" (D-12)\n')).toEqual([]);
    expect(L.trailerCheck!([row({ ruling: 'D-12' })], 'feat(1_x): y\n\nsee D-12 in prose')).toHaveLength(1);
    expect(L.trailerCheck!([], 'feat(1_x): y')).toEqual([]);
  });
});

describe('helpers', () => {
  it('globRe: ** crosses directories, * does not, ? is one character', () => {
    expect(L.globRe!('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
    expect(L.globRe!('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(L.globRe!('scripts/**/p-?.js').test('scripts/x/p-a.js')).toBe(true);
  });
  it('stripComments keeps strings and line numbers, drops comments', () => {
    expect(L.stripComments!("a // b\nc /* d\ne */ f 'g // h'")).toBe("a \nc \n f 'g // h'");
  });
});
