// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IZ, R-JA, R-JC, R-JD; Spec 124 R-HK
//
// The record lock for the 2026-10-22 chat rulings that became Spec 124a rows (R-IZ the lens + handbook rule,
// R-JA the Layer 2 link-row form, R-JC "V3 locally", R-JD the ② ledger status) and the Spec 69a rows beside them
// (M-328 .. M-331). decision-log --check proves each decision has a citing row; this test proves the row carries
// its register id, cites the log it came from, and is mapped to a Spec 132 handbook line that exists.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const A = read('docs/specs/01-pipeline/124a_step_standard_policy_appendix.md');
const M = read('docs/specs/01-pipeline/69a_mcbylaw_register.md');
const map = JSON.parse(read('scripts/steps/_schema/rule-map.json')) as { rules: Array<{ id: string; handbook_line: string }>; lines: Array<{ id: string }> };
const rowOf = (text: string, id: string) => text.split('\n').find((l) => l.startsWith(`| ${id} |`) || l.startsWith(`| **${id}** |`)) ?? '';

const R_ROWS: Array<[string, string[], string]> = [
  ['R-IZ', ['2026-10-22-batch-z4#CHAT-68.lens', '2026-10-22-batch-z4#CHAT-68.handbook', '2026-10-22-batch-z5#CHAT-68.approve', '2026-10-22-batch-z5#CHAT-68.scope'], 'x-rulings.4'],
  ['R-JA', ['2026-10-22-batch-z6#CHAT-69.Q1'], 'x-rulings.4'],
  ['R-JC', ['2026-10-22-batch-z7#CHAT-70.2'], 'x-v3.1'],
  ['R-JD', ['2026-10-22-batch-z7#CHAT-70.3'], 'x-validate.2'],
];

describe('R-IZ / R-JA / R-JC / R-JD: each 2026-10-22 chat ruling is a register row on a handbook line', () => {
  for (const [id, cites, line] of R_ROWS) {
    it(`${id} cites its decisions and sits on Spec 132 §${line}`, () => {
      const row = rowOf(A, id);
      expect(row, id).not.toBe('');
      for (const c of cites) expect(row, `${id} cites ${c}`).toContain(c);
      const entry = map.rules.find((r) => r.id === id);
      expect(entry?.handbook_line).toBe(line);
      expect(map.lines.some((l) => l.id === line)).toBe(true);
    });
  }
  it('R-IX carries the CHAT-69.Q2 confirmation as a dated note', () => {
    expect(rowOf(A, 'R-IX')).toContain('2026-10-22-batch-z6#CHAT-69.Q2');
  });
  it('M-328 applies R-IZ to by-laws and cites the CHAT-63 condition and CHAT-68', () => {
    const row = rowOf(M, 'M-328');
    expect(row).toContain('R-IZ');
    for (const c of ['2026-10-22-batch-z3#CHAT-63.condition', '2026-10-22-batch-z4#CHAT-68.lens', '2026-10-22-batch-z5#CHAT-68.scope']) expect(row).toContain(c);
  });
  it('every CHAT-63 card and CHAT-70.4 has a Spec 69a row', () => {
    for (let n = 1; n <= 10; n++) expect(M, `CHAT-63.C${n}`).toContain(`2026-10-22-batch-z3#CHAT-63.C${n}\``);
    expect(rowOf(M, 'M-329')).toContain('CHAT-70.4');
    expect(rowOf(M, 'M-317')).toContain('2026-10-22-batch-z7#CHAT-70.1');
  });
});
