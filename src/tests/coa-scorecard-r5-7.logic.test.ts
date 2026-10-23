// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-308 (explained data flag), M-197 (suite_wall_openings default), M-287 (explained_differences)
// R5-7 REVERTED (verify-40 finding 5): the only evidence was a plan-facts note quoting the City decision itself (circular). A structured plan-facts openings field is a NEW RULING NEEDED (see the operator page).
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
describe.skipIf(!have)('R5-7 reverted (verify-40 finding 5): the openings evidence stays circular, so it is not used for the suite arm', () => {
  // A0215/26EYK #1 is NO ANSWER, not DIFFER: R5-6 (commit 1b4b0eb1) withdrew shard w2-s22, so exception 900.6.10(478) is unauthored again and the
  // row stops at exception_not_authored:900.6.10(478) before any suite-arm answer exists. It was DIFFER only while 478 was keyed.
  it('A0215/26EYK #1 is NO ANSWER (exception_not_authored:900.6.10(478), R5-6 withdrew 478) and no row carries scorer_fix 4D-S4d', () => {
    const sc = score();
    expect(row(sc, 'A0215/26EYK', 1).class).toBe('NO ANSWER');
    expect(row(sc, 'A0215/26EYK', 1).ours.reason).toBe('exception_not_authored:900.6.10(478)');
    expect(sc.rows.filter((r: any) => r.scorer_fix === '4D-S4d').length).toBe(0); // eslint-disable-line @typescript-eslint/no-explicit-any -- scorer JSON
  }, 180000);
});
