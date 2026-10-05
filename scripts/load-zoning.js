#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 (load path), §9 (frozen zoning contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 21, load_zoning, lock 58)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4 · 122a §A18 (0x), §A19 (0y)
 *
 * Load Toronto's Zoning By-law 569-2013 from ten CKAN DataStore resources into the base
 * zone table zoning_bylaw_areas and nine overlay tables — one package_show decides the
 * run (skip only when every layer is unchanged, R2-12), then each layer is acquired,
 * validated and written in its own transaction (base required, overlays WARN-and-continue).
 *
 * Usage: node scripts/load-zoning.js   ·   PIPELINE_CHAIN=sources node scripts/load-zoning.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 753 lines now lives in exactly three places:
 *   · ./load-zoning.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-zoning.js  — the domain logic, and only that
 *   · ./lib/step/                   — pool, lock, ledger, config, the all-primaries CKAN
 *                                     gate and acquisition (0y), the per-layer class-B
 *                                     write (0x), verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-zoning.descriptor.json');
const compute = require('./lib/compute/load-zoning');
const ADVISORY_LOCK_ID = 58;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
