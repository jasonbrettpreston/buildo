#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * CQA Tier 1: Pre-Ingestion Schema Validation.
 *
 * Usage: node scripts/quality/assert-schema.js
 * Exit 0 = pass (all expected columns present) · Exit 1 = fail (drift detected)
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 606 lines now lives in exactly three places:
 *   · ./assert-schema.descriptor.json  — what this step is, declared as data
 *   · ../lib/compute/assert-schema.js  — the domain logic, and only that
 *   · ../lib/step/                     — pool, lock, ledger, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired
 * by the library from `descriptor.identity.lock`, and the two are asserted equal
 * by src/tests/steps/assert_schema/violations.test.ts (#205). It is declared,
 * never read, on purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const descriptor = require('./assert-schema.descriptor.json');
const compute = require('../lib/compute/assert-schema');
const ADVISORY_LOCK_ID = 102;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
