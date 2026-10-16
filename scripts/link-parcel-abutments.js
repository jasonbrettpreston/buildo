#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/130_link_parcel_abutments.md (link_parcel_abutments — PROPOSED)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (sources, after enrich_parcels)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.4
 *
 * Link every parcel to the parcels that abut it (shared boundary >= abut_min_shared_len_m)
 * into parcel_abutments, ONE ROW PER ORDERED PAIR, carrying the NEIGHBOUR's attributes as
 * seen from the subject: the residential zoning flag, the same-frontage-street flag, the
 * neighbour's primary building, the building-to-subject distance and an ADVISORY estimated
 * front setback. Observations only: front-yard-averaging applicability (10.5.40.70(1)) is
 * derived on read by McBylaw, with fya_neighbour_max_dist_m 15.0.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1). What used to be a hand-rolled
 * loader is exactly three places:
 *   · ./link-parcel-abutments.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/link-parcel-abutments.js  — the domain logic, and only that
 *   · ./lib/step/                             — pool, lock, ledger, config, staleness,
 *                                               acquisition, the class-B write, verdict, emits
 *
 * `const ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 * Spec 47 §A.5 / Spec 130: lock 130 (mutual exclusion with every other writer of
 * parcel_abutments; the spec number, globally unique).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-parcel-abutments.descriptor.json');
const compute = require('./lib/compute/link-parcel-abutments');
const ADVISORY_LOCK_ID = 130;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
