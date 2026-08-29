#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §Bridge (PRIMARY)
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md §4 (SECONDARY)
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 9 (link-parcels.js Strategy 1a consumer)
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §Step Breakdown row 9 / §6.6.B (link-coa-to-parcels.js Tier 1a consumer)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §1.10 (MATERIALIZER)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 12 rules; Rule 3/R-G, Rule 9 grandfathered)
 *
 * Populate parcel_address_points, the spatial bridge table.
 *
 * Usage: node scripts/link-parcel-addresses.js   ·   LINK_PARCEL_ADDRESSES_FORCE_FULL=1
 * bypasses the run-ledger gate.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What
 * used to be 393 lines now lives in exactly three places:
 *   · ./link-parcel-addresses.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/link-parcel-addresses.js  — the verbatim-ported INSERT...SELECT...
 *                                                 JOIN ST_Within...ON CONFLICT DO NOTHING
 *                                                 SQL, and only that
 *   · ./lib/step/                             — pool, lock, ledger gated-skip, config,
 *                                                 the keyset batch loop, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_parcel_addresses/violations.test.ts (#205) and the Spec 47 §A.5
 * registry loop (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS FILE
 * AS TEXT. It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-parcel-addresses.descriptor.json');
const compute = require('./lib/compute/link-parcel-addresses');
const ADVISORY_LOCK_ID = 115;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
