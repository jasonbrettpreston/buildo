#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EQ (P4-SWAP: runner_wired before ③)
 *
 * CQA Step 3: CoA source freshness monitor (portal rot check). Read-only.
 *
 * Usage: node scripts/quality/assert-coa-freshness.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * The step now lives in exactly three places:
 *   · ./assert-coa-freshness.descriptor.json — what this step is, declared as data
 *   · ../lib/compute/assert-coa-freshness.js — the domain logic, and only that
 *   · ../lib/step/ — pool, lock, ledger, config, verdict and emits
 * The legacy text is kept verbatim as the red suite's oracle:
 * src/tests/steps/assert_coa_freshness/fixtures/legacy-assert-coa-freshness.js.txt.
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/assert_coa_freshness/violations.test.ts and the Spec 47 §A.5 registry loop,
 * which reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const descriptor = require('./assert-coa-freshness.descriptor.json');
const compute = require('../lib/compute/assert-coa-freshness');
const ADVISORY_LOCK_ID = 108;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
