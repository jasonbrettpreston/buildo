// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.2 (the ruling-row, case-token and history checks) and section 4 T2
// T2 (brief D2): the PURE authority and history checks of the door. Red first: written before loop-door-authority.mjs exists.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const A = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-door-authority.mjs'))) as unknown as AuthorityModule;

type Entry = { path: string; case: string; old: string | null; new: string | null; ruling: string; ruling_ref: string };
type Pushed = { [key: string]: { row: string; decision: Decision | null }[] };
type Decision = { id: string; question?: string; recommendation?: string; operator_quote?: string };
type DecisionLog = { decisions: Decision[] };
type Authority = { register: string | null; decisions: { [stem: string]: DecisionLog | null }; pushed: Pushed | null };
type HistoryCommit = { sha: string; blob: string; files: string[] };
type WorkCommit = { sha: string; paths: string[]; descends: boolean };
type History = { commits: HistoryCommit[]; tipBlob: string | null; work: WorkCommit[] };
type AuthorityModule = {
  rowOf: (register: string, id: string) => string | null;
  statusOf: (register: string, id: string) => string | null;
  refInRow: (row: string, ref: string) => boolean;
  stemOf: (row: string, ref: string) => string | null;
  caseTokens: (caseText: string, filePath: string) => string[];
  checkAuthority: (args: { entries: Entry[]; authority: Authority; rulingsAtRevision: { [id: string]: string }; mode: string }) => string[];
  checkHistory: (args: { history: History | null; preregFile: string; coveredPaths: string[] }) => string[];
};

const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json';
const M180_ROW =
  '| **M-180** | **Chapter 900 exceptions and houseplexes** (A0399 is the worked lot; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |';
const M180_NOTE = '| | *Dated note 2026-11-01 to M-180:* the side yard of the worked lot is 0.6 (`2026-11-01-batch-ao#CHAT-216.O-30`) | |';
const REGISTER = [
  '# register',
  '',
  '| Id | Rule | Status |',
  '|---|---|---|',
  M180_ROW,
  M180_NOTE,
  '| **M-900** | **A proposal** (`2026-10-30-batch-x#CHAT-900.P`) | PROPOSED |',
  '| **M-901** | **A ruled row** (`2026-10-30-batch-x#CHAT-901.OK`) | RULED 2026-10-30 |',
  '| | *Dated note to M-901:* see `2026-10-30-batch-x#CHAT-901.NOTE` | |',
  '| ~~M-902~~ | retired | RETIRED 2026-10-20 |',
  '| **M-903** | **odd status** (`2026-10-30-batch-x#CHAT-903.Q`) | SOMETHING |',
  '| **R-LI** | **Oracle, pin and floor** (`2026-10-30-batch-x#CHAT-1.LI`) | RULED 2026-10-25 |',
  '| **M-904** | **stemless** (`#CHAT-X`) | RULED 2026-10-30 |',
  '',
].join('\n');
const DECISIONS: { [stem: string]: DecisionLog | null } = {
  '2026-10-30-batch-ai': {
    decisions: [{ id: 'CHAT-210.MB17-Q1R', question: 'MB17-Q1R: exception building types', recommendation: 'M-180(1) applies', operator_quote: 'y' }],
  },
  '2026-10-30-batch-x': {
    decisions: [
      { id: 'CHAT-901.OK', question: 'ok?', recommendation: 'yes', operator_quote: 'approved for Z1234' },
      { id: 'CHAT-901.NOTE', question: 'note?', recommendation: 'yes', operator_quote: 'y' },
    ],
  },
};
const REV: { [id: string]: string } = { 'M-180': 'RATIFIED', 'M-900': 'PROPOSED', 'M-901': 'RULED', 'M-902': 'RETIRED', 'M-904': 'RULED' };

const entry = (over: Partial<Entry> = {}): Entry => ({
  path: ORACLE,
  case: 'MB-18 / CHAT-210.MB17-Q1R: A0399 houseplex side yard',
  old: 'expect(x).toBe(1.2);',
  new: 'expect(x).toBe(0.6);',
  ruling: 'M-180',
  ruling_ref: 'CHAT-210.MB17-Q1R',
  ...over,
});
const pushedFor = (entries: Entry[], register = REGISTER, decisions = DECISIONS): Pushed => {
  const out: Pushed = {};
  for (const e of entries) {
    const row = A.rowOf(register, e.ruling);
    const stem = row ? A.stemOf(row, e.ruling_ref) : null;
    const log = stem ? decisions[stem] ?? null : null;
    const decision = log ? log.decisions.find((d) => d.id === e.ruling_ref) ?? null : null;
    out[`${e.ruling}#${e.ruling_ref}`] = row ? [{ row, decision }] : [];
  }
  return out;
};
const authority = (entries: Entry[], over: Partial<Authority> = {}): Authority => ({
  register: REGISTER,
  decisions: DECISIONS,
  pushed: pushedFor(entries),
  ...over,
});
const check = (entries: Entry[], over: Partial<Authority> = {}, mode = 'commit', rev = REV): string[] =>
  A.checkAuthority({ entries, authority: authority(entries, over), rulingsAtRevision: rev, mode });

describe('PR-79f-1 (= R-MC) T2 #1: a ruling that is not RATIFIED or RULED is not an authority', () => {
  it.each([
    ['M-900', 'CHAT-900.P', 'PROPOSED'],
    ['M-999', 'CHAT-999.X', 'absent'],
    ['M-902', 'CHAT-902.X', 'RETIRED'],
    ['M-903', 'CHAT-903.Q', 'UNKNOWN status'],
    ['R-LI', 'CHAT-1.LI', 'an R- row'],
    ['m-18O', 'CHAT-1.X', 'malformed'],
  ])('%s (%s, %s) -> oracle_door_ruling_not_authority', (ruling, ref) => {
    const e = entry({ ruling, ruling_ref: ref });
    expect(check([e])).toContain(`oracle_door_ruling_not_authority:${ruling}`);
  });
});

describe('PR-79f-1 (= R-MC) T2 #2: green rulings', () => {
  it('M-180 with CHAT-210.MB17-Q1R: the row holds the ref and the log holds the decision', () => {
    expect(check([entry()])).toEqual([]);
  });
  it('M-901 with its own ref', () => {
    expect(check([entry({ ruling: 'M-901', ruling_ref: 'CHAT-901.OK', case: 'Z1234 case' })])).toEqual([]);
  });
  it('a ref that appears only in a following | | dated-note row of the same id (X-5)', () => {
    expect(A.rowOf(REGISTER, 'M-901')).toContain('CHAT-901.NOTE');
    expect(check([entry({ ruling: 'M-901', ruling_ref: 'CHAT-901.NOTE', case: 'Z1234 note case' })], {}, 'ci')).not.toContain(
      'oracle_door_ruling_ref_not_in_row:M-901',
    );
  });
});

describe('PR-79f-1 (= R-MC) T2 #3: the ref must be in the row as #<ref> followed by a non-token character', () => {
  it.each([
    ['RATIFIED'],
    ['2026-10-18'],
    ['operator'],
    ['CHAT-210'],
    ['CHAT-210.MB17-Q1'],
    ['CHAT-210.MB17-Q1RX'],
  ])('M-180 + %s -> oracle_door_ruling_ref_not_in_row', (ref) => {
    expect(check([entry({ ruling_ref: ref })], {}, 'ci')).toContain('oracle_door_ruling_ref_not_in_row:M-180');
  });
  it('a ref of another row (M-901 + CHAT-210.MB17-Q1R)', () => {
    expect(check([entry({ ruling: 'M-901' })], {}, 'ci')).toContain('oracle_door_ruling_ref_not_in_row:M-901');
  });
  it('a ref that appears only in the NEXT id\'s dated-note row (X-5)', () => {
    expect(check([entry({ ruling: 'M-900', ruling_ref: 'CHAT-901.NOTE' })], {}, 'ci', { ...REV, 'M-900': 'RULED' })).toContain(
      'oracle_door_ruling_not_authority:M-900',
    );
    const reg = REGISTER.replace('| PROPOSED |', '| RULED 2026-10-31 |');
    const e = entry({ ruling: 'M-900', ruling_ref: 'CHAT-901.NOTE' });
    expect(
      A.checkAuthority({ entries: [e], authority: { register: reg, decisions: DECISIONS, pushed: null }, rulingsAtRevision: { ...REV, 'M-900': 'RULED' }, mode: 'ci' }),
    ).toContain('oracle_door_ruling_ref_not_in_row:M-900');
  });
  it('a #CHAT-X with no stem before the # is _log_missing (F-2)', () => {
    const e = entry({ ruling: 'M-904', ruling_ref: 'CHAT-X', case: 'stemless M-904 X1234' });
    const out = check([e], {}, 'ci');
    expect(out).toContain('oracle_door_ruling_log_missing:M-904');
    expect(out).not.toContain('oracle_door_ruling_ref_not_in_row:M-904');
  });
});

describe('PR-79f-1 (= R-MC) T2 #4: the decisions log must hold the decision', () => {
  it('no decisions log for the stem', () => {
    expect(check([entry()], { decisions: {} }, 'ci')).toContain('oracle_door_ruling_log_missing:M-180');
  });
  it('a log without the id', () => {
    expect(check([entry()], { decisions: { '2026-10-30-batch-ai': { decisions: [] } } }, 'ci')).toContain('oracle_door_ruling_log_missing:M-180');
  });
  it('a log that could not be parsed (null)', () => {
    expect(check([entry()], { decisions: { '2026-10-30-batch-ai': null } }, 'ci')).toContain('oracle_door_ruling_log_missing:M-180');
  });
});

describe('PR-79f-1 (= R-MC) T2 #5: O-29 YES, the pushed-ref condition (commit and push only)', () => {
  it('no origin merge base shows the ruling -> oracle_door_ruling_not_pushed', () => {
    const e = entry();
    expect(check([e], { pushed: { 'M-180#CHAT-210.MB17-Q1R': [] } }, 'push')).toContain('oracle_door_ruling_not_pushed:M-180');
    expect(check([e], { pushed: {} }, 'commit')).toContain('oracle_door_ruling_not_pushed:M-180');
  });
  it('in ci the condition is not evaluated (pushed is null)', () => {
    expect(check([entry()], { pushed: null }, 'ci')).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T2 #6: an unreadable register', () => {
  it('register null -> oracle_door_register_unreadable', () => {
    expect(check([entry()], { register: null })).toContain('oracle_door_register_unreadable');
  });
});

const history = (over: Partial<History> = {}): History => ({
  commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }],
  tipBlob: 'b1',
  work: [{ sha: 'w1', paths: [ORACLE, 'scripts/seeds/bylaw/x.json'], descends: true }],
  ...over,
});
const hist = (h: History | null, covered = [ORACLE]): string[] => A.checkHistory({ history: h, preregFile: PREREG, coveredPaths: covered });

describe('PR-79f-1 (= R-MC) T2 #7: RED history inputs', () => {
  it('no commit touched the prereg', () => {
    expect(hist(history({ commits: [] }))).toEqual(['oracle_door_prereg_not_committed']);
    expect(hist(null)).toEqual(['oracle_door_prereg_not_committed']);
  });
  it('blobs differ across commits', () => {
    expect(hist(history({ commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }, { sha: 'p2', blob: 'b2', files: [PREREG] }], tipBlob: 'b2' }))).toContain(
      'oracle_door_prereg_edited',
    );
  });
  it('the tip blob differs from the first commit\'s', () => {
    expect(hist(history({ tipBlob: 'b9' }))).toContain('oracle_door_prereg_edited');
  });
  it('a deleted prereg (ABSENT blob) is edited', () => {
    expect(hist(history({ commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }, { sha: 'p2', blob: 'ABSENT', files: [PREREG] }], tipBlob: null }))).toContain(
      'oracle_door_prereg_edited',
    );
  });
  it('the first commit carries a second file', () => {
    expect(hist(history({ commits: [{ sha: 'p1', blob: 'b1', files: [PREREG, 'x.txt'] }] }))).toContain('oracle_door_prereg_not_alone');
  });
  it('a work commit that is not a descendant of the prereg commit', () => {
    expect(hist(history({ work: [{ sha: 'w0', paths: [ORACLE], descends: false }] }))).toContain('oracle_door_prereg_not_before');
  });
});

describe('PR-79f-1 (= R-MC) T2 #8: GREEN history', () => {
  it('one commit', () => {
    expect(hist(history())).toEqual([]);
  });
  it('two commits with the SAME blob (the clean merge shape)', () => {
    expect(hist(history({ commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }, { sha: 'm1', blob: 'b1', files: [PREREG, 'y.txt'] }] }))).toEqual([]);
  });
  it('every covering commit a descendant; the commit stage with no work commits', () => {
    expect(hist(history({ work: [] }))).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T2 #9: ordering is per covered path (P-14)', () => {
  it('a commit changing Y that predates prereg B is RED for B; a commit changing X after A is GREEN for A', () => {
    const work: WorkCommit[] = [
      { sha: 'wy', paths: ['src/tests/bylaw-y.logic.test.ts'], descends: false },
      { sha: 'wx', paths: [ORACLE], descends: true },
    ];
    expect(hist(history({ work: work.map((w) => ({ ...w, descends: w.sha === 'wx' })) }), [ORACLE])).toEqual([]);
    expect(hist(history({ work: work.map((w) => ({ ...w, descends: w.sha === 'wx' })) }), ['src/tests/bylaw-y.logic.test.ts'])).toEqual([
      'oracle_door_prereg_not_before',
    ]);
  });
});

describe('PR-79f-1 (= R-MC) T2 #10, #11: the case token (X-1)', () => {
  it('RED: a case that shares no token with the cited row or decision', () => {
    const e = entry({ case: 'MB-18: a houseplex side yard' });
    expect(check([e])).toContain(`oracle_door_case_not_in_ruling:M-180:${e.case}`);
  });
  it('GREEN: A0399 is in the real-shaped M-180 row but not in the decision entry', () => {
    const d = DECISIONS['2026-10-30-batch-ai'];
    expect(JSON.stringify(d)).not.toContain('A0399');
    expect(check([entry()])).toEqual([]);
    expect(check([entry()], {}, 'ci')).toEqual([]);
  });
  it('GREEN: a token only in the decision operator_quote', () => {
    expect(A.rowOf(REGISTER, 'M-901')).not.toContain('Z1234');
    expect(check([entry({ ruling: 'M-901', ruling_ref: 'CHAT-901.OK', case: 'case Z1234' })])).toEqual([]);
  });
  it('the path basename is a token too', () => {
    expect(A.caseTokens('bylaw-door: the pin', ORACLE)).toContain('bylaw-door');
    expect(A.caseTokens('A0399 and AB12345', ORACLE)).toEqual(expect.arrayContaining(['A0399', 'AB12345']));
  });
  it('a token must match on its own boundary (A0399 does not occur in A03991)', () => {
    const reg = REGISTER.replace('(A0399 is the worked lot;', '(A03991 is the worked lot;');
    const e = entry();
    expect(A.checkAuthority({ entries: [e], authority: { register: reg, decisions: DECISIONS, pushed: null }, rulingsAtRevision: REV, mode: 'ci' })).toContain(
      `oracle_door_case_not_in_ruling:M-180:${e.case}`,
    );
  });
});

describe('PR-79f-1 (= R-MC) T2 #12: the status is read again at the round\'s revision (X-6)', () => {
  it('RATIFIED at the parent, RETIRED at the tip -> oracle_door_ruling_not_authority', () => {
    expect(check([entry()], {}, 'commit', { ...REV, 'M-180': 'RETIRED' })).toContain('oracle_door_ruling_not_authority:M-180');
  });
  it('absent from the revision map -> not an authority', () => {
    const rev: { [id: string]: string } = { ...REV };
    delete rev['M-180'];
    expect(check([entry()], {}, 'commit', rev)).toContain('oracle_door_ruling_not_authority:M-180');
  });
});

describe('PR-79f-1 (= R-MC) T2: the row reader', () => {
  it('rowOf takes the id line and its | | dated-note rows only, up to the next id row', () => {
    const row = A.rowOf(REGISTER, 'M-180');
    expect(row).toContain('A0399');
    expect(row).toContain('CHAT-216.O-30');
    expect(row).not.toContain('M-900');
    expect(A.rowOf(REGISTER, 'M-999')).toBeNull();
  });
  it('statusOf reads the id line\'s last cell (universe.mjs form)', () => {
    expect(A.statusOf(REGISTER, 'M-180')).toBe('RATIFIED');
    expect(A.statusOf(REGISTER, 'M-901')).toBe('RULED');
    expect(A.statusOf(REGISTER, 'M-902')).toBe('RETIRED');
    expect(A.statusOf(REGISTER, 'M-999')).toBeNull();
  });
  it('stemOf is the maximal [A-Za-z0-9._-] run before the #', () => {
    expect(A.stemOf(M180_ROW, 'CHAT-210.MB17-Q1R')).toBe('2026-10-30-batch-ai');
    expect(A.stemOf('| **M-904** | (`#CHAT-X`) |', 'CHAT-X')).toBeNull();
    expect(A.refInRow(M180_ROW, 'CHAT-210.MB17-Q1R')).toBe(true);
    expect(A.refInRow(M180_ROW, 'CHAT-210.MB17-Q1')).toBe(false);
  });
});
