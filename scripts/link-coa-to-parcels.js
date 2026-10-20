#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9, §6.8 (lock 4201)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EG, R-EQ (P4-SWAP: runner_wired before ③)
 *
 * Link CoA applications to parcels and keep lead_parcels' coa: rows in step: every eligible CoA
 * is re-matched every run through the address cascade; a CoA whose link changed gets its parcel's
 * centroid coordinates, neighbourhood and parcel_linked_at.
 *
 * Usage: node scripts/link-coa-to-parcels.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 722 lines now lives in exactly three places:
 *   · ./link-coa-to-parcels.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/link-coa-to-parcels.js    — the match SQL and the check observers, and only those
 *   · ./lib/step/                             — pool, lock, ledger, config, the runLinkPhase keyed
 *                                               batch loop (R-EG), verdict and emits
 * The legacy text is kept verbatim as the red suite's oracle:
 * src/tests/steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt.
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_coa_to_parcels/violations.test.ts and the Spec 47 §A.5 registry loop,
 * which reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-coa-to-parcels.descriptor.json');
const compute = require('./lib/compute/link-coa-to-parcels');
const ADVISORY_LOCK_ID = 4201;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
