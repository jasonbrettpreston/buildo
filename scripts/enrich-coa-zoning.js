#!/usr/bin/env node
/**
 * Enrich CoA Zoning (Spec 66 WF3) — the enrich_coa_zoning identity-split shell.
 *
 * Phase-4 wave 4 commit ① (operator-approved 2026-10-18, wave-4 plan question 9): one file used to
 * serve two slugs (`enrich_permits`, `enrich_coa_zoning`) through `ENRICH_TARGET`, but a descriptor,
 * a `converted.json` entry and the census are keyed by file. This shell gives `enrich_coa_zoning`
 * its own file. It is a LEGACY PASS-THROUGH: it runs `scripts/enrich-permits.js`'s own `main()` with
 * `ENRICH_TARGET=coa`, byte-for-byte the behaviour of `ENRICH_TARGET=coa node scripts/enrich-permits.js`.
 * Commit ② replaces it with the frozen `pipeline.step()` shell over the one shared compute module.
 *
 * SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9b
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { main } = require('./enrich-permits');

process.env.ENRICH_TARGET = 'coa';
pipeline.run('enrich-permits', main);
