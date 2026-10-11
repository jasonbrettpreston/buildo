#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5
 *
 * Toronto Committee of Adjustment decision notices → coa_notice_variances (values only; no text, no names).
 *
 * Usage: PIPELINE_CHAIN=coa_notices node scripts/load-coa-notices.js
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1), enforced by scripts/ast-grep-rules/step-shape.yml
 * over scripts/steps/_schema/converted.json. The step lives in exactly three places:
 *   · ./load-coa-notices.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-coa-notices.js  — the domain logic (shapeDocument, reconcileNotices, checks)
 *   · ./lib/step/                         — pool, lock, ledger, config, staleness, the pdf_document_set
 *                                           acquisition arm (RE-FREEZE #32), the write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` is a §5.4 SOURCE-TEXT constant: the library acquires the lock from
 * `descriptor.identity.lock`, and violations.test.ts C-2 asserts the two are equal.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-coa-notices.descriptor.json');
const compute = require('./lib/compute/load-coa-notices');
const ADVISORY_LOCK_ID = 129;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
