#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (§2 acquisition, §3 write contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (massing step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Load Toronto's 3D Massing shapefile (~428K building footprints, EPSG:3857 despite the
 * `_wgs84` filename) from Toronto Open Data into `building_footprints`.
 *
 * Usage: node scripts/load-massing.js   ·   PIPELINE_CHAIN=sources node scripts/load-massing.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 488 lines now lives in exactly three places:
 *   · ./load-massing.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-massing.js  — the domain logic, and only that
 *   · ./lib/step/                    — pool, lock, ledger, config, staleness,
 *                                      acquisition, the class-A write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/massing/violations.test.ts. It is declared, never read, on purpose —
 * the §5.4 registry loops read this file as TEXT.
 *
 * The `process.argv[2]` local-path override and the `data/3d-massing-wgs84/` fs.existsSync
 * download-vs-cache short-circuit the pre-conversion loader carried are RETIRED (Spec 124
 * R-AZ, plan M-D10): a debug affordance that let a STALE local shapefile feed a run must
 * not survive into a step whose whole claim is byte-identical output.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-massing.descriptor.json');
const compute = require('./lib/compute/load-massing');
const ADVISORY_LOCK_ID = 56;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
