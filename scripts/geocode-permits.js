#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Geocode Permits" (this step's own contract)
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 8 (the permits chain)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 4 (the sources chain)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §8 (shape freeze)
 *
 * Populate permits.latitude/longitude by joining permits.geo_id::INTEGER to
 * address_points.address_point_id, then clear coordinates on permits whose geo_id the city
 * removed from the feed. Both statements share ONE transaction.
 *
 * Usage: node scripts/geocode-permits.js   ·   PIPELINE_CHAIN=sources node scripts/geocode-permits.js
 *
 * There is no --full and no force-full env var: the pre-conversion file read `process.argv`
 * NOWHERE across all 19 of its commits, no chain passes it `chain_args`, and there is no
 * second algorithm a full mode could select. `manifest.scripts.geocode_permits.supports_full`
 * is a DEAD DECLARATION (GP-L1) and the conversion declares it as one rather than inventing
 * a reader for it — `staleness.mode_select` and `override.force_full` are both "none".
 * The step is unconditionally full-scan already: phase 1 re-joins every permit carrying a
 * numeric geo_id on every run, and the IS DISTINCT FROM guard — not a lineage predicate —
 * is what makes that cheap.
 *
 * ⚠️ WHAT THE SPECS SAID UNTIL COMMIT 9. Spec 60 §3 described matching "by street number +
 * name" with a "Google Maps Geocoding API" fallback and an incremental/`--full` mode split;
 * Spec 41's step table said "or Google fallback". None of that has been true since
 * `67057269`. There is ZERO network egress (measured: 0 hits for google/fetch/http/axios),
 * `execution.network` is "none" and `inputs.reads.externals` is empty. The spec text is
 * corrected in the cutover commit; `limitations[]` GP-L4 records the drift.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 188 lines now lives in exactly three places:
 *   · ./geocode-permits.descriptor.json    — what this step is, declared as data
 *   · ./lib/compute/geocode-permits.js      — the join SQL, the two count queries, the
 *                                             post-phase observation block, the check
 *                                             observers, the records_meta block, and only those
 *   · ./lib/step/                           — pool, lock, ledger, config, the shared
 *                                             transaction, both write executors, the
 *                                             before-image, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/geocode_permits/violations.test.ts and by the Spec 47 §A.5 registry loop,
 * which reads THIS FILE AS TEXT. It is declared, never read, on purpose — and it is 5
 * because 5 is the §A.5 registry id (row 5, "4 — Load/Ingest", *Writes Timestamps YES —
 * geocoded_at*) that `745a1b4d` assigned, not a spec number. This step runs in BOTH the
 * permits and sources chains under that one id, which makes `lock_held_elsewhere` a
 * genuinely reachable terminal rather than a theoretical one.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./geocode-permits.descriptor.json');
const compute = require('./lib/compute/geocode-permits');
const ADVISORY_LOCK_ID = 5;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
