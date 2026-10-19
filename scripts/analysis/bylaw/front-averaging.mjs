// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (+ dated note 2026-10-19);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-57;
//            docs/specs/01-pipeline/130_link_parcel_abutments.md §Applicability Belongs to McBylaw, Q-B1, Q-B2;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 main_front_setback_basis, P5.12
//
// Front-yard averaging (10.5.40.70(1)), derived ON READ from parcel_abutments rows, and the operator's
// reliability rule of 2026-10-19: the averaged neighbour setback is used only when the estimates are
// accepted (logic variable fya_estimates_accepted = 1, set only after the CoA-notice oracle shows at least
// fya_oracle_min_within_tol_pct of averaged estimates within fya_oracle_tol_m). Otherwise a lot where
// averaging would apply takes the zone's own x.40.70(1) default, is flagged "needs survey", and discloses
// the averaging by-law (front_yard_needs_survey). PURE: no I/O, no clock.

/** 10.5.40.70(1): a building "in whole or in part, 15.0 metres or less from the subject lot". By-law literal. */
export const FYA_NEIGHBOUR_MAX_DIST_M = 15.0;

/** Every est_status of Spec 130's closed set except `estimated`; none of them may feed an average. */
export const EXCLUDED_STATUSES = Object.freeze([
  'no_building', 'no_frontage_street', 'street_not_found', 'estimate_negative', 'estimate_out_of_bounds',
]);

function acceptedSwitch(config) {
  const v = config == null ? undefined : config.fya_estimates_accepted;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (n !== 0 && n !== 1) {
    throw new Error(`fya_estimates_accepted must be 0 or 1 (got ${JSON.stringify(v)})`);
  }
  return n === 1;
}

function qualifies(r) {
  return r.neighbour_residential === true && r.same_frontage_street === true
    && r.neighbour_building_id != null && r.bldg_to_subject_m != null
    && Number(r.bldg_to_subject_m) <= FYA_NEIGHBOUR_MAX_DIST_M;
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * neighbours: the subject's parcel_abutments rows (ordered pair, subject → neighbour).
 * Returns the evaluator flags and vars for the subject lot plus the P5.10 basis and the P5.12 codes.
 */
export function resolveFrontAveraging(neighbours, config) {
  const accepted = acceptedSwitch(config);
  const qualifying = (neighbours || []).filter(qualifies);
  const n = qualifying.length;
  const fya = n === 0 ? 'fya_none' : n === 1 ? 'fya_one' : n === 2 ? 'fya_two' : 'fya_ambiguous_multi';
  const allEstimated = n > 0 && qualifying.every((r) => r.est_status === 'estimated' && r.front_setback_est_m != null);
  const off = { front_averaging_not_applicable: true, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: false };

  if (fya === 'fya_none') {
    return { fya, qualifying: 0, accepted, flags: off, vars: {}, basis: 'zone_default', averaged_m: null, needs_survey: false, disclosures: [] };
  }
  if (accepted && allEstimated && (fya === 'fya_one' || fya === 'fya_two')) {
    const avg = round2(qualifying.reduce((s, r) => s + Number(r.front_setback_est_m), 0) / n);
    return {
      fya, qualifying: n, accepted, averaged_m: avg, needs_survey: false,
      flags: { front_averaging_not_applicable: false, one_abutting_building_within_15_m: n === 1, two_abutting_buildings_within_15_m: n === 2 },
      vars: { abutting_front_setback_m: avg },
      basis: n === 1 ? 'averaged_one' : 'averaged_two',
      disclosures: ['front_yard_averaging'],
    };
  }
  return { fya, qualifying: n, accepted, flags: off, vars: {}, basis: 'zone_default_needs_survey', averaged_m: null, needs_survey: true, disclosures: ['front_yard_needs_survey'] };
}
