// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-FA; Spec 123 §6 (G3)
//
// Spec 124 R-FA (McDonald's Airtight V3, operator y 2026-10-20: "y to all" — (a) fix the G3 scorer
// header quirk). A markdown table's HEADER row and its SEPARATOR row are never data rows, for G3,
// G-2 or any other row-counting scorer; one shared helper (`tableDataRows`,
// scripts/analysis/gates/markdown-table.mjs) decides it for all of them.
// Before R-FA, `scoreG3` counted the PH-3 header as a data row, so a plain header cost a point,
// and the "fix" stuffed the disposition vocabulary into the header (e.g.
// docs/reports/2026-09-16-batch2-i4-link-neighbourhoods-assessment.md:115); on refresh_snapshot
// that same header was then read by G-2 as an ungrounded preserved-in-compute row (Rule 4).
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Score = { max: number; score: number; detail: string };
type Sv = {
  scoreG3: (report: string) => Score;
  checkPreservedInComputeHasWhy: (report: string) => { pass: boolean; detail: string; violations: string[] };
  parseChurnTable: (text: string) => { bySlug: Map<string, { quadrant: string | null }> };
};
type Mt = { tableDataRows: (text: string) => Array<{ text: string; line: number }> };
type Reg = { defectDefinitionRows: (text: string) => Array<{ id: string; status: string; line: number }> };

let sv: Sv;
let mt: Mt;
let reg: Reg;
beforeAll(async () => {
  sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as Sv;
  mt = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/markdown-table.mjs')).href)) as unknown as Mt;
  reg = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/registries.mjs')).href)) as unknown as Reg;
});

const ph3 = (header: string, rows: string[]) => ['## §2. PH-3 — Intent Ledger', header, '|---|---|', ...rows, '## §3. next'].join('\n');
const vocabRows = ['| `abc1234` | preserved-in-runner |', '| `1234abc` | knowingly-retired |'];

describe('R-FA — header and separator rows are never data rows', () => {
  it('the shared helper drops the header (the row before a separator) and every separator, aligned or not', () => {
    const text = ['| a | b |', '|:---|---:|', '| 1 | 2 |', '', '| c | d |', '| --- | --- |', '| 3 | 4 |'].join('\n');
    expect(mt.tableDataRows(text).map((r) => r.text)).toEqual(['| 1 | 2 |', '| 3 | 4 |']);
    expect(mt.tableDataRows(text).map((r) => r.line)).toEqual([3, 7]);
  });

  it('G3: a plain header with every data row in the vocabulary scores 2/2 (was 1/2)', () => {
    const g3 = sv.scoreG3(ph3('| commit | disposition |', vocabRows));
    expect(g3.score).toBe(2);
    expect(g3.detail).toBe('table rows=2 vocab-hit rows=2');
  });

  it('G3: vocabulary stuffed into the header does not count as a vocab-hit row', () => {
    const stuffed = '| commit | disposition (preserved-in-runner / preserved-in-compute / knowingly-retired) |';
    const g3 = sv.scoreG3(ph3(stuffed, ['| `abc1234` | preserved-in-runner |', '| `1234abc` | nothing named |']));
    expect(g3.detail).toBe('table rows=2 vocab-hit rows=1');
    expect(g3.score).toBe(1);
  });

  it('G-2: a header naming preserved-in-compute is not an ungrounded preserved-in-compute row', () => {
    const r = sv.checkPreservedInComputeHasWhy(ph3('| commit | disposition: preserved-in-compute or knowingly-retired |', vocabRows));
    expect(r.pass).toBe(true);
    expect(r.detail).toBe('0 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding');
  });

  it('the churn table and the #36 defect-definition reader use the same helper (a header shaped like data is skipped)', () => {
    const churn = ['| slug | a | b | c | d | e | quadrant |', '|---|---|---|---|---|---|---|', '| x_step | 1 | 2 | 3 | 4 | 5 | top-right |'].join('\n');
    expect([...sv.parseChurnTable(churn).bySlug.keys()]).toEqual(['x_step']);
    const ledger = ['| LC-D1 | step | anchor | header-shaped | STATUS |', '|---|---|---|---|---|', '| LC-D2 | load_centreline | a | s | CLOSED |'].join('\n');
    expect(reg.defectDefinitionRows(ledger).map((r) => r.id)).toEqual(['LC-D2']);
  });
});
