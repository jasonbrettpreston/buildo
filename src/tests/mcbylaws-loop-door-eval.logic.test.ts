// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.4 (the composition in loop-gate-eval.mjs and the notes channel) and section 4 T4
// T4 (brief D4): a plain ctx through evaluateGate. Red first: written before evaluateGate reads `ctx.door`.
// The ctx is the honest green factory of mcbylaws-loop-gate-eval.logic.test.ts (one code path, a record, a run) plus one oracle path.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-eval.mjs'))) as unknown as { evaluateGate: (ctx: Ctx) => Verdict };
const O = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle.mjs'))) as unknown as { makeClassifier: (l: string[]) => (p: string) => string | null; DEFAULT_LAYER23: string[] };
const R = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs'))) as unknown as { bindRecord: (rec: unknown) => unknown };
const G = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-regression.mjs'))) as unknown as { idsSha: (ids: string[]) => string };

type Ctx = { [k: string]: unknown; door?: Door | undefined };
type Verdict = { violations: string[]; notes: string[] };
type Door = { [k: string]: unknown; records: DoorRecord[] };
type DoorRecord = { [k: string]: unknown; prereg: { expected_value_changes: unknown[] }; authority: { [k: string]: unknown }; history: unknown };

const CODE_PATH = 'scripts/seeds/bylaw/layer3-catalogue.json';
const CODE_BLOB = 'blob-code-l3';
const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const ORACLE_BLOB = 'blob-oracle';
const GEN_PIN = 'scripts/analysis/bylaw-validation/coa-expected/expected-coa.json';
const RECORD_FILE = 'docs/reports/loop-records/2/round-01.json';
const PREREG_FILE = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-1.json';
const PREREG_2 = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-68-2.json';
const PASS_CASE = 'c-pass';
const ACCEPTED_CASE = 'c-acc';
const sha = (n: number): string => String(n).padStart(64, '0');
const classify = O.makeClassifier([...O.DEFAULT_LAYER23]);
const RULINGS = new Map([['M-322', 'RULED']]);
const REGISTER = [
  '| **M-180** | **Chapter 900 exceptions** (A0399; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |',
  '| **M-901** | **b** (B0901; `2026-10-30-batch-x#CHAT-901.OK`) | RULED 2026-10-30 |',
  '| **M-902** | **c** (C0902; `2026-10-30-batch-x#CHAT-902.OK`) | RULED 2026-10-30 |',
  '| **M-903** | **d** (D0903; `2026-10-30-batch-x#CHAT-903.OK`) | RULED 2026-10-30 |',
  '| **M-904** | **e** (E0904; `2026-10-30-batch-x#CHAT-904.OK`) | RULED 2026-10-30 |',
].join('\n');
const DECISIONS = {
  '2026-10-30-batch-ai': { decisions: [{ id: 'CHAT-210.MB17-Q1R', question: 'q' }] },
  '2026-10-30-batch-x': { decisions: ['CHAT-901.OK', 'CHAT-902.OK', 'CHAT-903.OK', 'CHAT-904.OK'].map((id) => ({ id, question: 'q' })) },
};
const REVISION = { 'M-180': 'RATIFIED', 'M-901': 'RULED', 'M-902': 'RULED', 'M-903': 'RULED', 'M-904': 'RULED' };
const CASE_OF: { [id: string]: string } = { 'M-180': 'A0399', 'M-901': 'B0901', 'M-902': 'C0902', 'M-903': 'D0903', 'M-904': 'E0904' };
const REF_OF: { [id: string]: string } = { 'M-180': 'CHAT-210.MB17-Q1R', 'M-901': 'CHAT-901.OK', 'M-902': 'CHAT-902.OK', 'M-903': 'CHAT-903.OK', 'M-904': 'CHAT-904.OK' };

const rowOf = (id: string): string => REGISTER.split('\n').find((l) => l.includes(`**${id}**`)) as string;

/** n entries over the given rulings (round robin), with the diff that carries exactly those lines. */
function doorOf(n: number, rulings: string[] = ['M-180'], mode = 'commit'): Door {
  const entries = Array.from({ length: n }, (_, i) => {
    const id = rulings[i % rulings.length] as string;
    return { path: ORACLE, case: `${CASE_OF[id] as string} line ${i}`, old: `expect(v${i}).toBe(1.2);`, new: `expect(v${i}).toBe(0.6);`, ruling: id, ruling_ref: REF_OF[id] as string };
  });
  const diff = [`diff --git a/${ORACLE} b/${ORACLE}`, `--- a/${ORACLE}`, `+++ b/${ORACLE}`, `@@ -1,${n} +1,${n} @@`, ...entries.map((e) => `-${e.old}`), ...entries.map((e) => `+${e.new}`), ''].join('\n');
  const pushed: { [k: string]: { row: string; decision: unknown }[] } = {};
  for (const id of rulings) pushed[`${id}#${REF_OF[id] as string}`] = [{ row: rowOf(id), decision: { id: REF_OF[id], question: 'q' } }];
  return {
    mode,
    latestRecordPath: RECORD_FILE,
    movedPaths: [ORACLE],
    perCommitStatus: { [ORACLE]: ['M'] },
    net: { [ORACLE]: 'M' },
    classes: { [ORACLE]: 'oracle' },
    diffs: { [ORACLE]: diff },
    records: [
      {
        recordPath: RECORD_FILE,
        prereg: { expected_value_changes: entries },
        preregFile: PREREG_FILE,
        task: 'MB-68',
        source: 'trailer',
        history: { commits: [{ sha: 'p1', blob: 'b1', files: [PREREG_FILE] }], tipBlob: 'b1', work: [] },
        authority: { register: REGISTER, decisions: DECISIONS, pushed: mode === 'ci' ? null : pushed },
      },
    ],
    unjoined: [],
    rulingsAtRevision: REVISION,
  };
}

function goodRecord(): unknown {
  return R.bindRecord({
    schema: 'loop-record-v1',
    increment: '2',
    round: 1,
    decision: 'accept',
    reason: 'every in-scope case is green and no floor line moved down',
    accepted_findings: [],
    cases: [
      { id: PASS_CASE, status: 'pass', got_sha: sha(11) },
      { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12) },
    ],
    inputs: { [CODE_PATH]: CODE_BLOB, [ORACLE]: ORACLE_BLOB, 'data:g-a': 'hash-g-a', 'pin / g-a / scorer': '1.2.3' },
  });
}
const rows = (): { group: string; id: string; status: string; clause: string }[] => [
  { group: 'g-a', id: 'n-1|1', status: 'MATCH', clause: '10.20.40.70' },
  { group: 'g-a', id: 'n-2|1', status: 'MATCH', clause: '10.20.40.71' },
];
const regressionSet = (): unknown => {
  const ids = [PASS_CASE, ACCEPTED_CASE];
  return { groups: [{ id: 'g-a', introduced_in: 'baseline', ids, ids_sha256: G.idsSha(ids) }], pending: [], removals: [] };
};
const countFloors = (): unknown => ({ lines: { 'g-a cases': 2 }, rulings: [] });

/** The honest green ctx with an oracle edit beside the code (so checkOracleFirst fires) and, optionally, a door. */
function ctxOf(door?: Door, mode = 'commit', oracleStatus = 'M'): Ctx {
  const rec = goodRecord();
  const ns = [
    { s: 'M', p: CODE_PATH },
    { s: oracleStatus, p: ORACLE },
    { s: 'M', p: GEN_PIN },
    { s: 'A', p: RECORD_FILE },
  ];
  return {
    mode,
    nameStatus: ns,
    commits: [ns],
    classify,
    incrementIds: ['1', '2', '3', '4', '5', '6', '6b', '7', '8', '9', '10'],
    rulings: new Map(RULINGS),
    cardExists: () => false,
    latest: { path: RECORD_FILE, rec },
    newRecords: [{ path: RECORD_FILE, rec }],
    unparsable: [],
    firstRoundOfIncrement: true,
    greenHistory: ['1'],
    prereg: { schema: 'coa-round-prereg-v1', task: 'MB-68', round: 1, $comment: 'c', plan_ref: 'p', increment: '2', group: 'g-a', expected_moves: [], expected_totals: { MATCH: 2 } },
    preregFile: PREREG_FILE,
    preregHistory: {
      preregCommits: [{ sha: 'prereg-sha', files: [PREREG_FILE] }],
      roundCommit: { sha: 'round-sha' },
      isStrictAncestor: (a: string, b: string) => a === 'prereg-sha' && b === 'round-sha',
      preregFile: PREREG_FILE,
    },
    preregJoin: { task: 'MB-68', source: 'trailer', violations: [] },
    treeBlobs: { [CODE_PATH]: CODE_BLOB, [ORACLE]: ORACLE_BLOB },
    changedBound: oracleStatus === 'A' ? [CODE_PATH, ORACLE] : [CODE_PATH, ORACLE],
    regression: { base: regressionSet(), cur: regressionSet() },
    floors: { percentBase: countFloors(), percentCur: countFloors(), countBase: countFloors(), countCur: countFloors() },
    baselineOwed: { 'overall accuracy': 80 },
    prevCases: { [PASS_CASE]: { status: 'pass', got_sha: sha(11) }, [ACCEPTED_CASE]: { status: 'pass', got_sha: sha(12) } },
    newCases: [],
    rowsTouched: [{ id: 'n-1', increment: '2' }],
    run: {
      cases: [
        { id: PASS_CASE, status: 'pass', got_sha: sha(11), group: 'g-1' },
        { id: ACCEPTED_CASE, status: 'pass', got_sha: sha(12), group: 'g-1' },
      ],
      skipped: 0,
      canary: { id: PASS_CASE, observed: 'fail' },
      report: { violations: [], owed: [{ line: 'overall accuracy', measured: 90, floor: 95 }] },
      counts: { 'g-a cases': 2 },
      baseRows: rows(),
      curRows: rows(),
      regenMismatch: [],
      inputsFresh: { 'data:g-a': 'hash-g-a', 'pin / g-a / scorer': '1.2.3' },
      groups: [
        { id: 'g-a', introduced_in: 'baseline' },
        { id: 'g-1', introduced_in: '1' },
      ],
      floorsOk: true,
    },
    ...(door ? { door } : {}),
  };
}
const verdict = (c: Ctx): Verdict => M.evaluateGate(c);
const doorLines = (notes: string[]): string[] => notes.filter((n) => n.startsWith('oracle_door_'));

describe('PR-79f-1 (= R-MC) T4 #1, #6, #7: no door, an added oracle file, code only', () => {
  it('#1 REGRESSION: oracle M + code with no ctx.door is refused exactly as today', () => {
    expect(verdict(ctxOf()).violations).toContain('oracle_moved_with_code:1 oracle beside 1 code in range');
  });
  it('the green factory with the oracle path left out is green (the baseline the door rows build on)', () => {
    const c = ctxOf();
    c.nameStatus = (c.nameStatus as { s: string; p: string }[]).filter((r) => r.p !== ORACLE);
    c.commits = [c.nameStatus];
    expect(verdict(c).violations).toEqual([]);
  });
  it('#6 oracle A + code: green, ctx.door is never read', () => {
    const c = ctxOf(undefined, 'commit', 'A');
    Object.defineProperty(c, 'door', { get: () => { throw new Error('door read'); }, enumerable: true });
    expect(verdict(c).violations).toEqual([]);
  });
  it('#7 code only: green as today', () => {
    const c = ctxOf(doorOf(1));
    c.nameStatus = (c.nameStatus as { s: string; p: string }[]).filter((r) => r.p !== ORACLE);
    c.commits = [c.nameStatus];
    expect(verdict(c)).toEqual({ violations: [], notes: [] });
  });
});

describe('PR-79f-1 (= R-MC) T4 #2, #9, #11: a green door drops oracle_moved_with_code and prints the pass notes', () => {
  it('#2 commit mode: violations exactly [], one summary line and 11 entry lines', () => {
    const out = verdict(ctxOf(doorOf(11)));
    expect(out.violations).toEqual([]);
    expect(out.notes).toContain('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 11 entries');
    expect(out.notes.filter((n) => n.startsWith('oracle_door_entry:'))).toHaveLength(11);
  });
  it('#2 with 14 entries: 12 entry lines then oracle_door_entries_more:2', () => {
    const lines = doorLines(verdict(ctxOf(doorOf(14))).notes);
    expect(lines.filter((n) => n.startsWith('oracle_door_entry:'))).toHaveLength(12);
    expect(lines[lines.length - 1]).toBe('oracle_door_entries_more:2');
    expect(lines).toHaveLength(14);
  });
  it('#9 ci mode: violations [], the pass lines and the ci note', () => {
    const out = verdict(ctxOf(doorOf(1, ['M-180'], 'ci'), 'ci'));
    expect(out.violations).toEqual([]);
    expect(out.notes).toContain('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 1 entries');
    expect(out.notes).toContain('oracle_door_pushed_clause_not_evaluated:ci');
  });
  it('#11 the note budget: 3 rulings and 14 entries in ci', () => {
    const notes = verdict(ctxOf(doorOf(14, ['M-180', 'M-901', 'M-902'], 'ci'), 'ci')).notes;
    const lines = doorLines(notes);
    expect(lines.length).toBeLessThanOrEqual(14);
    expect(lines.slice(0, 3).every((l) => l.startsWith('oracle_door_passed:'))).toBe(true);
    expect(lines.slice(3, 12).every((l) => l.startsWith('oracle_door_entry:'))).toBe(true);
    expect(lines[12]).toBe('oracle_door_entries_more:5');
    expect(lines[13]).toBe('oracle_door_pushed_clause_not_evaluated:ci');
    expect(notes.indexOf(lines[13] as string)).toBe(13);
    expect(lines.every((l) => l.length <= 200)).toBe(true);
  });
  it('#11 the item-a shape: 1 ruling, 11 entries: 12 door lines, every entry printed', () => {
    const lines = doorLines(verdict(ctxOf(doorOf(11))).notes);
    expect(lines).toHaveLength(12);
    expect(lines.some((l) => l.startsWith('oracle_door_entries_more'))).toBe(false);
  });
  it('#11 a fifth ruling becomes oracle_door_rulings_more:<n>', () => {
    const lines = doorLines(verdict(ctxOf(doorOf(5, ['M-180', 'M-901', 'M-902', 'M-903', 'M-904']))).notes);
    expect(lines.filter((l) => l.startsWith('oracle_door_passed:'))).toHaveLength(4);
    expect(lines[4]).toBe('oracle_door_rulings_more:1');
  });
});

describe('PR-79f-1 (= R-MC) T4 #3, #4, #5, #10, #12: refusals keep oracle_moved_with_code', () => {
  it('#3 the out-of-scope and early returns keep their own notes', () => {
    const c = ctxOf(doorOf(1));
    c.nameStatus = [{ s: 'M', p: 'README.md' }];
    c.commits = [c.nameStatus];
    expect(verdict(c)).toEqual({ violations: [], notes: ['out of scope: no code, oracle or generated path changed'] });
  });
  it.each([
    ['an unlisted move', (d: Door) => { d.diffs = { [ORACLE]: `${(d.diffs as { [p: string]: string })[ORACLE] as string}@@ -9 +9 @@\n+return;\n` }; }, 'oracle_door_unlisted_move'],
    ['an edited prereg', (d: Door) => { (d.records[0] as DoorRecord).history = { commits: [{ sha: 'p1', blob: 'b1', files: [PREREG_FILE] }], tipBlob: 'b2', work: [] }; }, 'oracle_door_prereg_edited'],
    ['a missing prereg', (d: Door) => { d.records = []; d.unjoined = [{ recordPath: RECORD_FILE, violations: [] }]; }, 'oracle_door_prereg_missing'],
    ['a ruling not pushed', (d: Door) => { (d.records[0] as DoorRecord).authority.pushed = {}; }, 'oracle_door_ruling_not_pushed'],
    ['an empty list', (d: Door) => { (d.records[0] as DoorRecord).prereg.expected_value_changes = []; }, 'oracle_door_no_list'],
  ])('#4 %s: oracle_moved_with_code stays AND the door code is present', (_name, mutate, code) => {
    const d = doorOf(1);
    mutate(d);
    const out = verdict(ctxOf(d));
    expect(out.violations).toContain('oracle_moved_with_code:1 oracle beside 1 code in range');
    expect(out.violations.some((v) => v === code || v.startsWith(`${code}:`))).toBe(true);
    expect(doorLines(out.notes)).toEqual([]);
  });
  it('#5 the door does not excuse record_missing', () => {
    const c = ctxOf(doorOf(1));
    c.nameStatus = (c.nameStatus as { s: string; p: string }[]).filter((r) => r.p !== RECORD_FILE);
    c.commits = [c.nameStatus];
    c.latest = null;
    c.newRecords = [];
    expect(verdict(c).violations).toContain('record_missing');
  });
  it('#10 the status at the revision (adversary R1-2): RETIRED at the revision, RATIFIED at the parent', () => {
    const d = doorOf(1);
    d.rulingsAtRevision = { 'M-180': 'RETIRED' };
    expect(verdict(ctxOf(d)).violations).toContain('oracle_door_ruling_not_authority:M-180');
  });
  it('#12 two preregs with different first commits; the ruling RATIFIED only after the first prereg\'s parent (R-8)', () => {
    const d = doorOf(2);
    const [r1] = d.records as DoorRecord[];
    const e = (r1 as DoorRecord).prereg.expected_value_changes as { [k: string]: unknown }[];
    (r1 as DoorRecord).prereg.expected_value_changes = [e[0]];
    (r1 as DoorRecord).authority = { register: '| **M-1** | x | RULED 2026-01-01 |', decisions: DECISIONS, pushed: {} };
    const r2: DoorRecord = { ...(r1 as DoorRecord), recordPath: 'docs/reports/loop-records/2/round-02.json', preregFile: PREREG_2, prereg: { expected_value_changes: [e[1]] }, authority: { register: REGISTER, decisions: DECISIONS, pushed: (doorOf(1).records[0] as DoorRecord).authority.pushed }, history: { commits: [{ sha: 'p2', blob: 'b2', files: [PREREG_2] }], tipBlob: 'b2', work: [] } };
    d.records = [r1 as DoorRecord, r2];
    const out = verdict(ctxOf(d)).violations;
    expect(out).toContain('oracle_door_ruling_not_authority:M-180');
    expect(out.filter((v) => v.startsWith('oracle_door_ruling_not_authority')).length).toBe(1);
  });
});

describe('PR-79f-1 (= R-MC) T4 #8: purity', () => {
  it('evaluateGate does not change ctx.door', () => {
    const d = doorOf(3);
    const before = JSON.stringify(d);
    verdict(ctxOf(d));
    expect(JSON.stringify(d)).toBe(before);
  });
});
