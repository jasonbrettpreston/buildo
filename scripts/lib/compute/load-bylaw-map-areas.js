/**
 * SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §11.3 (load_bylaw_map_areas)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rules 1, 3, 10
 * SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (plan A3)
 *
 * The 600.60 Sixplex Overlay map (by-law 654-2025 Diagrams 1/2) — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. Under Spec 122 §5.1 the library owns the whole
 * acquire → validate → write pipeline (`scripts/lib/step/{acquire,write,staleness}.js`),
 * because a LOADER's real work is filesystem work that a compute is forbidden to touch
 * (`scripts/ast-grep-rules/compute-shape.yml`). What is left here is what a compute is
 * FOR: pure domain arithmetic, and one observer per declared check reading a result the
 * library already produced.
 *
 * The result arrives on the ctx:
 *   · `ctx.acquired` — what the seed yielded: `content_hash` (the library's md5 of the
 *                      copied bytes), `shaped_tags` (per-`source:` counts of the rows
 *                      `shapeRecord` kept), the `*_count` fields the observers below read
 *   · `ctx.written`  — what the class-B write did: inserted / updated / deleted, the
 *                      empty-set guard flag
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, `fn.name === check.id`, gathered in the
 *      CHECKS dispatch at the bottom in DESCRIPTOR ORDER.
 *   2. `compute(ctx)` iterates `ctx.checks` and does nothing else.
 *   3. Every observation goes through `ctx.report(<checkId>, …)`. No `console.*`.
 *   4. Every seam is injected: `ctx.config`, `ctx.log`. No `fs`, no `pg`, no
 *      `pipeline`, no wall clock, no SQL.
 *
 * ⚠️ NO MODULE-LEVEL NUMERIC CONSTANTS (Spec 124 Rule 3 / the R-BA gate E): the only
 * bounds this step has are the descriptor's own `limit` strings (`viol == 0`). The map
 * code, the sources and the area types are the seed manifest's own data (below), never a
 * second copy here.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE (Rule 10). The step's outcome is derived from the
 * audit rows by `scripts/lib/step/verdict.js`; a step that decides its own verdict can
 * disagree with its own audit table. `dataset_source_license` RECORDS the operator's 2026-10-08
 * ruling — it never decides whether the step may publish.
 */
'use strict';

/**
 * The adopted seed manifest: committed data, required statically (the load_coa_notices
 * vocab.json / target-map.json posture). `map-seed.mjs --adopt` writes it; a missing or
 * corrupt manifest fails the require at load, loudly.
 */
const MANIFEST = require('../../seeds/bylaw/maps/manifest.json');

/** The only map code this step loads (Spec 58 §11.3; by-law 654-2025, Chapter 600.60). */
const MAP_CODE = MANIFEST.map_code;
/** The sources the ONE seed file carries, in the manifest's order. */
const SOURCES = Object.freeze((MANIFEST.sources || []).map((s) => s.source));
/** The by-law's area types (Diagram 2 / Diagram 1), keyed by their integer code. */
const AREA_TYPES = Object.freeze(Object.keys(MANIFEST.area_types || {}).map(Number));

/** A 64-hex lowercase SHA-256, as `map-seed.mjs --adopt` writes it. */
const SHA256_RE = /^[0-9a-f]{64}$/;
/** A 32-hex lowercase md5 — acquire.js's content hash algorithm. */
const MD5_RE = /^[0-9a-f]{32}$/;

// The pins every check compares against must be well-formed, or the step must not load.
if (typeof MANIFEST.seed_sha256 !== 'string' || !SHA256_RE.test(MANIFEST.seed_sha256)) throw new Error('BMA_E_MANIFEST seed_sha256');
if (typeof MANIFEST.seed_md5 !== 'string' || !MD5_RE.test(MANIFEST.seed_md5)) throw new Error('BMA_E_MANIFEST seed_md5');
if (typeof MAP_CODE !== 'string' || !MAP_CODE) throw new Error('BMA_E_MANIFEST map_code');
if (SOURCES.length === 0 || SOURCES.some((s) => typeof s !== 'string' || !s)) throw new Error('BMA_E_MANIFEST sources');
if (AREA_TYPES.length === 0 || AREA_TYPES.some((t) => !Number.isInteger(t))) throw new Error('BMA_E_MANIFEST area_types');


// ===========================================================================
// One observer per declared check — `fn.name === check.id`, DESCRIPTOR ORDER.
// ===========================================================================

/**
 * The GROUND TRUTH that every other check here depends on. Until the operator confirms it
 * the layer is used LOCALLY ONLY, and the recorded ruling — never an assumption — is what
 * a reader of the audit table sees. INFO, never FAIL: this row RECORDS a decision the
 * operator already made (2026-10-08, Q-A1); it does not make one (Rule 10). One violation
 * per manifest source that carries no recorded ruling.
 */
function dataset_source_license(ctx) {
  const sources = {};
  let unrecorded = 0;
  for (const s of MANIFEST.sources) {
    const licence = s.licence || {};
    const ruling = typeof licence.ruling === 'string' && licence.ruling ? licence.ruling : null;
    if (ruling === null) unrecorded += 1;
    sources[s.source] = { ruling, publish_scope: licence.publish_scope ?? null };
  }
  ctx.report('dataset_source_license', { violations: unrecorded, detail: { sources } });
}

/**
 * Spec 68 §9 G-PROV: the bytes the library hashed while COPYING the seed must be the bytes
 * `map-seed.mjs --adopt` pinned. The library's content hash is md5 (acquire.js
 * DEFAULT_CONTENT_HASH_ALGORITHM), so the manifest's pin is `seed_md5` beside `seed_sha256`.
 * A hand-edited or half-adopted seed (a crash between the two renames) is refused here,
 * before any write.
 */
function seed_hash_matches_manifest(ctx) {
  const h = (ctx.acquired || {}).content_hash;
  ctx.report('seed_hash_matches_manifest', {
    violations: typeof h === 'string' && h === MANIFEST.seed_md5 ? 0 : 1,
    detail: { acquired: h || null, pinned: MANIFEST.seed_md5 },
  });
}

/**
 * A shaped count per source that differs from the pin means shapeRecord skipped a feature
 * (or the seed is the wrong seed); either way 600.60 membership would be computed against a
 * PARTIAL map, so the write is refused. One violation per source whose pin or measurement
 * is missing or differs.
 */
function source_counts_match_manifest(ctx) {
  const acquired = ctx.acquired || {};
  const tags = acquired.shaped_tags || {};
  const counts = {};
  let violations = 0;
  for (const s of MANIFEST.sources) {
    const want = pinnedFeatureCount(s);
    const got = counterOrRefuse(tags['source:' + s.source]);
    if (!(want !== null && got !== null && got === want)) violations += 1;
    counts[s.source] = { got, want };
  }
  ctx.report('source_counts_match_manifest', {
    violations,
    detail: {
      counts,
      // BMA-F5: the refusal reasons are the actual diagnosis for a shaped-count shortfall,
      // and they already exist on the ctx — surface them instead of hiding them.
      shaped_skipped_by_reason: acquired.shaped_skipped_by_reason || {},
    },
  });
}

/** A malformed area_key is DROPPED at parse; a dropped map area is land whose 600.60 status silently changes. */
function bad_key_count(ctx) {
  const n = counterOrRefuse((ctx.acquired || {}).bad_key_count);
  ctx.report('bad_key_count', n === null
    ? { violations: 1, detail: { bad_key_count: null, unmeasured: true } }
    : { violations: n, detail: { bad_key_count: n } });
}

/** Two different polygons sharing an area_key: dedupe keeps the first, and this count refuses the write. */
function duplicate_key_count(ctx) {
  const n = counterOrRefuse((ctx.acquired || {}).duplicate_key_count);
  ctx.report('duplicate_key_count', n === null
    ? { violations: 1, detail: { duplicate_key_count: null, unmeasured: true } }
    : { violations: n, detail: { duplicate_key_count: n } });
}

/** A null geometry is dropped before validation; for a 27-feature legal map that is a missing area. */
function null_geometry_count(ctx) {
  const n = counterOrRefuse((ctx.acquired || {}).null_geometry_count);
  ctx.report('null_geometry_count', n === null
    ? { violations: 1, detail: { null_geometry_count: null, unmeasured: true } }
    : { violations: n, detail: { null_geometry_count: n } });
}

/** Unlike an 854-polygon ravine layer there is no tolerable loss rate for a by-law map: one area changes the overlay. */
function geometry_skipped_count(ctx) {
  const n = counterOrRefuse((ctx.acquired || {}).invalid_geometry_skipped);
  ctx.report('geometry_skipped_count', n === null
    ? { violations: 1, detail: { invalid_geometry_skipped: null, unmeasured: true } }
    : { violations: n, detail: { invalid_geometry_skipped: n } });
}

/** F-C1, made visible: the library suppressed the departure DELETE because the parse was empty. */
function delete_skipped_empty_guard(ctx) {
  const fired = (ctx.written || {}).delete_skipped_empty_guard === true;
  ctx.report('delete_skipped_empty_guard', {
    violations: fired ? 1 : 0,
    detail: { delete_skipped_empty_guard: fired },
  });
}

// ---- helpers ----

/** A count the library may not have reported: anything unusable reads as null, never NaN. */
function numberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * A COUNTER the library is contractually required to report (BMA-F2). Unlike
 * `numberOrNull`, a missing/garbage counter does NOT fold to 0 — 0 is a MEASURED "nothing
 * was dropped", and an unmeasured gate must refuse rather than claim a clean run. Returns
 * `null` for anything that is not a finite non-negative number; callers refuse on null.
 */
function counterOrRefuse(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** A manifest source's pinned feature count: its `feature_count`, else the length of its `ward_codes` pin. */
function pinnedFeatureCount(s) {
  if (counterOrRefuse(s.feature_count) !== null) return s.feature_count;
  return Array.isArray(s.ward_codes) ? s.ward_codes.length : null;
}

/**
 * <source>:<positive integer>, and NOTHING else. A padded key (' city_gis_layer80:1'),
 * a zero, a negative, a string id, an unknown source — all null. Deliberately NO trim:
 * a padded key is a BAD key, not a key to normalise, because area_key IS the row's
 * identity in bylaw_map_areas' PRIMARY KEY.
 */
function coerceKey(raw) {
  if (typeof raw !== 'string') return null;
  const at = raw.lastIndexOf(':');
  if (at < 0) return null;
  return SOURCES.includes(raw.slice(0, at)) && /^[1-9][0-9]*$/.test(raw.slice(at + 1)) ? raw : null;
}

/**
 * ONE parsed seed feature -> the value object the write plan binds, or one of the
 * refusal strings the library counts (`bad_map_code`, `key_source_mismatch`,
 * `bad_area_type`, `missing_area_name`).
 *
 * PURE. `seam` carries the library's `geojson` (the geometry field name every
 * geometry-binding column reads) and an optional `tag(name)` counter.
 */
function shapeRecord(record, seam) {
  const props = record || {};
  if (props.map_code !== MAP_CODE) return 'bad_map_code';
  // The key's tail is the row's identity, so it must BE an integer id: `0`/`1.5` would key
  // a row no caller can reconstruct, and `'071'` would file ward 71 under a non-canonical
  // token. area_key's own grammar (coerceKey) is the second half of the same ruling.
  if (!Number.isInteger(props.source_feature_id) || props.source_feature_id <= 0) {
    return 'key_source_mismatch';
  }
  if (!SOURCES.includes(props.source) || props.area_key !== props.source + ':' + props.source_feature_id) {
    return 'key_source_mismatch';
  }
  if (!AREA_TYPES.includes(props.area_type)) return 'bad_area_type';
  if (typeof props.area_name !== 'string' || !props.area_name) return 'missing_area_name';
  if (seam && typeof seam.tag === 'function') seam.tag('source:' + props.source);
  return {
    geojson: seam.geojson,
    map_code: props.map_code,
    source: props.source,
    source_feature_id: props.source_feature_id,
    area_type: props.area_type,
    area_name: props.area_name,
    seed_sha256: MANIFEST.seed_sha256,
  };
}

/**
 * Dedupe shaped rows by area_key, keep the FIRST — ON CONFLICT cannot affect one row
 * twice inside a single statement. `duplicateCount` is the ONLY evidence two different
 * polygons shared a key; map-seed.mjs's checkSeed already refuses that at the adopt door.
 */
function dedupeBySourceId(features) {
  const seen = new Set();
  const kept = [];
  for (const f of features) {
    if (seen.has(f.area_key)) continue;
    seen.add(f.area_key);
    kept.push(f);
  }
  return { kept, duplicateCount: features.length - kept.length };
}

/** §3.5 status → counter deltas. Pure, so the classifier is unit-lockable. */
function validatorCounterDelta(status, isValidOriginal) {
  switch (status) {
    case 'accepted':
      return { repaired: isValidOriginal ? 0 : 1, collectionExtracted: 0, skipped: 0, carry: true };
    case 'collection_extracted':
      return { repaired: 1, collectionExtracted: 1, skipped: 0, carry: true };
    default: // skipped_null | skipped_unsupported_type
      return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
  }
}

/** F-C1: `key <> ALL('{}')` is true for every row — suppress the departure DELETE on an empty parse. */
function shouldSkipDelete(sourceIds) {
  return !Array.isArray(sourceIds) || sourceIds.length === 0;
}

/**
 * The emit block for `emits[].key = "bylaw_map_load"` (BMA-16). Built only on a LOAD: a
 * gated skip (`skipped_content_hash` between seed adoptions) re-emits the PRIOR block
 * through the library, so a half-populated block here would overwrite it. The library's
 * content-hash skip compares THIS block's `content_hash` (source-version.js
 * validatorEqualityDecision — the load_ravines / load_coa_notices key). A counter the
 * library did not report is null, never a 0 it did not measure (BMA-F2).
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  return {
    map_code: MAP_CODE,
    seed_sha256: MANIFEST.seed_sha256,
    content_hash: a.content_hash || null,
    feature_count: numberOrNull(a.feature_count),
    areas_inserted: numberOrNull(w.inserted),
    areas_updated: numberOrNull(w.updated),
    areas_deleted: numberOrNull(w.deleted),
    delete_skipped_empty_guard: w.delete_skipped_empty_guard === true,
    skipped_reason: null,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  dataset_source_license,
  seed_hash_matches_manifest,
  source_counts_match_manifest,
  bad_key_count,
  duplicate_key_count,
  null_geometry_count,
  geometry_skipped_count,
  delete_skipped_empty_guard,
};

// The dispatch keys === the descriptor's declared check ids, in order, is locked by the
// generic compute-pairs test (src/tests/step-conformance.infra.test.ts) and the step's own
// violations suite — not by a descriptor require here (R-BZ G12).

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row, never suppress siblings. */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.written) return { records_meta: {} };
  return { records_meta: { bylaw_map_load: buildLoadMeta(ctx) } };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The pure seams the runner calls by name (§5.5 (1) — compute is just compute).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
module.exports.SOURCES = SOURCES;
module.exports.MAP_CODE = MAP_CODE;
