/**
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2, §3
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_massing step, lock 56)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 * SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rule 2, Rule 3, Rule 10
 *
 * Toronto 3D Massing → `building_footprints`: DOMAIN LOGIC ONLY — the pure feature → column
 * mapping and the pure helpers the runner calls by name.
 *
 * ⚠️ NOT HERE: `footprint_area_sqm`/`_sqft` come from the VALIDATOR's declared
 * `derived_from_geometry`; `geom` from the `wkb_geometry` binding (`geometry_srid` 3857,
 * `geometry_repair` "none"). THE VERDICT IS NOT COMPUTED HERE — `step/verdict.js` derives it
 * from the rows (Rule 10): this file returns no verdict key and keeps no parallel fail/warn booleans.
 *
 * ⚠️ NO MODULE NUMERIC CONSTANT (Spec 124 §5 R-BA gate E): the story height is registered
 * `massing_story_height_m` from `seam.config`; 100 / 10000000 / 12 stay INLINE.
 */
'use strict';

const crypto = require('crypto');
const { safeParseFloat } = require('../safe-math');

/** Feature → `source_id`, or null with no geometry. ⚠️ FOLD SF-1: `_raw` IGNORED ENTIRELY — the DBF has no OBJECTID/ID, so the key is md5(geometry) and a publisher OBJECTID must NOT re-key the table. The runner hands the SAME `JSON.stringify(geometry)` string the oracle hashed. */
function coerceKey(_raw, seam) {
  const geojson = seam ? seam.geojson : null;
  if (geojson == null) return null;
  return 'hash_' + crypto.createHash('md5').update(geojson).digest('hex').substring(0, 12);
}

/** `computeCentroid` from the pre-conversion loader (git show 1828b4e1:scripts/load-massing.js), verbatim; M-D9 keeps the WRONG form (a 3857 ring averages metres into lat/lng), dead because every measured feature carries LONGITUDE/LATITUDE. */
function computeCentroid(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
  if (n < 3) return null;
  let sumLng = 0, sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / n, sumLat / n];
}

/** `extractRing` (pre-conversion loader, verbatim): Polygon → ring 0; MultiPolygon → part 0's ring 0. */
function extractRing(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || null;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || null;
  return null;
}

/** `estimateStories` (pre-conversion loader) verbatim; its module `STORY_HEIGHT_M` becomes this parameter — registered `massing_story_height_m` arrives from `seam.config` (Rule 3). */
function estimateStories(maxHeightM, storyHeightM) {
  if (maxHeightM == null || maxHeightM <= 0) return null;
  return Math.max(1, Math.round(maxHeightM / storyHeightM));
}

/**
 * The values `outputs.writes[0]` binds, or null for a feature the step REFUSES to carry (oracle
 * anchor `batch.push({` in the pre-conversion loader; refusals: no geometry `if (!feature || !feature.geometry)`, ring < 4 points `if (!ring || ring.length < 4)`). A shapefile's geometry arrives
 * PRE-STRINGIFIED as `seam.geojson`, so it is re-parsed. ⚠️ `geojson` is the seam field the
 * write plan's `wkb_geometry` column reads; `geometry` carries the SAME string. NO `source_id`
 * (that is `coerceKey`'s), NO `footprint_area_*`, NO `geom`.
 */
function shapeRecord(record, seam) {
  const props = record || {};
  const facts = seam || {};
  const geojson = facts.geojson;
  if (geojson == null) return null;
  const geometry = JSON.parse(geojson);
  if (!geometry) return null;
  const ring = extractRing(geometry);
  if (!ring || ring.length < 4) return null;
  const maxHeight = props.MAX_HEIGHT != null ? safeParseFloat(props.MAX_HEIGHT, 'MAX_HEIGHT') : null;
  const minHeight = props.MIN_HEIGHT != null ? safeParseFloat(props.MIN_HEIGHT, 'MIN_HEIGHT') : null;
  const elevZ = props.ELEVZ != null ? safeParseFloat(props.ELEVZ, 'ELEVZ') : (props.SURF_ELEV != null ? safeParseFloat(props.SURF_ELEV, 'SURF_ELEV') : null);
  // Explicit LONGITUDE/LATITUDE wins over the ring mean (the ring may be projected).
  const centroid = (props.LONGITUDE != null && props.LATITUDE != null)
    ? [safeParseFloat(props.LONGITUDE, 'LONGITUDE'), safeParseFloat(props.LATITUDE, 'LATITUDE')]
    : computeCentroid(ring);
  const stories = estimateStories(maxHeight, (facts.config || {}).massing_story_height_m);
  return {
    geojson,
    geometry: geojson,
    max_height_m: maxHeight != null && !isNaN(maxHeight) ? Math.round(maxHeight * 100) / 100 : null,
    min_height_m: minHeight != null && !isNaN(minHeight) ? Math.round(minHeight * 100) / 100 : null,
    elev_z: elevZ != null && !isNaN(elevZ) ? Math.round(elevZ * 100) / 100 : null,
    estimated_stories: stories,
    centroid_lat: centroid ? Math.round(centroid[1] * 10000000) / 10000000 : null,
    centroid_lng: centroid ? Math.round(centroid[0] * 10000000) / 10000000 : null,
  };
}

/** LAST-wins dedupe by `source_id` (M-D3): md5(geometry) collides, and an upsert may not touch one row twice in one statement. Parcels shape. */
function dedupeBySourceId(features) {
  const byKey = new Map();
  for (const f of features) byKey.set(f.source_id, f);
  const kept = [...byKey.values()];
  return { kept, duplicateCount: features.length - kept.length };
}

/** §3.5 status → counter deltas (write.js anchor `const d = classify(v.status, v.is_valid_original);`, two positional args). ⚠️ `accepted` NEVER REPAIRS (M-D2): `geometry_repair` "none" keeps `repaired` 0 EVEN WHEN `isValidOriginal === false`; the library counts stored-invalid rows itself. All four keys always present. */
function validatorCounterDelta(status, isValidOriginal) {
  if (status === 'accepted') {
    return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
  }
  if (status === 'collection_extracted') {
    return { repaired: 0, collectionExtracted: 1, skipped: 0, carry: true };
  }
  return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
}

/** Class A (`retract:"none"`): no `delete_sql` exists, so the delete is always skipped. */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

/** Finite number, else null (the parcels reader). */
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/** `rows_read`, falling back to the acquisition's `feature_count` (parcels' `rows_read_floor` reader). */
function rowsRead(a) {
  const rr = numberOrNull(a.rows_read);
  return rr != null ? rr : numberOrNull(a.feature_count);
}

/** The legacy `skipped` numerator: the 0s re-bucketing — bad_key_count + null_geometry_count + shaped_skipped. */
function skippedCount(a) {
  return (numberOrNull(a.bad_key_count) || 0)
    + (numberOrNull(a.null_geometry_count) || 0)
    + (numberOrNull(a.shaped_skipped) || 0);
}

/**
 * The catastrophic-load detector (descriptor checks[0], WARN — never FAIL, severity is
 * not archetype-derived). The bound is the SHARED, pre-existing
 * `sources_building_footprints_floor` variable — the SAME key assert_data_bounds
 * declares (Rule 3) — read through `ctx.config`. The descriptor's `limit` uses
 * verdict.js's `value_min` form against this reported raw `value` (the AP-D6 trap: a
 * `viol == 0` limit is false on every run once the config value is substituted in).
 */
function features_read_floor(ctx) {
  const rr = rowsRead(ctx.acquired || {});
  if (rr == null) {
    return ctx.report('features_read_floor', { violations: 0, detail: null, value: null });
  }
  ctx.report('features_read_floor', {
    value: rr,
    detail: rr,
    violations: rr < ctx.config.sources_building_footprints_floor ? 1 : 0,
  });
}

/** Descriptor checks[1], INFO — the guarded upsert's inserted rows (RETURNING xmax = 0). Purely descriptive; a raw count, so `viol == 0`. */
function records_inserted(ctx) {
  const w = ctx.written || {};
  ctx.report('records_inserted', { violations: 0, detail: numberOrNull(w.inserted) || 0 });
}

/** Descriptor checks[2], INFO — the guarded upsert's updated rows (RETURNING xmax <> 0). M-D3: an unchanged rerun reads 0 by construction. */
function records_updated(ctx) {
  const w = ctx.written || {};
  ctx.report('records_updated', { violations: 0, detail: numberOrNull(w.updated) || 0 });
}

/**
 * Descriptor checks[3], INFO — the guarded upsert's MEASURED no-op count (,
 * rows submitted and not RETURNed; Spec 122 §11 KFM 9 row conservation). Legacy derived it as
 * , which also absorbed the 1,107
 * duplicate-hash rows (M-D3); the runner now names those in  and
 * conservation.js proves read = skips + inserted + updated + unchanged.
 */
function records_unchanged(ctx) {
  const w = ctx.written || {};
  ctx.report('records_unchanged', { violations: 0, detail: numberOrNull(w.unchanged) || 0 });
}

/** Descriptor checks[4], INFO — the runner's skip counter, summing bad_key_count + null_geometry_count + shaped_skipped (the 0s re-bucketing). */
function features_skipped(ctx) {
  ctx.report('features_skipped', { violations: 0, detail: skippedCount(ctx.acquired || {}) });
}

/**
 * Descriptor checks[5], FAIL — the legacy skip-rate FAIL boundary is STRICT (a rate AT
 * the ceiling fails) which `pct <=` cannot express, so the compute compares against
 * `ctx.config.massing_skip_rate_max_pct` (Rule 3) and reports violations 0/1. Denominator
 * `rows_read`; numerator the re-bucketed skip sum; the reported `detail` is UNROUNDED.
 */
function skip_rate_pct(ctx) {
  const a = ctx.acquired || {};
  const rr = rowsRead(a);
  if (rr == null || rr <= 0) {
    return ctx.report('skip_rate_pct', { violations: 0, detail: null });
  }
  const pct = (skippedCount(a) / rr) * 100;
  ctx.report('skip_rate_pct', {
    detail: pct,
    violations: pct >= ctx.config.massing_skip_rate_max_pct ? 1 : 0,
  });
}

/** Descriptor checks[6], INFO — failed write batches, carrying the legacy INFO audit row. Descriptive only; a raw count, so `viol == 0`. */
function batch_errors(ctx) {
  const a = ctx.acquired || {};
  ctx.report('batch_errors', { violations: 0, detail: numberOrNull(a.batch_errors) || 0 });
}

/**
 * Descriptor checks[7], FAIL — the legacy batch-error-rate FAIL boundary is STRICT (a
 * rate AT the ceiling fails), so the compute compares against
 * `ctx.config.massing_batch_error_rate_max_pct` (Rule 3) and
 * reports violations 0/1. The batch size is the DESCRIPTOR's `execution.batch` (never a
 * literal here); batches are `ceil(rows_read / batch)`, the legacy `Math.ceil(processed /
 * pipeline.BATCH_SIZE)`. Under `txn_scope:"step"` a failed batch fails the step before
 * checks run, so a completed run reads 0.
 */
function batch_error_rate_pct(ctx) {
  const a = ctx.acquired || {};
  const errors = numberOrNull(a.batch_errors) || 0;
  const rr = rowsRead(a) || 0;
  const batch = ctx.descriptor && ctx.descriptor.execution ? ctx.descriptor.execution.batch : null;
  const batches = rr > 0 && batch ? Math.ceil(rr / batch) : 0;
  const rate = batches > 0 ? (errors / batches) * 100 : 0;
  ctx.report('batch_error_rate_pct', {
    detail: rate,
    violations: rate >= ctx.config.massing_batch_error_rate_max_pct ? 1 : 0,
  });
}

/** Descriptor checks[8], INFO — features dropped by the last-write-wins dedupe (duplicate md5(geometry) hashes; M-D3). Descriptive only. */
function duplicate_key_count(ctx) {
  const a = ctx.acquired || {};
  ctx.report('duplicate_key_count', { violations: 0, detail: numberOrNull(a.duplicate_key_count) || 0 });
}

/** Descriptor checks[9], INFO — M-D2 observability: carried rows whose geometry is invalid and stored unrepaired (`geometry_repair` "none"). Descriptive only. */
function invalid_geometry_stored(ctx) {
  const a = ctx.acquired || {};
  ctx.report('invalid_geometry_stored', { violations: 0, detail: numberOrNull(a.invalid_geometry_stored) || 0 });
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in DESCRIPTOR ORDER. */
const CHECKS = {
  features_read_floor,
  records_inserted,
  records_updated,
  records_unchanged,
  features_skipped,
  skip_rate_pct,
  batch_errors,
  batch_error_rate_pct,
  duplicate_key_count,
  invalid_geometry_stored,
};

/**
 * ⚠️ REQUIRE-TIME INVARIANT (SPEC LINK 122 §5.5): the dispatch keys ARE the declared
 * check ids. The descriptor ships beside this file, so a mismatch is a load-order bug,
 * not a runtime condition — it must throw at require() time rather than surface as a
 * silently-unscored check on a green run.
 */
const DECLARED_CHECKS = require('../../load-massing.descriptor.json').checks.map((c) => c.id);
const DISPATCH_KEYS = Object.keys(CHECKS);
if (DISPATCH_KEYS.length !== DECLARED_CHECKS.length
    || DISPATCH_KEYS.some((id, i) => id !== DECLARED_CHECKS[i])) {
  throw new Error('load-massing compute dispatch keys are not the descriptor\'s declared check ids: '
    + `dispatch=[${DISPATCH_KEYS.join(', ')}] declared=[${DECLARED_CHECKS.join(', ')}]`);
}
for (const id of DECLARED_CHECKS) {
  if (CHECKS[id].name !== id) {
    throw new Error(`load-massing compute: checks.${id} is bound to a function named "${CHECKS[id].name}"`);
  }
}

/**
 * The `massing_load` emit block — the keys `emits[]` declares, byte-identical to the
 * pre-conversion loader's names (M-D6). Built only on a LOAD: a gated skip re-emits the
 * PRIOR block through the library, so a half-populated block here would overwrite it.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  const rr = rowsRead(a) || 0;
  const inserted = numberOrNull(w.inserted) || 0;
  const updated = numberOrNull(w.updated) || 0;
  return {
    duration_ms: numberOrNull(ctx.elapsed_ms) || 0,
    features_read: rr,
    records_inserted: inserted,
    records_updated: updated,
    records_unchanged: numberOrNull(w.unchanged) || 0,
    features_skipped: skippedCount(a),
    errors: numberOrNull(a.batch_errors) || 0,
  };
}

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
  return { records_meta: { massing_load: buildLoadMeta(ctx) } };
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
// The parse/compute seams, exported so a lock can drive them without a write plan.
module.exports.extractRing = extractRing;
module.exports.computeCentroid = computeCentroid;
module.exports.estimateStories = estimateStories;
