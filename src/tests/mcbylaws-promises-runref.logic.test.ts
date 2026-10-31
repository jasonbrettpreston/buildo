// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md (MB-73 plan section 4 "The run (K5)"); R-KQ, R-KU.
// The promise tests must run at the CHECKED ref, not the working tree: an uncommitted failing test in the tree
// cannot turn the checked ref red, and an uncommitted passing test cannot turn it green.

import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { runVitest, matchTests, runAtRef, withCheckout }
  from '../../scripts/analysis/mcbylaws-promises/promise-run.mjs';

const ROOT = path.resolve(__dirname, '../..');
const VITEST = path.join(ROOT, 'node_modules', '.bin', 'vitest');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const CONFIG = `export default { test: { globals: true, include: ['*.test.mjs'] } };\n`;
const PASS = `it('holds', () => { expect(1).toBe(1); });\n`;
const FAIL = `it('holds', () => { expect(1).toBe(2); });\n`;
const ENTRY = [{ id: 't1', artifact: 'a.test.mjs', test_name: 'holds' }];

let repo: Repo | null = null;
afterEach(() => { if (repo) repo.cleanup(); repo = null; });

/** A temp repo with a committed vitest config and a committed passing test; node_modules symlinked (untracked). */
function makeChecked(): { r: Repo; sha: string } {
  const r = makeRepo();
  r.write('vitest.config.mjs', CONFIG);
  r.write('a.test.mjs', PASS);
  const sha = r.commit('checked');
  fs.symlinkSync(NODE_MODULES, path.join(r.dir, 'node_modules'));
  return { r, sha };
}

const run = (r: Repo, sha: string) =>
  runAtRef({ cwd: r.dir, rev: sha, files: ['a.test.mjs'], bin: VITEST, config: 'vitest.config.mjs', timeoutMs: 180000 });

describe('runAtRef — the checked ref, not the working tree', () => {
  it('runs the committed test green', () => {
    repo = null;
    const { r, sha } = makeChecked();
    repo = r;
    const res = run(r, sha);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(matchTests(res.json, ENTRY)).toEqual({ t1: { state: 'passed', fullName: 'holds' } });
  });

  it('an uncommitted failing test cannot turn the checked ref red', () => {
    const { r, sha } = makeChecked();
    repo = r;
    fs.writeFileSync(path.join(r.dir, 'a.test.mjs'), FAIL);
    const atRef = run(r, sha);
    expect(atRef.ok, JSON.stringify(atRef)).toBe(true);
    expect((matchTests(atRef.json, ENTRY) as Record<string, { state: string }>)['t1']!.state).toBe('passed');
    const tree = runVitest({ cwd: r.dir, files: ['a.test.mjs'], bin: VITEST, config: 'vitest.config.mjs', timeoutMs: 180000 });
    expect(tree.ok).toBe(true);
    expect((matchTests(tree.json, ENTRY) as Record<string, { state: string }>)['t1']!.state).toBe('failed');
  });

  it('a rev that does not exist fails closed with a checkout reason', () => {
    const { r } = makeChecked();
    repo = r;
    const res = run(r, '0000000000000000000000000000000000000000');
    expect(res.ok).toBe(false);
    expect(res.reason.startsWith('checkout:')).toBe(true);
  });

  it('leaves no checkout directory behind, even after a failure', () => {
    const { r, sha } = makeChecked();
    repo = r;
    let seen = '';
    let existedInside = false;
    const failRes = withCheckout(r.dir, sha, (dir: string) => {
      seen = dir;
      existedInside = fs.existsSync(dir);
      throw new Error('x');
    });
    expect(failRes).toEqual({ ok: false, reason: 'checkout-fn' });
    expect(existedInside).toBe(true);
    expect(fs.existsSync(seen)).toBe(false);

    let seen2 = '';
    let existedInside2 = false;
    const okRes = withCheckout(r.dir, sha, (dir: string) => {
      seen2 = dir;
      existedInside2 = fs.existsSync(dir);
      return 1;
    });
    expect(okRes).toEqual({ ok: true, value: 1 });
    expect(existedInside2).toBe(true);
    expect(fs.existsSync(seen2)).toBe(false);
  });
});

describe('withCheckout — the tree of a rev in a temp dir', () => {
  it('returns the fn value and removes the dir', () => {
    const { r, sha } = makeChecked();
    repo = r;
    let seen = '';
    const res = withCheckout(r.dir, sha, (dir: string) => {
      seen = dir;
      return fs.readFileSync(path.join(dir, 'a.test.mjs'), 'utf8');
    });
    expect(res).toEqual({ ok: true, value: PASS });
    expect(fs.existsSync(seen)).toBe(false);
    expect(fs.existsSync(path.join(seen, 'node_modules'))).toBe(false);
  });

  it('a throwing fn is checkout-fn and the dir is gone', () => {
    const { r, sha } = makeChecked();
    repo = r;
    let seen = '';
    const res = withCheckout(r.dir, sha, (dir: string) => { seen = dir; throw new Error('boom'); });
    expect(res).toEqual({ ok: false, reason: 'checkout-fn' });
    expect(fs.existsSync(seen)).toBe(false);
  });
});
