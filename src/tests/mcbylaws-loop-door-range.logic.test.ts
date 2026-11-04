// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.3 (P-14 batched push, the range readers) and section 4 T6
// T6 (brief D5b): the door over a push or ci RANGE of a real throw-away repo. Red first: written before buildContext collects ctx.door.
// Fixture rule (R-MA, 124a:1040): every commit that adds a record carries `McBylaws-Task: <task>`, and its prereg is in that commit's
// parent tree; every fixture passes the tip explicitly (`tip`, as the hook does since MB-79 (o)). Records are written by hand (the
// door reads only their increment), so the assertions are on the door's codes and on oracle_moved_with_code, never on the
// record or run stages (computeRun is injected as null). GIT_* scrubbed, no signing, no hooks, every repo removed in afterAll.
import { afterAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const CTX = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-context.mjs'))) as unknown as {
  buildContext: (p: { mode: string; root: string; base: string; tip: string }, d: { computeRun: () => null }) => Promise<{ [k: string]: unknown }>;
  findPreregFor: (a: { git: unknown; root: string; mode: string; record: { path: string; rec: unknown }; isNew: boolean; rev?: string }) => { preregFile: string | null; violations: string[] };
};
const EVAL = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs'))) as unknown as {
  evaluateGate: (ctx: { [k: string]: unknown }) => { violations: string[]; notes: string[] };
};
const GATE = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs'))) as unknown as { git: unknown; readAt: unknown };

const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const ORACLE_B = 'src/tests/bylaw-door-b.logic.test.ts';
const CODE = 'scripts/seeds/bylaw/code.json';
const REG = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const LOG = 'docs/reports/decisions/2026-10-30-batch-ai.json';
const COA = 'scripts/analysis/bylaw-validation/coa-expected';
const pre = (task: string, k: number): string => `${COA}/prereg-${task}-${String(k)}.json`;
const rec = (round: number): string => `docs/reports/loop-records/1/round-${String(round).padStart(2, '0')}.json`;
const ROW_180 = '| **M-180** | **Chapter 900 exceptions** (A0399 is the worked lot; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |';
const LOG_TEXT = `${JSON.stringify({ decisions: [{ id: 'CHAT-210.MB17-Q1R', question: 'q', recommendation: 'r', operator_quote: 'y' }] })}\n`;

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
const tmp = (tag: string): string => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mb79f-range-${tag}-`)));
  dirs.push(d);
  return d;
};
const write = (dir: string, rel: string, text: string): void => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const head = (dir: string): string => gitQ(dir, ['rev-parse', 'HEAD']);
/** Commit everything staged plus `files`, with the trailer when a task is given. */
const land = (dir: string, files: { [rel: string]: string | null }, msg: string, task?: string): string => {
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) fs.rmSync(path.join(dir, rel));
    else write(dir, rel, text);
  }
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '-m', task ? `${msg}\n\nMcBylaws-Task: ${task}` : msg]);
  return head(dir);
};
const lines7 = (v: string, w = '2'): string =>
  ["import { describe, expect, it } from 'vitest';", "describe('d', () => {", "  it('i', () => {", `    expect(x).toBe(${v});`, `    expect(y).toBe(${w});`, '  });', '});', ''].join('\n');
const entry = (over: { [k: string]: unknown } = {}): { [k: string]: unknown } => ({
  path: ORACLE, case: 'MB-18 / A0399 side yard', old: 'expect(x).toBe(1.2);', new: 'expect(x).toBe(0.6);', ruling: 'M-180', ruling_ref: 'CHAT-210.MB17-Q1R', ...over,
});
const entryB = (): { [k: string]: unknown } => entry({ path: ORACLE_B, old: 'expect(x).toBe(5);', new: 'expect(x).toBe(6);', case: 'MB-77 / A0399 b' });
const prereg = (task: string, entries: unknown[], over: { [k: string]: unknown } = {}): string =>
  `${JSON.stringify({ schema: 'coa-round-prereg-v1', task, round: 1, increment: '1', expected_moves: [], expected_value_changes: entries, ...over }, null, 1)}\n`;
const record = (round: number): string =>
  `${JSON.stringify({ schema: 'loop-record-v1', increment: '1', round, decision: 'revert', reason: 'door range fixture', accepted_findings: [], cases: [], inputs: {}, binding: { sha256: '0' } })}\n`;

/** The base tree, pushed to a bare origin (the ruling row is on refs/remotes/origin/main). Returns the base sha. */
function rangeBase(): { dir: string; base: string; origin: string } {
  const dir = tmp('lane');
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: cleanEnv() });
  if (fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir'])) !== path.join(dir, '.git')) throw new Error('temp repo escaped');
  const own = path.join(dir, '.git', 'config');
  gitQ(dir, ['config', '--file', own, 'user.email', 'door@example.invalid']);
  gitQ(dir, ['config', '--file', own, 'user.name', 'door']);
  const ids = ['c-pass'];
  write(dir, 'scripts/analysis/mcbylaws-loop/data/increments.json', `${JSON.stringify({ ids: ['1', '2', '3'] })}\n`);
  write(dir, 'mcbylaws/protected-paths.json', `${JSON.stringify({ layer23: ['scripts/seeds/bylaw/**'] })}\n`);
  write(dir, 'mcbylaws/loop/data/ids-g-a.json', `${JSON.stringify(ids)}\n`);
  write(dir, 'mcbylaws/loop/regression-set.json', `${JSON.stringify({ groups: [{ id: 'g-a', introduced_in: 'baseline', kind: 'coa', ids_file: 'mcbylaws/loop/data/ids-g-a.json', ids_sha256: crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex') }], pending: [], removals: [] })}\n`);
  write(dir, 'mcbylaws/loop/floors-percent.json', `${JSON.stringify({ overall: { accuracy: 90, answered: 80 }, articles: {}, pooled: null, rulings: [] })}\n`);
  write(dir, 'mcbylaws/loop/floors-count.json', `${JSON.stringify({ schema: 'loop-floors-v1', lines: { 'g-a cases': 1 }, rulings: [] })}\n`);
  write(dir, REG, `| Id | Rule | Status |\n|---|---|---|\n${ROW_180}\n`);
  write(dir, 'docs/specs/01-pipeline/69_mcbylaw_policy.md', '# policy\n');
  write(dir, LOG, LOG_TEXT);
  write(dir, ORACLE, lines7('1.2'));
  write(dir, ORACLE_B, lines7('5'));
  write(dir, CODE, '{"v":1}\n');
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '-m', 'base']);
  const base = head(dir);
  const origin = tmp('origin');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: cleanEnv() });
  gitQ(dir, ['remote', 'add', 'origin', origin]);
  gitQ(dir, ['push', '-q', 'origin', 'main']);
  gitQ(dir, ['fetch', '-q', 'origin']);
  return { dir, base, origin };
}
const ctxAt = (dir: string, base: string, tip = 'HEAD', mode = 'push'): Promise<{ [k: string]: unknown }> =>
  CTX.buildContext({ mode, root: dir, base, tip }, { computeRun: () => null });
const verdictAt = async (dir: string, base: string, tip = 'HEAD', mode = 'push'): Promise<{ violations: string[]; notes: string[] }> =>
  EVAL.evaluateGate(await ctxAt(dir, base, tip, mode));
const doorCodes = (v: { violations: string[] }): string[] => v.violations.filter((c) => c.startsWith('oracle_door_'));
const has = (v: { violations: string[] }, code: string): boolean => v.violations.some((c) => c === code || c.startsWith(`${code}:`));
const green = (v: { violations: string[]; notes: string[] }): void => {
  expect(doorCodes(v)).toEqual([]);
  expect(has(v, 'oracle_moved_with_code')).toBe(false);
  expect(v.notes.some((n) => n.startsWith('oracle_door_passed:'))).toBe(true);
};
/** The door item of task MB-18: its prereg alone, then the work commit (code + oracle + record) with the trailer. */
const doorItem = (dir: string, round = 1, oracle = lines7('0.6')): string => {
  land(dir, { [pre('MB-18', round)]: prereg('MB-18', [entry()]) }, 'prereg alone');
  return land(dir, { [CODE]: `{"v":${String(round + 1)}}\n`, [ORACLE]: oracle, [rec(round)]: record(round) }, 'work', 'MB-18');
};

describe('PR-79f-1 (= R-MC) T6 #1 to #5: one item in a push', () => {
  it('#1 GREEN: the prereg commit, then one work commit (code + oracle + record); push and ci', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    green(await verdictAt(dir, base));
    const ci = await verdictAt(dir, base, 'HEAD', 'ci');
    green(ci);
    expect(ci.notes).toContain('oracle_door_pushed_clause_not_evaluated:ci');
  });
  it('#2 RED the oracle edit committed BEFORE the prereg commit: oracle_door_prereg_not_before', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [ORACLE]: lines7('0.6') }, 'early oracle edit');
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    land(dir, { [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 'work', 'MB-18');
    expect(await verdictAt(dir, base)).toEqual(expect.objectContaining({ violations: expect.arrayContaining(['oracle_door_prereg_not_before']) }));
  });
  it('#3 RED split: oracle edit in commit 1, code in commit 2, no prereg', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [ORACLE]: lines7('0.6') }, 'oracle');
    land(dir, { [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 'code', 'MB-18');
    const v = await verdictAt(dir, base);
    expect(has(v, 'oracle_moved_with_code')).toBe(true);
    expect(v.violations).toContain('oracle_door_prereg_missing');
  });
  it('#4 RED an oracle file added in commit 1 and edited in commit 2 (net A)', async () => {
    const { dir, base } = rangeBase();
    const added = 'src/tests/bylaw-door-new.logic.test.ts';
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry({ path: added })]) }, 'prereg alone');
    land(dir, { [added]: lines7('1.2') }, 'add oracle');
    land(dir, { [added]: lines7('0.6'), [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 'work', 'MB-18');
    expect((await verdictAt(dir, base)).violations).toContain(`oracle_door_path_ineligible:A:${added}`);
  });
  it('#5 RED the prereg edited in commit 3', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()], { edited: true }) }, 'edit prereg');
    expect((await verdictAt(dir, base)).violations).toContain('oracle_door_prereg_edited');
  });
});

describe('PR-79f-1 (= R-MC) T6 #6, #7, #18: merge topologies at range level', () => {
  it('#6 (a) GREEN a clean merge of a branch that predates the prereg', async () => {
    const { dir, base } = rangeBase();
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    land(dir, { 'notes/side.txt': 's\n' }, 'side');
    gitQ(dir, ['checkout', '-q', 'main']);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    gitQ(dir, ['merge', '-q', '--no-ff', 'side', '-m', 'merge side']);
    land(dir, { [CODE]: '{"v":2}\n', [ORACLE]: lines7('0.6'), [rec(1)]: record(1) }, 'work', 'MB-18');
    green(await verdictAt(dir, base));
  });
  it('#6 (b) GREEN the prereg arriving by merge', async () => {
    const { dir, base } = rangeBase();
    gitQ(dir, ['checkout', '-q', '-b', 'lane']);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    gitQ(dir, ['checkout', '-q', 'main']);
    land(dir, { 'notes/m.txt': 'm\n' }, 'main other');
    gitQ(dir, ['merge', '-q', '--no-ff', 'lane', '-m', 'merge lane']);
    land(dir, { [CODE]: '{"v":2}\n', [ORACLE]: lines7('0.6'), [rec(1)]: record(1) }, 'work', 'MB-18');
    green(await verdictAt(dir, base));
  });
  it('#6 (d) RED a plain edit of the prereg', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()], { v: 'X' }) }, 'prereg alone');
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()], { v: 'Y' }) }, 'edit');
    land(dir, { [CODE]: '{"v":2}\n', [ORACLE]: lines7('0.6'), [rec(1)]: record(1) }, 'work', 'MB-18');
    expect((await verdictAt(dir, base)).violations).toContain('oracle_door_prereg_edited');
  });
  it('#6 (c) / #18 RED the prereg edited on a side branch and put back (X, Y, X), merged before the record commit', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()], { v: 'Y' }) }, 'Y');
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'back to X');
    gitQ(dir, ['checkout', '-q', 'main']);
    land(dir, { 'notes/b.txt': 'b\n' }, 'main other');
    gitQ(dir, ['merge', '-q', '--no-ff', 'side', '-m', 'merge side']);
    land(dir, { [CODE]: '{"v":2}\n', [ORACLE]: lines7('0.6'), [rec(1)]: record(1) }, 'work', 'MB-18');
    // The door's assertion only (V8-5): the gate's own simplified prereg walk is the MB-68 follow-up, not pinned here.
    expect((await verdictAt(dir, base)).violations).toContain('oracle_door_prereg_edited');
  });
  it('#7 RED a predating fork merged after the prereg: its oracle edit W is not a descendant of the prereg commit', async () => {
    const { dir, base } = rangeBase();
    gitQ(dir, ['checkout', '-q', '-b', 'fork']);
    land(dir, { [ORACLE]: lines7('0.6') }, 'W: oracle edit on a fork');
    gitQ(dir, ['checkout', '-q', 'main']);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    gitQ(dir, ['merge', '-q', '--no-ff', 'fork', '-m', 'merge fork']);
    land(dir, { [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 'work', 'MB-18');
    expect((await verdictAt(dir, base)).violations).toContain('oracle_door_prereg_not_before');
  });
});

describe('PR-79f-1 (= R-MC) T6 #8, #9, #13 to #16: several records in one push (P-14)', () => {
  it('#8 GREEN two door items of two tasks, each prereg covering its own path: one pass note per ruling group', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [pre('MB-77', 1)]: prereg('MB-77', [entryB()]) }, 'prereg B alone');
    land(dir, { [CODE]: '{"v":9}\n', [ORACLE_B]: lines7('6'), [rec(2)]: record(2) }, 'work B', 'MB-77');
    const v = await verdictAt(dir, base);
    green(v);
    expect(v.notes).toContain('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 2 entries');
  });
  it('#9 RED the second item\'s change predates its own prereg', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [ORACLE_B]: lines7('6') }, 'B edit too early');
    land(dir, { [pre('MB-77', 1)]: prereg('MB-77', [entryB()]) }, 'prereg B alone');
    land(dir, { [CODE]: '{"v":9}\n', [rec(2)]: record(2) }, 'work B', 'MB-77');
    expect((await verdictAt(dir, base)).violations).toContain('oracle_door_prereg_not_before');
  });
  it('#13 RED two records of one task, the EARLIER record commit has no trailer', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    land(dir, { [CODE]: '{"v":2}\n', [ORACLE]: lines7('0.6'), [rec(1)]: record(1) }, 'work without a trailer');
    land(dir, { [CODE]: '{"v":3}\n', [rec(2)]: record(2) }, 'work 2', 'MB-18');
    const ctx = await ctxAt(dir, base);
    const v = EVAL.evaluateGate(ctx);
    expect(has(v, 'oracle_moved_with_code')).toBe(true);
    expect(v.violations).toContain('oracle_door_prereg_missing');
    expect(v.violations).toContain(`oracle_door_join:${rec(1)}:prereg_task_unknown:no-trailer`);
    expect((ctx.preregJoin as { violations: string[] }).violations).toEqual([]);
  });
  it('#14 GREEN two tasks in one push, and a later prereg-only commit at the tip takes over neither; under MB-79 (m) it binds nothing', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [pre('MB-77', 1)]: prereg('MB-77', [entryB()]) }, 'prereg B alone');
    land(dir, { [CODE]: '{"v":9}\n', [ORACLE_B]: lines7('6'), [rec(2)]: record(2) }, 'work B', 'MB-77');
    land(dir, { [pre('MB-18', 2)]: prereg('MB-18', [entry({ old: 'x', new: 'y' })]) }, 'a later prereg alone');
    const ctx = await ctxAt(dir, base);
    const door = ctx.door as { records: { recordPath: string; preregFile: string }[] };
    expect(door.records.map((r) => r.preregFile)).toEqual([pre('MB-18', 1), pre('MB-77', 1)]);
    const v = EVAL.evaluateGate(ctx);
    green(v);
    // The hand-written records bind no inputs, so their own code and oracle paths are input_not_bound; the prereg committed alone
    // at the tip is not among them (MB-79 (m), preregCommittedAlone).
    expect(v.violations.filter((c) => c.startsWith('input_not_bound:') && c.includes('prereg-'))).toEqual([]);
    expect(v.violations).toContain(`input_not_bound:${ORACLE}`);
  });
  it('#15 GREEN two records both joined to the same prereg (no prereg between them): entries counted once', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [CODE]: '{"v":5}\n', [rec(2)]: record(2) }, 'work 2', 'MB-18');
    const v = await verdictAt(dir, base);
    green(v);
    expect(v.notes).toContain('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 1 entries');
  });
  it('#16 GREEN one door item plus one non-door R-LZ round (another task, a prereg with no list)', async () => {
    const { dir, base } = rangeBase();
    doorItem(dir);
    land(dir, { [pre('MB-78', 1)]: prereg('MB-78', []) }, 'R-LZ prereg alone');
    land(dir, { [CODE]: '{"v":7}\n', [rec(2)]: record(2) }, 'revert round', 'MB-78');
    green(await verdictAt(dir, base));
  });
});

describe('PR-79f-1 (= R-MC) T6 #10, #11: delete and re-add, a merge resolution', () => {
  it('#10 RED delete in commit 1 and re-add in commit 2 (net M, a per-commit D)', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    land(dir, { [ORACLE]: null }, 'delete');
    land(dir, { [ORACLE]: lines7('0.6'), [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 're-add', 'MB-18');
    expect((await verdictAt(dir, base)).violations).toContain(`oracle_door_path_ineligible:D:${ORACLE}`);
  });
  it('#11 RED a merge whose resolution edits the oracle (the O68-22 appended list)', async () => {
    const { dir, base } = rangeBase();
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    land(dir, { [ORACLE]: lines7('1.2', '8') }, 'side edits y');
    gitQ(dir, ['checkout', '-q', 'main']);
    land(dir, { [ORACLE]: lines7('1.2', '9') }, 'main edits y');
    try {
      gitQ(dir, ['merge', '-q', 'side', '-m', 'merge']);
    } catch {
      // the expected conflict
    }
    write(dir, ORACLE, lines7('0.6', '10'));
    gitQ(dir, ['add', '-A']);
    gitQ(dir, ['commit', '-q', '--no-edit']);
    land(dir, { [CODE]: '{"v":2}\n', [rec(1)]: record(1) }, 'work', 'MB-18');
    const v = await verdictAt(dir, base);
    expect(has(v, 'oracle_moved_with_code')).toBe(true);
    expect(doorCodes(v).length).toBeGreaterThan(0);
  });
});

describe('PR-79f-1 (= R-MC) T6 #12: a sibling lane\'s door edit merged into this lane (X-8)', () => {
  const sibling = (withPrereg: boolean): { dir: string; base: string } => {
    const { dir, base, origin } = rangeBase();
    const sib = tmp('sibling');
    execFileSync('git', ['clone', '-q', origin, sib], { env: cleanEnv() });
    const own = path.join(sib, '.git', 'config');
    gitQ(sib, ['config', '--file', own, 'user.email', 'sib@example.invalid']);
    gitQ(sib, ['config', '--file', own, 'user.name', 'sib']);
    if (withPrereg) land(sib, { [pre('MB-77', 1)]: prereg('MB-77', [entryB()]) }, 'sibling prereg alone');
    land(sib, { [CODE]: '{"v":50}\n', [ORACLE_B]: lines7('6'), [rec(1)]: record(1) }, 'sibling work', 'MB-77');
    gitQ(sib, ['push', '-q', 'origin', 'main']);
    gitQ(dir, ['fetch', '-q', 'origin']);
    gitQ(dir, ['merge', '-q', '--no-ff', 'origin/main', '-m', 'merge the sibling lane']);
    land(dir, { [pre('MB-18', 1)]: prereg('MB-18', [entry()]) }, 'prereg alone');
    land(dir, { [CODE]: '{"v":51}\n', [ORACLE]: lines7('0.6'), [rec(2)]: record(2) }, 'work', 'MB-18');
    return { dir, base };
  };
  it('GREEN with the sibling\'s prereg, record trailer and edit landed before this lane\'s prereg', async () => {
    const { dir, base } = sibling(true);
    green(await verdictAt(dir, base));
  });
  it('RED with the sibling\'s prereg absent', async () => {
    const { dir, base } = sibling(false);
    const v = await verdictAt(dir, base);
    expect(v.violations).toContain('oracle_door_prereg_missing');
  });
});

describe('PR-79f-1 (= R-MC) T6 #17, #17b: the pushed tip, not HEAD (MB-79 (o))', () => {
  it('#17 HEAD is one commit past the pushed tip and that commit edits a listed line again: the pushed range is green, HEAD\'s is not', async () => {
    const { dir, base } = rangeBase();
    const tip = doorItem(dir);
    land(dir, { [ORACLE]: lines7('0.5') }, 'later edit, not pushed');
    const pushed = await verdictAt(dir, base, tip);
    green(pushed);
    expect(pushed.notes.some((n) => n.startsWith(`oracle_door_entry:${ORACLE}: expect(x).toBe(1.2); -> expect(x).toBe(0.6);`))).toBe(true);
    expect(has(await verdictAt(dir, base, 'HEAD'), 'oracle_door_unlisted_move')).toBe(true);
  });
  it('#17b the pushed sha is on side branch b; HEAD is on branch a, which lacks the record: rev = tip joins it, the HEAD default cannot', async () => {
    const { dir, base } = rangeBase();
    gitQ(dir, ['checkout', '-q', '-b', 'b']);
    const tip = doorItem(dir);
    gitQ(dir, ['checkout', '-q', 'main']);
    gitQ(dir, ['checkout', '-q', '-b', 'a']);
    land(dir, { 'notes/a.txt': 'a\n' }, 'branch a');
    const ctx = await ctxAt(dir, base, tip);
    green(EVAL.evaluateGate(ctx));
    const record1 = (ctx.newRecords as { path: string; rec: unknown }[]).find((r) => r.path === rec(1)) as { path: string; rec: unknown };
    const readers = { git: GATE.git, readAt: GATE.readAt };
    const withTip = CTX.findPreregFor({ git: readers, root: dir, mode: 'push', record: record1, isNew: true, rev: tip });
    const mutant = CTX.findPreregFor({ git: readers, root: dir, mode: 'push', record: record1, isNew: true });
    expect(withTip.preregFile).toBe(pre('MB-18', 1));
    expect(mutant.violations).toEqual(['prereg_task_unknown:no-add-commit']);
    expect(mutant.preregFile).toBeNull();
  });
});
