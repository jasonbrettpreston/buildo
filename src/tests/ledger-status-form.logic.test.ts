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
  // integrate-12: LC-D12 closes on R-FV (its operator-authorized plan declares the single-call validation, plan :59/:101);
  // N-D1 stays RULING-OWED (its plan resolved NB-D1 without the operator, plan §11; operator 2026-10-20).
  it('L5 LIVE — LC-D7 closes on R-GS (A-5); LC-D6, LC-D11, M-D10, N-D5 on R-GT; LC-D12 on R-FV; N-D1 stays RULING-OWED', async () => {
    const m = await load();
    const rows = m.parseDefectRows(readFileSync(join(process.cwd(), 'docs/reports/defect-ledger.md'), 'utf8'));
    const status = (id: string) => rows.find((r) => r.id === id)?.status;
    expect(status('LC-D7')).toBe('CLOSED · declared deviation (R-GS)');
    for (const id of ['LC-D6', 'LC-D11', 'M-D10', 'N-D5']) expect(status(id), id).toBe('CLOSED · declared deviation (R-GT)');
    expect(status('LC-D12')).toBe('CLOSED · declared deviation (R-FV)');
    expect(status('N-D1')).toMatch(/^OPEN · \*\*PIN\*\* RULING-OWED /);
  });
});

// rule-map: R-GT — a conversion retires an INGESTOR's local acquisition override (integrate-12). For the row's first
// cases (LC-D6/LC-D11, M-D10, N-D5) the retirement is a declared `deviations[]` entry naming the override, and neither
// the frozen shell nor the compute keeps a local path (env var, argv position, data/ cache, execSync extraction): the
// declared external is the only source. Compute purity (R-W) already bars process.env/argv from every compute.
describe('R-GT — local acquisition overrides are retired by declared deviation', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const LOCAL = /process\.argv\[[23]\]|LOCAL_ZIP|execSync|data\/3d-massing|neighbourhoods-4326/;
  const cases: Array<[string, string, RegExp]> = [
    ['load-centreline', 'LC-D6/LC-D11', /CENTRELINE_LOCAL_ZIP/],
    ['load-massing', 'M-D10', /data\/3d-massing-wgs84\/ cache, process\.argv\[2\]/],
    ['load-neighbourhoods', 'N-D5', /data\/neighbourhoods-4326\.geojson.*process\.argv\[2\]/],
  ];
  it.each(cases)('%s (%s): a deviations[] entry names the retired override; shell and compute keep no local path', (slug, _ids, from) => {
    const d = JSON.parse(read(`scripts/${slug}.descriptor.json`)) as { deviations: Array<{ from: string }> };
    expect(d.deviations.some((x) => from.test(x.from)), `${slug} declares the retirement`).toBe(true);
    for (const rel of [`scripts/${slug}.js`, `scripts/lib/compute/${slug}.js`]) expect(LOCAL.test(code(rel)), rel).toBe(false);
  });
  it('RED — a shell that reads process.argv[2] again is caught', () => {
    expect(LOCAL.test("const p = process.argv[2] || url;")).toBe(true);
  });
});
