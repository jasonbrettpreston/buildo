#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/51_source_coa.md §3
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EQ (P4-SWAP: runner_wired before ③)
 *
 * Load Committee of Adjustment applications from Toronto Open Data (CKAN): the Active resource
 * always, the Closed resource in full mode only, into coa_applications, plus one
 * lifecycle_status_history row per status change.
 *
 * Usage: node scripts/load-coa.js   ·   node scripts/load-coa.js --full
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 711 lines now lives in exactly three places:
 *   · ./load-coa.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/load-coa.js    — the domain logic, and only that
 *   · ./lib/step/                  — pool, lock, ledger, config, acquisition, the writes, verdict, emits
 * The legacy text is kept verbatim as the red suite's oracle:
 * src/tests/steps/coa/fixtures/legacy-load-coa.js.txt.
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/coa/violations.test.ts (D1, D1b). It is declared, never read, on
 * purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-coa.descriptor.json');
const compute = require('./lib/compute/load-coa');
const ADVISORY_LOCK_ID = 95;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
