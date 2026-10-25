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
