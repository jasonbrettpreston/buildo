// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-67 arm L, L10); R-KN, R-LA.
// MB-67 owner commit 2026-11-13 (operator "all recommendations accepted"; review-20261113 K3 + Q3): the real
// literal-scan scope covers the real by-law code paths, a NEW literal there fails, and no zero-match glob hides.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanScope, deadScopeLines, RULE_FILE, ALLOW_REL } from '../../scripts/analysis/mcbylaws/literal-scan.mjs';
import { deadGlobs } from '../../scripts/analysis/mcbylaws/paths.mjs';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const policy = read('mcbylaws/protected-paths.json');
const allow = read(ALLOW_REL);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
const scanReal = (rel: string, extra: string) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-real-'));
  try {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, fs.readFileSync(path.join(ROOT, rel), 'utf8') + extra);
    return scanScope({ root: tmp, files: [rel], policy, allow, astGrepBin: path.join(ROOT, 'node_modules/.bin/ast-grep'), ruleFile: path.join(ROOT, RULE_FILE) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
};

describe('real by-law paths are in the literal scan', () => {
  it.each([
    'scripts/lib/bylaw-resolution.js',
    'scripts/lib/bylaw-materialize.js',
    'scripts/lib/bylaw-lot-row.js',
    'scripts/lib/compute/resolve-bylaws.js',
    'scripts/lib/compute/load-bylaw-map-areas.js',
    'scripts/lib/compute/compute-maxbld-scenarios.js',
    'scripts/lib/compute/maxbld/rows.js',
  ])('a new literal in %s fails; the file as committed passes', (rel) => {
    expect(scanReal(rel, '')).toEqual([]);
    const v = scanReal(rel, '\nexport const zzNewLiteral = 7.77;\nexport const zzNewWord = "zz-new-word";\n');
    expect(v.flatMap((x) => x.verdicts)).toEqual(expect.arrayContaining(['FAIL:L:number:7.77', 'FAIL:L:string:zz-new-word']));
  });
  it('a new literal in the bylaw-validation scripts fails', () => {
    const rel = 'scripts/analysis/bylaw-validation/assembly.mjs';
    expect(scanReal(rel, '')).toEqual([]);
    expect(scanReal(rel, '\nexport const zzNew = 7.77;\n').flatMap((x) => x.verdicts)).toContain('FAIL:L:number:7.77');
  });
});

describe('no zero-match glob can hide (L10)', () => {
  it('pending_globs is empty and no layer23 / literal_scope glob matches nothing', () => {
    expect(policy.pending_globs).toEqual([]);
    expect(deadGlobs(policy, tracked)).toEqual([]);
    expect(deadScopeLines(policy, tracked)).toEqual([]);
  });
  it('a zero-match glob in literal_scope is reported', () => {
    const p = { ...policy, literal_scope: [...policy.literal_scope, 'scripts/lib/compute/nope-*.js'] };
    expect(deadScopeLines(p, tracked)).toEqual(['FAIL:L:dead-glob:scripts/lib/compute/nope-*.js']);
  });
});
