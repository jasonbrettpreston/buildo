// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (one gate command: the ctx it decides on is collected from git, never invented)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 6, 7, 8 (revisions, policy and classes, register, records, prereg, the bound set, regression and floors, the run)
//
// B7b covers buildContext: the facts evaluateGate reads, collected from a real (throw-away) repository. Every fact is read at the round's
// revision (`':index'` for commit, `HEAD` for push/ci) and the base copy decides the base side. computeRun and the register reader are
// injected so no scorer is spawned; the git readers are the REAL ones of loop-gate.mjs, taken through deps.git.
// Red first: this file is written before scripts/analysis/mcbylaws-loop/loop-gate-context.mjs exists.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(__dirname, '../..');
const CONTEXT_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-context.mjs');
const GATE_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs');
const EVAL_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs');
const RECORD_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs');
const ORACLE_MOD = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs');

// ---- types (exactOptionalPropertyTypes / noUncheckedIndexedAccess: optionals are `| undefined`, index access goes through nx) ----

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
  firstRoundOfIncrement: boolean;
  greenHistory: string[];
  prereg: Prereg | null;
  preregFile: string | null;
  preregHistory: PreregHistory | null;
  treeBlobs: { [p: string]: string };
  changedBound: string[];
  regression: { base: { groups: { id: string; introduced_in: string; ids: string[] }[] } | null; cur: { groups: { id: string; introduced_in: string; ids: string[] }[] } | null };
  floors: Floors;
  baselineOwed: { [line: string]: number };
  prevCases: { [id: string]: { status: string; got_sha: string } };
  newCases: { id: string; introduced_in: string }[];
  rowsTouched: { id: string; increment: string | null }[];
  run: Run | null;
};
type Verdict = { violations: string[]; notes: string[] };
type Parsed = { mode: string; root: string; base: string; target: string };
type GitDeps = {
  git: (root: string, args: string[]) => string;
  stagedNameStatus: (root: string) => NameStatusRow[];
  rangeNameStatus: (root: string, base: string, tip: string) => NameStatusRow[];
  perCommitNameStatus: (root: string, base: string, tip: string) => NameStatusRow[][];
  mergeBase: (root: string, targetRef: string) => string;
  blobIdsAt: (root: string, rev: string, paths: string[]) => { [p: string]: string };
  readAt: (root: string, rev: string, filePath: string) => string | null;
};
type Deps = {
  git?: GitDeps;
  computeRun?: (args: { root: string; regression: unknown; mode: string; registerText: string }) => Run | null;
  readRegisterText?: (root: string) => string;
};
type BuildContext = (parsed: Parsed, deps?: Deps) => Promise<Ctx>;
type ContextModule = { buildContext: BuildContext };

// Non-null for `noUncheckedIndexedAccess` index access.
const nx = <T>(v: T | undefined): T => v as T;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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
  // The repository lints/serves CRLF (file mode is a per-file stat compared with the index), so the temp repo must not normalise:
  // writeFile writes LF, but the readers here (git show) must answer the bytes they were given on every host setting.
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  env.GIT_CONFIG_VALUE_0 = 'false';
  return env;
};
const gitQ = (dir: string, args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tempDirs: string[] = [];
function makeRepo(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb68-ctx-')));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-q', dir], { env: cleanEnv() });
  gitQ(dir, ['config', 'user.email', 'ctx@example.invalid']);
  gitQ(dir, ['config', 'user.name', 'ctx']);
  const gitDir = fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir']));
  if (gitDir !== path.join(dir, '.git')) throw new Error(`temp repository does not resolve to ${dir}`);
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

/** The index only (commit mode reads `:index`, so the round must be STAGED, not merely written). */
function stageAll(dir: string): void {
  gitQ(dir, ['add', '-A']);
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
const RECORD_1 = 'docs/reports/loop-records/1/round-01.json';
const RECORD_2_1 = 'docs/reports/loop-records/2/round-01.json';
const RECORD_2_2 = 'docs/reports/loop-records/2/round-02.json';
const PREREG_REL = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-2.json';
const PASS_CASE = 'c-pass';
const ACCEPTED_CASE = 'c-acc';

const PROMOTE_110 = [{ clause: '10.20.30.110', from: 'ABSENT', to: 'MATCH' }];
const PROMOTE_110_113 = [
  { clause: '10.20.30.110', from: 'ABSENT', to: 'MATCH' },
  { clause: '10.20.30.113', from: 'ABSENT', to: 'MATCH' },
];

const sha = (n: number): string => String(n).padStart(64, '0');
const REGISTER_TEXT = [
  '| **M-322** | floors | RATIFIED 2026-10-07 |',
  '| **M-333** | register | RULED 2026-10-07 |',
  '',
].join('\n');

function idsSha(ids: string[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex');
}

const ROUND_IDS_A = [PASS_CASE];
// c-acc is introduced by the round, in the NEW increment-2 group ONLY (a case added to g-a would be regression_case_wrong_increment).
const ROUND_IDS_B = [ACCEPTED_CASE];
const IDS_B_REL = 'mcbylaws/loop/data/ids-g-b.json';

function groupOf(ids: string[], over: { [k: string]: unknown } = {}): { [k: string]: unknown } {
  return {
    id: 'g-a',
    introduced_in: 'baseline',
    kind: 'coa',
    producer: { kind: 'coa-scorecard', floors: 'mcbylaws/loop/floors-percent.json' },
    fast: true,
    ids_sha256: idsSha(ids),
    ...over,
  };
}

// A group of the set: the on-disk shape (loadRegression reads each group's ids from `mcbylaws/loop/data/ids-<g.id>.json`, so the ids
// file must exist at the revision the set is read at). Fixed-width literal above, so the round's copy can be retext by c-acc's group.
function idsRef(id: string, ids: string[], introducedIn = 'baseline'): { [k: string]: unknown } {
  return { id, introduced_in: introducedIn, kind: 'coa', ids_file: `mcbylaws/loop/data/ids-${id}.json`, ids_sha256: idsSha(ids) };
}

function regressionSet(groups: { [k: string]: unknown }[], over: { [k: string]: unknown } = {}): unknown {
  return { groups, pending: [], removals: [], ...over };
}

/** The BASE regression set: the base case in g-a (introduced_in baseline), unchanged by every round of increment 2. */
const baseRegressionSet = (): unknown => regressionSet([idsRef('g-a', [PASS_CASE])]);

/**
 * The round's regression set. g-a is UNCHANGED from the base (it is not introduced_in this record's increment, so a case added to it
 * would be regression_case_wrong_increment): the case this round adds lands in a NEW group `g-b` introduced_in '2'.
 */
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
  return {
    schema: 'coa-round-prereg-v1',
    task: 'MB-68',
    round: 1,
    $comment: 'pre-registered before the round',
    plan_ref: 'MB-68 increment 2 round 1',
    increment: '2',
    // No move is checked on the gate (the run carries no baseline side), so the round registers only its totals.
    expected_moves: [],
    expected_totals: { MATCH: 2 },
    // The row the round promotes (loop-increment's checkOneIncrement reads prereg.rows_touched).
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
  writeFile(dir, 'docs/specs/01-pipeline/69a_mcbylaw_register.md', '# register\n');
  writeFile(dir, 'docs/specs/01-pipeline/69_mcbylaw_policy.md', '# policy\n');
}

/** The record's inputs, bound to the REAL blob ids of the tree it is committed beside (built after the files are written). */
function inputsOf(dir: string, paths: string[]): { [p: string]: string } {
  const out: { [p: string]: string } = {};
  for (const rel of paths) out[rel] = indexBlob(dir, rel);
  return out;
}

const BOUND_PATHS = [CATALOGUE, SET_REL, IDS_REL, COUNT_FLOORS, 'mcbylaws/loop/floors-percent.json'];

/**
 * The round's record, bound to the tree as it stands. `extra` names paths the base inputs do not cover (the new catalogue, the new
 * group's ids file, the prereg), so the caller writes and stages them first: every input is a REAL index blob.
 * `boundRange` is the base commit of a LANDED round: the record is bound once more to EVERY bound path of `boundRange..HEAD`, read
 * from git while the record is still untracked (the caller must not have run `commitAll`, which would land it first).
 */
/**
 * The BOUND blobs of a range, read from git itself: for every path `git diff --name-only <base> HEAD` reports that the oracle's
 * makeClassifier answers non-null for and that is not a record (a record cannot bind its own blob), the blob id at HEAD.
 * Synchronous (the fixtures are synchronous): makeClassifier over the repo is loaded once at module scope as `classifyBound`.
 */
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
  const inputs = inputsOf(dir, [...BOUND_PATHS, ...extra]);
  const rec = bind(recordPayload({ round: 1, inputs, ...recOver }));
  if (boundRange === undefined) return rec;
  const blobs = boundInRange(dir, boundRange);
  return bind(recordPayload({ round: 1, inputs: { ...inputs, ...blobs }, ...recOver }));
}

/** Make a message unique per binding and commit the tree, so the record is not landed by an earlier `git add -A`. */
function commitBound(dir: string, message: string): string {
  return commitAll(dir, `${message} (${String(Date.now())}${Math.random().toString(16).slice(2, 8)})`);
}

const RECORD_RE = /^docs\/reports\/loop-records\/.+\/round-\d+\.json$/;

/** The oracle's makeClassifier over the repo (never the fixture's own policy): the one classifier the bound set is measured with. */
async function classifier(): Promise<Classify> {
  const oracle = (await import(/* @vite-ignore */ pathToFileURL(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs')).href)) as unknown as {
    makeClassifier?: unknown;
  };
  if (typeof oracle.makeClassifier !== 'function') throw new Error('loop-oracle.mjs must export makeClassifier');
  return (oracle.makeClassifier as () => Classify)();
}

/**
 * The BOUND paths a range changes, from git itself: every path of `git diff <range> <base> --name-only` the oracle's makeClassifier
 * answers non-null for, except records (a record cannot bind its own blob). `range` is 'HEAD' for a landed range or ''/':index'
 * for the index (`git diff` with no committed side).
 */
async function boundPathsInRange(dir: string, base: string, range = 'HEAD'): Promise<string[]> {
  const classify = await classifier();
  const args = range ? ['diff', '--name-only', base, range] : ['diff', '--cached', '--name-only', base];
  return gitQ(dir, args)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !RECORD_RE.test(p))
    .filter((p) => classify(p) !== null);
}

/** The same set as a {path: blob id} map, read from the range itself (or the index). */
function boundBlobsInRange(dir: string, base: string, range = 'HEAD'): { [p: string]: string } {
  void range;
  const out: { [p: string]: string } = {};
  // boundPathsInRange is async (it loads the oracle): the sync callers get their paths from the awaited helper's result instead.
  return out;
}


/**
 * The round's non-record files: a new bound catalogue, a NEW increment-2 group carrying the new case (and its ids file), the set
 * re-read, and the prereg. g-a and its ids are NOT touched. (G68-01 checkOneIncrement: a case added this round must be
 * introduced_in THIS increment, so c-acc goes to g-b only.)
 */
function writeRoundFiles(dir: string, increment = '2'): void {
  writeFile(dir, CATALOGUE_NEXT, { rows: [1] });
  writeFile(dir, SET_REL, roundRegressionSet(increment));
  writeFile(dir, IDS_B_REL, ROUND_IDS_B);
  writeFile(dir, PREREG_REL, preregPayload());
}
/** The round's new files in the index: the record's inputs bound to REAL index blob ids (written only after every input exists). */
function stageRound(dir: string, recOver: { [k: string]: unknown } = {}, extra: string[] = [CATALOGUE_NEXT, PREREG_REL, IDS_B_REL]): void {
  writeRoundFiles(dir);
  // The record binds the NEW catalogue and the NEW group's ids file too: stage everything it names before reading the index blobs.
  stageAll(dir);
  writeFile(dir, RECORD_2_1, roundRecord(dir, recOver, extra));
}

/** stageRound for the tests that do not carry the run's g-b group: the round adds no case, so it adds no group either. */
function stageRound1(dir: string, recOver: { [k: string]: unknown } = {}): void {
  writeRoundFiles(dir);
  writeFile(dir, SET_REL, baseRegressionSet());
  // The base set names only g-a, so the round writes no g-b ids file at all.
  fs.rmSync(path.join(dir, IDS_B_REL), { force: true });
  stageAll(dir);
  writeFile(dir, RECORD_2_1, roundRecord(dir, recOver, [CATALOGUE_NEXT, PREREG_REL, IDS_B_REL]));
}

/**
 * A push peer: the honest round is LANDED (two commits behind it: the prereg alone, then the round), tip amended with `recOver`.
 * The inputs are computed from `git diff --name-only base HEAD` with the record OUT of the set first, so the record binds EVERY
 * bound path of the range (the new catalogue and the new group's ids file too) and never its own blob.
 */
async function seedLandedRound(dir: string, recOver: { [k: string]: unknown } = {}): Promise<string> {
  seedBase(dir);
  const base = commitBound(dir, 'base');
  writeFile(dir, PREREG_REL, preregPayload());
  commitBound(dir, 'prereg');
  // Every non-record file of the round first (nothing committed yet), committed so `base..HEAD` IS the round, then the bound record
  // (its inputs come from `git diff --name-only base HEAD`, the record is not in that set), amended onto the round commit.
  writeFile(dir, CATALOGUE_NEXT, { rows: [1] });
  writeFile(dir, SET_REL, roundRegressionSet('2'));
  writeFile(dir, IDS_B_REL, ROUND_IDS_B);
  commitBound(dir, 'round files');
  writeFile(dir, RECORD_2_1, roundRecord(dir, recOver, [], base));
  gitQ(dir, ['add', '-A']);
  gitQ(dir, ['commit', '-q', '--no-verify', '--amend', '-m', 'round']);
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
  baseRows: [{ group: 'g-a', id: 'g-a|1', status: 'MATCH', clause: '10.20.30.110' }],
  // Two MATCH rows: the prereg's expected_totals { MATCH: 2 } is exactly the run's totals (the ctx nulls baseRows, so no move check).
  curRows: [
    { group: 'g-a', id: 'g-a|1', status: 'MATCH', clause: '10.20.30.110' },
    { group: 'g-a', id: 'g-a|2', status: 'MATCH', clause: '10.20.30.113' },
  ],
  regenMismatch: [],
  groups: [{ id: 'g-a', introduced_in: 'baseline' }, { id: 'g-b', introduced_in: '2' }],
  floorsOk: true,
});

const deps = async (over: { [k: string]: unknown } = {}): Promise<Deps> => ({
  git: await loadGit(),
  computeRun: () => fakeRun(),
  readRegisterText: () => REGISTER_TEXT,
  ...over,
}) as Deps;

const noComputeRun = (): undefined => undefined;

// ---- tests -------------------------------------------------------------------------------------------------------------------------

describe('buildContext: commit mode', () => {
  it('reads the index: nameStatus, commits, the classes of the base policy, the new record and the bound catalogue', async () => {
    const dir = makeRepo();
    seedBase(dir);
    commitAll(dir, 'base');
    stageRound1(dir);
    stageAll(dir);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'commit', root: dir, base: '', target: '' }, await deps());

    const staged = fs.existsSync(path.join(dir, RECORD_2_1));
    expect(staged).toBe(true);
    const paths = ctx.nameStatus.map((r) => `${r.s} ${r.p}`);
    expect(paths).toContain(`A ${CATALOGUE_NEXT}`);
    expect(paths).toContain(`A ${RECORD_2_1}`);
    // stageRound1 rewrites the set with the BASE set again: byte-identical to HEAD, so git does not see it as modified.
    expect(paths).not.toContain(`M ${SET_REL}`);
    // stageRound1 writes the BASE set again and removes the g-b ids file: the round stages no g-b ids file at all.
    expect(paths).not.toContain(`A ${IDS_B_REL}`);
    expect(paths).not.toContain(`D ${IDS_B_REL}`);
    expect(ctx.commits).toEqual([ctx.nameStatus]);

    expect(ctx.classify(CATALOGUE_NEXT)).toBe('code');
    expect(ctx.classify(SET_REL)).toBe('generated');
    expect(ctx.incrementIds).toEqual(INCREMENT_IDS);
    expect(ctx.rulings.get('M-322')).toBe('RATIFIED');

    expect(ctx.latest).not.toBeNull();
    expect(ctx.latest?.path).toBe(RECORD_2_1);
    expect(ctx.latest?.rec.increment).toBe('2');
    expect(ctx.latest?.rec.round).toBe(1);
    expect(ctx.newRecords.map((r) => r.path)).toEqual([RECORD_2_1]);
    expect(ctx.firstRoundOfIncrement).toBe(true);

    expect(ctx.changedBound).toContain(CATALOGUE_NEXT);
    // stageRound1 stages the BASE set and removes the g-b ids file: g-b is never part of this round's bound set.
    expect(ctx.changedBound).not.toContain(IDS_B_REL);
    // g-a and its ids are untouched by the round: nothing bound changed there.
    expect(ctx.changedBound).not.toContain(SET_REL);
    expect(ctx.changedBound).not.toContain(IDS_REL);
    // A record is a GENERATED path, but a record cannot bind its own blob (it is written after the round is bound): it is never bound.
    expect(ctx.classify(RECORD_2_1)).toBe('generated');
    expect(ctx.changedBound).not.toContain(RECORD_2_1);
    expect(ctx.changedBound).toContain(PREREG_REL);

    // The round's own files are read at the index: prereg, bound blobs and the regression set agree with the record's inputs.
    expect(ctx.preregFile).toBe(PREREG_REL);
    expect(ctx.prereg?.increment).toBe('2');
    expect(ctx.prereg?.round).toBe(1);
    expect(ctx.preregHistory).toBeNull();
    expect(ctx.rowsTouched).toEqual([{ id: '10.20.30.110', increment: '2' }]);
    // stageRound1's round set is the BASE set (g-a only): the round introduces no case and no new group.
    expect(ctx.newCases).toEqual([]);
    expect(ctx.treeBlobs[CATALOGUE_NEXT]).toBe(ctx.latest?.rec.inputs[CATALOGUE_NEXT]);
    expect(ctx.regression.cur?.groups.map((g) => g.id)).toEqual(['g-a']);
    expect(ctx.regression.base?.groups.map((g) => g.id)).toEqual(['g-a']);
    expect(ctx.regression.cur?.groups[0]?.ids).toEqual([PASS_CASE]);
    expect(ctx.regression.base?.groups[0]?.ids).toEqual([PASS_CASE]);
    expect(ctx.baselineOwed).toEqual({});
    expect(ctx.run?.baseRows).toBeNull();
  });

  it('reads the base policy from the base copy, not the staged one', async () => {
    const dir = makeRepo();
    seedBase(dir);
    commitAll(dir, 'base');
    writeFile(dir, PROTECTED_REL, { layer23: ['docs/**'] });
    stageRound1(dir);
    stageAll(dir);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'commit', root: dir, base: '', target: '' }, await deps());
    expect(ctx.classify(CATALOGUE_NEXT)).toBe('code');
    // `docs/reports/loop-records/**` is GEN_GLOBS (loop-oracle.mjs): a record is a GENERATED path, not an unclassified one.
    expect(ctx.classify(RECORD_2_1)).toBe('generated');
    // The staged policy would make docs/** code; the base copy decides, so a doc path stays unclassified.
    expect(ctx.classify('docs/specs/01-pipeline/69a_mcbylaw_register.md')).toBeNull();
  });
});

describe('buildContext: push and ci mode', () => {
  it('push over two commits: commits per commit, base explicit, preregHistory present', async () => {
    const dir = makeRepo();
    const base = await seedLandedRound(dir);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'push', root: dir, base, target: '' }, await deps());

    expect(ctx.nameStatus.map((p) => p.p)).toEqual(expect.arrayContaining([PREREG_REL, RECORD_2_1, CATALOGUE_NEXT]));
    expect(ctx.commits.length).toBe(2);
    expect(ctx.commits[0]?.map((r) => r.p)).toEqual([PREREG_REL]);
    expect(ctx.commits[1]?.map((r) => r.p)).toEqual(expect.arrayContaining([RECORD_2_1, CATALOGUE_NEXT]));
    expect(ctx.newRecords.map((r) => r.path)).toEqual([RECORD_2_1]);
    expect(ctx.preregHistory).not.toBeNull();
    expect(ctx.preregHistory?.preregCommits.length).toBe(1);
    expect(ctx.preregHistory?.roundCommit?.sha).toBe(gitQ(dir, ['rev-parse', 'HEAD']));
    expect(ctx.preregHistory?.preregFile).toBe(PREREG_REL);
    expect(ctx.run?.baseRows).toBeNull();
  });

  it('ci: computeRun may answer null and the ctx still carries every fact', async () => {
    const dir = makeRepo();
    await seedLandedRound(dir);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'ci', root: dir, base: '', target: '' }, await deps({ computeRun: noComputeRun, readRegisterText: () => '' }));
    expect(ctx.run).toBeNull();
    expect(ctx.latest?.path).toBe(RECORD_2_1);
    expect(ctx.prereg?.round).toBe(1);
    expect(ctx.regression.cur).not.toBeNull();
  });

  it('an unresolvable base throws base_not_resolvable; a missing cur regression file throws data_missing', async () => {
    const dir = makeRepo();
    seedBase(dir);
    commitAll(dir, 'base');

    const { buildContext } = await loadContext();
    await expect(buildContext({ mode: 'push', root: dir, base: 'no-such-ref', target: '' }, await deps())).rejects.toThrow(/base_not_resolvable/);

    // No record at HEAD and the group's ids file is missing: the cur regression cannot load.
    fs.rmSync(path.join(dir, IDS_REL));
    commitAll(dir, 'drop ids');
    await expect(buildContext({ mode: 'ci', root: dir, base: '', target: '' }, await deps())).rejects.toThrow(/data_missing/);
  });

  it('derives base from the merge-base of the target when --base is empty', async () => {
    const dir = makeRepo();
    const base = await seedLandedRound(dir);
    // The target must sit BEHIND the round: a branch at HEAD would share HEAD as its merge base (an empty range).
    gitQ(dir, ['branch', 'main', base]);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'push', root: dir, base: '', target: 'main' }, await deps());
    expect(ctx.commits.length).toBe(2);
    expect(gitQ(dir, ['merge-base', 'HEAD', 'main'])).toBe(base);
  });

  it('greenHistory from accepted records at the base, prevCases from the previous round of the increment', async () => {
    const dir = makeRepo();
    seedBase(dir);
    // c0: the base. Increment 1's round 1 landed and was accepted (the green history at every later base).
    const c0 = commitAll(dir, 'base: increment 1 accepted');
    // c1: increment 2 round 1 — every bound file of the round first, then the record bound to their REAL blobs.
    writeRoundFiles(dir);
    stageAll(dir);
    writeFile(dir, RECORD_2_1, roundRecord(dir));
    const c1 = commitAll(dir, 'increment 2 round 1');
    expect(c0).not.toBe(c1);
    // c2 (HEAD): increment 2 round 2 — the prereg amended, then the record bound to the range c1..HEAD (records excepted).
    writeFile(dir, PREREG_REL, preregPayload({ round: 2 }));
    stageAll(dir);
    writeFile(dir, RECORD_2_2, roundRecord(dir, { round: 2 }, [], c1));
    commitAll(dir, 'increment 2 round 2');
    expect(gitQ(dir, ['rev-parse', 'HEAD^'])).toBe(c1);

    const { buildContext } = await loadContext();
    const ctx = await buildContext({ mode: 'push', root: dir, base: c1, target: '' }, await deps());
    expect(ctx.latest?.path).toBe(RECORD_2_2);
    // Round 1 of increment 2 is AT the base c1, so the round under judgement is not the first of its increment.
    expect(ctx.firstRoundOfIncrement).toBe(false);
    // The accepted records at the base: increments 1 and 2, distinct, in order.
    expect(ctx.greenHistory).toEqual(['1', '2']);
    // The previous round of increment 2 is round 1, and its record is at the base.
    expect(ctx.prevCases).toEqual({ [PASS_CASE]: { status: 'pass', got_sha: sha(11) }, [ACCEPTED_CASE]: { status: 'pass', got_sha: sha(12) } });
  });
});

describe('buildContext -> evaluateGate (end to end)', () => {
  it('the honest round has no violations; an empty reason is accept_without_reason', async () => {
    const { buildContext } = await loadContext();
    const evaluateGate = await evaluateGateOf();

    const honest = makeRepo();
    const base = await seedLandedRound(honest);
    const green = await buildContext({ mode: 'push', root: honest, base, target: '' }, await deps());
    expect(evaluateGate(green).violations).toEqual([]);

    const empty = makeRepo();
    const emptyBase = await seedLandedRound(empty, { reason: '' });
    const red = await buildContext({ mode: 'push', root: empty, base: emptyBase, target: '' }, await deps());
    expect(evaluateGate(red).violations).toContain('accept_without_reason');
  });
});
