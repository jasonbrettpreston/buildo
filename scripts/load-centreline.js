#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md (§3, §9 — the frozen producer contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_centreline step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Load Toronto's Centreline (TCL) street-network LineStrings (4326) from the CKAN zipped
 * shapefile into toronto_centreline by a staged full replace: one transaction creates a
 * LIKE-INCLUDING-CONSTRAINTS temp table, inserts the validated rows, deletes the whole
 * table and re-inserts from the staging table.
 *
 * Usage: PIPELINE_CHAIN=sources node scripts/load-centreline.js   ·   node scripts/load-centreline.js
 * CENTRELINE_FORCE_RELOAD=1 bypasses BOTH staleness gates (the tier-1 last-modified/etag HEAD
 * gate and the tier-2 content-hash gate) for a deliberate full reload.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 726 lines now lives in exactly three places:
 *   · ./load-centreline.descriptor.json  — what this step is, declared as data
 *   · ./lib/compute/load-centreline.js   — the domain logic, and only that
 *   · ./lib/step/                        — pool, lock, ledger, config, staleness,
 *                                          acquisition, the class-C write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/load_centreline/violations.test.ts. The spec's 65 collides with
 * enrich-parcels (live LOCK_ID_REGISTRY); 63 is the next free gap. It is declared,
 * never read, on purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-centreline.descriptor.json');
const compute = require('./lib/compute/load-centreline');
const ADVISORY_LOCK_ID = 63;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
