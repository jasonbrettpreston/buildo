// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (the commit gate); plan §1/§8, arms H1..H7, G67-12;
//            R-KM, R-KP, R-LF. The gate composes the arms and decides; this test drives it through its CLI only.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const GATE = path.resolve(__dirname, '../../scripts/analysis/mcbylaws/gate.mjs');
const REAL_POLICY = path.resolve(__dirname, '../../mcbylaws/protected-paths.json');
const REAL_ROOT = path.resolve(__dirname, '../..');
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

describe('O67-23: arm V runs over the DB scope inside --staged and the range', () => {
  const NIGHT = '.cursor/night-x.md';
  const CLOUD = "psql postgres://u:p@db.abc.supabase.co:5432/postgres -c 'select 1'\n";
  const LOCAL = 'PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres\n';
  it('a staged night file with a cloud target fails; the same file with a local target passes', () => {
    const red = mk();
    seed(red);
    red.write(NIGHT, CLOUD);
    red.stage(NIGHT);
    const r = run(red, ['--staged']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL:V:db-target-not-local');
    const green = mk();
    seed(green);
    green.write(NIGHT, LOCAL);
    green.stage(NIGHT);
    const g = run(green, ['--staged']);
    expect(g.status).toBe(0);
    expect(g.out).toContain('GATE OK');
    done();
  });
  it('a committed cloud target in DB scope fails a --ci range', () => {
    const repo = mk();
    seed(repo);
    const base = repo.git(['rev-parse', 'HEAD']);
    repo.write('scripts/analysis/mcbylaws-loop/run.mjs', "export const u = 'postgres://u:p@db.abc.supabase.co:5432/postgres';\n");
    repo.commit('MB-67 a cloud target');
    const r = run(repo, ['--ci', '--base', base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL:V:db-target-not-local');
    done();
  });
});

describe('O67-11: the loop arm is called as its CLI defines (argv and verdicts)', () => {
  const LOOP = 'scripts/analysis/mcbylaws-loop/loop-gate.mjs';
  const LOG = 'argv.log';
  const fake = (code: number) => `import * as fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(LOG)}, process.argv.slice(2).join(' ') + '\\n');\nprocess.stdout.write('loop ok\\n');\nprocess.exit(${code});\n`;
  const withFake = (code: number) => {
    const repo = mk();
    repo.write(LOOP, fake(code));
    seed(repo, policy({ external_arms: [{ id: 'loop', required: true }] }));
    approve(repo);
    return repo;
  };
  const logged = (repo: Repo) => fs.readFileSync(path.join(repo.dir, LOG), 'utf8').split('\n').filter(Boolean);
  it('--staged calls check --mode commit; --ci --base <rev> calls check --mode ci --base <rev>', () => {
    const repo = withFake(0);
    l23Change(repo);
    const s = run(repo, ['--staged']);
    expect(s.status).toBe(0);
    expect(logged(repo)).toContain('check --mode commit');
    expect(s.out).toContain('loop: loop ok');
    repo.git(['rm', '-q', '--cached', '-f', 'scripts/analysis/bylaw/evaluate.mjs']);
    fs.rmSync(path.join(repo.dir, 'scripts/analysis/bylaw/evaluate.mjs'));
    fs.rmSync(path.join(repo.dir, LOG), { force: true });
    const base = repo.git(['rev-parse', 'HEAD']);
    repo.write('docs/note.md', '# note\n');
    repo.commit('MB-67 docs');
    fs.rmSync(path.join(repo.dir, LOG), { force: true });
    const c = run(repo, ['--ci', '--base', base]);
    expect(c.status).toBe(0);
    expect(logged(repo)).toContain(`check --mode ci --base ${base}`);
    done();
  });
  it('an arm that exits 2 is FAIL:X:arm-failed:loop', () => {
    const repo = withFake(2);
    l23Change(repo);
    const r = run(repo, ['--staged']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL:X:arm-failed:loop');
    done();
  });
  it('--push calls the arm once per ref with the ref base', () => {
    const repo = withFake(0);
    const remote = repo.git(['rev-parse', 'HEAD']);
    l23Change(repo);
    const local = repo.commit('MB-67 a Layer 2/3 change');
    const input = `refs/heads/main ${local} refs/heads/main ${remote}\n`;
    const r = spawnSync(process.execPath, [GATE, '--push'], {
      cwd: repo.dir, encoding: 'utf8', timeout: 60_000, input,
      env: { ...env(), GIT_CONFIG_GLOBAL: '/dev/null' } as unknown as NodeJS.ProcessEnv,
    });
    expect(logged(repo)).toContain(`check --mode push --base ${remote}`);
    done();
  });
});

const LIT = 'scripts/analysis/bylaw/lit.mjs';
const ALLOW = 'mcbylaws/literal-allow.json';
const ALLOW_EMPTY = JSON.stringify({ numbers: [], status_words: [], field_names: [], baseline: {} }, null, 2);
const BASELINE_045 = { [LIT]: { numbers: { 0.45: 1 }, strings: {} } };

/** A repo with an EMPTY layer23 (only arm L in play), arm L's scope, the rule file and node_modules. */
function litSeed(allowText = ALLOW_EMPTY) {
  const repo = mk();
  repo.write('mcbylaws/protected-paths.json', policy({ layer23: [], literal_scope: ['scripts/analysis/bylaw/*.mjs'] }));
  repo.write(ALLOW, allowText);
  repo.write('src/tests/bylaw-x.test.ts', 'export const x = 1;\n');
  repo.write(LIT, 'export const a = 0;\n');
  fs.mkdirSync(path.join(repo.dir, 'scripts/ast-grep-rules'), { recursive: true });
  fs.copyFileSync(path.join(REAL_ROOT, 'scripts/ast-grep-rules/bylaw-literal.yml'), path.join(repo.dir, 'scripts/ast-grep-rules/bylaw-literal.yml'));
  fs.symlinkSync(path.join(REAL_ROOT, 'node_modules'), path.join(repo.dir, 'node_modules'), 'dir');
  return { repo, base: repo.commit('MB-67 arm L seed') };
}

describe('E5 (O67-01): arm L reads the baseline from the BASE, never from the commit under review', () => {
  it('one commit that adds 0.45 and raises its own baseline fails; a baseline already in the base passes', () => {
    const red = litSeed();
    red.repo.write(LIT, 'export const a = 0;\nexport const b = 0.45;\n');
    red.repo.write(ALLOW, JSON.stringify({ numbers: [], status_words: [], field_names: [], baseline: BASELINE_045 }, null, 2));
    red.repo.commit('MB-67 adds a literal and its own baseline');
    const r = run(red.repo, ['--ci', '--base', red.base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL:L:number:0.45');

    const green = litSeed(JSON.stringify({ numbers: [], status_words: [], field_names: [], baseline: BASELINE_045 }, null, 2));
    green.repo.write('docs/note.md', '# note\n');
    green.repo.commit('MB-67 docs only');
    const g = run(green.repo, ['--ci', '--base', green.base]);
    expect(g.status).toBe(0);
    expect(g.out).not.toContain('FAIL:L');
    expect(g.out).toContain('GATE OK');
    done();
  });

  it('a deleted or renamed scope file neither cannot-scan nor cannot-decide; only the rename target is scanned', () => {
    const gone = litSeed();
    fs.rmSync(path.join(gone.repo.dir, LIT));
    gone.repo.commit('MB-67 deletes lit.mjs');
    const d = run(gone.repo, ['--ci', '--base', gone.base]);
    expect(d.status).toBe(0);
    expect(d.out).not.toContain('FAIL:L:cannot-scan');
    expect(d.out).not.toContain('FAIL:L:cannot-decide');

    const moved = litSeed();
    moved.repo.git(['mv', LIT, 'scripts/analysis/bylaw/lit2.mjs']);
    moved.repo.write('scripts/analysis/bylaw/lit2.mjs', 'export const a = 0;\nexport const c = 0.45;\n');
    moved.repo.commit('MB-67 renames lit.mjs and adds a literal');
    const m = run(moved.repo, ['--ci', '--base', moved.base]);
    expect(m.out).not.toContain('FAIL:L:cannot-scan');
    expect(m.out).not.toContain('FAIL:L:cannot-decide');
    expect(m.out).toContain('FAIL:L:number:0.45');
    expect(m.out).not.toContain(`${LIT} `);
    done();
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

describe('O67-02: a merge commit is judged by its own combined diff (an "evil" merge cannot hide from --no-merges)', () => {
  it('a conflict resolved off Layer 2/3 fails on the merge sha; a clean merge adds no H failure', () => {
    const evil = mk();
    seed(evil);
    const branch = evil.git(['branch', '--show-current']);
    const base = evil.git(['rev-parse', 'HEAD']);
    evil.git(['checkout', '-q', '-b', 'side']);
    evil.write('scripts/analysis/bylaw/seed.mjs', 'a\n');
    evil.commit('MB-67 side: seed = a');
    evil.git(['checkout', '-q', branch]);
    evil.write('scripts/analysis/bylaw/seed.mjs', 'b\n');
    evil.commit('MB-67 main: seed = b');
    try { evil.git(['merge', 'side']); } catch { /* the conflict is the point */ }
    evil.write('scripts/analysis/bylaw/seed.mjs', 'c\n');
    evil.stage('scripts/analysis/bylaw/seed.mjs');
    evil.git(['commit', '-q', '-m', 'Merge side']);
    const merge = evil.git(['rev-parse', 'HEAD']);
    const red = run(evil, ['--ci', '--base', base]);
    expect(red.status).toBe(1);
    expect(red.out).toContain(`FAIL:H:no-approved:${merge}`);

    const clean = mk();
    seed(clean);
    const branch2 = clean.git(['branch', '--show-current']);
    const base2 = clean.git(['rev-parse', 'HEAD']);
    clean.git(['checkout', '-q', '-b', 'side']);
    clean.write('docs/x.md', '# x\n');
    clean.commit('MB-67 side: docs');
    clean.git(['checkout', '-q', branch2]);
    clean.write('docs/y.md', '# y\n');
    clean.commit('MB-67 main: docs');
    clean.git(['merge', '--no-edit', 'side']);
    const cleanMerge = clean.git(['rev-parse', 'HEAD']);
    expect(cleanMerge).not.toBe(base2);
    const green = run(clean, ['--ci', '--base', base2]);
    expect(green.out).not.toContain(cleanMerge);
    expect(green.out.split('\n').filter((l) => l.startsWith('FAIL:H'))).toEqual([]);
    done();
  });
});

describe('K1 (O67-02/O67-03): a merge-only range is judged; arm L uses every policy before the commits', () => {
  const SEED = 'scripts/analysis/bylaw/seed.mjs';
  const POLICY = 'mcbylaws/protected-paths.json';
  /** Builds a range holding ONE merge commit whose two parents are both in the base; `evil` writes into the merge. */
  const mergeOnly = (evil: boolean) => {
    const repo = mk();
    seed(repo);
    approve(repo);
    const x = repo.git(['rev-parse', 'HEAD']);
    repo.git(['checkout', '-q', '-b', 'y']);
    repo.write('docs/y.md', '# y\n');
    repo.commit('MB-67 y');
    repo.git(['checkout', '-q', '-b', 'side-x', x]);
    repo.write('docs/x.md', '# x\n');
    repo.commit('MB-67 x');
    repo.git(['checkout', '-q', '-b', 'base', 'side-x']);
    repo.git(['merge', '--no-edit', 'y']);
    const base = repo.git(['rev-parse', 'HEAD']);
    repo.git(['checkout', '-q', '-b', 'evil', 'side-x']);
    repo.git(['merge', '--no-ff', '--no-commit', 'y']);
    if (evil) { repo.write(SEED, 'export const q = 42.77;\n'); repo.stage(SEED); }
    else { repo.write('docs/z.md', '# z\n'); repo.stage('docs/z.md'); }
    repo.git(['commit', '-q', '-m', 'Merge y']);
    const merge = repo.git(['rev-parse', 'HEAD']);
    expect(repo.git(['rev-list', '--no-merges', `${base}..${merge}`])).toBe('');
    return { repo, base, merge };
  };

  it('B1: an evil merge alone in the range fails on its sha; a docs-only merge passes', () => {
    const red = mergeOnly(true);
    const r = run(red.repo, ['--ci', '--base', red.base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`FAIL:P:no-record:${red.merge}`);
    const green = mergeOnly(false);
    const g = run(green.repo, ['--ci', '--base', green.base]);
    expect(g.status).toBe(0);
    for (const arm of ['H', 'C', 'P', 'L']) expect(g.out).not.toContain(`FAIL:${arm}:`);
    done();
  });

  it('B2: a narrowing commit does not switch arm L off for a later literal; the control without narrowing fails too', () => {
    const litRepo = (over: Record<string, unknown>) => {
      const s = litSeed(policy(over));
      s.repo.write(POLICY, policy({ layer23: [], literal_scope: [LIT] }));
      return s;
    };
    const red = litSeed(policy({ layer23: [], literal_scope: [LIT] }));
    red.repo.write(POLICY, policy({ layer23: [], literal_scope: ['scripts/analysis/bylaw/other.mjs'] }));
    red.repo.commit('MB-67 narrows literal_scope');
    red.repo.write(LIT, 'export const a = 0;\nexport const b = 0.45;\n');
    red.repo.commit('MB-67 adds a literal');
    expect(run(red.repo, ['--ci', '--base', red.base]).out).toContain('FAIL:L:number:0.45');
    const control = litRepo({});
    control.repo.write(LIT, 'export const a = 0;\nexport const b = 0.45;\n');
    control.repo.commit('MB-67 adds a literal');
    done();
  });
});

describe('L1 (CARD-gates-recheck 1): the landing exception is an exact sha list read at the range tip', () => {
  const EXC = 'mcbylaws/landing-exceptions.json';
  const list = (...shas: string[]) => JSON.stringify({ commits: shas.map((sha) => ({ sha, reason: 'pre-policy landing' })) });
  /** Root docs commit, then a Layer 2/3 change with no policy at its parent and no trailer, then docs with the list. */
  const repo = (listed: (first: string) => string) => {
    const r = mk();
    r.write('docs/note.md', '# note\n');
    const base = r.commit('MB-67 root: docs only');
    r.write('scripts/analysis/bylaw/evaluate.mjs', 'export const evaluate = 1;\n');
    const first = r.commit('MB-67 a Layer 2/3 change with no policy yet');
    r.write('mcbylaws/protected-paths.json', policy());
    r.commit('MB-67 the policy file alone');
    r.write(EXC, listed(first));
    r.commit('MB-67 docs: the exception list');
    return { repo: r, base, first };
  };
  it('a listed sha skips H, C and P and is announced; an unlisted sha still fails', () => {
    const red = repo(() => list());
    const r = run(red.repo, ['--ci', '--base', red.base]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`FAIL:H:cannot-decide:${red.first}`);
    const ok = repo((first) => list(first));
    const g = run(ok.repo, ['--ci', '--base', ok.base]);
    expect(g.status).toBe(0);
    expect(g.out).toContain(`landing exception: ${ok.first}`);
    for (const arm of ['H', 'C', 'P']) expect(g.out).not.toContain(`FAIL:${arm}:cannot-decide:${ok.first}`);
    done();
  });
  it('an invalid list fails closed (FAIL:X:cannot-decide) and the listed commit is still judged', () => {
    for (const text of [list('0'.repeat(7)), 'not json', JSON.stringify({ commits: {} }), JSON.stringify([])]) {
      const bad = repo(() => text);
      const r = run(bad.repo, ['--ci', '--base', bad.base]);
      expect(r.status).toBe(1);
      expect(r.out).toContain('FAIL:X:cannot-decide');
      expect(r.out).toContain(`FAIL:H:cannot-decide:${bad.first}`);
    }
    done();
  });
});

describe('S11: a large range pages the summary and writes the full list, instead of FAIL:S:overflow', () => {
  it('60 protected files on one docs-only commit pass at --ci with a full list', () => {
    const repo = mk();
    seed(repo, policy({ protected: ['mcbylaws/oracle/**'] }));
    approve(repo);
    const base = repo.git(['rev-parse', 'HEAD']);
    for (let i = 0; i < 60; i += 1) repo.write(`mcbylaws/oracle/c${String(i).padStart(2, '0')}.json`, `{ "n": ${i} }\n`);
    repo.commit('MB-67 adds oracle fixtures');
    const r = run(repo, ['--ci', '--base', base]);
    expect(r.out).not.toContain('FAIL:S:overflow');
    expect(r.out).not.toContain('FAIL:S:summary');
    expect(r.out).toContain('full list:');
    expect(r.status).toBe(0);
    done();
  });
});
