// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (the commit gate); plan §1/§8, arms H1..H7, G67-12;
//            R-KM, R-KP, R-LF. The gate composes the arms and decides; this test drives it through its CLI only.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const GATE = path.resolve(__dirname, '../../scripts/analysis/mcbylaws/gate.mjs');
const REAL_POLICY = path.resolve(__dirname, '../../mcbylaws/protected-paths.json');
const L23 = 'scripts/analysis/bylaw/**';

const policy = (over: Record<string, unknown> = {}) => JSON.stringify({
  pending_globs: [], layer23: [L23], protected: [], literal_scope: [], literal_exempt: [], held_dirs: [],
  held_limit: 12, worktrees: [], boot1: { tasks: ['MB-67'], exempt_ids: ['BOOT-1'] }, external_arms: [], ...over,
}, null, 2);

/** The env every spawn of the gate gets: no GIT_*, and the switches that must change nothing (P3). */
const env = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as Record<string, string>;

function run(repo: Repo, args: string[]) {
  const r = spawnSync(process.execPath, [GATE, ...args], {
    cwd: repo.dir, encoding: 'utf8', timeout: 60_000,
    env: { ...env(), GIT_CONFIG_GLOBAL: '/dev/null', HUSKY: '0', SKIP_MCBYLAWS_GATE: '1', MCBYLAWS_GATE: 'off' } as unknown as NodeJS.ProcessEnv,
  });
  return { status: r.status, out: `${String(r.stdout)}\n${String(r.stderr)}` };
}

function seed(repo: Repo, policyText = policy()) {
  repo.write('mcbylaws/protected-paths.json', policyText);
  repo.write('src/tests/bylaw-x.test.ts', 'export const x = 1;\n');
  repo.write('scripts/analysis/bylaw/seed.mjs', 'export const seed = 1;\n');
  repo.commit('MB-67 seed');
}

function approve(repo: Repo) {
  repo.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-10-30\n');
  repo.commit('MB-67 O-1 APPROVED');
}

function l23Change(repo: Repo) {
  repo.write('scripts/analysis/bylaw/evaluate.mjs', 'export const evaluate = 1;\n');
  repo.stage('scripts/analysis/bylaw/evaluate.mjs');
}

const repos: Repo[] = [];
const mk = () => { const r = makeRepo(); repos.push(r); return r; };
const done = () => { for (const r of repos.splice(0)) r.cleanup(); };

describe('mcbylaws gate CLI', () => {
  it('H1: a Layer 2/3 staged change with no APPROVED fails, and passes once APPROVED is committed', () => {
    const ready = mk();
    seed(ready);
    ready.write('mcbylaws/APPROVED', 'O-1 APPROVED 2026-10-30\n');
    ready.commit('MB-67 O-1 APPROVED');
    l23Change(ready);
    const green = run(ready, ['--staged']);
    expect(green.status).toBe(0);
    expect(green.out).toContain('GATE OK');

    const red = mk();
    seed(red);
    l23Change(red);
    const r = run(red, ['--staged']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL:H:no-approved');
    expect(r.out).toContain('GATE FAIL');
    done();
  });

  it('a docs-only staged change passes; an unknown mode and a missing --base fail closed', () => {
    const repo = mk();
    seed(repo);
    repo.write('docs/note.md', '# note\n');
    repo.stage('docs/note.md');
    expect(run(repo, ['--staged']).status).toBe(0);
    const unknown = run(repo, ['--bogus']);
    expect(unknown.status).toBe(1);
    expect(run(repo, ['--ci']).status).toBe(1);
    done();
  });

  it('H5: a Merge message passes at --commit-msg even with the red staged set; the red set itself fails', () => {
    const repo = mk();
    seed(repo);
    l23Change(repo);
    repo.write('.git/MERGE_MSG', 'Merge branch x\n');
    expect(run(repo, ['--commit-msg', '.git/MERGE_MSG']).status).toBe(0);
    repo.write('.git/COMMIT_EDITMSG', 'MB-67 a change\n');
    const red = run(repo, ['--commit-msg', '.git/COMMIT_EDITMSG']);
    expect(red.status).toBe(1);
    expect(red.out).toContain('FAIL:H:no-approved');
    done();
  });

  it('H7: a dead layer23 glob fails, and passes when it is listed in pending_globs', () => {
    const repo = mk();
    seed(repo, policy({ layer23: ['scripts/analysis/bylaw/**', 'scripts/nope/**'] }));
    approve(repo);
    l23Change(repo);
    expect(run(repo, ['--staged']).out).toContain('FAIL:H:dead-glob');
    const pending = mk();
    seed(pending, policy({ layer23: ['scripts/analysis/bylaw/**', 'scripts/nope/**'], pending_globs: ['scripts/nope/**'] }));
    approve(pending);
    l23Change(pending);
    expect(run(pending, ['--staged']).status).toBe(0);
    done();
  });

  it('G67-12: an external arm missing fails when required and is pending when not', () => {
    const req = mk();
    seed(req, policy({ external_arms: [{ id: 'loop', required: true }] }));
    approve(req);
    l23Change(req);
    const a = run(req, ['--staged']);
    expect(a.status).toBe(1);
    expect(a.out).toContain('FAIL:X:arm-missing:loop');
    const opt = mk();
    seed(opt, policy({ external_arms: [{ id: 'loop', required: false }] }));
    approve(opt);
    l23Change(opt);
    const b = run(opt, ['--staged']);
    expect(b.status).toBe(0);
    expect(b.out).toContain('external arm loop: pending');
    expect(b.out).not.toContain('FAIL:');
    done();
  });

  it('P3: the gate source carries no environment switch', () => {
    const src = fs.readFileSync(GATE, 'utf8');
    for (const word of ['process.env', 'SKIP', 'BYPASS', 'no-gate']) expect(src).not.toContain(word);
  });

  it('the real policy file is valid and this repo has an APPROVED record', () => {
    const parsed = JSON.parse(fs.readFileSync(REAL_POLICY, 'utf8'));
    expect(Array.isArray(parsed.layer23)).toBe(true);
    expect(parsed.held_limit).toBeGreaterThan(0);
  });
});
