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
  ['R-JE', ['2026-10-22-batch-z10#CHAT-73.swap3'], 'x-v3.3'],
  ['R-JF', ['2026-10-22-batch-z10#CHAT-73.swap4'], 'core.14'],
  ['R-JG', ['2026-10-22-page-eve#EVE.SWAP-1'], 'materializer.1'],
  ['R-JH', ['2026-10-22-page-eve#EVE.SWAP-2', '2026-10-22-page-eve#EVE.DB-1'], 'x-captures.2'],
  ['R-JI', ['2026-10-22-page-eve#EVE.Q-B', '2026-10-22-page-eve#EVE.Q-L'], 'x-rulings.4'],
  ['R-JJ', ['2026-10-22-batch-z12#CHAT-75.QN', '2026-10-22-page-eve#EVE.Q-N'], 'x-rulings.4'],
  ['R-JN', ['2026-10-22-page-eve#EVE.Q-J', '2026-10-22-page-eve#EVE.L2P-3'], 'x-rulings.4'],
  ['R-JP', ['2026-10-22-page-eve#EVE.NIGHT-1'], 'x-captures.1'],
  ['R-JQ', ['2026-10-22-page-eve#EVE.P3-Q15', '2026-10-22-page-eve#EVE.P3-Q16'], 'x-stages.2'],
  ['R-JO', ['2026-10-22-batch-z14#CHAT-77.freeze'], 'x-rulings.4'],
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
  it('R-IZ carries the CHAT-73.nohalt note; M-322 the CHAT-72 floor; M-332 and M-333 the CHAT-74 intake', () => {
    expect(rowOf(A, 'R-IZ')).toContain('2026-10-22-batch-z10#CHAT-73.nohalt');
    expect(rowOf(M, 'M-322')).toContain('2026-10-22-batch-z9#CHAT-72.floor1');
    for (const n of ['IN1', 'IN2', 'IN3', 'IN5']) expect(rowOf(M, 'M-332')).toContain(`CHAT-74.${n}`);
    expect(rowOf(M, 'M-333')).toContain('CHAT-74.IN4');
  });
  it('the Evening Rulings page cards each sit on a Spec 69a, 131 or 124a row', () => {
    const all = M + A + read('docs/specs/01-pipeline/131_lot_configuration_policy.md');
    for (const id of ['R5-1', 'R5-5', 'M324-G', 'L2P-1', 'P3-Q4', 'P3-Q7', 'V39-1', 'Q-KG3', 'Q-O']) expect(all, id).toContain(`2026-10-22-page-eve#EVE.${id}`);
    expect(rowOf(M, 'M-334')).toContain('2026-10-22-batch-z13#CHAT-76.R8-5');
    expect(rowOf(M, 'M-347')).toContain('2026-10-22-batch-z15#CHAT-78.R6-3');
  });
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
