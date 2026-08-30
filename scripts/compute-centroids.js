#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 9 (PRIMARY — the step's real and only chain membership)
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (SECONDARY — owns the `parcels` table this step writes)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §1.10 (BACKFILL)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 3/R-G, Rule 9 grandfathered)
 *
 * Fills parcels.centroid_lat/centroid_lng for every parcel with a geometry and no
 * centroid yet.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What
 * used to be 226 lines (including a JS arithmetic-mean fallback, retired whole at
 * A-1(a) — see compute-centroids.notes.json's fences[]) now lives in exactly three
 * places:
 *   · ./compute-centroids.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/compute-centroids.js  — the verbatim-ported PostGIS
 *                                            UPDATE ... RETURNING id, and only that
 *   · ./lib/step/                         — pool, lock, guards.requires, the
 *                                            backlog pre-count, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/compute_centroids/violations.test.ts and the Spec 47 §A.5
 * registry loop (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS
 * FILE AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./compute-centroids.descriptor.json');
const compute = require('./lib/compute/compute-centroids');
const ADVISORY_LOCK_ID = 99;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
