// SPEC LINK: MB-73 plan section 6, K7; R-KU (the increment scope is read from the register row, not declared);
//            R-BF (a red in an in-scope row sinks the increment). Each case is one clause of the brief.
import { describe, expect, it, afterEach } from 'vitest';
import {
  INCREMENTS_PATH, readIncrementIds, recordsAt, derivedN, inScope, scopeLines,
  checkIncrementArg, incrementLines, untracedLines,
} from '../../scripts/analysis/mcbylaws-promises/promise-increment.mjs';
import { bindRecord } from '../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { makeRepo, type Repo } from './fixtures/mcbylaws-gate/repo-helper';

const repo: { r: Repo | null } = { r: null };
afterEach(() => { if (repo.r) repo.r.cleanup(); repo.r = null; });

const IDS = ['1', '2', '6', '6b', '7'];
const REC_DIR = 'docs/reports/loop-records';
const validRecord = (increment: string, round: number, decision = 'accept') =>
  bindRecord({
    schema: 'loop-record-v1', increment, round, decision, reason: 'x',
    accepted_findings: [], cases: [], inputs: {},
  });
const recordJson = (increment: string, round: number, decision?: string) =>
  `${JSON.stringify(validRecord(increment, round, decision), null, 2)}\n`;

describe('promise-increment — F-IDS: the increment list is ordered, not sorted (R-KU)', () => {
  it('derivedN takes the accepted increment with the highest INDEX in ids', () => {
    const records = [
      { path: 'a', increment: '6', round: 1 },
      { path: 'b', increment: '6b', round: 1 },
    ];
    expect(derivedN(records, IDS)).toEqual({ n: '6b', lines: [] });
  });

  it('6b is in scope at N=7 and out of scope at N=6', () => {
    const row = { id: 'P1', increment: '6b' };
    expect(inScope(row, '7', IDS)).toBe(true);
    expect(inScope(row, '6', IDS)).toBe(false);
    expect(inScope(row, '6b', IDS)).toBe(true);
  });

  it('10 after 9 in ids beats 9 although "10" < "9" as strings', () => {
    const ids = ['9', '10'];
    expect(derivedN([{ path: 'a', increment: '9', round: 1 }, { path: 'b', increment: '10', round: 1 }], ids))
      .toEqual({ n: '10', lines: [] });
    expect(inScope({ id: 'P', increment: '10' }, '9', ids)).toBe(false);
  });

  it('no accepted record -> n null; an unknown increment -> cannot-decide', () => {
    expect(derivedN([], IDS)).toEqual({ n: null, lines: [] });
    expect(derivedN([{ path: 'a', increment: 'x9', round: 1 }], IDS))
      .toEqual({ n: null, lines: ['FAIL:R:cannot-decide:increment-unknown:x9'] });
  });

  it('an increment null row is always in scope; unknown row increments are reported by scopeLines', () => {
    expect(inScope({ id: 'P', increment: null }, null, IDS)).toBe(true);
    expect(inScope({ id: 'P', increment: '7' }, null, IDS)).toBe(false);
    const rows = [{ id: 'P2', increment: 'zz' }, { id: 'P1', increment: '1' }, { id: 'P3', increment: null }];
    expect(scopeLines(rows, IDS)).toEqual(['FAIL:R:cannot-decide:row-increment-unknown:P2']);
  });
});

describe('promise-increment — F-N0: the --increment argument', () => {
  it('unknown / mismatch / equal / absent', () => {
    expect(checkIncrementArg('0', '6', IDS)).toEqual(['FAIL:R:cannot-decide:increment-unknown:0']);
    expect(checkIncrementArg('6', '7', IDS)).toEqual(['FAIL:R:cannot-decide:increment-mismatch:6:7']);
    expect(checkIncrementArg('7', '7', IDS)).toEqual([]);
    expect(checkIncrementArg(undefined, '7', IDS)).toEqual([]);
    expect(checkIncrementArg(null, null, IDS)).toEqual([]);
  });
});

describe('promise-increment — F-P7: a red in an in-scope row is a red increment (R-BF)', () => {
  it('in-scope red fails, all done passes, out-of-scope red is ignored, n null is empty', () => {
    const rows = [{ id: 'P1', increment: '6' }, { id: 'P2', increment: '7' }];
    expect(incrementLines({ rows, states: { P1: 'red', P2: 'done' }, n: '6', ids: IDS }))
      .toEqual(['FAIL:R:increment-green-with-red:P1']);
    expect(incrementLines({ rows, states: { P1: 'done', P2: 'done' }, n: '7', ids: IDS })).toEqual([]);
    expect(incrementLines({ rows, states: { P1: 'red', P2: 'red' }, n: '6', ids: IDS }))
      .toEqual(['FAIL:R:increment-green-with-red:P1']);
    expect(incrementLines({ rows, states: { P1: 'red', P2: 'red' }, n: null, ids: IDS })).toEqual([]);
    const unknown = [{ id: 'P3', increment: 'nowhere' }];
    expect(incrementLines({ rows: unknown, states: { P3: 'red' }, n: '6', ids: IDS })).toEqual([]);
  });

  it('rows that are not in scope are not judged (and sorted by id)', () => {
    const rows = [
      { id: 'P2', increment: '2' },
      { id: 'P1', increment: '1' },
      { id: 'P3', increment: '6b' },
    ];
    const states = { P1: 'not yet', P2: 'done', P3: 'red' };
    expect(incrementLines({ rows, states, n: '1', ids: IDS })).toEqual(['FAIL:R:increment-green-with-red:P1']);
    const both = incrementLines({ rows, states, n: '6b', ids: IDS });
    expect(both).toEqual(['FAIL:R:increment-green-with-red:P1', 'FAIL:R:increment-green-with-red:P3']);
  });
});

describe('promise-increment — recordsAt / readIncrementIds', () => {
  const increments = (ids: string[]) => JSON.stringify({ ids });

  it('reads the increment ids at a rev; malformed data fails closed', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write(INCREMENTS_PATH, increments(IDS));
    const sha = r.commit('base');
    expect(readIncrementIds(r.dir, sha)).toEqual({ ids: IDS, lines: [] });
    r.write(INCREMENTS_PATH, JSON.stringify({ ids: [] }));
    const empty = r.commit('empty');
    expect(readIncrementIds(r.dir, empty).lines).toEqual(['FAIL:R:cannot-decide:increment-ids']);
    r.write(INCREMENTS_PATH, 'not json');
    const broken = r.commit('broken');
    expect(readIncrementIds(r.dir, broken).lines).toEqual(['FAIL:R:cannot-decide:increment-ids']);
    expect(readIncrementIds(r.dir, 'no-such-rev').lines).toEqual(['FAIL:R:cannot-decide:increment-ids']);
  });

  it('keeps an accepted valid record, drops a revert (not accepted), fails closed on a malformed record', () => {
    repo.r = makeRepo();
    const r = repo.r;
    r.write(`${REC_DIR}/6/round-01.json`, recordJson('6', 1));
    r.write(`${REC_DIR}/6/round-02.json`, recordJson('6', 2, 'revert'));
    const sha = r.commit('records');
    const got = recordsAt({ cwd: r.dir, rev: sha });
    expect(got.lines).toEqual([]);
    expect(got.records).toEqual([{ path: `${REC_DIR}/6/round-01.json`, increment: '6', round: 1 }]);
    r.write(`${REC_DIR}/7/round-01.json`, '{ not json');
    const bad = r.commit('bad');
    expect(recordsAt({ cwd: r.dir, rev: bad }))
      .toEqual({ records: [], lines: [`FAIL:R:cannot-decide:record:${REC_DIR}/7/round-01.json`] });
    expect(recordsAt({ cwd: r.dir, rev: 'no-such-rev' }).lines).toEqual(['FAIL:R:cannot-decide:records']);
  });
});

describe('promise-increment — R3-02/R4-08: untraced promise numbers', () => {
  const full = { phase2_row_id: 'R3-02', catalogue_row: 'c-1', setting: 's-1' };
  it.each([
    ['empty list', [], []],
    ['fully traced', [{ id: 'P1', trace: full }], []],
    ['each missing member', [{ id: 'P1', trace: { catalogue_row: 'c', setting: 's' } }], ['FAIL:W:untraced-number:P1']],
    ['empty string', [{ id: 'P1', trace: { ...full, setting: '' } }], ['FAIL:W:untraced-number:P1']],
    ['null trace', [{ id: 'P1', trace: null }], ['FAIL:W:untraced-number:P1']],
  ])('%s', (_label, rows, want) => {
    expect(untracedLines(rows)).toEqual(want);
  });
});
