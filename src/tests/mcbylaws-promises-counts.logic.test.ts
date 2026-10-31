// SPEC LINK: MB-73 stage 8 fix B5; R-KQ / R-KU (an audit row carries the real vitest counts, not a guess).
// The board's audit pack must show what the file actually ran: a non-green run is listed with its real line
// AND adds `FAIL:R:not-green:<id>`; a file that never ran is `FAIL:R:cannot-decide:audit-counts:<id>`.

import { describe, expect, it } from 'vitest';
import { countsFor, countsLineOf, auditEntries }
  from '../../scripts/analysis/mcbylaws-promises/promise-counts.mjs';

const res = (...statuses: string[]) => statuses.map((status, i) => ({ status, title: `t${i}` }));
const vitest = (files: Array<[string, string[]]>) => ({
  numTotalTests: files.reduce((n, [, s]) => n + s.length, 0),
  testResults: files.map(([name, statuses]) => ({ name, status: 'passed', assertionResults: res(...statuses) })),
});
const JSON_TWO = vitest([
  ['/repo/src/tests/mcbylaws-a.logic.test.ts', ['passed', 'passed', 'failed', 'pending', 'skipped', 'todo']],
  ['/repo/src/tests/mcbylaws-b.logic.test.ts', ['passed']],
]);
const A = 'src/tests/mcbylaws-a.logic.test.ts';
const B = 'src/tests/mcbylaws-b.logic.test.ts';

describe('countsFor — one file of a vitest JSON report', () => {
  it('sums the statuses of the matching testResults entry', () => {
    expect(countsFor(JSON_TWO, A)).toEqual({ passed: 2, failed: 1, skipped: 3, total: 6 });
    expect(countsFor(JSON_TWO, B)).toEqual({ passed: 1, failed: 0, skipped: 0, total: 1 });
  });

  it('does not leak another file\'s counts into an entry', () => {
    const a = countsFor(JSON_TWO, A)!;
    const b = countsFor(JSON_TWO, B)!;
    expect(a.passed).toBe(2);
    expect(b.failed).toBe(0);
    expect(b.skipped).toBe(0);
    expect(a.total + b.total).toBe(7);
  });

  it('tells apart two artifacts that share a basename in different directories', () => {
    const j = vitest([
      ['/repo/scripts/x/thing.test.ts', ['passed', 'passed']],
      ['/repo/src/y/thing.test.ts', ['failed', 'passed']],
    ]);
    expect(countsFor(j, 'scripts/x/thing.test.ts')).toEqual({ passed: 2, failed: 0, skipped: 0, total: 2 });
    expect(countsFor(j, 'src/y/thing.test.ts')).toEqual({ passed: 1, failed: 1, skipped: 0, total: 2 });
  });

  it('also matches a bare basename when the JSON name has no directory part', () => {
    expect(countsFor(vitest([['thing.test.ts', ['passed']]]), 'thing.test.ts')).toEqual({ passed: 1, failed: 0, skipped: 0, total: 1 });
  });

  it('returns null when the file did not run or the report is unusable', () => {
    expect(countsFor(JSON_TWO, 'src/tests/mcbylaws-gone.logic.test.ts')).toBeNull();
    expect(countsFor({}, A)).toBeNull();
    expect(countsFor(null, A)).toBeNull();
    expect(countsFor('x', A)).toBeNull();
    expect(countsFor({ testResults: 'nope' }, A)).toBeNull();
  });
});

describe('countsLineOf — the vitest summary line of one file run', () => {
  it.each([
    [{ passed: 3, failed: 1, skipped: 2, total: 6 }, 'Tests  1 failed | 3 passed | 2 skipped (6)'],
    [{ passed: 3, failed: 0, skipped: 2, total: 5 }, 'Tests  3 passed | 2 skipped (5)'],
    [{ passed: 4, failed: 1, skipped: 0, total: 5 }, 'Tests  1 failed | 4 passed (5)'],
    [{ passed: 2, failed: 0, skipped: 0, total: 2 }, 'Tests  2 passed (2)'],
  ])('%j -> %s', (counts, line) => {
    expect(countsLineOf(counts)).toBe(line);
    expect(countsLineOf(counts)!.startsWith('Tests  ')).toBe(true);
  });

  it('null in, null out', () => {
    expect(countsLineOf(null)).toBeNull();
  });
});

describe('auditEntries — the handful of rows the auditor reads', () => {
  it('lists sorted-by-id rows with the command and the real counts line; green means no line', () => {
    const out = auditEntries({
      artifacts: [
        { id: 'P-2', artifact: B },
        { id: 'P-1', artifact: A },
      ],
      json: JSON_TWO,
    });
    expect(out.entries.map((e: { id: string }) => e.id)).toEqual(['P-1', 'P-2']);
    expect(out.entries[0]).toEqual({
      id: 'P-1',
      command: `npx vitest run ${A} --run`,
      counts: 'Tests  1 failed | 2 passed | 3 skipped (6)',
    });
    expect(out.entries[1]!.counts).toBe('Tests  1 passed (1)');
    expect(out.lines).toContain('FAIL:R:not-green:P-1');
    expect(out.lines).not.toContain('FAIL:R:not-green:P-2');
  });

  it('an all-green run has no rows flagged', () => {
    const out = auditEntries({ artifacts: [{ id: 'P-9', artifact: B }], json: JSON_TWO });
    expect(out.entries).toHaveLength(1);
    expect(out.lines).toEqual([]);
  });

  it('a skipped test is listed with its line but flagged not-green', () => {
    const out = auditEntries({ artifacts: [{ id: 'P-3', artifact: A }], json: JSON_TWO });
    expect(out.entries[0]!.counts).toBe('Tests  1 failed | 2 passed | 3 skipped (6)');
    expect(out.lines).toEqual(['FAIL:R:not-green:P-3']);
  });

  it('a file that never ran is cannot-decide on that id, never a made-up line', () => {
    const out = auditEntries({
      artifacts: [{ id: 'P-1', artifact: A }, { id: 'P-4', artifact: 'src/tests/gone.test.ts' }, { id: 'P-5', artifact: B }],
      json: JSON_TWO,
    } as { artifacts: Array<{ id: string; artifact: string }>; json: unknown });
    expect(out).toEqual({ entries: [], lines: ['FAIL:R:cannot-decide:audit-counts:P-4'] });
  });

  it('no artifacts at all is still a decided (empty) pack, and a non-array is a failure', () => {
    expect(auditEntries({ artifacts: [], json: JSON_TWO })).toEqual({ entries: [], lines: [] });
    const bad = auditEntries({ artifacts: 'nope' } as unknown as { artifacts: never[]; json: unknown });
    expect(bad.entries).toEqual([]);
    expect(bad.lines[0]!.startsWith('FAIL:R:cannot-decide:audit-counts:')).toBe(true);
  });
});
