#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (§2 geom contract, §3 core logic + the --full gate)
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §3 (Link Massing)
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md MB-7 (link_massing precedes enrich_parcels)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Link parcels to building footprints and write the parcel_buildings junction.
 *
 * Usage: node scripts/link-massing.js   ·   PIPELINE_CHAIN=sources node scripts/link-massing.js --full
 * LINK_MASSING_FORCE_FULL=1 forces a full relink unconditionally (budget ~22 min: it
 * retracts and rebuilds all 520,492 links and bumps every linked_at, which re-scopes the
 * next enrich_parcels run from 1,395 parcels to 485,135).
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 740 lines now lives in exactly three places:
 *   · ./link-massing.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/link-massing.js    — the spatial predicate, the classifiers, the
 *                                        check observers, and only those
 *   · ./lib/step/                      — pool, lock, ledger, config, the tri-state mode
 *                                        gate, the pre_write gate, the ordered writes,
 *                                        verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_massing/violations.test.ts (#205) and by the Spec 47 §A.5
 * registry loop, which reads THIS FILE AS TEXT. It is declared, never read, on purpose —
 * and it is 91 rather than the spec number 56 because 91 is what the c1ef0b73 retrofit
 * assigned and what a recorded past collision makes unsafe to renumber.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-massing.descriptor.json');
const compute = require('./lib/compute/link-massing');
const ADVISORY_LOCK_ID = 91;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
