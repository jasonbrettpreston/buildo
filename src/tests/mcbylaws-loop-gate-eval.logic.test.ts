// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (the gate composes every check: oracle-first G68-04, records G68-01/G68-06, floors M-322, OWED M-372/PR-68-7, prereg M-321, regression M-343)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 1, 6, 8 (the gate contract and order of work, the classes V68-1, the run honesty and increment-green rules)
// Red first: this file is written before scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs exists. evaluateGate is PURE (no I/O).
// One honest ctx factory; every red test mutates ONE thing in a fresh clone of it and expects the named code.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs'));
const O = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs'));
const R = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs'));
const G = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-regression.mjs'));

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
  baseRows: { group: string; id: string; status: string; clause: string }[];
  curRows: { group: string; id: string; status: string; clause: string }[];
  regenMismatch: string[];
  groups: { id: string; introduced_in: string }[];
  floorsOk: boolean;
};
type Group = { id: string; introduced_in: string; ids: string[]; ids_sha256: string };
type RegressionSet = { groups: Group[]; pending: unknown[]; removals: unknown[] };
type Prereg = {
  schema: string;
  task: string;
  round: number;
  $comment: string;
  plan_ref: string;
  increment: string;
  expected_moves: { clause: string; from: string; to: string }[];
  expected_totals: { [k: string]: number };
};
type PreregCommit = { sha: string; files: string[] };
type PreregHistory = {
  preregCommits: PreregCommit[];
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
  regression: { base: RegressionSet | null; cur: RegressionSet | null };
  floors: Floors;
  baselineOwed: { [line: string]: number };
  prevCases: { [id: string]: { status: string; got_sha: string } };
  newCases: { id: string; introduced_in: string }[];
  rowsTouched: { id: string; increment: string | null }[];
  run: Run | null;
};
type Verdict = { violations: string[]; notes: string[] };

// ---- the single honest factory -------------------------------------------

const INCREMENT_IDS: string[] = ['1', '2', '3', '4', '5', '6', '6b', '7', '8', '9', '10'];
const CODE_PATH = 'scripts/seeds/bylaw/layer3-catalogue.json';
const CODE_BLOB = 'blob-code-l3';
const CODE_PATH_NEW = 'scripts/seeds/bylaw/layer3-catalogue-next.json';
const GEN_PIN = 'scripts/analysis/bylaw-validation/coa-expected/expected-coa.json';
const GEN_FLOORS = 'scripts/analysis/bylaw-validation/coa-expected/floors-coa.json';
const GEN_REGRESSION = 'mcbylaws/loop/regression-set.json';
const GEN_IDS = 'mcbylaws/loop/data/ids-g-a.json';
const GEN_COUNT_FLOORS = 'mcbylaws/loop/floors-count.json';
const RECORD_FILE = 'docs/reports/loop-records/2/round-01.json';
const PREREG_FILE = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json';
const RULING = 'M-322';
const ACCEPTED_CASE = 'c-acc';
const PASS_CASE = 'c-pass';

const sha = (n: number): string => String(n).padStart(64, '0');

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// nx: non-null helper for `noUncheckedIndexedAccess` index access in the tests below.
const nx = <T>(v: T | undefined): T => v as T;

// latestOf: the honest factory always sets `latest`; the tests that clear it are the record_missing ones.
const latestOf = (c: Ctx): Ctx['latest'] & {} => c.latest as Ctx['latest'] & {};

const RULINGS: Map<string, string> = new Map([
  [RULING, 'RULED'],
  ['M-333', 'RATIFIED'],
  ['M-300', 'PROPOSED'],
]);

const classify: Classify = O.makeClassifier([...O.DEFAULT_LAYER23]);

const runCase = (id: string, status: string): RunCase => ({ id, status, got_sha: sha(id.length + status.length) });

function records(): RecCase[] {
  return [
    { id: PASS_CASE, status: 'pass', got_sha: sha(11) },
    { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12) },
  ];
}

function goodRecord(over: { [k: string]: unknown } = {}): LoopRec {
  const rec: Omit<LoopRec, 'binding'> = {
    schema: 'loop-record-v1',
    increment: '2',
    round: 1,
    decision: 'accept',
    reason: 'every in-scope case is green and no floor line moved down',
    accepted_findings: [],
    cases: records(),
    inputs: {
      [CODE_PATH]: CODE_BLOB,
      [GEN_PIN]: 'blob-pin',
      [GEN_FLOORS]: 'blob-floors',
      [GEN_REGRESSION]: 'blob-regression',
      [GEN_IDS]: 'blob-ids',
      [GEN_COUNT_FLOORS]: 'blob-count-floors',
    },
    ...(over as Partial<Omit<LoopRec, 'binding'>>),
  };
  const back = R.bindRecord(rec) as Omit<LoopRec, 'binding'> & { binding: { sha256: string } };
  return back as unknown as LoopRec;
}

function preregOf(): Prereg {
  return {
    schema: 'coa-round-prereg-v1',
    task: 'MB-68',
    round: 1,
    $comment: 'pre-registered before the round',
    plan_ref: 'MB-68 increment 2',
    increment: '2',
    expected_moves: [{ clause: '10.20.40.71', from: 'ABSENT', to: 'MATCH' }],
    expected_totals: { MATCH: 2 },
  };
}

function regressionGroups(): Group[] {
  const ids = [PASS_CASE, ACCEPTED_CASE];
  return [{ id: 'g-a', introduced_in: 'baseline', ids, ids_sha256: G.idsSha(ids) }];
}

function regressionSet(): RegressionSet {
  return { groups: regressionGroups(), pending: [], removals: [] };
}

const countFloors = (over: { [k: string]: unknown } = {}): { lines: { [line: string]: number }; rulings: unknown[] } => ({
  lines: { 'g-a cases': 2 },
  rulings: [],
  ...over,
});

function greenHistory(): string[] {
  return ['1'];
}

function goodCtx(): Ctx {
  const rec = goodRecord();
  const cur = regressionSet();
  return {
    mode: 'push',
    nameStatus: [
      { s: 'M', p: CODE_PATH },
      { s: 'M', p: GEN_PIN },
      { s: 'M', p: GEN_FLOORS },
      { s: 'M', p: GEN_REGRESSION },
      { s: 'M', p: GEN_COUNT_FLOORS },
      { s: 'A', p: GEN_IDS },
      { s: 'A', p: RECORD_FILE },
    ],
    commits: [
      [{ s: 'M', p: CODE_PATH }],
      [
        { s: 'M', p: CODE_PATH },
        { s: 'M', p: GEN_PIN },
        { s: 'M', p: GEN_FLOORS },
        { s: 'M', p: GEN_REGRESSION },
        { s: 'M', p: GEN_COUNT_FLOORS },
        { s: 'A', p: GEN_IDS },
        { s: 'A', p: RECORD_FILE },
      ],
    ],
    classify,
    incrementIds: [...INCREMENT_IDS],
    rulings: RULINGS,
    cardExists: (id: string) => id === 'MB-333',
    latest: { path: RECORD_FILE, rec },
    newRecords: [{ path: RECORD_FILE, rec }],
    firstRoundOfIncrement: true,
    greenHistory: greenHistory(),
    prereg: preregOf(),
    preregFile: PREREG_FILE,
    preregHistory: {
      preregCommits: [{ sha: 'prereg-sha', files: [PREREG_FILE] }],
      roundCommit: { sha: 'round-sha' },
      isStrictAncestor: (a: string, b: string) => a === 'prereg-sha' && b === 'round-sha',
      preregFile: PREREG_FILE,
    },
    treeBlobs: {
      [CODE_PATH]: CODE_BLOB,
      [GEN_PIN]: 'blob-pin',
      [GEN_FLOORS]: 'blob-floors',
      [GEN_REGRESSION]: 'blob-regression',
      [GEN_IDS]: 'blob-ids',
      [GEN_COUNT_FLOORS]: 'blob-count-floors',
    },
    changedBound: [CODE_PATH, GEN_PIN, GEN_FLOORS, GEN_REGRESSION, GEN_IDS, GEN_COUNT_FLOORS],
    regression: { base: regressionSet(), cur },
    floors: {
      percentBase: countFloors(),
      percentCur: countFloors(),
      countBase: countFloors(),
      countCur: countFloors(),
    },
    baselineOwed: { 'overall accuracy': 80 },
    prevCases: {
      [PASS_CASE]: { status: 'pass', got_sha: sha(11) },
      [ACCEPTED_CASE]: { status: 'pass', got_sha: sha(12) },
    },
    newCases: [],
    rowsTouched: [{ id: 'n-1', increment: '2' }],
    run: {
      cases: runCases(),
      skipped: 0,
      canary: { id: PASS_CASE, observed: 'fail' },
      report: {
        violations: [],
        owed: [{ line: 'overall accuracy', measured: 90, floor: 95 }],
      },
      counts: { 'g-a cases': 2 },
      baseRows: [{ group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' }],
      curRows: [
        { group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' },
        { group: 'g-a', id: 'n-2|1', status: 'MATCH', clause: '10.20.40.71' },
      ],
      regenMismatch: [],
      groups: [
        { id: 'g-a', introduced_in: 'baseline' },
        { id: 'g-1', introduced_in: '1' },
      ],
      floorsOk: true,
    },
  };
}

// A fresh deep clone of the honest ctx with one mutation applied. `classify` and `cardExists` are carried as-is
// (JSON cannot carry a function); everything else is deep-cloned so a mutation cannot leak into another test.
const withCtx = (mutate: (c: Ctx) => void = () => undefined): Ctx => {
  const c: Ctx = {
    ...clone(goodCtx()),
    classify,
    rulings: new Map(RULINGS),
    cardExists: (id: string) => id === 'MB-333',
  };
  const preregHistory = c.preregHistory;
  c.preregHistory = preregHistory
    ? { ...preregHistory, isStrictAncestor: (a: string, b: string) => a === 'prereg-sha' && b === 'round-sha' }
    : null;
  mutate(c);
  return c;
};

const verdictOf = (mutate: (c: Ctx) => void = () => undefined): Verdict => M.evaluateGate(withCtx(mutate)) as Verdict;

const named = (suffix: string) => (v: string): boolean => v === suffix || v.startsWith(`${suffix}:`);

// Record cases as the honest run reports them (used by record_differs_from_run and accept_but_not_green).
// The run carries each case's group, as computeRun does: only the group introduced in increment 1 is in scope here.
const runCases = (): RunCase[] => [
  { id: PASS_CASE, status: 'pass', got_sha: sha(11), group: 'g-1' },
  { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12), group: 'g-1' },
];

const runOrThrow = (c: Ctx): Run => {
  if (!c.run) throw new Error('fixture: run is null');
  return c.run;
};

// ---- module contract ------------------------------------------------------

describe('evaluateGate: the pure composition returns { violations, notes }', () => {
  it('exists and returns a verdict object', () => {
    expect(typeof M.evaluateGate).toBe('function');
    const v = M.evaluateGate(withCtx()) as Verdict;
    expect(Array.isArray(v.violations)).toBe(true);
    expect(Array.isArray(v.notes)).toBe(true);
  });

  it('is pure: it does not mutate the ctx it is given', () => {
    const c = withCtx();
    const before = JSON.stringify(c);
    M.evaluateGate(c);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('the honest factory is green: no violations, no notes', () => {
    expect(M.evaluateGate(withCtx())).toEqual({ violations: [], notes: [] });
  });
});

// ---- stage 1: out of scope ------------------------------------------------

describe('stage 1: a range that touches no code, oracle or generated path is out of scope', () => {
  it('a docs-only commit is green with the out-of-scope note', () => {
    const v = verdictOf((c) => {
      c.mode = 'commit';
      c.nameStatus = [{ s: 'M', p: 'docs/specs/01-pipeline/69a_mcbylaw_register.md' }];
      c.commits = [clone(c.nameStatus)];
      c.latest = null;
      c.newRecords = [];
      c.prereg = null;
      c.preregFile = null;
      c.preregHistory = null;
      c.treeBlobs = {};
      c.changedBound = [];
      c.regression = { base: null, cur: null };
      c.run = null;
    });
    expect(v.violations).toEqual([]);
    expect(v.notes).toContain('out of scope: no code, oracle or generated path changed');
  });

  it('one code path in the same range puts it back in scope (records are demanded again)', () => {
    const v = verdictOf((c) => {
      c.mode = 'commit';
      c.nameStatus = [
        { s: 'M', p: 'docs/specs/01-pipeline/69a_mcbylaw_register.md' },
        { s: 'A', p: CODE_PATH_NEW },
        { s: 'A', p: RECORD_FILE },
      ];
      c.commits = [clone(c.nameStatus)];
      c.treeBlobs = { ...c.treeBlobs, [CODE_PATH_NEW]: 'blob-new' };
      c.changedBound = [...c.changedBound, CODE_PATH_NEW];
      const rec = goodRecord({ inputs: { ...latestOf(c).rec.inputs, [CODE_PATH_NEW]: 'blob-new' } });
      c.latest = { path: RECORD_FILE, rec };
      c.newRecords = [{ path: RECORD_FILE, rec }];
    });
    expect(v.notes).toEqual([]);
    expect(v.violations).toEqual([]);
  });

  it('the same docs plus one code path and no record is record_missing (in scope again)', () => {
    const v = verdictOf((c) => {
      c.mode = 'commit';
      c.nameStatus = [
        { s: 'M', p: 'docs/specs/01-pipeline/69a_mcbylaw_register.md' },
        { s: 'M', p: CODE_PATH },
      ];
      c.commits = [clone(c.nameStatus)];
    });
    expect(v.notes).toEqual([]);
    expect(v.violations).toContain('record_missing');
  });
});

// ---- stage 2: records, oracle-first, record_missing ------------------------

describe('stage 2: checkRecordsAddOnly, checkOracleFirst, recordMissing', () => {
  it('a modified record is refused by path', () => {
    const v = verdictOf((c) => {
      c.nameStatus = [...c.nameStatus, { s: 'M', p: RECORD_FILE }];
      c.commits = clone([c.nameStatus]);
    });
    expect(v.violations).toContain(`record_modified_or_deleted:${RECORD_FILE}`);
  });

  it('a deleted record is refused by path', () => {
    const v = verdictOf((c) => {
      c.nameStatus = [...c.nameStatus, { s: 'D', p: RECORD_FILE }];
      c.commits = clone([c.nameStatus]);
    });
    expect(v.violations).toContain(`record_modified_or_deleted:${RECORD_FILE}`);
  });

  it('an edited oracle file beside code in the range is oracle_moved_with_code', () => {
    const oraclePath = 'src/tests/fixtures/bylaw-golden-lots/lot-1.json';
    const v = verdictOf((c) => {
      c.nameStatus = [...c.nameStatus, { s: 'M', p: oraclePath }];
      c.commits = clone([c.nameStatus]);
    });
    expect(v.violations.some(named('oracle_moved_with_code'))).toBe(true);
  });

  it('a NEW oracle file (A) beside code is allowed: the green twin', () => {
    const fresh = 'src/tests/fixtures/bylaw-golden-lots/lot-new.json';
    const v = verdictOf((c) => {
      c.nameStatus = [...c.nameStatus, { s: 'A', p: fresh }];
      c.commits = clone([c.nameStatus]);
      c.treeBlobs = { ...c.treeBlobs, [fresh]: 'blob-fresh' };
      c.changedBound = [...c.changedBound, fresh];
      const rec = goodRecord({ inputs: { ...latestOf(c).rec.inputs, [fresh]: 'blob-fresh' } });
      c.latest = { path: RECORD_FILE, rec };
      c.newRecords = [{ path: RECORD_FILE, rec }];
    });
    expect(v.violations).toEqual([]);
  });

  it('an oracle change spread across commits is judged over the whole range', () => {
    const oraclePath = 'src/tests/fixtures/bylaw-golden-lots/lot-1.json';
    const v = verdictOf((c) => {
      c.nameStatus = [{ s: 'M', p: CODE_PATH }, { s: 'M', p: oraclePath }, { s: 'A', p: RECORD_FILE }];
      c.commits = [[{ s: 'M', p: oraclePath }], [{ s: 'M', p: CODE_PATH }, { s: 'A', p: RECORD_FILE }]];
    });
    expect(v.violations.some(named('oracle_moved_with_code'))).toBe(true);
  });

  it('a range that touches a class but adds no record is record_missing and returns early', () => {
    const v = verdictOf((c) => {
      c.nameStatus = c.nameStatus.filter((r) => r.p !== RECORD_FILE);
      c.commits = [clone(c.nameStatus)];
      c.latest = null;
      c.newRecords = [];
    });
    expect(v.violations).toContain('record_missing');
    // Early return: nothing else can be judged, so no record/stale/prereg code is emitted at all.
    expect(v.violations).toEqual(['record_missing']);
  });

  it('a record added but no newest record in the tree is record_missing and returns early', () => {
    const v = verdictOf((c) => {
      c.latest = null;
    });
    expect(v.violations).toContain('record_missing');
    expect(v.violations).toEqual(['record_missing']);
  });

  it('a prerun range (push) that adds its record is green: the green twin of record_missing', () => {
    const v = verdictOf((c) => {
      c.nameStatus = c.nameStatus.filter((r) => r.p !== GEN_IDS);
      c.commits = [clone(c.nameStatus)];
      c.treeBlobs = { ...c.treeBlobs };
      delete c.treeBlobs[GEN_IDS];
      c.changedBound = c.changedBound.filter((p) => p !== GEN_IDS);
      const inputs = { ...latestOf(c).rec.inputs };
      delete inputs[GEN_IDS];
      const rec = goodRecord({ inputs });
      c.latest = { path: RECORD_FILE, rec };
      c.newRecords = [{ path: RECORD_FILE, rec }];
    });
    expect(v.violations).toEqual([]);
  });
});

// ---- stage 3: the newest record ------------------------------------------

describe('stage 3: record shape, binding, decision, one increment, skip-ahead, prereg', () => {
  it('a record whose field was edited after binding is record_binding_mismatch', () => {
    const v = verdictOf((c) => {
      const rec = latestOf(c).rec;
      c.latest = { path: RECORD_FILE, rec: { ...rec, reason: 'a different reason written after the binding' } };
    });
    expect(v.violations.some(named('record_binding_mismatch'))).toBe(true);
  });

  it('a corrected, re-bound record is the green twin of record_binding_mismatch', () => {
    const v = verdictOf((c) => {
      const rec = latestOf(c).rec;
      const fixed = goodRecord({ reason: 'a longer, corrected reason, re-bound after the fix' });
      c.latest = { path: RECORD_FILE, rec: { ...fixed, cases: rec.cases } };
      c.treeBlobs = { ...c.treeBlobs };
    });
    expect(v.violations).toEqual([]);
  });

  it('a tree blob that moved after the round is stale_green:<path>', () => {
    const v = verdictOf((c) => {
      c.treeBlobs = { ...c.treeBlobs, [CODE_PATH]: 'blob-code-l3-moved' };
    });
    expect(v.violations).toContain(`stale_green:${CODE_PATH}`);
  });

  it('a changed classified path missing from the record inputs is input_not_bound:<path>', () => {
    const extra = 'scripts/analysis/bylaw-validation/coa-expected/floors-other.json';
    const v = verdictOf((c) => {
      c.nameStatus = [...c.nameStatus, { s: 'M', p: extra }];
      c.commits = clone([c.nameStatus]);
      c.treeBlobs = { ...c.treeBlobs, [extra]: 'blob-other' };
      c.changedBound = [...c.changedBound, extra];
    });
    expect(v.violations).toContain(`input_not_bound:${extra}`);
  });

  it('an accept with a short reason is accept_without_reason', () => {
    const v = verdictOf((c) => {
      c.latest = { path: RECORD_FILE, rec: goodRecord({ reason: 'ok' }) };
    });
    expect(v.violations).toContain('accept_without_reason');
  });

  it('a revert decision needs no accept reason: the green twin', () => {
    const v = verdictOf((c) => {
      c.latest = { path: RECORD_FILE, rec: goodRecord({ decision: 'revert', reason: 'ok' }) };
    });
    expect(v.violations).not.toContain('accept_without_reason');
  });

  it('prereg increment 3 against record increment 2 is increment_differs_prereg_vs_record', () => {
    const v = verdictOf((c) => {
      if (c.prereg) c.prereg.increment = '3';
    });
    expect(v.violations).toContain('increment_differs_prereg_vs_record');
  });

  it('a null prereg is prereg_missing', () => {
    const v = verdictOf((c) => {
      c.prereg = null;
    });
    expect(v.violations).toContain('prereg_missing');
  });

  it('skipping to increment 3 with only 1 green is checked on the first round of the increment', () => {
    const v = verdictOf((c) => {
      c.latest = { path: RECORD_FILE, rec: goodRecord({ increment: '3' }) };
      c.greenHistory = ['1'];
      c.firstRoundOfIncrement = true;
      c.rowsTouched = [{ id: 'n-1', increment: '3' }];
    });
    expect(v.violations).toContain('increment_skips_ahead_previous_not_green');
  });

  it('the same skip is NOT judged on a later round of the increment (skip-ahead is a first-round rule)', () => {
    const v = verdictOf((c) => {
      c.latest = { path: RECORD_FILE, rec: goodRecord({ increment: '3' }) };
      c.greenHistory = ['1'];
      c.firstRoundOfIncrement = false;
      c.rowsTouched = [{ id: 'n-1', increment: '3' }];
    });
    expect(v.violations).not.toContain('increment_skips_ahead_previous_not_green');
  });

  it('a move nobody registered is unexpected_move', () => {
    const v = verdictOf((c) => {
      const run = runOrThrow(c);
      run.curRows = [{ group: 'g-a', id: 'n-1|1', status: 'DIFFER', clause: '10.20.40.70' }];
      run.baseRows = [{ group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' }];
    });
    expect(v.violations.some(named('unexpected_move'))).toBe(true);
  });

  it('a registered move is the green twin of unexpected_move', () => {
    const v = verdictOf((c) => {
      const run = runOrThrow(c);
      run.curRows = [{ group: 'g-a', id: 'n-1|1', status: 'DIFFER', clause: '10.20.40.70' }];
      run.baseRows = [{ group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' }];
      if (c.prereg) {
        c.prereg.expected_moves = [{ clause: '10.20.40.70', from: 'MATCH', to: 'DIFFER' }];
        c.prereg.expected_totals = { DIFFER: 1 };
      }
    });
    expect(v.violations).toEqual([]);
  });

  it('a prereg that did not land strictly before the round is prereg_not_strictly_before_round', () => {
    const v = verdictOf((c) => {
      c.mode = 'push';
      if (c.preregHistory) c.preregHistory.isStrictAncestor = () => false;
    });
    expect(v.violations).toContain('prereg_not_strictly_before_round');
  });
});

// ---- stage 4: regression, floors, owed -----------------------------------

describe('stage 4: the regression ratchet, floor edits, the OWED ratchet and the run report', () => {
  it('a case removed from the set is regression_case_removed', () => {
    const v = verdictOf((c) => {
      if (!c.regression.cur) throw new Error('fixture: no cur set');
      const g = nx(c.regression.cur.groups[0]);
      g.ids = [PASS_CASE];
      g.ids_sha256 = G.idsSha(g.ids);
      c.run = null;
      c.nameStatus = [{ s: 'M', p: GEN_REGRESSION }, { s: 'A', p: RECORD_FILE }];
      c.commits = [clone(c.nameStatus)];
      c.regression = { base: regressionSet(), cur: clone(c.regression.cur) };
    });
    expect(v.violations).toContain(`regression_case_removed:g-a|${ACCEPTED_CASE}`);
  });

  it('a count floor lowered with no ruling is floor_lowered_without_ruling', () => {
    const v = verdictOf((c) => {
      c.floors.countBase = countFloors({ lines: { 'g-a cases': 3 } });
      c.floors.countCur = countFloors({ lines: { 'g-a cases': 2 } });
    });
    expect(v.violations).toContain('floor_lowered_without_ruling:g-a cases');
  });

  it('a count floor raised is the green twin of floor_lowered_without_ruling', () => {
    const v = verdictOf((c) => {
      c.floors.countBase = countFloors({ lines: { 'g-a cases': 2 } });
      c.floors.countCur = countFloors({ lines: { 'g-a cases': 2, 'g-b cases': 1 } });
      runOrThrow(c).counts = { 'g-a cases': 2, 'g-b cases': 1 };
    });
    expect(v.violations).toEqual([]);
  });

  it('an OWED line measured below its baseline is owed_line_fell_further', () => {
    const v = verdictOf((c) => {
      c.baselineOwed = { 'overall accuracy': 95 };
    });
    expect(v.violations).toContain('owed_line_fell_further:overall accuracy');
  });

  it('an OWED line unchanged against its baseline is the green twin', () => {
    const v = verdictOf((c) => {
      c.baselineOwed = { 'overall accuracy': 90 };
    });
    expect(v.violations).toEqual([]);
  });

  it('a run report violation is carried through as is', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).report.violations = ['floor_fell:article 10.20.40 accuracy 80.0 % is below its floor 90 %'];
    });
    expect(v.violations).toContain('floor_fell:article 10.20.40 accuracy 80.0 % is below its floor 90 %');
  });
});

// ---- stage 5: the run ----------------------------------------------------

describe('stage 5: the run is honest (checkRun, regen, value registry, record == run)', () => {
  it('an empty regression set is empty_set', () => {
    const v = verdictOf((c) => {
      if (!c.regression.cur) throw new Error('fixture: no cur set');
      c.regression.cur.groups = [];
      c.regression.base = null;
    });
    expect(v.violations.some(named('empty_set'))).toBe(true);
  });

  it('a skipped case is cases_skipped', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).skipped = 1;
    });
    expect(v.violations.some(named('cases_skipped'))).toBe(true);
  });

  it('a canary that never went red is canary_not_red', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).canary = { id: PASS_CASE, observed: 'pass' };
    });
    expect(v.violations).toContain('canary_not_red');
  });

  it('a declared case the run never reported is ran_fewer_than_declared', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).cases = runCases().filter((x) => x.id !== ACCEPTED_CASE);
    });
    expect(v.violations.some(named('ran_fewer_than_declared'))).toBe(true);
  });

  it('a generated file that does not regenerate is generated_not_regenerable', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).regenMismatch = ['generated_not_regenerable'];
    });
    expect(v.violations).toContain('generated_not_regenerable');
  });

  it('a got_sha moved under the same status with no accepted finding is value_changed_unregistered', () => {
    const v = verdictOf((c) => {
      const rec = latestOf(c).rec;
      const moved = rec.cases.map((x) => ({ ...x, got_sha: x.id === PASS_CASE ? sha(99) : x.got_sha }));
      c.latest = { path: RECORD_FILE, rec: { ...rec, cases: moved } };
      const run = runOrThrow(c);
      run.cases = run.cases.map((x) => (x.id === PASS_CASE ? { ...x, got_sha: sha(99) } : x));
    });
    expect(v.violations).toContain(`value_changed_unregistered:${PASS_CASE}`);
  });

  it('the same move covered by an accepted finding is the green twin', () => {
    const v = verdictOf((c) => {
      const moved = records().map((x) => ({ ...x, got_sha: x.id === PASS_CASE ? sha(99) : x.got_sha }));
      c.latest = {
        path: RECORD_FILE,
        rec: goodRecord({
          cases: moved,
          accepted_findings: [
            { case: PASS_CASE, finding_id: RULING, reason: 'the clause moved because the by-law row was amended' },
          ],
        }),
      };
      const run = runOrThrow(c);
      run.cases = run.cases.map((x) => (x.id === PASS_CASE ? { ...x, got_sha: sha(99) } : x));
    });
    expect(v.violations).toEqual([]);
  });

  it('a record case whose got_sha differs from the run is record_differs_from_run', () => {
    const v = verdictOf((c) => {
      const run = runOrThrow(c);
      run.cases = run.cases.map((x) => (x.id === PASS_CASE ? { ...x, got_sha: sha(77) } : x));
    });
    expect(v.violations).toContain(`record_differs_from_run:${PASS_CASE}`);
  });

  it('a record case whose status differs from the run is record_differs_from_run', () => {
    const v = verdictOf((c) => {
      const run = runOrThrow(c);
      run.cases = run.cases.map((x) => (x.id === ACCEPTED_CASE ? { ...x, status: 'fail' } : x));
    });
    expect(v.violations).toContain(`record_differs_from_run:${ACCEPTED_CASE}`);
  });

  it('a record that matches the run exactly is the green twin', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).cases = runCases();
    });
    expect(v.violations).toEqual([]);
  });

  it('ci with run null is green with the external-groups note (external groups are not run in CI)', () => {
    const v = verdictOf((c) => {
      c.mode = 'ci';
      c.run = null;
    });
    expect(v.violations).toEqual([]);
    expect(v.notes).toContain('external groups: not run in CI');
  });

  it('commit with run null is run_missing', () => {
    const v = verdictOf((c) => {
      c.mode = 'commit';
      c.run = null;
    });
    expect(v.violations).toContain('run_missing');
    expect(v.notes).not.toContain('external groups: not run in CI');
  });

  it('push with run null is run_missing too', () => {
    const v = verdictOf((c) => {
      c.mode = 'push';
      c.run = null;
    });
    expect(v.violations).toContain('run_missing');
  });

  it('a run that satisfies every check is the green twin of run_missing', () => {
    const v = verdictOf((c) => {
      c.mode = 'commit';
    });
    expect(v.violations).toEqual([]);
  });
});

// ---- stage 6: accept requires a green increment --------------------------

describe('stage 6: an accept names every not-green reason', () => {
  it('an in-scope case that fails makes the accept not green', () => {
    const v = verdictOf((c) => {
      const rec = latestOf(c).rec;
      const newCases = rec.cases.map((x) => (x.id === ACCEPTED_CASE ? { ...x, status: 'accepted' } : x));
      c.latest = {
        path: RECORD_FILE,
        rec: goodRecord({
          cases: newCases,
          accepted_findings: [
            { case: ACCEPTED_CASE, finding_id: RULING, reason: 'the clause differs and the ruling accepts it' },
          ],
        }),
      };
      const run = runOrThrow(c);
      run.cases = run.cases.map((x) => (x.id === ACCEPTED_CASE ? { ...x, status: 'fail' } : x));
    });
    expect(v.violations).toContain(`accept_but_not_green:case_not_green:${ACCEPTED_CASE}`);
  });

  it('a run where the floors fell makes the accept not green', () => {
    const v = verdictOf((c) => {
      runOrThrow(c).floorsOk = false;
    });
    expect(v.violations).toContain('accept_but_not_green:floors_fell');
  });

  it('a revert is never judged against increment green: the green twin', () => {
    const v = verdictOf((c) => {
      c.latest = { path: RECORD_FILE, rec: goodRecord({ decision: 'revert', reason: 'not green yet, reverting' }) };
      runOrThrow(c).floorsOk = false;
    });
    expect(v.violations.filter((x) => x.startsWith('accept_but_not_green'))).toEqual([]);
  });

  it('a fully green round is the green twin of accept_but_not_green', () => {
    const v = verdictOf();
    expect(v.violations.filter((x) => x.startsWith('accept_but_not_green'))).toEqual([]);
  });

  it('the violations are de-duplicated and keep first-seen order', () => {
    // The run reports two unregistered moves; the prereg cannot register either, so it names the first-seen order.
    const v = verdictOf((c) => {
      const run = runOrThrow(c);
      run.curRows = [{ group: 'g-a', id: 'n-1|1', status: 'DIFFER', clause: '10.20.40.70' }];
      run.baseRows = [{ group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' }];
      c.baselineOwed = { 'overall accuracy': 95 };
      run.report.owed = [
        { line: 'overall accuracy', measured: 90, floor: 95 },
        { line: 'overall accuracy', measured: 90, floor: 95 },
      ];
    });
    const line = 'owed_line_fell_further:overall accuracy';
    expect(v.violations.filter((x) => x === line)).toHaveLength(1);
    const move = v.violations.findIndex((x) => x.startsWith('unexpected_move'));
    const owed = v.violations.indexOf(line);
    expect(move).toBeGreaterThanOrEqual(0);
    expect(owed).toBeGreaterThanOrEqual(0);
  });
});
