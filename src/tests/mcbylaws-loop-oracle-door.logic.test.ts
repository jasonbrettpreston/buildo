// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md sections 2.1, 2.2, 2.4 and section 4 T1
// T1 (brief D1): the PURE door over a plain `ctx.door` object. Red first: written before loop-oracle-door.mjs exists.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const D = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle-door.mjs'))) as unknown as DoorModule;

type Decision = { id: string; question?: string; recommendation?: string; operator_quote?: string };
type Authority = {
  register: string | null;
  decisions: { [stem: string]: { decisions: Decision[] } | null };
  pushed: { [key: string]: { row: string; decision: Decision | null }[] } | null;
};
type History = { commits: { sha: string; blob: string; files: string[] }[]; tipBlob: string | null; work: { sha: string; paths: string[]; descends: boolean }[] };
type DoorRecord = {
  recordPath: string;
  prereg: { expected_value_changes?: unknown; [k: string]: unknown } | null;
  preregFile: string;
  task: string;
  source: string;
  history: History | null;
  authority: Authority;
};
type Door = {
  mode: string;
  latestRecordPath: string | null;
  movedPaths: string[];
  perCommitStatus: { [p: string]: string[] };
  net: { [p: string]: string };
  classes: { [p: string]: string | null };
  diffs: { [p: string]: string | null };
  records: DoorRecord[];
  unjoined: { recordPath: string; violations: string[] }[];
  rulingsAtRevision: { [id: string]: string };
};
type DoorModule = {
  movedLines: (diff: string) => { removed: string[]; added: string[]; headers: string[] };
  checkOracleDoor: (door: Door) => string[];
  doorPassNotes: (door: Door) => string[];
};

const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const ORACLE_B = 'src/tests/bylaw-door-b.logic.test.ts';
const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json';
const RECORD = 'docs/reports/loop-records/1/round-02.json';
const REGISTER = [
  '| **M-180** | **Chapter 900 exceptions** (A0399 is the worked lot; `2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |',
  '| **M-901** | **A ruled row** (`2026-10-30-batch-x#CHAT-901.OK`) | RULED 2026-10-30 |',
].join('\n');
const DECISIONS = {
  '2026-10-30-batch-ai': { decisions: [{ id: 'CHAT-210.MB17-Q1R', question: 'q', recommendation: 'r', operator_quote: 'y' }] },
  '2026-10-30-batch-x': { decisions: [{ id: 'CHAT-901.OK', question: 'q', recommendation: 'r', operator_quote: 'y Z1234' }] },
};
const OLD = "expect([p.value, p.winner]).toEqual([1.2, '10.80.40.70(3)#(3)(A)']);";
const NEW = "expect([p.value, p.winner]).toEqual([0.6, '900.6.10(23)#(23)[SSP](D)(i)']);";

const diffOf = (rel: string, minus: string[], plus: string[]): string =>
  [
    `diff --git a/${rel} b/${rel}`,
    'index 1111111..2222222 100644',
    `--- a/${rel}`,
    `+++ b/${rel}`,
    `@@ -3,${minus.length} +3,${plus.length} @@`,
    ...minus.map((l) => `-    ${l}`),
    ...plus.map((l) => `+    ${l}`),
    '',
  ].join('\n');

const entry = (over: { [k: string]: unknown } = {}): { [k: string]: unknown } => ({
  path: ORACLE,
  case: 'MB-18 / CHAT-210.MB17-Q1R: A0399 houseplex side yard',
  old: OLD,
  new: NEW,
  ruling: 'M-180',
  ruling_ref: 'CHAT-210.MB17-Q1R',
  ...over,
});

const pushedOk = (): Authority['pushed'] => ({
  'M-180#CHAT-210.MB17-Q1R': [{ row: REGISTER.split('\n')[0] as string, decision: { id: 'CHAT-210.MB17-Q1R', question: 'q' } }],
  'M-901#CHAT-901.OK': [{ row: REGISTER.split('\n')[1] as string, decision: { id: 'CHAT-901.OK', operator_quote: 'y Z1234' } }],
});

const record = (entries: unknown, over: Partial<DoorRecord> = {}): DoorRecord => ({
  recordPath: RECORD,
  prereg: { schema: 'coa-round-prereg-v1', task: 'MB-18', increment: '1', expected_moves: [], expected_value_changes: entries },
  preregFile: PREREG,
  task: 'MB-18',
  source: 'head-prereg',
  history: { commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }], tipBlob: 'b1', work: [] },
  authority: { register: REGISTER, decisions: DECISIONS, pushed: pushedOk() },
  ...over,
});

const door = (over: Partial<Door> = {}, entries: unknown = [entry()]): Door => ({
  mode: 'commit',
  latestRecordPath: RECORD,
  movedPaths: [ORACLE],
  perCommitStatus: { [ORACLE]: ['M'] },
  net: { [ORACLE]: 'M' },
  classes: { [ORACLE]: 'oracle', [ORACLE_B]: 'oracle', [PREREG]: 'oracle', 'fixtures/x.csv': 'oracle', 'fixtures/x.yaml': 'oracle' },
  diffs: { [ORACLE]: diffOf(ORACLE, [OLD], [NEW]) },
  records: [record(entries)],
  unjoined: [],
  rulingsAtRevision: { 'M-180': 'RATIFIED', 'M-901': 'RULED' },
  ...over,
});
const codes = (d: Door): string[] => D.checkOracleDoor(d);
const starts = (list: string[], prefix: string): string[] => list.filter((c) => c.startsWith(prefix));

describe('PR-79f-1 (= R-MC) T1 #1, #1b, #1c: movedLines, the stateful hunk parser', () => {
  it('headers, @@ and the no-newline marker are skipped; blank lines are dropped; a CR is trimmed', () => {
    const text = ['diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', '-  a();\r', '+  b();', '+   ', '\\ No newline at end of file', ''].join('\n');
    expect(D.movedLines(text)).toEqual({ removed: ['a();'], added: ['b();'], headers: [] });
  });
  it('content lines that look like headers inside a hunk are content (P-10)', () => {
    const text = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@', '--- expected 1.2', '+++x', '-@@ x', '+diff --git a b', ''].join('\n');
    const m = D.movedLines(text);
    expect(m.removed).toEqual(['-- expected 1.2', '@@ x']);
    expect(m.added).toEqual(['++x', 'diff --git a b']);
  });
  it('a later diff --git outside a hunk starts a new header', () => {
    const text = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', 'diff --git a/y b/y', '--- a/y', '+++ b/y', '@@ -1 +1 @@', '-c', '+d', ''].join('\n');
    expect(D.movedLines(text)).toEqual({ removed: ['a', 'c'], added: ['b', 'd'], headers: [] });
  });
  it('old mode / new mode / similarity / rename / Binary header lines are flagged, with no changed line (P-11)', () => {
    const text = ['diff --git a/x b/y', 'old mode 100644', 'new mode 100755', 'similarity index 100%', 'rename from x', 'rename to y', 'Binary files a/x and b/y differ', ''].join('\n');
    const m = D.movedLines(text);
    expect(m.removed).toEqual([]);
    expect(m.added).toEqual([]);
    expect(m.headers).toEqual(expect.arrayContaining(['old mode', 'new mode', 'similarity', 'rename', 'Binary']));
  });
});

describe('PR-79f-1 (= R-MC) T1 #2 to #7: the changed lines against the list (multiset, per path)', () => {
  it('#2 RED unlisted move: two expect lines changed, one listed', () => {
    const d = door({ diffs: { [ORACLE]: diffOf(ORACLE, [OLD, 'expect(a).toBe(1);'], [NEW, 'expect(a).toBe(2);']) } });
    const out = codes(d);
    expect(out).toContain(`oracle_door_unlisted_move:${ORACLE}:-:expect(a).toBe(1);`);
    expect(out).toContain(`oracle_door_unlisted_move:${ORACLE}:+:expect(a).toBe(2);`);
  });
  it('#3 RED extra listed move', () => {
    const out = codes(door({}, [entry(), entry({ old: 'expect(z).toBe(9);', new: null })]));
    expect(out).toContain(`oracle_door_extra_listed:${ORACLE}:old:expect(z).toBe(9);`);
  });
  it('#4 RED comment-out with only the expect line listed', () => {
    const d = door({ diffs: { [ORACLE]: diffOf(ORACLE, [OLD], [`// ${OLD}`, NEW]) } });
    expect(codes(d)).toContain(`oracle_door_unlisted_move:${ORACLE}:+:// ${OLD}`.slice(0, `oracle_door_unlisted_move:${ORACLE}:+:`.length + 80));
  });
  it('#5 RED an early return added in a pure-add hunk, nothing listed', () => {
    const d = door({ diffs: { [ORACLE]: `${diffOf(ORACLE, [OLD], [NEW])}@@ -9,0 +10,1 @@\n+    return;\n` } });
    expect(codes(d)).toContain(`oracle_door_unlisted_move:${ORACLE}:+:return;`);
  });
  it('#6 RED one-sided replace: only `new` listed', () => {
    expect(codes(door({}, [entry({ old: null })]))).toContain(`oracle_door_unlisted_move:${ORACLE}:-:${OLD.slice(0, 80)}`);
  });
  it('#6b the entry invariant (P-5): one replacement, one pure deletion, and the 11 removed + 10 added item-a shape', () => {
    expect(codes(door())).toEqual([]);
    const del = door({ diffs: { [ORACLE]: diffOf(ORACLE, ['expect(q).toBe(1);'], []) } }, [entry({ old: 'expect(q).toBe(1);', new: null })]);
    expect(codes(del)).toEqual([]);
    const minus = Array.from({ length: 11 }, (_, i) => `expect(v${i}).toBe(1.2);`);
    const plus = Array.from({ length: 10 }, (_, i) => `expect(v${i}).toBe(0.6);`);
    const list = minus.map((m, i) => entry({ old: m, new: plus[i] ?? null }));
    expect(codes(door({ diffs: { [ORACLE]: diffOf(ORACLE, minus, plus) } }, list))).toEqual([]);
  });
  it('#7 multiset: two identical removed lines need two entries', () => {
    const d2 = (n: number): Door =>
      door({ diffs: { [ORACLE]: diffOf(ORACLE, ['expect(r).toBe(1);', 'expect(r).toBe(1);'], []) } }, Array.from({ length: n }, () => entry({ old: 'expect(r).toBe(1);', new: null })));
    expect(codes(d2(1))).toContain(`oracle_door_unlisted_move:${ORACLE}:-:expect(r).toBe(1);`);
    expect(codes(d2(2))).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T1 #8, #16: ineligible paths (P-6, X-15)', () => {
  it.each([['R'], ['D'], ['C'], ['T']])('a per-commit %s makes the path ineligible, and no line comparison is made', (s) => {
    const out = codes(door({ perCommitStatus: { [ORACLE]: ['M', s] } }));
    expect(out).toContain(`oracle_door_path_ineligible:${s}:${ORACLE}`);
    expect(starts(out, 'oracle_door_unlisted_move')).toEqual([]);
  });
  it('D then re-added (net M, a per-commit D)', () => {
    expect(codes(door({ perCommitStatus: { [ORACLE]: ['D', 'A'] }, net: { [ORACLE]: 'M' } }))).toContain(`oracle_door_path_ineligible:D:${ORACLE}`);
  });
  it('a net status other than M, and an absent one (<missing>)', () => {
    expect(codes(door({ net: { [ORACLE]: 'T' }, perCommitStatus: { [ORACLE]: ['M'] } }))).toContain(`oracle_door_path_ineligible:T:${ORACLE}`);
    expect(codes(door({ net: {} }))).toContain(`oracle_door_path_ineligible:<missing>:${ORACLE}`);
  });
  it('a prereg path', () => {
    const out = codes(door({ movedPaths: [ORACLE, PREREG], perCommitStatus: { [ORACLE]: ['M'], [PREREG]: ['M'] }, net: { [ORACLE]: 'M', [PREREG]: 'M' } }));
    expect(out).toContain(`oracle_door_path_ineligible:M:${PREREG}`);
  });
  it('a path that is not class oracle', () => {
    const p = 'scripts/seeds/bylaw/x.json';
    expect(codes(door({ movedPaths: [ORACLE, p], perCommitStatus: { [ORACLE]: ['M'], [p]: ['M'] }, net: { [ORACLE]: 'M', [p]: 'M' } }))).toContain(
      `oracle_door_path_ineligible:class:${p}`,
    );
  });
  it.each([['fixtures/x.csv'], ['fixtures/x.yaml']])('#16 an extension outside ts/tsx/mjs/js/json: %s', (p) => {
    const out = codes(door({ movedPaths: [ORACLE, p], perCommitStatus: { [ORACLE]: ['M'], [p]: ['M'] }, net: { [ORACLE]: 'M', [p]: 'M' } }));
    expect(out).toContain(`oracle_door_path_ineligible:ext:${p}`);
  });
  it('a header line in the diff of an eligible path that also changes lines', () => {
    const text = `diff --git a/${ORACLE} b/${ORACLE}\nold mode 100644\nnew mode 100755\n--- a/${ORACLE}\n+++ b/${ORACLE}\n@@ -3 +3 @@\n-    ${OLD}\n+    ${NEW}\n`;
    expect(codes(door({ diffs: { [ORACLE]: text } }))).toContain(`oracle_door_path_ineligible:header:${ORACLE}`);
  });
  it('a mode-only diff (headers, no changed line) is an empty diff (P-11)', () => {
    const text = `diff --git a/${ORACLE} b/${ORACLE}\nold mode 100644\nnew mode 100755\n`;
    expect(codes(door({ diffs: { [ORACLE]: text } }))).toContain(`oracle_door_empty_diff:${ORACLE}`);
  });
});

describe('PR-79f-1 (= R-MC) T1 #9: malformed entries never throw', () => {
  const bad: [string, unknown][] = [
    ['case missing', entry({ case: undefined })],
    ['case empty', entry({ case: '' })],
    ['case blank', entry({ case: '  ' })],
    ['old a number', entry({ old: 1.2 })],
    ['both null', entry({ old: null, new: null })],
    ['no ruling', entry({ ruling: undefined })],
    ['ruling_ref missing', entry({ ruling_ref: undefined })],
    ['ruling_ref empty', entry({ ruling_ref: '' })],
    ['ruling_ref with a space', entry({ ruling_ref: 'a b' })],
    ['ruling x', entry({ ruling: 'x' })],
    ['case with a newline', entry({ case: 'A0399\nx' })],
    ['path with ESC', entry({ path: `${ORACLE}\u001b` })],
    ['case with DEL', entry({ case: 'A0399\u007f' })],
  ];
  it.each(bad)('%s -> oracle_door_entry_shape:<i>', (_name, e) => {
    const out = codes(door({}, [entry(), e]));
    expect(out).toContain('oracle_door_entry_shape:1');
  });
  it('a null entry, and a list that is an object', () => {
    expect(codes(door({}, [entry(), null]))).toContain('oracle_door_entry_shape:1');
    expect(starts(codes(door({}, { a: entry() })), 'oracle_door_entry_shape:')).not.toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T1 #10 to #13: listed paths, empty diffs, missing preregs, unreadable diffs', () => {
  it('#10 an entry that names a path that did not move', () => {
    expect(codes(door({}, [entry(), entry({ path: ORACLE_B })]))).toContain(`oracle_door_listed_path_unchanged:${ORACLE_B}`);
  });
  it('#11 a mode-only M (no changed line), with zero entries for it and with a listing', () => {
    const blank = `diff --git a/${ORACLE_B} b/${ORACLE_B}\n--- a/${ORACLE_B}\n+++ b/${ORACLE_B}\n@@ -1 +1 @@\n-  \n+\n`;
    const base = { movedPaths: [ORACLE, ORACLE_B], perCommitStatus: { [ORACLE]: ['M'], [ORACLE_B]: ['M'] }, net: { [ORACLE]: 'M', [ORACLE_B]: 'M' } };
    expect(codes(door({ ...base, diffs: { [ORACLE]: diffOf(ORACLE, [OLD], [NEW]), [ORACLE_B]: blank } }))).toContain(`oracle_door_empty_diff:${ORACLE_B}`);
    expect(codes(door({ ...base, diffs: { [ORACLE]: diffOf(ORACLE, [OLD], [NEW]), [ORACLE_B]: blank } }, [entry(), entry({ path: ORACLE_B })]))).toContain(
      `oracle_door_empty_diff:${ORACLE_B}`,
    );
  });
  it('#12 an empty list, and only other-shaped entries (the CoA shape)', () => {
    expect(codes(door({}, []))).toEqual(['oracle_door_no_list']);
    expect(codes(door({}, [{ clause: '10.20.30.110', from: 'ABSENT', to: 'MATCH' }]))).toEqual(['oracle_door_no_list']);
  });
  it('#12 no joined prereg returns before the diffs are touched', () => {
    const d = door({ records: [], unjoined: [{ recordPath: RECORD, violations: [] }], diffs: {} });
    expect(codes(d)).toEqual(['oracle_door_prereg_missing']);
  });
  it('#12 (h-plan item 4) a non-latest unjoined record names its join code; the latest is not repeated', () => {
    const d = door({
      unjoined: [
        { recordPath: 'docs/reports/loop-records/1/round-01.json', violations: ['prereg_task_unknown:no-trailer'] },
        { recordPath: RECORD, violations: ['prereg_task_unknown:commit'] },
      ],
    });
    expect(codes(d)).toEqual(['oracle_door_prereg_missing', 'oracle_door_join:docs/reports/loop-records/1/round-01.json:prereg_task_unknown:no-trailer']);
  });
  it('#12 (R-9) prereg null with empty violations: non-latest gives no_prereg_for_increment, the latest gives none', () => {
    const nonLatest = door({ unjoined: [{ recordPath: 'docs/reports/loop-records/1/round-01.json', violations: [] }] });
    expect(codes(nonLatest)).toEqual(['oracle_door_prereg_missing', 'oracle_door_join:docs/reports/loop-records/1/round-01.json:no_prereg_for_increment']);
    expect(codes(door({ records: [], unjoined: [{ recordPath: RECORD, violations: [] }] }))).toEqual(['oracle_door_prereg_missing']);
  });
  it('#12 no new record at all (records and unjoined both empty) is a missing prereg', () => {
    expect(codes(door({ records: [], unjoined: [] }))).toEqual(['oracle_door_prereg_missing']);
  });
  it('#13 an unreadable diff', () => {
    expect(codes(door({ diffs: { [ORACLE]: null } }))).toContain(`oracle_door_diff_unreadable:${ORACLE}`);
  });
});

describe('PR-79f-1 (= R-MC) T1 #14, #15: green twins and the per-path comparison', () => {
  it('#14 GREEN: one listed move; other-shaped entries beside door entries; a CRLF file', () => {
    expect(codes(door())).toEqual([]);
    expect(codes(door({}, [entry(), { clause: '10.20.30.110', from: 'ABSENT', to: 'MATCH' }]))).toEqual([]);
    const crlf = diffOf(ORACLE, [`${OLD}\r`], [`${NEW}\r`]);
    expect(codes(door({ diffs: { [ORACLE]: crlf } }))).toEqual([]);
  });
  it('#14 GREEN: the item-a-sized hunk', () => {
    const minus = Array.from({ length: 11 }, (_, i) => `expect(lot${i}.side).toEqual([1.2, '10.80.40.70(3)#(3)(A)']);`);
    const plus = Array.from({ length: 10 }, (_, i) => `expect(lot${i}.side).toEqual([0.6, '900.6.10(23)#(23)[SSP](D)(i)']);`);
    const list = minus.map((m, i) => entry({ old: m, new: plus[i] ?? null }));
    expect(codes(door({ diffs: { [ORACLE]: diffOf(ORACLE, minus, plus) } }, list))).toEqual([]);
  });
  it('#15 RED per path (X-9): an identical line in two files, one entry for file A only', () => {
    const line = 'expect(x).toBe(true);';
    const d = door(
      {
        movedPaths: [ORACLE, ORACLE_B],
        perCommitStatus: { [ORACLE]: ['M'], [ORACLE_B]: ['M'] },
        net: { [ORACLE]: 'M', [ORACLE_B]: 'M' },
        diffs: { [ORACLE]: diffOf(ORACLE, [line], []), [ORACLE_B]: diffOf(ORACLE_B, [line], []) },
      },
      [entry({ old: line, new: null })],
    );
    const out = codes(d);
    expect(out).toContain(`oracle_door_unlisted_move:${ORACLE_B}:-:${line}`);
    expect(starts(out, `oracle_door_unlisted_move:${ORACLE}:`)).toEqual([]);
  });
});

describe('PR-79f-1 (= R-MC) T1: the door also runs the authority and history checks per prereg', () => {
  it('an entry citing a PROPOSED id is refused, the green twin passes', () => {
    expect(codes(door({ rulingsAtRevision: { 'M-180': 'PROPOSED' } }))).toContain('oracle_door_ruling_not_authority:M-180');
  });
  it('an edited prereg is refused', () => {
    const r = record([entry()], { history: { commits: [{ sha: 'p1', blob: 'b1', files: [PREREG] }], tipBlob: 'b2', work: [] } });
    expect(codes(door({ records: [r] }))).toContain('oracle_door_prereg_edited');
  });
  it('one prereg joined by two records is judged once (deduplicated by preregFile)', () => {
    const r1 = record([entry()]);
    const r2 = { ...record([entry()]), recordPath: 'docs/reports/loop-records/1/round-03.json' };
    expect(codes(door({ records: [r1, r2] }))).toEqual([]);
  });
  it('purity: the door object is not changed', () => {
    const d = door();
    const before = JSON.stringify(d);
    codes(d);
    D.doorPassNotes(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('PR-79f-1 (= R-MC) T1: the pass notes (2.4)', () => {
  it('one summary line per ruling, then one line per entry', () => {
    const notes = D.doorPassNotes(door());
    expect(notes[0]).toBe('oracle_door_passed:M-180 #CHAT-210.MB17-Q1R 1 entries');
    // Each entry line is cut to 200 characters (2.4).
    expect(notes[1]).toBe(`oracle_door_entry:${ORACLE}: ${OLD} -> ${NEW}  [M-180 #CHAT-210.MB17-Q1R]`.slice(0, 200));
    const short = D.doorPassNotes(door({ diffs: { [ORACLE]: diffOf(ORACLE, ["a();"], ["b();"]) } }, [entry({ old: "a();", new: "b();" })]));
    expect(short[1]).toBe(`oracle_door_entry:${ORACLE}: a(); -> b();  [M-180 #CHAT-210.MB17-Q1R]`);
    expect(notes.length).toBe(2);
  });
  it('in ci the pushed clause note is added', () => {
    expect(D.doorPassNotes(door({ mode: 'ci' }))).toContain('oracle_door_pushed_clause_not_evaluated:ci');
  });
});
