// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-337 (63 Johnston Ave scoped DATA flag, EVE.R5-5; M-355: rests on M-337, not M-308), M-197 (suite_wall_openings default), M-287 (explained_differences)
// R5-5 ruled (2026-10-22-page-eve#EVE.R5-5, M-337): 63 Johnston Ave rows are an explained DATA flag (parcel row carries the merged Plan 1743 Lots 190 and 191; the City applied the arm for the severed lot). M-355 (CHAT-81.CITE-1) moved the basis from M-308 to M-337.
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
describe.skipIf(!have)('R5-5 (M-337): 63 Johnston Ave explained data flag', () => {
  it('the three 559 / platform rows on A0255/26NY and A0263/21NY are DATA, not DIFFER, and name M-337', () => {
    const sc = score();
    for (const [nt, n] of [['A0255/26NY', 2], ['A0263/21NY', 1], ['A0263/21NY', 2]] as const) {
      const r = row(sc, nt, n);
      expect(r.class, nt + ' ' + n).toBe('DATA');
      expect(r.explained_by, nt + ' ' + n).toBe('M-337');
    }
  }, 180000);
});
