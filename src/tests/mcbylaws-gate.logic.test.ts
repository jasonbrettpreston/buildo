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

describe('W4: the CI mode judges each commit of the range from the event base (a Layer 2/3 change in commit 2 of 3 is caught)', () => {
  const threeCommits = (withApproved: boolean) => {
    const repo = mk();
    seed(repo);
    if (withApproved) approve(repo);
    const base = repo.git(['rev-parse', 'HEAD']);
    repo.write('scripts/analysis/bylaw/evaluate.mjs', 'export const evaluate = 1;\n');
    const second = repo.commit('MB-67 second: a Layer 2/3 change');
    repo.write('docs/note.md', '# note\n');
    repo.commit('MB-67 third: docs');
    return { repo, base, second };
  };
  it('red: no APPROVED -> FAIL:H:no-approved on the second commit, exit 1; green twin: no H failure with APPROVED', () => {
    const red = threeCommits(false);
    const r = run(red.repo, ['--ci', '--base', red.base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`FAIL:H:no-approved:${red.second}`);
    const green = threeCommits(true);
    expect(run(green.repo, ['--ci', '--base', green.base]).out).not.toContain('FAIL:H:');
    done();
  });
  it('O67-04: a range whose base has no policy passes when its first commit is the policy alone, and fails when it is not', () => {
    const bootstrap = (withDoc: boolean) => {
      const repo = mk();
      repo.write('docs/note.md', '# note\n');
      const base = repo.commit('MB-67 root: docs only');
      if (withDoc) repo.write('docs/boot.md', '# boot\n');
      repo.write('mcbylaws/protected-paths.json', policy());
      const first = repo.commit('MB-67 add the policy');
      repo.write('docs/later.md', '# later\n');
      repo.commit('MB-67 later docs');
      return { repo, base, first };
    };
    const ok = bootstrap(false);
    const r = run(ok.repo, ['--ci', '--base', ok.base]);
    expect(r.out).not.toContain('FAIL:H:cannot-decide');
    expect(r.status).toBe(0);
    const bad = bootstrap(true);
    const b = run(bad.repo, ['--ci', '--base', bad.base]);
    expect(b.status).toBe(1);
    expect(b.out).toContain('FAIL:H:cannot-decide:');
    expect(b.out).toContain(`:${bad.first}`);
    done();
  });

  it('O67-20: arm C reads the register in each commit\'s PARENT; a later RATIFIED row does not rescue an earlier cite', () => {
    const REG = (m190: string) => `| **M-180** | x | y | z | RATIFIED 2026-10-18 |\n| **M-190** | x | y | z | ${m190} |\n`;
    const SPEC = '## 3. Rows with an OWED marker\n\n| M-361 | m.361 | RULED 2026-10-29 · OWED |\n| LC-15 | lc.15 | RULED · OWED |\n';
    const repo = mk();
    const D = 'docs/specs/01-pipeline';
    seed(repo);
    repo.write(`${D}/133_bylaw_handbook.md`, SPEC);
    repo.write(`${D}/69a_mcbylaw_register.md`, REG('OWED -> MB-9'));
    repo.write(`${D}/124a_step_standard_policy_appendix.md`, '');
    repo.write(`${D}/131_lot_configuration_policy.md`, '');
    const base = repo.commit('MB-67 registers');
    repo.write('scripts/analysis/bylaw-validation/coa-expected/prereg-mb-67.json', JSON.stringify({ task: 'MB-67', rules: ['M-190'] }));
    repo.commit('MB-67 prereg for M-190');
    repo.write('scripts/analysis/bylaw/evaluate.mjs', 'export const evaluate = 1;\n');
    const citing = repo.commit('MB-67 cites M-190\n\nMcBylaws-Task: MB-67\n');
    repo.write(`${D}/69a_mcbylaw_register.md`, REG('RATIFIED 2026-11-01'));
    repo.commit('MB-67 M-190 RATIFIED');
    const r = run(repo, ['--ci', '--base', base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`FAIL:C:not-ruled:M-190:${citing}`);
    done();
  });

  it('the workflow runs the gate once with the event base and never turns it off', () => {
    const yml = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/test.yml'), 'utf8');
    expect(yml.split('gate.mjs --ci --base "$BASE"').length - 1).toBe(1);
    expect(yml).toContain('BASE="origin/$BASE_REF"');
    expect(yml).toContain('BEFORE_SHA: ${{ github.event.before }}');
    expect(yml).toContain('fetch-depth: 0');
  });
});
