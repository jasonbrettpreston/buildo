#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/46_wsib_enrichment.md §2 (Contact Flow), §3 (Behavioral Contract)
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §2 (Step Registry row 19), §"Link WSIB"
 * SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md §2-§3 (source cadence, load_wsib contract)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 12 rules)
 *
 * Match WSIB registry entries to builder entities (3-tier bulk cascade) and write
 * wsib_registry.linked_entity_id/match_confidence/matched_at + entities.is_wsib_registered
 * + the fill-only contact columns.
 *
 * Usage: node scripts/link-wsib.js [--dry-run]   ·   LINK_WSIB_FORCE_FULL=1 bypasses the
 * ledger gate. Mode full (the A-7 tier-3 repair) is selected ONLY by the load_wsib
 * corpus/config_version signal (A-8) — never by schedule and never by --full.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/hooks/check-step-shape.mjs over scripts/steps/_schema/converted.json. What
 * used to be 547 lines now lives in exactly three places:
 *   · ./link-wsib.descriptor.json    — what this step is, declared as data
 *   · ./lib/compute/link-wsib.js     — the tier match predicates, the retraction SQL,
 *                                       the check observers, and only those
 *   · ./lib/step/                    — pool, lock, ledger gated-skip, config, the
 *                                       tri-state mode gate, the pre_write gate, the
 *                                       ordered per-tier writes, verdict and emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by
 * src/tests/steps/link_wsib/violations.test.ts (#205) and the Spec 47 §A.5 registry
 * loop (src/tests/pipeline-advisory-lock.infra.test.ts), which reads THIS FILE AS TEXT.
 * It is declared, never read, on purpose.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./link-wsib.descriptor.json');
const compute = require('./lib/compute/link-wsib');
const ADVISORY_LOCK_ID = 94;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
