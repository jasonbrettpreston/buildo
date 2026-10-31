// SPEC LINK: MB-73 plan 2.2/2.3; R-KQ, R-KU, K16, R4-10 (ids are found by pattern, not typed ranges).

import { describe, expect, it } from 'vitest';
import { FAMILIES, leadingIds, extractRows }
  from '../../scripts/analysis/mcbylaws-promises/promise-ids.mjs';

const K16 = ['R-T', 'M-46', 'M-66', 'R-KQ', 'R3-02', 'G13', 'G67-06', 'BOOT-1', 'MB-73', 'MB-50a',
  'O-17', 'P67-2', 'PR-73-1', 'S-1'];
const ids = (line: string) => leadingIds(line).map((h: { id: string }) => h.id);

describe('families and rows (K16, R4-10)', () => {
  it.each(K16)('%s is found as a bullet, a table row and a heading', (id) => {
    expect(ids(`- ${id}: text`)).toEqual([id]);
    expect(ids(`| ${id} | text |`)).toEqual([id]);
    expect(ids(`### ${id} thing`)).toEqual([id]);
    expect(ids(`  * **${id}**, text`)).toEqual([id]);
    expect(leadingIds(`- ${id}`)[0]!.kind).toBe(FAMILIES.find((f: { re: RegExp }) => f.re.test(id))?.kind);
  });

  it('terminators and headings one to six', () => {
    expect(ids('- R-KQ: x')).toEqual(['R-KQ']);
    expect(ids('# M-46, y')).toEqual(['M-46']);
    expect(ids('###### S-1) z')).toEqual(['S-1']);
    expect(ids('####### R-T')).toEqual([]);
  });

  it('prose is not a row (F: ghost)', () => {
    expect(ids('We follow R-KQ and M-377 here.')).toEqual([]);
    expect(ids('- see R-KQ')).toEqual([]);
  });

  it('F-GHOST: ids absent from input never appear', () => {
    const out = extractRows([{ path: 'a.md', text: '## T\n- MB-73: x\n- **MB-74**: y\n' }], []);
    const seen = out.map((r: { id: string }) => r.id);
    expect(seen).toContain('MB-73');
    expect(seen).not.toContain('MB-75');
    expect(seen).not.toContain('M-377');
  });

  it('a leading list of ids', () => {
    expect(ids('- MB-01, MB-02, MB-03 (+03b)')).toEqual(['MB-01', 'MB-02', 'MB-03']);
    expect(ids('- R-T + R-KQ and M-46; nope')).toEqual(['R-T', 'R-KQ', 'M-46']);
  });
});

describe('increments table', () => {
  const text = [
    '| 1 | a |',
    '|---|',
    '## Increments: x',
    '| Inc | Text |',
    '|---|',
    '| 1 | text citing M-377 |',
    '| 6b | text citing M-377 and R-KQ |',
    '',
    '## Later',
    '- R-T: x',
    '- M-377: x',
    '- R-KQ: y',
  ].join('\n');

  it('INC rows and increment attribution', () => {
    const out = extractRows([{ path: 'inc.md', text }], ['1', '2', '6b']);
    const inc = out.filter((r: { kind: string }) => r.kind === 'increment');
    expect(inc.map((r: { id: string }) => r.id).sort()).toEqual(['INC-1', 'INC-6b']);
    expect(out.find((r: { id: string }) => r.id === 'M-377')!.increment).toBe('1');
    expect(out.find((r: { id: string }) => r.id === 'R-KQ')!.increment).toBe('6b');
    expect(out.find((r: { id: string }) => r.id === 'R-T')!.increment).toBeNull();
  });
});

describe('not doing and withdrawn', () => {
  it('ND- slugs and WD- ids', () => {
    const text = [
      '## Not doing: stuff',
      '- Skip the fancy dashboard for now',
      '- **No** vendor lock, ever',
      '## Withdrawn',
      '| Id | Why |',
      '| --- | --- |',
      '| MB-99 | obsolete |',
      '| nothing | here |',
      '## Done',
      '- O-17: x',
    ].join('\n');
    const out = extractRows([{ path: 'nd.md', text }], []);
    expect(out.map((r: { id: string }) => r.id)).toContain('ND-skip-the-fancy-dashboard-for-now');
    expect(out.map((r: { id: string }) => r.id)).toContain('ND-no-vendor-lock-ever');
    expect(out.map((r: { id: string }) => r.id)).toContain('WD-MB-99');
    expect(out.filter((r: { kind: string }) => r.kind === 'withdrawn')).toHaveLength(1);
    expect(out.find((r: { id: string }) => r.id === 'WD-MB-99')!.kind).toBe('withdrawn');
  });
});

describe('owner_task, first occurrence, ordering', () => {
  it('owner task resets at ## and assigns to task rows and later lines', () => {
    const text = [
      '## Tasks',
      '- MB-50a: do it',
      '- R-KQ: belongs to MB-50a',
      '**MB-51**: next',
      '- M-46: belongs to MB-51',
      '| S-1 | cell |',
      '## Later',
      '- R-T: ownerless',
      '**MB-52**: later task',
      '| G13 | cell |',
      '**M-66**: bold task',
      '- O-17: belongs to M-66',
    ].join('\n');
    const out = extractRows([{ path: 'own.md', text }], []);
    const own = (id: string) => out.find((r: { id: string }) => r.id === id)!.owner_task;
    expect(own('MB-50a')).toBe('MB-50a');
    expect(own('R-KQ')).toBe('MB-50a');
    expect(own('MB-51')).toBe('MB-51');
    expect(own('M-46')).toBe('MB-51');
    expect(own('S-1')).toBe('MB-51');
    expect(own('R-T')).toBeNull();
    expect(own('G13')).toBe('MB-52');
    // `**M-66**: bold task` is a ruling, not a task: owner_task is only set by MB- ids.
    expect(own('M-66')).toBe('MB-52');
    expect(own('O-17')).toBe('MB-52');
  });

  it('first occurrence wins and output is sorted by id', () => {
    const out = extractRows([
      { path: 'b.md', text: '- R-T: from b\n- S-1: x\n' },
      { path: 'a.md', text: '- R-T: from a\n- G13: y\n' },
    ], []);
    expect(out.map((r: { id: string }) => r.id)).toEqual(['G13', 'R-T', 'S-1']);
    expect(out.find((r: { id: string }) => r.id === 'R-T')!.file).toBe('b.md');
    expect(out.every((r: { quoted_line: string }) => r.quoted_line.length <= 300)).toBe(true);
  });
});
