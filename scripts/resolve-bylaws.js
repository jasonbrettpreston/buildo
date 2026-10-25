#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md (resolve_bylaws — Layer 2 by-law resolution)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (sources, after enrich_parcels)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.4
 *
 * Resolve every in-population residential parcel against the Spec 68 evaluator, per structure x target x class, into the bylaw_resolution_*
 * tables: shared per-target cells (keyed by the values of that target's own read inputs, Spec 124 R-IN option B) pointed at through one
 * profile per distinct result set (R-JA, operator CHAT-69.Q1). Layer 3 (compute_maxbld_scenarios) reads only these rows (Spec 78 D-1).
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1). What used to be a hand-rolled loader is exactly three places:
 *   · ./resolve-bylaws.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/resolve-bylaws.js  — the domain logic, and only that
 *   · ./lib/step/                      — pool, lock, ledger, config, staleness, the rows arm, verdict, emits
 *
 * `const ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the library from `descriptor.identity.lock`, and the
 * two are asserted equal by the pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4 registry loops read this
 * file as TEXT. Spec 47 §A.5 / Spec 134: lock 134 (the spec number, globally unique).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./resolve-bylaws.descriptor.json');
const compute = require('./lib/compute/resolve-bylaws');
const ADVISORY_LOCK_ID = 134;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
