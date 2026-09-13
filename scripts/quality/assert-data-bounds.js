#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4 (Data bounds)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * CQA Tier 2: Post-Ingestion Data Bounds Validation.
 *
 * Usage: node scripts/quality/assert-data-bounds.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 1,055 lines now lives in exactly three places:
 *   · ./assert-data-bounds.descriptor.json  — what this step is, declared as data
 *   · ../lib/compute/assert-data-bounds.js  — the domain logic, and only that
 *   · ../lib/step/                          — pool, lock, ledger, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired
 * by the library from `descriptor.identity.lock`, and the two are asserted equal
 * by src/tests/steps/assert_data_bounds/violations.test.ts. It is declared,
 * never read, on purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const descriptor = require('./assert-data-bounds.descriptor.json');
const compute = require('../lib/compute/assert-data-bounds');
const ADVISORY_LOCK_ID = 103;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
