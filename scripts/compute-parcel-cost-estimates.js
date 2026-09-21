#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/2.4/2.5/2.8/2.9/2.10/2.11
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown (the `sources` chain)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §8 (shape freeze)
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN, do not fix)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict)
 *
 * Streams every RESIDENTIAL parcel (zoning_class LIKE 'R%') through the pure pricing engine
 * (scripts/lib/parcel-cost.js) and writes the 13-line parcel_cost_menu JSONB + the 12 headline
 * cost scalars + 3 FSI scalars (Spec 88 §2.5), one JS-streamed cursor-batched phase.
 *
 * Usage: node scripts/compute-parcel-cost-estimates.js   ·   PIPELINE_CHAIN=sources node scripts/compute-parcel-cost-estimates.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 752 lines now lives in exactly three places:
 *   · ./compute-parcel-cost-estimates.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/compute-parcel-cost-estimates.js  — the SQL, the contract-read HALT, the
 *                                                        post-phase freshness/zone queries, and
 *                                                        the check observers, and only those
 *   · ./lib/step/                                      — pool, lock, ledger, config, the
 *                                                        per-batch write executor, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library
 * from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/compute_parcel_cost_estimates/violations.test.ts and by the Spec 47 §A.5
 * registry loop, which reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./compute-parcel-cost-estimates.descriptor.json');
const compute = require('./lib/compute/compute-parcel-cost-estimates');
const ADVISORY_LOCK_ID = 117;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
