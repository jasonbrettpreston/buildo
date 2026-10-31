// SPEC LINK: MB-73 plan 2.4, 2.5 and 3; K1c, K18, PR-73-2 (the artifact map is declared data).
// The join/vanish/hash functions take plain arrays; the git-reading ones run on a temp repo from the shared helper.

import { describe, expect, it, afterEach } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import {
  ARTIFACTS_PATH, buildRegister, readArtifacts, joinArtifacts, idsAt, vanishedLines, identityHash, registerHash,
} from '../../scripts/analysis/mcbylaws-promises/promise-register.mjs';

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'R-KQ', kind: 'rule', file: '.cursor/MCBYLAWS-QUEUE.md', quoted_line: '- R-KQ: x',
  owner_task: null, increment: null, ...over,
});
const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ artifact: 'x.md', test_name: 't', ...over });

let repo: Repo;
const mk = () => { repo = makeRepo(); return repo; };
afterEach(() => { repo?.cleanup(); });

describe('F-P1/F-P2 the artifact map (K18, PR-73-2)', () => {
  it('a row with no entry fails; an entry whose artifact is tracked passes', () => {
    const r = mk();
    r.write('docs/a.md', 'a');
    const head = r.commit('base');
    expect(joinArtifacts({ rows: [row()], artifacts: {}, cwd: r.dir, rev: head })).toEqual(['FAIL:R:no-artifact:R-KQ']);
    expect(joinArtifacts({ rows: [row()], artifacts: { 'R-KQ': entry({ artifact: 'docs/a.md' }) }, cwd: r.dir, rev: head }))
      .toEqual([]);
  });

  it.each([['docs/gone.md'], ['../x'], ['/abs']])('an artifact %s is missing at HEAD', (artifact) => {
    const r = mk();
    r.write('.keep', '');
    const head = r.commit('base');
    expect(joinArtifacts({ rows: [row()], artifacts: { 'R-KQ': entry({ artifact }) }, cwd: r.dir, rev: head }))
      .toEqual(['FAIL:R:artifact-missing:R-KQ']);
  });

  it('an artifact added and committed then passes', () => {
    const r = mk();
    r.write('.keep', '');
    r.commit('base');
    r.write('docs/b.md', 'b');
    const head = r.commit('add b');
    expect(joinArtifacts({ rows: [row()], artifacts: { 'R-KQ': entry({ artifact: 'docs/b.md' }) }, cwd: r.dir, rev: head }))
      .toEqual([]);
  });
});

describe('F-SC scope is derived (K18)', () => {
  it('an increment key on an entry fails; the same entry without it passes', () => {
    const r = mk();
    r.write('x.md', 'x');
    const head = r.commit('base');
    const inc = { 'R-KQ': entry({ increment: 'MB-73' }) };
    expect(joinArtifacts({ rows: [], artifacts: inc, cwd: r.dir, rev: head })).toEqual(['FAIL:R:scope-key:R-KQ']);
    expect(joinArtifacts({ rows: [], artifacts: { 'R-KQ': entry() }, cwd: r.dir, rev: head })).toEqual([]);
  });

  it('scope-key lines come before the per-row lines', () => {
    const r = mk();
    r.write('.keep', '');
    const head = r.commit('base');
    const lines = joinArtifacts({ rows: [row({ id: 'R-KU' })], artifacts: { 'R-KQ': entry({ increment: 'x' }) }, cwd: r.dir, rev: head });
    expect(lines[0]).toBe('FAIL:R:scope-key:R-KQ');
    expect(lines).toContain('FAIL:R:no-artifact:R-KU');
  });
});

describe('readArtifacts', () => {
  it('an absent file is the bootstrap: empty map, no lines', () => {
    const r = mk();
    r.write('.keep', '');
    const head = r.commit('base');
    expect(readArtifacts(r.dir, head)).toEqual({ artifacts: {}, lines: [] });
  });

  it.each([['not json'], ['[]'], ['{"R-KQ": 3}'], ['{"R-KQ": {"artifact": "a", "test_name": ""}}'], ['{"R-KQ": {"artifact": "", "test_name": "t"}}']])(
    'unreadable content %j cannot decide',
    (body) => {
      const r = mk();
      r.write(ARTIFACTS_PATH, body);
      const head = r.commit('map');
      expect(readArtifacts(r.dir, head)).toEqual({ artifacts: {}, lines: ['FAIL:R:cannot-decide:artifacts-json'] });
    },
  );

  it('a valid map is returned; an entry carrying an increment key reads fine here', () => {
    const r = mk();
    r.write(ARTIFACTS_PATH, JSON.stringify({ 'R-KQ': { artifact: 'a.md', test_name: 't', increment: 'X' } }));
    const head = r.commit('map');
    const out = readArtifacts(r.dir, head);
    expect(out.lines).toEqual([]);
    expect((out.artifacts as Record<string, Record<string, unknown>>)['R-KQ']?.artifact).toBe('a.md');
  });
});

describe('F-VANISH and idsAt (K1c)', () => {
  it('an id of the base that no row carries has vanished', () => {
    expect(vanishedLines({ baseIds: new Set(['A', 'B']), rows: [row({ id: 'A' })] })).toEqual(['FAIL:R:id-vanished:B']);
    expect(vanishedLines({ baseIds: new Set(['A']), rows: [row({ id: 'A' })] })).toEqual([]);
  });

  it('idsAt is the artifact keys plus the green and red ids', () => {
    const r = mk();
    r.write(ARTIFACTS_PATH, JSON.stringify({ 'R-KQ': { artifact: 'a.md', test_name: 't' } }));
    r.write('mcbylaws/promises/green/G-1.json', '{}');
    r.write('mcbylaws/promises/red/RED-2.json', '{}');
    const head = r.commit('map');
    expect([...idsAt(r.dir, head)!].sort()).toEqual(['G-1', 'R-KQ', 'RED-2']);
  });

  it('idsAt is null when the tracked list cannot be read', () => {
    const r = mk();
    r.write('.keep', '');
    r.commit('base');
    expect(idsAt(r.dir, 'no-such-rev')).toBeNull();
  });
});

describe('identityHash and registerHash (FV-3)', () => {
  it('identity ignores status, owner_task and increment', () => {
    const e = entry({ artifact: 'a.md', test_name: 't', status: 'pass' });
    expect(identityHash(row(), e))
      .toBe(identityHash(row({ owner_task: 'MB-1', increment: 'X' }), { ...e, status: 'fail' }));
  });

  it('identity changes with quoted_line and with artifact', () => {
    expect(identityHash(row(), entry())).not.toBe(identityHash(row({ quoted_line: '- other' }), entry()));
    expect(identityHash(row(), entry())).not.toBe(identityHash(row(), entry({ artifact: 'b.md' })));
  });

  it('registerHash is order independent and a missing entry is hashed as nulls', () => {
    const a = registerHash([row({ id: 'A' }), row({ id: 'B' })], { A: entry(), B: entry({ artifact: 'b.md' }) });
    const b = registerHash([row({ id: 'B' }), row({ id: 'A' })], { B: entry({ artifact: 'b.md' }), A: entry() });
    expect(a).toBe(b);
    expect(registerHash([row({ id: 'A' })], {})).toBe(registerHash([row({ id: 'A', kind: 'other' })], {}));
  });
});

describe('buildRegister', () => {
  it('reads the queue root and extracts its rows', () => {
    const r = mk();
    r.write('.cursor/MCBYLAWS-QUEUE.md', '# queue\n\n- R-KQ: x\n');
    const head = r.commit('queue');
    const out = buildRegister({ cwd: r.dir, rev: head, incIds: [] });
    expect(out.rows.map((x) => (x as { id: string }).id)).toEqual(['R-KQ']);
    expect(Array.isArray(out.lines)).toBe(true);
    expect(out.files.length).toBeGreaterThan(0);
  });
});
