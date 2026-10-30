// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-322 (floors only rise), M-360 (a test never asserts a red floor), M-330 (round 0 sets lines through the door with a ruling), M-372 (OWED), PR-68-7 (OWED lines cannot worsen), G68-02 (the ruling must resolve)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 4 (a floor fall blocks the commit; floors move only through the door)
// Red first: docs/reports/red-evidence/mb68/b3-floors-red.txt. Pure checks; coa-round.mjs is imported, never edited.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-floors.mjs'));

type Row = { notice: string; n: number; clause: string; clause_norm: string; class: string };
type PercentLine = { accuracy: number | null; answered: number | null };
type RulingEntry = { ruling: string; lines?: { line: string }[] };
type PercentFloors = {
  overall?: PercentLine;
  pooled?: PercentLine | null;
  articles?: Record<string, PercentLine>;
  rulings?: RulingEntry[];
};
type CountFloors = { schema: string; lines: Record<string, number>; rulings: RulingEntry[] };
type OwedItem = { line: string; measured: number; floor: number };

const row = (clause_norm: string, cls: string, notice = 'A1/26X', n = 1): Row => ({ notice, n, clause: clause_norm, clause_norm, class: cls });
const rows = (art: string, m: number, d: number, na = 0, ow = 0): Row[] => [
  ...Array.from({ length: m }, (_, i) => row(`${art}.10(1)`, 'MATCH', `M${art}`, i)), ...Array.from({ length: d }, (_, i) => row(`${art}.10(2)`, 'DIFFER', `D${art}`, i)),
  ...Array.from({ length: na }, (_, i) => row(`${art}.10(3)`, 'NO ANSWER', `N${art}`, i)), ...Array.from({ length: ow }, (_, i) => row(`${art}.10(4)`, 'OWED', `O${art}`, i)),
];

const percent = (over: PercentFloors = {}): PercentFloors => ({
  overall: { accuracy: 92, answered: 71 },
  pooled: { accuracy: 95, answered: 68 },
  articles: { '10.20.40': { accuracy: 91, answered: 78 } },
  rulings: [],
  ...over,
});
const count = (over: Partial<CountFloors> = {}): CountFloors => ({
  schema: 'loop-floors-v1',
  lines: { 'coa172 cases': 172, 'coa172 accuracy': 92 },
  rulings: [],
  ...over,
});
const rulings = (entries: [string, string][]): Map<string, string> => new Map(entries);

// Register rows that make a failing line OWED (exactly the form parseOwed expects: title, RULED, tasks, date).
// parseOwed's title grammar is `cumulative <a> <metric>` / `overall <metric>` / `pooled articles <metric>` (no "article " prefix), and it maps that back to the report's "article <a> <metric>" line name.
const owedTitle = (line: string): string => line.replace(/^article /, '');
const owedRow = (id: string, line: string): string =>
  `| **${id}** | **OWED to Phase 3: ${owedTitle(line)}.** Ratified by P2C-Q1. | M-322 | x | RULED 2026-10-29 (operator, P2C-Q1); OWED to Phase 3 (MB-21, MB-20) since 2026-10-29 |`;
const OWED_10540 = owedRow('M-372', 'article 10.5.40 accuracy');
const OWED_172 = owedRow('M-381', 'overall accuracy');
const OWED_172_ART = owedRow('M-382', 'article 10.20.40 accuracy');

describe('flattenFloors: every floor line as "<line>" -> n', () => {
  it('percent shapes: overall, pooled and per-article lines', () => {
    expect(M.flattenFloors(percent())).toEqual({
      'overall accuracy': 92,
      'overall answered': 71,
      'pooled articles accuracy': 95,
      'pooled articles answered': 68,
      'article 10.20.40 accuracy': 91,
      'article 10.20.40 answered': 78,
    });
  });
  it('a percent file with no pooled block, and a count file (lines copied)', () => {
    const f = percent({ pooled: null });
    expect(M.flattenFloors(f)).toEqual({
      'overall accuracy': 92,
      'overall answered': 71,
      'article 10.20.40 accuracy': 91,
      'article 10.20.40 answered': 78,
    });
    const c = M.flattenFloors(count());
    expect(c).toEqual({ 'coa172 cases': 172, 'coa172 accuracy': 92 });
    c['coa172 cases'] = 1;
    expect(count().lines['coa172 cases']).toBe(172); // a copy, not the file
  });
});

describe('checkFloorEdit: a floor fall blocks the commit unless a ruling names the line (M-322, M-330)', () => {
  const base = percent();
  it('a raise, an unchanged file, or no base at all is green', () => {
    expect(M.checkFloorEdit(base, percent({ overall: { accuracy: 93, answered: 71 } }), rulings([]))).toEqual([]);
    expect(M.checkFloorEdit(base, percent(), rulings([]))).toEqual([]);
    expect(M.checkFloorEdit(null, percent({ overall: { accuracy: 50, answered: 40 } }), rulings([]))).toEqual([]);
  });
  it('a lowered line and a deleted line are red', () => {
    expect(M.checkFloorEdit(base, percent({ overall: { accuracy: 90, answered: 71 } }), rulings([]))).toEqual(['floor_lowered_without_ruling:overall accuracy']);
    expect(M.checkFloorEdit(base, percent({ overall: { accuracy: 92, answered: 60 } }), rulings([]))).toEqual(['floor_lowered_without_ruling:overall answered']);
    expect(M.checkFloorEdit(base, percent({ pooled: null }), rulings([]))).toEqual(['floor_lowered_without_ruling:pooled articles accuracy', 'floor_lowered_without_ruling:pooled articles answered']);
  });
  it('a fall named by a RULED ruling is green for those lines only (M-322 -> RULED: the one door)', () => {
    const cur = percent({ overall: { accuracy: 90, answered: 71 } });
    const r = rulings([['M-322', 'RULED']]);
    const ok = percent({ overall: { accuracy: 90, answered: 71 }, rulings: [{ ruling: 'M-322', lines: [{ line: 'overall accuracy' }] }] });
    expect(M.checkFloorEdit(base, ok, r)).toEqual([]);
    // the ruling names the line but the history does not carry the entry: still a fall (M-330: through the door, with a ruling)
    expect(M.checkFloorEdit(base, cur, r)).toEqual(['floor_lowered_without_ruling:overall accuracy']);
    // the entry names overall accuracy only: a second lowered line is still red
    const both = percent({ overall: { accuracy: 90, answered: 60 }, rulings: [{ ruling: 'M-322', lines: [{ line: 'overall accuracy' }] }] });
    expect(M.checkFloorEdit(base, both, r)).toEqual(['floor_lowered_without_ruling:overall answered']);
  });
  it('a forged ruling excuses nothing: the added entry names overall accuracy but the ruling does not resolve (G68-02)', () => {
    const forged = percent({ overall: { accuracy: 50, answered: 71 }, rulings: [{ ruling: 'RULED-FAKE-999', lines: [{ line: 'overall accuracy' }] }] });
    const out = M.checkFloorEdit(base, forged, rulings([['M-322', 'RULED'], ['M-9', 'PROPOSED']]));
    expect(out).toContain('ruling_not_authority:RULED-FAKE-999');
    expect(out).toContain('floor_lowered_without_ruling:overall accuracy');
  });
  it('a ruling that is not RATIFIED or RULED is not authority', () => {
    const lowerWithProposed = percent({ overall: { accuracy: 90, answered: 71 }, rulings: [{ ruling: 'M-9', lines: [{ line: 'overall accuracy' }] }] });
    expect(M.checkFloorEdit(base, lowerWithProposed, rulings([['M-9', 'PROPOSED']]))).toContain('ruling_not_authority:M-9');
    const r = rulings([['M-9', 'RATIFIED']]);
    expect(M.checkFloorEdit(base, lowerWithProposed, r)).toEqual([]); // the green twin: RATIFIED is authority
  });
  it('a rulings history shorter than the base is red; a count floor fall needs its own ruling', () => {
    const b = percent({ rulings: [{ ruling: 'M-322', lines: [{ line: 'overall accuracy' }] }] });
    expect(M.checkFloorEdit(b, percent({ rulings: [] }), rulings([['M-322', 'RULED']]))).toEqual(['rulings_history_shortened']);
    expect(M.checkFloorEdit(count(), count({ lines: { 'coa172 cases': 150, 'coa172 accuracy': 92 } }), rulings([]))).toEqual(['floor_lowered_without_ruling:coa172 cases']);
  });
});

describe('checkPercentFloors: the coa-round report, with OWED kept out of the violations (M-372, M-360)', () => {
  const kinds = (list: string[]): string[] => list.map((x) => x.replace(/^floor_fell:/, '').replace(/\s-?\d+(?:\.\d+)? %? .*|\snot_measured$/, '').replace(/ (?:accuracy|answered)$/, ''));
  const f10540 = percent({ articles: { '10.5.40': { accuracy: 94, answered: 56 } }, pooled: null });
  const lows = [...rows('10.5.40', 4, 1, 4, 4)]; // accuracy 80 % < overall 92 and 10.5.40's 94; answered 50 % (9/18) < 71 and 56
  it('a line below its floor is floor_fell with the report message; the OWED line is returned, not a violation', () => {
    const r = M.checkPercentFloors(f10540, lows, OWED_10540);
    // every failing line the report prints (overall, then the article); the named article accuracy line is held out as OWED
    expect(r.violations).toEqual([
      'floor_fell:overall accuracy 80.0 % is below its floor 92 %',
      'floor_fell:overall answered 38.5 % is below its floor 71 %',
      'floor_fell:article 10.5.40 answered 38.5 % is below its floor 56 %',
    ]);
    expect(r.owed).toHaveLength(1);
    expect(r.owed[0].line).toBe('article 10.5.40 accuracy');
    expect(r.owed[0].measured).toBeCloseTo(80, 9);
    expect(r.owed[0].floor).toBe(94);
    expect(r.text).toMatch(/OWED \(not counted as PASS\)/);
  });
  it('the green twin: the same run with no owing row is red on the article line too; a run above every floor is green', () => {
    const strict = M.checkPercentFloors(f10540, lows, '');
    expect(strict.violations).toEqual([
      'floor_fell:overall accuracy 80.0 % is below its floor 92 %',
      'floor_fell:overall answered 38.5 % is below its floor 71 %',
      'floor_fell:article 10.5.40 accuracy 80.0 % is below its floor 94 %',
      'floor_fell:article 10.5.40 answered 38.5 % is below its floor 56 %',
    ]);
    expect(strict.owed).toEqual([]);
    const at172 = [...rows('10.20.40', 30, 0, 2, 2), ...rows('10.5.40', 8, 0), ...rows('10.5.50', 8, 0)]; // every floor holds
    const ok = M.checkPercentFloors(percent(), at172, '');
    expect(ok.violations).toEqual([]);
    expect(ok.owed).toEqual([]);
    expect(ok.text).toMatch(/^FLOORS OK: overall/);
  });
  it('same shape on the 172 set: overall 80 % is red alone, OWED when a RULED row names it, and never OWED on a line that passes', () => {
    const low = [...rows('10.20.40', 4, 1), ...rows('10.5.40', 4, 1)]; // overall 80 %: below its floor
    const strict = M.checkPercentFloors(percent(), low, '');
    expect(kinds(strict.violations)).toEqual(['overall', 'article 10.20.40', 'pooled articles']); // overall, article 10.20.40 (80 < 91), pooled (80 < 95)
    expect(strict.violations[0]).toBe('floor_fell:overall accuracy 80.0 % is below its floor 92 %');
    expect(strict.owed).toEqual([]);
    const registerText = [OWED_172, OWED_172_ART].join('\n');
    const owedPair = M.checkPercentFloors(percent(), low, registerText);
    expect(owedPair.violations).toEqual([
      'floor_fell:pooled articles accuracy 80.0 % is below its floor 95 %',
    ]); // OWED_172 names overall accuracy and OWED_172_ART names the article accuracy line; the pooled line and the article answered line are not named by any row
    expect(owedPair.owed.map((x: OwedItem) => x.line)).toEqual(['overall accuracy', 'article 10.20.40 accuracy']); // both named by a RULED row: never counted as PASS
    const at172 = [...rows('10.20.40', 30, 0, 2, 2), ...rows('10.5.40', 8, 0), ...rows('10.5.50', 8, 0)];
    const ok = M.checkPercentFloors(percent(), at172, registerText);
    expect(ok.owed).toEqual([]); // no line fails, so the owing rows name nothing: never counted as PASS either way
    expect(ok.violations).toEqual([]);
  });
});

describe('checkCountFloors: a count line below its floor or unmeasured is red (M-322)', () => {
  const f = count();
  it('at or above the floor is green', () => {
    expect(M.checkCountFloors(f, { 'coa172 cases': 172, 'coa172 accuracy': 93 })).toEqual([]);
  });
  it('below the floor and not measured are red', () => {
    expect(M.checkCountFloors(f, { 'coa172 cases': 171, 'coa172 accuracy': 92 })).toEqual(['floor_fell:coa172 cases 171 < 172']);
    expect(M.checkCountFloors(f, { 'coa172 cases': 172 })).toEqual(['floor_fell:coa172 accuracy not_measured']);
  });
});

describe('checkOwedRatchet: an OWED line may not fall further (PR-68-7, M-372)', () => {
  const baseline = { 'article 10.5.40 accuracy': 91.2 };
  it('a steady or improving OWED line is green', () => {
    expect(M.checkOwedRatchet(baseline, [{ line: 'article 10.5.40 accuracy', measured: 91.2, floor: 94 }])).toEqual([]);
    expect(M.checkOwedRatchet(baseline, [{ line: 'article 10.5.40 accuracy', measured: 92.6, floor: 94 }])).toEqual([]);
    expect(M.checkOwedRatchet({}, [{ line: 'article 10.5.40 accuracy', measured: 10, floor: 94 }])).toEqual([]); // no baseline: nothing to ratchet
  });
  it('a further fall is red, naming the line', () => {
    expect(M.checkOwedRatchet(baseline, [{ line: 'article 10.5.40 accuracy', measured: 90.9, floor: 94 }])).toEqual(['owed_line_fell_further:article 10.5.40 accuracy']);
  });
});

describe('setCountFloor: the count-floor door (M-330)', () => {
  it('records the ruling and the line on a deep copy', () => {
    const f = count();
    const r = rulings([['M-372', 'RULED']]);
    const g = M.setCountFloor(f, 'coa228 cases', 228, 'M-372', r);
    expect(g.lines['coa228 cases']).toBe(228);
    expect(g.lines['coa172 cases']).toBe(172);
    expect(g.rulings.at(-1)).toEqual({ ruling: 'M-372', lines: [{ line: 'coa228 cases', from: null, to: 228 }] });
    expect(f.lines['coa228 cases']).toBeUndefined(); // the input is untouched
    expect(f.rulings).toEqual([]);
    const h = M.setCountFloor(f, 'coa172 cases', 200, 'M-372', r);
    expect(h.rulings.at(-1).lines[0]).toEqual({ line: 'coa172 cases', from: 172, to: 200 });
    expect(M.checkFloorEdit(f, h, r)).toEqual([]); // through the door: the raise is green
  });
  it('a ruling that is not authority throws and changes nothing', () => {
    const r = rulings([['M-9', 'PROPOSED']]);
    expect(() => M.setCountFloor(count(), 'coa228 cases', 228, 'M-9', r)).toThrow(/ruling_not_authority:M-9/);
    expect(() => M.setCountFloor(count(), 'coa228 cases', 228, 'NOPE-1', r)).toThrow(/ruling_not_authority:NOPE-1/);
    expect(M.setCountFloor(count(), 'coa228 cases', 228, 'M-9', rulings([['M-9', 'RATIFIED']])).lines['coa228 cases']).toBe(228);
  });
});

describe('the imported coa-round module is used, never re-implemented or written', () => {
  it('loop-floors.mjs imports reportFloors and statsOf from coa-round.mjs', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-floors.mjs'), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\breportFloors\b[^}]*\bstatsOf\b[^}]*\}\s*from\s*'\.\.\/bylaw-validation\/coa-round\.mjs'/);
  });
  it('loop-floors.mjs never writes a file (no fs write, no child process)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-floors.mjs'), 'utf8');
    expect(src).not.toMatch(/writeFile|appendFile|createWriteStream|child_process|process\.env|process\.exit/);
  });
});
