// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1 clause (2); operator O-29 "0-29 yes", 2026-11-03-batch-aw#CHAT-224.O-29)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.3 `authority (b)` and section 4 T3b
// T3b (brief D3b): the pushed-ruling condition on real throw-away repos with a bare `origin`. Red first: written before
// loop-door-remote.mjs exists. GIT_* scrubbed, no signing, no hooks; every repo is removed in afterAll.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const R = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-door-remote.mjs'))) as unknown as {
  pushedAuthority: (root: string, a: { parent: string | null; keys: { id: string; ref: string }[] }) => { [key: string]: { row: string; decision: unknown }[] };
};
const A = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-door-authority.mjs'))) as unknown as {
  checkAuthority: (a: { entries: unknown[]; authority: unknown; rulingsAtRevision: { [id: string]: string }; mode: string }) => string[];
};
const DG = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-door-git.mjs'))) as unknown as {
  registerAt: (root: string, rev: string | null) => string | null;
  decisionsAt: (root: string, rev: string | null, stems: string[]) => { [stem: string]: unknown };
};

const REG = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const LOG = 'docs/reports/decisions/2026-10-30-batch-ai.json';
const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json';
const ROW_180 = '| **M-180** | **r** (A0399; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |';
const LOG_TEXT = '{"decisions":[{"id":"CHAT-210.MB17-Q1R","question":"q","recommendation":"r","operator_quote":"y"}]}\n';

const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const SAFE = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const gitQ = (dir: string, args: string[]): string =>
  execFileSync('git', [...SAFE, '-C', dir, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = (tag: string): string => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mb79f-remote-${tag}-`)));
  dirs.push(d);
  return d;
};
const write = (dir: string, rel: string, text: string): void => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const commit = (dir: string, msg: string): string => {
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '-m', msg]);
  return gitQ(dir, ['rev-parse', 'HEAD']);
};
const configure = (dir: string): void => {
  const own = path.join(dir, '.git', 'config');
  gitQ(dir, ['config', '--file', own, 'user.email', 'door@example.invalid']);
  gitQ(dir, ['config', '--file', own, 'user.name', 'door']);
};

/** A bare origin with main holding `register`, and a lane clone of it. Returns the lane dir. */
function laneWith(register: string, log = LOG_TEXT): { lane: string; origin: string } {
  const origin = tmp('origin');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: cleanEnv() });
  const seed = tmp('seed');
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env: cleanEnv() });
  configure(seed);
  write(seed, REG, `${register}\n`);
  write(seed, LOG, log);
  commit(seed, 'register');
  gitQ(seed, ['remote', 'add', 'origin', origin]);
  gitQ(seed, ['push', '-q', 'origin', 'main']);
  const lane = tmp('lane');
  execFileSync('git', ['clone', '-q', origin, lane], { env: cleanEnv() });
  configure(lane);
  return { lane, origin };
}
const prereg = (lane: string): string => {
  write(lane, PREREG, '{"task":"MB-18","increment":"1"}\n');
  return commit(lane, 'prereg');
};
const parentOfPrereg = (lane: string, p: string): string => gitQ(lane, ['rev-parse', `${p}^`]);
const KEY = { id: 'M-180', ref: 'CHAT-210.MB17-Q1R' };
const entry = (over: { [k: string]: unknown } = {}): { [k: string]: unknown } => ({
  path: 'src/tests/bylaw-door.logic.test.ts', case: 'A0399 side yard', old: 'a', new: 'b', ruling: 'M-180', ruling_ref: 'CHAT-210.MB17-Q1R', ...over,
});
/** The full authority (a) + (b) verdict for one entry at the lane's prereg parent, as the door composes it. */
const verdict = (lane: string, parent: string, e: { [k: string]: unknown }, mode = 'push'): string[] => {
  const register = DG.registerAt(lane, parent);
  const decisions = DG.decisionsAt(lane, parent, ['2026-10-30-batch-ai']);
  const pushed = mode === 'ci' ? null : R.pushedAuthority(lane, { parent, keys: [{ id: String(e.ruling), ref: String(e.ruling_ref) }] });
  return A.checkAuthority({ entries: [e], authority: { register, decisions, pushed }, rulingsAtRevision: { 'M-180': 'RATIFIED', 'M-999': 'RULED' }, mode });
};

describe('PR-79f-1 (= R-MC) T3b #1: GREEN, the ruling row is in origin/main', () => {
  it('the register at merge-base(origin/main, prereg parent) shows it', () => {
    const { lane } = laneWith(ROW_180);
    const p = prereg(lane);
    const out = R.pushedAuthority(lane, { parent: parentOfPrereg(lane, p), keys: [KEY] });
    expect(out['M-180#CHAT-210.MB17-Q1R']?.length).toBe(1);
    expect(verdict(lane, parentOfPrereg(lane, p), entry())).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T3b #2 to #6: RED, the ruling is not on origin', () => {
  it('#2 a never-pushed local row M-999 RULED committed before the prereg (the forge)', () => {
    const { lane } = laneWith(ROW_180);
    write(lane, REG, `${ROW_180}\n| **M-999** | forged (\`2026-10-30-batch-ai#CHAT-210.MB17-Q1R\`) | RULED 2026-11-01 |\n`);
    commit(lane, 'local forged row');
    const p = prereg(lane);
    expect(verdict(lane, parentOfPrereg(lane, p), entry({ ruling: 'M-999' }))).toContain('oracle_door_ruling_not_pushed:M-999');
  });
  it('#3 a forge reusing a real ref on a new id: the id is absent at every merge base', () => {
    const { lane } = laneWith(ROW_180);
    write(lane, REG, `${ROW_180}\n| **M-998** | reuse (\`2026-10-30-batch-ai#CHAT-210.MB17-Q1R\`) | RULED 2026-11-01 |\n`);
    commit(lane, 'reuse');
    const p = prereg(lane);
    const out = R.pushedAuthority(lane, { parent: parentOfPrereg(lane, p), keys: [{ id: 'M-998', ref: KEY.ref }] });
    expect(out['M-998#CHAT-210.MB17-Q1R']).toEqual([]);
  });
  it('#4 the ruling reached origin/main only AFTER the lane forked', () => {
    const { lane, origin } = laneWith('| **M-1** | x | RULED 2026-01-01 |');
    const late = tmp('late');
    execFileSync('git', ['clone', '-q', origin, late], { env: cleanEnv() });
    configure(late);
    write(late, REG, `${ROW_180}\n`);
    commit(late, 'ruling lands on main later');
    gitQ(late, ['push', '-q', 'origin', 'main']);
    gitQ(lane, ['fetch', '-q', 'origin']);
    write(lane, REG, `${ROW_180}\n`);
    commit(lane, 'lane copies the row locally');
    const p = prereg(lane);
    expect(R.pushedAuthority(lane, { parent: parentOfPrereg(lane, p), keys: [KEY] })['M-180#CHAT-210.MB17-Q1R']).toEqual([]);
  });
  it('#5 no remote-tracking refs at all: fail closed', () => {
    const dir = tmp('fresh');
    execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: cleanEnv() });
    configure(dir);
    write(dir, REG, `${ROW_180}\n`);
    write(dir, LOG, LOG_TEXT);
    commit(dir, 'local');
    const p = prereg(dir);
    expect(verdict(dir, parentOfPrereg(dir, p), entry())).toContain('oracle_door_ruling_not_pushed:M-180');
  });
  it('#6 a second remote `evil` fetched from a local clone holds the forged row (X-2): it does not count', () => {
    const { lane } = laneWith('| **M-1** | x | RULED 2026-01-01 |');
    const evil = tmp('evil');
    execFileSync('git', ['clone', '-q', lane, evil], { env: cleanEnv() });
    configure(evil);
    write(evil, REG, `${ROW_180}\n`);
    write(evil, LOG, LOG_TEXT);
    commit(evil, 'forged on evil');
    gitQ(lane, ['remote', 'add', 'evil', evil]);
    gitQ(lane, ['fetch', '-q', 'evil']);
    gitQ(lane, ['merge', '-q', '--no-edit', 'evil/main']);
    const p = prereg(lane);
    expect(verdict(lane, parentOfPrereg(lane, p), entry())).toContain('oracle_door_ruling_not_pushed:M-180');
  });
});

describe('PR-79f-1 (= R-MC) T3b #7: a status flipped later (X-4)', () => {
  it('PROPOSED pushed, later RATIFIED with an unchanged #ref count, both pushed: passes', () => {
    const { lane } = laneWith(ROW_180.replace('RATIFIED 2026-10-18', 'PROPOSED'));
    write(lane, REG, `${ROW_180}\n`);
    commit(lane, 'flip');
    gitQ(lane, ['push', '-q', 'origin', 'HEAD:main']);
    gitQ(lane, ['fetch', '-q', 'origin']);
    const p = prereg(lane);
    expect(verdict(lane, parentOfPrereg(lane, p), entry())).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T3b #8: in ci the pushed clause is not evaluated (X-3)', () => {
  it('a forged row on the PR branch itself: no _not_pushed in ci; the other checks still run at the prereg parent', () => {
    const { lane } = laneWith('| **M-1** | x | RULED 2026-01-01 |');
    write(lane, REG, `${ROW_180}\n`);
    commit(lane, 'row on the branch');
    const p = prereg(lane);
    expect(verdict(lane, parentOfPrereg(lane, p), entry(), 'ci')).toEqual([]);
    expect(verdict(lane, parentOfPrereg(lane, p), entry({ case: 'no token here' }), 'ci')).toContain('oracle_door_case_not_in_ruling:M-180:no token here');
  });
});

describe('PR-79f-1 (= R-MC) T3b #9: orphan origin refs (grounder R1-1)', () => {
  it('an orphan origin ref is skipped and another ref still passes; all orphan gives _not_pushed; another failure throws', () => {
    const { lane, origin } = laneWith(ROW_180);
    const orphan = tmp('orphan');
    execFileSync('git', ['init', '-q', '-b', 'orphan', orphan], { env: cleanEnv() });
    configure(orphan);
    write(orphan, REG, `${ROW_180}\n`);
    write(orphan, LOG, LOG_TEXT);
    commit(orphan, 'unrelated history');
    gitQ(orphan, ['push', '-q', origin, 'orphan']);
    gitQ(lane, ['fetch', '-q', 'origin']);
    const p = prereg(lane);
    expect(R.pushedAuthority(lane, { parent: parentOfPrereg(lane, p), keys: [KEY] })['M-180#CHAT-210.MB17-Q1R']?.length).toBe(1);
    gitQ(lane, ['update-ref', '-d', 'refs/remotes/origin/main']);
    gitQ(lane, ['update-ref', '-d', 'refs/remotes/origin/HEAD']);
    expect(R.pushedAuthority(lane, { parent: parentOfPrereg(lane, p), keys: [KEY] })['M-180#CHAT-210.MB17-Q1R']).toEqual([]);
    expect(() => R.pushedAuthority(lane, { parent: 'f'.repeat(40), keys: [KEY] })).toThrow();
  });
});

describe('PR-79f-1 (= R-MC) T3b #10: a token minted locally (adversary R1-1)', () => {
  it('the pushed row is copied with ZZ9999 appended locally before the prereg: passes at the parent, refused at M', () => {
    const { lane } = laneWith(ROW_180);
    write(lane, REG, `${ROW_180.replace('A0399;', 'A0399 ZZ9999;')}\n`);
    commit(lane, 'local token');
    const p = prereg(lane);
    const e = entry({ case: 'ZZ9999 side yard' });
    expect(verdict(lane, parentOfPrereg(lane, p), e, 'ci')).toEqual([]);
    expect(verdict(lane, parentOfPrereg(lane, p), e, 'push')).toContain('oracle_door_case_not_in_ruling:M-180:ZZ9999 side yard');
  });
});
