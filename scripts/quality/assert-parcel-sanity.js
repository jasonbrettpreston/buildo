#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §2
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Parcel Sanity Profile — the VALUE-CORRECTNESS gate (Spec 48 §3.6, row-derived
 * verdict). Complements assert_global_coverage (existence) by answering "are the
 * values CORRECT?"
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 89 lines now lives in exactly three places:
 *   · ./assert-parcel-sanity.descriptor.json — what this step is, declared as data
 *   · ../lib/compute/assert-parcel-sanity.js — the domain logic, and only that
 *   · ../lib/step/                           — pool, lock, ledger, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired
 * by the library from `descriptor.identity.lock`, and the two are asserted equal
 * by src/tests/steps/assert_parcel_sanity/violations.test.ts. It is declared,
 * never read, on purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const descriptor = require('./assert-parcel-sanity.descriptor.json');
const compute = require('../lib/compute/assert-parcel-sanity');
const ADVISORY_LOCK_ID = 107;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
