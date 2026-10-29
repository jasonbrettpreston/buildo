// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (+ dated note 2026-10-19);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-58;
//            docs/specs/01-pipeline/130_link_parcel_abutments.md Q-B1 (measured 2026-10-19);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 main_front_setback_basis, P5.12 front_yard_needs_survey / front_yard_not_measured
//
// Operator ruling 2026-10-19 (revised; replaces the all-or-nothing switch), amended 2026-10-20 (69a M-245, CHAT-21: no
// zone-default floor under the averaged front yard): where 10.5.40.70(1) averaging applies (one or two qualifying
// neighbours, every estimate est_status `estimated`), the front setback is averaged estimate + fya_porch_allowance_m
// (it was max(…, the zone's x.40.70(1) default) from 2026-10-19 to 2026-10-20), always "needs survey", disclosed
// front_yard_needs_survey (mandatory, high importance). Excluded estimates (or three or more neighbours, Q-B2) keep
// the zone default, "needs survey", front_yard_not_measured. No qualifying neighbour: the zone default, no flag.
// Basis (CoA-notice oracle, n = 219): the estimate is at or below the examiner's figure 89 % of the time;
// max(est + 1.0, 6.0) had mean error 1.39 m, 55 % within 1 m, 22 % below the examiner (6.0 m alone: 2.53 m, 64 %);
// re-measured 2026-10-20 (n = 220): est + 1.0 with no floor has mean error 1.15 m, 67 % within 1 m, 48 % below the examiner.
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
const SPEC78 = fs.readFileSync(path.join(process.cwd(), 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');

const nb = (over: Json = {}): Json => ({
  neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1,
  bldg_to_subject_m: 1.2, front_setback_est_m: 5.0, est_status: 'estimated', ...over,
});
const CFG = { fya_porch_allowance_m: 1.0 };
const LOT = { zone_default_m: 6.0 };
const lotFrom = (zone: string, r: Json): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house',
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...r.flags },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...r.vars },
});
const front = (zone: string, r: Json): Json => {
  const l = lotFrom(zone, r);
  return E.effective(l, 'front_setback_m', E.loadCandidates(l, units).candidates, C);
};
const template = (code: string): string => {
  const row = SPEC78.split('\n').find((l) => l.startsWith(`| \`${code}\` |`)) ?? '';
  return (new RegExp(`^\\| \`${code}\` \\| "([^"]+)"`).exec(row) ?? [])[1] ?? '';
};
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

describe('LC-58 / M-205(1): one admin setting, the porch allowance; the switch and oracle dials are gone', () => {
  it('seeds fya_porch_allowance_m = 1.0 m in admin group Source Ingestion', () => {
    expect(SEED.fya_porch_allowance_m.default).toBe(1.0);
    expect(SEED.fya_porch_allowance_m.admin?.group).toBe('Source Ingestion');
  });
  it('no dead dial: fya_estimates_accepted, fya_oracle_tol_m and fya_oracle_min_within_tol_pct are not seeded', () => {
    for (const k of ['fya_estimates_accepted', 'fya_oracle_tol_m', 'fya_oracle_min_within_tol_pct']) expect(SEED[k]).toBeUndefined();
  });
  it('refuses a missing or invalid allowance and a missing zone default instead of guessing', () => {
    expect(() => FA.resolveFrontAveraging([nb()], {}, LOT)).toThrow(/fya_porch_allowance_m/);
    expect(() => FA.resolveFrontAveraging([nb()], { fya_porch_allowance_m: -0.5 }, LOT)).toThrow(/fya_porch_allowance_m/);
    expect(() => FA.resolveFrontAveraging([nb()], { fya_porch_allowance_m: 'x' }, LOT)).toThrow(/fya_porch_allowance_m/);
    expect(() => FA.resolveFrontAveraging([nb()], CFG, {})).toThrow(/zone_default_m/);
  });
});

describe('averaging applies: averaged estimate + porch allowance, no zone-default floor (M-245), needs survey', () => {
  it('estimate + allowance above the zone default: 7.0 / 7.4 → 7.2 + 1.0 = 8.2 m', () => {
    const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 7.0 }), nb({ front_setback_est_m: 7.4 })], CFG, LOT);
    expect([r.fya, r.basis, r.front_setback_m, r.needs_survey]).toEqual(['fya_two', 'averaged_two', 8.2, true]);
    expect(r.disclosures).toEqual(['front_yard_needs_survey']);
    expect(r.flags).toEqual({ front_averaging_not_applicable: false, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: true });
    expect(r.vars).toEqual({ abutting_front_setback_m: 8.2 });
  });
  it('estimate + allowance below the zone default: 4.0 / 5.0 → 4.5 + 1.0 = 5.5 m, no floor (M-245: "If regulation 10.5.40.70(1) does not apply" — the 6.0 m is the fallback)', () => {
    const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 4.0 }), nb({ front_setback_est_m: 5.0 })], CFG, LOT);
    expect([r.front_setback_m, r.needs_survey, 'floor_applied' in r]).toEqual([5.5, true, false]);
  });
  it('one neighbour: its estimate + allowance (averaged_one)', () => {
    const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 6.3 })], CFG, LOT);
    expect([r.fya, r.basis, r.front_setback_m, r.flags.one_abutting_building_within_15_m]).toEqual(['fya_one', 'averaged_one', 7.3, true]);
  });
  it('the allowance setting changes the result', () => {
    const two = [nb({ front_setback_est_m: 7.0 }), nb({ front_setback_est_m: 7.4 })];
    expect(FA.resolveFrontAveraging(two, { fya_porch_allowance_m: 0 }, LOT).front_setback_m).toBe(7.2);
    expect(FA.resolveFrontAveraging(two, { fya_porch_allowance_m: 2.0 }, LOT).front_setback_m).toBe(9.2);
    expect(FA.resolveFrontAveraging(two, { fya_porch_allowance_m: '1.5' }, LOT).front_setback_m).toBe(8.7);
  });
});

// 69a M-256 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.FRONT-YARD`): an excluded estimate answers needs
// survey with no value (amends M-245's zone-default list); three or more neighbours (Q-B2) keep the zone default.
describe('excluded estimates answer needs survey (M-256); the ambiguous case keeps the zone default, flagged needs survey', () => {
  for (const status of FA.EXCLUDED_STATUSES as string[]) {
    it(`a qualifying neighbour with est_status ${status} never feeds an average`, () => {
      const r = FA.resolveFrontAveraging([nb({ front_setback_est_m: 9.0 }), nb({ est_status: status, front_setback_est_m: null })], CFG, LOT);
      expect([r.basis, r.front_setback_m, r.needs_survey, r.disclosures]).toEqual(['default_6_0', 6, true, ['front_yard_survey_required']]); // CHAT-198.NN-Q4: the flagged default, never an owed answer
      expect([r.default_used, r.flags.front_averaging_not_applicable]).toEqual([true, false]);
    });
  }
  it('the closed exclusion list is the step\'s whole non-estimated vocabulary', () => {
    expect([...FA.EXCLUDED_STATUSES].sort()).toEqual(['estimate_negative', 'estimate_out_of_bounds', 'no_building', 'no_frontage_street', 'street_not_found']);
  });
  it('three or more qualifying neighbours (Q-B2 open): the same', () => {
    const r = FA.resolveFrontAveraging([nb(), nb(), nb()], CFG, LOT);
    expect([r.fya, r.basis, r.needs_survey, r.disclosures]).toEqual(['fya_ambiguous_multi', 'zone_default_needs_survey', true, ['front_yard_not_measured']]);
  });
});

describe('averaging does not apply: zone default, no survey flag, no disclosure', () => {
  // M-256: an abutting residential lot on the street whose building is not found is undecided (needs survey), so it is
  // not in this list any more (bylaw-fix-4.logic.test.ts covers it)
  it('no qualifying neighbour (farther than 15.0 m, other street, not residential)', () => {
    const r = FA.resolveFrontAveraging([
      nb({ bldg_to_subject_m: 15.01 }), nb({ same_frontage_street: false }), nb({ neighbour_residential: false }),
    ], CFG, LOT);
    expect([r.fya, r.basis, r.front_setback_m, r.needs_survey, r.disclosures]).toEqual(['fya_none', 'zone_default', 6.0, false, []]);
  });
  it('15.0 m exactly counts ("15.0 metres or less")', () => {
    expect(FA.resolveFrontAveraging([nb({ bldg_to_subject_m: 15.0 })], CFG, LOT).fya).toBe('fya_one');
  });
});

describe('evaluator, production units: the resolved lot gives the same front setback', () => {
  const zones: Array<[string, string]> = [['R', '10.10.40.70(1)'], ['RD', '10.20.40.70(1)'], ['RS', '10.40.40.70(1)'], ['RT', '10.60.40.70(1)'], ['RM', '10.80.40.70(1)']];
  for (const [zone, unit] of zones) {
    it(`${zone}: the zone default the resolver is given is ${unit}'s 6.0 m where averaging does not apply; an excluded estimate is owed (M-256)`, () => {
      const z = front(zone, FA.resolveFrontAveraging([nb({ same_frontage_street: false })], CFG, LOT));
      expect([z.status, z.value]).toEqual(['value', 6.0]);
      expect(String(z.winner).startsWith(unit)).toBe(true);
      const e = front(zone, FA.resolveFrontAveraging([nb(), nb({ est_status: 'estimate_negative', front_setback_est_m: null })], CFG, LOT));
      expect([e.status, e.value]).toEqual(['value', 6.0]); // CHAT-198.NN-Q4 (operator 2026-10-29): the 6.0 m default flagged as a default answers; the max-build scenarios evaluate
    });
  }
  it('averaging applies: the averaged value wins through 10.5.40.70(1)(B), above and below the zone default (M-245)', () => {
    const above = front('RD', FA.resolveFrontAveraging([nb({ front_setback_est_m: 7.0 }), nb({ front_setback_est_m: 7.4 })], CFG, LOT));
    expect([above.status, above.value, above.winner]).toEqual(['value', 8.2, '10.5.40.70(1)#(1)(B)']);
    const below = front('RD', FA.resolveFrontAveraging([nb({ front_setback_est_m: 4.0 }), nb({ front_setback_est_m: 5.0 })], CFG, LOT));
    expect([below.value, below.winner]).toEqual([5.5, '10.5.40.70(1)#(1)(B)']);
  });
});

describe('P5.12 wording (LC-52: plain, at most 45 words)', () => {
  it('front_yard_needs_survey: averaging by-law, outlines adjusted for porches, that estimate even below the standard (M-245), survey', () => {
    expect(template('front_yard_needs_survey')).toBe('The by-law sets this lot\'s front setback as the average of the neighbouring houses\' setbacks (10.5.40.70(1)). We estimate those from building outlines, adjusted for porches, and show that estimate, {X} m, even where it is below the zone\'s standard. A survey is needed.');
    expect(words(template('front_yard_needs_survey'))).toBeLessThanOrEqual(45);
  });
  it('front_yard_not_measured: the operator-approved excluded-case sentence (actual may be larger or smaller)', () => {
    expect(template('front_yard_not_measured')).toBe('The by-law sets this lot\'s front setback as the average of the neighbouring houses\' setbacks (10.5.40.70(1)). We could not measure those reliably, so the zone\'s standard {X} m is shown; the actual setback may be larger or smaller. A survey is needed.');
    expect(words(template('front_yard_not_measured'))).toBeLessThanOrEqual(45);
  });
});

// 69a M-256 (operator approved 2026-10-21): the no-value case has its own sentence.
describe('P5.12 wording, M-256 (LC-52: plain, at most 45 words)', () => {
  it('front_yard_survey_required: no front setback is shown; a survey is needed', () => {
    expect(template('front_yard_survey_required')).toBe('The by-law sets this lot\'s front setback from the neighbouring houses\' setbacks (10.5.40.70(1)). We could not measure them, so no front setback is shown. A survey is needed.');
    expect(words(template('front_yard_survey_required'))).toBeLessThanOrEqual(45);
  });
});
