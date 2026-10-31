// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan section 5, W:literal / W:held / W:dirty-worktree;
// MB-67 arm L and arms K/N); R-KQ, R-KU. Proves the promises check CALLS MB-67's readers and judges nothing itself.

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { literalLines, heldLines, dirtyLines } from '../../scripts/analysis/mcbylaws-promises/promise-drift-mb67.mjs';
import { scanScope, ALLOW_REL } from '../../scripts/analysis/mcbylaws/literal-scan.mjs';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const ROOT = path.resolve(__dirname, '../..');
const AST_GREP = path.join(ROOT, 'node_modules', '.bin', 'ast-grep');
const RULE_FILE_ABS = path.join(ROOT, 'scripts/ast-grep-rules/bylaw-literal.yml');
const FIXTURES = path.join(ROOT, 'src/tests/fixtures/mcbylaws-gate');
const SCOPE = 'mcbylaws-literal-scope';
const realAllow = JSON.parse(fs.readFileSync(path.join(ROOT, ALLOW_REL), 'utf8'));
const policyOf = (over: Record<string, unknown> = {}) => ({
  pending_globs: [], layer23: [], protected: [], literal_scope: [`${SCOPE}/**`], literal_exempt: [],
  held_dirs: [], held_limit: 12, worktrees: [], boot1: { tasks: [], exempt_ids: [] }, external_arms: [], ...over,
});

// The test process env without GIT_* / DATABASE_URL: no ambient GIT_TEMPLATE_DIR (which plants a `.git` in every
// worktree the real repo has) and no dev DATABASE_URL for the db-tier globalSetup.
const savedEnv: [string, string | undefined][] = [];
const isolate = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-prom-home-'));
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('GIT_') || k === 'DATABASE_URL') { savedEnv.push([k, process.env[k]]); delete process.env[k]; }
  }
  process.env.HOME = home;
  return home;
};
const restore = () => {
  for (const [k, v] of savedEnv.splice(0)) if (v !== undefined) process.env[k] = v;
};

let tmp: string;
let repo: Repo | null = null;
const write = (base: string, rel: string, text: string) => {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return rel;
};
const copyFixture = (name: string) => write(tmp, `${SCOPE}/${name}`, fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const literalArgs = (files: string[]) => ({ root: tmp, files, policy: policyOf(), allow: realAllow, astGrepBin: AST_GREP, ruleFile: RULE_FILE_ABS });

beforeAll(() => { isolate(); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-promises-drift-')); });
afterEach(() => { if (repo) { repo.cleanup(); repo = null; } });
afterAll(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); restore(); });

describe('W:literal — F-D2 (MB-67 scanScope, verbatim)', () => {
  it('the red fixture copy yields number and string lines; the green copy yields none', () => {
    const red = copyFixture('red-literals.mjs');
    const got = literalLines(literalArgs([red]));
    expect(got).toContain('FAIL:L:number:0.45');
    expect(got).toContain('FAIL:L:string:R');
    expect(got).toContain('FAIL:L:string:RT');
    expect(literalLines(literalArgs([copyFixture('green-literals.mjs')]))).toEqual([]);
  });

  it('is verbatim scanScope output (its own verdict lines, nothing added or reordered)', () => {
    const red = copyFixture('red-literals.mjs');
    const args = literalArgs([red]);
    const viaScope = scanScope(args).flatMap((v: { file: string; verdicts: string[] }) => v.verdicts);
    expect(viaScope.length).toBeGreaterThan(0);
    expect(literalLines(args)).toEqual(viaScope);
  });

  it('a scan that cannot run (no ast-grep binary) is MB-67 cannot-scan, never a pass', () => {
    const red = copyFixture('red-literals.mjs');
    const blind = { ...literalArgs([red]), astGrepBin: path.join(tmp, 'no-such-ast-grep') };
    const got = literalLines(blind);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((l) => l.startsWith('FAIL:L:cannot-scan'))).toBe(true);
  });

  it('a scan that throws is FAIL:R:cannot-decide:literal-scan', () => {
    const throwing = { get root(): string { throw new Error('boom'); } };
    expect(literalLines(throwing as never)).toEqual(['FAIL:R:cannot-decide:literal-scan']);
  });
});

describe('W:held — F-D3 (MB-67 heldCount)', () => {
  const heldDir = (n: number) => {
    const dir = fs.mkdtempSync(path.join(tmp, 'held-'));
    for (let i = 0; i < n; i += 1) fs.writeFileSync(path.join(dir, `p${i}.patch`), 'x\n');
    return dir;
  };

  it('N patches at held_limit N pass; N+1 fail with the count and the limit', () => {
    const dir = heldDir(3);
    expect(heldLines(policyOf({ held_dirs: [dir], held_limit: 3 }))).toEqual([]);
    write(dir, 'extra.patch', 'x\n');
    expect(heldLines(policyOf({ held_dirs: [dir], held_limit: 3 }))).toEqual(['FAIL:W:held:4:3']);
  });

  it.each([[0], [-2], [1.5], ['12'], [null]])('held_limit %s is not a positive integer -> cannot-decide', (limit) => {
    expect(heldLines(policyOf({ held_dirs: [heldDir(1)], held_limit: limit }))).toEqual(['FAIL:R:cannot-decide:held']);
  });

  it('a policy that cannot be read -> cannot-decide (a throw never passes)', () => {
    const bad = { get held_dirs(): string[] { throw new Error('boom'); } };
    expect(heldLines(bad as never)).toEqual(['FAIL:R:cannot-decide:held']);
  });
});

describe('W:dirty-worktree — F-D4 (MB-67 worktreeScan)', () => {
  const homeOf = () => fs.mkdtempSync(path.join(tmp, 'home-'));
  const linked = (home: string) => {
    repo = makeRepo();
    fs.symlinkSync(repo.dir, path.join(home, 'mcb-wt-1'));
    return policyOf({ worktrees: ['mcb-wt*'] });
  };

  it('a clean worktree with a commit passes', () => {
    const home = homeOf();
    const policy = linked(home);
    repo!.write('a.txt', 'a\n');
    repo!.commit('one');
    expect(dirtyLines(policy, home)).toEqual([]);
  });

  it('an uncommitted modification to a tracked file is FAIL:W:dirty-worktree:1', () => {
    const home = homeOf();
    const policy = linked(home);
    repo!.write('a.txt', 'a\n');
    repo!.commit('one');
    repo!.write('a.txt', 'b\n');
    expect(dirtyLines(policy, home)).toEqual(['FAIL:W:dirty-worktree:1']);
  });

  it('an untracked file alone is also FAIL:W:dirty-worktree:1', () => {
    const home = homeOf();
    const policy = linked(home);
    repo!.write('a.txt', 'a\n');
    repo!.commit('one');
    repo!.write('stray.txt', 'x\n');
    expect(dirtyLines(policy, home)).toEqual(['FAIL:W:dirty-worktree:1']);
  });

  it('no worktrees declared -> []', () => {
    const home = homeOf();
    expect(dirtyLines(policyOf({ worktrees: [] }), home)).toEqual([]);
  });

  it('an error member or a throw is FAIL:R:cannot-decide:worktree', () => {
    const home = homeOf();
    // A `.git` directory that is not a repository: git status there fails, so MB-67 says {error}.
    fs.mkdirSync(path.join(home, 'wt-bad', '.git'), { recursive: true });
    expect(fs.existsSync(path.join(home, 'wt-bad', '.git', '.git'))).toBe(false);
    expect(dirtyLines(policyOf({ worktrees: ['wt-bad'] }), home)).toEqual(['FAIL:R:cannot-decide:worktree']);
    const thrower = { get worktrees(): string[] { throw new Error('boom'); } };
    expect(dirtyLines(thrower as never, home)).toEqual(['FAIL:R:cannot-decide:worktree']);
  });
});
