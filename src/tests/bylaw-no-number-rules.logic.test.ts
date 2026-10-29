// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-322 (dated note 2026-10-29, NN-Q1/NN-Q5), M-286 (NN-Q2), M-82 Q5 (NN-Q3), M-256 (NN-Q4), M-75 (correction form), M-321 (pre-registration);
//            decision log wf1/rulings-rec3@fb845fb5:docs/reports/decisions/2026-10-29-batch-aa.json (CHAT-198.NN-Q1..NN-Q5);
//            scripts/analysis/bylaw-validation/coa-expected/prereg-nn.json
//
// Batch 2026-10-29-aa: the model applies the no-number rules the operator ruled on. Red first: docs/reports/red-evidence/bylaw/bylaw-nn-rules-red.txt.
// Pure parts run everywhere; the scorer rows need the values-only coa-data (skipped when absent, as coa-scorecard.logic.test.ts).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const TOOLS = 'scripts/analysis/bylaw-validation';
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

// ---------------------------------------------------------------- NN-Q3: the main building's floor area
describe('NN-Q3: main_building_gfa_m2, plan facts then footprint x storeys then the maximum build', () => {
  it('resolveMainBuildingGfa takes the first source that holds a figure', async () => {
    const M = await mod('scripts/analysis/bylaw/main-building-gfa.mjs');
    expect(M.resolveMainBuildingGfa({ plan_gfa_m2: 86.02, footprint_sqm: 60, storeys: 2, max_build_gfa_m2: 300 })).toEqual({ value: 86.02, basis: 'plan_facts' });
    expect(M.resolveMainBuildingGfa({ plan_gfa_m2: null, footprint_sqm: 60, storeys: 2, max_build_gfa_m2: 300 })).toEqual({ value: 120, basis: 'user_footprint_storeys' });
    expect(M.resolveMainBuildingGfa({ footprint_sqm: 60, max_build_gfa_m2: 300 })).toEqual({ value: 300, basis: 'max_build' }); // footprint needs storeys too
    expect(M.resolveMainBuildingGfa({ plan_gfa_m2: 0, max_build_gfa_m2: Number.NaN })).toEqual({ value: null, basis: 'none' });
    expect(M.resolveMainBuildingGfa(undefined)).toEqual({ value: null, basis: 'none' });
  });

  it('the declared input maps to Ch.800 800.50(320) and carries its input fidelity', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/input-fidelity.json'), 'utf8'));
    expect(v.dsl_input.main_building_gfa_m2).toMatchObject({ unit: 'm2', definition: '800.50(320)' });
    expect(v.dsl_target.dwelling_rooms).toBeUndefined(); // the operator did not add it
    expect(f.records['800.50(320)']).toMatchObject({ input: 'main_building_gfa_m2', status: 'approximates' });
  });

  it('150.7.60.50(2) and 150.8.60.50(2) are LIMIT max gfa_m2 valued by the input, and the evaluator answers with it', async () => {
    const { E, units, C } = await (await mod(`${TOOLS}/assembly.mjs`)).loadRealLotAssembly(ROOT);
    const lot = (bt: string, gfa: number): Json => ({ zone: 'RD', label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: bt, exception: null,
      flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, suite_one_storey: false },
      vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, main_building_gfa_m2: gfa } });
    const eff = (l: Json) => E.effective(l, 'gfa_m2', E.loadCandidates(l, units).candidates, C);
    const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
    for (const id of ['150.7.60.50(2)#whole', '150.8.60.50(2)#whole']) expect([byId.get(id)?.archetype, byId.get(id)?.target, byId.get(id)?.bound]).toEqual(['LIMIT', 'gfa_m2', 'max']);
    const g = eff(lot('garden_suite', 86.02));
    expect([g.status, g.value, String(g.winner?.unit_id ?? g.winner)]).toEqual(['value', 86.02, '150.7.60.50(2)#whole']); // below the 120 m2 cap: the house decides
    expect(eff(lot('garden_suite', 200)).value).toBe(120); // above it: the 120 m2 cap of 150.7.60.50(4)(A) decides
    const l = eff(lot('laneway_suite', 90));
    expect([l.status, l.value]).toEqual(['value', 90]);
  });
});

// ---------------------------------------------------------------- audit defect 2
describe('audit defect 2: 10.5.100.1(1)(C) driveway width keeps the parking-width arm', () => {
  it('the unit is the lesser of 6.0 m and the parking width, not always 2.6 m', async () => {
    const { E, units, C } = await (await mod(`${TOOLS}/assembly.mjs`)).loadRealLotAssembly(ROOT);
    const lot = (pw: number): Json => ({ zone: 'RD', label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', exception: null,
      flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, flat_or_shallow_roof: false },
      vars: { lot_frontage_m: 10, lot_depth_m: 40, lot_area_m2: 400, parking_width_m: pw, townhouse_unit_width_m: 0 } });
    const only = (pw: number): Json => { const l = lot(pw); return E.effective(l, 'driveway_width_m', E.loadCandidates(l, units).candidates.filter((u: Json) => u.unit_id === '10.5.100.1(1)#(1)(C)'), C); };
    expect(only(3.66).value).toBe(3.66); // A0170/26EYK#4: the operator's 3.66 m is the parking-width arm
    expect(only(7).value).toBe(6); // arm (i)
    const u = units.find((x: Json) => x.unit_id === '10.5.100.1(1)#(1)(C)');
    expect(u.literals_not_expressed.map((x: Json) => x.clause)).toContain('(1)(C)(iv)'); // the 2.6 m arm applies only if all parking is in the rear yard
  });
});

// ---------------------------------------------------------------- NN-Q4
describe('NN-Q4: the user\'s neighbour front setbacks replace the footprint estimate', () => {
  const FA = async () => mod('scripts/analysis/bylaw/front-averaging.mjs');
  const cfg = { fya_porch_allowance_m: 1.0 };
  const est = [{ neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1, bldg_to_subject_m: 5, est_status: 'estimated', front_setback_est_m: 12.5 }];
  it('one or two supplied figures are averaged, no porch allowance, no survey flag; the estimate is the flagged fallback', async () => {
    const M = await FA();
    const two = M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [13.44, 13.39] });
    expect([two.basis, two.front_setback_m, two.needs_survey, two.disclosures, two.vars.abutting_front_setback_m, two.flags.two_abutting_buildings_within_15_m]).toEqual(['user_supplied', 13.42, false, [], 13.42, true]);
    const one = M.resolveFrontAveraging([], cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [5.91] });
    expect([one.basis, one.front_setback_m, one.flags.one_abutting_building_within_15_m]).toEqual(['user_supplied', 5.91, true]);
    const fallback = M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 });
    expect([fallback.basis, fallback.front_setback_m, fallback.needs_survey, fallback.disclosures]).toEqual(['averaged_one', 13.5, true, ['front_yard_needs_survey']]);
    expect(M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [] }).basis).toBe('averaged_one');
    expect(M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [1, 2, 3] }).basis).toBe('averaged_one'); // three or more: Q-B2 unchanged
    expect(() => M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [-1] })).toThrow(/neighbour_front_setbacks_m/);
  });
  it('NN-Q4 value order (operator 2026-10-29): user figures, then the footprint estimate flagged needs survey, then the 6.0 m default flagged as a default; a missing figure never stops the calculation', async () => {
    const M = await FA();
    const excluded = [{ ...est[0], est_status: 'no_building', front_setback_est_m: null }];
    const u = M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 }, { neighbour_front_setbacks_m: [9] });
    const e = M.resolveFrontAveraging(est, cfg, { zone_default_m: 6 });
    const d = M.resolveFrontAveraging(excluded, cfg, { zone_default_m: 6 });
    expect([u.basis, u.front_setback_m, u.needs_survey, u.default_used]).toEqual(['user_supplied', 9, false, undefined]);
    expect([e.basis, e.front_setback_m, e.needs_survey, e.default_used]).toEqual(['averaged_one', 13.5, true, undefined]);
    expect([d.basis, d.front_setback_m, d.needs_survey, d.default_used, d.disclosures]).toEqual(['default_6_0', 6, true, true, ['front_yard_survey_required']]);
    expect(M.DEFAULT_FRONT_SETBACK_M).toBe(6);
    // the max-build scenario evaluates with the default instead of returning not_evaluated (blind run A0277: 7 scenario rows owed for this reason alone)
    const { E, units, C } = await (await mod(`${TOOLS}/assembly.mjs`)).loadRealLotAssembly(ROOT);
    const l: Json = { zone: 'RD', label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', exception: null,
      flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, abuts_lane: false, flat_or_shallow_roof: false, ...d.flags },
      vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, ...d.vars } };
    const r = E.effective(l, 'front_setback_m', E.loadCandidates(l, units).candidates, C);
    expect([r.status, r.value]).toEqual(['value', 6]);
  });
  it('the user input is declared', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
    expect(v.user_input).toContain('neighbour_front_setbacks_m');
  });
});

// ---------------------------------------------------------------- the scorer's readers
describe('applicantFigures reads the applicant\'s own plan-fact figures (NN-Q2, NN-Q3, NN-Q4)', () => {
  it('suite height and separation, main building floor area, neighbour setbacks in both record shapes', async () => {
    const L = await mod(`${TOOLS}/coa-lotfacts.mjs`);
    const a = L.applicantFigures({ ancillary: { height_m: 4.9, separation_to_house_m: 3.85 }, existing_gfa_m2: 86.02, neighbour_front_setbacks_m: [{ address_or_side: 'No. 46', value: 13.44 }, 13.39] });
    expect(a).toEqual({ suite_height_m: 4.9, suite_separation_m: 3.85, existing_gfa_m2: 86.02, neighbour_front_setbacks_m: [13.44, 13.39] });
    expect(L.applicantFigures({ ancillary: { height_m: null, separation_to_house_m: 0 }, existing_gfa_m2: 0, neighbour_front_setbacks_m: [null, 'x', -1] }))
      .toEqual({ suite_height_m: null, suite_separation_m: 0, existing_gfa_m2: null, neighbour_front_setbacks_m: [] });
    expect(L.applicantFigures(null).neighbour_front_setbacks_m).toEqual([]);
  });
});

// ---------------------------------------------------------------- NN-Q1
describe('NN-Q1: the other building\'s figure is the City comparator; ANSWERED is in the answered rate and out of accuracy', () => {
  const CP = createRequire(import.meta.url)(path.join(ROOT, TOOLS, 'coa-parse.cjs'));
  const req = 'The gross floor area of an ancillary building containing a garden suite must be less than the gross floor area of the residential building on a lot.';
  it('referentFigure takes the bracketed figure of the residential building from the proposal', () => {
    expect(CP.referentFigure(req, 'The gross floor area of the ancillary building containing a garden suite will be 99.22 m² and will be greater than the gross floor area of the residential building on the lot (86.02 m²).')).toEqual({ value: 86.02, unit: 'm²' });
    expect(CP.referentFigure(req, 'The gross floor area will be 99.22 m².')).toBeNull(); // the notice prints no figure for the other building
    expect(CP.referentFigure('The maximum height is 10 m.', 'The height will be 11 m (the residential building: 9 m).')).toBeNull(); // the requirement prints its own figure
    expect(CP.referentFigure('The minimum rear yard setback is required.', 'The residential building (7 m).')).toBeNull(); // no two-building comparison
  });
  it('the parser itself returns the figure for a notice that compares two buildings', () => {
    const text = ['PURPOSE OF THE APPLICATION', 'To construct a garden suite.', 'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW', '1. Section 150.7.60.50(2), By-law 569-2013',
      req, 'The gross floor area of the ancillary building containing a garden suite will be 99.22 m² and will be greater than the gross floor area of the residential building on the lot (86.02 m²).',
      'The Committee of Adjustment considered'].join('\n');
    const v = CP.parse(text).record.variances[0];
    expect(v.required).toEqual({ value: 86.02, unit: 'm²' });
  });
  it('statsOf: ANSWERED counts in the answered numerator and denominator and not in accuracy', async () => {
    const R = await mod(`${TOOLS}/coa-round.mjs`);
    const row = (clause: string, cls: string) => ({ clause_norm: clause, class: cls });
    const s = R.statsOf([row('150.7.60.40(1)(A)', 'MATCH'), row('150.7.60.40(1)(A)', 'DIFFER'), row('150.7.60.50(2)', 'ANSWERED'), row('150.7.60.30(1)(A)', 'NO ANSWER'), row('150.7.60.30(1)(A)', 'OWED')]);
    const a = s.articles['150.7.60'];
    expect([a.scored, a.an, a.accuracy, a.answered]).toEqual([2, 1, 0.5, 0.6]); // accuracy 1/2; answered (2+1)/(2+1+1+1)
    expect(R.floorsFrom(s).overall).toEqual({ accuracy: 50, answered: 60 });
  });
});

// ---------------------------------------------------------------- the scorer on the 172-notice set (values-only coa-data)
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
describe.skipIf(!have)('no-number rules on the 172-notice set (batch 2026-10-29-aa)', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'coann-')), 'sc.json');
  let sc: Json;
  const row = (f: string, n: number): Json => sc.rows.find((r: Json) => r.notice === f && r.n === n);
  it('runs', () => {
    execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'), '--parcels', path.join(DATA, 'parcels-all2.json'),
      '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
    sc = JSON.parse(fs.readFileSync(out, 'utf8'));
  }, 180000);
  it('NN-Q2: the applicant\'s suite height and separation from the plan facts answer the suite height and separation rows', () => {
    for (const [f, n, v] of [['A0428/26TEY', 7, 4], ['A0486/26TEY', 6, 7.5], ['A0486/26TEY', 7, 4], ['A0497/26TEY', 7, 7.5], ['A0428/26TEY', 8, 7.5], ['A0375/26TEY', 4, 7.5], ['A0221/26TEY', 8, 6.3]] as const) {
      expect([f, n, row(f, n).class, row(f, n).ours.value]).toEqual([f, n, 'MATCH', v]);
    }
  });
  it('NN-Q3 + NN-Q1: A0457/25EYK#1 compares the suite with the house floor area from the plan facts (86.02) and matches the printed comparator', () => {
    const r = row('A0457/25EYK', 1);
    expect([r.class, r.ours.value, r.city_value, r.city_unit, r.applicant_inputs.main_building_gfa_m2]).toEqual(['MATCH', 86.02, 86.02, 'm²', 'plan_facts']);
    expect(r.referent_note).toMatch(/other building's figure/);
  });
  it('NN-Q4: plan-fact neighbour setbacks answer A0096/26SC#1 (13.42) and A0428/26TEY#1 (5.91); the estimate is not promoted elsewhere', () => {
    expect([row('A0096/26SC', 1).class, row('A0096/26SC', 1).ours.value]).toEqual(['MATCH', 13.42]);
    expect([row('A0428/26TEY', 1).class, row('A0428/26TEY', 1).ours.value]).toEqual(['MATCH', 5.91]);
    expect(sc.rows.filter((r: Json) => r.front_fa && r.front_fa.basis === 'user_supplied').length).toBeGreaterThan(0);
  });
  it('NN-Q1: an answered row with no City figure is ANSWERED, listed by name; dwelling rooms stay NO ANSWER', () => {
    const r = row('A0573/24NY', 3);
    expect([r.class, r.city_value, r.ours.status]).toEqual(['ANSWERED', null, 'value']);
    expect(sc.answered_no_city_figure).toContain('A0573/24NY#3 10.20.40.50(1)(A)');
    expect(sc.rows.filter((x: Json) => x.class === 'ANSWERED').every((x: Json) => x.city_value == null && x.ours.status === 'value')).toBe(true);
    expect(row('A0071/26SC', 1).class).toBe('NO ANSWER');
  });
});
