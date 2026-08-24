/**
 * Compute stub for the A2 shape fixtures.
 *
 * NOT a `<slug>.*` sibling on purpose: Spec 122 §4.1 puts compute in
 * `scripts/lib/compute/<slug>.js`, and the conformance suite's #31 assertion
 * ("no unknown `<slug>.*` file") would otherwise fire on the fixture itself.
 * The leading underscore keeps it out of every `<slug>.` prefix match.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1
 */
'use strict';

/** @param {object} ctx */
async function compute(ctx) {
  ctx.report('permit_columns', { viol: 0, pop: 0 });
  return { observations: {} };
}

module.exports = compute;
