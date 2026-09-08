#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (owning spec, §2 zoning · §4 max-build ·
 *   §5 existing-structure · §6 scenarios · §7 accessory)
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (§P2 comp family match ·
 *   §P3A optimal-config · §P3C comparable-builds kNN — Ask 6 ruling, Spec 78 governs 2 of 5 passes)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8.2 (frozen shape), §1.10 (ENRICHER)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 9 grandfathered)
 *
 * Five-pass ENRICHER over `parcels`: zoning by-law precedence, max-build envelope + accessory
 * fit, existing-structure + reno/build scenarios, comparable-builds kNN, and optimal-config.
 * Passes 1-4 share ONE pipeline.withTransaction; pass 5 streams on a separate connection AFTER
 * that transaction COMMITs (Spec 78 §P3A.1 — a same-txn read would be invisible).
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What used to be
 * 2,391 lines (5 inline pass functions, hand-rolled verdict cascade, 96 auditRows.push sites) now
 * lives in exactly three places:
 *   · ./enrich-parcels.descriptor.json — what this step is, declared as data (5 write targets,
 *                                        execution.shape:"enrich", 39 config.logic_variables)
 *   · ./lib/compute/enrich-parcels.js  — the 5 pass functions (zoning/max-build/existing+
 *                                        scenarios/comps/optimal-config), the checks dispatch
 *                                        table, and only that
 *   · ./lib/step/                      — pool, lock, guards, runEnrichPhase (LG-28, the shared-txn
 *                                        + post-commit execution loop), verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library
 * from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/enrich_parcels/violations.test.ts and the Spec 47 §A.5 registry loop
 * (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS FILE AS TEXT. It is
 * declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./enrich-parcels.descriptor.json');
const compute = require('./lib/compute/enrich-parcels');
const ADVISORY_LOCK_ID = 65;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
