#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md (§3, §9 — the frozen producer contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_ravines step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Load Toronto's Ravine & Natural Feature Protection Area polygons (Chapter 658).
 *
 * Usage: node scripts/load-ravines.js   ·   PIPELINE_CHAIN=sources node scripts/load-ravines.js
 * RAVINE_FORCE_RELOAD=1 bypasses BOTH staleness gates for a deliberate reload.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 605 lines now lives in exactly three places:
 *   · ./load-ravines.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/load-ravines.js    — the domain logic, and only that
 *   · ./lib/step/                      — pool, lock, ledger, config, staleness,
 *                                        acquisition, the class-B write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/load_ravines/violations.test.ts (#205). It is declared, never
 * read, on purpose — the §5.4 registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-ravines.descriptor.json');
const compute = require('./lib/compute/load-ravines');
const ADVISORY_LOCK_ID = 59;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
