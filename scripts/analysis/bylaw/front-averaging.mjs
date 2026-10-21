// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (+ dated note 2026-10-19), M-245 (no floor, 2026-10-20);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-58;
//            docs/specs/01-pipeline/130_link_parcel_abutments.md §Applicability Belongs to McBylaw, Q-B1, Q-B2;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 main_front_setback_basis, P5.12
//
// Front-yard averaging (10.5.40.70(1)), derived ON READ from parcel_abutments rows, under the operator's ruling
// of 2026-10-19, amended 2026-10-20 (69a M-245, CHAT-21: no zone-default floor under the averaged front yard; x.40.70(1)'s
// 6.0 m applies only "If regulation 10.5.40.70(1) does not apply"). Where averaging applies (one or two qualifying
// neighbours, every estimate `estimated`): front setback = averaged estimate + fya_porch_allowance_m, always "needs
// survey" (front_yard_needs_survey). The estimates are footprint-based and sit at or below the examiner's figure 89 % of
// the time (CoA-notice oracle, n = 219), hence the allowance. Excluded estimates,
// or three or more neighbours (Q-B2), keep the zone default, "needs survey" (front_yard_not_measured).
// No qualifying neighbour: averaging does not apply, the zone default. PURE: no I/O, no clock.

/** 10.5.40.70(1): a building "in whole or in part, 15.0 metres or less from the subject lot". By-law literal. */
export const FYA_NEIGHBOUR_MAX_DIST_M = 15.0;

/** Every est_status of Spec 130's closed set except `estimated`; none of them may feed an average. */
export const EXCLUDED_STATUSES = Object.freeze([
  'no_building', 'no_frontage_street', 'street_not_found', 'estimate_negative', 'estimate_out_of_bounds',
]);

function finiteNonNegative(v, name) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a finite number >= 0 (got ${JSON.stringify(v)})`);
  }
  return n;
}

function qualifies(r) {
  return r.neighbour_residential === true && r.same_frontage_street === true
    && r.neighbour_building_id != null && r.bldg_to_subject_m != null
    && Number(r.bldg_to_subject_m) <= FYA_NEIGHBOUR_MAX_DIST_M;
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * neighbours: the subject's parcel_abutments rows (ordered pair, subject → neighbour).
 * config: { fya_porch_allowance_m }. lot: { zone_default_m } — the zone's x.40.70(1) front setback for this lot.
 * Returns the evaluator flags and vars for the subject lot, the front setback, the P5.10 basis and the P5.12 codes.
 */
export function resolveFrontAveraging(neighbours, config, lot) {
  const allowance = finiteNonNegative(config == null ? undefined : config.fya_porch_allowance_m, 'fya_porch_allowance_m');
  const zoneDefault = finiteNonNegative(lot == null ? undefined : lot.zone_default_m, 'zone_default_m');
  const qualifying = (neighbours || []).filter(qualifies);
  const n = qualifying.length;
  const fya = n === 0 ? 'fya_none' : n === 1 ? 'fya_one' : n === 2 ? 'fya_two' : 'fya_ambiguous_multi';
  const allEstimated = n > 0 && qualifying.every((r) => r.est_status === 'estimated' && r.front_setback_est_m != null);
  const off = { front_averaging_not_applicable: true, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: false };
  const base = { fya, qualifying: n, averaged_m: null, flags: off, vars: {} };

  if (fya === 'fya_none') {
    return { ...base, basis: 'zone_default', front_setback_m: zoneDefault, needs_survey: false, disclosures: [] };
  }
  if (allEstimated && (fya === 'fya_one' || fya === 'fya_two')) {
    const avg = round2(qualifying.reduce((s, r) => s + Number(r.front_setback_est_m), 0) / n);
    const value = round2(avg + allowance); // M-245: no zone-default floor
    return {
      ...base, averaged_m: avg, front_setback_m: value,
      flags: { front_averaging_not_applicable: false, one_abutting_building_within_15_m: n === 1, two_abutting_buildings_within_15_m: n === 2 },
      vars: { abutting_front_setback_m: value },
      basis: n === 1 ? 'averaged_one' : 'averaged_two',
      needs_survey: true, disclosures: ['front_yard_needs_survey'],
    };
  }
  return { ...base, basis: 'zone_default_needs_survey', front_setback_m: zoneDefault, needs_survey: true, disclosures: ['front_yard_not_measured'] };
}
