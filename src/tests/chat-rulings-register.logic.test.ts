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
const L131 = read('docs/specs/01-pipeline/131_lot_configuration_policy.md');
const S68 = read('docs/specs/01-pipeline/68_mcbylaw_standard.md');
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
  ['R-JR', ['2026-10-23-batch-a#CHAT-80.QP'], 'x-rulings.4'],
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
  it('CHAT-79..81 are recorded on Spec 69a, 131 rows', () => {
    expect(rowOf(M, 'M-346')).toContain('2026-10-22-batch-z16#CHAT-79.KG4');
    for (const id of ['FAM-ALL', 'R9-ALL', 'R10-ALL', 'R11-1', 'R12-ALL', 'SCOPE-1', 'P3-Q11', 'CITE-1']) expect(M, id).toContain(`2026-10-23-batch-b#CHAT-81.${id}`);
    expect(read('docs/specs/01-pipeline/131_lot_configuration_policy.md')).toContain('2026-10-23-batch-b#CHAT-81.Q-D');
  });
  it('CHAT-82 sits on R-JP; CHAT-83 on M-349 and M-350', () => {
    expect(rowOf(A, 'R-JP')).toContain('2026-10-23-batch-c#CHAT-82.night-go');
    expect(rowOf(M, 'M-349')).toContain('2026-10-23-batch-d#CHAT-83.W-2');
    expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-d#CHAT-83.NAMED-1');
    expect(rowOf(M, 'M-350')).toContain('no accuracy loss');
  });
  it('CHAT-84 sits on M-350 and M-322', () => {
    for (const id of ['NAMED-1b', 'TWIN-1']) expect(rowOf(M, 'M-350')).toContain(`2026-10-23-batch-e#CHAT-84.${id}`);
    expect(rowOf(M, 'M-322')).toContain('2026-10-23-batch-e#CHAT-84.S22-1');
  });
  it('CHAT-84.TWIN-1 supersedes M-251 (CHAT-29.F-SC-7) for 900.3.10(70)(B), as a dated note on M-251', () => {
    expect(rowOf(M, 'M-251')).toContain('**Dated note 2026-10-23 (`2026-10-23-batch-e#CHAT-84.TWIN-1`):**');
    expect(rowOf(M, 'M-251')).toContain('SUPERSEDED for 900.3.10(70)(B)');
  });
  it('CHAT-85 sits on M-336; CHAT-86 on M-138 and M-349', () => {
    expect(rowOf(M, 'M-336')).toContain('2026-10-23-batch-f#CHAT-85.no-more-exceptions');
    expect(rowOf(M, 'M-138')).toContain('2026-10-23-batch-g#CHAT-86.whole-street');
    expect(rowOf(M, 'M-349')).toContain('2026-10-23-batch-g#CHAT-86.bay-window');
  });
  it('CHAT-87 sits on M-350', () => {
    expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-h#CHAT-87.NAMED-1c');
  });
  it('CHAT-93 (batch n): RS-1 withdrawal on R-II; F1 R-HQ; Q-H6 R-HR; held readings R-JG; Q-H1 R-JM; new rows R-JV..R-JY; E-1..E-4 on M-350, M-285, M-336; each conditional entry cites CHAT-93.condition', () => {
    const N = '2026-10-23-batch-n#CHAT-93.';
    expect(rowOf(A, 'R-II')).toContain(N + 'RS-1');
    for (const [row, ids] of [['R-HQ', ['F1']], ['R-HR', ['Q-H6']], ['R-JG', ['held-readings']], ['R-JM', ['Q-H1']], ['R-JV', ['F3', 'F2']], ['R-JW', ['F4']], ['R-JX', ['CPC-Q1', 'CPC-D4-D11', 'Q-CPC-2']], ['R-JY', ['Q-H4']]] as Array<[string, string[]]>) {
      const r = rowOf(A, row);
      for (const id of ids) expect(r, row + ' ' + id).toContain(N + id);
      expect(r, row + ' condition').toContain(N + 'condition');
    }
    for (const [row, line] of [['R-JV', 'core.6'], ['R-JW', 'core.8'], ['R-JX', 'materializer.1'], ['R-JY', 'link.2']]) {
      expect(map.rules.find((r) => r.id === row)?.handbook_line).toBe(line);
    }
    expect(rowOf(M, 'M-350')).toContain(N + 'E-1');
    expect(rowOf(M, 'M-350')).toContain(N + 'E-2');
    expect(rowOf(M, 'M-285')).toContain(N + 'E-3');
    expect(rowOf(M, 'M-336')).toContain(N + 'E-4');
    expect(JSON.stringify(map.lines.find((l) => l.id === 'x-v3.2'))).not.toContain('CHAT-92');
  });
  it('CHAT-94 (a dated note on R-EQ) sits on R-JQ with the CHAT-93 condition, and §B-AM names it', () => {
    expect(rowOf(A, 'R-JQ')).toContain('2026-10-23-batch-o#CHAT-94.P3-HOLD-1');
    expect(rowOf(A, 'R-JQ')).toContain('2026-10-23-batch-n#CHAT-93.condition');
    expect(A).toContain('R-EQ dated note CHAT-94.P3-HOLD-1');
  });
  it('CHAT-95 X-1 sits on M-285, X-2..X-5 on M-350, each with the CHAT-93 condition', () => {
    expect(rowOf(M, 'M-285')).toContain('2026-10-23-batch-p#CHAT-95.X-1');
    for (const x of ['X-2', 'X-3', 'X-4', 'X-5']) expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-p#CHAT-95.' + x);
    expect(rowOf(M, 'M-285')).toContain('2026-10-23-batch-n#CHAT-93.condition');
    expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-n#CHAT-93.condition');
  });
  it('CHAT-96: NAMED-FAM on M-350; CLP-Q2 on R-HQ; CLP-Q3 on R-JQ (R-EQ carrier); new rows R-JZ (enricher.2), R-KA (x-captures.2); each cites the CHAT-93 condition', () => {
    const N = '2026-10-23-batch-q#CHAT-96.';
    const C = '2026-10-23-batch-n#CHAT-93.condition';
    for (const [text, row, id] of [[M, 'M-350', 'NAMED-FAM'], [A, 'R-HQ', 'CLP-Q2'], [A, 'R-JQ', 'CLP-Q3'], [A, 'R-JZ', 'CLP-Q1'], [A, 'R-KA', 'CLP-Q4']] as Array<[string, string, string]>) {
      expect(rowOf(text, row), row).toContain(N + id);
      expect(rowOf(text, row), row).toContain(C);
    }
    expect(map.rules.find((r) => r.id === 'R-JZ')?.handbook_line).toBe('enricher.2');
    expect(map.rules.find((r) => r.id === 'R-KA')?.handbook_line).toBe('x-captures.2');
  });
  it('CHAT-97 (B′) sits on R-HQ beside the CHAT-96.CLP-Q2 note it supersedes', () => {
    const r = rowOf(A, 'R-HQ');
    expect(r).toContain('2026-10-23-batch-r#CHAT-97.CLP-Q2-B2');
    expect(r).toContain('2026-10-23-batch-q#CHAT-96.CLP-Q2');
    expect(r).toContain('2026-10-23-batch-n#CHAT-93.condition');
  });
  it('CHAT-98: LEGACY-EDIT, Q-LAND-3 on R-JQ; P-Q1 on R-JB (R-EN carrier); P-Q2, P-Q4 on R-II; 1169-KEEP on M-350 and M-336; L-UNITS on M-350', () => {
    const N = '2026-10-23-batch-s#CHAT-98.';
    for (const [text, row, id] of [[A, 'R-JQ', 'LEGACY-EDIT'], [A, 'R-JQ', 'Q-LAND-3'], [A, 'R-JB', 'P-Q1'], [A, 'R-II', 'P-Q2'], [A, 'R-II', 'P-Q4'], [M, 'M-350', '1169-KEEP'], [M, 'M-336', '1169-KEEP'], [M, 'M-350', 'L-UNITS']] as Array<[string, string, string]>) {
      expect(rowOf(text, row), row + ' ' + id).toContain(N + id);
    }
  });
  it('CHAT-100.L-INTERIOR: dated note on M-285 (amends line-any) and supersede note on M-350 (CHAT-98.L-UNITS, interior lots only), with the CHAT-93 condition', () => {
    for (const row of ['M-285', 'M-350']) {
      expect(rowOf(M, row), row).toContain('2026-10-23-batch-u#CHAT-100.L-INTERIOR');
      expect(rowOf(M, row), row).toContain('2026-10-23-batch-n#CHAT-93.condition');
    }
  });
  it('CHAT-101..120 (batches v, w): each ruling sits on its carrier row; CHAT-102/113 is row M-358', () => {
    const V = '2026-10-23-batch-v#';
    const W = '2026-10-24-batch-w#';
    const cases: Array<[string, string, string]> = [
      [A, 'R-KB', V + 'CHAT-101.MIG-290'],
      [A, 'R-JJ', W + 'CHAT-103.L2-TIMEOUT-1'], [A, 'R-JJ', W + 'CHAT-114.L2-OOM-1'],
      [M, 'M-285', W + 'CHAT-104.STREET-DIR'], [M, 'M-350', W + 'CHAT-104.STREET-DIR'],
      [A, 'R-JD', W + 'CHAT-105.V3MERGE-VALIDATE'], [A, 'R-JD', W + 'CHAT-119.LEDGER-HEADER'],
      [A, 'R-JH', W + 'CHAT-106.DB1-DROP'], [A, 'R-IZ', W + 'CHAT-107.LANE-REPORT-WRITE'],
      [A, 'R-JY', W + 'CHAT-108.RARMS-Q1'], [A, 'R-KA', W + 'CHAT-109.RARMS-Q2'], [A, 'R-KA', W + 'CHAT-116.R3-COLUMN'],
      [A, 'R-JB', W + 'CHAT-110.RARMS-Q3'], [A, 'R-JM', W + 'CHAT-111.CPP-Q1'], [M, 'M-169', W + 'CHAT-112.FLAG-NULL'],
      [M, 'M-358', V + 'CHAT-102.P3-FORMULA-TESTS'], [M, 'M-358', W + 'CHAT-113.CHAT-102-ROW'],
      [A, 'R-IP', W + 'CHAT-115.L2-EVID-1'], [A, 'R-IP', W + 'CHAT-120.M60-DEPENDENCY'],
      [M, 'M-327', W + 'CHAT-117.GOLDEN-NOTICE-FIRST'], [A, 'R-JP', W + 'CHAT-118.Q-114b'],
    ];
    for (const [text, row, cite] of cases) expect(rowOf(text, row), row + ' ' + cite).toContain(cite);
    // moved-block rows keep their bytes; each note names its moved row in §B-AM
    const bam = A.split('\n').filter((l) => l.startsWith('- **R-'));
    for (const id of ['CHAT-101.MIG-290', 'CHAT-103.L2-TIMEOUT-1', 'CHAT-114.L2-OOM-1', 'CHAT-110.RARMS-Q3', 'CHAT-116.R3-COLUMN', 'CHAT-118.Q-114b']) expect(bam.some((l) => l.includes(id)), id).toBe(true);
    expect(read('docs/reports/defect-ledger.md')).toContain(W + 'CHAT-119.LEDGER-HEADER');
    // N7: the 69a §1a dated-note row on M-60 (empty first cell) carries CHAT-120 and CHAT-115
    const m60Notes = M.split('\n').filter((l) => l.startsWith('| | *Dated note 2026-10-24 (M-60;'));
    expect(m60Notes.some((l) => l.includes(W + 'CHAT-120.M60-DEPENDENCY') && l.includes(W + 'CHAT-115.L2-EVID-1'))).toBe(true);
  });
  it('CHAT-121..123 (batch x): 125m on R-JJ, M-60 RATIFIED note in 69a §1a + correction on R-IP, pointers on M-326 and R-KB', () => {
    const X = '2026-10-24-batch-x#';
    const cases: Array<[string, string, string]> = [
      [A, 'R-JJ', X + 'CHAT-121.CEILING-125'], [A, 'R-IP', X + 'CHAT-122.M60-RATIFIED'],
      [M, 'M-326', X + 'CHAT-123.IMPORT-PLACEMENTS'], [A, 'R-KB', X + 'CHAT-123.IMPORT-PLACEMENTS'],
    ];
    for (const [text, row, cite] of cases) expect(rowOf(text, row), row + ' ' + cite).toContain(cite);
    const status = M.split('\n').find((l) => l.startsWith('| | *Dated note 2026-10-24 (M-60;') && l.includes(X + 'CHAT-122.M60-RATIFIED')) ?? '';
    expect(status).toContain('RATIFIED 2026-10-08');
    expect(A.split('\n').some((l) => l.startsWith('- **R-AQ') && l.includes('CHAT-121.CEILING-125'))).toBe(true);
  });
  it('CHAT-124..129 (batch y): notes on R-IP, R-IZ, R-KA, R-IX, the M-60 status row and three §B-AM bullets (R-BR/R-DN, R-DK, R-BG); CHAT-126 is row R-KC on x-captures.1', () => {
    const Y = '2026-10-24-batch-y#';
    const cases: Array<[string, string, string]> = [
      [A, 'R-IP', Y + 'CHAT-124.M60-DISPLAY'], [A, 'R-IZ', Y + 'CHAT-125.LANE-REPORTS-TEXT'], [A, 'R-KC', Y + 'CHAT-126.PRECAP-1'],
      [A, 'R-IP', Y + 'CHAT-127.L2-WIT-1'], [A, 'R-KA', Y + 'CHAT-128.L2-COH-1'], [A, 'R-IX', Y + 'CHAT-129.L2-NN-1'],
    ];
    for (const [text, row, cite] of cases) expect(rowOf(text, row), row + ' ' + cite).toContain(cite);
    expect(M.split('\n').some((l) => l.startsWith('| | *Dated note 2026-10-24 (M-60;') && l.includes(Y + 'CHAT-124.M60-DISPLAY'))).toBe(true);
    expect(A.split('\n').some((l) => l.startsWith('- **R-BR and R-DN') && l.includes('CHAT-128.L2-COH-1'))).toBe(true);
    expect(A.split('\n').some((l) => l.startsWith('- **R-DK') && l.includes('CHAT-129.L2-NN-1'))).toBe(true);
    expect(A.split('\n').some((l) => l.startsWith('- **R-BG') && l.includes('CHAT-127.L2-WIT-1'))).toBe(true);
    expect(map.rules.find((r) => r.id === 'R-KC')?.handbook_line).toBe('x-captures.1');
  });
  it('CHAT-130..132 (batch 2026-10-25-a, verify-48 F-1..F-3): R1 force env on R-JP + §B-AM bullet on R-DQ, CHAT-128 confirmation on R-KA, R-KC correction', () => {
    const Z = '2026-10-25-batch-a#';
    expect(rowOf(A, 'R-JP')).toContain(Z + 'CHAT-130.R1-FORCE');
    expect(rowOf(A, 'R-KA')).toContain(Z + 'CHAT-131.CHAT128-CONFIRM');
    expect(rowOf(A, 'R-KC')).toContain(Z + 'CHAT-132.RKC-CORRECTION');
    expect(A.split('\n').some((l) => l.startsWith('- **R-DQ: CHAT-118.Q-114b is amended by CHAT-130'))).toBe(true);
  });
  it('CHAT-133..139 (batch 2026-10-25-b): B10 notes on M-357 / M-326 / M-321, P3-7 on R-JP, CPP on R-JM, RARMS on R-JY', () => {
    const B = '2026-10-25-batch-b#';
    const cases: Array<[string, string, string]> = [
      [M, 'M-357', B + 'CHAT-133.B10-ID'], [M, 'M-357', B + 'CHAT-134.B10-REUPLOAD-FACTS'], [M, 'M-326', B + 'CHAT-135.B10-CONSENT'],
      [M, 'M-321', B + 'CHAT-136.B10-PARSER'], [A, 'R-JP', B + 'CHAT-137.P37-FIXES'], [A, 'R-JM', B + 'CHAT-138.CPP-Q1-D2'], [A, 'R-JY', B + 'CHAT-139.RARMS-Q1-Q3'],
    ];
    for (const [text, row, cite] of cases) expect(rowOf(text, row), row + ' ' + cite).toContain(cite);
  });
  it('CHAT-140..146 (batch 2026-10-25-c): P3-7 on R-JP / M-189, floors on M-322, ALPD on R-JW, P2 on M-332, plan facts on M-326, the hook on R-IY + a §B-AM bullet on R-AG', () => {
    const C = '2026-10-25-batch-c#';
    const cases: Array<[string, string, string]> = [
      [A, 'R-JP', C + 'CHAT-140.P37-GATED'], [M, 'M-189', C + 'CHAT-141.P37-STORAGE'], [M, 'M-322', C + 'CHAT-142.B10-FLOORS'],
      [A, 'R-JW', C + 'CHAT-143.ALPD-CHAIN'], [M, 'M-332', C + 'CHAT-144.P2-DISAGREE'], [M, 'M-326', C + 'CHAT-145.PLANFACT-CDE'], [A, 'R-IY', C + 'CHAT-146.HOOK-LVEFFECT'],
    ];
    for (const [text, row, cite] of cases) expect(rowOf(text, row), row + ' ' + cite).toContain(cite);
    expect(A.split('\n').some((l) => l.startsWith('- **R-AG: the cheap pre-commit gates gain'))).toBe(true);
  });
  it('CHAT-147 (batch 2026-10-25-d): RJY-Q1/Q2 on R-JY (compute exports, name-equality link plan, inheritance a later arm)', () => {
    expect(rowOf(A, 'R-JY')).toContain('2026-10-25-batch-d#CHAT-147.RJY-Q1-Q2');
    expect(rowOf(A, 'R-JY')).toContain('buildStartCountsSql(descriptor)');
  });
  it('CHAT-148..150 (batch 2026-10-25-e): re-pin on M-326, re-freeze night on R-JY, hook budget on R-IY', () => {
    const E = '2026-10-25-batch-e#';
    expect(rowOf(M, 'M-326')).toContain(E + 'CHAT-148.M326-REPIN');
    expect(rowOf(A, 'R-JY')).toContain(E + 'CHAT-149.REFREEZE-NIGHT');
    expect(rowOf(A, 'R-IY')).toContain(E + 'CHAT-150.HOOK-BUDGET');
  });
  it('CHAT-151 (batch 2026-10-25-f): the link_coa inheritance arm on R-JY', () => {
    expect(rowOf(A, 'R-JY')).toContain('2026-10-25-batch-f#CHAT-151.INHERIT-ARM');
  });
  it('CHAT-152..159 (batch 2026-10-25-g): the seven cards and the WF3 cards', () => {
    const G = '2026-10-25-batch-g#';
    expect(rowOf(M, 'M-169')).toContain(G + 'CHAT-152.L2-USE-SCOPE');
    expect(rowOf(A, 'R-JZ')).toContain(G + 'CHAT-153.RJZ-AMEND');
    expect(rowOf(A, 'R-JQ')).toContain(G + 'CHAT-154.CLP-URGENT-CATCHUP');
    expect(rowOf(A, 'R-HQ')).toContain(G + 'CHAT-155.CLP-RETIREMENTS');
    expect(rowOf(M, 'M-326')).toContain(G + 'CHAT-156.M326-EXAMINED-FALLBACK');
    expect(rowOf(M, 'M-321')).toContain(G + 'CHAT-157.SPLIT-DECISION-ROUND');
    expect(rowOf(A, 'R-IY')).toContain(G + 'CHAT-158.HOOK-FIX-A');
    expect(rowOf(A, 'R-JW')).toContain(G + 'CHAT-159.WF3-CARDS');
  });
  it('CHAT-160..166 (batch 2026-10-26-h): the scorer card answers', () => {
    const H = '2026-10-26-batch-h#';
    expect(rowOf(M, 'M-326')).toContain(H + 'CHAT-160.M326-PER-FIGURE');
    expect(rowOf(M, 'M-326')).toContain(H + 'CHAT-161.M326-PARCEL-NOT-DISCLOSED');
    expect(rowOf(M, 'M-313')).toContain(H + 'CHAT-162.M313-EVERY-SOURCE');
    expect(rowOf(M, 'M-326')).toContain(H + 'CHAT-163.M326-SITE-PLAN');
    expect(rowOf(M, 'M-321')).toContain(H + 'CHAT-164.UNKNOWN-SOURCE-ROUND');
    expect(rowOf(M, 'M-326')).toContain(H + 'CHAT-165.HELD-UNREAD-DISCLOSED');
    expect(rowOf(M, 'M-305')).toContain(H + 'CHAT-166.SCORER-OUTPUTS-KEPT');
  });
  it('CHAT-167..168 (batch 2026-10-26-i): ENRICHER derive held on R-JZ, row errors class 22/23 on R-JZ + a §B-AM bullet on R-DM', () => {
    const I = '2026-10-26-batch-i#';
    expect(rowOf(A, 'R-JZ')).toContain(I + 'CHAT-167.RJZ-D1-HOLD');
    expect(rowOf(A, 'R-JZ')).toContain(I + 'CHAT-168.RDM-ROW-ERROR-CLASS');
    expect(A.split('\n').some((l) => l.startsWith('- **R-DM: a genuine row error is class 22 or 23 only'))).toBe(true);
  });
  it('CHAT-169..170 (batch 2026-10-26-j): split round covers three wording families; precision samples carried forward, on M-321', () => {
    const J = '2026-10-26-batch-j#';
    expect(rowOf(M, 'M-321')).toContain(J + 'CHAT-169.SPLIT-THREE-FAMILIES');
    expect(rowOf(M, 'M-321')).toContain(J + 'CHAT-170.PRECISION-CARRY-FORWARD');
  });
  it('CHAT-171 (batch 2026-10-26-k): net-new census equality covers the paths net-new reads, on R-IY + a §B-AM bullet on R-EC', () => {
    const K = '2026-10-26-batch-k#';
    expect(rowOf(A, 'R-IY')).toContain(K + 'CHAT-171.NETNEW-CENSUS-SCOPE');
    expect(A.split('\n').some((l) => l.startsWith('- **R-EC: net-new\'s one-pass equality covers the paths net-new reads'))).toBe(true);
  });
  it('CHAT-172 (batch 2026-10-26-l): split parser reads conditions text up to the reasons, fail-closed; on M-321 + a dated note under Spec 129 (j)', () => {
    const L = '2026-10-26-batch-l#';
    expect(rowOf(M, 'M-321')).toContain(L + 'CHAT-172.SPLIT-CONDITIONS-READ');
    const S = read('docs/specs/01-pipeline/129_source_coa_notices.md').split('\n');
    const j = S.findIndex((l) => l.startsWith('  (j) The decision is read from the decision paragraph only.'));
    expect(j).toBeGreaterThan(-1);
    expect(S[j + 1]).toContain(L + 'CHAT-172.SPLIT-CONDITIONS-READ');
  });
  it('CHAT-173..181 (batch 2026-10-26-m): operator answers 1-5 (R-1 c, enricher.2 held note, WF3 parked, notice copies deleted, use-scope G1/G2/G5/review)', () => {
    const N = '2026-10-26-batch-m#';
    expect(rowOf(M, 'M-326')).toContain(N + 'CHAT-173.R1-NO-PARCEL-SHOWN');
    expect(rowOf(A, 'R-JZ')).toContain(N + 'CHAT-174.ENRICHER2-HELD-NOTE');
    const H = read('docs/specs/01-pipeline/132_step_standard_handbook.md').split('\n').find((l) => l.startsWith('- **enricher.2**')) ?? '';
    expect(H).toContain(N + 'CHAT-174.ENRICHER2-HELD-NOTE');
    expect(rowOf(A, 'R-JW')).toContain(N + 'CHAT-175.WF3-FORECASTS-PARKED');
    expect(rowOf(A, 'R-JW')).toContain(N + 'CHAT-176.WF3-WSIB-PARKED');
    expect(rowOf(M, 'M-305')).toContain(N + 'CHAT-177.NOTICE-COPIES-DELETED');
    for (const id of ['CHAT-178.L2-G1-USE-KEYING-ROUND', 'CHAT-179.L2-G2-LAWFULLY-EXISTING-ROUND', 'CHAT-180.L2-G5-DISCLOSURE-ON-READ', 'CHAT-181.L2-REVIEW-UNITS-ELEMENT']) expect(rowOf(M, 'M-169')).toContain(N + id);
  });
  it('CHAT-182..183 (batch 2026-10-26-n): G3 use-list keying round on M-169 + M-182; CHAT-172 corrected per family on M-321 + a Spec 129 (j) note', () => {
    const P = '2026-10-26-batch-n#';
    expect(rowOf(M, 'M-169')).toContain(P + 'CHAT-182.L2-G3-USE-LIST-KEYING-ROUND');
    expect(rowOf(M, 'M-182')).toContain(P + 'CHAT-182.L2-G3-USE-LIST-KEYING-ROUND');
    expect(rowOf(M, 'M-321')).toContain(P + 'CHAT-183.SPLIT-CONDITIONS-PER-FAMILY');
    const S = read('docs/specs/01-pipeline/129_source_coa_notices.md').split('\n');
    const j = S.findIndex((l) => l.startsWith('  (j) The decision is read from the decision paragraph only.'));
    expect(j).toBeGreaterThan(-1);
    expect(S[j + 2]).toContain(P + 'CHAT-183.SPLIT-CONDITIONS-PER-FAMILY');
  });
  it('CHAT-184 (batch 2026-10-26-o): CR use lists — (A) stays as M-100 rules, (B) takes the CHAT-182 form; on M-100, M-169 and M-182', () => {
    const P = '2026-10-26-batch-o#CHAT-184.L2-CR-USE-LISTS';
    for (const id of ['M-100', 'M-169', 'M-182']) expect(rowOf(M, id)).toContain(P);
  });
  it('CHAT-185..186 (batch 2026-10-26-p): specific uses read as any-of; the permission also discloses the G1 set-asides and the G2 conversion caveat; on M-159, M-244, M-158 and M-169', () => {
    const P = '2026-10-26-batch-p#';
    for (const id of ['M-159', 'M-244']) expect(rowOf(M, id)).toContain(P + 'CHAT-185.L2-SPECIFIC-USE-ANY-OF');
    for (const id of ['M-158', 'M-159', 'M-169']) expect(rowOf(M, id)).toContain(P + 'CHAT-186.L2-PERMISSION-SET-ASIDE-DISCLOSURES');
  });
  it('CHAT-189..191 (batch 2026-10-26-r): CLP derive cards on R-JZ / R-DY, cost-cite on R-IH / R-KC / new R-KD, coa ledger on R-JD / R-GN / new R-KE and the bundled night', () => {
    const R = '2026-10-26-batch-r#';
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']) expect(rowOf(A, 'R-JZ')).toContain(R + 'CHAT-189.CLPD-' + q);
    for (const q of ['Q1', 'Q4', 'Q5a', 'Q5b']) expect(rowOf(A, 'R-IH')).toContain(R + 'CHAT-190.CCC-' + q);
    expect(rowOf(A, 'R-KC')).toContain(R + 'CHAT-190.CCC-Q6');
    expect(rowOf(A, 'R-KD')).toContain(R + 'CHAT-190.CCC-Q1');
    expect(rowOf(A, 'R-KE')).toContain(R + 'CHAT-191.CL-Q4');
    for (const q of ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12']) expect(rowOf(A, 'R-JD')).toContain(R + 'CHAT-191.CL-' + q + '`');
    const bam = (lead: string) => A.split('\n').find((l) => l.startsWith(lead)) ?? '';
    expect(bam('- **R-DY (c) and (a), enrich arm')).toContain(R + 'CHAT-189.CLPD-Q8');
    expect(bam('- **R-GN dated notes CHAT-191.CL-Q2 and CHAT-191.CL-Q12')).toContain('names CCS-D6 only');
    expect(bam('- **R-CE and R-FE: assert_coa_freshness')).toContain(R + 'CHAT-190.CCC-Q4');
    expect(bam('**Bundled RE-FREEZE night (operator y 2026-10-20')).toContain(R + 'CHAT-191.CL-Q5');
    const H = read('docs/specs/01-pipeline/132_step_standard_handbook.md').split('\n').find((l) => l.startsWith('- **enricher.2**')) ?? '';
    expect(H).toContain(R + 'CHAT-189.CLPD-Q5');
    expect(map.rules.find((r) => r.id === 'R-KD')?.handbook_line).toBe('core.6');
    expect(map.rules.find((r) => r.id === 'R-KE')?.handbook_line).toBe('x-v3.3');
  });
  it('CHAT-192 (batch 2026-10-26-s): the 17 permits-card answers PW1-Q1..Q17 are dated notes on R-EN, hosted on R-JB (R-EN sits in moved block §B24), with the section B-AM bullet', () => {
    const S = '2026-10-26-batch-s#CHAT-192.PW1-Q';
    const jb = rowOf(A, 'R-JB');
    for (let q = 1; q <= 17; q++) expect(jb).toContain(S + q + '`');
    const bam = A.split('\n').find((l) => l.startsWith('- **R-EN dated notes CHAT-192.PW1-Q1 to CHAT-192.PW1-Q17')) ?? '';
    for (let q = 1; q <= 17; q++) expect(bam).toContain(S + q + '`');
    expect(bam).toContain('12 compliant, 5 compliant with a disclosed rule change (Q3, Q9, Q11, Q12, Q15)');
    expect(bam).toContain('PM-D3');
    expect(bam).toContain('value re-based from measurement');
    expect(bam).toContain('ratified per entry by this ruling');
    expect(bam).toContain('dated ruling on the card answer');
    expect(bam).toContain('no reader of the last permits load still reads `sync_runs`');
    expect(jb).toContain('departed_status');
    expect(jb).toContain('Spec 50 amendment');
  });
  it('CHAT-194 (batch 2026-10-26-u): the use-scope ruling USO-Q1 and the census USO-Q1a..d are a dated note on M-169 (M-34 sits in moved block M19); Q2..Q5 are recorded DEFERRED and Q6 is routed to the Oracle-B lane', () => {
    const S = '2026-10-26-batch-u#CHAT-194.USO-';
    const m = rowOf(M, 'M-169');
    for (const id of ['Q1', 'Q1a', 'Q1b', 'Q1c', 'Q1d', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) expect(m).toContain(S + id + '`');
    expect(m).toContain('closes the base type list for every other class');
    expect(m).toContain('900.3.10(200) is a count limit, not a closure');
    expect(m).toContain('900.5.10(361)(G) is a closure to townhouse');
    expect(m).toContain('900.6.10(365)(A) is a closure to apartment building');
    expect(m).toContain('left untouched (deferred with USO-Q2)');
    expect(m).toContain('DEFERRED, with no build until Phase 2/3 is complete');
    expect(m).toContain('routed as a card to the Oracle-B lane, no ruling on the build');
  });
  it('CHAT-164.READ-SOURCE and CHAT-164.CONTRADICTED (batch 2026-10-29-y): a keyed confirmed figure counts as read, its source recorded per figure and auto-filled only where one document prints the value; a contradicting keyed value is read and the other figure stays disclosed; dated note on M-321', () => {
    const S = '2026-10-29-batch-y#CHAT-164.';
    const m = rowOf(M, 'M-321');
    expect(m).toContain(S + 'READ-SOURCE`');
    expect(m).toContain(S + 'CONTRADICTED`');
    expect(m).toContain('A keyed figure with status confirmed counts as read against the case\'s documents');
    expect(m).toContain('auto-filled only where exactly one document prints the value');
    expect(m).toContain('any mismatch goes to the operator');
    expect(m).toContain('No page number is required');
    expect(m).toContain('Where a keyed value contradicts an unknown-source figure, the keyed value is read and the other figure stays disclosed.');
  });
  it('CHAT-197.FS-Q1..FS-Q3 (batch 2026-10-29-z): no-number rows stay NO ANSWER, apartment-only clauses are NOT MODELLED, A0562 is a corner lot; dated note on M-322', () => {
    const S = '2026-10-29-batch-z#CHAT-197.';
    const m = rowOf(M, 'M-322');
    expect(m).toContain(S + 'FS-Q1`');
    expect(m).toContain(S + 'FS-Q2`');
    expect(m).toContain(S + 'FS-Q3`');
    expect(m).toContain('A by-law requirement the notice states without a number stays NO ANSWER until the evaluator answers it; the scorer never reclassifies it to leave the denominator.');
    expect(m).toContain('A clause that applies only to a building type outside McBylaws scope (apartments) is NOT MODELLED with that reason, never NO ANSWER.');
    expect(m).toContain('800.50(150)(B)');
  });
  it('CHAT-198.NN-Q1..NN-Q5 (batch 2026-10-29-aa): ANSWERED class, plan-fact suite height and separation, main-building floor area input, user neighbour setbacks, separate round; dated notes on M-322, M-286, M-82, M-256', () => {
    const S = '2026-10-29-batch-aa#CHAT-198.';
    const q = rowOf(M, 'M-322');
    expect(q).toContain(S + 'NN-Q1`');
    expect(q).toContain(S + 'NN-Q5`');
    expect(q).toContain("A row the evaluator answers but the notice gives no figure for counts as answered and is left out of accuracy; where the notice prints the other building's figure, that figure is the comparator.");
    expect(q).toContain("Rules that need the neighbours' buildings are Phase 3 work; a floor line that depends on them is owed to Phase 3 by a ratified row, not reclassified.");
    const h = rowOf(M, 'M-286');
    expect(h).toContain(S + 'NN-Q2`');
    expect(h).toContain('For validation against a notice the suite height and separation are the applicant\'s plan figures when held; the product still derives them from the maximum build (M-286).');
    const g = rowOf(M, 'M-82');
    expect(g).toContain(S + 'NN-Q3`');
    expect(g).toContain("A rule that compares a suite with the main building (house or semi-detached house) reads the main building's floor area from a declared input, filled from plan facts, then the user's footprint and storeys, then the maximum build.");
    const n = rowOf(M, 'M-256');
    expect(n).toContain(S + 'NN-Q4`');
    expect(n).toContain("Where the user supplies the neighbours' front setbacks they replace the footprint estimate; the estimate remains the fallback and is flagged needs survey.");
    expect(n).toContain("The front setback from averaging reads the user's neighbour setbacks, then the building-footprint estimate flagged needs survey, then a 6.0 m default flagged as a default; a missing neighbour figure never stops the calculation.");
    expect(n).toContain("The neighbours' front setbacks are the user's figures, else the building-footprint estimate plus the M-245 allowance of 1.0 m (both neighbours averaged, one side if only one is found), else 6.0 m; every estimated or default value is flagged needs survey.");
    expect(rowOf(M, 'M-245')).toContain("The neighbours' front setbacks are the user's figures, else the building-footprint estimate plus the M-245 allowance of 1.0 m (both neighbours averaged, one side if only one is found), else 6.0 m; every estimated or default value is flagged needs survey.");
    expect(n).toContain("Where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot's own building front setback plus 1.0 m and the median of the footprint estimates plus 1.0 m of other lots on the same street within the placeholder radius (one of the two if only one exists), else the same-zone median within the zone radius, else 6.0 m; always flagged needs survey, and never replaces a user figure or a neighbour estimate.");
    expect(rowOf(M, 'M-245')).toContain("Where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot's own building front setback plus 1.0 m and the median of the footprint estimates plus 1.0 m of other lots on the same street within the placeholder radius (one of the two if only one exists), else the same-zone median within the zone radius, else 6.0 m; always flagged needs survey, and never replaces a user figure or a neighbour estimate.");
  });
  it('CHAT-199 (batch 2026-10-29-ab): Phase 2 close, Gap 1, Phase 3 exit, engine hold, harness, missing rules, hidden numbers, night restore, use-scope findings, notice figure, by-law replacement; owed floor lines; P-2 notes', () => {
    const S = '2026-10-29-batch-ab#CHAT-199.';
    const want: Array<[string, string[], string]> = [
      ['M-359', ['P2C-Q1'], "Phase 2 closes on six items: overall floors, article floors met or owed to Phase 3 by a ratified row, use permission landed, the 25-case blind record, the P-2 scope check, and a merged full verify; the CoA link gate, SC-5 target, P-1 report test and §5a owed parts are Phase 3."],
      ['M-360', ['P2C-Q2', 'P2C-Q3', 'P2C-Q4', 'P2C-Q5', 'P2C-Q6'], "A test never asserts a red floor result; it stays red until a ruling moves the floor."],
      ['M-361', ['G1-Q1', 'G1-Q2', 'G1-Q3'], "An exception that sets no storey limit leaves the building limited by height alone."],
      ['M-362', ['MB13-PRIMARY', 'MB13-EXIT'], "no threshold is set after the results it judges."],
      ['M-363', ['P3H'], "P3-HOLD-1 ends: the max-build engine and its 40-test lock return to the branch together at MB-14."],
      ['M-364', ['HR'], "The blind harness scores by these six rules, fixed before any run."],
      ['M-365', ['MR-Q1', 'MR-Q2', 'MR-Q3', 'MR-Q4'], "When a design fact is unknown the evaluator computes both arms and shows both; it never fills the fact with a default."],
      ['M-366', ['MR-Q5', 'MR-Q6', 'MR-Q7', 'MR-Q8', 'MR-Q9', 'MR-ANC'], "Parking count and bicycle facilities are evaluated and reported as lot checks; they do not size the building envelope."],
      ['M-367', ['MB37'], "Until MB-38..MB-41 switch each field group, the old hard-coded values are not shown; the field reads 'being recalculated from the by-law'."],
      ['M-368', ['MB30'], "The night restore disables triggers on the tables it restores, within the restore transaction, and re-enables them before commit."],
      ['M-369', ['USO-Q2', 'USO-Q3', 'USO-Q4', 'USO-Q5'], "a lot-level gate reason such as named_lots_only outranks the class-level no_candidate"],
      ['M-370', ['MB03-Q1'], "where a sentence stays ambiguous the first figure is kept and the row is flagged for the operator."],
      ['M-371', ['MB48'], "Every product zoning number comes from a keyed by-law clause; an old constant with no clause found returns to the operator, never stays in use."],
      ['M-372', ['P2C-Q1'], 'OWED to Phase 3: cumulative 10.5.40 accuracy'],
      ['M-373', ['P2C-Q1'], 'OWED to Phase 3: cumulative 10.80.40 answered'],
      ['M-374', ['P2C-Q1'], 'OWED to Phase 3: cumulative pooled articles answered'],
      ['M-375', ['P2C-Q1'], 'in_force_basis'],
      ['M-376', ['SC-Q1', 'SC-Q2', 'SC-Q3'], "Every model value is a keyed by-law value or an externalized variable that is changeable, logged as a ruling and observable; a value citing a unit counts as keyed only when a test proves the unit holds it."],
    ];
    for (const [id, ids, text] of want) {
      const r = rowOf(M, id);
      for (const d of ids) expect(r).toContain(S + d + '`');
      expect(r).toContain(text);
    }
    expect(rowOf(M, 'M-327')).toContain(S + 'MB04`');
    expect(rowOf(M, 'M-327')).toContain(S + 'MB04-C`');
    expect(M).toContain('*Dated note 2026-10-29 (M-63; operator SC-Q1');
    expect(rowOf(M, 'M-376')).toContain('Semi-detached, semi houseplex and townhouse max-build scenarios are a recorded future build, not part of the current Phase 3 scope.');
    expect(rowOf(M, 'M-331')).toContain(S + 'P2C-Q1`');
    expect(rowOf(M, 'M-172')).toContain(S + 'MR-Q2`');
    for (const id of ['M-372', 'M-373', 'M-374']) expect(rowOf(M, id)).toMatch(/OWED to Phase 3 \(MB-\d+/);
  });
  it('CHAT-200 (batch 2026-10-29-ac): one check per stated limit, a condition figure is a condition; a definition figure is disclosed when relied on; dated note on M-370', () => {
    const S = '2026-10-29-batch-ac#CHAT-200.';
    const r = rowOf(M, 'M-370');
    expect(r).toContain(S + 'MB03-Q2`');
    expect(r).toContain(S + 'MB03-Q2-A`');
    expect(r).toContain('Dated note 2026-10-29 (M-370; operator MB03-Q2');
    expect(r).toContain('A requirement sentence yields one check per stated limit; a figure that defines when the rule applies is a condition, and when it is met every limit in the sentence applies.');
    expect(r).toContain('A definition figure that decides whether a rule applies (e.g. within 0.3 m of a building) is not a limit; when the build relies on it, the result discloses the definition and its clause.');
    expect(rowOf(M, 'M-376')).toContain(S + 'SC-Q4`');
    expect(rowOf(M, 'M-376')).toContain('Ravine provisions that change the maximum building are applied from keyed clauses and a TRCA top-of-bank source step, like corner and heritage lot facts; where the line is not held the result says so; Ch.658 is disclosed where it applies.');
  });
  it('CHAT-201 (batch 2026-10-29-ad): the maximum build is calculated for every design option and each result is shown with its option; dated note on M-172, OPEN wording in M-365 updated', () => {
    const S = '2026-10-29-batch-ad#CHAT-201.';
    const r = rowOf(M, 'M-172');
    expect(r).toContain(S + 'MR-Q2-P`');
    expect(r).toContain('Dated note 2026-10-29 (M-172; operator MR-Q2-P');
    expect(r).toContain("For each design choice the by-law treats differently (e.g. flat roof or not), the maximum build is calculated for every option and each result is shown with its option; M-172(3)'s silent default no longer applies to the maximum build.");
    expect(r).not.toContain('is OPEN and goes to the operator');
    expect(rowOf(M, 'M-365')).toContain(S + 'MR-Q2-P`');
    expect(rowOf(M, 'M-365')).not.toContain('OPEN, returned to the operator');
  });
  it('CHAT-202 (batch 2026-10-29-ad): a run-time column leaves a golden table_state only when declared excluded-with-reason in its Spec 121 #151a inventory before the first diff; dated note on M-369', () => {
    const r = rowOf(M, 'M-369');
    expect(r).toContain('2026-10-29-batch-ad#CHAT-202.MB45F-ROUTE`');
    expect(r).toContain('Dated note 2026-10-29 (M-369; operator MB-45f re-route');
    expect(r).toContain("A run-time column is excluded from a step's golden table_state only when declared excluded-with-reason in its Spec 121 #151a inventory before the first diff.");
  });
  it('CHAT-203 (batch 2026-10-29-ae): MB-53 rule text and dated note on M-285', () => {
    const r = rowOf(M, 'M-285');
    expect(r).toContain('2026-10-29-batch-ae#CHAT-203.MB-53`');
    expect(r).toContain('Dated note 2026-10-29 (M-285; operator MB-53');
    expect(r).toContain("The lot's frontage street name is a Layer 2 lot fact; clauses that name a street are evaluated from it.");
  });
  it('CHAT-204 (batch 2026-10-29-ae): MB-54 rule text and dated note on M-245', () => {
    const r = rowOf(M, 'M-245');
    expect(r).toContain('2026-10-29-batch-ae#CHAT-204.MB-54`');
    expect(r).toContain('Dated note 2026-10-29 (M-245; operator MB-54');
    expect(r).toContain("Front-yard averaging and the abutting-building clauses read the neighbours from parcel_abutments through the FS-SB1/FS-SB2 chain.");
  });
  it('CHAT-205 (batch 2026-10-29-ae): MB-55 rule text and dated note on M-213', () => {
    const r = rowOf(M, 'M-213');
    expect(r).toContain('2026-10-29-batch-ae#CHAT-205.MB-55`');
    expect(r).toContain('Dated note 2026-10-29 (M-213; operator MB-55');
    expect(r).toContain("By-law overlays that change the building (building setback overlay, holding symbol) are applied in Layer 2 and the max build; parking overlays feed the parking lot checks; use-only overlays and the irregular-lot flag are disclosed.");
  });
  it('CHAT-206 (batch 2026-10-29-ae): MB-56 rule text and dated note on M-158', () => {
    const r = rowOf(M, 'M-158');
    expect(r).toContain('2026-10-29-batch-ae#CHAT-206.MB-56`');
    expect(r).toContain('Dated note 2026-10-29 (M-158; operator MB-56');
    expect(r).toContain("Lawfully existing status is never inferred from footprint data; it is disclosed on ordinary lots and taken from a user input in the renovation scenario.");
  });
  it('CHAT-207 (batch 2026-10-29-af): M172-AM rule text and dated note on M-172', () => {
    const r = rowOf(M, 'M-172');
    expect(r).toContain('2026-10-29-batch-af#CHAT-207.M172-AM`');
    expect(r).toContain('Dated note 2026-10-29 (M-172; operator M172-AM');
    expect(r).toContain("Abutting-lot facts are read from the Spec 130 neighbour relation where it holds the neighbour, and remain user-supplied site facts where it does not (amends M-172(2)).");
  });
  it('CHAT-210 (batch 2026-10-30-ai): seven rulings, each a rule text and a dated note on its governing row; MB17-Q1 withdrawn on M-180', () => {
    let r;
    r = rowOf(M, 'M-180');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB17-Q1R`');
    expect(r).toContain('Dated note 2026-10-30 (M-180; operator ');
    expect(r).toContain("An exception applies to the building types it names and to those the by-law's applicability clause extends it to (M-180); MB17-Q1 is withdrawn.");
    r = rowOf(M, 'M-158');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB18-R1`');
    expect(r).toContain('Dated note 2026-10-30 (M-158; operator ');
    expect(r).toContain("Existing-lot minimums are judged in the verdict layer, never as a Layer 2 failure of an existing lot (M-158).");
    r = rowOf(M, 'M-256');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB54-Q`');
    expect(r).toContain('Dated note 2026-10-30 (M-256; operator ');
    expect(r).toContain("Layer 2 leaves front-yard averaging undecided where neighbour data is absent; Phase 3 applies the FS-SB chain, flagged.");
    r = rowOf(M, 'M-213');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB55-Q`');
    expect(r).toContain('Dated note 2026-10-30 (M-213; operator ');
    expect(r).toContain("600.10.10 District A is keyed in its own round; the holding symbol is normalised to one stored form from its source.");
    r = rowOf(M, 'M-369');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB45D-Q3U`');
    expect(r).toContain('Dated note 2026-10-30 (M-369; operator ');
    expect(r).toContain("A lot whose Sixplex Overlay membership is not held is undecided for 600.60 units.");
    r = rowOf(M, 'M-364');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB17-T`');
    expect(r).toContain('Dated note 2026-10-30 (M-364; operator ');
    expect(r).toContain("The applicant is compared, per measure, against the maximum across our options for its building type.");
    r = rowOf(M, 'M-209');
    expect(r).toContain('2026-10-30-batch-ai#CHAT-210.MB-57-LANE`');
    expect(r).toContain('Dated note 2026-10-30 (M-209; operator ');
    expect(r).toContain("Lane abutting length is computed from the lot and lane geometry; the along-lane distance is a cited figure, logged as a ruling.");
  });
  it('CHAT-208 (batch 2026-10-29-ag): MB-59 amends FS-Q1, rule text and dated note on M-322', () => {
    const r = rowOf(M, 'M-322');
    expect(r).toContain('2026-10-29-batch-ag#CHAT-208.MB59-FSQ1`');
    expect(r).toContain('Dated note 2026-10-29 (M-322; operator MB-59');
    expect(r).toContain('Where the notice prints no required figure but the keyed rule calculates it (e.g. maximum bedrooms = 3 x units), the model calculates it and the row is scored as answered.');
  });
  it('CHAT-196 (batch 2026-10-27-x): the committed witness catalog is fixed to the DB truth, never tolerated; dated note on R-JY (R-CZ sits in moved block §B16)', () => {
    const jy = rowOf(A, 'R-JY');
    expect(jy).toContain('2026-10-27-batch-x#CHAT-196.CATALOG-FIX`');
    expect(jy).toContain('coa_plan_facts_cohort_bak_20261025t1457z');
    expect(jy).toContain('a pre-existing defect, not a night-3 fault');
    expect(jy).toContain('No tolerance is made');
    expect(jy).toContain('the base and T4 are re-pinned with a review');
    expect(jy).toContain('scripted OPERATOR-GO release that re-verifies the DB read-only');
    expect(jy).toContain('night 3 is re-run from step 1');
  });
  it('CHAT-195.CLPD-Q4-TIMING and CHAT-194.USO-Q1g (batch 2026-10-27-w): the savepoint retirement lands as one unit in the night-4 patch (dated note on R-JZ); the closure extends to the suite class of a closed principal type (dated note on M-169)', () => {
    const S = '2026-10-27-batch-w#';
    const jz = rowOf(A, 'R-JZ');
    expect(jz).toContain(S + 'CHAT-195.CLPD-Q4-TIMING`');
    expect(jz).toContain('takes effect as one unit in the night-4 runner patch');
    expect(jz).toContain('the savepoint moves unchanged to the runner\'s derived-history write');
    expect(jz).toContain('so T4 is intermediate');
    expect(jz).toContain('finding 6');
    const m = rowOf(M, 'M-169');
    expect(m).toContain(S + 'CHAT-194.USO-Q1g`');
    expect(m).toContain('the CHAT-194 closure extends to the suite class of a closed principal type');
    expect(m).toContain('house_with_secondary_suite');
    expect(m).toContain('2026-10-26-batch-n#CHAT-182.L2-G3-USE-LIST-KEYING-ROUND');
  });
  it('CHAT-194.USO-Q1e/Q1f (batch 2026-10-26-v): the closure is declared data read by permitted() (not M-75 keying alone) and reaches 10.x.20.40(1) only; dated note on M-169', () => {
    const S = '2026-10-26-batch-v#CHAT-194.USO-';
    const m = rowOf(M, 'M-169');
    expect(m).toContain(S + 'Q1e`');
    expect(m).toContain(S + 'Q1f`');
    expect(m).toContain('exception_type_list_closure');
    expect(m).toContain('declares all 19 "only"-list closures');
    expect(m).toContain('keying cannot drop a base PERMIT');
    expect(m).toContain('The closure reaches the base type list 10.x.20.40(1) only');
    expect(m).toContain('is not closed and stays as the by-law text says');
  });
  it('CHAT-193 (batch 2026-10-26-t): night-tools NT-Q1..Q5 are withdrawn (no tolerance, allowlist or constant); the explained-diffs approach and NT-Q6 A are dated notes on R-JY (R-DA sits in moved block §B16)', () => {
    const S = '2026-10-26-batch-t#CHAT-193.';
    const jy = rowOf(A, 'R-JY');
    for (const id of ['NT-EXPLAINED-DIFFS', 'NT-Q1', 'NT-Q2', 'NT-Q3', 'NT-Q4', 'NT-Q5', 'NT-Q6']) expect(jy).toContain(S + id + '`');
    expect(jy).toContain('under R-DA with evidence');
    expect(jy).toContain('Unexplained lines mean a restore from backup');
    expect(jy).toContain('the catalog must be byte-identical');
    expect(jy).toContain('never a plain `git commit` (PREAMBLE:14');
    expect(jy).toContain('commit-tree');
    const bam = A.split('\n').find((l) => l.startsWith('- **Night-tools ruling CHAT-193.NT-Q1 to CHAT-193.NT-Q6')) ?? '';
    expect(bam).toContain('WITHDRAWN, no_ruling');
    expect(bam).toContain('no allowlist, no literal');
    expect(bam).toContain('never bent per step');
    expect(bam).toContain('No rule text changes.');
  });
  it('CHAT-187..188 (batch 2026-10-26-q): K2 add-on lands with the P3-7 night; account names in file paths are personal details; on M-169 and M-305', () => {
    const P = '2026-10-26-batch-q#';
    expect(rowOf(M, 'M-169')).toContain(P + 'CHAT-187.K2-LANDS-WITH-P3-7');
    expect(rowOf(M, 'M-305')).toContain(P + 'CHAT-188.ACCOUNT-PATH-PERSONAL-DETAIL');
  });
  it('CHAT-99 is row R-KB on core.12 with the CHAT-93 condition', () => {
    expect(rowOf(A, 'R-KB')).toContain('2026-10-23-batch-t#CHAT-99.DB-RLS-1');
    expect(rowOf(A, 'R-KB')).toContain('2026-10-23-batch-n#CHAT-93.condition');
    expect(map.rules.find((r) => r.id === 'R-KB')?.handbook_line).toBe('core.12');
  });
  it('CHAT-92 sits on R-II as a dated-note exception', () => {
    expect(rowOf(A, 'R-II')).toContain('2026-10-23-batch-m#CHAT-92.RS-1');
  });
  it('CHAT-91 sits on M-350 (B-1, B-2), M-285 (B-3), M-336 (B-4) and M-322 (B-5)', () => {
    expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-l#CHAT-91.B-1');
    expect(rowOf(M, 'M-350')).toContain('2026-10-23-batch-l#CHAT-91.B-2');
    expect(rowOf(M, 'M-285')).toContain('2026-10-23-batch-l#CHAT-91.B-3');
    expect(rowOf(M, 'M-336')).toContain('2026-10-23-batch-l#CHAT-91.B-4');
    expect(rowOf(M, 'M-322')).toContain('2026-10-23-batch-l#CHAT-91.B-5');
  });
  it('CHAT-89 sits on R-JP and amends R-DQ in §B-AM (R-DQ is in moved block M33)', () => {
    expect(rowOf(A, 'R-JP')).toContain('2026-10-23-batch-j#CHAT-89.Q-114a');
    expect(A).toContain('**R-DQ amended by CHAT-89.Q-114a');
  });
  it('CHAT-90 sits on R-JG and amends R-DE (iv) in §B-AM (R-DE is in moved block §B16)', () => {
    expect(rowOf(A, 'R-JG')).toContain('2026-10-23-batch-k#CHAT-90.Q-A');
    expect(A).toContain('**R-DE (iv) amended by CHAT-90.Q-A');
  });
  it('CHAT-88 (corrected) is M-356 and M-357', () => {
    expect(rowOf(M, 'M-356')).toContain('2026-10-23-batch-i2#CHAT-88.PLANFACTS-1');
    expect(rowOf(M, 'M-357')).toContain('2026-10-23-batch-i2#CHAT-88.HELDOUT-1');
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

// CHAT-211 (batch 2026-10-30-batch-aj): each Rule text line is present in the register that carries it and cites its decision.
describe('CHAT-211 (batch 2026-10-30-batch-aj): 40 rulings recorded; behaviour locks are OWED to the owning tasks', () => {
  const CASES: Array<[string, string, string, string]> = [
    ["R-KF", "A", "2026-10-30-batch-aj#CHAT-211.G1", "A pending or converted step's compute closure is its step files plus the shared evaluator it declares; harnesses call only the step."],
    ["R-KG", "A", "2026-10-30-batch-aj#CHAT-211.G2", "OWED means blocked: a step code commit cites only rules RULED with no OWED marker; rule and lock land together (124:186); OWED clears by the generator; one exemption, BOOT-1 (MB-66..MB-68, until MB-67 lands)."],
    ["R-KH", "A", "2026-10-30-batch-aj#CHAT-211.G3", "A step code commit cites a RULED rule from its task's pre-registered rules[]."],
    ["R-KI", "A", "2026-10-30-batch-aj#CHAT-211.G7", "A step's loop set runs at commit, push and CI; red-by-design tests live in pending/ (the directory is created by MB-68)."],
    ["R-KJ", "A", "2026-10-30-batch-aj#CHAT-211.G8", "A step in conversion imports no code from a superseded implementation."],
    ["R-KK", "A", "2026-10-30-batch-aj#CHAT-211.G9", "Every DONE line's commit exists on its branch, checked by script."],
    ["R-KL", "A", "2026-10-30-batch-aj#CHAT-211.G11", "Dirty and unpushed worktrees of a programme are reported at pre-push."],
    ["R-KM", "A", "2026-10-30-batch-aj#CHAT-211.G12", "No exception paths, other than BOOT-1 (R-KG), which ends when MB-67 lands; each step code commit carries its panel record."],
    ["R-KN", "A", "2026-10-30-batch-aj#CHAT-211.G13", "Step and evaluator-extension code holds no by-law knowledge as a literal; numbers allowed 0, 1, -1, 2, 100; strings limited to the closed status words in vocab.json and table field names."],
    ["R-KO", "A", "2026-10-30-batch-aj#CHAT-211.G10", "Spec 08 section 7 rule 10: claims and briefs are checked before they leave the orchestrator; no recommendation goes to the operator without its rule quoted with file:line, and a DeepSeek brief names only checks runnable through bash_allow, else provider claude with the reason logged."],
    ["R-KQ", "A", "2026-10-30-batch-aj#CHAT-211.MB73", "A promises register is a generated view of programme-items.json (extends R-T, 124a:133); mcbylaws-promises.mjs --check (to be built by MB-73) fails when a promise has no artifact, a missing artifact, a non-green last run, a DONE task with no commit, or an old-engine import; it runs at pre-push, in CI and at every increment boundary (extends R-KK)."],
    ["M-378", "M", "2026-10-30-batch-aj#CHAT-211.M-SWITCH", "One switchboard, built by MB-31 at scripts/seeds/bylaw/switchboard.json (to be built by MB-31): rows {id, kind, state, ruling, reason}, kind in clause, formula, scenario, building_type, reading; default on, except where the switch's own ruling sets it off (shape_calibration, LC-69); off beats on; every result lists the switches on its path."],
    ["M-379", "M", "2026-10-30-batch-aj#CHAT-211.M-SUITE", "The house with a secondary suite differs from the detached house only through LC-33's closed gain reasons; INV-3 is about the rear suite."],
    ["M-380", "M", "2026-10-30-batch-aj#CHAT-211.M-EXPECT", "Expected answers are the authority: worked examples and fresh expected answers are protected paths; an accepted loop change names the cases it made pass; one Layer 3 writer."],
    ["M-381", "M", "2026-10-30-batch-aj#CHAT-211.M-CONFLICT", "Before a ruling is recommended, the register is searched for conflicting rows; every 69a, Spec 131 and Spec 124a row that cites the same clause, target or building type, and every other row of the same batch, is listed, each marked no conflict (with reason) or amends/supersedes."],
    ["M-382", "M", "2026-10-30-batch-aj#CHAT-211.M-WIP", "Done means committed, named test green in the loop run, ruling recorded and queue line updated; at most N held patches, where N is a logic variable set by operator decision O-6 (unruled); a lane is one writer branch; built-ahead work is held only as a listed patch."],
    ["M-383", "M", "2026-10-30-batch-aj#CHAT-211.M-OBJ", "The five objectives (standardized, observable, scalable, accurate, understandable; R-BA, Spec 68 section 4) bind every McBylaws phase, measured by Spec 68 O-1..O-12 and SC-1..SC-20; McBylaws has no exception path other than BOOT-1 (R-KG); the objectives have one home, Spec 68 section 4, and this row only cites them."],
    ["M-384", "M", "2026-10-30-batch-aj#CHAT-211.P3-MODEL", "Phase 3 is tables, not code: formulas are data in a catalogue (code = one generic runner plus a closed helper list); no old code is imported (R-KJ); Phase 3 is a test-and-validate loop; every non-law setting is a logic variable and law numbers come only from Phase 2, except the front-yard data chain ruled by CHAT-210.MB54-Q, which uses data and settings, never law, and is flagged front_yard_needs_survey; building types, formulas, settings and switches are table rows."],
    ["M-377", "M", "2026-10-30-batch-aj#CHAT-211.M61-CAT", "The formula catalogue is M-61's formula registry; it is built by MB-31 at scripts/seeds/bylaw/layer3-catalogue.json (to be built by MB-31); changing a calculation is editing a row and its examples; a form the grammar cannot express is a ruling to extend M-72; every change goes through the loop."],
    ["clause (4) of M-377", "M", "2026-10-30-batch-aj#CHAT-211.START-SMALL", "Start small and expand through the loop: increment 1 is the detached house, core numbers only, on the 25 golden cases; each later increment adds one field, building type or case set and enters only when the previous is green in the loop."],
    ["dated note on the 69a header", "M", "2026-10-30-batch-aj#CHAT-211.HDR", "The \"Next free id\" line of the 69a header is generated, not hand-kept (69a:12 said M-334; the highest id is M-376)."],
    ["M-385", "M", "2026-10-30-batch-aj#CHAT-211.R3-01", "R3-01 Undecided never means zero: a not_evaluated or condition_unknown Phase 2 input makes every row that reads it not_evaluated with the reason carried forward; it is never treated as 0, as absent, or as unlimited."],
    ["M-386", "M", "2026-10-30-batch-aj#CHAT-211.R3-02", "R3-02 Flags propagate: needs_survey, user_supplied, shape_box_assumed, option:<id> and every disclosure on an input are inherited by every row derived from it, up to the headline."],
    ["M-387", "M", "2026-10-30-batch-aj#CHAT-211.R3-03", "R3-03 Front-yard chain: law stays in Phases 1-2; whether 10.5.40.70(1) applies is Phase 2's decision and the averaging arithmetic is the Phase 1 row's own expression; the chain is the one ruled exception (CHAT-210.MB54-Q): Phase 3 supplies only the neighbour-setback input in the ruled order, using data and settings, never law, flagged front_yard_needs_survey; the terminal is the zone value Phase 2 stores for x.40.70(1), used only where Phase 2 says 10.5.40.70(1) does not apply or as the flagged FS-SB2 last resort, never a typed 6.0; M-245 (no zone-default floor) and M-256 stand."],
    ["M-388", "M", "2026-10-30-batch-aj#CHAT-211.R3-04", "R3-04 Calibration is tested on held-out data: the oracle for the allowance is the FS-SB1 held-out half and the CoA-surveyed setbacks, never the lots it was fitted on."],
    ["M-389", "M", "2026-10-30-batch-aj#CHAT-211.R3-05", "R3-05 Options: an option whose space is zero or less, or that Phase 2 refuses, is dropped with its reason; if every option is dropped the result is not_permitted / not_evaluated with reasons; a suite split is scored only where Phase 2 permits the suite on that class."],
    ["M-390", "M", "2026-10-30-batch-aj#CHAT-211.R3-06", "R3-06 Ideal split breakpoints are generated, not hand-listed: the candidate splits are every depth at which some row in the split changes slope (each min() arm), held as catalogue rows, with both ends included; a tie goes to the larger main (LC-22); a dense-grid check runs in the test lane only."],
    ["M-391", "M", "2026-10-30-batch-aj#CHAT-211.R3-08", "R3-08 Storeys: Phase 2 decides whether a storey cap applies (10.20.40.10(3)(C) is stored as not_applicable); S-1 is only the height-to-storeys arithmetic, used only where Phase 2 stores the cap as not_applicable or unlimited; an absent or undecided cap is not_evaluated (M-385); S-1 counts storeys and is not a limit, so height alone still limits the building."],
    ["M-392", "M", "2026-10-30-batch-aj#CHAT-211.R3-10", "R3-10 Shape switch: shape_calibration = on requires a fitted footprint_shape_factor with its provenance (n cases, date, audit file) and the disclosure tied to the switch state; the bounds are logic variables (unruled); turning it on without a fit fails closed."],
    ["M-393", "M", "2026-10-30-batch-aj#CHAT-211.R3-11", "R3-11 Unresolved classes answer not_modelled: a building type with no Phase 2 class (houseplex 5-6) returns \"not_modelled: class not resolved in Phase 2 (MB-27.L2)\" and never falls back to a neighbouring class (M-194: the cap is 4 outside a confirmed 600.60 area)."],
    ["M-400", "M", "2026-10-30-batch-aj#CHAT-211.P2-OPT", "Phase 2 stores one result per design option (roof form; suite low/tall), keyed by option like class; options that give no different law answer share the cell; within an option the cell is decided; only Phase 3 compares options."],
    ["M-401", "M", "2026-10-30-batch-aj#CHAT-211.SIX-COA", "Houseplex 5-6 units are modelled on every relevant lot with their permission route: as_of_right, coa_required or not_permitted (with its reason); a major-street result whose equivalence is unverified is shown unconfirmed and never as_of_right; the variances assumed are exactly the listed varied clauses, starting with the permission (10.20.20.40(1)) and including any option-dependent limit (for example 600.60.40(2)); a coa_required result is never shown as as-of-right. This amends M-194 (cap 6 only in a confirmed 600.60 area: outside it a 5-6 unit result is a coa_required route), M-214(1) (major-street forms not modelled: the permission is modelled) and M-64 (a not_permitted result of this class is shown with its reason); M-65 and LC-49 are unchanged."],
    ["M-402", "M", "2026-10-30-batch-aj#CHAT-211.OPTIONS", "Each building type lists its feasible design options, the largest marked as the headline; S-1 is a feasibility minimum, not one typical storey height; Phase 2 resolves per option only where an option changes a law answer (M-400)."],
    ["M-403", "M", "2026-10-30-batch-aj#CHAT-211.IDEAL-SPLIT", "The rear suite and main house are split at the best breakpoint (total floor area = main + suite, both piecewise-linear in the main house depth); the candidate splits are the catalogue rows of M-390, scored by the evaluator, with the split disclosed and no search helper; a tie goes to the larger main (LC-22)."],
    ["dated note on M-245", "M", "2026-10-30-batch-aj#CHAT-211.FRONT-YARD", "front_setback_used_m is one catalogue row that applies the ruled chain (user figure; estimate + allowance; FS-SB2 placeholder; zone fallback stored by Phase 2); the chain lives in the model path, not in a harness; every value except a user figure is flagged front_yard_needs_survey."],
    ["interim dated note on M-252 (and LC-21)", "M", "2026-10-30-batch-aj#CHAT-211.O3-INTERIM", "Interim, not a ruling: until research card EXC-FSI is ruled, show both FSI readings on an x1462 lot with the capped reading as the headline."],
    ["dated note on LC-16", "L", "2026-10-30-batch-aj#CHAT-211.BTYPES", "The closed scenario set becomes the building-types table scripts/seeds/bylaw/layer3-building-types.json (to be built by MB-31); semis are a recorded future build, counted not_evaluated:future_build."],
    ["LC-69", "L", "2026-10-30-batch-aj#CHAT-211.SHAPE", "The footprint is a box, disclosed \"box shape assumed; entrances and projections not modelled\"; it reads lv(footprint_shape_factor) = 1.0 (setting to be seeded by MB-31) with the switch shape_calibration = off (M-378); no other value is set now."],
    ["Spec 68 O-9, O-10, O-11, O-12", "S", "2026-10-30-batch-aj#CHAT-211.S68-OBJ", "Spec 68 objectives O-9 limits only from the table (2), O-10 every Layer 2 result cites itself (2), O-11 nothing typed in (3), O-12 accurate against real cases (3)."],
    ["Spec 68 SC-14 .. SC-20", "S", "2026-10-30-batch-aj#CHAT-211.S68-SC", "Spec 68 success criteria SC-14 Layer 2 scoping is data (0), SC-15 Layer 2 results cite (0), SC-16 Layer 2 never defaults (0), SC-17 Layer 3 numbers sourced (0), SC-18 calculations declared (0), SC-19 accuracy on real cases (M-362 thresholds; the Phase 3 exit), SC-20 shadow explains every difference (0, 0)."],
  ];
  const TEXT: Record<string, string> = { A, M, L: L131, S: S68 };
  for (const [row, reg, cite, rule] of CASES) {
    it(`${row} carries ${cite} and its Rule text`, () => {
      expect(TEXT[reg], cite).toContain(cite);
      expect(TEXT[reg] + L131 + M + A + S68, cite + ' rule text').toContain(rule);
    });
  }
  it('the new 124a rows are mapped to Spec 132 lines that exist', () => {
    for (const id of ["R-KF","R-KG","R-KH","R-KI","R-KJ","R-KK","R-KL","R-KM","R-KN","R-KO","R-KQ"]) {
      const e = map.rules.find((r) => r.id === id);
      expect(e, id).toBeTruthy();
      expect(map.lines.some((l) => l.id === e?.handbook_line), id).toBe(true);
    }
  });
});

// CHAT-212 (batch 2026-10-30-batch-ak): each Rule text line is present in the register that carries it and cites its decision.
describe('CHAT-212 (batch 2026-10-30-batch-ak): 11 rulings recorded; behaviour locks are OWED to the owning tasks', () => {
  const CASES: Array<[string, string, string, string]> = [
    ["R-KP", "A", "2026-10-30-batch-ak#CHAT-212.ANCHOR", "The trust anchor is the operator at pre-push: protected paths are listed in mcbylaws/protected-paths.json (to be built by MB-67) and the operator approves a one-screen summary of their changes; Layer 2/3 work is allowed only when the tracked file mcbylaws/APPROVED exists (absent today) on the McBylaws base branch, committed by the operator (QUEUE:21, F-41); the operator is authenticated by a passphrase-protected signing key, used for the APPROVED commit and for protected-file approvals (enforcement OWED MB-67)."],
    ["R-KR", "A", "2026-10-30-batch-ak#CHAT-212.R4-07", "R4-07 The literal gate covers all Layer 2/3 code and data modules except the declared catalogue, settings and switchboard files. Numbers quoted in this plan are for reading only; at run time every one is read from Phase 2."],
    ["R-KS", "A", "2026-10-30-batch-ak#CHAT-212.R4-08", "R4-08 Trace is written by the evaluator from what it actually read (row ids resolved at run time), never tagged by code."],
    ["R-KT", "A", "2026-10-30-batch-ak#CHAT-212.R4-09", "R4-09 Allowlists, not denylists. The Layer 3 step may import only the evaluator and the declared helpers (closure test, G1), and may read only stored Phase 2 tables, the catalogue, settings and switchboard (an input allowlist checked at run time). Anything else FAILs, whatever its name."],
    ["R-KU", "A", "2026-10-30-batch-ak#CHAT-212.R4-10", "R4-10 MB-73 cannot be gamed by a green from the past or an empty test. Ids are found by pattern in every file the queue cites, including the answered cards (CARD-*.answered.md), not by typed ranges.; Each green is bound to (artifact blob hash, input hashes, commit), and any change invalidates it.; Each promise's test has the red run already required (red-first); skipped is never green.; Increment scope is read from the register row, not declared by the author.; The check is a required status at landing and in CI, as well as at pre-push."],
    ["M-394", "M", "2026-10-30-batch-ak#CHAT-212.R4-01", "R4-01 Routes are Phase 2's and complete. as_of_right (overlay or major street), coa_required (a minor-variance route), not_permitted (the zone does not permit the type, or a lot gate applies, each with its reason). The route uses every Phase 2 condition for the class, never one flag. The major-street route stays unconfirmed and is shown as unconfirmed (never as_of_right, and never relabelled coa_required, because outside the overlay the major-street route is the apartment-building permission, not a houseplex one; grounder r4) with a note until on_policy_road is verified against the by-law's major-street map: an unverified equivalence never earns an as-of-right label."],
    ["M-395", "M", "2026-10-30-batch-ak#CHAT-212.R4-02", "R4-02 Varied clauses are a list, per option. It covers the permission (10.20.20.40(1)), any option-dependent limit (for example 600.60.40(2)) and the O-3 FSI reading where it applies. The 5–6-unit class uses its own stored Phase 2 limits per route and option, never the 2–4 houseplex's."],
    ["M-396", "M", "2026-10-30-batch-ak#CHAT-212.R4-03", "R4-03 Precedent is classified before it is shown. The precedent query runs on classified applications only. It shows approved AND refused counts, and splits by the date the governing amendments came into force. Until classified it is not displayed. The SIX-COA oracle tests route classification only where an examiner notice cites the permission clause (coa_notice_variances), never \"approved therefore required\"."],
    ["M-397", "M", "2026-10-30-batch-ak#CHAT-212.R4-04", "R4-04 Options and headline. Options are generated per lot from stored Phase 2 rows. A 3-storey option needs a stored not_applicable or unlimited storey cap with its clause (unlimited is stored on 107,124 lots; grounder r4); an undecided cap gives no option (R3-01). The headline is the largest option under the capped O-3 reading, with the uncapped reading shown beside it. It is ranked by GFA, the by-law measure the applicant is compared on, and the basement's livable area and units are shown on their own line, never hidden. EXC-FSI is due before the houseplex increment closes, and the dual reading also applies to SIX-COA."],
    ["M-398", "M", "2026-10-30-batch-ak#CHAT-212.R4-05", "R4-05 The basement is read, not assumed. Whether it is excluded from GFA, whether it counts as a storey and whether its units count all come from the Phase 1/2 rows. Site conditions (groundwater, depth) are not modelled and are disclosed as a site fact (M-169). A0277 is a test case, not the template."],
    ["M-399", "M", "2026-10-30-batch-ak#CHAT-212.R4-06", "R4-06 S-1 direction. S-1 is the minimum floor-to-floor plus a declared roof/parapet allowance (both cited, or a card). This gives the theoretical maximum storey count (a design choice taken as met and disclosed, M-172). The 2-storey option is always shown beside it. This replaces the earlier \"typical storey height\", as the operator directed (\"calculate and show both\")."],
  ];
  const TEXT: Record<string, string> = { A, M, L: L131, S: S68 };
  for (const [row, reg, cite, rule] of CASES) {
    it(`${row} carries ${cite} and its Rule text`, () => {
      expect(TEXT[reg], cite).toContain(cite);
      expect(TEXT[reg] + L131 + M + A + S68, cite + ' rule text').toContain(rule);
    });
  }
  it('the new 124a rows are mapped to Spec 132 lines that exist', () => {
    for (const id of ["R-KP","R-KR","R-KS","R-KT","R-KU"]) {
      const e = map.rules.find((r) => r.id === id);
      expect(e, id).toBeTruthy();
      expect(map.lines.some((l) => l.id === e?.handbook_line), id).toBe(true);
    }
  });
});

// CHAT-213 (batch 2026-10-30-batch-al): each Rule text line is present in the register that carries it and cites its decision.
describe('CHAT-213 (batch 2026-10-30-batch-al): 45 rulings recorded; behaviour locks are OWED to the owning tasks', () => {
  const CASES: Array<[string, string, string, string]> = [
    ["M-404", "M", "2026-10-30-batch-al#CHAT-213.S-1", "S-1 storey conversion values are logic variables, each seeded with its citation by MB-31 into scripts/seeds/logic_variables.json (these variables are absent today) and changed only by a ruling: s1_ceiling_min_m = 2.3 (Ontario Building Code 2024, Part 9, Table 9.5.3.1, living, dining and kitchen space, over at least 75 % of the area); s1_floor_assembly_m = 0.212 (joist 184 mm, Table 9.23.4.2.-A, plus subfloor 15.5 mm, Table 9.23.15.5.-A, plus ceiling board 12.7 mm, Table 9.29.5.3, which sum to 212.2 mm; finished floor and furring are 0 and disclosed as not cited); s1_parapet_m = 0.3 (10.20.40.10(5)). Floor-to-floor f = s1_ceiling_min_m + s1_floor_assembly_m (2.512 m); roof allowance a = s1_floor_assembly_m + s1_parapet_m (one assembly plus 0.3 m, 0.512 m); storeys = floor((height - a) / f) where M-391 lets S-1 apply. The 184 mm joist is a disclosed design choice, and the 0.3 m parapet governs RD main wall height only, so its use for building height is a disclosed extension."],
    ["M-405", "M", "2026-10-30-batch-al#CHAT-213.S-2", "S-2 first-floor height above established grade is the logic variable s2_first_floor_above_grade_m = 0, to be seeded by MB-31 into scripts/seeds/logic_variables.json (absent today) and disclosed as an assumption: the first floor is taken at established grade, no by-law first-floor height is applied, and S-2 is subtracted from the height before S-1 converts it, so with 0 it changes no result; it changes only by a ruling."],
    ["M-406", "M", "2026-10-30-batch-al#CHAT-213.MB18-RL-3", "Phase 2 stays strict (Spec 134 I10, inputs_defaulted = 0); the one addition is a disclosed site-fact assumption, \"the lot is unchanged since 2013\" (the 569-2013 enactment), resolved per design option (M-400) and never stored as a defaulted input: with it a lot whose exception keys a minimum as existing(lot_frontage_m; enacted(569-2013)) reads its stored frontage as the 2013 frontage, flagged and disclosed in the M-169 manner, and Spec 134 I10 does not count that assumption as a defaulted input."],
    ["M-407", "M", "2026-10-30-batch-al#CHAT-213.MB18-RL-1", "Spec 131 LC-68 is clarified and the code stands: a \"4-vertex lot\" in LC-68 means a lot whose stored outline holds 4 points; the outline is a closed ring, so 4 points is 3 corners, a triangle with no rear lot line (no_rear_lot_line = true, as pull-golden-lots.cjs and scripts/lib/bylaw-resolution.js already set it), while a four-sided lot stores 5 points and keeps its rear lot line; \"other shapes are flagged\" means the lots of other shapes are listed by their stored point count (measured on the local database 2026-10-30: 719 parcels store 4 points, 165,832 store 5), not marked with a stored flag."],
    ["M-408", "M", "2026-10-30-batch-al#CHAT-213.MB18-RL-2", "A rule-choice branch (the thing Spec 68 SC-14 counts) is a literal equal to a zone symbol (R, RD, RS, RT, RM) or to a building-type token, in an executable position in a file of the Layer 2 closure; the detector is report-only first, with measured baseline 0."],
    ["M-409", "M", "2026-10-30-batch-al#CHAT-213.MB18-RL-4", "RB-D10 is closed by removing only value.ratio of the audit row whose metric is storage_within_budget from the compared golden, scoped by audit metric, never as a band and never through the volatile-keys list; the budget check itself still reads MiB, the ledger row stays OPEN until the night recapture, and the change needs a second-seat check and a decision-log line because it touches a golden comparison (a protected path)."],
    ["M-410", "M", "2026-10-30-batch-al#CHAT-213.MB18-RL-5", "If another lane already holds docs/reference/maxbld-field-lineage.json, the MB-18 claim still edits the one lineage line for front_setback_fallback_m (item (j)) under that lane's agreement, in the same commit as the Layer 2 scope entry, the migration and the lock tests; without that line the both-ways lineage lock cannot go green."],
    ["M-368 note", "M", "2026-10-30-batch-al#CHAT-213.MB30-PR-1", "M-368's \"the tables it restores\" includes a table whose SET NULL reference column the restore writes (night 3: permits.neighbourhood_id, whose triggers set_updated_at, trg_permits_lead_id and trg_permits_set_location would otherwise fire), not only the backed-up tables; permit work itself stays out of scope."],
    ["M-368 note", "M", "2026-10-30-batch-al#CHAT-213.MB30-PR-2", "A Layer 2 night's \"dump first\" (F-22, F-44) is the night tool's table snapshot (n3db backup-sql, verified equal to live) of the night's declared write set plus its CASCADE closure, the only snapshot the M-368 restore can restore; a full database dump (Spec 112) is an optional extra, never the restore source."],
    ["M-368 note", "M", "2026-10-30-batch-al#CHAT-213.MB30-PR-4", "\"Every night restore\" in M-368 includes nightD's own restore (TRUNCATE of bylaw_resolution_lots, bylaw_resolution_texts and bylaw_resolution_units, then \\copy), in principle: no change is made for it until one of those tables carries a user trigger (none does on 2026-10-30), and then the same per-table DISABLE TRIGGER USER wrapper applies."],
    ["Spec 112 4.3 note", "M", "2026-10-30-batch-al#CHAT-213.MB30-S112", "Spec 112 section 4.3 allows the wrapper M-368 needs: a per-table ALTER TABLE ... DISABLE TRIGGER USER (table owner) inside the restore transaction, re-enabled before commit; pg_restore --disable-triggers and DISABLE TRIGGER ALL stay not used."],
    ["R-LR", "A", "2026-10-30-batch-al#CHAT-213.LOCAL-DB", "The only database any McBylaws work reads or writes is the local database at 127.0.0.1:54322 (the local Supabase container); the cloud waits: no McBylaws lane runs a cloud:* script, or connects to, reads, writes, migrates or deploys to a remote or production database, until the operator rules otherwise in a later card, and a script whose target is not 127.0.0.1:54322 stops. This also settles MB30-PR-3: the dev DB is the local database."],
    ["M-411", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-1", "The increment-1 loop data and tests live under src/tests/mcbylaws/loop/increment-1/**, src/tests/mcbylaws/pending/increment-1/** and src/tests/mcbylaws/loop/seam.ts (none exists today); every file stays in pending/ until MB-31 passes it and is run by path; mcbylaws/protected-paths.json (to be built by MB-67) lists all three globs."],
    ["M-412", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-2", "In increment 1 the whole front-yard chain (M-387) and the corner lot's street-side side-yard term are computed, as the newest dated queue line says; the older queue lines that place street-side and averaging in increment 2 are overridden by this row; the cells that rest on this choice are marked provisional and kept out of the floors."],
    ["M-413", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-3", "For increment 1 the footprint depth axis reads building_length_m in the same min() as building_depth_m, exactly as Guardrail G-1 is printed in the queue; the width-axis rule is revisited when the options increment is reached."],
    ["M-414", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-4", "Front-yard step 2 uses only a neighbour that is on the same street, residential, estimated and whose building is 15.0 m or less from the lot (10.5.40.70(1)), the abutting-building tokens are read from parcel_abutments (M-245), and user figures are bounded by fya_est_min_m and fya_est_max_m; the strict reading holds: where (A) \"beside one lot\" fails because the second lot beside the subject lot has its building beyond 15.0 m and (B) \"between two abutting lots\" needs both, averaging does not apply and step 4, the zone value Phase 2 stores, answers, so A0553 stays not_evaluated until MB-18 item (j) stores front_setback_fallback_m; three or more qualifying neighbours stay as M-245 (Q-B2)."],
    ["M-415", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-5", "MB-31 exposes the seam runRow(rowId, inputs) returning {status, value, reason, flags[], trace[]}, and the McBylaws loop reaches Layer 3 only through it (src/tests/mcbylaws/loop/seam.ts, to be built by MB-64); the rounding contract is an area tolerance of 0.005 and a tie tolerance of 1e-9."],
    ["M-416", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-7", "In the applicant comparison a notice's figures are compared only when its type reads as a detached house or as an addition to an existing detached house or dwelling, and not as semi-detached, houseplex, apartment or suite; any other type is recorded as not_scored:type_not_comparable."],
    ["M-417", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-8", "Increment 1 reads the permission word only for the detached house: required_lot_area_m2 and required_lot_frontage_m, named in the queue's permitted row, are not stored by Phase 2 for it, so permitted is provisional and stays out of the floors."],
    ["M-418", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-9", "The variables fya_porch_allowance_m and the four fya_placeholder_* are in scripts/seeds/logic_variables.json but only fya_est_min_m and fya_est_max_m are in the local logic_variables table; MB-31 applies the rest from the answered FS-SB1 and FS-SB2 cards and seeds footprint_shape_factor at 1.0 with the shape switch off (LC-69); the queue line that says the fya_* variables already exist is corrected by this row."],
    ["M-419", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-10", "A Phase 2 height_storeys of unlimited means no Phase 2 cap, so the S-1 arithmetic gives the storeys (M-391, M-399); an unlimited storey value is never used as the storeys term of GFA."],
    ["M-420", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-12", "A principal-structure gfa_m2 target that Phase 2 does not store (only the suites have one) is an absent target: it drops out of the GFA minimum and does not make the GFA not_evaluated; M-385 applies to a stored undecided cell only."],
    ["M-421", "M", "2026-10-30-batch-al#CHAT-213.MB64-PR-13", "The corner flag the scorer reads is the parcel layer's (O-13), the keyed golden or FS-Q3 flag is shown beside it, and the parcel flag is to be fixed by MB-18 or the keying lane (A0562 is a ruled corner) before the cases are re-run."],
    ["R-KV", "A", "2026-10-30-batch-al#CHAT-213.P67-1", "A Layer 2/3 commit names its task in one trailer line McBylaws-Task: MB-nn, and the task's pre-registered rules[] live in its prereg file scripts/analysis/bylaw-validation/coa-expected/prereg-[MB-id]-[round].json (schema coa-round-prereg-v1; MB-68 owns the schema and the writer, MB-67 adds the single field task and only reads task and rules[]); the gate reads the newest prereg whose task equals the trailer from the commit's parent tree, never the index; one file per task; the commit that creates a prereg, with that prereg as its only Layer 2/3 path and no cited rules, needs no trailer."],
    ["R-KW", "A", "2026-10-30-batch-al#CHAT-213.P67-2", ".cursor/MCBYLAWS-QUEUE.md is a tracked file on wf1/mb-rulings (it is untracked today), committed by the orchestrator before the queue check is wired; each DONE entry is written MB-nn@sha and never rewritten; lane branches enter by merge, not rebase."],
    ["R-KX", "A", "2026-10-30-batch-al#CHAT-213.P67-3", "The hold file is mcbylaws/APPROVED at the repo root of the McBylaws base branch wf1/mb-rulings (absent today): it counts only if git cat-file -e HEAD:mcbylaws/APPROVED succeeds, its first line matches ^O-1 APPROVED [0-9]{4}-[0-9]{2}-[0-9]{2}, and the commit that adds it touches no other path; it must be present in the parent tree of each Layer 2/3 commit, checked commit by commit and not at the tip; the rule applies only when the staged set holds a Layer 2/3 path; the pre-push summary prints its commit id, date and subject first whenever it changes."],
    ["R-KY", "A", "2026-10-30-batch-al#CHAT-213.P67-4", "Pre-push approval is an interactive prompt on /dev/tty (\"Approve this push? [y/N]\") after the summary, and only when the push changes a protected path; no tty, no answer, or anything but y refuses; a push that touches no protected path prints one line and passes; in CI the summary is printed to the log and the arms run with no prompt."],
    ["R-KZ", "A", "2026-10-30-batch-al#CHAT-213.P67-5", "The conflict search of M-381 runs over the 69a, 124a and 131 register rows with two keys: every clause token in the new row's text, and every pair of a building type and a subject word taken from closed lists; the new row's Conflict check names every id the search returns, each followed by no conflict (with the reason), amends or supersedes."],
    ["R-LA", "A", "2026-10-30-batch-al#CHAT-213.P67-6", "The literal gate (R-KN) covers the files in the literal_scope of mcbylaws/protected-paths.json (to be built by MB-67): the Layer 3 step, evaluator-extension and helper files that MB-31 names, and the JSON data modules among them; it also covers every new or changed line in scripts/analysis/bylaw/evaluate.mjs and the Layer 2 closure files, whose number literals existing on 2026-10-30 (61 in evaluate.mjs outside 0, 1, 2 and 100) are a shrink-only baseline in mcbylaws/literal-allow.json, so R-KR is not narrowed; strings are allowed only from mcbylaws/literal-allow.json (absent today; status_words[] and field_names[]), a protected path whose every change appears in the pre-push summary."],
    ["R-LB", "A", "2026-10-30-batch-al#CHAT-213.P67-7", "The Layer 2/3 gate is one more && line in .husky/pre-commit, measured by scripts/analysis/precommit-budget.mjs --measure and kept inside the R-DJ (2) budgets with a re-pinned evidence file (R-EC --check is red until it is re-measured); the MB-68 fast loop set runs only when Layer 2/3 files are staged and is outside the docs-only and registry timings."],
    ["R-LC", "A", "2026-10-30-batch-al#CHAT-213.P67-8", "The minimum panel record is docs/reports/panels/[task].json (absent today), a JSON file with task (equal to the trailer), class (the queue class letter), plan (a non-empty array of seats) and output (a non-empty array of seats); the roster per class is MB-73's audit, not the gate's."],
    ["R-LD", "A", "2026-10-30-batch-al#CHAT-213.P67-9", "The protected paths (R-KP) include, beyond the F-34 list: mcbylaws/APPROVED, mcbylaws/protected-paths.json and mcbylaws/literal-allow.json (the mcbylaws/ directory is absent today), docs/reports/panels/** and docs/reports/loop-records/** (both absent today), .husky/*, .github/workflows/test.yml, scripts/lib/exec-policy.json, the gate's ground truth (Specs 133, 69a, 124a and 131) and the gate's own tests, fixtures and docs/reports/generated/precommit-budget.json; every change to any of them appears in the pre-push summary."],
    ["R-LE", "A", "2026-10-30-batch-al#CHAT-213.P67-10", "The gate does not refuse the commits that authorise it: (a) a commit whose only Layer 2/3 path is one valid prereg file and which cites no rules is exempt from the trailer and rules[] checks; (b) the hold applies only when a Layer 2/3 path is staged, so the operator's sole APPROVED commit (R-KX) passes; and RULED means the closed list of in-force Status words the generator emits (RETIRED, SUPERSEDED, PROPOSED and OWED are not RULED); BOOT-1 stays the one named exemption of R-KG."],
    ["R-LF", "A", "2026-10-30-batch-al#CHAT-213.P67-11", "The pre-push range is what git hands the hook on stdin (local ref, local sha, remote ref, remote sha), checked commit by commit (git rev-list --no-merges) with the APPROVED file of R-KX tested in each commit's parent tree; the policy in force for a commit is its BASE copy of the protected-paths file of R-LD (absent today), plus a short list hard-coded in the summary module that always shows raw diffs of the gate's own files."],
    ["R-LG", "A", "2026-10-30-batch-al#CHAT-213.PR-68-1", "The loop record is docs/reports/loop-records/[increment]/round-[nn].json (absent today), schema loop-record-v1, written only by the loop gate's run --write (create-exclusive, nn = highest + 1), never by hand and add-only; it keeps only what the gate cannot derive: schema, increment, round, decision (accept or revert), reason, accepted_findings, cases (id, status, got_sha), inputs (repo path to git blob id) and binding."],
    ["R-LH", "A", "2026-10-30-batch-al#CHAT-213.PR-68-2", "The loop gate guards its own inputs mechanically (extends R-KI): the regression set only grows (no id is removed or moved to pending, and a group's count never falls; removal has one door, a ruling that resolves to a RATIFIED or RULED register row); OWED lines cannot worsen (R-LK); and hand-authored oracle files are not modified in a commit that changes code (R-LI)."],
    ["R-LI", "A", "2026-10-30-batch-al#CHAT-213.PR-68-3", "Loop files fall in three classes: hand-authored ORACLE (expected answers, worked examples, invariants, floors, the regression set, prereg files and loop tests), never modified or deleted in a commit that also changes CODE, while adding a new oracle file beside code is allowed (red first); generated PINS (derived totals, id lists, records), which move only through the tool and only to the prereg totals; and CODE (catalogue, settings, switchboard, step, evaluator extension and Layer 2 model files, taken from the layer23 globs of the protected-paths file of R-LD); oracle-first is checked at commit when CODE or ORACLE is staged and over the range at push and in CI."],
    ["R-LJ", "A", "2026-10-30-batch-al#CHAT-213.PR-68-4", "Increment ids are the closed set 1, 2, 3, 4, 5, 6, 6b, 7, 8, 9, 10 held in mcbylaws/loop/data/increments.json (absent today), copied from the queue's increments table; a round declares exactly one id in its prereg, and a catalogue row carries an increment field (MB-31 owns the row shape); no test locks the file to the queue file."],
    ["R-LK", "A", "2026-10-30-batch-al#CHAT-213.PR-68-7", "OWED floor lines are frozen at the value the round-0 ruling records: a further fall fails the gate (today an OWED line prints OWED and exits 0)."],
    ["R-LL", "A", "2026-10-30-batch-al#CHAT-213.G68-08", "In CI the loop gate recomputes the in-repo groups only and prints \"external groups: not run in CI\"; groups whose data is held outside git (the CoA sets) are enforced at pre-push, which re-runs everything, and the content hash of each external data file is bound into the record's inputs; a --no-verify push therefore skips the external groups entirely, while CI still runs every data-free check (ratchets, floors-file edits, add-only records, oracle-first over the range, in-repo groups); if the data later moves into the repo, CI re-runs it."],
    ["R-LM", "A", "2026-10-30-batch-al#CHAT-213.PR-68-8", "Every full loop run mutates one expected value in memory and requires the case to turn red (the red evidence of R-KU); the gate runs the canary itself and never stores it in the record."],
    ["R-LN", "A", "2026-10-30-batch-al#CHAT-213.PR-68-9", "MB-68 delivers the loop gate's command line and exit codes and uses MB-67's protected-path globs and --mode (commit, push, ci); MB-67 alone wires the gate into the hooks and the workflow, through its external_arms entry, and the orchestrator makes it required in one commit after MB-68 lands."],
    ["R-LO", "A", "2026-10-30-batch-al#CHAT-213.PR-68-10", "The loop gate computes rounds_since_thresholds (the rounds since the thresholds were last set, a revert counting) for the operator-card trigger O-14 and prints it; it is not stored in the record, and the card itself stays MB-27's."],
    ["R-LP", "A", "2026-10-30-batch-al#CHAT-213.PR-68-11", "The fast loop set, run at commit, is the in-repo groups plus the 172 set; the full set, run at push and in CI, is every group; both are cheap (the 172 scorer ran in 3.9 s on 2026-10-30)."],
    ["R-LQ", "A", "2026-10-30-batch-al#CHAT-213.REASON-20", "A loop accept record carries a reason of at least 20 characters, and so does the reason of each accepted finding; a shorter reason fails the gate."],
  ];
  const TEXT: Record<string, string> = { A, M, L: L131, S: S68 };
  for (const [row, reg, cite, rule] of CASES) {
    it(`${row} carries ${cite} and its Rule text`, () => {
      expect(TEXT[reg], cite).toContain(cite);
      expect(TEXT[reg] + L131 + M + A + S68, cite + ' rule text').toContain(rule);
    });
  }
  it('the new 124a rows are mapped to Spec 132 lines that exist', () => {
    for (const id of ["R-LR","R-KV","R-KW","R-KX","R-KY","R-KZ","R-LA","R-LB","R-LC","R-LD","R-LE","R-LF","R-LG","R-LH","R-LI","R-LJ","R-LK","R-LL","R-LM","R-LN","R-LO","R-LP","R-LQ"]) {
      const e = map.rules.find((r) => r.id === id);
      expect(e, id).toBeTruthy();
      expect(map.lines.some((l) => l.id === e?.handbook_line), id).toBe(true);
    }
  });
});

// CHAT-214 (batch 2026-10-31-batch-am): each Rule text line is present in the register that carries it and cites its decision.
describe('CHAT-214 (batch 2026-10-31-batch-am): 15 rulings recorded; behaviour locks are OWED to the owning tasks', () => {
  const CASES: Array<[string, string, string, string]> = [
    ["M-422", "M", "2026-10-31-batch-am#CHAT-214.FS-SB2A", "Where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of (a) the subject lot's own building front setback plus 1.0 m and (b) the mean of the measurable footprint estimates plus 1.0 m of the lots beyond the abutters along the frontage street, up to the placeholder ring depth counting the abutter as the first lot, taken in each direction along the frontage street from the subject by following the abutment links across lots whose frontage street is the subject's (one direction only for a corner lot); if no such lot is measurable, (b) is the median of the footprint estimates plus 1.0 m of other same-street lots within the placeholder street radius, at least the placeholder street minimum, abutters excluded; if only one of (a) and (b) exists use it; else the same-zone median within the zone radius; else 6.0 m; always flagged needs survey, and never replacing a user figure or a neighbour estimate."],
    ["M-422", "M", "2026-10-31-batch-am#CHAT-214.FS-SB2A-VARS", "Two logic variables are approved as rulings: fya_placeholder_ring_depth = 2 (bounds 2..4) and fya_placeholder_ring_min_n = 1; unchanged: fya_porch_allowance_m 1.0, street radius 200 / min 3, zone radius 500 / min 5. Both variables are seeded by MB-31 (scripts/seeds/logic_variables.json, with the migration MB-31 plans for it), not by this batch."],
    ["M-422", "M", "2026-10-31-batch-am#CHAT-214.FS-SB2A-REFIT", "FS-SB2a is re-fitted on a fresh held-out sample in the loop before the proof set, as a pinned audit, under the same governance as FS-SB2."],
    ["M-423", "M", "2026-10-31-batch-am#CHAT-214.RL-7", "RL-7 is option (a): the 10.5.40.70(1) 15.0 m is keyed into the Phase 2 target averaging_distance_m through three M-75 corrections (the third superseding COR-10.5.40.70(1)#(1)(A)/literals_not_expressed) plus the shared read-as-if-token-held hook. It is decided and recorded together with FS-SB2a (M-422) and L31-13 (M-424) as one change set: this batch records them together, and they are built together. A0375 = 2.125 m under both rules."],
    ["M-424", "M", "2026-10-31-batch-am#CHAT-214.L31-13", "L31-13 settles as \"frontage street\": the street a lot is on, for the neighbour facts and the ring, is its primary_frontage_street_name."],
    ["M-425", "M", "2026-10-31-batch-am#CHAT-214.L31-14", "L31-14 is accepted: S-1 storey counts carry the flag storeys_from_minimum_ceiling (a theoretical maximum, disclosed); the invariant a + storeys x f <= height_m holds; and both options stay shown (the 2-storey option with taller storeys beside the maximum-storey option, R4-04 and R4-06)."],
    ["M-426", "M", "2026-10-31-batch-am#CHAT-214.FS-SB2A-COMPLIANCE", "Compliance condition (no code in Phase 3): every choice of FS-SB2a lives in the catalogue row and the logic variables; the ring lots are data produced by the step's declared read (same frontage street, abutters excluded, depth from lv()), counted and averaged by the one generic neighbour-facts reader that chooses nothing (L31-03); the evaluator gains no front-yard branch; no research SQL or old-engine code is imported (L3-REBUILD); the 6.0 m is never typed (R3-03: terminal = l2(front_setback_fallback_m))."],
    ["R-LA note", "A", "2026-10-31-batch-am#CHAT-214.R-LA-COUNT", "R-LA's literal baseline stays at 61, the count MB-67's gate enforces (MB-67 recheck, ~/Buildo-scratch/mcbylaws/MB-67/output-panel/recheck.md, R2: 61 regenerated equals 61 committed): the number literals in scripts/analysis/bylaw/evaluate.mjs outside 0, 1, 2 and 100, as R-LA already words it; a different count (70) is not the baseline. MB-67 states its counting definition when its gate lands, and this dated note is replaced by it if it differs. No further correction is needed beyond this dated note."],
    ["M-427", "M", "2026-10-31-batch-am#CHAT-214.MB57-FINDING", "Data finding for MB-57: 3,336 lots have a street_name_normalized that conflicts with the frontage street and 27,680 have none; the rules read primary_frontage_street_name, so no figure changes."],
    ["R-LS", "A", "2026-10-31-batch-am#CHAT-214.GATE-1", "MB-67's pre-policy commits land through a ONE-TIME landing exception that names exactly the commits 42521481..ce116571 and 3e3212b9; it is not a general code rule."],
    ["R-LT", "A", "2026-10-31-batch-am#CHAT-214.GATE-2", "R-KF..R-LF move from OWED to RECORDED, each with its behavioural lock named, before MB-67 lands. This row is the precondition only: the rows stay OWED until MB-67 names its locks, and this batch flips none of them."],
    ["R-LU", "A", "2026-10-31-batch-am#CHAT-214.GATE-3", "MB-67 grandfathers the existing literals in the other 65 in-scope files as a frozen baseline; only new literals fail; the baseline is burned down over time."],
    ["R-LV", "A", "2026-10-31-batch-am#CHAT-214.GATE-4", "MB-68 round-0 count floors: floors-172.json is written through the ruling door with owed_baseline 91.7, citing M-372 and M-322/M-330; the counts are generated by the tool, never typed."],
    ["R-LW", "A", "2026-10-31-batch-am#CHAT-214.GATE-5", "MB-68's cumulative group stays undeclared until MB-31/MB-64 supply a producer; this is recorded as a ledger row."],
    ["R-LX", "A", "2026-10-31-batch-am#CHAT-214.GATE-6", "Merge order: MB-68 first, then MB-67; after MB-68 lands the loop arm flips to required:true."],
  ];
  const TEXT: Record<string, string> = { A, M, L: L131, S: S68 };
  for (const [row, reg, cite, rule] of CASES) {
    it(`${row} carries ${cite} and its Rule text`, () => {
      expect(TEXT[reg], cite).toContain(cite);
      expect(TEXT[reg] + L131 + M + A + S68, cite + ' rule text').toContain(rule);
    });
  }
});
