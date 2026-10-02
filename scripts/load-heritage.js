#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §3 (load path), §9 (frozen heritage_load contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 7, load_heritage, lock 61)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4 · 122a §A18 (0x)
 *
 * Load Toronto's Heritage Register (Part IV / Part V points) into heritage_properties and
 * the Heritage Conservation Districts (polygons) into heritage_districts — two CKAN
 * zipped shapefiles, each gated, acquired, validated and written on its own (DEC-K).
 *
 * Usage: node scripts/load-heritage.js   ·   PIPELINE_CHAIN=sources node scripts/load-heritage.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 808 lines now lives in exactly three places:
 *   · ./load-heritage.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-heritage.js  — the domain logic, and only that
 *   · ./lib/step/                     — pool, lock, ledger, config, staleness, the
 *                                       per-dataset acquisition and class-B write (0x),
 *                                       verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-heritage.descriptor.json');
const compute = require('./lib/compute/load-heritage');
const ADVISORY_LOCK_ID = 61;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
