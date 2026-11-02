// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-KP (124a:1025: the operator approves the pushed changes) and R-LF (124a:1050: the pre-push range is what git hands the hook on stdin)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/gates/plan.md section 2 (o) G6, T-o3a..T-o3j (the loop gate judges the pushed tip, scored from the tip's own tree)
// Red first: docs/reports/red-evidence/mcbylaws-gates-mb79g/. Real throw-away repos; computeRun is an injected spy except in T-o3g.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { hooksPathVerdict, readRealHooksPath } from './hooks-path-guard.global';

const ROOT = path.resolve(__dirname, '../..');
const CONTEXT_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-context.mjs');
const GATE_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs');
const EVAL_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs');
const RECORD_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs');
const ORACLE_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs');

// ---- types (exactOptionalPropertyTypes / noUncheckedIndexedAccess) ----

type Classify = (p: string) => string | null;
type NameStatusRow = { s: string; p: string };
type RecCase = { id: string; status: string; got_sha: string };
type AcceptedFinding = { case: string; finding_id: string; reason: string };
type LoopRec = {
  schema: string;
  increment: string;
  round: number;
  decision: string;
  reason: string;
  accepted_findings: AcceptedFinding[];
  cases: RecCase[];
  inputs: { [p: string]: string };
  binding: { sha256: string };
};
type Latest = { path: string; rec: LoopRec } | null;
type RunCase = { id: string; status: string; got_sha: string; group?: string | undefined };
type Canary = { id: string | null; observed: string };
type Run = {
  cases: RunCase[];
  skipped: number;
  canary: Canary;
  report: { violations: string[]; owed: { line: string; measured: number; floor: number }[] };
  counts: { [line: string]: number };
  baseRows: { group: string; id: string; status: string; clause: string }[] | null;
  curRows: { group: string; id: string; status: string; clause: string }[];
  regenMismatch: string[];
  groups: { id: string; introduced_in: string }[];
  floorsOk: boolean;
};
type Prereg = {
  schema: string;
  task: string;
  round: number;
  $comment: string;
  plan_ref: string;
  increment: string;
  group?: string | undefined;
  expected_moves: { clause: string; from: string; to: string }[];
  expected_totals: { [k: string]: number };
  rows_touched?: { id: string; increment: string | null }[] | undefined;
};
type PreregHistory = {
  preregCommits: { sha: string; files: string[] }[];
  roundCommit: { sha: string } | null;
  isStrictAncestor: (a: string, b: string) => boolean;
  preregFile: string;
};
type Floors = { percentBase: unknown; percentCur: unknown; countBase: unknown; countCur: unknown };
type Ctx = {
  mode: string;
  nameStatus: NameStatusRow[];
  commits: NameStatusRow[][];
  classify: Classify;
  incrementIds: string[];
  rulings: Map<string, string>;
  cardExists: (id: string) => boolean;
  latest: Latest;
  newRecords: { path: string; rec: LoopRec }[];
  unparsable: string[];
  firstRoundOfIncrement: boolean;
  greenHistory: string[];
  prereg: Prereg | null;
  preregFile: string | null;
  preregHistory: PreregHistory | null;
  treeBlobs: { [p: string]: string };
  changedBound: string[];
  regression: {
    base: { groups: { id: string; introduced_in: string; ids: string[] }[] } | null;
    cur: { groups: { id: string; introduced_in: string; ids: string[] }[] } | null;
  };
  floors: Floors;
  baselineOwed: { [line: string]: number };
  prevCases: { [id: string]: { status: string; got_sha: string } };
  newCases: { id: string; introduced_in: string }[];
  rowsTouched: { id: string; increment: string | null }[];
  run: Run | null;
  preregJoin?: { task: string | null; source: string | null; violations: string[] } | undefined;
};
type Verdict = { violations: string[]; notes: string[] };
// The whole parseArgs object: buildContext reads command/mode/root/base/target and (MB-79 o) tip.
type Parsed = { mode: string; root: string; base: string; target: string; [k: string]: unknown };
type GitDeps = {
  git: (root: string, args: string[]) => string;
  stagedNameStatus: (root: string) => NameStatusRow[];
  rangeNameStatus: (root: string, base: string, tip: string) => NameStatusRow[];
  perCommitNameStatus: (root: string, base: string, tip: string) => NameStatusRow[][];
  mergeBase: (root: string, targetRef: string) => string;
  blobIdsAt: (root: string, rev: string, paths: string[]) => { [p: string]: string };
  readAt: (root: string, rev: string, filePath: string) => string | null;
};
type ComputeRunArgs = { root: string; runRoot?: string | undefined };
type Deps = {
  git?: GitDeps;
  computeRun?: (args: ComputeRunArgs) => unknown;
  readRegisterText?: (root: string) => string;
  execFileSync?: (cmd: string, args: string[], opts: object) => unknown;
};
type BuildContext = (parsed: Parsed, deps?: Deps) => Promise<Ctx>;
type ContextModule = { buildContext: BuildContext };

const loadContext = async (): Promise<ContextModule> =>
  (await import(/* @vite-ignore */ CONTEXT_MOD)) as unknown as ContextModule;

let GitMod: GitDeps | null = null;
async function loadGit(): Promise<GitDeps> {
  if (!GitMod) {
    const mod = (await import(/* @vite-ignore */ GATE_MOD)) as unknown as GitDeps;
    GitMod = {
      git: mod.git,
      stagedNameStatus: mod.stagedNameStatus,
      rangeNameStatus: mod.rangeNameStatus,
      perCommitNameStatus: mod.perCommitNameStatus,
      mergeBase: mod.mergeBase,
      blobIdsAt: mod.blobIdsAt,
      readAt: mod.readAt,
    };
  }
  return GitMod;
}

// bindRecord is the one place that computes binding.sha256; loaded once at module scope so the fixtures stay synchronous.
const RECORD_HELPERS = (await import(/* @vite-ignore */ RECORD_MOD)) as unknown as {
  bindRecord: (rec: unknown) => unknown;
};

// makeClassifier is the one classifier the BOUND set is measured with: the module's own, never a fixture stand-in.
const ORACLE = (await import(/* @vite-ignore */ pathToFileURL(ORACLE_MOD).href)) as unknown as { makeClassifier?: unknown };
if (typeof ORACLE.makeClassifier !== 'function') throw new Error('loop-oracle.mjs must export makeClassifier');
const classifyBound: Classify = (ORACLE.makeClassifier as () => Classify)();

function bind(rec: Omit<LoopRec, 'binding'>): LoopRec {
  return RECORD_HELPERS.bindRecord(rec) as LoopRec;
}

/** The index blob id of a file the fixture has staged (treeBlobs carries REAL blob ids, never a made-up digest). */
function indexBlob(dir: string, rel: string): string {
  return gitQ(dir, ['ls-files', '-s', '--', rel]).split('\t')[0]?.split(' ')[1] as string;
}

async function evaluateGateOf(): Promise<(ctx: Ctx) => Verdict> {
  const mod = (await import(/* @vite-ignore */ EVAL_MOD)) as unknown as { evaluateGate: (ctx: Ctx) => Verdict };
  return mod.evaluateGate;
}

// ---- git plumbing (GIT_* scrubbed: inside a hook they would point `git -C <tmp>` at the CALLING repo) ----

const cleanEnv = (): NodeJS.ProcessEnv => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
  // The repository lints/serves CRLF (file mode is a per-file stat compared with the index), so the temp repo must not normalise.
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  env.GIT_CONFIG_VALUE_0 = 'false';
  return env;
};
const gitQ = (dir: string, args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tempDirs: string[] = [];
function makeRepo(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb79-tip-')));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-q', dir], { env: cleanEnv() });
  // F1 (MB-79 (h); ba05d889 class): the git dir is checked to be this temp dir's own BEFORE any config write, and config is written only by --file.
  const gitDir = fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir']));
  if (gitDir !== path.join(dir, '.git')) throw new Error(`temp repository does not resolve to ${dir}`);
  const own = path.join(dir, '.git', 'config');
  gitQ(dir, ['config', '--file', own, 'user.email', 'ctx@example.invalid']);
  gitQ(dir, ['config', '--file', own, 'user.name', 'ctx']);
  return dir;
}

function writeFile(dir: string, rel: string, content: unknown): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function commitAll(dir: string, message: string): string {
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return gitQ(dir, ['rev-parse', 'HEAD']);
}

afterEach(() => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  }
});
afterAll(() => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  }
});

// ---- the tiny fake tree ----------------------------------------------------------------------------------------------------------

const INCREMENT_IDS = ['1', '2', '3', '4', '5', '6', '6b', '7', '8', '9', '10'];
const CATALOGUE = 'scripts/seeds/bylaw/layer3-catalogue.json';
const CATALOGUE_NEXT = 'scripts/seeds/bylaw/layer3-catalogue-next.json';
const SET_REL = 'mcbylaws/loop/regression-set.json';
const IDS_REL = 'mcbylaws/loop/data/ids-g-a.json';
const COUNT_FLOORS = 'mcbylaws/loop/floors-count.json';
const INCREMENTS_REL = 'scripts/analysis/mcbylaws-loop/data/increments.json';
const PROTECTED_REL = 'mcbylaws/protected-paths.json';
const REGISTER_REL = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const POLICY_69_REL = 'docs/specs/01-pipeline/69_mcbylaw_policy.md';
const RECORD_1 = 'docs/reports/loop-records/1/round-01.json';
const RECORD_2_1 = 'docs/reports/loop-records/2/round-01.json';
const PREREG_REL = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-99-1.json';
const PASS_CASE = 'c-pass';
const ACCEPTED_CASE = 'c-acc';
// The "second change" of the F2 fixture: a bound code file no record of c1 names.
const C2_FILE = 'scripts/seeds/bylaw/layer3-catalogue-c2.json';

const sha = (n: number): string => String(n).padStart(64, '0');
// The register reaches buildContext only through the `readRegisterText` seam (every test injects it).
const REGISTER_TEXT = '';

function idsSha(ids: string[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex');
}

const ROUND_IDS_B = [ACCEPTED_CASE];
const IDS_B_REL = 'mcbylaws/loop/data/ids-g-b.json';

function idsRef(id: string, ids: string[], introducedIn = 'baseline'): { [k: string]: unknown } {
  return { id, introduced_in: introducedIn, kind: 'coa', ids_file: `mcbylaws/loop/data/ids-${id}.json`, ids_sha256: idsSha(ids) };
}

function regressionSet(groups: { [k: string]: unknown }[], over: { [k: string]: unknown } = {}): unknown {
  return { groups, pending: [], removals: [], ...over };
}

const baseRegressionSet = (): unknown => regressionSet([idsRef('g-a', [PASS_CASE])]);

const roundRegressionSet = (increment: string, over: { [k: string]: unknown } = {}): unknown =>
  regressionSet([idsRef('g-a', [PASS_CASE], 'baseline'), idsRef('g-b', [ACCEPTED_CASE], increment)], over);

function recordPayload(over: { [k: string]: unknown } = {}): Omit<LoopRec, 'binding'> {
  return {
    schema: 'loop-record-v1',
    increment: '2',
    round: 1,
    decision: 'accept',
    reason: 'every in-scope case is green and no floor line moved down this round',
    accepted_findings: [],
    cases: [
      { id: PASS_CASE, status: 'pass', got_sha: sha(11) },
      { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12) },
    ],
    inputs: {
      [CATALOGUE]: sha(21),
      [SET_REL]: sha(22),
      [IDS_REL]: sha(23),
      [COUNT_FLOORS]: sha(24),
      'mcbylaws/loop/floors-percent.json': sha(25),
    },
    ...(over as Partial<Omit<LoopRec, 'binding'>>),
  };
}

function preregPayload(over: { [k: string]: unknown } = {}): Prereg {
  const round = typeof over.round === 'number' ? over.round : 1;
  return {
    schema: 'coa-round-prereg-v1',
    task: 'MB-99',
    round,
    $comment: 'pre-registered before the round',
    plan_ref: `MB-68 increment 2 round ${round}`,
    increment: '2',
    group: 'g-a',
    expected_moves: [],
    expected_totals: { MATCH: 2 },
    rows_touched: [{ id: '10.20.30.110', increment: '2' }],
    ...(over as Partial<Prereg>),
  } as Prereg;
}

const percentFloors = (): unknown => ({ overall: { accuracy: 90, answered: 80 }, articles: {}, pooled: null, rulings: [] });
const countFloors = (): unknown => ({ schema: 'loop-floors-v1', lines: { 'g-a cases': 2 }, rulings: [] });

/** The base tree: increments, the base policy, the group, increment 1 accepted and green. */
function seedBase(dir: string): void {
  writeFile(dir, INCREMENTS_REL, { ids: INCREMENT_IDS });
  writeFile(dir, PROTECTED_REL, { layer23: ['scripts/seeds/bylaw/**'] });
  writeFile(dir, CATALOGUE, { rows: [] });
  writeFile(dir, SET_REL, baseRegressionSet());
  writeFile(dir, IDS_REL, [PASS_CASE]);
  writeFile(dir, 'mcbylaws/loop/floors-percent.json', percentFloors());
  writeFile(dir, COUNT_FLOORS, countFloors());
  writeFile(dir, RECORD_1, bind(recordPayload({ increment: '1', round: 1 })));
  writeFile(dir, REGISTER_REL, '# register\n');
  writeFile(dir, POLICY_69_REL, '# policy\n');
}

/** The record's inputs, bound to the REAL blob ids of the tree it is committed beside (built after the files are written). */
function inputsOf(dir: string, paths: string[]): { [p: string]: string } {
  const out: { [p: string]: string } = {};
  for (const rel of paths) out[rel] = indexBlob(dir, rel);
  return out;
}

const BOUND_PATHS = [CATALOGUE, SET_REL, IDS_REL, COUNT_FLOORS, 'mcbylaws/loop/floors-percent.json'];

const RECORD_RE = /^docs\/reports\/loop-records\/.+\/round-\d+\.json$/;

function boundInRange(dir: string, base: string): { [path: string]: string } {
  const out: { [path: string]: string } = {};
  const paths = gitQ(dir, ['diff', '--name-only', base, 'HEAD'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !RECORD_RE.test(p))
    .filter((p) => classifyBound(p) !== null);
  for (const p of paths) out[p] = gitQ(dir, ['rev-parse', `HEAD:${p}`]);
  return out;
}

function roundRecord(dir: string, recOver: { [k: string]: unknown } = {}, extra: string[] = [], boundRange?: string | undefined): LoopRec {
  const round = typeof recOver.round === 'number' ? recOver.round : 1;
  const inputs = inputsOf(dir, [...BOUND_PATHS, ...extra]);
  const rec = bind(recordPayload({ round, inputs, ...recOver }));
  if (boundRange === undefined) return rec;
  const blobs = boundInRange(dir, boundRange);
  return bind(recordPayload({ round, inputs: { ...inputs, ...blobs }, ...recOver }));
}

/** Make a message unique per binding and commit the tree, so the record is not landed by an earlier `git add -A`. */
function commitBound(dir: string, message: string): string {
  return commitAll(dir, `${message} (${String(Date.now())}${Math.random().toString(16).slice(2, 8)})`);
}

/**
 * A push peer: the honest round is LANDED (two commits behind it: the prereg alone, then the round). The inputs are computed from
 * `git diff --name-only base HEAD` with the record OUT of the set first, so the record binds EVERY bound path of the range.
 */
async function seedLandedRound(dir: string, recOver: { [k: string]: unknown } = {}): Promise<string> {
  seedBase(dir);
  const base = commitBound(dir, 'base');
  writeFile(dir, PREREG_REL, preregPayload());
  commitBound(dir, 'prereg');
  writeFile(dir, CATALOGUE_NEXT, { rows: [1] });
  writeFile(dir, SET_REL, roundRegressionSet('2'));
  writeFile(dir, IDS_B_REL, ROUND_IDS_B);
  commitBound(dir, 'round files');
  writeFile(dir, RECORD_2_1, roundRecord(dir, recOver, [], base));
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '--no-verify', '--amend', '-m', 'round\n\nMcBylaws-Task: MB-99']);
  return base;
}

/** computeRun stand-in: a green run whose cases match the honest record and whose MATCH totals are the prereg's, no scanner spawned. */
const fakeRun = (): Run => ({
  cases: [
    { id: PASS_CASE, status: 'pass', got_sha: sha(11), group: 'g-a' },
    { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12), group: 'g-a' },
    { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12), group: 'g-b' },
  ],
  skipped: 0,
  canary: { id: 'g-a|1', observed: 'fail' },
  report: { violations: [], owed: [] },
  counts: { 'g-a cases': 2 },
  baseRows: [
    { group: 'g-a', id: 'g-a|1', status: 'MATCH', clause: '10.20.30.110' },
    { group: 'g-a', id: 'g-a|2', status: 'MATCH', clause: '10.20.30.113' },
  ],
  curRows: [
    { group: 'g-a', id: 'g-a|1', status: 'MATCH', clause: '10.20.30.110' },
    { group: 'g-a', id: 'g-a|2', status: 'MATCH', clause: '10.20.30.113' },
  ],
  regenMismatch: [],
  groups: [{ id: 'g-a', introduced_in: 'baseline' }, { id: 'g-b', introduced_in: '2' }],
  floorsOk: true,
});

// ---- R-MA: the prereg join by task (MB-79 (h)) ----
const COA = 'scripts/analysis/bylaw-validation/coa-expected';
const pre = (task: string, k: number): string => `${COA}/prereg-${task}-${String(k)}.json`;
const RECORD_1_2 = 'docs/reports/loop-records/1/round-02.json';

/** A J base: seedBase without its increment-1 record (the J cases stage increment 1's rounds themselves). Returns the base sha. */
function seedJoinBase(dir: string, message = 'base'): string {
  seedBase(dir);
  fs.rmSync(path.join(dir, RECORD_1), { force: true });
  return commitAll(dir, message);
}

/** ONE file committed alone (M-321), with this exact message. */
function commitAlone(dir: string, rel: string, content: unknown, message = `prereg alone: ${rel}`): string {
  writeFile(dir, rel, content);
  gitQ(dir, ['add', '--', rel]);
  gitQ(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return gitQ(dir, ['rev-parse', 'HEAD']);
}

/** Stage an increment-1 revert record for `round` (1 or 2), bound to the index; nothing else is staged by it. */
function stageInc1Record(dir: string, round = 1): string {
  const rel = round === 1 ? RECORD_1 : RECORD_1_2;
  const rec = bind(recordPayload({ increment: '1', round, decision: 'revert', reason: 'R-MA join fixture: a revert round of increment 1', inputs: inputsOf(dir, BOUND_PATHS) }));
  writeFile(dir, rel, rec);
  gitQ(dir, ['add', '--', rel]);
  return rel;
}

/** The round LANDED as one commit: a new catalogue plus the increment-1 record, with this exact message (trailer or not). */
function landRound(dir: string, message: string): string {
  writeFile(dir, CATALOGUE_NEXT, { rows: [1] });
  gitQ(dir, ['add', '--', CATALOGUE_NEXT]);
  stageInc1Record(dir, 1);
  gitQ(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return gitQ(dir, ['rev-parse', 'HEAD']);
}

const inc1 = (task: string, over: { [k: string]: unknown } = {}): Prereg => preregPayload({ task, increment: '1', ...over });

// ---- the tip seam (MB-79 (o) G6) ----

/**
 * What buildContext handed computeRun: the repo dir, the tree the run is to be scored from, and that tree's own bytes, read
 * DURING the call (the tree is removed afterwards, so nothing may be inspected later).
 */
type Seen = { root: string; runRoot: string | undefined; code: string | null; c2: boolean };

function spy(seen: Seen[], answer: () => unknown = () => fakeRun()): (args: { root: string; runRoot?: string }) => unknown {
  return (args: { root: string; runRoot?: string }) => {
    const r = args.runRoot;
    seen.push({
      root: args.root,
      runRoot: r,
      code: r && fs.existsSync(path.join(r, CATALOGUE_NEXT)) ? fs.readFileSync(path.join(r, CATALOGUE_NEXT), 'utf8') : null,
      c2: Boolean(r && fs.existsSync(path.join(r, C2_FILE))),
    });
    return answer();
  };
}

/** buildContext at push/ci with an explicit tip (omitted when `tip` is undefined: the code's own default). */
async function ctxAt(dir: string, mode: string, base: string, tip: string | undefined, over: { [k: string]: unknown } = {}, target = ''): Promise<Ctx> {
  const { buildContext } = await loadContext();
  const parsed: Parsed = { mode, root: dir, base, target, ...(tip === undefined ? {} : { tip }) };
  return buildContext(parsed, {
    git: await loadGit(),
    readRegisterText: () => REGISTER_TEXT,
    computeRun: () => fakeRun(),
    ...(over as unknown as Deps),
  });
}

/**
 * The F2 fixture: the base, then c1 (an honest landed round: the prereg alone, then the round files and the bound record), then c2
 * (a code change with no record), then an UNSTAGED dirty edit of the round's catalogue (never committed, never staged).
 */
async function twoCommits(dir: string): Promise<{ base: string; c1: string; c2: string }> {
  const base = await seedLandedRound(dir);
  const c1 = gitQ(dir, ['rev-parse', 'HEAD']);
  writeFile(dir, C2_FILE, { rows: [2] });
  const c2 = commitAll(dir, 'c2: a code change with no record');
  writeFile(dir, CATALOGUE_NEXT, { rows: [99] });
  return { base, c1, c2 };
}

/** Only the violations naming THIS path: the other violations of these fixtures are not under test. */
const naming = (violations: string[], rel: string): string[] => violations.filter((x) => x.endsWith(`:${rel}`));

// ---- tests -------------------------------------------------------------------------------------------------------------------------

describe('MB-79 (o) G6: the loop gate judges the pushed tip', () => {
  it('T-o3a: --tip c1 while HEAD is c2 judges c1, scored from c1 own tree (never the dirty worktree)', async () => {
    const dir = makeRepo();
    const { base, c1 } = await twoCommits(dir);
    const seen: Seen[] = [];
    const ctx = await ctxAt(dir, 'push', base, c1, { computeRun: spy(seen) });

    // GREEN today: the round under judgement is c1's record and the bound blob is c1's.
    expect(ctx.latest?.path).toBe(RECORD_2_1);
    expect(ctx.treeBlobs[CATALOGUE_NEXT]).toBe(gitQ(dir, ['rev-parse', `${c1}:${CATALOGUE_NEXT}`]));
    // RED today: the range is read at HEAD, so c2's code change is in the name-status.
    expect(ctx.nameStatus.map((r) => r.p)).not.toContain(C2_FILE);

    // GREEN today: root is still the repo dir (the base extraction needs it). RED today: a tree is handed over at all.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.root).toBe(dir);
    expect(typeof seen[0]?.runRoot).toBe('string');
    expect(seen[0]?.runRoot).not.toBe(dir);
    // Where a tree WAS handed over, it carries c1's committed bytes: never the dirty `{ rows: [99] }`, never c2's file.
    if (typeof seen[0]?.runRoot === 'string') {
      expect(seen[0]?.code?.trim()).toBe(gitQ(dir, ['show', `${c1}:${CATALOGUE_NEXT}`]).trim());
      expect(seen[0]?.code).not.toContain('99');
      expect(seen[0]?.c2).toBe(false);
    }

    // RED today: the honest, already landed round is judged against the dirty worktree and refused.
    expect((await evaluateGateOf())(ctx).violations).toEqual([]);
  });

  it('T-o3b: no tip means HEAD: c2 code is unbound, and the tree scored is HEAD committed, not the dirty edit', async () => {
    const dir = makeRepo();
    const { base } = await twoCommits(dir);
    const seen: Seen[] = [];
    const ctx = await ctxAt(dir, 'push', base, undefined, { computeRun: spy(seen) });

    expect(ctx.nameStatus.map((r) => r.p)).toContain(C2_FILE);
    const v = (await evaluateGateOf())(ctx).violations;
    expect(v).toContain(`input_not_bound:${C2_FILE}`);

    // GREEN today: root is the repo dir and a different tree is handed over.
    expect(seen[0]?.root).toBe(dir);
    expect(typeof seen[0]?.runRoot).toBe('string');
    expect(seen[0]?.runRoot).not.toBe(dir);
    // RED today: that tree is HEAD's own extraction (an empty base tree, lacking c2's file) or the dirty worktree itself.
    expect(seen[0]?.c2).toBe(true);
    expect(seen[0]?.code?.trim()).toBe(gitQ(dir, ['show', `HEAD:${CATALOGUE_NEXT}`]).trim());
    expect(seen[0]?.code).not.toContain('99');
  });

  it('T-o3c: no temp tree is left behind (success, a throwing scorer, and a failing regression read)', async () => {
    const captured: string[] = [];
    const wrap = (cmd: string, args: string[], opts: object): unknown => {
      if (cmd === 'tar') {
        const i = args.indexOf('-C');
        captured.push(String(args[i + 1]));
      }
      return execFileSync(cmd, args, opts as Parameters<typeof execFileSync>[2]);
    };

    // 1. success: every extracted tree is removed again (GREEN today: nothing is extracted at all).
    const dir1 = makeRepo();
    const one = await twoCommits(dir1);
    const seen: Seen[] = [];
    await ctxAt(dir1, 'push', one.base, one.c1, { computeRun: spy(seen), execFileSync: wrap });
    for (const t of captured) {
      expect(fs.existsSync(t)).toBe(false);
      expect(fs.existsSync(`${t}.tar`)).toBe(false);
    }

    captured.length = 0;
    // 2. the scorer throws: the tip tree is removed in the finally.
    const dir2 = makeRepo();
    const two = await twoCommits(dir2);
    await expect(ctxAt(dir2, 'push', two.base, two.c1, {
      computeRun: () => {
        throw new Error('scorer boom');
      },
      execFileSync: wrap,
    })).rejects.toThrow('scorer boom');
    expect(fs.existsSync(String(captured[0]))).toBe(false);
    expect(fs.existsSync(`${String(captured[0])}.tar`)).toBe(false);
    // RED today: no tip tree is made at all, so nothing was extracted for the tip.
    expect(captured).toHaveLength(1);

    // 3. the regression read at the tip fails: no tree was made at all (GREEN today).
    captured.length = 0;
    const dir3 = makeRepo();
    const three = await twoCommits(dir3);
    fs.rmSync(path.join(dir3, SET_REL));
    const c3 = commitAll(dir3, 'c3: the regression set removed');
    await expect(ctxAt(dir3, 'push', three.base, c3, { computeRun: spy(seen), execFileSync: wrap })).rejects.toThrow();
    expect(captured).toEqual([]);
  });

  it('T-o3d: an unresolvable tip fails closed with exit 2 and tip_not_resolvable', async () => {
    const dir = makeRepo();
    const { base } = await twoCommits(dir);
    const { main } = (await import(pathToFileURL(GATE_MOD).href)) as unknown as {
      main: (argv: string[], deps: { write: (s: string) => void }) => Promise<number>;
    };
    const out: string[] = [];
    const code = await main(['check', '--mode', 'push', '--base', base, '--tip', 'no-such-rev-mb79', '--root', dir], {
      write: (s: string) => {
        out.push(s);
      },
    });
    // RED today: an unresolvable tip is never read, so the reason is something else entirely.
    expect(out.join('\n')).toContain('tip_not_resolvable');
    expect(code).toBe(2);
  });

  it('T-o3e: ci with --tip HEAD is today ci (the same facts, the same null run)', async () => {
    const dir = makeRepo();
    const { base } = await twoCommits(dir);
    // A clean c2 checkout and a target branch at the base, so the ci base is the merge base either way.
    gitQ(dir, ['checkout', '--', CATALOGUE_NEXT]);
    gitQ(dir, ['branch', 'main-mb79', base]);
    const a = await ctxAt(dir, 'ci', '', 'HEAD', { computeRun: () => null }, 'main-mb79');
    const b = await ctxAt(dir, 'ci', '', undefined, { computeRun: () => null }, 'main-mb79');
    expect(a.nameStatus).toEqual(b.nameStatus);
    expect(a.changedBound).toEqual(b.changedBound);
    expect(a.treeBlobs).toEqual(b.treeBlobs);
    expect(a.latest?.path).toBe(b.latest?.path);
    expect(a.preregFile).toBe(b.preregFile);
    expect(a.run).toBeNull();
    expect(b.run).toBeNull();
  });

  it('T-o3f: a default-branch commit HEAD does not hold is judged when it is the tip', async () => {
    const dir = makeRepo();
    const base = await seedLandedRound(dir);
    const c1 = gitQ(dir, ['rev-parse', 'HEAD']);
    const home = gitQ(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    gitQ(dir, ['checkout', '-q', '-b', 'ahead']);
    writeFile(dir, C2_FILE, { rows: [2] });
    const c2 = commitAll(dir, 'c2 on a branch HEAD does not hold');
    gitQ(dir, ['checkout', '-q', home]);
    // HEAD is c1 again: c2 is only reachable as the pushed sha.
    expect(gitQ(dir, ['rev-parse', 'HEAD'])).toBe(c1);

    const ctx = await ctxAt(dir, 'push', base, c2);
    const v = (await evaluateGateOf())(ctx).violations;
    // RED today: HEAD's view is green, and nothing names c2's code file.
    expect(v).toEqual([`input_not_bound:${C2_FILE}`]);
  });

  it('T-o3f-b: a record landed on such a branch is joined at the tip', async () => {
    const dir = makeRepo();
    const base = seedJoinBase(dir);
    const home = gitQ(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    gitQ(dir, ['checkout', '-q', '-b', 'lane']);
    commitAlone(dir, pre('MB-78', 1), inc1('MB-78'));
    const add = landRound(dir, 'round\n\nMcBylaws-Task: MB-78');
    gitQ(dir, ['checkout', '-q', home]);

    const ctx = await ctxAt(dir, 'push', base, add);
    // RED today: HEAD does not hold the record, so the join finds no add commit.
    expect(ctx.preregJoin?.violations ?? []).not.toContain('prereg_task_unknown:no-add-commit');
    expect(ctx.preregFile).toBe(pre('MB-78', 1));
    expect(ctx.preregHistory?.roundCommit).toEqual({ sha: add });
  });

  it('T-o3h: the MB-79 (m) exclusion is judged at the tip', async () => {
    const dir = makeRepo();
    const M30 = pre('MB-30', 1);
    const base = seedJoinBase(dir);
    const home = gitQ(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    commitAlone(dir, pre('MB-78', 1), inc1('MB-78'));
    landRound(dir, 'round\n\nMcBylaws-Task: MB-78');
    const c1 = commitAlone(dir, M30, inc1('MB-30'));

    // A side branch, then a merge whose resolution EDITS the prereg (its blob is neither parent's).
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    commitAlone(dir, 'notes/side.txt', 'side\n', 'side');
    gitQ(dir, ['checkout', '-q', home]);
    commitAlone(dir, 'notes/main.txt', 'main\n', 'main');
    try {
      gitQ(dir, ['merge', '--no-ff', '--no-commit', '-q', 'side']);
    } catch {
      // the merge stopped on the conflict on M30 (that is the point of this fixture)
    }
    writeFile(dir, M30, inc1('MB-30', { expected_totals: { MATCH: 6 } }));
    gitQ(dir, ['add', '--', M30]);
    gitQ(dir, ['commit', '-q', '--no-verify', '-m', 'merge side (M30 edited)']);

    // GREEN today: at HEAD the merge edited M30 after its add, so it stays bound.
    const head = (await evaluateGateOf())(await ctxAt(dir, 'push', base, undefined)).violations;
    expect(naming(head, M30)).toEqual([`input_not_bound:${M30}`]);

    // RED today: at c1 the prereg was committed alone, so the MB-79 (m) exclusion binds nothing.
    const tip = (await evaluateGateOf())(await ctxAt(dir, 'push', base, c1)).violations;
    expect(naming(tip, M30)).toEqual([]);
  });
});

describe('MB-79 (o) G6: the real run scores the tip tree, and the tip tree is checked', () => {
  it('T-o3g: the REAL computeRun at --tip c1 != HEAD scores the tip tree; the base keeps the repo', async () => {
    const RUN = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-run.mjs')).href)) as unknown as {
      computeRun: (a: object) => unknown;
    };
    const dir = makeRepo();
    const base = await seedLandedRound(dir);
    // The producer's data lives OUTSIDE the tree (an absolute data_dir): only the tree-rooted files below decide the score.
    const DATA = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb79-o3g-data-')));
    try {
      const prod = { kind: 'coa-scorecard', data_dir: DATA, floors: 'mcbylaws/loop/floors-percent.json', pin: 'mcbylaws/loop/pin-g.json' };
      writeFile(dir, SET_REL, regressionSet([
        { ...idsRef('g-a', [PASS_CASE], 'baseline'), producer: prod, fast: true },
        { ...idsRef('g-b', [ACCEPTED_CASE], '2'), producer: prod, fast: true },
      ]));
      writeFile(dir, 'mcbylaws/loop/floors-percent.json', { overall: {}, articles: {}, pooled: null });
      // c1 scores green: one MATCH row (the pin's total) and no floor line to fall under.
      writeFile(dir, 'mcbylaws/loop/pin-g.json', { totals: { MATCH: 1 } });
      writeFile(dir, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs', '// scorer stand-in\n');
      const c1 = commitAll(dir, 'c1: the producers');
      writeFile(dir, 'notes/c2.txt', 'c2\n');
      commitAll(dir, 'c2');
      // DIRTY, UNSTAGED worktree edits: a floors file every line fails and a pin that cannot match. Neither may be scored.
      writeFile(dir, 'mcbylaws/loop/floors-percent.json', { overall: { accuracy: 101, answered: 101 }, articles: {}, pooled: null, rulings: [] });
      writeFile(dir, 'mcbylaws/loop/pin-g.json', { totals: { MATCH: 7 } });

      const archives: { C: string; out: string; rev: string }[] = [];
      const tars: { file: string; dir: string }[] = [];
      const wrap = (cmd: string, args: string[], opts: object): unknown => {
        const list = Array.isArray(args) ? args.map(String) : [];
        if (cmd === 'git' && list.includes('archive')) {
          const c = list.indexOf('-C');
          const o = list.indexOf('-o');
          archives.push({ C: String(list[c + 1]), out: String(list[o + 1]), rev: String(list[list.length - 1]) });
        }
        if (cmd === 'tar') {
          const x = list.indexOf('-xf');
          const c = list.indexOf('-C');
          tars.push({ file: String(list[x + 1]), dir: String(list[c + 1]) });
        }
        return execFileSync(cmd, args, opts as Parameters<typeof execFileSync>[2]);
      };
      const spawns: { args: string[] }[] = [];
      const stub = (cmd: string, args: string[]): unknown => {
        const list = Array.isArray(args) ? args.map(String) : [];
        spawns.push({ args: list });
        const o = list.indexOf('--out');
        const out = o >= 0 ? list[o + 1] : '';
        if (out) fs.writeFileSync(out, JSON.stringify({ rows: [{ notice: 'A1', n: 1, class: 'MATCH', clause_norm: '10.1', ours: null }] }));
        return '';
      };

      let runOut: unknown = null;
      const ctx = await ctxAt(dir, 'push', base, c1, {
        execFileSync: wrap,
        computeRun: (a: object) => {
          runOut = RUN.computeRun({ ...a, deps: { execFileSync: wrap, spawn: stub } });
          return runOut;
        },
      });

      // The base side is extracted from the REPO; the tip side is the tip's own committed tree.
      const baseArchive = archives.find((a) => a.rev === base);
      expect(baseArchive?.C).toBe(dir);
      const tipArchive = archives.find((a) => a.rev === c1);
      expect(tipArchive?.rev).toBe(c1);
      const tipTree = tars.find((t) => t.file === tipArchive?.out)?.dir;
      expect(typeof tipTree).toBe('string');
      expect(tipTree).not.toBe(dir);

      // The scorer runs from the tip tree, with the tip tree as its root.
      expect(spawns.length).toBeGreaterThan(0);
      const fromTip = spawns.filter((s) => s.args[0] === path.join(String(tipTree), 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'));
      expect(fromTip.length).toBeGreaterThan(0);
      expect(fromTip[0]?.args[1]).toBe('--root');
      expect(fromTip[0]?.args[2]).toBe(tipTree);

      // The pin and the floors were read from c1's tree: the dirty worktree's would fail both.
      const run = ctx.run as unknown as {
        baseRows: unknown;
        baseRowsError: unknown;
        regenMismatch: string[];
        floorsOk: boolean;
      } | null;
      expect(run).not.toBeNull();
      expect(run?.baseRows).not.toBeNull();
      expect(run?.baseRowsError).toBeNull();
      expect(run?.regenMismatch).toEqual([]);
      expect(run?.floorsOk).toBe(true);

      // The extracted tree never outlives the run.
      expect(fs.existsSync(String(tipTree))).toBe(false);
    } finally {
      fs.rmSync(DATA, { recursive: true, force: true });
    }
  });

  it('T-o3i: an export-ignore attribute that drops a scored input is tip_extract_mismatch, exit 2', async () => {
    const dir = makeRepo();
    const base = await seedLandedRound(dir);
    writeFile(dir, '.gitattributes', 'mcbylaws/loop/** export-ignore\n');
    commitAll(dir, 'attr');
    const { main } = (await import(pathToFileURL(GATE_MOD).href)) as unknown as {
      main: (argv: string[], deps: { write: (s: string) => void }) => Promise<number>;
    };
    const out: string[] = [];
    const code = await main(['check', '--mode', 'push', '--base', base, '--tip', 'HEAD', '--root', dir], {
      write: (s: string) => {
        out.push(s);
      },
    });
    // RED today: no tip tree is checked against git, so the attribute goes unnoticed.
    expect(out.join('\n')).toContain('tip_extract_mismatch');
    expect(code).toBe(2);
  });

  it('T-o3j: an export-subst attribute that rewrites the scorer is tip_extract_mismatch, exit 2', async () => {
    const dir = makeRepo();
    const base = await seedLandedRound(dir);
    writeFile(dir, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs', '// $Format:%H$\n');
    writeFile(dir, '.gitattributes', 'scripts/analysis/bylaw-validation/coa-scorecard.mjs export-subst\n');
    commitAll(dir, 'subst');
    const { main } = (await import(pathToFileURL(GATE_MOD).href)) as unknown as {
      main: (argv: string[], deps: { write: (s: string) => void }) => Promise<number>;
    };
    const out: string[] = [];
    const code = await main(['check', '--mode', 'push', '--base', base, '--tip', 'HEAD', '--root', dir], {
      write: (s: string) => {
        out.push(s);
      },
    });
    // RED today: the substituted scorer is never compared with its committed blob.
    expect(out.join('\n')).toContain('tip_extract_mismatch');
    expect(code).toBe(2);
  });
});

// F1 (MB-79 (h); ba05d889): a hooks-path leak is pinned on the file that caused it.
afterAll(() => expect(hooksPathVerdict(readRealHooksPath(ROOT), process.env.CI === 'true')).toBeNull());
