// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md sections 2.3 (ctx.door, the per-record join) and section 4 T5
// T5 (brief D5a): buildContext collects `ctx.door` from a real throw-away repo (commit mode), and evaluateGate composes it.
// Red first: #11 is written before joinArgsFor is exported (step D5a-0); the door rows before ctx.door exists.
// Fixture rule: repos in os.tmpdir(), GIT_* scrubbed, no signing, no hooks, every repo removed in afterAll; computeRun is injected.
import { afterAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const CTX = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-context.mjs'))) as unknown as ContextModule;
const GATE = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs'))) as unknown as GateModule;

type GateModule = {
  git: (root: string, args: string[]) => string;
  blobIdsAt: (root: string, rev: string, paths: string[]) => { [p: string]: string };
  readAt: (root: string, rev: string, file: string) => string | null;
};
type JoinArgs = { rev: string; isNew: boolean };
type ContextModule = {
  joinArgsFor?: (a: { git: { git: GateModule['git']; blobIdsAt: GateModule['blobIdsAt'] }; root: string; mode: string; record: { path: string; rec: unknown } | null; isNew: boolean; tip: string }) => JoinArgs;
  buildContext: (parsed: { mode: string; root: string; base?: string; tip?: string }, deps?: { computeRun?: () => null }) => Promise<{ [k: string]: unknown }>;
};

const cleanEnv = (): NodeJS.ProcessEnv => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  env.GIT_CONFIG_VALUE_0 = 'false';
  return env;
};
const SAFE = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const gitQ = (dir: string, args: string[]): string =>
  execFileSync('git', [...SAFE, '-C', dir, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
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
function makeRepo(tag: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mb79f-ctx-${tag}-`)));
  dirs.push(dir);
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: cleanEnv() });
  if (fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir'])) !== path.join(dir, '.git')) throw new Error('temp repo escaped');
  const own = path.join(dir, '.git', 'config');
  gitQ(dir, ['config', '--file', own, 'user.email', 'door@example.invalid']);
  gitQ(dir, ['config', '--file', own, 'user.name', 'door']);
  return dir;
}
const READERS = { git: GATE.git, blobIdsAt: GATE.blobIdsAt };

describe('PR-79f-1 (= R-MC) T5 #11 (step D5a-0): joinArgsFor, the (p) merge-head rule as one helper', () => {
  const REC = 'docs/reports/loop-records/1/round-01.json';
  const join = (a: { root: string; mode: string; isNew: boolean; tip?: string }): JoinArgs => {
    if (typeof CTX.joinArgsFor !== 'function') throw new Error('loop-gate-context.mjs must export joinArgsFor');
    return CTX.joinArgsFor({ git: READERS, root: a.root, mode: a.mode, record: { path: REC, rec: {} }, isNew: a.isNew, tip: a.tip ?? 'HEAD' });
  };
  const laneMerge = (editResolution: boolean): { dir: string; mergeHead: string } => {
    const dir = makeRepo('p');
    write(dir, 'a.txt', 'a\n');
    commit(dir, 'base');
    gitQ(dir, ['checkout', '-q', '-b', 'lane']);
    write(dir, REC, '{"round":1}\n');
    const mergeHead = commit(dir, 'lane record\n\nMcBylaws-Task: MB-18');
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, 'b.txt', 'b\n');
    commit(dir, 'main');
    gitQ(dir, ['merge', '-q', '--no-ff', '--no-commit', 'lane']);
    if (editResolution) {
      write(dir, REC, '{"round":1,"edited":true}\n');
      gitQ(dir, ['add', '-A']);
    }
    return { dir, mergeHead };
  };
  it('one merge head and the record\'s index blob is MERGE_HEAD\'s: the join reads the merge head (T-p1 shape)', () => {
    const { dir, mergeHead } = laneMerge(false);
    expect(join({ root: dir, mode: 'commit', isNew: true })).toEqual({ rev: mergeHead, isNew: false });
  });
  it('the resolution edits the record: the commit join is kept (T-p2 shape)', () => {
    const { dir } = laneMerge(true);
    expect(join({ root: dir, mode: 'commit', isNew: true })).toEqual({ rev: 'HEAD', isNew: true });
  });
  it('no MERGE_HEAD (T-p5 shape), and isNew false: unchanged', () => {
    const dir = makeRepo('np');
    write(dir, 'a.txt', 'a\n');
    commit(dir, 'base');
    expect(join({ root: dir, mode: 'commit', isNew: true })).toEqual({ rev: 'HEAD', isNew: true });
    expect(join({ root: dir, mode: 'commit', isNew: false })).toEqual({ rev: 'HEAD', isNew: false });
  });
  it('push and ci read the tip and leave isNew as given', () => {
    const { dir } = laneMerge(false);
    expect(join({ root: dir, mode: 'push', isNew: true, tip: 'abc' })).toEqual({ rev: 'abc', isNew: true });
    expect(join({ root: dir, mode: 'ci', isNew: false, tip: 'def' })).toEqual({ rev: 'def', isNew: false });
  });
});

// ---- the door fixture: a minimal loop tree, a bare origin holding the register, then a prereg committed alone ----------------

const EVAL = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs'))) as unknown as {
  evaluateGate: (ctx: { [k: string]: unknown }) => { violations: string[]; notes: string[] };
};
const LOOPGATE = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs'))) as unknown as {
  main: (argv: string[], deps: { write?: (l: string) => void; buildContext?: (a: { [k: string]: unknown }) => Promise<unknown> }) => Promise<number>;
};
const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const CODE = 'scripts/seeds/bylaw/code.json';
const REG = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const POLICY = 'docs/specs/01-pipeline/69_mcbylaw_policy.md';
const LOG = 'docs/reports/decisions/2026-10-30-batch-ai.json';
const COA = 'scripts/analysis/bylaw-validation/coa-expected';
const pre = (task: string, k: number): string => `${COA}/prereg-${task}-${String(k)}.json`;
const REC1 = 'docs/reports/loop-records/1/round-01.json';
const REC2 = 'docs/reports/loop-records/2/round-01.json';
const ROW_180 = '| **M-180** | **Chapter 900 exceptions** (A0399 is the worked lot; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |';
const ROW_900 = '| **M-900** | **A proposal** (`2026-10-30-batch-ai#CHAT-900.P`) | PROPOSED |';
const LOG_TEXT = `${JSON.stringify({ decisions: [{ id: 'CHAT-210.MB17-Q1R', question: 'q', recommendation: 'r', operator_quote: 'y' }, { id: 'CHAT-900.P', question: 'q' }] })}\n`;
const lines7 = (v: string, w = '2'): string =>
  ["import { describe, expect, it } from 'vitest';", "describe('d', () => {", "  it('i', () => {", `    expect(x).toBe(${v});`, `    expect(y).toBe(${w});`, '  });', '});', ''].join('\n');
const OLD = 'expect(x).toBe(1.2);';
const NEW = 'expect(x).toBe(0.6);';
const E1 = { path: ORACLE, case: 'MB-18 / A0399 houseplex side yard', old: OLD, new: NEW, ruling: 'M-180', ruling_ref: 'CHAT-210.MB17-Q1R' };
const preregJson = (task: string, entries: unknown[], over: { [k: string]: unknown } = {}): string =>
  `${JSON.stringify({ schema: 'coa-round-prereg-v1', task, round: 1, increment: '1', expected_moves: [], expected_value_changes: entries, ...over }, null, 1)}\n`;
const record = (increment = '1', round = 1): string =>
  `${JSON.stringify({ schema: 'loop-record-v1', increment, round, decision: 'revert', reason: 'door fixture', accepted_findings: [], cases: [], inputs: {}, binding: { sha256: '0' } })}\n`;

/** The base tree, pushed to a bare origin so the register row is on refs/remotes/origin/main. */
function doorBase(registerRows: string[] = [ROW_180, ROW_900]): { dir: string; base: string; origin: string } {
  const dir = makeRepo('door');
  write(dir, 'scripts/analysis/mcbylaws-loop/data/increments.json', `${JSON.stringify({ ids: ['1', '2', '3'] })}\n`);
  write(dir, 'mcbylaws/protected-paths.json', `${JSON.stringify({ layer23: ['scripts/seeds/bylaw/**'] })}\n`);
  const ids = ['c-pass'];
  const idsSha = crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex');
  write(dir, 'mcbylaws/loop/data/ids-g-a.json', `${JSON.stringify(ids)}\n`);
  write(dir, 'mcbylaws/loop/regression-set.json', `${JSON.stringify({ groups: [{ id: 'g-a', introduced_in: 'baseline', kind: 'coa', ids_file: 'mcbylaws/loop/data/ids-g-a.json', ids_sha256: idsSha }], pending: [], removals: [] })}\n`);
  write(dir, 'mcbylaws/loop/floors-percent.json', `${JSON.stringify({ overall: { accuracy: 90, answered: 80 }, articles: {}, pooled: null, rulings: [] })}\n`);
  write(dir, 'mcbylaws/loop/floors-count.json', `${JSON.stringify({ schema: 'loop-floors-v1', lines: { 'g-a cases': 1 }, rulings: [] })}\n`);
  write(dir, REG, `| Id | Rule | Status |\n|---|---|---|\n${registerRows.join('\n')}\n`);
  write(dir, POLICY, '# policy\n');
  write(dir, LOG, LOG_TEXT);
  write(dir, ORACLE, lines7('1.2'));
  write(dir, CODE, '{"v":1}\n');
  const base = commit(dir, 'base');
  const origin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb79f-ctx-origin-')));
  dirs.push(origin);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: cleanEnv() });
  gitQ(dir, ['remote', 'add', 'origin', origin]);
  gitQ(dir, ['push', '-q', 'origin', 'main']);
  gitQ(dir, ['fetch', '-q', 'origin']);
  return { dir, base, origin };
}
const commitAlone = (dir: string, rel: string, text: string, msg = 'prereg alone'): string => {
  write(dir, rel, text);
  gitQ(dir, ['add', '--', rel]);
  gitQ(dir, ['commit', '-q', '-m', msg]);
  return gitQ(dir, ['rev-parse', 'HEAD']);
};
/** Stage the round: the oracle edit, a code edit and the record. */
function stageRound(dir: string, oracleText = lines7('0.6'), rec = REC1, recText = record()): void {
  write(dir, ORACLE, oracleText);
  write(dir, CODE, '{"v":2}\n');
  write(dir, rec, recText);
  gitQ(dir, ['add', '-A']);
}
const ctxAt = async (dir: string): Promise<{ [k: string]: unknown }> => CTX.buildContext({ mode: 'commit', root: dir }, { computeRun: () => null });
const verdictAt = async (dir: string): Promise<{ violations: string[]; notes: string[] }> => EVAL.evaluateGate(await ctxAt(dir));
const doorCodes = (v: { violations: string[] }): string[] => v.violations.filter((c) => c.startsWith('oracle_door_'));
const has = (v: { violations: string[] }, code: string): boolean => v.violations.some((c) => c === code || c.startsWith(`${code}:`));

describe('PR-79f-1 (= R-MC) T5 #1 to #3: the item-a shape through buildContext and evaluateGate (commit mode)', () => {
  it('#1 GREEN: one listed move, ruling pushed, prereg alone directly under: no door code, no oracle_moved_with_code, one pass note', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    const ctx = await ctxAt(dir);
    expect(ctx.door).toBeTruthy();
    const v = EVAL.evaluateGate(ctx);
    expect(doorCodes(v)).toEqual([]);
    expect(has(v, 'oracle_moved_with_code')).toBe(false);
    expect(v.notes).toContain('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 1 entries');
  });
  it('#1 twin: no ctx.door when the oracle-first refusal does not fire (code only)', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    write(dir, CODE, '{"v":2}\n');
    write(dir, REC1, record());
    gitQ(dir, ['add', '-A']);
    expect((await ctxAt(dir)).door).toBeUndefined();
  });
  it('#2 RED unlisted move', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir, lines7('0.6', '3'));
    const v = await verdictAt(dir);
    expect(has(v, 'oracle_moved_with_code')).toBe(true);
    expect(v.violations).toContain(`oracle_door_unlisted_move:${ORACLE}:-:expect(y).toBe(2);`);
  });
  it('#3 RED extra listed move', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1, { ...E1, old: 'expect(z).toBe(9);', new: null }]));
    stageRound(dir);
    expect((await verdictAt(dir)).violations).toContain(`oracle_door_extra_listed:${ORACLE}:old:expect(z).toBe(9);`);
  });
});

describe('PR-79f-1 (= R-MC) T5 #4: rulings that are not an authority', () => {
  it('PROPOSED', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [{ ...E1, ruling: 'M-900', ruling_ref: 'CHAT-900.P' }]));
    stageRound(dir);
    expect((await verdictAt(dir)).violations).toContain('oracle_door_ruling_not_authority:M-900');
  });
  it('absent', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [{ ...E1, ruling: 'M-999' }]));
    stageRound(dir);
    expect((await verdictAt(dir)).violations).toContain('oracle_door_ruling_not_authority:M-999');
  });
  it('the ruling row added in the SAME staged commit', async () => {
    const { dir } = doorBase([ROW_900]);
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    write(dir, REG, `| Id | Rule | Status |\n|---|---|---|\n${ROW_900}\n${ROW_180}\n`);
    gitQ(dir, ['add', '-A']);
    expect((await verdictAt(dir)).violations).toContain('oracle_door_ruling_not_authority:M-180');
  });
  it('a LOCAL-ONLY ruling row (the forge, P-1): RULED in a local commit before the prereg, never pushed', async () => {
    const { dir } = doorBase([ROW_900]);
    write(dir, REG, `| Id | Rule | Status |\n|---|---|---|\n${ROW_900}\n${ROW_180}\n`);
    commit(dir, 'local ruling row');
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    const v = await verdictAt(dir);
    expect(v.violations).toContain('oracle_door_ruling_not_pushed:M-180');
    expect(v.violations).not.toContain('oracle_door_ruling_not_authority:M-180');
  });
});

describe('PR-79f-1 (= R-MC) T5 #5, #6: the prereg history', () => {
  it('#5 edited in an earlier commit (added, deleted, added again directly under the round): oracle_door_prereg_edited', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1], { v: 'X' }));
    fs.rmSync(path.join(dir, pre('MB-18', 1)));
    commit(dir, 'delete the prereg');
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1], { v: 'Y' }));
    stageRound(dir);
    expect((await verdictAt(dir)).violations).toContain('oracle_door_prereg_edited');
  });
  it('#5 modified in the staged commit: BOTH oracle_door_prereg_edited AND oracle_door_path_ineligible:M:<prereg>', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    write(dir, pre('MB-18', 1), preregJson('MB-18', [E1], { v: 'staged edit' }));
    gitQ(dir, ['add', '-A']);
    const v = await verdictAt(dir);
    expect(v.violations).toContain('oracle_door_prereg_edited');
    expect(v.violations).toContain(`oracle_door_path_ineligible:M:${pre('MB-18', 1)}`);
  });
  it('#6 the prereg commit carries another file: oracle_door_prereg_not_alone', async () => {
    const { dir } = doorBase();
    write(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    write(dir, 'notes/other.txt', 'x\n');
    commit(dir, 'prereg with company');
    stageRound(dir);
    expect((await verdictAt(dir)).violations).toContain('oracle_door_prereg_not_alone');
  });
});

describe('PR-79f-1 (= R-MC) T5 #7, #10: renames and mode-only changes', () => {
  it('#7 a content-equal rename R100 of the oracle file with a listing for it: both paths ineligible', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    gitQ(dir, ['mv', ORACLE, 'src/tests/bylaw-door2.logic.test.ts']);
    write(dir, CODE, '{"v":2}\n');
    write(dir, REC1, record());
    gitQ(dir, ['add', '-A']);
    const v = await verdictAt(dir);
    expect(v.violations).toContain(`oracle_door_path_ineligible:R:${ORACLE}`);
    expect(v.violations).toContain('oracle_door_path_ineligible:R:src/tests/bylaw-door2.logic.test.ts');
  });
  it('#10 a mode-only change to the oracle file: oracle_door_empty_diff', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    fs.chmodSync(path.join(dir, ORACLE), 0o755);
    write(dir, CODE, '{"v":2}\n');
    write(dir, REC1, record());
    gitQ(dir, ['add', '-A']);
    expect((await verdictAt(dir)).violations).toContain(`oracle_door_empty_diff:${ORACLE}`);
  });
});

describe('PR-79f-1 (= R-MC) T5 #8: the R-MA join, as the gate finds it', () => {
  it('(a) a prereg without increment: BOTH oracle_door_prereg_missing AND prereg_missing', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1], { increment: undefined }));
    stageRound(dir);
    const v = await verdictAt(dir);
    expect(v.violations).toContain('oracle_door_prereg_missing');
    expect(v.violations).toContain('prereg_missing');
  });
  it('(b) an unrelated commit between the prereg and the staged record: plus the gate\'s prereg_task_unknown:commit', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    commitAlone(dir, 'notes/u.txt', 'u\n', 'unrelated');
    stageRound(dir);
    const v = await verdictAt(dir);
    expect(v.violations).toContain('oracle_door_prereg_missing');
    expect(v.violations).toContain('prereg_task_unknown:commit');
    expect(v.violations.filter((c) => c.startsWith('oracle_door_join:'))).toEqual([]);
  });
  it('(c) the name says MB-18, the JSON task another: plus prereg_name_task_mismatch from ctx.preregJoin, not repeated by the door', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-77', [E1]));
    stageRound(dir);
    const v = await verdictAt(dir);
    expect(v.violations).toContain('oracle_door_prereg_missing');
    expect(v.violations).toContain(`prereg_name_task_mismatch:${pre('MB-18', 1)}`);
    expect(v.violations.filter((c) => c.startsWith('oracle_door_join:'))).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T5 #9: a git failure while collecting cannot be read as green', () => {
  it('a missing object: buildContext throws and main exits 2', async () => {
    // The base commit is two commits below the prereg, so the join (which reads HEAD and its parent) still runs and only the
    // door's history walk meets the missing object.
    const { dir, base } = doorBase();
    commitAlone(dir, 'notes/between.txt', 'b\n', 'between');
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    gitQ(dir, ['remote', 'remove', 'origin']);
    const obj = path.join(dir, '.git', 'objects', base.slice(0, 2), base.slice(2));
    expect(fs.existsSync(obj)).toBe(true);
    fs.rmSync(obj);
    await expect(ctxAt(dir)).rejects.toThrow();
    const lines: string[] = [];
    const code = await LOOPGATE.main(['check', '--mode', 'commit', '--root', dir], {
      write: (l) => lines.push(l),
      buildContext: (a) => CTX.buildContext(a as { mode: string; root: string }, { computeRun: () => null }),
    });
    expect(code).toBe(2);
  });
});

describe('PR-79f-1 (= R-MC) T5 #12, #12a, #12b: two staged records (v9.1, F-1)', () => {
  it('#12 B (increment 2) is ctx.latest: findPreregFor gives prereg null and no violations; the door gives oracle_door_prereg_missing alone', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    write(dir, REC2, record('2', 1));
    gitQ(dir, ['add', '-A']);
    const ctx = await ctxAt(dir);
    const door = ctx.door as { unjoined: { recordPath: string; violations: string[] }[]; latestRecordPath: string };
    expect(door.latestRecordPath).toBe(REC2);
    expect(door.unjoined).toEqual([{ recordPath: REC2, violations: [] }]);
    const v = EVAL.evaluateGate(ctx);
    expect(doorCodes(v)).toEqual(['oracle_door_prereg_missing']);
  });
  it('#12a B is NOT ctx.latest: plus oracle_door_join:<B>:no_prereg_for_increment (R-9)', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1], { increment: '2' }));
    stageRound(dir, lines7('0.6'), REC2, record('2', 1));
    write(dir, REC1, record('1', 1));
    gitQ(dir, ['add', '-A']);
    const ctx = await ctxAt(dir);
    expect((ctx.door as { latestRecordPath: string }).latestRecordPath).toBe(REC2);
    const v = EVAL.evaluateGate(ctx);
    expect(doorCodes(v)).toEqual(['oracle_door_prereg_missing', `oracle_door_join:${REC1}:no_prereg_for_increment`]);
  });
  it('#12b (i) shared increment, one commit, one trailer: B joins task A\'s prereg and its lines are judged against A\'s list (MB-79 (k) owns the task mismatch)', async () => {
    const { dir } = doorBase();
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    write(dir, 'docs/reports/loop-records/1/round-02.json', record('1', 2));
    gitQ(dir, ['add', '-A']);
    const ctx = await ctxAt(dir);
    const door = ctx.door as { records: { recordPath: string; preregFile: string; task: string }[]; unjoined: unknown[] };
    expect(door.unjoined).toEqual([]);
    expect(door.records.map((r) => [r.recordPath, r.preregFile, r.task])).toEqual([
      [REC1, pre('MB-18', 1), 'MB-18'],
      ['docs/reports/loop-records/1/round-02.json', pre('MB-18', 1), 'MB-18'],
    ]);
    expect(doorCodes(EVAL.evaluateGate(ctx))).toEqual([]);
    gitQ(dir, ['commit', '-q', '-m', 'round\n\nMcBylaws-Task: MB-18']);
    const pushCtx = await CTX.buildContext({ mode: 'push', root: dir, base: gitQ(dir, ['rev-parse', 'HEAD~1']), tip: 'HEAD' }, { computeRun: () => null });
    const pd = pushCtx.door as { records: { recordPath: string; preregFile: string }[] };
    expect(pd.records.map((r) => r.preregFile)).toEqual([pre('MB-18', 1), pre('MB-18', 1)]);
  });
  it('#12b (ii) B\'s record added by its own later commit with its own trailer, over its own prereg: B joins prereg-MB-77-1 at push', async () => {
    const { dir } = doorBase();
    const start = gitQ(dir, ['rev-parse', 'HEAD']);
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    gitQ(dir, ['commit', '-q', '-m', 'A round\n\nMcBylaws-Task: MB-18']);
    commitAlone(dir, pre('MB-77', 1), preregJson('MB-77', []));
    write(dir, 'docs/reports/loop-records/1/round-02.json', record('1', 2));
    write(dir, CODE, '{"v":3}\n');
    gitQ(dir, ['add', '-A']);
    gitQ(dir, ['commit', '-q', '-m', 'B round\n\nMcBylaws-Task: MB-77']);
    const pushCtx = await CTX.buildContext({ mode: 'push', root: dir, base: start, tip: 'HEAD' }, { computeRun: () => null });
    const pd = pushCtx.door as { records: { recordPath: string; preregFile: string; task: string }[] };
    expect(pd.records.map((r) => [r.recordPath, r.task, r.preregFile])).toEqual([
      [REC1, 'MB-18', pre('MB-18', 1)],
      ['docs/reports/loop-records/1/round-02.json', 'MB-77', pre('MB-77', 1)],
    ]);
  });
});

describe('PR-79f-1 (= R-MC) T5 #13: a commit-mode merge that carries two records whose index blobs equal MERGE_HEAD\'s', () => {
  it('each record joins by its trailer at the merge head (rev = merge head, isNew false); no oracle_door_* join code', async () => {
    const { dir } = doorBase();
    gitQ(dir, ['checkout', '-q', '-b', 'lane']);
    commitAlone(dir, pre('MB-18', 1), preregJson('MB-18', [E1]));
    stageRound(dir);
    gitQ(dir, ['commit', '-q', '-m', 'lane round 1\n\nMcBylaws-Task: MB-18']);
    write(dir, 'docs/reports/loop-records/1/round-02.json', record('1', 2));
    gitQ(dir, ['add', '-A']);
    gitQ(dir, ['commit', '-q', '-m', 'lane round 2\n\nMcBylaws-Task: MB-18']);
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, 'notes/main.txt', 'm\n');
    commit(dir, 'main work');
    gitQ(dir, ['merge', '-q', '--no-ff', '--no-commit', 'lane']);
    const ctx = await ctxAt(dir);
    const door = ctx.door as { records: { recordPath: string; source: string; preregFile: string }[]; unjoined: unknown[] };
    expect(door.unjoined).toEqual([]);
    expect(door.records.map((r) => [r.recordPath, r.source, r.preregFile])).toEqual([
      [REC1, 'trailer', pre('MB-18', 1)],
      ['docs/reports/loop-records/1/round-02.json', 'trailer', pre('MB-18', 1)],
    ]);
    expect(EVAL.evaluateGate(ctx).violations.filter((c) => c.startsWith('oracle_door_join') || c === 'oracle_door_prereg_missing')).toEqual([]);
  });
});
