// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (a round declares exactly one increment, the closed set 1..10 incl. 6b)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 5 (one increment per round, no skip-ahead, increment green)
// Red first: docs/reports/red-evidence/mb68/b1-increment-red.txt. Pure checks; the only disk read is data/increments.json.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-increment.mjs'));

type Row = { id: string; increment?: string | null };
type NewCase = { id: string; introduced_in: string };
type Round = { prereg: { increment: unknown }; record: { increment: unknown }; rowsTouched?: Row[]; newCases?: NewCase[]; ids: string[] };
type LoopRecord = { increment: string; decision: string; green: boolean };
type Group = { id: string; introduced_in: string };
type Case = { id: string; group: string; status: string };

const IDS: string[] = ['1', '2', '3', '4', '5', '6', '6b', '7', '8', '9', '10'];
const round = (over: Partial<Round>): Round => ({ prereg: { increment: '1' }, record: { increment: '1' }, ids: IDS, ...over });

describe('loadIncrements: the closed increment set comes from data, not from code', () => {
  it('reads the real data file: 11 ids, starting at 1, holding 6b, ending at 10', () => {
    const ids = M.loadIncrements(ROOT);
    expect(ids).toHaveLength(11);
    expect(ids[0]).toBe('1');
    expect(ids).toContain('6b');
    expect(ids[ids.length - 1]).toBe('10');
  });
  it('a root with no data file is an error, not an empty set', () => {
    expect(() => M.loadIncrements(path.join(ROOT, 'no-such-root'))).toThrow(/data_missing/);
  });
});

describe('checkOneIncrement: exactly one increment per round', () => {
  it('equal prereg and record ids on a known increment pass', () => {
    expect(M.checkOneIncrement(round({}))).toEqual([]);
  });
  it('a prereg id that is not exactly one known id is refused', () => {
    expect(M.checkOneIncrement(round({ prereg: { increment: ['2', '3'] }, record: { increment: ['2', '3'] } }))).toContain('increment_not_one_id:prereg');
    expect(M.checkOneIncrement(round({ prereg: { increment: '2,3' }, record: { increment: '2,3' } }))).toContain('increment_not_one_id:prereg');
    expect(M.checkOneIncrement(round({ prereg: { increment: '' }, record: { increment: '' } }))).toContain('increment_not_one_id:prereg');
    expect(M.checkOneIncrement(round({ prereg: { increment: '11' }, record: { increment: '11' } }))).toContain('increment_not_one_id:prereg');
  });
  it('a record id that is not exactly one known id is refused', () => {
    expect(M.checkOneIncrement(round({ record: { increment: ['2', '3'] } }))).toContain('increment_not_one_id:record');
    expect(M.checkOneIncrement(round({ record: { increment: '7 ' } }))).toContain('increment_not_one_id:record');
  });
  it('prereg 2 against record 1 differs; both are valid ids so the differing code is the whole verdict', () => {
    expect(M.checkOneIncrement(round({ prereg: { increment: '2' }, record: { increment: '1' } }))).toEqual(['increment_differs_prereg_vs_record']);
  });
  it('rows tagged with two different increments are refused', () => {
    const v = M.checkOneIncrement(round({ rowsTouched: [{ id: 'r1', increment: '1' }, { id: 'r2', increment: '2' }] }));
    expect(v).toContain('rows_from_two_increments');
  });
  it('a new regression case introduced in another increment is refused by id', () => {
    const v = M.checkOneIncrement(round({ newCases: [{ id: 'c-42', introduced_in: '2' }] }));
    expect(v).toContain('regression_case_wrong_increment:c-42');
  });
});

describe('checkSkipAhead: increments run in the closed order, no gaps', () => {
  it('3 with only 1 green skips ahead', () => {
    expect(M.checkSkipAhead('3', ['1'], IDS)).toContain('increment_skips_ahead_previous_not_green');
  });
  it('2 with 1 green does not skip', () => {
    expect(M.checkSkipAhead('2', ['1'], IDS)).toEqual([]);
  });
  it('the first increment never skips, even with no history', () => {
    expect(M.checkSkipAhead('1', [], IDS)).toEqual([]);
  });
  it('7 needs 6b, not 6', () => {
    expect(M.checkSkipAhead('7', ['6'], IDS)).toContain('increment_skips_ahead_previous_not_green');
    expect(M.checkSkipAhead('7', ['6b'], IDS)).toEqual([]);
  });
  it('an id outside the closed set cannot be skipped to', () => {
    expect(M.checkSkipAhead('zz', [], IDS)).toContain('increment_not_one_id:skip');
  });
});

describe('greenIncrements: only an accepted, green round counts', () => {
  const recs: LoopRecord[] = [
    { increment: '1', decision: 'accept', green: true },
    { increment: '1', decision: 'accept', green: true },
    { increment: '2', decision: 'revert', green: true },
    { increment: '3', decision: 'accept', green: false },
    { increment: '6b', decision: 'accept', green: true },
  ];
  it('accept + green counts once per increment', () => {
    expect(M.greenIncrements(recs)).toEqual(['1', '6b']);
  });
  it('revert + green and accept + not-green do not count', () => {
    const g = M.greenIncrements(recs);
    expect(g).not.toContain('2');
    expect(g).not.toContain('3');
  });
});

describe('incrementGreen: every in-scope case green, floors held, canary red', () => {
  const groups: Group[] = [
    { id: 'g-base', introduced_in: 'baseline' },
    { id: 'g-1', introduced_in: '1' },
    { id: 'g-3', introduced_in: '3' },
  ];
  const ok = { increment: '2', ids: IDS, groups, floorsOk: true, canaryOk: true };
  it('all in-scope cases pass: green with no reasons', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'pass' }, { id: 'c2', group: 'g-1', status: 'accepted' }];
    expect(M.incrementGreen({ ...ok, cases })).toEqual({ green: true, reasons: [] });
  });
  it('a failing in-scope case names the case', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'fail' }];
    expect(M.incrementGreen({ ...ok, cases }).reasons).toEqual(['case_not_green:c1']);
  });
  it('a pending case is not green yet', () => {
    const cases: Case[] = [{ id: 'c9', group: 'g-1', status: 'pending' }];
    expect(M.incrementGreen({ ...ok, cases }).reasons).toContain('case_not_green:c9');
  });
  it('a skipped case is not green', () => {
    const cases: Case[] = [{ id: 'c7', group: 'g-1', status: 'skipped' }];
    expect(M.incrementGreen({ ...ok, cases }).reasons).toContain('case_not_green:c7');
  });
  it('a floor that fell is not green', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'pass' }];
    const r = M.incrementGreen({ ...ok, cases, floorsOk: false });
    expect(r.green).toBe(false);
    expect(r.reasons).toContain('floors_fell');
  });
  it('a canary that did not go red is not green', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'pass' }];
    const r = M.incrementGreen({ ...ok, cases, canaryOk: false });
    expect(r.green).toBe(false);
    expect(r.reasons).toContain('canary_not_red');
  });
  it('no in-scope cases is not green', () => {
    expect(M.incrementGreen({ ...ok, cases: [{ id: 'c3', group: 'g-3', status: 'fail' }] })).toEqual({ green: false, reasons: ['empty_set'] });
  });
  it('a group of a later increment with a failing case does not touch this round', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'pass' }, { id: 'c3', group: 'g-3', status: 'fail' }];
    expect(M.incrementGreen({ ...ok, cases })).toEqual({ green: true, reasons: [] });
  });
  // O68-17: an increment outside the closed set is not a round at all: every group would look out of scope and the round would
  // read green on `empty_set` alone, so it is refused by name.
  it('an increment that is not one known id is refused (O68-17)', () => {
    const cases: Case[] = [{ id: 'c1', group: 'g-base', status: 'pass' }];
    expect(M.incrementGreen({ ...ok, cases, increment: '11' })).toEqual({ green: false, reasons: ['increment_not_one_id'] });
    expect(M.incrementGreen({ ...ok, cases, increment: ['2', '3'] })).toEqual({ green: false, reasons: ['increment_not_one_id'] });
    expect(M.incrementGreen({ ...ok, cases, increment: '' })).toEqual({ green: false, reasons: ['increment_not_one_id'] });
  });
});
