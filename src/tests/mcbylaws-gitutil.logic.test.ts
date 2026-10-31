// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan §B1c — git helpers.
//            R-KP (keep the pass honest: a read that cannot resolve returns null/false, never a pass) and R-LF
//            (landed-fact witnesses): every helper is HOW the gate reads a commit, so each is proved against ONE real
//            temp git repo — path present/absent at HEAD, the exit-128 absent case, index vs HEAD, a range that
//            skips a merge, the root commit via --root, a rename R entry, and a path containing a newline intact.
//
// Red-first: written before scripts/analysis/mcbylaws/git-util.mjs existed (typecheck: TS2307 on the import).
//
// Run note: the repo's vitest config registers the db globalSetup, which REFUSES the local Supabase dev-stack
// DATABASE_URL a dev shell exports (BUILDO_TEST_DB_EXTERNAL=1 on that stack is the explicit "disposable external DB"
// marker, and the guard then accepts it). This suite touches no database, but until the orchestrator re-runs it with
// that marker (or DATABASE_URL unset), the five cases below are reasoned, not observed:
//   BUILDO_TEST_DB_EXTERNAL=1 npx vitest run src/tests/mcbylaws-gitutil.logic.test.ts --run

import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as gitUtil from '../../scripts/analysis/mcbylaws/git-util.mjs';
import { makeRepo } from './fixtures/mcbylaws-gate/repo-helper';

const gu = gitUtil as unknown as {
  git(cwd: string, args: string[], opts?: { input?: string }): { status: number; stdout: string; stderr: string };
  pathExistsAt(cwd: string, rev: string, relPath: string): boolean;
  readAt(cwd: string, rev: string, relPath: string): string | null;
  listTracked(cwd: string, rev: string): string[] | null;
  commitsInRange(cwd: string, base: string, tip: string): string[] | null;
  changesOfCommit(cwd: string, sha: string): string | null;
  stagedChanges(cwd: string): string | null;
  parentOf(cwd: string, sha: string): string | null;
};

const repo = makeRepo();
afterAll(() => repo.cleanup());

// One history for every case: root (a.txt) → second (b/added.txt) → { side: merge-me.txt } merged into main (c.txt)
// → renameCommit (old-name.txt renamed to new-name.txt) → staged-only facts (a brand-new file, a delete, a rename)
// that no commit holds.
repo.write('a.txt', 'root\n');
const root = repo.commit('root');
repo.write('b/added.txt', 'second\n');
const second = repo.commit('second');
repo.git(['checkout', '-q', '-b', 'side']);
repo.write('merge-me.txt', 'side\n');
const side = repo.commit('side');
repo.git(['checkout', '-q', '-']);
repo.write('c.txt', 'main\n');
const mainOnly = repo.commit('main');
repo.git(['merge', '-q', '--no-ff', '-m', 'merge', 'side']);
const merge = repo.git(['rev-parse', 'HEAD']);
// ≥5 identical lines: git only reports a rename (R) when the content is similar enough and large enough, so a
// one-line file staged as a `mv` would come back as A + D, not R.
repo.write('old-name.txt', 'rename payload\nline 2\nline 3\nline 4\nline 5\n');
repo.write('staged-old.txt', 'staged payload\nline 2\nline 3\nline 4\nline 5\n');
repo.commit('add old-name.txt and staged-old.txt');
// A DEDICATED commit that holds only the rename, so changesOfCommit on it is R + both names (the commit that merely
// ADDS old-name.txt would read as a lone A).
repo.git(['mv', 'old-name.txt', 'new-name.txt']);
const renameCommit = repo.commit('rename old-name.txt');
repo.write('brand-new.txt', 'brand new\n');
// Stage first, then move/remove: both facts reach the index before any assertion runs, whatever the order.
repo.stage('brand-new.txt');
repo.git(['mv', 'staged-old.txt', 'staged-new.txt']);
repo.git(['rm', '-q', 'a.txt']);

const nul = (s: string) => s.split('\0').filter(Boolean);

describe('MB-67 B1c — git(cwd, args): never throws; status, stdout, stderr', () => {
  it('runs in cwd and reports the real stdout', () => {
    const r = gu.git(repo.dir, ['rev-parse', '--is-inside-work-tree']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('true');
  });

  it('a non-zero git exit is a result, not an exception (a bad rev is 128)', () => {
    const r = gu.git(repo.dir, ['cat-file', '-e', 'no-such-rev:a.txt']);
    expect(r.status).toBe(128);
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  it('a git that cannot spawn returns status -1 instead of throwing (cwd does not exist)', () => {
    const r = gu.git(`${repo.dir}/does-not-exist`, ['rev-parse', 'HEAD']);
    expect(r.status).toBe(-1);
    expect(r.stdout).toBe('');
    expect(typeof r.stderr).toBe('string');
  });
});

describe('MB-67 B1c — pathExistsAt: true only on exit 0', () => {
  it('present at HEAD is true; absent at HEAD is false, not an exception', () => {
    expect(gu.pathExistsAt(repo.dir, 'HEAD', 'a.txt')).toBe(true);
    expect(() => gu.pathExistsAt(repo.dir, 'HEAD', 'never-written.txt')).not.toThrow();
    expect(gu.pathExistsAt(repo.dir, 'HEAD', 'never-written.txt')).toBe(false);
  });

  it('a rev that does not exist is false, not a throw (exit 128)', () => {
    expect(gu.pathExistsAt(repo.dir, 'no-such-rev', 'a.txt')).toBe(false);
  });

  it('the index answers too: a staged-only path exists in the empty rev and not at HEAD', () => {
    expect(gu.pathExistsAt(repo.dir, '', 'brand-new.txt')).toBe(true);
    expect(gu.pathExistsAt(repo.dir, 'HEAD', 'brand-new.txt')).toBe(false);
  });
});

describe('MB-67 B1c — readAt: the index vs a commit, null when absent', () => {
  it("rev === '' reads the INDEX; a named rev reads that commit", () => {
    expect(gu.readAt(repo.dir, 'HEAD', 'a.txt')).toBe('root\n');
    expect(gu.readAt(repo.dir, root, 'a.txt')).toBe('root\n');
    expect(gu.readAt(repo.dir, '', 'a.txt')).toBeNull(); // deleted from the index
    expect(gu.readAt(repo.dir, '', 'brand-new.txt')).toBe('brand new\n');
  });

  it('a path absent at that rev is null, and a missing rev is null', () => {
    expect(gu.readAt(repo.dir, root, 'c.txt')).toBeNull();
    expect(gu.readAt(repo.dir, 'no-such-rev', 'a.txt')).toBeNull();
  });
});

describe('MB-67 B1c — listTracked: NUL-split, commit and index', () => {
  it('lists the tracked paths of a revision, in git order', () => {
    expect(gu.listTracked(repo.dir, root)).toEqual(['a.txt']);
    expect(gu.listTracked(repo.dir, 'HEAD')).toEqual(['a.txt', 'b/added.txt', 'c.txt', 'merge-me.txt', 'new-name.txt', 'staged-old.txt']);
  });

  it('the empty rev lists the index after the staged mv and rm', () => {
    // git ls-files is path-sorted, so the expectation is sorted too (it is not insertion order).
    const expected = ['b/added.txt', 'brand-new.txt', 'c.txt', 'merge-me.txt', 'new-name.txt', 'staged-new.txt'].sort();
    expect(gu.listTracked(repo.dir, '')).toEqual(expected);
  });

  it('a missing rev is null', () => {
    expect(gu.listTracked(repo.dir, 'no-such-rev')).toBeNull();
  });
});

describe('MB-67 B1c — commitsInRange: oldest first, the merge commit skipped', () => {
  it('names the non-merge commits between base and tip in history order', () => {
    const list = gu.commitsInRange(repo.dir, root, merge);
    expect(list).toEqual([second, side, mainOnly]);
    expect(list).not.toContain(merge);
  });

  it('an empty range is an empty array; a base that does not exist is null', () => {
    expect(gu.commitsInRange(repo.dir, merge, merge)).toEqual([]);
    expect(gu.commitsInRange(repo.dir, 'no-such-rev', merge)).toBeNull();
  });
});

describe('MB-67 B1c — changesOfCommit: --root sees the root commit; a merge yields nothing', () => {
  it('the root commit shows its added path', () => {
    expect(nul(gu.changesOfCommit(repo.dir, root)!)).toEqual(['A', 'a.txt']);
  });

  it('a normal commit shows its change (a rename is R + both names); a merge commit yields no rows', () => {
    expect(nul(gu.changesOfCommit(repo.dir, second)!)).toEqual(['A', 'b/added.txt']);
    // The rename commit changes exactly one path, and it is the mv: R<score>, then old path, then new path.
    const r = nul(gu.changesOfCommit(repo.dir, renameCommit)!);
    expect(r[0]).toMatch(/^R\d+$/); // R<score>, then the OLD path, then the NEW path
    expect(r.slice(1)).toEqual(['old-name.txt', 'new-name.txt']);
    expect(nul(gu.changesOfCommit(repo.dir, merge)!)).toEqual([]);
  });

  it('a sha that does not exist is null', () => {
    expect(gu.changesOfCommit(repo.dir, 'no-such-sha')).toBeNull();
  });
});

describe('MB-67 B1c — stagedChanges: rename R entry, delete D entry, new A entry', () => {
  it('the staged mv is R with both names, the rm a D, the new file an A', () => {
    // git emits --name-status rows in path-sorted order, not insertion order: parse the stream into rows and look
    // each fact up, so the assertion is about content, not position.
    const f = nul(gu.stagedChanges(repo.dir)!);
    // `rows` holds each name-status row; rename/copy rows carry three fields (status, old, new).
    const rows: string[][] = [];
    let i = 0;
    while (i < f.length) {
      if (/^[RC]\d+$/.test(f[i] ?? '')) {
        const [status, oldPath, newPath] = [f[i], f[i + 1], f[i + 2]];
        expect(oldPath, `rename row ${status} must name the old path`).toBeTypeOf('string');
        expect(newPath, `rename row ${status} must name the new path`).toBeTypeOf('string');
        rows.push([status as string, oldPath as string, newPath as string]);
        i += 3;
      } else {
        const [status, relPath] = [f[i], f[i + 1]];
        expect(relPath, `row ${status} must name a path`).toBeTypeOf('string');
        rows.push([status as string, relPath as string]);
        i += 2;
      }
    }
    const plain = rows.filter((r) => r.length === 2);
    expect(plain).toContainEqual(['A', 'brand-new.txt']);
    expect(plain).toContainEqual(['D', 'a.txt']);
    const renames = rows.filter((r) => r.length === 3);
    expect(renames).toHaveLength(1);
    const rename = renames[0]!;
    expect(rename[0]).toMatch(/^R\d+$/);
    expect(rename.slice(1)).toEqual(['staged-old.txt', 'staged-new.txt']);
    expect(rows).toHaveLength(3); // nothing else is staged
  });
});

describe('MB-67 B1c — parentOf', () => {
  it('a commit with a parent yields `<sha>^`; the root commit and an unknown sha yield null', () => {
    expect(gu.parentOf(repo.dir, merge)).toBe(`${merge}^`);
    expect(gu.parentOf(repo.dir, second)).toBe(`${second}^`);
    expect(gu.parentOf(repo.dir, root)).toBeNull();
    expect(gu.parentOf(repo.dir, 'no-such-sha')).toBeNull();
  });
});

describe('MB-67 B1c — a path containing a newline stays intact in the NUL streams', () => {
  it('name-only listing, staged name-status and readAt all carry the newline verbatim', () => {
    const odd = 'line\nbreak.txt';
    repo.write(odd, 'newline payload\n');
    repo.stage(odd);
    try {
      expect(gu.listTracked(repo.dir, '')).toContain(odd);
      expect(nul(gu.stagedChanges(repo.dir)!)).toContain(odd);
      expect(gu.readAt(repo.dir, '', odd)).toBe('newline payload\n');
      expect(gu.pathExistsAt(repo.dir, '', odd)).toBe(true);
    } finally {
      repo.git(['reset', '-q', '--', odd]);
      fs.rmSync(`${repo.dir}/${odd}`, { force: true });
    }
  });
});

describe('MB-67 B1c — repo-helper honours the temp-repo rules', () => {
  it('commit returns the new sha; the repo sits in os.tmpdir() with no signing, and cleanup() removes it', () => {
    const r = makeRepo();
    try {
      r.write('x.txt', 'x\n');
      const sha = r.commit('one');
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(r.git(['rev-parse', 'HEAD'])).toBe(sha);
      expect(r.git(['rev-list', '--count', 'HEAD'])).toBe('1');
      expect(r.dir.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
      expect(r.git(['config', '--get', 'commit.gpgsign'])).toBe('false');
      expect(r.git(['config', '--get', 'user.name'])).toBe('MB-67');
      expect(r.empty).not.toBe(r.dir);
      expect(gu.listTracked(r.dir, 'HEAD')).toEqual(['x.txt']);
    } finally {
      r.cleanup();
    }
    expect(fs.existsSync(r.dir)).toBe(false);
  });
});
