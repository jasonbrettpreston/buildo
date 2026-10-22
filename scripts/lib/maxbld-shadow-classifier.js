/**
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-71 (per-parcel classifier, closed predicate classes), M-65 (1), (3)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §6.9 (shadow before switch), O-11
 * SPEC LINK: docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md V-2 row E (the Phase 2 E classes)
 * Handbook:  Spec 133 §m.71 (M-71), §lc.50 (LC-50); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * P3-12, the PURE predicates of the shadow classifier. Not the step-validate arm: nothing here reads a live column or a
 * database. A caller (the arm, owed) builds one difference per parcel x field -- {field, parcel_id, legacy, next, facts} --
 * where `facts` are values it measured; this module returns exactly ONE member of a closed set, or null when there is no
 * difference. The residual is `unexplained`; the gate is unexplained = 0 and layer3_defect = 0 (M-71). A free-text `why`
 * is not a fact any predicate reads, so it can never close a difference.
 *
 * Facts read (all optional; a predicate holds only when its facts say so):
 *   layer3Defect, layer2Defect (booleans); aorSqm, coaFactor, previousFactor, refit (CoA, M-65); legacyBlind, scenario (S10);
 *   newFieldStatus (the Layer 3 field status text of the new value); winnerLayer, legacyLayer; inputFidelity (names);
 *   gCodeId; aggregated; heldF.
 *
 *   classify(diff, config)  -> a member of the closed set, or null
 *   isClosedClass(text)     -> membership test (fixed members and the well-formed parameterised forms)
 *   summarize(diffs, config)-> {total, counts, samples, gate}
 * config = {tolerance, sliverRel, landedF[]}
 */
'use strict';

const FIXED_CLASSES = Object.freeze([
  'aggregation_sliver:M-42', 'coa_factor_refit', 'coa_method_unified', 'exception_now_applied', 'layer2_defect', 'layer3_defect', 'scenario_axis_applied', 'unexplained', 'unregulated_vs_default',
]);
const PARAM_CLASSES = Object.freeze(['held_F', 'input_fidelity', 'l2_no_value', 'law_vs_code']);
const PARAM_FORM = Object.freeze({
  held_F: /^held_F:F-\d+$/,
  input_fidelity: /^input_fidelity:.+$/,
  l2_no_value: /^l2_no_value:(not_evaluated|not_applicable):.+$/,
  law_vs_code: /^law_vs_code:.+$/,
});
const SAMPLE_LIMIT = 10;
const GATE_CLASSES = Object.freeze(['unexplained', 'layer3_defect']);

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function isClosedClass(text) {
  if (typeof text !== 'string') return false;
  if (FIXED_CLASSES.includes(text)) return true;
  return PARAM_CLASSES.some((p) => PARAM_FORM[p].test(text));
}

function checkInputs(d, cfg) {
  if (!cfg || !isNum(cfg.tolerance) || !isNum(cfg.sliverRel) || !Array.isArray(cfg.landedF)) throw new TypeError('classify: config {tolerance, sliverRel, landedF[]} is required; a missing input is never defaulted');
  if (!d || typeof d.field !== 'string' || d.legacy === undefined || d.next === undefined) throw new TypeError('classify: a difference needs {field, legacy, next}; a missing input is never defaulted');
}

function classify(d, cfg) {
  checkInputs(d, cfg);
  const f = d.facts || {};
  const tol = cfg.tolerance;
  if ((d.legacy === null && d.next === null) || (isNum(d.legacy) && isNum(d.next) && close(d.legacy, d.next, tol))) return null;

  // Defects first: they are failures, never explanations.
  if (f.layer3Defect === true) return 'layer3_defect';
  if (f.layer2Defect === true) return 'layer2_defect';

  const coaField = d.field.startsWith('coa_') || d.field.startsWith('suite_coa_');
  if (coaField && isNum(f.aorSqm) && isNum(f.coaFactor) && isNum(d.next)) {
    const viaNew = close(d.next, f.aorSqm * f.coaFactor, tol);
    if (viaNew && f.refit === true && isNum(f.previousFactor) && isNum(d.legacy) && close(d.legacy, f.aorSqm * f.previousFactor, tol)) return 'coa_factor_refit';
    if (viaNew) return 'coa_method_unified';
  }
  if (f.legacyBlind === true && typeof f.scenario === 'string' && f.scenario !== 'D') return 'scenario_axis_applied';
  if (d.next === null && isNum(d.legacy) && typeof f.newFieldStatus === 'string') {
    const s = f.newFieldStatus;
    if (/^(not_evaluated|not_applicable):.+/.test(s)) return `l2_no_value:${s}`;
    if (s.startsWith('unregulated') || s.startsWith('unlimited')) return 'unregulated_vs_default';
  }
  if (f.winnerLayer === 'exception' && f.legacyLayer === 'base') return 'exception_now_applied';
  if (Array.isArray(f.inputFidelity) && f.inputFidelity.length > 0) return `input_fidelity:${[...f.inputFidelity].sort()[0]}`;
  if (typeof f.gCodeId === 'string' && f.gCodeId !== '') return `law_vs_code:${f.gCodeId}`;
  if (f.aggregated === true && isNum(d.legacy) && isNum(d.next) && Math.abs(d.next - d.legacy) <= cfg.sliverRel * Math.max(Math.abs(d.legacy), Math.abs(d.next))) return 'aggregation_sliver:M-42';
  if (typeof f.heldF === 'string' && cfg.landedF.includes(f.heldF)) return `held_F:${f.heldF}`;
  return 'unexplained';
}

function summarize(diffs, cfg) {
  const counts = {};
  const samples = {};
  let total = 0;
  for (const d of diffs) {
    const c = classify(d, cfg);
    if (c === null) continue;
    total += 1;
    counts[c] = (counts[c] || 0) + 1;
    if (!samples[c]) samples[c] = [];
    if (samples[c].length < SAMPLE_LIMIT) samples[c].push(d.parcel_id);
  }
  const gate = { unexplained: counts.unexplained || 0, layer3_defect: counts.layer3_defect || 0 };
  gate.pass = GATE_CLASSES.every((k) => gate[k] === 0);
  return { total, counts, samples, gate };
}

module.exports = { FIXED_CLASSES, PARAM_CLASSES, classify, isClosedClass, summarize };
