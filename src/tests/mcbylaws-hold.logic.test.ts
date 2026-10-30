// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm H (lines 42-52) and arm R
//            (lines 88-93) — H1..H4, H6, H7, R1 and the non-Layer-2/3 pass. R-KP, R-LE(b).

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { holdForCommit, holdForRange, deadGlobLines } from '../../scripts/analysis/mcbylaws/hold.mjs';
import { parseNameStatusZ } from '../../scripts/analysis/mcbylaws/name-status.mjs';

const APPROVED = 'mcbylaws/APPROVED';
const CODE = 'scripts/analysis/bylaw/evaluate.mjs';
const RECORD = 'O-1 APPROVED 2026-10-30\n';

const POLICY: Record<string, unknown> = {
  pending_globs: [],
  layer23: ['scripts/analysis/bylaw/**'],
  protected: [APPROVED],
  literal_scope: [],
  literal_exempt: [],
  held_dirs: ['held'],
  worktrees: ['wt'],
  held_limit: 1,
  boot1: { tasks: ['T1'], exempt_ids: [] },
  external_arms: [],
};

type Entry = { status: string; score: number | null; path: string; oldPath: string | null };
const one = (status: string, path: string): Entry => ({ status, score: null, path, oldPath: null });
const commit = (repo: Repo, rel: string, content: string, msg = 'c') => {
  repo.write(rel, content);
  return repo.commit(msg);
};
const staged = (repo: Repo): Entry[] => parseNameStatusZ(repo.git(['diff', '--cached', '--name-status', '-z', '-M']))!;

let repo: Repo | null = null;
const fresh = () => {
  repo = makeRepo();
  return repo;
};
afterEach(() => {
  repo?.cleanup();
  repo = null;
});

describe('arm H: the hold behind APPROVED', () => {
  it('H1: a Layer 2/3 change with no APPROVED in HEAD is refused', () => {
    const r = fresh();
    commit(r, 'a.txt', 'a', 'root');
    r.write(CODE, 'x');
    r.stage(CODE);
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: staged(r), parentRev: 'HEAD' }))
      .toEqual(['FAIL:H:no-approved']);
  });

  it('H1 green: the same change after APPROVED was committed', () => {
    const r = fresh();
    commit(r, APPROVED, RECORD, 'approved');
    r.write(CODE, 'x');
    r.stage(CODE);
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: staged(r), parentRev: 'HEAD' })).toEqual([]);
  });

  it('H2: APPROVED only on disk / staged is not in the tree; the sole-APPROVED commit passes', () => {
    const r = fresh();
    commit(r, 'a.txt', 'a', 'root');
    r.write(APPROVED, RECORD);
    r.write(CODE, 'x');
    r.stage(CODE);
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: staged(r), parentRev: 'HEAD', onDiskApproved: true }))
      .toEqual(['FAIL:H:not-in-head']);
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: [one('A', APPROVED)], parentRev: 'HEAD', onDiskApproved: true }))
      .toEqual([]);
  });

  it('H3: an APPROVED whose first line is not the record is refused', () => {
    const table: Array<[string, string[]]> = [
      ['', ['FAIL:H:bad-content']],
      ['something else\n', ['FAIL:H:bad-content']],
      [RECORD, []],
    ];
    table.forEach(([content, expected]) => {
      const r = fresh();
      commit(r, APPROVED, content, 'approved');
      r.write(CODE, 'x');
      r.stage(CODE);
      expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: staged(r), parentRev: 'HEAD' })).toEqual(expected);
    });
  });

  it('H4: APPROVED landing with any other path is refused; alone it passes', () => {
    const table: Array<[Entry[], string[]]> = [
      [[one('A', APPROVED), one('M', 'docs/x.md')], ['FAIL:H:approved-not-alone']],
      [[one('A', APPROVED)], []],
    ];
    table.forEach(([entries, expected]) => {
      const r = fresh();
      commit(r, 'a.txt', 'a', 'root');
      expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries, parentRev: 'HEAD' })).toEqual(expected);
    });
  });

  it('a non-Layer-2/3 doc commit with no APPROVED passes', () => {
    const r = fresh();
    commit(r, 'a.txt', 'a', 'root');
    r.write('docs/x.md', 'd');
    r.stage('docs/x.md');
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: staged(r), parentRev: 'HEAD' })).toEqual([]);
  });

  it('H6: range order — A (code) then B (APPROVED) is red at A; B then A is green', () => {
    const code = (r: Repo) => commit(r, CODE, `x${Math.random()}`, 'code');
    const first = fresh();
    const root = commit(first, 'a.txt', 'a', 'root');
    const a = code(first);
    const b = commit(first, APPROVED, RECORD, 'approved');
    expect(holdForRange({ cwd: first.dir, policy: POLICY, base: root, tip: b }))
      .toEqual([`FAIL:H:no-approved:${a}`]);

    const second = fresh();
    const root2 = commit(second, 'a.txt', 'a', 'root');
    commit(second, APPROVED, RECORD, 'approved');
    const later = code(second);
    expect(holdForRange({ cwd: second.dir, policy: POLICY, base: root2, tip: later })).toEqual([]);
  });

  it('H7: a dead layer23 glob is refused unless pending', () => {
    const dead = { ...POLICY, layer23: ['scripts/nope/**'] };
    expect(deadGlobLines(dead, ['a.txt'])).toEqual(['FAIL:H:dead-glob:scripts/nope/**']);
    expect(deadGlobLines({ ...dead, pending_globs: ['scripts/nope/**'] }, ['a.txt'])).toEqual([]);
    expect(deadGlobLines(POLICY, [CODE])).toEqual([]);
  });

  it('R1: a rename out of the globs still triggers, via the old path', () => {
    const setup = (approvedFirst: boolean) => {
      const r = fresh();
      if (approvedFirst) commit(r, APPROVED, RECORD, 'approved');
      commit(r, 'scripts/analysis/bylaw/e.mjs', 'export const e = 1;\n', 'code');
      r.git(['mv', 'scripts/analysis/bylaw/e.mjs', 'scripts/analysis/e2.mjs']);
      return r;
    };
    const red = setup(false);
    const redEntries = staged(red);
    expect(redEntries[0].status).toBe('R');
    expect(holdForCommit({ cwd: red.dir, policy: POLICY, entries: redEntries, parentRev: 'HEAD' }))
      .toEqual(['FAIL:H:no-approved']);

    const green = setup(true);
    expect(holdForCommit({ cwd: green.dir, policy: POLICY, entries: staged(green), parentRev: 'HEAD' })).toEqual([]);
  });

  it('fails closed when the range cannot be read', () => {
    const r = fresh();
    commit(r, 'a.txt', 'a', 'root');
    expect(holdForRange({ cwd: r.dir, policy: POLICY, base: 'no-such-rev', tip: 'HEAD' })).toEqual(['FAIL:H:cannot-decide']);
    expect(holdForCommit({ cwd: r.dir, policy: POLICY, entries: null as never, parentRev: 'HEAD' }))
      .toEqual(['FAIL:H:cannot-decide']);
  });
});
