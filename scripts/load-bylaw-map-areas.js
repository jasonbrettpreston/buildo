#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (load_bylaw_map_areas — PROPOSED)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (sources, after load_zoning)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.4
 *
 * Load the pinned 600.60 Sixplex Overlay map seed into bylaw_map_areas: by-law 654-2025
 * Diagrams 1/2 — the 18 City GIS layer-80 areas (with the 881 holes they are published
 * with) plus the 8 Toronto and East York wards and ward 23 from the CKAN `city-wards`
 * package — read from scripts/seeds/bylaw/maps/600_60.geojson, guarded upsert on area_key
 * plus a scoped departure delete, in one transaction.
 *
 * ⚠️ THE SEED IS NEVER FETCHED LIVE. Its md5/sha256 are pinned in the seed manifest
 * (scripts/seeds/bylaw/maps/manifest.json) and seed_hash_matches_manifest refuses the load
 * on any drift. To change the seed: `node scripts/analysis/bylaw/map-seed.mjs --refresh`
 * then `--adopt` (the manifest is written LAST), and re-run this step.
 *
 * ⚠️ THE ENTIRE FILE SHAPE IS FROZEN (Spec 122 §5.1). What used to be a hand-rolled
 * loader is exactly three places:
 *   · ./load-bylaw-map-areas.descriptor.json — what this step is, declared as data
 *   · ./lib/compute/load-bylaw-map-areas.js  — the domain logic, and only that
 *   · ./lib/step/                            — pool, lock, ledger, config, staleness,
 *                                              acquisition, the class-B write, verdict, emits
 *
 * `ADVISORY_LOCK_ID` below is a §5.4 SOURCE-TEXT constant: the lock is acquired by the
 * library from `descriptor.identity.lock`, and the two are asserted equal by the
 * pipeline advisory-lock suite. It is declared, never read, on purpose — the §5.4
 * registry loops read this file as TEXT.
 * Spec 47 §A.5 / Spec 58: lock 127 (mutual exclusion with every other writer of
 * bylaw_map_areas; 58 is load_zoning).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const descriptor = require('./load-bylaw-map-areas.descriptor.json');
const compute = require('./lib/compute/load-bylaw-map-areas');
const ADVISORY_LOCK_ID = 127;
module.exports = pipeline.step(descriptor, compute);
module.exports.descriptor = descriptor;
module.exports.compute = compute;
