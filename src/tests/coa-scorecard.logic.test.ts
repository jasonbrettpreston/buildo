// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-125, M-127, M-236 dated note 2026-10-20
// DRAFT RULING pending (operator): CoA scorecard tools under scripts/analysis/bylaw-validation/coa-*.
//
// Regression lock for the four-district CoA scorecard (123 notices, 496 variances, scored at ac78d5dd:
// MATCH 246 / DIFFER 29 / NO ANSWER 69 / OWED 53 / NOT MODELLED 70 / DATA 29).
// The data are values-only JSON kept OUTSIDE git (default ~/Buildo-scratch/coa-data, override COA_DATA); without them the tests skip.
// Pinned at the commit: a total that moves is a failure. At any later tree the totals are printed as information (the evaluator moved on).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels.json')) && fs.existsSync(path.join(DATA, 'expected-4d.json'));
const TOOLS = 'scripts/analysis/bylaw-validation';

describe.skipIf(!have)('CoA four-district scorecard', () => {
  it('the scorer reproduces the recorded class totals (--check)', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc-')), 'sc.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices.json'),
      '--parcels', path.join(DATA, 'parcels.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out,
      '--check', path.join(DATA, 'expected-4d.json')], { encoding: 'utf8' });
    expect(so).toMatch(/CHECK (OK|INFO)/);
  }, 120000);
  it('the parser reproduces the stored notice records from the scrubbed raw samples', () => {
    const docs = path.join(DATA, 'db-notices/coa_notices'); if (!fs.existsSync(docs)) return;
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coan-')), 'n.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-notices-from-docs.cjs'), docs, out, path.join(DATA, 'samples')], { encoding: 'utf8' });
    expect(so).toMatch(/diff 0/);
  });
});

// Fix round 4D lane D (F-4D-13, F-4D-20, F-4D-8/9/14, D-LIPPINCOTT / CHAT-45): scorer fixes, pinned on the 172-notice set.
const have172 = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
describe.skipIf(!have172)('CoA scorecard 4D fixes (172 notices)', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc172-')), 'sc.json');
  let sc: any;
  const rowsOf = (f: string) => sc.rows.filter((r: any) => r.notice === f);
  it('runs', () => {
    execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'),
      '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
    sc = JSON.parse(fs.readFileSync(out, 'utf8'));
  }, 120000);
  it('F-4D-13: "within 0.3 m of the rear main wall" is a definition; the City figure is 1.8 m', () => {
    const r = rowsOf('A0486/26TEY').find((x: any) => /\(E\)\(ii\)/.test(x.clause));
    expect(r.city_value).toBe(1.8);
    expect(r.scorer_fix || r.s5_note).toBeTruthy();
  });
  it('F-4D-20: non-569 zones and unmatched addresses are NOT SCORABLE, not DATA/misses', () => {
    for (const f of ['A0114/26SC', 'A0553/26TEY']) for (const r of rowsOf(f)) expect(r.class).toBe('NOT SCORABLE');
  });
  it('F-4D-9: a parcel row that disagrees with the survey by more than 5 percent is flagged', () => {
    const l = sc.lots['A0118/26TEY'];
    expect(l.survey_check.flag).toBe(true);
    expect(l.survey_check.disagree.join(' ')).toMatch(/area/);
  });
  it('F-4D-8/9/14: a flagged row that matches the City on survey dimensions is an explained DATA flag', () => {
    const flagged = sc.rows.filter((r: any) => r.survey_flag);
    expect(flagged.length).toBeGreaterThan(0);
    for (const r of flagged) { expect(r.class).toBe('DATA'); expect(r.why).toMatch(/survey/); }
  });
  it('CHAT-45: 202 Lippincott St (A0375/26TEY) stays semi-detached, as the City notice words it', () => {
    expect(sc.lots['A0375/26TEY'].main_type.bt).toBe('semi_detached_house');
  });
});
