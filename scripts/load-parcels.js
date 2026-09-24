#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels step, position 5)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5
 *
 * Load Toronto's Property Boundaries CSV (~498K rows, ~224 MB, GeoJSON `geometry`
 * column) into `parcels`.
 *
 * Usage: node scripts/load-parcels.js   ·   PIPELINE_CHAIN=sources node scripts/load-parcels.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 585 lines now lives in exactly three places:
 *   · ./load-parcels.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-parcels.js  — the domain logic, and only that
 *   · ./lib/step/                    — pool, lock, ledger, config, staleness,
 *                                      acquisition, the class-A write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/parcels/violations.test.ts. It is declared, never read, on purpose —
 * the §5.4 registry loops read this file as TEXT.
 *
 * The `process.argv[2]` local-path override and the `data/…csv` fs.existsSync
 * download-vs-cache short-circuit the pre-conversion loader carried are RETIRED
 * (Spec 124 R-AZ, plan D2): a debug affordance that let a STALE local CSV feed a run
 * must not survive into a step whose whole claim is byte-identical output.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-parcels.descriptor.json');
const compute = require('./lib/compute/load-parcels');
const ADVISORY_LOCK_ID = 55;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
