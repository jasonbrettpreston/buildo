#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (compute_maxbld_scenarios — Layer 3)
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-377, M-384 (Layer 3 is formula rows as DATA; code names no zone, scenario, regulation id or by-law number — M-61)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.4
 *
 * Layer 3 of the McBylaws engine: for every population parcel, run the catalogue rows of each building type from the stored Phase 2
 * cells and the seeded settings only, one long-format parcel_maxbld_scenarios row per parcel × building type × field.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1). Exactly three places:
 *   · ./compute-maxbld-scenarios.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/compute-maxbld-scenarios.js  — the domain logic, and only that
 *   · ./lib/step/                                — pool, lock, ledger, config, staleness, guard, emits
 * No per-step settings wrapper and no message rewriting live here (§20.2 rejects a wrapper per step).
 *
 * `const ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library from `descriptor.identity.lock`,
 * and the two are asserted equal by the pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4 registry
 * loops read this file as TEXT. Spec 47 §A.5: lock 135 (the next id after resolve_bylaws' 134, globally unique).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./compute-maxbld-scenarios.descriptor.json');
const compute = require('./lib/compute/compute-maxbld-scenarios');
const ADVISORY_LOCK_ID = 135;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
