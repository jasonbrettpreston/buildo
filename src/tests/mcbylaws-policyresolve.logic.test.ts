// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan line 31 rule 2 — the policy is
//            read from the BASE, never from the copy being committed. R-LF; arm H (H7 red/green fixture).

import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';
import { resolvePolicy } from '../../scripts/analysis/mcbylaws/policy-resolve.mjs';

const POLICY = 'mcbylaws/protected-paths.json';

function policy(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    pending_globs: [],
    layer23: ['scripts/**'],
    protected: ['docs/**'],
    literal_scope: [],
    literal_exempt: [],
    held_dirs: ['held'],
    worktrees: ['wt'],
    held_limit: 1,
    boot1: { tasks: ['T1'], exempt_ids: [] },
    external_arms: [],
    ...over,
  });
}

let repo: Repo | null = null;
afterEach(() => {
  repo?.cleanup();
  repo = null;
});

interface Pass { ok: true; policy: Record<string, unknown>; source: 'base' | 'bootstrap' }
interface Stop { ok: false; code: 'cannot-decide'; error: string }
interface Entry { status: string; path: string; oldPath: string | null }
const pass = (r: unknown) => r as Pass;
const stop = (r: unknown) => r as Stop;
const own = (rel: string): Entry[] => [{ status: 'A', path: rel, oldPath: null }];

describe('resolvePolicy: the policy is read from the base', () => {
  it('a valid committed policy is read from the base and the staged copy is ignored', () => {
    repo = makeRepo();
    repo.write(POLICY, policy());
    repo.commit('base');
    const first = pass(resolvePolicy(repo.dir, 'HEAD'));
    expect(first.ok).toBe(true);
    expect(first.source).toBe('base');
    expect(first.policy.layer23).toEqual(['scripts/**']);
    // staged loosening differs from base: base still wins
    repo.write(POLICY, policy({ layer23: [] }));
    repo.stage(POLICY);
    const second = pass(resolvePolicy(repo.dir, 'HEAD'));
    expect(second.ok).toBe(true);
    expect(second.source).toBe('base');
    expect(second.policy.layer23).toEqual(['scripts/**']);
  });

  const broken: Array<[string, string]> = [
    ['invalid JSON', '{ not json'],
    ['missing held_limit', JSON.stringify({ layer23: [], protected: [], literal_scope: [] })],
  ];
  for (const [name, content] of broken) {
    it(`cannot-decide when the base copy is ${name}`, () => {
      repo = makeRepo();
      repo.write('README.md', 'x\n');
      repo.commit('doc');
      repo.write(POLICY, content);
      repo.commit('policy');
      const r = resolvePolicy(repo.dir, 'HEAD');
      expect(r.ok).toBe(false);
      expect(stop(r).code).toBe('cannot-decide');
      expect(typeof stop(r).error).toBe('string');
    });
  }

  it('cannot-decide in a repo with no commit and no policy', () => {
    repo = makeRepo();
    const r = stop(resolvePolicy(repo.dir, 'HEAD'));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('cannot-decide');
  });
});

describe('resolvePolicy: bootstrap (no base copy)', () => {
  const boot = (dir: string, entries: Entry[], ownRev?: string) =>
    resolvePolicy(dir, 'HEAD', ownRev === undefined ? { entries } : { ownRev, entries });

  it('the commit that ADDS the policy is judged by its own staged copy', () => {
    repo = makeRepo();
    repo.write('README.md', 'x\n');
    repo.commit('doc');
    repo.write(POLICY, policy());
    repo.stage(POLICY);
    const r = pass(boot(repo.dir, [{ status: 'A', path: POLICY, oldPath: null }], ''));
    expect(r.ok).toBe(true);
    expect(r.source).toBe('bootstrap');
    expect(r.policy.held_limit).toBe(1);
  });

  it('cannot-decide when the bootstrap commit stages the policy plus any document', () => {
    repo = makeRepo();
    repo.write('README.md', 'x\n');
    repo.commit('doc');
    repo.write(POLICY, policy());
    repo.write('docs/notes.md', 'x\n');
    repo.stage(POLICY, 'docs/notes.md');
    const r = boot(repo.dir, [
      { status: 'A', path: POLICY, oldPath: null },
      { status: 'A', path: 'docs/notes.md', oldPath: null },
    ]);
    expect(r.ok).toBe(false);
    expect(stop(r).code).toBe('cannot-decide');
    expect(stop(r).error).toBeTruthy();
  });

  it('cannot-decide when the policy is staged as M alone and there is no base copy', () => {
    repo = makeRepo();
    repo.write('README.md', 'x\n');
    repo.commit('doc');
    repo.write(POLICY, policy());
    repo.stage(POLICY);
    const r = boot(repo.dir, [{ status: 'M', path: POLICY, oldPath: null }], '');
    expect(r.ok).toBe(false);
    expect(stop(r).code).toBe('cannot-decide');
  });

  it('cannot-decide when the bootstrap commit stages a layer23 path', () => {
    repo = makeRepo();
    repo.write('README.md', 'x\n');
    repo.commit('doc');
    repo.write(POLICY, policy());
    repo.write('scripts/analysis/bylaw/e.mjs', 'x\n');
    repo.stage(POLICY, 'scripts/analysis/bylaw/e.mjs');
    const r = boot(repo.dir, [
      { status: 'A', path: POLICY, oldPath: null },
      { status: 'A', path: 'scripts/analysis/bylaw/e.mjs', oldPath: null },
    ]);
    expect(r.ok).toBe(false);
    expect(stop(r).code).toBe('cannot-decide');
  });

  const noBoot: Array<[string, Entry[], string | undefined]> = [
    ['ownRev is not given', own(POLICY), undefined],
    ['entries hold the policy as M not A', [{ status: 'M', path: POLICY, oldPath: null }], ''],
  ];
  for (const [name, entries, ownRev] of noBoot) {
    it(`cannot-decide with no base copy when ${name}`, () => {
      repo = makeRepo();
      repo.write('README.md', 'x\n');
      repo.commit('doc');
      repo.write(POLICY, policy());
      repo.stage(POLICY);
      const r = boot(repo.dir, entries, ownRev);
      expect(r.ok).toBe(false);
      expect(stop(r).code).toBe('cannot-decide');
    });
  }
});
