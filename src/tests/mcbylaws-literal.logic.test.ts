// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-67 arm L, L1–L10); R-KN, R-KR, R-LA.
// Spawns the repo's own `node_modules/.bin/ast-grep` over a temp tree whose directory is `mcbylaws-literal-scope/`,
// so the rule file's `files:` scope (which carries that prefix) applies and nothing in the real repo is scanned.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanFile, scanScope, allowSet, deadScopeLines, RULE_FILE, ALLOW_REL }
  from '../../scripts/analysis/mcbylaws/literal-scan.mjs';

const ROOT = path.resolve(__dirname, '../..');
const AST_GREP = path.join(ROOT, 'node_modules', '.bin', 'ast-grep');
const RULE_FILE_ABS = path.join(ROOT, RULE_FILE);
const FIXTURES = path.join(ROOT, 'src/tests/fixtures/mcbylaws-gate');
const SCOPE = 'mcbylaws-literal-scope';
const realAllow = JSON.parse(fs.readFileSync(path.join(ROOT, ALLOW_REL), 'utf8'));
const policyOf = (over: Record<string, unknown> = {}) => ({
  pending_globs: [], layer23: [], protected: ['mcbylaws/literal-allow.json'],
  literal_scope: [`${SCOPE}/**`], literal_exempt: [], held_dirs: [], held_limit: 12, worktrees: [],
  boot1: { tasks: [], exempt_ids: [] }, external_arms: [], ...over,
});

let tmp: string;
const write = (rel: string, text: string) => {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return rel;
};
const copyFixture = (name: string) => write(`${SCOPE}/${name}`, fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const scan = (files: string[], allow: unknown = realAllow, over = {}) =>
  scanScope({ root: tmp, files, policy: policyOf(over), allow, astGrepBin: AST_GREP, ruleFile: RULE_FILE_ABS });
const lines = (files: string[], allow: unknown = realAllow, over = {}) => scan(files, allow, over).flatMap((v) => v.verdicts);

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-lit-')); });
afterAll(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

describe('arm L — numbers, strings, scope', () => {
  it('L1/L2 red fixture: numbers 0.45, 6.3, 4 and strings R, RT, RM', () => {
    const red = copyFixture('red-literals.mjs');
    const got = lines([red]);
    for (const want of ['FAIL:L:number:0.45', 'FAIL:L:number:6.3', 'FAIL:L:number:4', 'FAIL:L:string:R', 'FAIL:L:string:RT', 'FAIL:L:string:RM']) {
      expect(got, want).toContain(want);
    }
    expect(got.filter((g) => g === 'FAIL:L:number:-1'), 'unary minus on 1 is not a literal').toEqual([]);
    expect(got.filter((g) => g === 'FAIL:L:string:answered'), 'the L2 assert above must not pass because strings are missed').toEqual(['FAIL:L:string:answered']);
  });

  it('L1/L2 green twin: allowed numbers and allow-listed strings only', () => {
    expect(lines([copyFixture('green-literals.mjs')])).toEqual([]);
  });

  it('L3 the six held constants each produce a FAIL:L:number line', () => {
    const six = write(`${SCOPE}/held.mjs`, 'export const K = [0.45, 0.2, 0.3, 4, 6.3, 3.5];\n');
    const got = lines([six]);
    expect(got).toHaveLength(6);
    for (const n of ['0.45', '0.2', '0.3', '4', '6.3', '3.5']) expect(got).toContain(`FAIL:L:number:${n}`);
  });

  it('L4 scope: out-of-scope and exempt files are not scanned', () => {
    const out = write('outside/thing.mjs', 'export const SIDE = 0.45;\n');
    expect(lines([out])).toEqual([]);
    const exempt = write(`${SCOPE}/exempt.json`, '{"side_m": 1.2}');
    expect(lines([exempt], realAllow, { literal_exempt: [`${SCOPE}/exempt.json`] })).toEqual([]);
    const inside = write(`${SCOPE}/inside.mjs`, 'export const SIDE = 0.45;\n');
    expect(lines([inside])).toContain('FAIL:L:number:0.45');
  });

  it('L5 JSON data modules are walked in JS', () => {
    expect(lines([write(`${SCOPE}/d.json`, '{"side_m": 1.2}\n')])).toContain('FAIL:L:json-number:1.2');
    expect(lines([write(`${SCOPE}/n.json`, '{"side_m": 1, "k": 2, "z": 100, "w": 0}\n')])).toEqual([]);
    expect(lines([write(`${SCOPE}/s.json`, '{"status": "not_evaluated", "side_yard_m": 2}\n')])).toEqual([]);
    expect(lines([write(`${SCOPE}/b.json`, '{"status": "answered"}\n')])).toContain('FAIL:L:json-string:answered');
  });

  it('L8 an ast-grep-ignore token is itself the failure', () => {
    const silenced = write(`${SCOPE}/silenced.mjs`, '// ast-grep-ignore\nexport const A = 0.45;\n');
    expect(lines([silenced])).toEqual([`FAIL:L:suppressed:${silenced}`]);
    expect(lines([write(`${SCOPE}/ok.mjs`, 'export const A = 0;\n')])).toEqual([]);
    expect(lines([write(`${SCOPE}/kept.mjs`, 'export const A = 0.45;\n')])).toContain('FAIL:L:number:0.45');
  });

  it('L9 import/export sources are not reported', () => {
    const mod = write(`${SCOPE}/mod.mjs`, 'import fs from "node:fs";\nexport const k = "side_yard_m";\nexport * from "./a.mjs";\n');
    expect(lines([mod])).toEqual([]);
  });
});

describe('arm L — fail closed (L7)', () => {
  it.each([
    ['missing binary', path.join(tmp ?? os.tmpdir(), 'no-such-ast-grep')],
  ])('%s -> FAIL:L:cannot-scan', (_label, bin) => {
    const rel = write(`${SCOPE}/blind.mjs`, 'export const A = 0;\n');
    const res = scanFile({ root: tmp, rel, astGrepBin: bin as string, ruleFile: RULE_FILE_ABS });
    expect(res.ok).toBe(false);
    const got = scanScope({ root: tmp, files: [rel], policy: policyOf(), allow: realAllow, astGrepBin: bin as string, ruleFile: RULE_FILE_ABS });
    expect(got.flatMap((v) => v.verdicts).some((g) => g.startsWith('FAIL:L:cannot-scan'))).toBe(true);
  });

  it('non-JSON output -> FAIL:L:cannot-scan', () => {
    const fake = path.join(tmp, 'fake-ast-grep.sh');
    fs.writeFileSync(fake, '#!/bin/sh\necho "not json"\nexit 0\n', { mode: 0o755 });
    const rel = write(`${SCOPE}/blind2.mjs`, 'export const A = 0;\n');
    const got = lines([rel], realAllow, {}) as string[];
    expect(scanFile({ root: tmp, rel, astGrepBin: fake, ruleFile: RULE_FILE_ABS }).ok).toBe(false);
    expect(got).toEqual([]);
    const blind = scanScope({ root: tmp, files: [rel], policy: policyOf(), allow: realAllow, astGrepBin: fake, ruleFile: RULE_FILE_ABS });
    expect(blind.flatMap((v) => v.verdicts).some((g) => g.startsWith('FAIL:L:cannot-scan'))).toBe(true);
  });
});

describe('arm L — R-LA baseline (shrink only)', () => {
  const withBaseline = (file: string, numbers: Record<string, number>) => ({ ...realAllow, baseline: { [file]: { numbers, strings: {} } } });

  it('at the baseline passes, one above it and a new literal are red', () => {
    const file = `${SCOPE}/base.mjs`;
    write(file, 'export const A = 0.45;\nexport const B = 0.45;\nexport const C = 0.45;\n');
    const allow = withBaseline(file, { '0.45': 3 });
    expect(lines([file], allow)).toEqual([]);
    write(file, 'export const A = 0.45;\nexport const B = 0.45;\nexport const C = 0.45;\nexport const D = 0.45;\n');
    expect(lines([file], allow)).toEqual(['FAIL:L:number:0.45']);
    write(file, 'export const A = 0.45;\nexport const B = 0.45;\nexport const C = 0.45;\nexport const D = 0.5;\n');
    expect(lines([file], allow)).toEqual(['FAIL:L:number:0.5']);
  });
});

describe('arm L — allow set and dead scope', () => {
  it('L10 a literal_scope glob matching nothing is dead; pending or matching passes', () => {
    const tracked = ['mcbylaws-literal-scope/x.mjs'];
    expect(deadScopeLines(policyOf(), tracked)).toEqual([]);
    expect(deadScopeLines(policyOf({ literal_scope: ['gone/**'] }), tracked)).toEqual(['FAIL:L:dead-glob:gone/**']);
    expect(deadScopeLines(policyOf({ literal_scope: ['gone/**'], pending_globs: ['gone/**'] }), tracked)).toEqual([]);
  });

  it('the committed allow file parses and allowSet carries its words', () => {
    expect(Array.isArray(realAllow.numbers)).toBe(true);
    const sets = allowSet(realAllow);
    expect(sets.strings.has('not_evaluated')).toBe(true);
    for (const n of [0, 1, 2, 100]) expect(sets.numbers.has(n)).toBe(true);
    expect(sets.numbers.has(0.45)).toBe(false);
  });
});

describe('arm L — MB-67 literal classes that are not by-law values (operator 2026-11-16)', () => {
  // Operator ruling 2026-11-16: "1. just to understand we get rid of the 51 errors and save teh rest.  Approved"
  // (~/Buildo-scratch/mcbylaws/inc5/m14/PANEL-LITERALS-20261116.md). Positions and the evaluator's status words are not by-law values.
  it('require() sources are not reported (same family as L9)', () => {
    const f = write(`${SCOPE}/req.mjs`, "const rows = require('./rows.js');\nconst c = require(\"./catalogue.js\");\n");
    expect(lines([f])).toEqual([]);
  });

  it("the 'use strict' directive is not reported, the same text as a value is", () => {
    expect(lines([write(`${SCOPE}/strict.mjs`, "'use strict';\nconst k = 0;\n")])).toEqual([]);
    expect(lines([write(`${SCOPE}/strict2.mjs`, "const k = 'use strict';\n")])).toContain('FAIL:L:string:use strict');
  });

  it('typeof operands are not reported, in either order; a non-type word beside typeof still is', () => {
    const ok = write(`${SCOPE}/typeof.mjs`, "const a = typeof x === 'object';\nconst b = typeof x.y !== 'string';\nconst c = 'number' === typeof z;\n");
    expect(lines([ok])).toEqual([]);
    expect(lines([write(`${SCOPE}/typeof2.mjs`, "const a = typeof x === 'crossing';\n")])).toContain('FAIL:L:string:crossing');
  });

  it('Error constructor message arguments are not reported; a by-law id after the call still is', () => {
    const ok = write(`${SCOPE}/err.mjs`, "throw new Error('two-structure: ' + what + ' collision on ' + k);\nthrow new TypeError(`runRow: unknown row ${id}`);\n");
    expect(lines([ok])).toEqual([]);
    expect(lines([write(`${SCOPE}/err2.mjs`, "const e = new Error('x'); const k = 'range_end';\n")])).toContain('FAIL:L:string:range_end');
  });

  it('the evaluator closed status words come from status_words', () => {
    const sets = allowSet(realAllow);
    for (const w of ['computed', 'permitted', 'missing_input:permitted', 'missing_input:absent_target', 'missing_input:gate']) expect(sets.strings.has(w), w).toBe(true);
    expect(lines([write(`${SCOPE}/status.mjs`, "const s = r.status === 'computed';\n")])).toEqual([]);
  });

  it('by-law ids and epsilons of split.js are still reported (nothing else loosened)', () => {
    const f = write(`${SCOPE}/split-like.mjs`, "const kinds = ['row', 'crossing', 'range_end', 'min'];\nconst r = (x) => Math.round(x * 1e9) / 1e9;\nconst ids = ['suite_gfa_lt_main', 'A', 'B'];\n");
    const got = lines([f]);
    for (const s of ['row', 'crossing', 'range_end', 'min', 'suite_gfa_lt_main', 'A', 'B']) expect(got, s).toContain(`FAIL:L:string:${s}`);
    expect(got).toContain('FAIL:L:number:1e9');
  });

  it('new files still get no baseline: the allow file lists none of the D-78 files', () => {
    for (const k of Object.keys(realAllow.baseline)) expect(k).not.toMatch(/maxbld\/(split|two-structure)\.js$/);
  });
});
