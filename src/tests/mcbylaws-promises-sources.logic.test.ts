// SPEC LINK: MB-73 plan §2.1 — R-KU (ids are found by pattern in every file the queue cites), K1, K3 of the
//            promises check. The source closure of `.cursor/MCBYLAWS-QUEUE.md`: a cited path is only read when it
//            is TRACKED at the rev, so an uncommitted citation can never be followed. A temp repo is made first.

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { ROOT_SOURCE, citedPaths, sourceClosure }
  from '../../scripts/analysis/mcbylaws-promises/promise-sources.mjs';

let repo: Repo | null = null;
afterEach(() => { repo?.cleanup(); repo = null; });
/** A fresh repo whose root queue file holds `rootText`, committed; returns the rev. */
const withQueue = (rootText: string, extra: Record<string, string> = {}): { r: Repo; rev: string } => {
  repo = makeRepo();
  const r = repo;
  r.write(ROOT_SOURCE, rootText);
  for (const [rel, text] of Object.entries(extra)) r.write(rel, text);
  return { r, rev: r.commit('tree') };
};
const closure = (r: Repo, rev: string, depth?: number) =>
  sourceClosure(depth === undefined ? { cwd: r.dir, rev } : { cwd: r.dir, rev, depth });

describe('citedPaths — R-KU patterns', () => {
  it('maps the three citation patterns, the handbook name and drops prose and punctuation', () => {
    const rows: [string, string[]][] = [
      ['see mcbylaws/sources/CARD-a.answered.md.', ['mcbylaws/sources/CARD-a.answered.md']],
      ['(docs/specs/a.md), and mcbylaws/sources/x.md', ['docs/specs/a.md', 'mcbylaws/sources/x.md']],
      ['cites CARD-z.answered.md', ['mcbylaws/sources/CARD-z.answered.md']],
      ['cites HANDBOOK-AMENDMENTS.md', ['mcbylaws/sources/HANDBOOK-AMENDMENTS.md']],
      ['prose without an md ending: CARD-a.answered and docs/specs', []],
      ['mcbylaws/sources/./CARD-q.answered.md', ['mcbylaws/sources/CARD-q.answered.md']],
    ];
    for (const [text, want] of rows) expect(citedPaths(text)).toEqual(want);
  });

  it('never double-prefixes a path already under mcbylaws/sources/', () => {
    expect(citedPaths('mcbylaws/sources/CARD-x.answered.md')).toEqual(['mcbylaws/sources/CARD-x.answered.md']);
  });
});

describe('sourceClosure — F-ID, tracked-only, F-VANISH', () => {
  it('F-ID: a cited card that is tracked is read and its text is in the closure', () => {
    const { r, rev } = withQueue('cites CARD-x.answered.md\n', { 'mcbylaws/sources/CARD-x.answered.md': 'R-ZZ\n' });
    const out = closure(r, rev);
    expect(out.lines).toEqual([]);
    expect(out.files.map((f: { path: string }) => f.path)).toEqual([ROOT_SOURCE, 'mcbylaws/sources/CARD-x.answered.md']);
    expect(out.files[1]?.text).toContain('R-ZZ');
  });

  it('tracked-only: a citation of a file present on disk but uncommitted is refused, root is read alone', () => {
    const { r, rev } = withQueue('cites CARD-y.answered.md\n');
    r.write('mcbylaws/sources/CARD-y.answered.md', 'R-YY\n');
    const out = closure(r, rev);
    expect(out.lines).toEqual(['FAIL:R:source-untracked:mcbylaws/sources/CARD-y.answered.md']);
    expect(out.files.map((f: { path: string }) => f.path)).toEqual([ROOT_SOURCE]);
  });

  it('F-VANISH: a rev that does not exist, and a root absent at the rev, are cannot-decide', () => {
    const { r, rev } = withQueue('cites CARD-x.answered.md\n');
    expect(closure(r, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef').lines).toEqual(['FAIL:R:cannot-decide']);
    r.write('other.txt', 'x\n');
    const after = r.commit('drop');
    r.git(['rm', '-q', ROOT_SOURCE]);
    const noRoot = r.commit('gone');
    expect(after).not.toBe(noRoot);
    expect(closure(r, noRoot).lines).toEqual(['FAIL:R:cannot-decide']);
    expect(closure(r, noRoot).files).toEqual([]);
    // Back at the first rev only the root was committed, so the cited card is (correctly) untracked there.
    expect(closure(r, rev).lines).toEqual(['FAIL:R:source-untracked:mcbylaws/sources/CARD-x.answered.md']);
  });
});

describe('sourceClosure — depth and cycles', () => {
  it('follows a chain root -> spec A -> spec B, terminates on a cycle, and depth 1 stops before B', () => {
    const { r, rev } = withQueue('read docs/specs/a.md\n', {
      'docs/specs/a.md': 'then docs/specs/b.md\n',
      'docs/specs/b.md': 'back to docs/specs/a.md\n',
    });
    const deep = closure(r, rev);
    expect(deep.lines).toEqual([]);
    expect(deep.files.map((f: { path: string }) => f.path)).toEqual([ROOT_SOURCE, 'docs/specs/a.md', 'docs/specs/b.md']);
    const shallow = closure(r, rev, 1);
    expect(shallow.files.map((f: { path: string }) => f.path)).toEqual([ROOT_SOURCE, 'docs/specs/a.md']);
    expect(shallow.lines).toEqual([]);
  });

  it('a cited path that is tracked but unreadable is cannot-decide; an empty closure is never a pass', () => {
    const { r, rev } = withQueue('read mcbylaws/sources/gone.md\n', { 'mcbylaws/sources/gone.md': 'x\n' });
    expect(closure(r, rev).files.map((f: { path: string }) => f.path))
      .toEqual([ROOT_SOURCE, 'mcbylaws/sources/gone.md']);
    // A blob object left in the tree unreadable by `readAt` (a gitlink: no blob in this repo) is cannot-decide,
    // so the root queue rewritten and committed here must cite it.
    r.write(ROOT_SOURCE, 'read mcbylaws/sources/gitlink.md\n');
    // Stage ONLY the root: 'git add -A' would drop the cacheinfo gitlink entry added just below.
    r.git(['add', ROOT_SOURCE]);
    r.git(['update-index', '--add', '--cacheinfo', '160000,deadbeefdeadbeefdeadbeefdeadbeefdeadbeef,mcbylaws/sources/gitlink.md']);
    // `commit()` runs `git add -A`, which DROPS the cacheinfo entry (no such directory on disk), so commit the index as is.
    r.git(['commit', '-q', '-m', 'gitlink']);
    const gitlinkRev = r.git(['rev-parse', 'HEAD']);
    expect(closure(r, gitlinkRev).lines).toEqual([
      'FAIL:R:cannot-decide:unreadable:mcbylaws/sources/gitlink.md',
    ]);
    expect(closure(r, gitlinkRev).files.map((f: { path: string }) => f.path)).toEqual([ROOT_SOURCE]);
    // A rev whose tracked tree has no root queue file at all: cannot-decide, never an empty pass.
    r.git(['rm', '-q', ROOT_SOURCE, 'mcbylaws/sources/gone.md']);
    const emptyRev = r.commit('empty');
    expect(closure(r, emptyRev)).toEqual({ files: [], lines: ['FAIL:R:cannot-decide'] });
  });
});
