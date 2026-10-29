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
    // A0153/26EYK (survey frontage 12.19 m vs parcel 18.31 m) is the survey-sourced flag case (added); the original A0118/26TEY area lock (9612e289) is kept.
    const l = sc.lots['A0153/26EYK'];
    expect(l.survey_check.flag).toBe(true);
    expect(l.survey_check.disagree.join(' ')).toMatch(/frontage/);
    const a118 = sc.lots['A0118/26TEY']; // plan-statistics area 566.38 vs parcel 282.79 (CHAT-156/163)
    expect(a118.survey_check.flag).toBe(true);
    expect(a118.survey_check.disagree.join(' ')).toMatch(/area/);
  });
  it('F-4D-8/9/14: a flagged row that matches the City on survey dimensions is an explained DATA flag', () => {
    const flagged = sc.rows.filter((r: any) => r.survey_flag);
    expect(flagged.length).toBeGreaterThan(0);
    for (const r of flagged) { expect(r.class).toBe('DATA'); expect(r.why).toMatch(/M-326 lot figure/); } // CHAT-156: the figure used may be any ranked source
  });
  it('CHAT-45: 202 Lippincott St (A0375/26TEY) stays semi-detached, as the City notice words it', () => {
    expect(sc.lots['A0375/26TEY'].main_type.bt).toBe('semi_detached_house');
  });
  it('CHAT-46 / 800.50(445): a frontage measured along a curved front lot line is not the survey preference; A0247/26NY (survey arc 14.6, chord 14.22) returns to MATCH', () => {
    // The 14.6 m frontage (a ranked decision-notice figure) is measured along a curved front, so CHAT-46 / M-313 (applied to every ranked
    // frontage source, scorer CARD Q-c) leaves it unread; nothing else is ranked, so nothing is held and the row scores on the parcel frontage.
    const l = sc.lots['A0247/26NY'];
    expect([l.survey_check.held?.curved_front, l.survey_check.held?.frontage_m]).toEqual([true, null]); // M-313 OBSERVABLE (restored, B5 F-1)
    for (const f of ['A0178/26EYK', 'A0193/26EYK', 'A0242/26NY', 'A0247/26NY']) expect([f, sc.lots[f].survey_check.held?.curved_front]).toEqual([f, true]);
    const r = rowsOf('A0247/26NY').find((x: any) => /^10\.5\.50\.10\(1\)\(C\)/.test(x.clause));
    expect([r.class, r.city_value, r.ours.value]).toEqual(['MATCH', 60, 60]);
  });
  it('CHAT-156 / CHAT-163 / M-326: a lot figure is read in M-326 order (survey, zoning notice, plan statistics, site plan, decision notice) and its source is on every row', () => {
    // wf1/rulings-rec3@d8306917 2026-10-25-batch-g#CHAT-156 (amends CHAT-145 C for the scorer only).
    const ORDER = ['survey', 'zoning_notice', 'plan_statistics', 'site_plan', 'decision_notice']; // CHAT-163
    const SV: Array<[string, string]> = [['frontage_m', 'lot_frontage_m'], ['depth_m', 'lot_depth_m'], ['area_m2', 'lot_area_m2'], ['corner', 'corner_lot']];
    let held = 0;
    for (const [f, l] of Object.entries<any>(sc.lots)) {
      // survey_check.held = the figures read from plan facts; on a no-parcel lot none is used (D7), so lot_source is null (PLAN v4 H-1).
      const h = l.survey_check?.held; if (!h || !l.parcel) continue;
      const pf = JSON.parse(fs.readFileSync(path.join(DATA, 'plan-facts', f.replace('/', '-') + '.json'), 'utf8'));
      for (const [k, pk] of SV) if (h[k] != null) {
        held += 1;
        if (l.lot_source[k] === 'read_record') { expect(ORDER).not.toContain(pf.lot_source?.[pk]); continue; } // CHAT-164: an unknown-source figure read through the read-record
        expect(ORDER).toContain(pf.lot_source?.[pk]);
        expect(`${f} ${k} ${l.lot_source[k]}`).toBe(`${f} ${k} ${pf.lot_source[pk]}`);
      }
    }
    expect(held).toBeGreaterThan(0);
    for (const r of sc.rows) expect(Object.keys(r.lot_source || {}).sort()).toEqual(['area_m2', 'corner', 'depth_m', 'frontage_m']);
    expect(sc.lots['A0118/26TEY'].survey_check.held?.frontage_m).toBe(15.24);
    expect(sc.lots['A0118/26TEY'].lot_disclosure).toBe('lot figure not from a survey: frontage_m plan_statistics, depth_m plan_statistics, area_m2 plan_statistics');
    expect(sc.lots['A0375/26TEY'].lot_source).toEqual({ frontage_m: 'site_plan', depth_m: 'site_plan', area_m2: 'plan_statistics', corner: 'parcel' }); // S-1 (CHAT-163)
    expect(sc.lots['A0375/26TEY'].lot_disclosure).toBe('lot figure not from a survey: frontage_m site_plan, depth_m site_plan, area_m2 plan_statistics');
    for (const r of rowsOf('A0553/26TEY')) expect([r.lot_source, r.lot_disclosure]).toEqual([{ frontage_m: null, depth_m: null, area_m2: null, corner: null }, null]); // no parcel (D7)
    // survey_preferred (legacy name, PLAN v3 C-4) = a survey-sourced figure is read: false on every no-parcel lot (B5 F-3)
    for (const [f, l] of Object.entries<any>(sc.lots)) expect([f, l.survey_preferred]).toEqual([f, !!l.parcel && Object.values(l.lot_source).includes('survey')]);
  });
  it('CHAT-156 / CHAT-163 rows: four restored by the examined figures (A0375#1 by the site plan); A0205#9 value only; A0562#4 read in CHAT-164 round b', () => {
    const at = (f: string, n: number) => rowsOf(f).find((x: any) => x.n === n);
    const a118 = at('A0118/26TEY', 3);
    expect([a118.class, a118.class_on_survey, a118.ours.value, a118.city_value]).toEqual(['DATA', 'MATCH', 60, 60]);
    expect([at('A0166/26EYK', 1).class, at('A0166/26EYK', 1).ours.value]).toEqual(['MATCH', 245.145]);
    expect([at('A0203/26EYK', 1).class, at('A0203/26EYK', 1).ours.value]).toEqual(['MATCH', 255.065]);
    const a375 = at('A0375/26TEY', 1);
    expect([a375.class, a375.class_on_survey, a375.ours.value, a375.city_value]).toEqual(['DATA', 'MATCH', 85, 85]); // CHAT-163: site-plan frontage read
    const a205 = at('A0205/26NY', 9);
    expect([a205.class, a205.ours.value, a205.city_value]).toEqual(['DIFFER', 10.9275, 10.8]);
    expect(at('A0562/26TEY', 4).class).toBe('DATA'); // CHAT-164 round b: the corrected keyed corner (true) is read
  });
  it('CHAT-165: held-but-unread plan figures are shown, values only', () => {
    // Data pins: these counts move only under the CHAT-164 round or a plan-facts change.
    for (const r of sc.rows) { expect('lot_held_unread' in r).toBe(true); expect(r.lot_held_unread).toBe(sc.lots[r.notice].lot_held_unread); } // S-3
    for (const [f, l] of Object.entries<any>(sc.lots)) { expect('lot_held_unread' in l).toBe(true); expect([f, l.lot_held_unread == null || /\(no parcel\)/.test(l.lot_held_unread) === !l.parcel]).toEqual([f, true]); if (!l.parcel && l.lot_held_unread != null) expect([f, /^lot figure held, not read: [a-z_0-9]+ [^ ,]+ \(no parcel\)(, [a-z_0-9]+ [^ ,]+ \(no parcel\))*$/.test(l.lot_held_unread)]).toEqual([f, true]); }
    const PRE = 'lot figure held, not read: ';
    const shown = Object.values<any>(sc.lots).filter((l) => l.lot_held_unread != null);
    const figs = shown.flatMap((l) => l.lot_held_unread.slice(PRE.length).split(/, (?=(?:frontage_m|depth_m|area_m2|corner) )/));
    const why: Record<string, number> = {}; for (const x of figs) { const w = x.match(/\(([^)]*)\)$/)?.[1] ?? '?'; why[w] = (why[w] || 0) + 1; }
    const contradicted = figs.filter((x) => /; contradicted by keyed value /.test(x)).length; for (const k of Object.keys(why)) if (k.includes(';')) { why['source unknown'] = (why['source unknown'] || 0) + (why[k] ?? 0); delete why[k]; }
    expect([shown.length, figs.length, why, contradicted]).toEqual([61, 108, { 'source unknown': 99, 'curved front': 3, 'no parcel': 6 }, 3]); // S-4 (no-parcel reading (c)); CHAT-164: 32 figures read, 4 of them contradicted and still disclosed (137 - 29 = 108; 128 - 29 = 99); round b: A0562 corner keyed true agrees, so it is read and not contradicted
    expect(figs.filter((x) => /site_plan/.test(x))).toEqual([]);
    expect([sc.lots['A0562/26TEY'].lot_held_unread, sc.lots['A0562/26TEY'].lot_source.corner]).toEqual([null, 'read_record']); // S-5: the operator-corrected keyed corner (true, site plan) agrees with the plan figure and is read
  });
  it('CHAT-164 round: read-record figures are read (source read_record); A0170#2 gfa 243.47 -> 244 stays MATCH; A0562#4 NO ANSWER to DATA (round b); contradicted figures stay disclosed', () => {
    const at = (f: string, n: number) => rowsOf(f).find((x: any) => x.n === n);
    const a170 = at('A0170/26EYK', 2);
    expect([a170.class, a170.ours.value, a170.city_value]).toEqual(['MATCH', 244, 244]);
    expect(sc.lots['A0170/26EYK'].lot_source.area_m2).toBe('read_record');
    expect(sc.lots['A0170/26EYK'].lot_held_unread).toBeNull();
    expect([at('A0562/26TEY', 4).class, at('A0562/26TEY', 4).ours.value]).toEqual(['DATA', 60]); // round b: corner read true against a parcel that holds not-corner; City 60
    expect(at('A0562/26TEY', 5).class).toBe('NO ANSWER'); // clause keying, not the lot figure
    expect([sc.lots['A0388/26TEY'].lot_source.area_m2, sc.lots['A0388/26TEY'].lot_held_unread]).toEqual(['read_record', null]);
    expect(sc.lots['A0578/26TEY'].lot_source.area_m2).toBe('read_record');
    expect(sc.lots['A0578/26TEY'].lot_held_unread).toBe('lot figure held, not read: area_m2 356.65 (source unknown; contradicted by keyed value 345.22)');
    // a case outside the record is untouched
    expect(sc.lots['A0090/26SC']?.lot_source?.area_m2 ?? null).not.toBe('read_record');
  });
  it('CHAT-165: the held-unread field moves no class or value (no-move lock)', () => {
    const tw = fs.mkdtempSync(path.join(os.tmpdir(), 'coalu-'));
    try {
      for (const d of ['bylaw', 'bylaw-validation']) fs.cpSync(path.join(ROOT, 'scripts/analysis', d), path.join(tw, 'scripts/analysis', d), { recursive: true });
      const lf = path.join(tw, TOOLS, 'coa-lotfacts.mjs'); const src = fs.readFileSync(lf, 'utf8');
      const A = 'export function lotHeldUnread(pf, p, rec = null) {';
      if (src.split(A).length !== 2) throw new Error('twin anchor not found once');
      fs.writeFileSync(lf, src.replace(A, 'export function lotHeldUnread() { return null; }\nfunction lotHeldUnreadOff(pf, p) {'));
      const args = (o: string) => ['--root', ROOT, '--notices', path.join(DATA, 'notices-all2.json'), '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', o];
      execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), ...args(path.join(tw, 'real.json'))], { encoding: 'utf8' });
      execFileSync('node', [path.join(tw, TOOLS, 'coa-scorecard.mjs'), ...args(path.join(tw, 'off.json'))], { encoding: 'utf8' });
      const real = JSON.parse(fs.readFileSync(path.join(tw, 'real.json'), 'utf8')); const off = JSON.parse(fs.readFileSync(path.join(tw, 'off.json'), 'utf8'));
      expect([real.rows.length, Object.keys(real.lots).length, off.rows.length, Object.keys(off.lots).length]).toEqual([698, 172, 698, 172]);
      const strip = (o: any) => { const { lot_held_unread: _x, ...rest } = o; return rest; }; // eslint-disable-line @typescript-eslint/no-unused-vars
      real.rows.forEach((r: any, i: number) => expect(strip(off.rows[i])).toEqual(strip(r)));
      for (const f of Object.keys(real.lots)) expect(strip(off.lots[f])).toEqual(strip(real.lots[f]));
      expect(real.rows.some((r: any) => r.lot_held_unread != null)).toBe(true);
      expect(off.rows.some((r: any) => r.lot_held_unread != null) || Object.values<any>(off.lots).some((l) => l.lot_held_unread != null)).toBe(false);
    } finally { fs.rmSync(tw, { recursive: true, force: true }); }
  }, 240000);
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
  it('M-290 label: a platform figure whose line is named AFTER it ("1.8m from the side lot lines ... and 10.88m from the rear") scores on the side target (A0205/26NY stays MATCH)', () => {
    for (const r of rowsOf('A0205/26NY').filter((x: any) => x.clause === '10.5.40.50(2)')) expect([r.target, r.class, r.ours.value]).toEqual(['platform_side_setback_m', 'MATCH', 1.8]);
  });
  it('complement share (EXC-W2-APPLY, verify-37 7): 10.20.40.10(2)(A) is "at least 70%" and the City quotes "a maximum of 30% may be higher"; the scorer compares the complement, so ours 70 MATCHES City 30 (A0120/26SC x2, A0354/26TEY)', () => {
    const rows = [...rowsOf('A0120/26SC'), ...rowsOf('A0354/26TEY')].filter((x: any) => /^10\.20\.40\.10\(2\)\(A\)/.test(x.clause));
    expect(rows.length).toBe(3);
    for (const r of rows) { expect([r.class, r.ours.value, r.complement_of]).toEqual(['MATCH', 70, 30]); expect(r.why).toMatch(/complement/); }
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
