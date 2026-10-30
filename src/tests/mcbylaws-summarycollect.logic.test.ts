// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan section 4, arm S (S3, S7, S8,
//            S10); R-KY (the pre-push summary), R-KL (worktree report), R-LD (layer 2/3 scope).
//
// The collector feeds `buildSummary`: what the push changes, which commit is Layer 2/3, which panel record exists,
// whether APPROVED moves, how many held patches / dirty worktrees / pending files there are. Fail closed: a git error
// is `{error}` (the caller prints UNKNOWN), never a pass.

import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import {
  collectRef, heldCount, worktreeScan, pendingCount,
} from '../../scripts/analysis/mcbylaws/summary-collect.mjs';

const ZERO = '0'.repeat(40);
const policy = {
  layer23: ['scripts/analysis/bylaw/**'],
  protected: ['scripts/analysis/bylaw/**'],
  pending_globs: ['**/pending/**'],
  literal_scope: [], literal_exempt: [], held_dirs: [], worktrees: [],
  held_limit: 12, boot1: { tasks: [], exempt_ids: [] }, external_arms: [],
};

const repos: Array<{ cleanup(): void }> = [];
const tmps: string[] = [];
afterAll(() => { for (const r of repos) r.cleanup(); for (const t of tmps) fs.rmSync(t, { recursive: true, force: true }); });

function baseRepo(withPanel = false) {
  const repo = makeRepo();
  repos.push(repo);
  repo.write('README.txt', 'r\n');
  const a = repo.commit('init\n\nMcBylaws-Task: MB-1');
  repo.write('scripts/analysis/bylaw/e.mjs', 'x\n');
  if (withPanel) repo.write('docs/reports/panels/MB-9.json', '{"task":"MB-9","plan":"p","output":"o"}');
  const b = repo.commit('layer\n\nMcBylaws-Task: MB-9');
  repo.write('src/app.js', 'line 1\nline 2\nline 3\nline 4\nline 5\n');
  const c = repo.commit('plain');
  return { repo, a, b, c };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function collect(repo: { dir: string }, args: Record<string, unknown>): any {
  return collectRef({ cwd: repo.dir, ref: 'refs/heads/main', localSha: '', remoteSha: ZERO, policy, defaultBase: 'main', ...args } as never);
}

describe('collectRef', () => {
  it('reads the range, the layer23 flag, the task and the panel record', () => {
    for (const withPanel of [false, true]) {
      const { repo, a, b, c } = baseRepo(withPanel);
      const tip = repo.git(['rev-parse', 'HEAD']);
      const r = collect(repo, { localSha: tip, remoteSha: a });
      expect(r.kind).toBe('branch');
      expect(r.commits.length).toBe(2);
      const layer = r.commits.find((k: { sha: string }) => k.sha === c || k.sha === b);
      expect(layer).toBeTruthy();
      const hit = r.commits.find((k: { rules: string[] }) => k.rules.length > 0);
      expect(hit.sha).toBe(b);
      expect(hit.task).toBe('MB-9');
      expect(hit.layer23).toBe(true);
      expect(hit.panel).toBe(withPanel);
      expect(r.changes.some((ch: { path: string }) => ch.path === 'scripts/analysis/bylaw/e.mjs')).toBe(true);
      expect(r.approvedChange).toBeNull();
    }
  });

  it('shows both sides of a rename; APPROVED added in range', () => {
    const { repo, a, c } = baseRepo();
    repo.git(['mv', 'src/app.js', 'src/other.js']);
    repo.commit('move');
    const tip0 = repo.git(['rev-parse', 'HEAD']);
    const r0 = collect(repo, { localSha: tip0, remoteSha: c });
    expect(r0.approvedChange).toBeNull();
    const ren = r0.changes.find((ch: { status: string }) => ch.status === 'R');
    expect(ren).toEqual({ status: 'R', path: 'src/other.js', oldPath: 'src/app.js', added: 0, deleted: 0 });
    repo.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-01-01\n');
    const sha = repo.commit('approve');
    const r = collect(repo, { localSha: sha, remoteSha: c });
    expect(r.approvedChange).toEqual({ sha, subject: 'approve' });
    expect(r.approvedSince.sha).toBe(sha.slice(0, 7));
    expect(r.approvedSince.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.changes.find((ch: { path: string }) => ch.path === 'mcbylaws/APPROVED').added).toBe(1);
  });

  it('base falls back to merge-base against defaultBase; unknown when it fails', () => {
    const { repo, c } = baseRepo();
    repo.git(['branch', 'main-base', c]);
    expect(collect(repo, { localSha: c, remoteSha: ZERO, defaultBase: 'main-base' }).base).toBe(c);
    const r = collect(repo, { localSha: c, remoteSha: ZERO, defaultBase: 'nope' });
    expect(r).toEqual({ kind: 'unknown' });
  });

  it('classifies delete and tag refs', () => {
    const { repo, c } = baseRepo();
    expect(collect(repo, { localSha: ZERO }).kind).toBe('delete');
    expect(collect(repo, { ref: 'refs/tags/x', localSha: c }).kind).toBe('tag');
  });

  it('a git error is {error}, never a pass', () => {
    const { repo } = baseRepo();
    const r = collect(repo, { localSha: 'not-a-sha', remoteSha: 'also-not' });
    expect(typeof r.error).toBe('string');
  });
});

/**
 * The panel column follows arm P: a sole-prereg commit is `exempt`, else a valid record in that commit's own tree is
 * `true`, none is `false` and a record the arm would refuse is `'invalid'`.
 */
describe('collectRef — the panel column (S7, arm P rules)', () => {
  const policyL23 = {
    ...policy,
    layer23: ['scripts/analysis/bylaw-validation/**', 'scripts/analysis/bylaw/**'],
    protected: ['scripts/analysis/bylaw-validation/**', 'scripts/analysis/bylaw/**'],
  };
  const panel = (task: string) => `docs/reports/panels/${task}.json`;
  const record = (task: string) => JSON.stringify({ task, plan: 'p', output: 'o' });

  const scenarios: [string, (repo: Repo) => string, unknown][] = [
    ['a sole-prereg commit with no trailer is exempt', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw-validation/coa-expected/prereg-MB-9-1.json', '{}');
      return repo.commit('prereg only');
    }, 'exempt'],
    ['a layer23 commit with a valid record', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw/e2.mjs', 'y\n');
      repo.write(panel('MB-9'), record('MB-9'));
      return repo.commit('layer\n\nMcBylaws-Task: MB-9');
    }, true],
    ['a layer23 commit with a record naming another task', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw/e3.mjs', 'y\n');
      repo.write(panel('MB-9'), record('MB-8'));
      return repo.commit('layer\n\nMcBylaws-Task: MB-9');
    }, 'invalid'],
    ['a layer23 commit with an unparsable record', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw/e4.mjs', 'y\n');
      repo.write(panel('MB-9'), '{not json');
      return repo.commit('layer\n\nMcBylaws-Task: MB-9');
    }, 'invalid'],
    ['a layer23 commit with no record', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw/e5.mjs', 'y\n');
      return repo.commit('layer\n\nMcBylaws-Task: MB-9');
    }, false],
    ['a layer23 commit with no task trailer', (repo: Repo) => {
      repo.write('scripts/analysis/bylaw/e6.mjs', 'y\n');
      return repo.commit('layer without a trailer');
    }, false],
  ];

  it.each(scenarios)('%s', (_label, make, expected) => {
    const repo = makeRepo();
    repos.push(repo);
    repo.write('README.txt', 'r\n');
    const base = repo.commit('init');
    const sha = make(repo);
    const r = collect(repo, { localSha: sha, remoteSha: base, policy: policyL23 });
    const row = r.commits.find((k: { sha: string }) => k.sha === sha);
    expect(row).toBeTruthy();
    expect(row.layer23).toBe(true);
    expect(row.panel).toBe(expected);
  });

  it('a layer23 commit whose record sits only in HEAD is false, not present', () => {
    const repo = makeRepo();
    repos.push(repo);
    repo.write('README.txt', 'r\n');
    const base = repo.commit('init');
    repo.write('scripts/analysis/bylaw/e7.mjs', 'y\n');
    const sha = repo.commit('layer\n\nMcBylaws-Task: MB-9');
    repo.write(panel('MB-9'), record('MB-9'));
    repo.commit('record later');
    const r = collect(repo, { localSha: 'HEAD', remoteSha: base, policy: policyL23 });
    expect(r.commits.find((k: { sha: string }) => k.sha === sha).panel).toBe(false);
  });

  it('the panel column is closed: never null, whatever arm P cannot name', () => {
    const repo = makeRepo();
    repos.push(repo);
    repo.write('README.txt', 'r\n');
    const base = repo.commit('init');
    repo.write('scripts/analysis/bylaw/e8.mjs', 'y\n');
    const noTrailer = repo.commit('no trailer');
    repo.write(panel('MB-9'), '');
    repo.write('scripts/analysis/bylaw/e9.mjs', 'z\n');
    const emptyRecord = repo.commit('empty record\n\nMcBylaws-Task: MB-9');
    const r = collect(repo, { localSha: 'HEAD', remoteSha: base, policy: policyL23 });
    for (const [sha, want] of [[noTrailer, false], [emptyRecord, 'invalid']] as Array<[string, unknown]>) {
      const row = r.commits.find((k: { sha: string }) => k.sha === sha);
      expect(row.panel).toBe(want);
    }
  });

  it('a commit that is not layer23 keeps panel true', () => {
    const { repo, a, c } = baseRepo();
    const r = collect(repo, { localSha: c, remoteSha: a });
    const plain = r.commits.find((k: { sha: string }) => k.sha === c);
    expect(plain.layer23).toBe(false);
    expect(plain.panel).toBe(true);
  });
});

describe('heldCount / worktreeScan / pendingCount', () => {
  it('counts .patch files, missing dir is 0', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'held-'));
    tmps.push(d);
    for (const f of ['a.patch', 'b.patch', 'c.patch', 'd.txt']) fs.writeFileSync(path.join(d, f), 'x');
    expect(heldCount({ held_dirs: [d] })).toEqual({ count: 3, dirs: 1 });
    expect(heldCount({ held_dirs: [path.join(d, 'gone')] })).toEqual({ count: 0, dirs: 0 });
  });

  it('counts clean and dirty worktrees', () => {
    const { repo } = baseRepo();
    const wt = path.join(path.dirname(repo.dir), `${path.basename(repo.dir)}-wt`);
    repo.git(['worktree', 'add', '-q', '-b', 'wt', wt]);
    tmps.push(wt);
    const home = path.dirname(repo.dir);
    const glob = `${path.basename(repo.dir)}-wt*`;
    expect(worktreeScan({ worktrees: [glob] }, home)).toEqual({ count: 1, dirty: 0, unpushed: 3 });
    fs.writeFileSync(path.join(wt, 'dirt.txt'), 'z');
    expect(worktreeScan({ worktrees: [glob] }, home)).toEqual({ count: 1, dirty: 1, unpushed: 3 });
  });

  it('counts tracked pending files', () => {
    const { repo } = baseRepo();
    expect(pendingCount(repo.dir, 'HEAD')).toBe(0);
    repo.write('mcbylaws/pending/x.md', 'p');
    repo.write('a/b/pending/y.md', 'p');
    const sha = repo.commit('pending');
    expect(pendingCount(repo.dir, sha)).toBe(2);
    expect(pendingCount(repo.dir, 'missing-rev')).toBeNull();
  });
});
