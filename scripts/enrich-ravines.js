#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9, §11.1 (v1.2)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown (the `sources` chain, position 12 of 28)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §8 (shape freeze)
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §1.1 (behaviour-neutral), §3.1 (PIN, do not fix)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2 compute-is-just-compute, Rule 3 tunables, Rule 10 row-derived verdict)
 *
 * Spatial-joins parcels.geom against ravines (Spec 59 §8c) and writes the Chapter-658 flag +
 * signed nearest-ravine distance + dataset lineage stamp via one set-based join UPDATE (§11.1),
 * scoped to geom-bearing parcels stale against the current ravines version (#418 Layer-2).
 *
 * Usage: node scripts/enrich-ravines.js   ·   PIPELINE_CHAIN=sources node scripts/enrich-ravines.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 310 lines now lives in exactly three places:
 *   · ./enrich-ravines.descriptor.json     — what this step is, declared as data
 *   · ./lib/compute/enrich-ravines.js       — the join SQL, the contract-read HALT (F1/F2/SRID),
 *                                             the coverage query, the check observers, and only those
 *   · ./lib/step/                           — pool, lock, ledger, config, the shared transaction,
 *                                             the class-N write executor, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library
 * from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/enrich_ravines/violations.test.ts and by the Spec 47 §A.5 registry loop, which
 * reads THIS FILE AS TEXT. It is declared, never read, on purpose — 60 is Spec 59 L4b's
 * "verified unassigned" value, not a spec number.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./enrich-ravines.descriptor.json');
const compute = require('./lib/compute/enrich-ravines');
const ADVISORY_LOCK_ID = 60;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
