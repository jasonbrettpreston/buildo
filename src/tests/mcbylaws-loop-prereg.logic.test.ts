// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-321 (each round pre-registers, committed alone and before the round, the rows it expects to move and the expected totals; an unexpected move is a finding)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 7 and the "Prereg path" section (the prereg lives at coa-expected/prereg-<MB-id>-<round>.json, MB-67 P67-1; coa-round.mjs is imported unchanged)
// Red first: docs/reports/red-evidence/mb68/b5-prereg-red.txt. The shape and moves checks are pure and reuse coa-round.mjs; the history check is exercised on four throw-away repositories.
import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-prereg.mjs'));

type GateRow = { group: string; id: string; status: string; clause: string };
type ScorerRow = { notice: string; n: string | number; class: string; clause_norm: string; clause: string };
type Pre = {
  schema: string;
  task: string;
  round: number;
  plan_ref: string;
  $comment: string;
  expected_moves: { clause: string; from: string; to: string; notice?: string }[];
  expected_totals: Record<string, number>;
  increment: string;
  group?: string;
};
type PreregCommit = { sha: string; files: string[] };
type HistoryInput = { preregCommits: PreregCommit[]; roundCommit: { sha: string } | null; isStrictAncestor: (a: string, b: string) => boolean; preregFile: string };
type History = { preregCommits: PreregCommit[]; roundCommit: { sha: string } | null; isStrictAncestor: (a: string, b: string) => boolean; preregFile: string };

const PREREG_68 = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json';
const realPrereg = (): Pre => JSON.parse(fs.readFileSync(path.join(ROOT, PREREG_68), 'utf8')) as Pre;
const row = (id: string, status: string, clause: string, group = 'coa172'): GateRow => ({ group, id, status, clause });
const pre = (over: Partial<Pre> = {}): Pre => ({ ...realPrereg(), ...over });
// A complete registration for the fixtures: it names its increment (O68-05, required; the body is the committed MB-68 registration's
// $comment, plan_ref and expected_totals). A fixture mutation overrides what it is about, and nothing else.
const REGISTERED = (over: Partial<Pre> = {}): Pre => ({ ...realPrereg(), increment: '1', ...over });

describe('preregPath: the one home (plan "Prereg path", MB-67 P67-1)', () => {
  it('names coa-expected/prereg-<MB-id>-<round>.json', () => {
    expect(M.preregPath('MB-68', 1)).toBe('scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json');
  });
  it('the path it builds is the committed MB-68 registration', () => {
    expect(fs.existsSync(path.join(ROOT, M.preregPath('MB-68', 1)))).toBe(true);
  });
});

describe('checkPreregFile: a prereg is the coa-round form and names its task', () => {
  it('the committed MB-68 prereg has no violation', () => {
    expect(M.checkPreregFile(REGISTERED())).toEqual([]);
  });
  it('a registration that leaves its increment out is refused (O68-05)', () => {
    // the loop gates on the prereg of its OWN increment, so an unstated one is not a registration; the raw fixture is the red twin
    expect(M.checkPreregFile(realPrereg())).toEqual(['prereg_shape:increment must be a string']);
    const without = { ...REGISTERED() } as Record<string, unknown>;
    delete without.increment;
    expect(M.checkPreregFile(without as unknown as Pre)).toEqual(['prereg_shape:increment must be a string']);
  });
  it('each shape message of coa-round.mjs is one prereg_shape code', () => {
    const v = M.checkPreregFile(REGISTERED({ schema: 'x', round: -1 }));
    expect(v).toContain('prereg_shape:schema must be coa-round-prereg-v1');
    expect(v).toContain('prereg_shape:round must be an integer >= 0');
  });
  it('a missing plan_ref is refused by its own shape message', () => {
    expect(M.checkPreregFile(REGISTERED({ plan_ref: '' }))).toContain('prereg_shape:plan_ref must be a non-empty string');
  });
  it('a task that is not MB-<digits> is refused; a well-formed task is not', () => {
    expect(M.checkPreregFile(REGISTERED({ task: 'MB68' }))).toEqual(['prereg_task_missing']);
    expect(M.checkPreregFile(REGISTERED({ task: '' }))).toEqual(['prereg_task_missing']);
    expect(M.checkPreregFile(REGISTERED({ task: 'MB-67' }))).toEqual([]);
  });
  it('O68-05: increment is required and must be a string; an absent or numeric one is a shape violation', () => {
    expect(M.checkPreregFile(REGISTERED({ increment: 2 as unknown as string }))).toContain('prereg_shape:increment must be a string');
    const without = { ...REGISTERED() } as Record<string, unknown>;
    delete without.increment;
    expect(M.checkPreregFile(without as unknown as Pre)).toContain('prereg_shape:increment must be a string');
    expect(M.checkPreregFile(REGISTERED({ increment: '2' }))).toEqual([]);
  });
  it('O68-04: group is optional and must be a string when named', () => {
    expect(M.checkPreregFile(REGISTERED({ group: 'coa172' } as unknown as Partial<Pre>))).toEqual([]);
    expect(M.checkPreregFile(REGISTERED({ group: 4 as unknown as string } as unknown as Partial<Pre>))).toContain('prereg_shape:group must be a string');
  });
});

describe('toScorerRows: gate-form rows become scorer rows', () => {
  it('strips the group prefix of a group-qualified id, so a prereg names the plain notice (real-data finding)', () => {
    const rows = M.toScorerRows([{ group: 'coa172', id: 'coa172|A0062/25SC|1', status: 'MATCH', clause: 'c' }]);
    expect(rows[0]?.notice).toBe('A0062/25SC');
    expect(rows[0]?.n).toBe(1);
  });
  it('splits the id at the last |, keeps the clause as both clause and clause_norm', () => {
    expect(M.toScorerRows([row('A0144/17SC|3', 'MATCH', '10.20.40.10(1)')])).toEqual([
      { notice: 'A0144/17SC', n: 3, class: 'MATCH', clause_norm: '10.20.40.10(1)', clause: '10.20.40.10(1)' },
    ]);
  });
  it('a numeric item is a number; a non-numeric one stays a string; a notice holding | keeps it', () => {
    expect(M.toScorerRows([row('A1/26X|01', 'DIFFER', 'a')])[0]?.n).toBe(1);
    expect(M.toScorerRows([row('A1/26X|4b', 'DIFFER', 'a')])[0]?.n).toBe('4b');
    const r = M.toScorerRows([row('A|B|2', 'MATCH', 'c')])[0] as ScorerRow;
    expect([r.notice, r.n]).toEqual(['A|B', 2]);
  });
});

describe('checkPreregMoves: expected against actual, a surprise is a finding (M-321)', () => {
  // the registration is the committed MB-68 file; these fixtures register the totals their rows hold, and nothing else moves
  const base: GateRow[] = [row('A1/26X|1', 'MATCH', '10.20.40.10(1)'), row('A2/26X|1', 'DIFFER', '10.20.40.70(3)'), row('A3/26X|1', 'NO ANSWER', '10.20.40.40(2)')];
  const TOTALS = { MATCH: 1, DIFFER: 1, 'NO ANSWER': 1 };
  const moved = (): GateRow[] => base.map((r) => (r.id === 'A2/26X|1' ? { ...r, status: 'MATCH' } : { ...r }));
  const TOTAL_AFTER = { MATCH: 2, DIFFER: 0, 'NO ANSWER': 1 }; // the totals the registered move produces
  it('no move and the registered totals: green', () => {
    expect(M.checkPreregMoves(pre({ expected_totals: TOTALS }), base, base.map((r) => ({ ...r })))).toEqual([]);
  });
  it('an unregistered DIFFER->MATCH is named by notice, item and move', () => {
    expect(M.checkPreregMoves(pre({ expected_totals: TOTAL_AFTER }), base, moved())).toEqual(['unexpected_move:A2/26X#1 DIFFER->MATCH']);
  });
  it('a registered move that happens is green; the totals are moved with it', () => {
    const p = pre({ expected_moves: [{ clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }], expected_totals: TOTAL_AFTER });
    expect(M.checkPreregMoves(p, base, moved())).toEqual([]);
  });
  it('a registered move that does not happen is missing, by clause', () => {
    // the registration itself holds here (no move, the totals as registered); only the move is missing
    const p = pre({ expected_moves: [{ clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }], expected_totals: TOTALS });
    expect(M.checkPreregMoves(p, base, base.map((r) => ({ ...r })))).toEqual(['missing_move:10.20.40.70(3)']);
  });
  it('a totals line reading 401 against 400 is a finding, printed in full', () => {
    const p = pre({ expected_moves: [{ clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }], expected_totals: { MATCH: 401, DIFFER: 0, 'NO ANSWER': 1 } });
    expect(M.checkPreregMoves(p, base, moved())).toEqual(['totals_diff:MATCH expected 401 got 2']);
    const four = [...Array.from({ length: 400 }, (_, i) => row(`A${i}/26X|1`, 'MATCH', '10.20.40.10(1)')), ...Array.from({ length: 31 }, (_, i) => row(`D${i}/26X|1`, 'DIFFER', '10.20.40.70(3)'))];
    const five = four.map((r) => (r.id === 'D0/26X|1' ? { ...r, status: 'MATCH' } : { ...r }));
    const q = pre({ expected_moves: [{ clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }], expected_totals: { MATCH: 399, DIFFER: 31 } });
    // checkPrereg prints the classes sorted, so DIFFER comes before MATCH
    expect(M.checkPreregMoves(q, four, five)).toEqual(['totals_diff:DIFFER expected 31 got 30', 'totals_diff:MATCH expected 399 got 401']);
  });
  it('with no baseline the moves are not checked; the totals still are', () => {
    expect(M.checkPreregMoves(pre({ expected_totals: TOTAL_AFTER }), null, moved())).toEqual([]);
    const p = pre({ expected_totals: { MATCH: 0 } });
    expect(M.checkPreregMoves(p, null, base)).toEqual(['totals_diff:DIFFER expected 0 got 1', 'totals_diff:MATCH expected 0 got 1', 'totals_diff:NO ANSWER expected 0 got 1']);
  });
  it('O68-04: the totals are of the prereg group only; another group\'s rows are not counted', () => {
    // the default group is coa172; the same notices in another group must not be folded into the totals
    const other = base.map((r) => ({ ...r, group: 'coa4d' }));
    expect(M.checkPreregMoves(pre({ expected_totals: TOTALS }), null, [...base.map((r) => ({ ...r })), ...other])).toEqual([]);
    // a prereg that names its group compares THAT group's rows, and only them
    const p4d = REGISTERED({ expected_totals: { MATCH: 1, DIFFER: 1, 'NO ANSWER': 1 }, group: 'coa4d' });
    expect(M.checkPreregMoves(p4d, null, [...base.map((r) => ({ ...r })), ...other])).toEqual([]);
    // the twin: an unexpected class total of the named group is still a finding
    const p4dBad = REGISTERED({ expected_totals: { MATCH: 2 }, group: 'coa4d' });
    expect(M.checkPreregMoves(p4dBad, null, other)).toEqual(['totals_diff:DIFFER expected 0 got 1', 'totals_diff:MATCH expected 2 got 1', 'totals_diff:NO ANSWER expected 0 got 1']);
  });
  it('O68-04: moves are diffed inside the prereg group only, so another group is never an added or removed row', () => {
    const cur = [...base.map((r) => ({ ...r })), row('Z9/26X|1', 'MATCH', '10.9.9.9(1)', 'coa4d')];
    expect(M.checkPreregMoves(pre({ expected_totals: TOTALS }), base, cur)).toEqual([]);
  });
});

describe('preregNotes: unchecked moves are said out loud (O68-04)', () => {
  it('no base rows: the note names the gap instead of passing silently', () => {
    expect(M.preregNotes(pre(), null)).toEqual(['prereg moves not checked: no base rows']);
  });
  it('with base rows there is nothing to say', () => {
    expect(M.preregNotes(pre(), [])).toEqual([]);
  });
});

describe('preregRefusesAccept: a finding cannot be accepted into the record (M-321)', () => {
  it('accept over a finding is refused', () => {
    expect(M.preregRefusesAccept(['totals_diff:MATCH expected 401 got 400'], 'accept')).toEqual(['accept_with_prereg_finding']);
  });
  it('accept with no finding, and a revert over a finding, are not refused', () => {
    expect(M.preregRefusesAccept([], 'accept')).toEqual([]);
    expect(M.preregRefusesAccept(['prereg_missing'], 'revert')).toEqual([]);
  });
});

describe('checkPreregHistory: committed alone and before the round (M-321)', () => {
  const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json';
  const heir = (sha: string, files: string[] = [PREREG]): PreregCommit => ({ sha, files });
  const hist = (over: Partial<HistoryInput> = {}): HistoryInput => ({
    preregCommits: [heir('a1')],
    roundCommit: { sha: 'r1' },
    isStrictAncestor: (a: string, b: string) => a === 'a1' && b === 'r1',
    preregFile: PREREG,
    ...over,
  });
  it('one commit, alone, strictly before the round: green', () => {
    expect(M.checkPreregHistory(hist())).toEqual([]);
  });
  it('no round commit yet: nothing to order, green', () => {
    expect(M.checkPreregHistory(hist({ roundCommit: null }))).toEqual([]);
    expect(M.checkPreregHistory(hist({ roundCommit: null, preregCommits: [] }))).toEqual([]);
  });
  it('no commit touches the prereg: it was never registered', () => {
    expect(M.checkPreregHistory(hist({ preregCommits: [] }))).toEqual(['prereg_missing']);
  });
  it('a second commit touching the prereg is an edit after the first', () => {
    expect(M.checkPreregHistory(hist({ preregCommits: [heir('a1'), heir('a2')] }))).toEqual(['prereg_edited_after_first_commit']);
  });
  it('a prereg committed in the round or after it is not strictly before', () => {
    const notBefore = (a: string, b: string) => a !== 'a1' && b === 'r1';
    expect(M.checkPreregHistory(hist({ isStrictAncestor: notBefore }))).toEqual(['prereg_not_strictly_before_round']);
  });
  it('a prereg committed with any other file is not alone; alone among a longer list is not alone either', () => {
    expect(M.checkPreregHistory(hist({ preregCommits: [heir('a1', [PREREG, 'src/x.ts'])] }))).toEqual(['prereg_commit_not_alone']);
    expect(M.checkPreregHistory(hist({ preregCommits: [heir('a1', [])] }))).toEqual(['prereg_commit_not_alone']);
  });
  it('two faults are both reported; the order check reads the FIRST commit', () => {
    const firstOnly = (a: string, b: string) => a === 'a1' && b === 'r1';
    expect(M.checkPreregHistory(hist({ preregCommits: [heir('a1', [PREREG, 'src/x.ts'])] }))).toEqual(['prereg_commit_not_alone']);
    expect(M.checkPreregHistory(hist({ preregCommits: [heir('a0', [PREREG]), heir('a1')], isStrictAncestor: firstOnly }))).toEqual(['prereg_edited_after_first_commit', 'prereg_not_strictly_before_round']);
  });
});

// The history reader on four throw-away repositories. Every git call runs with the GIT_* variables removed: inside a hook git exports
// GIT_DIR / GIT_INDEX_FILE, and a git -C <tmp> call would then commit into the CALLING repository (src/tests/bylaw-use-scope-prereg.infra.test.ts).
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const gitQ = (dir: string, args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: cleanEnv() }).trim();
const gitRaw = (dir: string, args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: cleanEnv() });

type Twin = 'honest' | 'no_round' | 'same_commit' | 'not_alone' | 'edited_after';
const PREREG_REL = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json';
const RECORD_REL = 'docs/reports/loop-records/1/round-01.json';
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playout-prereg-'));
const twins: string[] = [];

/** A throw-away repository with one round: the prereg, then the record; `mutate` alters that order. */
function twinRepo(mutate: Twin): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${mutate}-`));
  twins.push(dir);
  execFileSync('git', ['init', '-q', dir], { env: cleanEnv() });
  // never touch another repository: the twin's git dir must resolve inside its own temp dir, never ROOT
  const gitDir = fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir']));
  if (gitDir !== path.join(fs.realpathSync(dir), '.git')) throw new Error(`twin repository does not resolve to ${dir}`);
  if (fs.realpathSync(ROOT).startsWith(fs.realpathSync(dir) + path.sep)) throw new Error(`twin repository holds ROOT: ${dir}`);
  gitQ(dir, ['config', 'user.email', 'loop@example.invalid']);
  gitQ(dir, ['config', 'user.name', 'loop']);
  const write = (rel: string, body: unknown): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(body));
  };
  const gone = (rel: string): void => fs.rmSync(path.join(dir, rel));
  const commit = (files: string[], msg: string): string => {
    for (const f of files) gitQ(dir, ['add', '-f', '--', f]);
    gitQ(dir, ['commit', '-q', '--no-verify', '-m', msg]);
    return gitQ(dir, ['rev-parse', 'HEAD']);
  };
  const seed = (): void => { write('seed.txt', 'seed'); commit(['seed.txt'], 'seed'); };
  const prereg = (): void => write(PREREG_REL, realPrereg());
  const record = (): void => write(RECORD_REL, { schema: 'loop-record-v1', increment: '1', round: 1, decision: 'accept' });
  if (mutate === 'honest') {
    seed(); prereg(); commit([PREREG_REL], 'prereg'); record(); commit([RECORD_REL], 'round');
  } else if (mutate === 'no_round') {
    seed(); prereg(); commit([PREREG_REL], 'prereg');
  } else if (mutate === 'same_commit') {
    seed(); prereg(); record(); commit([PREREG_REL, RECORD_REL], 'prereg and round together');
  } else if (mutate === 'not_alone') {
    seed(); write('unrelated.txt', 'x'); prereg(); commit([PREREG_REL, 'unrelated.txt'], 'prereg plus code'); record(); commit([RECORD_REL], 'round');
  } else {
    // a rewritten prereg, deleted and re-added after the round: one file, one path, still a second commit touching it
    seed(); prereg(); commit([PREREG_REL], 'prereg'); record(); commit([RECORD_REL], 'round');
    gone(PREREG_REL); commit([PREREG_REL], 'prereg removed'); prereg(); commit([PREREG_REL], 'prereg re-added, rewritten');
  }
  return dir;
}

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('gitPreregHistory: the real repository argument, then the four twins', () => {
  it('splits the log, shows the files of each prereg commit and answers the ancestor question', () => {
    const dir = twinRepo('honest');
    const preregSha = gitQ(dir, ['log', '--reverse', '--format=%H', '--', PREREG_REL]).split('\n')[0] as string;
    const recordSha = gitQ(dir, ['log', '--diff-filter=A', '--format=%H', '--', RECORD_REL]).split('\n').at(-1) as string;
    expect(gitQ(dir, ['show', '--name-only', '--format=', preregSha]).split('\n').filter(Boolean)).toEqual([PREREG_REL]);
    expect(gitRaw(dir, ['log', '--format=%H', '--', PREREG_REL]).split('\n').filter(Boolean)).toHaveLength(1);
    const h = M.gitPreregHistory(dir, PREREG_REL, RECORD_REL) as History;
    expect(h.preregCommits.map((c: PreregCommit) => c.sha)).toEqual([preregSha]);
    expect(h.preregCommits[0]?.files).toEqual([PREREG_REL]);
    expect(h.roundCommit).toEqual({ sha: recordSha });
    expect(h.preregFile).toBe(PREREG_REL);
    expect(h.isStrictAncestor(preregSha, recordSha)).toBe(true);
    expect(h.isStrictAncestor(recordSha, recordSha)).toBe(false);
    expect(M.checkPreregHistory(h)).toEqual([]);
  });
  it('no record commit yet: the round has not landed, green', () => {
    const h = M.gitPreregHistory(twinRepo('no_round'), PREREG_REL, RECORD_REL) as History;
    expect(h.roundCommit).toBeNull();
    expect(h.preregCommits).toHaveLength(1);
    expect(M.checkPreregHistory(h)).toEqual([]);
  });
  it('twin: a prereg committed alone before the round is green', () => {
    expect(M.checkPreregHistory(M.gitPreregHistory(twinRepo('honest'), PREREG_REL, RECORD_REL) as History)).toEqual([]);
  });
  it('twin: a prereg added in the round commit is not before it and not alone', () => {
    expect(M.checkPreregHistory(M.gitPreregHistory(twinRepo('same_commit'), PREREG_REL, RECORD_REL) as History)).toEqual([
      'prereg_not_strictly_before_round',
      'prereg_commit_not_alone',
    ]);
  });
  it('twin: a prereg committed with another file is not alone', () => {
    expect(M.checkPreregHistory(M.gitPreregHistory(twinRepo('not_alone'), PREREG_REL, RECORD_REL) as History)).toEqual(['prereg_commit_not_alone']);
  });
  it('twin: a prereg edited after its first commit is refused', () => {
    expect(M.checkPreregHistory(M.gitPreregHistory(twinRepo('edited_after'), PREREG_REL, RECORD_REL) as History)).toEqual(['prereg_edited_after_first_commit']);
  });
  it('no git written outside the temp dirs: every twin commits to itself', () => {
    for (const d of twins) expect(fs.realpathSync(gitQ(d, ['rev-parse', '--absolute-git-dir']))).toBe(path.join(fs.realpathSync(d), '.git'));
  });
});
