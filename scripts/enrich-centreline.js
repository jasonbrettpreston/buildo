#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.11, §8d, §9, §11 (v1.1)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown (the `sources` chain, position 14)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §8 (shape freeze)
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN, do not fix)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict)
 *
 * Proximity-joins parcels.geom against toronto_centreline and writes is_corner_lot /
 * is_through_lot / primary_frontage_street_name / abuts_laneway + the producer lineage stamp via
 * one set-based join UPDATE (§11), in the mode the WF2 P11-1 version-skip gate selects
 * (full / incremental / skip — ported verbatim, plan D1 = (a)).
 *
 * Usage: node scripts/enrich-centreline.js   ·   PIPELINE_CHAIN=sources node scripts/enrich-centreline.js
 *        ENRICH_CENTRELINE_FORCE_FULL=1 node scripts/enrich-centreline.js   (recompute every valid-geom parcel)
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 627 lines now lives in exactly three places:
 *   · ./enrich-centreline.descriptor.json   — what this step is, declared as data
 *   · ./lib/compute/enrich-centreline.js     — the §11 SQL builder, the contract read + mode gate,
 *                                              the pass, the post-phase diagnostics, the check observers
 *   · ./lib/step/                            — pool, lock, ledger, config, the shared transaction,
 *                                              the class-N write executor, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library
 * from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/enrich_centreline/violations.test.ts and by the Spec 47 §A.5 registry loop, which
 * reads THIS FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./enrich-centreline.descriptor.json');
const compute = require('./lib/compute/enrich-centreline');
const ADVISORY_LOCK_ID = 64;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
