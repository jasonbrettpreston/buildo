#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md (owning spec, §3 "Refresh Snapshot")
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §1.10 (RECORDER)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 9 grandfathered)
 *
 * Refreshes today's data_quality_snapshots row from live tables — the single write
 * target every chain (permits/coa/sources/deep_scrapes) shares.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What
 * used to be 687 lines (9+ inline query strings, JS-side row assembly, and a manual
 * Zod logicVars validation call) now lives in exactly three places:
 *   · ./refresh-snapshot.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/refresh-snapshot.js  — the WF3-F1 query builders (verbatim),
 *                                           the read plan, row assembly, and the
 *                                           write-SQL authoring, and only that
 *   · ./lib/step/                        — pool, lock, guards, the read/write
 *                                           execution loop (runRecorderPhase,
 *                                           LG-26), verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/refresh_snapshot/violations.test.ts and the Spec 47 §A.5
 * registry loop (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS
 * FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./refresh-snapshot.descriptor.json');
const compute = require('./lib/compute/refresh-snapshot');
const ADVISORY_LOCK_ID = 40;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
