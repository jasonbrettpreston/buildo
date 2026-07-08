'use strict';

/**
 * Calibration-threshold re-tightening guard (WF2 D2a / GRD-F1; P8 escalation,
 * Gemini P9-pass).
 *
 * SPEC LINK: docs/specs/01-pipeline/85_forecast_engine.md §3.6
 *
 * The `default_calibration_pct` verdict thresholds were RELAXED (warn/fail
 * raised above the strict 20/50 baseline) to stop the dashboard from sitting
 * on a permanent-WARN while calibration cohorts were genuinely cold. That
 * loosening must never quietly become permanent, so `calibration_thresholds_
 * relaxed` is emitted on EVERY run while the active pair is looser than strict.
 *
 * Three states (row-derived only — no logic_variables, no schema):
 *   - strict thresholds active (not relaxed)                       → PASS
 *   - relaxed AND cohorts still cold (defaultPct >= strictWarnPct) → WARN
 *       (the loosening is loud but defensible while calibration is cold)
 *   - relaxed AND cohorts RECOVERED past the strict-PASS point
 *       (defaultPct < strictWarnPct)                               → FAIL
 *       (calibration_cohort_fill_pct has recovered enough that the STRICT
 *        thresholds would themselves PASS — continuing to run the loose pair is
 *        config drift demanding action, not a warning: restore strict warn/fail)
 *
 * The strict-PASS point is `default_calibration_pct < strictWarnPct` (mirrors
 * the strict WARN gate `defaultPct >= warn ? WARN`), so recovery is exactly
 * `defaultPct < strictWarnPct` — equivalently `calibration_cohort_fill_pct`
 * (= 100 − defaultPct) rising above `100 − strictWarnPct`.
 *
 * @param {object}  args
 * @param {boolean} args.relaxed        active warn/fail pair looser than strict
 * @param {number}  args.defaultPct     default_calibration_pct (0–100)
 * @param {number}  args.strictWarnPct  strict WARN threshold (the pre-relaxation baseline)
 * @returns {'PASS'|'WARN'|'FAIL'}
 */
function classifyCalibrationThresholdStatus({ relaxed, defaultPct, strictWarnPct }) {
  if (!relaxed) return 'PASS';
  if (defaultPct < strictWarnPct) return 'FAIL';
  return 'WARN';
}

/**
 * CoA-gate `coa_audit_gate_warn_accepted` re-tightening guard (WF2 P8 amendment).
 *
 * Applies the SAME FAIL-when-recovered escalation to the declarative
 * `coa_gate_policy`. The 'pass_or_warn' policy exists to activate the CoA branch
 * on a sample-size WARN while calibration is cold — but once the calibration
 * verdict returns to PASS-grade health, leaving the policy loose is config drift
 * (the operator should revert to 'pass_only'). The declarative-policy design
 * stands; this only adds the automated re-tighten pressure, row-derived.
 *
 * Three states:
 *   - policy 'pass_only' (strict)                                     → INFO
 *   - policy 'pass_or_warn' AND currently accepting a WARN verdict    → WARN
 *       (loud but defensible while calibration is cold)
 *   - policy 'pass_or_warn' AND calibration recovered to PASS-grade   → FAIL
 *       (loose policy no longer needed — revert to pass_only)
 *
 * @param {object}  args
 * @param {string}  args.policy                'pass_only' | 'pass_or_warn'
 * @param {boolean} args.warnAccepted          a WARN verdict is being accepted this run
 * @param {boolean} args.calibrationPassGrade  the gate's calibration verdict is a clean PASS
 * @returns {'INFO'|'WARN'|'FAIL'}
 */
function classifyCoaGateWarnAcceptedStatus({ policy, warnAccepted, calibrationPassGrade }) {
  if (policy === 'pass_or_warn' && calibrationPassGrade) return 'FAIL';
  if (warnAccepted) return 'WARN';
  return 'INFO';
}

module.exports = { classifyCalibrationThresholdStatus, classifyCoaGateWarnAcceptedStatus };
