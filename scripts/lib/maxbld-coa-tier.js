/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §6.4 (M-65 CoA axis), §Phase-5 P5.10a, INV-23
 * SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.65 (M-65), lc.60 (u unfitted at release), lc.49 (LC-49)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.9 (compute purity)
 *
 * The CoA tier of compute_maxbld_scenarios (P3-5), a pure library: CoA(s) = AOR(s) x u_form(s) (Spec 69 M-65). It
 * requires nothing and has no database, file, env, clock or randomness access. A library, not the compute module: the
 * step is registered at P3-7 and its compute module will require this file (the scripts/lib/bylaw-resolution.js form).
 *
 * The fitted factors and their bounds come IN (the u logic variables with their re-fit audit, Spec 78 §6.4 rule 3);
 * no law or fit number lives here. A form with no fitted factor is `not_evaluated:coa_factor_unfitted:<form>`, never
 * borrowed from another form (M-65 rule 2; LC-60: every u is unfitted at the first release). The result holds only
 * coa_* / suite_coa_* fields, so nothing an as-of-right field reads can come from it (INV-23).
 *
 *   formOf(scenario)                          -> the M-65 form, or null (renovations have none: LC-49)
 *   coaTier(row, factors, bounds)             -> the eight CoA fields of one scenario row
 *   countCoaNotEvaluated(results)             -> {`<reason>:<form>`: n}, the `coa_not_evaluated` counter
 *
 * row = { scenario, mainGfaSqm, hasSuite, suiteGfaSqm }; factors = { <form>: {lv_id, value, version, fit_basis} };
 * bounds = { min, max } (the u logic variables' bounds, Spec 78 §6.4 rule 3).
 */
'use strict';

/** Spec 78 P5.10a: D -> single; 2 -> single_suite; H, S -> multiplex. RA / RI / RB and the rear-suite add-on have none. */
const FORM_OF_SCENARIO = Object.freeze({ D: 'single', 2: 'single_suite', H: 'multiplex', S: 'multiplex' });
/** The rear suite's own form name (Spec 78 P5.10a, Q-4, amends LC-49). */
const SUITE_FORM = 'suite';
/** vocab.json layer3.scenario_not_evaluated_reason member (the test locks the membership). */
const UNFITTED_REASON = 'coa_factor_unfitted';
const NOT_APPLICABLE_NO_FORM = 'not_applicable:no_coa_form';
const NOT_APPLICABLE_NO_SUITE = 'not_applicable:no_suite';
const APPLIES = 'applies';

function formOf(scenario) {
  return Object.prototype.hasOwnProperty.call(FORM_OF_SCENARIO, scenario) ? FORM_OF_SCENARIO[scenario] : null;
}

const unfittedStatus = (form) => `not_evaluated:${UNFITTED_REASON}:${form}`;

function checkBounds(bounds) {
  if (bounds === null || typeof bounds !== 'object' || !Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) {
    throw new TypeError('coaTier: bounds {min, max} (the u logic variables\' bounds) must be passed in; a missing input is never defaulted');
  }
}

/** The factor object of a form, or null when the form is unfitted; a value outside the bounds throws (a defect, not an answer). */
function fittedFactor(factors, form, bounds) {
  const f = factors && Object.prototype.hasOwnProperty.call(factors, form) ? factors[form] : null;
  if (f === null || f === undefined) return null;
  checkBounds(bounds);
  if (!Number.isFinite(f.value) || f.value < bounds.min || f.value > bounds.max) {
    throw new RangeError(`coaTier: factor for ${form} (${f.value}) is outside the declared bounds [${bounds.min}, ${bounds.max}]`);
  }
  return f;
}

function applyFactor(gfa, factor, name) {
  if (!Number.isFinite(gfa)) throw new TypeError(`coaTier: ${name} must be a finite number for a fitted form; a missing input is never defaulted`);
  const coa = gfa * factor.value;
  return { gfa: coa, increment: coa - gfa };
}

function coaTier(row, factors, bounds) {
  const out = {
    coa_form: null, coa_factor: null, coa_gfa_sqm: null, coa_increment_sqm: null, coa_status: NOT_APPLICABLE_NO_FORM,
    suite_coa_gfa_sqm: null, suite_coa_increment_sqm: null, suite_coa_status: NOT_APPLICABLE_NO_SUITE,
  };
  const form = formOf(row.scenario);
  if (form === null) return out; // renovations: no form, no suite CoA (LC-49)

  out.coa_form = form;
  const factor = fittedFactor(factors, form, bounds);
  if (factor === null) {
    out.coa_status = unfittedStatus(form);
  } else {
    const r = applyFactor(row.mainGfaSqm, factor, 'mainGfaSqm');
    out.coa_factor = factor;
    out.coa_gfa_sqm = r.gfa;
    out.coa_increment_sqm = r.increment;
    out.coa_status = APPLIES;
  }

  if (row.hasSuite) {
    const sf = fittedFactor(factors, SUITE_FORM, bounds);
    if (sf === null) {
      out.suite_coa_status = unfittedStatus(SUITE_FORM);
    } else {
      const r = applyFactor(row.suiteGfaSqm, sf, 'suiteGfaSqm');
      out.suite_coa_gfa_sqm = r.gfa;
      out.suite_coa_increment_sqm = r.increment;
      out.suite_coa_status = APPLIES;
    }
  }
  return out;
}

/** `coa_not_evaluated` by reason (Spec 78 P5.11): counts the main and suite statuses written `not_evaluated:<reason>:<form>`. */
function countCoaNotEvaluated(results) {
  const counts = {};
  const prefix = 'not_evaluated:';
  for (const r of results) {
    for (const s of [r.coa_status, r.suite_coa_status]) {
      if (typeof s === 'string' && s.startsWith(prefix)) {
        const key = s.slice(prefix.length);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  return counts;
}

module.exports = { FORM_OF_SCENARIO, SUITE_FORM, UNFITTED_REASON, formOf, coaTier, countCoaNotEvaluated };
