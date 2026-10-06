'use strict';
// scripts/lib/staleness-pins.js
//
// LDG-10 class 3 (Spec 122 §6.6; WF1 LDG-10 Step 2, 2026-10-03): a cross-step contract pin is DECLARED
// on the reading step's `staleness.pins[]` and READ from there by the compute — never a hard-coded const —
// so the value the reader halts on is the value the descriptor declares (declared == executed).
// Pure: no I/O. FAIL-CLOSED: a missing pin, or a pin with no `equals`, throws by name instead of
// letting the reader compare against `undefined` (which would halt on every run, or — worse, with a
// loose comparison — pass on none).
//
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 (LDG-10)

/**
 * The `equals` literal of the ONE `staleness.pins[]` row naming `step` + `stamp`.
 * @param {object} descriptor - the reading step's descriptor
 * @param {string} step - the producer's identity.name (e.g. "load_ravines")
 * @param {string} stamp - the pinned stamp (e.g. "records_meta.ravine_load.spec_version")
 * @returns {string}
 */
function pinnedEquals(descriptor, step, stamp) {
  const name = (descriptor && descriptor.identity && descriptor.identity.name) || '(unnamed descriptor)';
  const pins = descriptor && descriptor.staleness && Array.isArray(descriptor.staleness.pins) ? descriptor.staleness.pins : [];
  const matches = pins.filter((p) => p && p.step === step && p.stamp === stamp);
  if (matches.length === 0) {
    throw new Error(`[staleness-pins] ${name} has no staleness.pins row for ${step} ${stamp} — the contract pin is undeclared; refusing to run against an unpinned producer`);
  }
  if (matches.length > 1) {
    throw new Error(`[staleness-pins] ${name} declares ${matches.length} staleness.pins rows for ${step} ${stamp} — exactly one is allowed`);
  }
  const { equals } = matches[0];
  if (typeof equals !== 'string' || equals.length === 0) {
    throw new Error(`[staleness-pins] ${name} staleness.pins row for ${step} ${stamp} has no \`equals\` — a contract pin needs the literal the reader requires`);
  }
  return equals;
}

module.exports = { pinnedEquals };
