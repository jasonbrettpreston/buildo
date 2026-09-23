#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_address_points step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5
 *
 * Load Toronto's Address Points CSV (~525K rows, ~183 MB) into `address_points`.
 *
 * Usage: node scripts/load-address-points.js   ·   PIPELINE_CHAIN=sources node scripts/load-address-points.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 497 lines now lives in exactly three places:
 *   · ./load-address-points.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-address-points.js  — the domain logic, and only that
 *   · ./lib/step/                           — pool, lock, ledger, config, staleness,
 *                                             acquisition, the class-A write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/load-address-points.infra.test.ts. It is declared, never read, on purpose —
 * the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-address-points.descriptor.json');
const compute = require('./lib/compute/load-address-points');
const ADVISORY_LOCK_ID = 96;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
