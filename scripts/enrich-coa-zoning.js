#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9b
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EQ (P4-SWAP: runner_wired before ③)
 *
 * Enrich CoA applications with their dominant parcel's zoning, envelope and cost propagation
 * (Spec 66 WF3), plus the orphan nullify of CoAs that lost every parcel link.
 *
 * Usage: node scripts/enrich-coa-zoning.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * The step now lives in exactly three places:
 *   · ./enrich-coa-zoning.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/enrich-coa-zoning.js    — one line over the shared ./lib/enrich-lead-zoning.js (target coa)
 *   · ./lib/step/                           — pool, lock, ledger, config, runEnrichPhase, verdict and emits
 * The ① identity-split pass-through is kept as the red suite's oracle (L1).
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant (shared with enrich_permits): the lock is
 * acquired by the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/enrich_coa_zoning/violations.test.ts and the Spec 47 §A.5 registry loop,
 * which reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./enrich-coa-zoning.descriptor.json');
const compute = require('./lib/compute/enrich-coa-zoning');
const ADVISORY_LOCK_ID = 66;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
