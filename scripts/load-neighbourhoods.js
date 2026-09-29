#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/57_source_neighbourhoods.md §2 (acquisition), §3 (write contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 17, neighbourhoods, lock 57)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Load Toronto's 158 Neighbourhood Boundaries (GeoJSON, CRS84) from Toronto Open Data
 * together with the 2021 Neighbourhood Census Profile (XLSX lookup), merged into ONE
 * class-A guarded upsert into `neighbourhoods`.
 *
 * Usage: node scripts/load-neighbourhoods.js   ·   PIPELINE_CHAIN=sources node scripts/load-neighbourhoods.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 719 lines now lives in exactly three places:
 *   · ./load-neighbourhoods.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-neighbourhoods.js  — the domain logic, and only that
 *   · ./lib/step/                           — pool, lock, ledger, config, staleness,
 *                                             acquisition, the class-A write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 *
 * The `process.argv[2]`/`[3]` local-path override and the `data/` GeoJSON/XLSX cache
 * the pre-conversion loader carried are RETIRED (N-D5, Spec 124 R-AZ): the step
 * downloads from CKAN every run and caches none, so a stale local file can no longer
 * feed a run whose whole claim is byte-identical output.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-neighbourhoods.descriptor.json');
const compute = require('./lib/compute/load-neighbourhoods');
const ADVISORY_LOCK_ID = 57;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
