// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-205(1) (+ dated note 2026-10-19), M-245 (no floor, 2026-10-20);
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-58;
//            docs/specs/01-pipeline/130_link_parcel_abutments.md §Applicability Belongs to McBylaw, Q-B1, Q-B2;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.10 main_front_setback_basis, P5.12;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-256 (dated note 2026-10-29, 2026-10-29-batch-aa#CHAT-198.NN-Q4)
//
// Front-yard averaging (10.5.40.70(1)), derived ON READ from parcel_abutments rows, under the operator's ruling
// of 2026-10-19, amended 2026-10-20 (69a M-245, CHAT-21: no zone-default floor under the averaged front yard; x.40.70(1)'s
// 6.0 m applies only "If regulation 10.5.40.70(1) does not apply"). Where averaging applies (one or two qualifying
// neighbours, every estimate `estimated`): front setback = averaged estimate + fya_porch_allowance_m, always "needs
// survey" (front_yard_needs_survey). The estimates are footprint-based and sit at or below the examiner's figure 89 % of
// the time (CoA-notice oracle, n = 219), hence the allowance. Excluded estimates,
// or three or more neighbours (Q-B2), keep the zone default, "needs survey" (front_yard_not_measured).
// No qualifying neighbour: averaging does not apply, the zone default. PURE: no I/O, no clock.
// 69a M-256 (operator approved 2026-10-21, 2026-10-21-chat-batch-g#CHAT-29.FRONT-YARD): where averaging may apply but a
// neighbour's estimate is missing or excluded — one or two qualifying neighbours with an estimate that is not `estimated`,
// or no qualifying neighbour while an abutting residential lot on the street is held whose street, building or distance is
// not known — front_setback_m answers needs survey (no value; front_averaging_not_applicable undecided, so no layer answers
// the zone default; front_yard_survey_required). Three or more neighbours (Q-B2) keep the zone default.
// CHAT-198.NN-Q4 (operator 2026-10-29): "Where the user supplies the neighbours' front setbacks they replace the footprint estimate; the estimate remains the
// fallback and is flagged needs survey." One or two supplied setbacks (the user input neighbour_front_setbacks_m, metres) are the neighbours' front setbacks:
// the front setback is their average, no porch allowance (they are measured, not estimated), basis user_supplied, no survey flag. None supplied (or three or
// more, Q-B2): the estimate path below, unchanged.
// CHAT-198.NN-Q4 as extended by the operator ruling of 2026-10-29 ("We should use the building footprint or 6M as the default."): "The front setback from averaging reads the
// user's neighbour setbacks, then the building-footprint estimate flagged needs survey, then a 6.0 m default flagged as a default; a missing neighbour figure never stops
// the calculation." Where averaging may apply but neither a user figure nor a usable estimate exists (M-256's undecided case), the front setback is DEFAULT_FRONT_SETBACK_M,
// basis default_6_0, default_used true, instead of the owed answer.

/** 10.5.40.70(1): a building "in whole or in part, 15.0 metres or less from the subject lot". By-law literal. */
export const FYA_NEIGHBOUR_MAX_DIST_M = 15.0;

/** CHAT-198.NN-Q4 (operator 2026-10-29): the front setback used when averaging may apply and no neighbour figure exists, flagged as a default. */
export const DEFAULT_FRONT_SETBACK_M = 6.0;

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

/** The user's neighbour front setbacks (metres): one or two finite figures >= 0 are used; none, or three or more (Q-B2), are not. */
function suppliedSetbacks(user) {
  const raw = user == null ? undefined : user.neighbour_front_setbacks_m;
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new Error('neighbour_front_setbacks_m must be a list of metres');
  const v = raw.map((x, i) => finiteNonNegative(x, `neighbour_front_setbacks_m[${i}]`));
  return v.length === 1 || v.length === 2 ? v : null;
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
 * user (optional): { neighbour_front_setbacks_m: [m, m?] } — the user's figures replace the estimate (CHAT-198.NN-Q4).
 * Returns the evaluator flags and vars for the subject lot, the front setback, the P5.10 basis and the P5.12 codes.
 */
export function resolveFrontAveraging(neighbours, config, lot, user) {
  const allowance = finiteNonNegative(config == null ? undefined : config.fya_porch_allowance_m, 'fya_porch_allowance_m');
  const zoneDefault = finiteNonNegative(lot == null ? undefined : lot.zone_default_m, 'zone_default_m');
  const supplied = suppliedSetbacks(user);
  if (supplied) {
    const k = supplied.length; const avg = round2(supplied.reduce((t, x) => t + x, 0) / k);
    return {
      fya: k === 1 ? 'fya_one' : 'fya_two', qualifying: k, averaged_m: avg, front_setback_m: avg,
      flags: { front_averaging_not_applicable: false, one_abutting_building_within_15_m: k === 1, two_abutting_buildings_within_15_m: k === 2 },
      vars: { abutting_front_setback_m: avg }, basis: 'user_supplied', needs_survey: false, disclosures: [],
    };
  }
  const qualifying = (neighbours || []).filter(qualifies);
  const n = qualifying.length;
  const fya = n === 0 ? 'fya_none' : n === 1 ? 'fya_one' : n === 2 ? 'fya_two' : 'fya_ambiguous_multi';
  const allEstimated = n > 0 && qualifying.every((r) => r.est_status === 'estimated' && r.front_setback_est_m != null);
  const off = { front_averaging_not_applicable: true, one_abutting_building_within_15_m: false, two_abutting_buildings_within_15_m: false };
  const base = { fya, qualifying: n, averaged_m: null, flags: off, vars: {} };
  // M-256 (amended by CHAT-198.NN-Q4): averaging may apply but no neighbour figure exists — the flagged default answers, the calculation never stops
  const needsSurvey = {
    ...base, averaged_m: null, front_setback_m: DEFAULT_FRONT_SETBACK_M, basis: 'default_6_0', needs_survey: true, default_used: true, disclosures: ['front_yard_survey_required'],
    flags: { front_averaging_not_applicable: false, one_abutting_building_within_15_m: true, two_abutting_buildings_within_15_m: false },
    vars: { abutting_front_setback_m: DEFAULT_FRONT_SETBACK_M },
  };

  if (fya === 'fya_none') {
    // M-256: an abutting residential lot on the street (or one whose street is not known) whose building or distance is not
    // known may qualify; only a lot whose building is provably beyond 15.0 m, or that is not residential or not on the
    // street, is set aside
    const maybe = (neighbours || []).some((r) => r.neighbour_residential !== false && r.same_frontage_street !== false
      && !(r.neighbour_building_id != null && r.bldg_to_subject_m != null && Number(r.bldg_to_subject_m) > FYA_NEIGHBOUR_MAX_DIST_M));
    if (maybe) return needsSurvey;
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
  if (fya === 'fya_one' || fya === 'fya_two') return needsSurvey; // M-256: an excluded estimate
  return { ...base, basis: 'zone_default_needs_survey', front_setback_m: zoneDefault, needs_survey: true, disclosures: ['front_yard_not_measured'] };
}

/**
 * Card FS-SB1 (operator 2026-10-29, refines CHAT-198.NN-Q4): "The neighbours' front setbacks are the user's figures, else the building-footprint estimate plus the M-245
 * allowance of 1.0 m (both neighbours averaged, one side if only one is found), else 6.0 m; every estimated or default value is flagged needs survey."
 * The ONE entry point for the product model path and the scorer. The allowance fya_porch_allowance_m (M-245) is read from the logic-variable table
 * (the shape of scripts/seeds/logic_variables.json, {name: {default}}, or {name: number}); this module holds no value of its own, and a table without it is refused.
 */
export function resolveFrontSetback(neighbours, logicVariables, lot, user) {
  const entry = logicVariables == null ? undefined : logicVariables.fya_porch_allowance_m;
  const value = entry != null && typeof entry === 'object' ? entry.default : entry;
  if (value === undefined) throw new Error('fya_porch_allowance_m is missing from the logic-variable table (M-245)');
  return resolveFrontAveraging(neighbours, { fya_porch_allowance_m: value }, lot, user);
}
