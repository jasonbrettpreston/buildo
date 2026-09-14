#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §1.10 (RECORDER)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rules 1-13)
 *
 * CQA Tier 3: Engine Health & Volume Volatility.
 *
 * Usage: node scripts/quality/assert-engine-health.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What
 * used to be 347 lines now lives in exactly three places:
 *   · ./assert-engine-health.descriptor.json — what this step is, declared as data
 *   · ../lib/compute/assert-engine-health.js — the domain logic, and only that
 *   · ../lib/step/                           — pool, lock, ledger, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/assert_engine_health/violations.test.ts and the Spec 47 §A.5
 * registry loop (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS
 * FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const descriptor = require('./assert-engine-health.descriptor.json');
const compute = require('../lib/compute/assert-engine-health');
const ADVISORY_LOCK_ID = 104;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
