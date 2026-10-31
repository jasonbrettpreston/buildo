// SPEC LINK: MB-73 plan sections 7 and 8; R-BF (generated or witnessed, never hand-kept), R-KK, K2, K14, F-IDEM, F-AUD.
// Pure module: same input -> byte-identical output (no clock, no env, no fs, no git).

import { describe, expect, it } from 'vitest';
import {
  countStates,
  countsLine,
  summaryLine,
  statusTable,
  statusLineRow,
  snapshotHeaderLines,
  auditPack,
  auditLines,
} from '../../scripts/analysis/mcbylaws-promises/promise-status.mjs';

const ROWS = [
  { id: 'MB-73-2', state: 'red', evidence: 'ac1.log' },
  { id: 'MB-73-1', state: 'done', evidence: 'ac0.log' },
  { id: 'MB-73-3', state: 'not yet', evidence: '' },
];

describe('promise-status — counts (K2)', () => {
  it('counts done / red / not yet and an unknown state counts as red', () => {
    expect(countStates(ROWS)).toEqual({ done: 1, red: 1, notYet: 1 });
    expect(countStates([...ROWS, { id: 'MB-73-4', state: 'weird' }])).toEqual({ done: 1, red: 2, notYet: 1 });
    expect(countStates([])).toEqual({ done: 0, red: 0, notYet: 0 });
  });

  it('the counts line and the summary line are exact', () => {
    const c = countStates(ROWS);
    expect(countsLine(c)).toBe('done 1, red 1, not yet 1');
    expect(summaryLine(c)).toBe('promises: 1 done, 1 red, 1 not yet');
    expect(summaryLine({ done: 0, red: 0, notYet: 0 })).toBe('promises: 0 done, 0 red, 0 not yet');
  });

  it('the queue status line pastes the counts line at the commit', () => {
    expect(statusLineRow(countStates(ROWS), 'abc123d')).toBe('MB-73 promises: done 1, red 1, not yet 1 at abc123d');
  });
});

describe('promise-status — statusTable (F-IDEM)', () => {
  const args = { commit: 'abc123d', registerHash: 'f'.repeat(64), rows: ROWS };

  it('has the exact header, the counts line and rows sorted by id', () => {
    const md = statusTable(args);
    const lines = md.split('\n');
    expect(lines[0]).toBe('# Promises status');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('commit: abc123d');
    expect(lines[3]).toBe(`register: ${'f'.repeat(64)}`);
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('done 1, red 1, not yet 1');
    expect(lines[6]).toBe('');
    expect(lines[7]).toBe('| id | state | evidence |');
    expect(lines[8]).toBe('|---|---|---|');
    expect(lines[9]).toBe('| MB-73-1 | done | ac0.log |');
    expect(lines[10]).toBe('| MB-73-2 | red | ac1.log |');
    expect(lines[11]).toBe('| MB-73-3 | not yet |  |');
    expect(md.endsWith('\n')).toBe(true);
    expect(md.split('\n')).toHaveLength(13);
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('is byte-identical for the same input and for a different input order', () => {
    expect(statusTable(args)).toBe(statusTable(args));
    const reversed = { ...args, rows: [...ROWS].reverse() };
    expect(statusTable(reversed)).toBe(statusTable(args));
  });

  it('replaces a pipe and newlines in evidence; a missing evidence is empty', () => {
    const md = statusTable({
      commit: 'c',
      registerHash: 'r',
      rows: [{ id: 'MB-73-9', state: 'done', evidence: 'a|b\nc' }, { id: 'MB-73-8', state: 'red' }],
    });
    expect(md).toContain('| MB-73-9 | done | a/b c |');
    expect(md).toContain('| MB-73-8 | red |  |');
    expect(md.split('\n').filter((l) => l.startsWith('| MB-73-9')).length).toBeGreaterThan(0);
  });
});

describe('promise-status — snapshot header', () => {
  const header = '# Promises status\n\ncommit: abc\nregister: def\n\ndone 1, red 0, not yet 0\n';
  const want = { commit: 'abc', registerHash: 'def' };

  it('fresh header passes; changed register / commit are stale', () => {
    expect(snapshotHeaderLines(header, want)).toEqual([]);
    expect(snapshotHeaderLines(header, { ...want, registerHash: 'zzz' })).toEqual(['FAIL:R:snapshot-stale:register']);
    expect(snapshotHeaderLines(header, { ...want, commit: 'other' })).toEqual(['FAIL:R:snapshot-stale:commit']);
    expect(snapshotHeaderLines(header, { commit: 'other', registerHash: 'zzz' })).toEqual([
      'FAIL:R:snapshot-stale:register',
      'FAIL:R:snapshot-stale:commit',
    ]);
  });

  it('a header missing either line cannot be decided', () => {
    expect(snapshotHeaderLines('# Promises status\n\ncommit: abc\n', want)).toEqual(['FAIL:R:cannot-decide:snapshot-header']);
    expect(snapshotHeaderLines('# Promises status\n\nregister: def\n', want)).toEqual(['FAIL:R:cannot-decide:snapshot-header']);
    expect(snapshotHeaderLines('', want)).toEqual(['FAIL:R:cannot-decide:snapshot-header']);
  });
});

describe('promise-status — audit pack (R-KK / K14, F-AUD)', () => {
  const E = [
    { id: 'MB-73-2', command: 'npx vitest run a', counts: 'Tests  1 passed (1)' },
    { id: 'MB-73-1', command: 'npx vitest run b', counts: 'Tests  2 passed (2)' },
  ];
  const pack = auditPack(E);
  const text = ['## MB-73-1', 'npx vitest run b', 'Tests  2 passed (2)', '', '## MB-73-2', 'npx vitest run a', 'Tests  1 passed (1)'].join('\n');
  const noBlock2 = ['## MB-73-1', 'npx vitest run b', 'Tests  2 passed (2)'].join('\n');
  const swapped = ['## MB-73-1', 'npx vitest run a', 'Tests  1 passed (1)', '## MB-73-2', 'npx vitest run b', 'Tests  2 passed (2)'].join('\n');
  const noCounts = ['## MB-73-1', 'npx vitest run b', '## MB-73-2', 'npx vitest run a', 'Tests  1 passed (1)'].join('\n');

  it('the pack is sorted by id with a pack_sha256 stable under input order', () => {
    expect(pack.schema).toBe('promises-audit-pack-v1');
    expect(pack.entries.map((e: { id: string }) => e.id)).toEqual(['MB-73-1', 'MB-73-2']);
    expect(pack.pack_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(auditPack([...E].reverse()).pack_sha256).toBe(pack.pack_sha256);
    expect(auditPack([...E].reverse()).entries).toEqual(pack.entries);
  });

  it.each([
    ['every id witnessed exactly', text, []],
    ['a missing block', noBlock2, ['FAIL:R:audit-uncovered:MB-73-2']],
    ['a fabricated counts line', text.replace('Tests  1 passed (1)', 'Tests  9 passed (9)'), ['FAIL:R:audit-uncovered:MB-73-2']],
    ['the right counts under the wrong heading', swapped, ['FAIL:R:audit-uncovered:MB-73-1', 'FAIL:R:audit-uncovered:MB-73-2']],
    ['the right command, no counts line', noCounts, ['FAIL:R:audit-uncovered:MB-73-1']],
    ['an empty audit text', '', ['FAIL:R:audit-uncovered:MB-73-1', 'FAIL:R:audit-uncovered:MB-73-2']],
  ])('F-AUD %s -> uncovered ids', (_label, auditText, want) => {
    expect(auditLines({ pack, auditText })).toEqual(want);
  });
});
