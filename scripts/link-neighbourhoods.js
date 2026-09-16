#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Link Neighbourhoods" (this step's own contract)
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 11 (the permits chain)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 18 (the sources chain)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4, §8 (shape freeze)
 *
 * Stamp permits.neighbourhood_id by point-in-polygon containment of the permit's own
 * geocoded point against the neighbourhoods polygon table.
 *
 * Usage: node scripts/link-neighbourhoods.js   ·   PIPELINE_CHAIN=sources node scripts/link-neighbourhoods.js
 * There is no --full and no force-full env var: the pre-conversion file read `process.argv`
 * nowhere, Spec 43 states this step gets no `chain_args.sources` override, and the
 * conversion deliberately did not INVENT one (LN-D9 — as drafted it would have been a
 * no-op whose terminal name promised a relink it could not perform). The only reset is
 * operator-issued: NULL `neighbourhood_id` over the scope to be corrected, then re-run.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 375 lines now lives in exactly three places:
 *   · ./link-neighbourhoods.descriptor.json    — what this step is, declared as data
 *   · ./lib/compute/link-neighbourhoods.js     — the containment SQL, the check observers,
 *                                                the records_meta block, and only those
 *   · ./lib/step/                              — pool, lock, ledger, config, the pre_write
 *                                                gate, the one write, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_neighbourhoods/violations.test.ts and by the Spec 47 §A.5 registry
 * loop, which reads THIS FILE AS TEXT. It is declared, never read, on purpose — and it is
 * 92 rather than the spec number 60 because 92 is what the c1ef0b73 retrofit assigned, and
 * this step runs in BOTH the permits and sources chains, which makes a renumbering a live
 * collision risk rather than a tidy-up.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-neighbourhoods.descriptor.json');
const compute = require('./lib/compute/link-neighbourhoods');
const ADVISORY_LOCK_ID = 92;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
