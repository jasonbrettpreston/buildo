// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (+ dated note 2026-10-19);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-57;
//            docs/specs/01-pipeline/130_link_parcel_abutments.md Q-B1 (measured 2026-10-19);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 main_front_setback_basis, P5.12 front_yard_needs_survey
//
// Operator ruling 2026-10-19: the averaged neighbour front setback (10.5.40.70(1)) is used only where the estimate
// passes a TIGHT reliability threshold; everywhere else the zone's own default front setback (x.40.70(1)) is used,
// the lot is flagged "needs survey", and the averaging by-law is disclosed. The CoA-notice oracle (n = 219) put
// 27 % of averaged estimates within 0.5 m and no observable signal set reached the 90 % target, so today no
// estimate is accepted (fya_estimates_accepted = 0). Production path: the same evaluator the tests above use.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const FA = await mod('scripts/analysis/bylaw/front-averaging.mjs');
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => ({ ...u, displaces: XR.displacesOf(index, u.unit_id, I.vocab, null).targets.map((t: Json) => t.id) }));
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const SEED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8'));

const nb = (over: Json = {}): Json => ({
  neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1,
  bldg_to_subject_m: 1.2, front_setback_est_m: 5.0, est_status: 'estimated', ...over,
});
const OFF = { fya_estimates_accepted: 0 };
const ON = { fya_estimates_accepted: 1 };
const lotFrom = (zone: string, r: Json): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house',
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...r.flags },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...r.vars },
});
const front = (zone: string, r: Json): Json => {
  const l = lotFrom(zone, r);
  return E.effective(l, 'front_setback_m', E.loadCandidates(l, units).candidates, C);
};

describe('LC-57 / M-205(1): the threshold is externalized and starts closed', () => {
  it('seeds fya_estimates_accepted = 0, fya_oracle_tol_m = 0.5, fya_oracle_min_within_tol_pct = 90, each shown in admin', () => {
    expect(SEED.fya_estimates_accepted.default).toBe(0);
    expect(SEED.fya_oracle_tol_m.default).toBe(0.5);
    expect(SEED.fya_oracle_min_within_tol_pct.default).toBe(90);
    for (const k of ['fya_estimates_accepted', 'fya_oracle_tol_m', 'fya_oracle_min_within_tol_pct']) {
      expect(SEED[k].admin?.group).toBe('Source Ingestion');
    }
  });
  it('refuses a missing or non-0/1 switch instead of guessing', () => {
    expect(() => FA.resolveFrontAveraging([nb()], {})).toThrow(/fya_estimates_accepted/);
    expect(() => FA.resolveFrontAveraging([nb()], { fya_estimates_accepted: 0.5 })).toThrow(/fya_estimates_accepted/);
  });
});

describe('threshold fails (today): averaging would apply → zone default, needs survey, averaging disclosed', () => {
  it('two neighbours, both estimated: zone_default_needs_survey with front_yard_needs_survey', () => {
    const r = FA.resolveFrontAveraging([nb(), nb({ front_setback_est_m: 5.4 })], OFF);
    expect(r.fya).toBe('fya_two');
    expect([r.basis, r.needs_survey, r.averaged_m]).toEqual(['zone_default_needs_survey', true, null]);
    expect(r.disclosures).toEqual(['front_yard_needs_survey']);
    expect(r.flags).toEqual({ front_averaging_not_applicable: true, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: false });
  });
  it('one neighbour: the same', () => {
    const r = FA.resolveFrontAveraging([nb()], OFF);
    expect([r.fya, r.basis, r.needs_survey]).toEqual(['fya_one', 'zone_default_needs_survey', true]);
  });
  it('three or more qualifying neighbours (Q-B2 open): the same', () => {
    const r = FA.resolveFrontAveraging([nb(), nb(), nb()], OFF);
    expect([r.fya, r.basis, r.needs_survey]).toEqual(['fya_ambiguous_multi', 'zone_default_needs_survey', true]);
  });
});

describe('averaging does not apply: zone default, no survey flag, no disclosure', () => {
  it('no qualifying neighbour (farther than 15.0 m, other street, not residential, no building)', () => {
    const r = FA.resolveFrontAveraging([
      nb({ bldg_to_subject_m: 15.01 }), nb({ same_frontage_street: false }), nb({ neighbour_residential: false }),
      nb({ neighbour_building_id: null, bldg_to_subject_m: null, est_status: 'no_building', front_setback_est_m: null }),
    ], ON);
    expect([r.fya, r.basis, r.needs_survey, r.disclosures]).toEqual(['fya_none', 'zone_default', false, []]);
    expect(r.flags.front_averaging_not_applicable).toBe(true);
  });
  it('15.0 m exactly counts ("15.0 metres or less")', () => {
    expect(FA.resolveFrontAveraging([nb({ bldg_to_subject_m: 15.0 })], OFF).fya).toBe('fya_one');
  });
});

describe('threshold passes (switch on): only fully estimated one/two-neighbour lots are averaged', () => {
  it('two estimated neighbours → their average, averaged_two, front_yard_averaging disclosed', () => {
    const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 4.0 }), nb({ front_setback_est_m: 5.0 })], ON);
    expect([r.basis, r.averaged_m, r.needs_survey, r.disclosures]).toEqual(['averaged_two', 4.5, false, ['front_yard_averaging']]);
    expect(r.flags).toEqual({ front_averaging_not_applicable: false, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: true });
    expect(r.vars).toEqual({ abutting_front_setback_m: 4.5 });
  });
  it('one estimated neighbour → its setback, averaged_one', () => {
    const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 3.7 })], ON);
    expect([r.basis, r.averaged_m, r.flags.one_abutting_building_within_15_m]).toEqual(['averaged_one', 3.7, true]);
  });
  for (const status of FA.EXCLUDED_STATUSES as string[]) {
    it(`a qualifying neighbour with est_status ${status} never feeds an average → zone default, needs survey`, () => {
      const r = FA.resolveFrontAveraging([nb(), nb({ est_status: status, front_setback_est_m: null })], ON);
      expect([r.basis, r.averaged_m, r.needs_survey]).toEqual(['zone_default_needs_survey', null, true]);
    });
  }
  it('the closed exclusion list is the step\'s whole non-estimated vocabulary', () => {
    expect([...FA.EXCLUDED_STATUSES].sort()).toEqual(['estimate_negative', 'estimate_out_of_bounds', 'no_building', 'no_frontage_street', 'street_not_found']);
  });
});

describe('the default used is the zone\'s own x.40.70(1) value (evaluator, production units)', () => {
  const zones: Array<[string, string]> = [['R', '10.10.40.70(1)'], ['RD', '10.20.40.70(1)'], ['RS', '10.40.40.70(1)'], ['RT', '10.60.40.70(1)'], ['RM', '10.80.40.70(1)']];
  for (const [zone, unit] of zones) {
    it(`${zone}: the front setback comes from ${unit}, never from 10.5.40.70(1)`, () => {
      const e = front(zone, FA.resolveFrontAveraging([nb(), nb({ front_setback_est_m: 5.4 })], OFF));
      expect(e.status).toBe('value');
      expect(String(e.winner).startsWith(unit)).toBe(true);
    });
  }
  it('switch on, two estimated neighbours: the averaged value wins through 10.5.40.70(1)(B)', () => {
    const on = FA.resolveFrontAveraging([nb({ front_setback_est_m: 4.0 }), nb({ front_setback_est_m: 5.0 })], ON);
    const e = front('RD', on);
    expect([e.status, e.value, e.winner]).toEqual(['value', 4.5, '10.5.40.70(1)#(1)(B)']);
  });
});
