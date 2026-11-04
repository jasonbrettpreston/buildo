// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-435 (0.45 m is the disclosed arm), M-289 (4D-S4b, a notice citing (3)(A));
// MB-18 (l) operator O-l1 2026-11-03: scorer arm 4D-S4e, a notice citing 10.10.40.70(4) is the applicant's evidence of a blank side wall.
// (The label is 4D-S4e: 4D-S4d is the retired R5-7 label that coa-scorecard-r5-7.logic.test.ts locks as absent.)
// The data are values-only JSON kept OUTSIDE git (default ~/Buildo-scratch/coa-data, override COA_DATA); without them the tests skip.
// Red first: S1, S2 and S4 fail on the base (no arm 4D-S4e; A0594/26TEY #6 reads 0.45); S3 and S5 are locks.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have172 = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
let cache: Json | null = null;
const score = (): Json => {
  if (cache) return cache;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coa18l-')), 'sc.json');
  execFileSync('node', [path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), '--root', ROOT, '--notices', path.join(DATA, 'notices-all2.json'),
    '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
  cache = JSON.parse(fs.readFileSync(out, 'utf8')) as Json;
  return cache;
};
const row = (sc: Json, notice: string, n: number): Json => sc.rows.find((r: Json) => r.notice === notice && r.n === n);

describe.skipIf(!have172)('MB-18 l / scorer arm 4D-S4e on the 172-notice set (M-435, O-l1)', () => {
  it('S1 (red): A0396/26TEY #2 cites 10.10.40.70(4)(D) at 0.45 m and is scored on the blank-wall arm: MATCH 0.45, 4D-S4e', () => {
    const r = row(score(), 'A0396/26TEY', 2);
    expect([r.class, r.ours.value, r.ours.winner, r.scorer_fix, r.bsw_taken]).toEqual(['MATCH', 0.45, '10.10.40.70(4)#(4)(D)', '4D-S4e', 'notice cites 10.10.40.70(4)']);
  }, 180000);

  it('S2 (red): every row carrying 4D-S4e cites a 10.10.40.70(4) clause on side_setback_m; exactly one row carries it', () => {
    const rows = score().rows.filter((r: Json) => r.scorer_fix === '4D-S4e');
    expect(rows.map((r: Json) => `${r.notice}#${r.n}`)).toEqual(['A0396/26TEY#2']);
    for (const r of rows) expect([r.target, /^10\.10\.40\.70\(4\)/.test(r.clause_norm)]).toEqual(['side_setback_m', true]);
  }, 180000);

  it('S3 (lock): rows citing 10.10.40.70(3)(A) keep 4D-S4b and the 0.9 m answer (M-289)', () => {
    const rows = score().rows.filter((r: Json) => r.target === 'side_setback_m' && /^10\.10\.40\.70\(3\)\(A\)/.test(r.clause_norm) && typeof r.ours?.value === 'number');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect([r.notice, r.ours.value, r.scorer_fix === '4D-S4e']).toEqual([r.notice, 0.9, false]);
  }, 180000);

  it('S4 (red): a notice citing neither reads the stored 0.9 m: A0594/26TEY #6 is MATCH 0.9 with no arm', () => {
    const r = row(score(), 'A0594/26TEY', 6);
    expect([r.class, r.ours.value, r.ours.winner, r.scorer_fix ?? null]).toEqual(['MATCH', 0.9, '10.10.40.70(3)#(3)(A)', null]);
  }, 180000);

  it('S5 (lock): the retired label 4D-S4d stays absent', () => {
    expect(score().rows.filter((r: Json) => r.scorer_fix === '4D-S4d').length).toBe(0);
  }, 180000);
});
