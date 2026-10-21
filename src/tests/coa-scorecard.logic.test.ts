// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-125, M-127, M-236 dated note 2026-10-20
// DRAFT RULING pending (operator): CoA scorecard tools under scripts/analysis/bylaw-validation/coa-*.
//
// Regression lock for the CoA scorecard. The expected totals are COMMITTED beside the tool (coa-expected/expected-4d.json for the 123-notice set,
// coa-expected/expected-172.json for the 172-notice set) and carry an inputs key (Layer 2 table_version, evaluator_version, scorer sha): the lock is
// PINNED, so a changed total FAILS, at any tree whose inputs equal the pin (integrate-21). When an input moves, the check prints INFO and the test below
// fails with "re-pin" until `coa-scorecard.mjs --pin` is re-run: a moved input is a finding, never a silent pass.
// The data are values-only JSON kept OUTSIDE git (default ~/Buildo-scratch/coa-data, override COA_DATA); without them the tests skip.
// Pinned at the commit: a total that moves is a failure. At any later tree the totals are printed as information (the evaluator moved on).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const EXPECTED = path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected');
const have = fs.existsSync(path.join(DATA, 'parcels.json')) && fs.existsSync(path.join(EXPECTED, 'expected-4d.json'));
const TOOLS = 'scripts/analysis/bylaw-validation';

describe.skipIf(!have)('CoA four-district scorecard', () => {
  it('the scorer reproduces the recorded class totals (--check)', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc-')), 'sc.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices.json'),
      '--parcels', path.join(DATA, 'parcels.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out,
      '--check', path.join(EXPECTED, 'expected-4d.json')], { encoding: 'utf8' });
    expect(so).toMatch(/CHECK OK \(pinned\)/); // INFO means the inputs moved: re-pin with --pin and explain the totals
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
  it('CHAT-46 / 800.50(445): a frontage measured along a curved front lot line is not the survey preference; A0247/26NY (survey arc 14.6, chord 14.22) returns to MATCH', () => {
    const l = sc.lots['A0247/26NY'];
    expect(l.survey_check.held.curved_front).toBe(true);
    expect(l.survey_check.held.frontage_m).toBeNull();
    const r = rowsOf('A0247/26NY').find((x: any) => /^10\.5\.50\.10\(1\)\(C\)/.test(x.clause));
    expect([r.class, r.city_value, r.ours.value]).toEqual(['MATCH', 60, 60]);
  });
  it('A0385/26TEY: a notice citing 10.10.40.80(1)(C) is evidence that each facing main wall has an opening, so the 11 m arm answers (4D-S4c)', () => {
    const r = rowsOf('A0385/26TEY').find((x: any) => /^10\.10\.40\.80\(1\)\(C\)/.test(x.clause));
    expect([r.class, r.ours.value, r.scorer_fix]).toEqual(['MATCH', 11, '4D-S4c']);
  });
  it('F-4D-SC-245: the notice typo "10.50.60.70" reads as 10.5.60.70(1) (A0076/26SC ancillary coverage 10 percent)', () => {
    const r = rowsOf('A0076/26SC').find((x: any) => x.clause === '10.50.60.70');
    expect([r.clause_norm, r.class, r.ours.value]).toEqual(['10.5.60.70(1)', 'MATCH', 10]);
  });
  it('4D-S4b / M-287 / F-4D-7: openings cited by clause, the explained difference and the street name reach the rows', () => {
    expect(sc.rows.filter((r: any) => r.scorer_fix === '4D-S4b').length).toBeGreaterThan(0);
    const r = rowsOf('A0180/26TEY').find((x: any) => /^10\.5\.60\.70\(1\)\(B\)/.test(x.clause));
    expect([r.class, r.explained_by]).toEqual(['DIFFER', 'M-287']);
  });
  it('the regression lock is live: the committed 172-notice expectation is PINNED and equal (--check)', () => {
    const o2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coasc172c-')), 'sc.json');
    const so = execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'),
      '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', o2,
      '--check', path.join(EXPECTED, 'expected-172.json')], { encoding: 'utf8' });
    expect(so).toMatch(/CHECK OK \(pinned\)/);
  }, 120000);
});

// vocab.explained_differences (M-287) has a validated consumer: the scorer validates the table at load and reads it through explainRow.
// Pure checks, no external data.
const X = await import(path.join(ROOT, TOOLS, 'coa-explained.mjs'));
const CM = await import(path.join(ROOT, TOOLS, 'coa-clausemap.mjs'));
describe('vocab.explained_differences consumer (coa-explained.mjs)', () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
  const reg = new Set((fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/69a_mcbylaw_register.md'), 'utf8').match(/^\| \*\*M-\d+\*\*/gm) || []).map((x) => x.replace(/[|* ]/g, '')));
  const good = { dsl_target: { ancillary_coverage_pct: {} }, explained_differences: { '10.5.60.70(1)(B)': { target: 'ancillary_coverage_pct', ours: 5, city: 10, ruling: 'M-287', reading: 'a recorded operator reading of the clause' } } };
  it('the committed table is valid and its ruling row exists in the register', () => {
    expect(vocab.explained_differences['10.5.60.70(1)(B)']).toBeTruthy();
    expect(X.checkExplainedDifferences(vocab, reg)).toEqual([]);
  });
  it('a malformed or unruled entry is refused', () => {
    const bad = (e: object) => X.checkExplainedDifferences({ ...good, explained_differences: { '10.5.60.70(1)(B)': { ...good.explained_differences['10.5.60.70(1)(B)'], ...e } } }, new Set(['M-287']));
    expect(bad({})).toEqual([]);
    expect(bad({ target: 'no_such_target' }).join()).toMatch(/not a dsl_target/);
    expect(bad({ ours: 10 }).join()).toMatch(/nothing to explain/);
    expect(bad({ ruling: 'M-9999' }).join()).toMatch(/no register row/);
    expect(bad({ ruling: 'the operator' }).join()).toMatch(/register row id/);
    expect(bad({ reading: '' }).join()).toMatch(/reading is missing/);
  });
  it('the clause alias table reads the notice typo 10.50.60.70 as 10.5.60.70(1) and leaves real clauses alone (F-4D-SC-245)', () => {
    expect(CM.normClause('10.50.60.70').norm).toBe('10.5.60.70(1)');
    expect(CM.normClause('10.5.60.70(1)(B)').norm).toBe('10.5.60.70(1)(B)');
  });
  it('explainRow needs the clause, target, our figure and the City figure to equal the entry', () => {
    expect(X.explainRow(good, '10.5.60.70(1)(B)', 'ancillary_coverage_pct', 5, 10)).toBeTruthy();
    expect(X.explainRow(good, '10.5.60.70(1)(B)', 'ancillary_coverage_pct', 6, 10)).toBeNull();
    expect(X.explainRow(good, '10.5.60.70(1)(B)', 'ancillary_coverage_pct', 5, 11)).toBeNull();
    expect(X.explainRow(good, '10.5.60.70(1)(A)', 'ancillary_coverage_pct', 5, 10)).toBeNull();
  });
});
