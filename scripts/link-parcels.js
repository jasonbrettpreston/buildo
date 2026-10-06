#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §4
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md
 *
 * Link permits to parcels and write the permit_parcels junction.
 *
 * Usage: node scripts/link-parcels.js   ·   PIPELINE_CHAIN=sources node scripts/link-parcels.js --full
 * LINK_PARCELS_FORCE_FULL is RETIRED (MQ-B2, fold 19): since O4 row 7 every run derives all
 * links and rewrites only the changed ones, so the override changed nothing; the env var is
 * a deviations[] entry in the descriptor and arms nothing.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 686 lines now lives in exactly three places:
 *   · ./link-parcels.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/link-parcels.js    — the match SQL, the classifiers, the check
 *                                        observers, and only those
 *   · ./lib/step/                      — pool, lock, ledger, config, the tri-state mode
 *                                        gate, the pre_write gate, the composite-key
 *                                        keyset batch loop (LG-25, runLinkKeyedPhase),
 *                                        verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_parcels/violations.test.ts and the Spec 47 §A.5 registry loop,
 * which reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-parcels.descriptor.json');
const compute = require('./lib/compute/link-parcels');
const ADVISORY_LOCK_ID = 90;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
