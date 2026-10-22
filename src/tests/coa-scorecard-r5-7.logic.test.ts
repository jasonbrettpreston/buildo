// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-308 (explained data flag), M-197 (suite_wall_openings default), M-287 (explained_differences)
// HELD on R5-7 (recommendation awaiting the operator): 4D-S4 extension, openings evidence (notice text or plan facts) also sets suite_wall_openings on garden / laneway suite setback rows.
// The data are values-only JSON kept OUTSIDE git (default ~/Buildo-scratch/coa-data, override COA_DATA); without them the test skips.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
const score = (): any => { // eslint-disable-line @typescript-eslint/no-explicit-any -- scorer JSON
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc-r5-')), 'sc.json');
  execFileSync('node', [path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'),
    '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};
const row = (sc: any, notice: string, n: number): any => sc.rows.find((r: any) => r.notice === notice && r.n === n); // eslint-disable-line @typescript-eslint/no-explicit-any -- scorer JSON
describe.skipIf(!have)('R5-7 (HELD): openings evidence sets suite_wall_openings', () => {
  it('A0215/26EYK #1 (garden suite, windows in the side wall per the plan facts) takes the 150.7.60.20(5)(A) arm and matches the City 1.5 m', () => {
    const r = row(score(), 'A0215/26EYK', 1);
    expect(r.class).toBe('MATCH');
    expect(r.scorer_fix).toBe('4D-S4d');
  }, 180000);
});
