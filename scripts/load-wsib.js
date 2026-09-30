#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md §2 (source), §3 (behavioural contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (step 19, load_wsib, lock 97)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.4
 *
 * Load the operator-dropped Ontario WSIB Business Classification Details CSV
 * (data/BusinessClassificationDetails*.csv, annual manual download from wsib.ca) into
 * `wsib_registry`: Class G only, de-duplicated on (legal_name_normalized, mailing_address)
 * keeping the G-predominant row, ONE class-A guarded upsert.
 *
 * Usage: node scripts/load-wsib.js   ·   PIPELINE_CHAIN=sources node scripts/load-wsib.js
 * (no arguments: with no matching file in data/ the run is the COMPLETED skip
 * `skipped_no_source_file`; see scripts/load-wsib.notes.json for the annual refresh.)
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1) and enforced by
 * scripts/ast-grep-rules/step-shape.yml over scripts/steps/_schema/converted.json.
 * What used to be 448 lines now lives in exactly three places:
 *   · ./load-wsib.descriptor.json  — what this step is, declared as data
 *   · ./lib/compute/load-wsib.js   — the domain logic, and only that
 *   · ./lib/step/                  — pool, lock, ledger, config, local-file acquisition
 *                                    (0fs), the class-A write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by
 * the library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 *
 * The `--file <csv>` argument and the chain-context data/ scan the pre-conversion loader
 * carried are RETIRED (WS-D4, decision D1(A), Spec 124 R-AZ): the ONE input is the
 * descriptor's filesystem external `data/BusinessClassificationDetails*.csv`, resolved by
 * scripts/lib/step/acquire.js resolveLocalSource (newest match by name).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-wsib.descriptor.json');
const compute = require('./lib/compute/load-wsib');
const ADVISORY_LOCK_ID = 97;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
