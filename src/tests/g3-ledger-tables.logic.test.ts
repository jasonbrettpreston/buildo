// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-FB; R-FA; Spec 123 §6 (G3), Spec 123 §1 PH-3
//            ("ledger + evidence")
//
// Spec 124 R-FB (McDonald's Airtight V3, operator y 2026-10-20: "y show which ruling authorixzes this or create
// aruling for each."). G3 scores only INTENT-LEDGER tables: a table whose header names a Disposition column.
// Every other table in the PH-3 section (a census, a lock inventory, line accounting, provenance) is evidence and
// is not scored. G-2 reads through the same split but checks ledger AND evidence rows (no header-name escape from
// Rule 4). One shared reader decides it (`ledgerTableRows`,
// scripts/analysis/gates/markdown-table.mjs). Before R-FB, an evidence table's rows counted as un-dispositioned
// ledger rows, so a report that showed its evidence scored G3 1/2 (e.g. assert_schema: 29 rows, 12 vocab hits).
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Score = { max: number; score: number; detail: string };
type Sv = {
  scoreG3: (report: string) => Score;
  checkPreservedInComputeHasWhy: (report: string) => { pass: boolean; detail: string; violations: string[] };
};
type Row = { text: string; line: number };
type Mt = {
  tableDataRows: (text: string) => Row[];
  markdownTables: (text: string) => Array<{ header: Row | null; columns: string[]; rows: Row[] }>;
  ledgerTableRows: (text: string) => { ledger: Row[]; evidence: Row[] };
};

let sv: Sv;
let mt: Mt;
beforeAll(async () => {
  sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as Sv;
  mt = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/markdown-table.mjs')).href)) as unknown as Mt;
});

const LEDGER = ['| # | Construct | Disposition |', '|---|---|---|', '| 1 | `x` | preserved-in-runner |', '| 2 | `y` | knowingly-retired |'];
const EVIDENCE = ['| Lines | Category | Evidence |', '|---|---|---|', '| 1-10 | header | comment |', '| 11-40 | body | logic |', '| 41-50 | tail | export |'];
const report = (...blocks: string[][]) => ['## §2. PH-3 — Intent Ledger', ...blocks.flatMap((b) => [...b, '']), '## §3. next'].join('\n');

describe('R-FB — G3 scores intent-ledger tables only; evidence tables in PH-3 are not scored', () => {
  it('the shared reader splits ledger rows (header names a Disposition column) from evidence rows', () => {
    const text = report(LEDGER, EVIDENCE);
    const { ledger, evidence } = mt.ledgerTableRows(text);
    expect(ledger.map((r) => r.text)).toEqual(['| 1 | `x` | preserved-in-runner |', '| 2 | `y` | knowingly-retired |']);
    expect(evidence.map((r) => r.text)).toEqual(['| 1-10 | header | comment |', '| 11-40 | body | logic |', '| 41-50 | tail | export |']);
  });

  it('tableDataRows is unchanged: it is the union of every table\'s rows, in order (R-FA)', () => {
    const text = report(LEDGER, EVIDENCE);
    const all = mt.markdownTables(text).flatMap((t) => t.rows);
    expect(mt.tableDataRows(text)).toEqual(all);
    expect(mt.tableDataRows(text)).toHaveLength(5);
  });

  it('G3: a fully dispositioned ledger beside an evidence table scores 2/2 and reports both counts', () => {
    const g3 = sv.scoreG3(report(LEDGER, EVIDENCE));
    expect(g3.score).toBe(2);
    expect(g3.detail).toBe('ledger rows=2 vocab-hit rows=2; evidence rows=3 (not scored)');
  });

  it('G3: a ledger row with no disposition still costs the point (the evidence carve-out does not hide it)', () => {
    const partial = [...LEDGER, '| 3 | `z` | nothing ruled |'];
    const g3 = sv.scoreG3(report(partial, EVIDENCE));
    expect(g3.score).toBe(1);
    expect(g3.detail).toBe('ledger rows=3 vocab-hit rows=2; evidence rows=3 (not scored)');
  });

  it('G3: a PH-3 section with only evidence tables has no ledger, so it scores 1 (section present), never 2', () => {
    const g3 = sv.scoreG3(report(EVIDENCE));
    expect(g3.score).toBe(1);
    expect(g3.detail).toBe('ledger rows=0 vocab-hit rows=0; evidence rows=3 (not scored)');
  });

  it('G-2 uses the same split but reads ledger AND evidence rows: Rule 4 has no table-header escape', () => {
    const ev = ['| Lines | Ruling |', '|---|---|', '| 1-10 | preserved-in-compute |'];
    const r = sv.checkPreservedInComputeHasWhy(report(LEDGER, ev));
    expect(r.pass).toBe(false);
    expect(r.detail).toBe('1 preserved-in-compute row(s), 1 with no why/notes.json/checks[] grounding');
    const grounded = ['| Lines | Ruling |', '|---|---|', '| 1-10 | preserved-in-compute, rule DECLARED in notes.json |'];
    expect(sv.checkPreservedInComputeHasWhy(report(LEDGER, grounded)).pass).toBe(true);
  });
});
