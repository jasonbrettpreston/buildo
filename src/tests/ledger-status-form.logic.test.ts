// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-GR (one ledger status form)
//
// R-GR (tooling-fix-1 follow-on (b), operator y 2026-10-20 "a & b y"): a defect-ledger row whose status
// names a declared deviation takes ONE of two forms. "CLOSED · declared deviation (<rule id>[, …])" when the
// behaviour change is accepted and ruled — every id must resolve in the Spec 124 register; "OPEN · **PIN** <pin>"
// only while work is owed. Any third form is RED. RED before R-GR because … v3-label.mjs exports no
// ledgerStatusFormFindings, and the live ledger carried "CLOSED · declared deviation at ②" (no rule) and a
// bolded "**CLOSED · declared deviation at ②** (…)" form.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Row = { id: string; step: string; status: string; text: string };
type Finding = { id: string; why: string };
type Mod = {
  ledgerStatusFormFindings?: (rows: Row[], registerIds: Set<string>) => Finding[];
  parseDefectRows: (text: string) => Row[];
  loadExceptionSources: (root?: string) => { registerIds: Set<string> };
};
const load = async () => (await import(pathToFileURL(join(process.cwd(), 'scripts/analysis/gates/v3-label.mjs')).href)) as Mod;
const row = (id: string, status: string): Row => ({ id, step: 's', status, text: `| ${id} | s | a | l | ${status} | c | src |` });
const REG = new Set(['R-EV', 'R-AZ', 'R-AR.1']);

describe('R-GR — one ledger status form for a declared deviation', () => {
  it('L1 GREEN — the two forms pass: CLOSED citing resolving ids, OPEN · **PIN** <pin>', async () => {
    const m = await load();
    expect(typeof m.ledgerStatusFormFindings).toBe('function');
    expect(m.ledgerStatusFormFindings!([
      row('A-D1', 'CLOSED · declared deviation (R-EV)'),
      row('A-D2', 'CLOSED · declared deviation (R-AZ, R-AR.1)'),
      row('A-D3', 'OPEN · **PIN** RULING-OWED (declared deviation at ②; no register rule accepts it)'),
      row('A-D4', 'OPEN · **PIN** (L7) · DEVIATION at ②'),
      row('A-D5', 'OPEN · PIN'), // not a declared deviation: out of scope
    ], REG)).toEqual([]);
  });

  it('L2 RED — a third form is rejected: no rule id, a bolded CLOSED, a bare PIN, a non-bold OPEN · PIN', async () => {
    const m = await load();
    const out = m.ledgerStatusFormFindings!([
      row('B-D1', 'CLOSED · declared deviation at ②'),
      row('B-D2', '**CLOSED · declared deviation at ②** (Spec 124 R-EV, operator y 2026-10-20)'),
      row('B-D3', '**PIN** (declared deviation at ②)'),
      row('B-D4', 'OPEN · PIN (declared deviation at ②)'),
    ], REG);
    expect(out.map((f) => f.id)).toEqual(['B-D1', 'B-D2', 'B-D3', 'B-D4']);
  });

  it('L3 RED — a CLOSED row whose cited id does not resolve in the register', async () => {
    const m = await load();
    const out = m.ledgerStatusFormFindings!([row('C-D1', 'CLOSED · declared deviation (R-ZZ)')], REG);
    expect(out.map((f) => f.id)).toEqual(['C-D1']);
    expect(out[0]?.why).toContain('R-ZZ');
  });

  it('L4 LIVE — every declared-deviation row in docs/reports/defect-ledger.md takes one of the two forms', async () => {
    const m = await load();
    const rows = m.parseDefectRows(readFileSync(join(process.cwd(), 'docs/reports/defect-ledger.md'), 'utf8'));
    expect(m.ledgerStatusFormFindings!(rows, m.loadExceptionSources().registerIds)).toEqual([]);
  });

  // R-GS / R-GT (operator y 2026-10-20: "y to your recommendations to 1 and 2 ... y to liftinh A-5"): each
  // row closes only on the rule whose text covers it; R-AZ and R-AR.1 are not stretched.
  it('L5 LIVE — LC-D7 closes on R-GS (A-5); LC-D6, LC-D11, M-D10, N-D5 on R-GT; N-D1 and LC-D12 stay RULING-OWED', async () => {
    const m = await load();
    const rows = m.parseDefectRows(readFileSync(join(process.cwd(), 'docs/reports/defect-ledger.md'), 'utf8'));
    const status = (id: string) => rows.find((r) => r.id === id)?.status;
    expect(status('LC-D7')).toBe('CLOSED · declared deviation (R-GS)');
    for (const id of ['LC-D6', 'LC-D11', 'M-D10', 'N-D5']) expect(status(id), id).toBe('CLOSED · declared deviation (R-GT)');
    for (const id of ['N-D1', 'LC-D12']) expect(status(id), id).toMatch(/^OPEN · \*\*PIN\*\* RULING-OWED /);
  });
});
