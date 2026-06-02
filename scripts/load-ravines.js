#!/usr/bin/env node
/**
 * Load Toronto Ravine & Natural Feature Protection Area polygons (Chapter 658).
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md (v1.2 §8c)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_ravines step)
 *
 * Acquisition: download the CKAN zipped shapefile (datastore_active=false →
 * cannot use datastore_search), unzip cross-platform via node-stream-zip,
 * scan for the single *.shp (+ .dbf), parse with the `shapefile` lib.
 *
 * Producer contract frozen at spec §9 (records_meta.ravine_load + emitMeta).
 * Geometry validation uses the spec §3.5 batched VALUES+UNNEST SQL directly
 * (DEC-B) — NOT scripts/lib/geometry-validator.js, which cannot emit the
 * geometry_collection_extracted counter the §9 contract freezes.
 *
 * Usage: node scripts/load-ravines.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const StreamZip = require('node-stream-zip');
const shapefile = require('shapefile');

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { safeParseIntOrNull } = require('./lib/safe-math');
const { z } = require('zod');

const ADVISORY_LOCK_ID = 59; // L4 (verified unassigned)
const SPEC_VERSION = '1.2'; // L10
// run-chain.js records each step as `${chainId}:${slug}` (run-chain.js:253) →
// the stored pipeline name is the chain-scoped slug, NOT 'source-ravines'
// (spec L18/§3.2 froze the wrong string; corrected here + flagged for §8d).
const PIPELINE_NAME = 'sources:load_ravines';
const LICENSE_URL = 'https://open.toronto.ca/open-data-license/';
const CKAN_DOWNLOAD_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/ravine-natural-feature-protection-area/resource/bb81bb0f-f88a-4f3e-bca7-a328154ba31b/download/ravine-natural-feature-protection-area-wgs84.zip';
const CKAN_INPUT_KEY = 'ckan:ravine-natural-feature-protection-area-wgs84';

const ConfigSchema = z.object({
  ravineSkipCheckThresholdYears: z.number().default(20), // L9 staleness WARN
  ravineDriftFeatureCountPct: z.number().default(0.5), // L7
  ravineDriftGeometryUpdatePct: z.number().default(0.5), // L7b
  ravineInvalidGeometryFailPct: z.number().default(0.05), // L8
  ravineMassDeletePct: z.number().default(0.5), // L7c
  ravineDownloadTimeoutMs: z.number().default(60000), // fold (DeepSeek DEFER)
});

// Spec §3.5 batched geometry validation — one SQL round-trip (L16, Spec 47 §B1).
// $1 = BIGINT[] source_ids, $2 = TEXT[] geojson strings (ord-aligned).
const VALIDATION_SQL = `
WITH input AS (
  SELECT s.source_id, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_id, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord)   ON s.ord = g.ord
),
validated AS (
  SELECT
    source_id,
    ST_GeometryType(repaired) AS repaired_type,
    ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,
    is_valid_original
  FROM (
    SELECT source_id,
           ST_IsValid(geom)   AS is_valid_original,
           ST_MakeValid(geom) AS repaired
      FROM input
  ) s
)
SELECT source_id,
       CASE
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)
              AND repaired_type = 'ST_GeometryCollection'                       THEN 'collection_extracted'
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)                                     THEN 'accepted'
         WHEN geom_final IS NULL OR ST_IsEmpty(geom_final)                       THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom_final) AS geom_wkb,
       is_valid_original
  FROM validated;
`;

// ===========================================================================
// Pure helpers (exported for src/tests/load-ravines.logic.test.ts)
// ===========================================================================

/** L7: |loaded - prior| / prior. First run / missing prior → 0 (no drift). DeepSeek HIGH null-guard. */
function computeCountDeltaPct(loaded, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return Math.abs(loaded - prior) / prior;
}

/** L7b: updated / prior. First run / missing prior → 0. */
function computeGeometryUpdatePct(updated, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return updated / prior;
}

/** L7c: deleted / prior. First run / missing prior → 0. */
function computeMassDeletePct(deleted, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return deleted / prior;
}

/** F-C1 (L15): suppress DELETE when the parsed set is empty. */
function shouldSkipDelete(sourceIds) {
  return !Array.isArray(sourceIds) || sourceIds.length === 0;
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

/** Dedupe parsed features by source_id (keep first) — guards ON CONFLICT "cannot affect row twice" (DeepSeek MED). */
function dedupeBySourceId(features) {
  const seen = new Set();
  const kept = [];
  for (const f of features) {
    if (seen.has(f.source_id)) continue;
    seen.add(f.source_id);
    kept.push(f);
  }
  return { kept, duplicateCount: features.length - kept.length };
}

/** 3-way row-derived verdict cascade (never a parallel boolean). Spec 47 §8.2. */
function verdictCascade(rows) {
  if (rows.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (rows.some((r) => r.status === 'WARN')) return 'WARN';
  return 'PASS';
}

/** Days between now(ms) and an HTTP date / version string; null if unparseable (avoid NaN→spurious WARN). */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / 86400000);
}

/** L9 staleness: WARN if older than thresholdYears. */
function datasetAgeStatus(ageDays, thresholdYears) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdYears * 365.25 ? 'WARN' : 'INFO'; // 365.25 accounts for leap years (Gemini LOW)
}

/**
 * L9 skip-check. Skip iff a prior version exists AND a cache validator matches.
 * First run / no validators → proceed (full load).
 */
function skipCheckDecision({ lastModified, etag = null, contentHash = null, prior }) {
  const pm = prior && prior.ravine_load ? prior.ravine_load : null;
  if (!pm) return { skip: false, reason: 'no_prior_run' };
  if (!lastModified && !etag) return { skip: false, reason: 'no_validators' };
  if (lastModified && pm.last_modified && lastModified === pm.last_modified) return { skip: true, reason: 'unchanged_last_modified' };
  if (etag && pm.etag && etag === pm.etag) return { skip: true, reason: 'unchanged_etag' };
  if (contentHash && pm.content_hash && contentHash === pm.content_hash) return { skip: true, reason: 'unchanged_content_hash' };
  return { skip: false, reason: 'changed' };
}

/** Coerce OBJECTID → positive integer source_id, else null (counted as skip, never fabricated). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

// ===========================================================================
// Acquisition (download + unzip + scan + parse)
// ===========================================================================

/** HEAD the CKAN URL; return { lastModified, etag } or throw on 4xx/5xx (L9 / §3.10). */
async function headValidators(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HEAD ${res.status} ${res.statusText}`);
    return { lastModified: res.headers.get('last-modified'), etag: res.headers.get('etag') };
  } finally {
    clearTimeout(t);
  }
}

/** Download the zip to a temp file; return { zipPath, contentHash, lastModified, etag }. */
async function downloadZip(url, destPath, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`GET ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    const contentHash = crypto.createHash('md5').update(buf).digest('hex');
    return { zipPath: destPath, contentHash, lastModified: res.headers.get('last-modified'), etag: res.headers.get('etag') };
  } finally {
    clearTimeout(t);
  }
}

/** Extract the zip into destDir; return entry filenames. */
async function extractZip(zipPath, destDir) {
  const zip = new StreamZip.async({ file: zipPath });
  try {
    fs.mkdirSync(destDir, { recursive: true });
    await zip.extract(null, destDir);
    const entries = await zip.entries();
    return Object.keys(entries);
  } finally {
    await zip.close();
  }
}

/**
 * Locate the single shapefile in the extracted dir. FAIL on zero, >1 distinct,
 * or missing companion .dbf (DeepSeek MED + LOW). Case-insensitive scan.
 */
function locateShapefile(extractDir) {
  const files = fs.readdirSync(extractDir);
  const shps = files.filter((f) => f.toLowerCase().endsWith('.shp'));
  if (shps.length === 0) throw new Error('no shapefile (.shp) found in zip');
  if (shps.length > 1) throw new Error(`expected one .shp, found ${shps.length}: ${shps.join(', ')}`);
  const shp = shps[0];
  const base = shp.slice(0, -4);
  const dbf = files.find((f) => f.toLowerCase() === `${base.toLowerCase()}.dbf`);
  if (!dbf) throw new Error(`missing companion .dbf for ${shp}`);
  return { shpPath: path.join(extractDir, shp), dbfPath: path.join(extractDir, dbf) };
}

/** Parse the shapefile → [{ source_id, geojson }]; tally bad OBJECTIDs + null geometries. */
async function parseShapefile(shpPath, dbfPath) {
  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  let badSourceId = 0;
  let nullGeometry = 0;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const props = r.value.properties || {};
    const sourceId = coerceSourceId(props.OBJECTID);
    if (sourceId == null) { badSourceId++; continue; }
    if (r.value.geometry == null) { nullGeometry++; continue; }
    features.push({ source_id: sourceId, geojson: JSON.stringify(r.value.geometry) });
  }
  return { features, badSourceId, nullGeometry };
}

// ===========================================================================
// Main
// ===========================================================================
async function main(pool) {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'source-ravines');
  const config = ConfigSchema.parse(logicVars || {});

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const runAt = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock inside lock
    const nowMs = runAt.getTime(); // runAt is a Date; getTime() avoids fragile String()→Date.parse round-trip (Gemini LOW)
    const auditRows = [];
    const push = (metric, value, status) => auditRows.push({ metric, value, status });
    push('dataset_source_license', LICENSE_URL, 'INFO');

    // Override-present WARN (surfaces an accidental standing prod override even if untripped).
    const acceptDrift = process.env.RAVINE_ACCEPT_FEATURE_COUNT_DRIFT === '1';
    const acceptMassDelete = process.env.RAVINE_ACCEPT_MASS_DELETE === '1';
    if (acceptDrift) push('ravine_override_feature_count_drift_present', true, 'WARN');
    if (acceptMassDelete) push('ravine_override_mass_delete_present', true, 'WARN');

    // Prior run (chain-scoped name; started_at DESC mirrors load-zoning).
    const prior = await pool
      .query(
        `SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY started_at DESC LIMIT 1`,
        [PIPELINE_NAME],
      )
      .then((r) => (r.rows[0] ? r.rows[0].records_meta : null))
      .catch((err) => {
        pipeline.log.warn('[load-ravines]', `prior-run query failed (treating as no baseline): ${err.message}`);
        return null;
      });
    const priorFeatureCount = prior && prior.ravine_load ? safeParseIntOrNull(prior.ravine_load.feature_count) : null;

    // §3.2 Step 0a — HEAD skip-check.
    let headInfo = null;
    try {
      headInfo = await headValidators(CKAN_DOWNLOAD_URL, config.ravineDownloadTimeoutMs);
    } catch (err) {
      push('ravine_head_error', String(err.message), 'FAIL'); // §3.10 HEAD 4xx/5xx → FAIL, do not proceed
      pipeline.emitSummary({
        records_total: null, records_new: null, records_updated: null,
        records_meta: { audit_table: auditTable(auditRows), ravine_load: skeletonLoadMeta() },
      });
      emitRavineMeta();
      return { failed: true };
    }
    if (!headInfo.lastModified && !headInfo.etag) {
      push('ravine_no_cache_validators', true, 'WARN'); // CDN stripped headers — proceed, rely on content-hash
    }
    // §9 dataset-age row — pushed once right after a successful HEAD so it appears on the
    // skip path AND every downstream failure path (acquisition/drift/L8), not just success (Observability F1).
    const headAgeDays = ageDaysFrom(nowMs, headInfo.lastModified || (prior && prior.ravine_load && prior.ravine_load.last_modified));
    push('ravine_dataset_age_years', headAgeDays == null ? null : Math.floor(headAgeDays / 365.25), datasetAgeStatus(headAgeDays, config.ravineSkipCheckThresholdYears));
    const skip = skipCheckDecision({ lastModified: headInfo.lastModified, etag: headInfo.etag, prior });
    if (skip.skip) {
      push('ravine_load_skipped', skip.reason, 'INFO');
      pipeline.emitSummary({
        records_total: null, records_new: null, records_updated: null,
        records_meta: {
          audit_table: auditTable(auditRows),
          // spec_version pinned to current AFTER the prior spread so a future version bump
          // can't emit a stale version on a SKIP run (Code Reviewer BUG-2).
          ravine_load: { ...skeletonLoadMeta(), ...(prior.ravine_load || {}), spec_version: SPEC_VERSION, skipped_reason: skip.reason },
        },
      });
      emitRavineMeta();
      return { skipped: true };
    }

    // §3.3 Step 0b — download + unzip + scan + parse (temp dir, always cleaned up).
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ravines-'));
    let features = [];
    let badSourceId = 0;
    let nullGeometry = 0;
    let contentHash = null;
    let downloadValidators = {};
    try {
      const dl = await downloadZip(CKAN_DOWNLOAD_URL, path.join(tmpRoot, 'ravines.zip'), config.ravineDownloadTimeoutMs);
      contentHash = dl.contentHash;
      downloadValidators = { lastModified: dl.lastModified || headInfo.lastModified, etag: dl.etag || headInfo.etag };
      const extractDir = path.join(tmpRoot, 'ext');
      await extractZip(dl.zipPath, extractDir);
      const { shpPath, dbfPath } = locateShapefile(extractDir);
      const parsed = await parseShapefile(shpPath, dbfPath);
      features = parsed.features;
      badSourceId = parsed.badSourceId;
      nullGeometry = parsed.nullGeometry;
    } catch (err) {
      push('ravine_acquisition_error', String(err.message), 'FAIL'); // §3.10 download/zip/parse failure → FAIL, no writes
      pipeline.emitSummary({
        records_total: null, records_new: null, records_updated: null,
        records_meta: { audit_table: auditTable(auditRows), ravine_load: skeletonLoadMeta() },
      });
      emitRavineMeta();
      return { failed: true };
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    if (badSourceId > 0) push('ravine_bad_objectid_count', badSourceId, 'WARN'); // §3.10 CKAN schema drift
    if (nullGeometry > 0) push('ravine_null_geometry_count', nullGeometry, 'WARN');

    // Dedupe by source_id (DeepSeek MED — avoid ON CONFLICT "cannot affect row twice").
    const { kept, duplicateCount } = dedupeBySourceId(features);
    if (duplicateCount > 0) push('ravine_duplicate_objectid_count', duplicateCount, 'WARN');
    const featureCount = kept.length;
    push('ravine_feature_count', featureCount, 'INFO');

    // §3.4 Step 1 — L7 feature-count drift.
    const countDeltaPct = computeCountDeltaPct(featureCount, priorFeatureCount);
    let driftCheckPassed = true;
    if (countDeltaPct > config.ravineDriftFeatureCountPct) {
      driftCheckPassed = false;
      push('ravine_count_drift_pct', round3(countDeltaPct), 'FAIL'); // override never suppresses FAIL (L7)
      if (!acceptDrift) {
        // No override → abort before any DB write.
        pipeline.emitSummary({
          records_total: featureCount, records_new: 0, records_updated: 0,
          records_meta: { audit_table: auditTable(auditRows), ravine_load: { ...skeletonLoadMeta(), feature_count: featureCount, drift_check_passed: false } },
        });
        emitRavineMeta();
        return { failed: true };
      }
    }

    // §3.5 Step 2 — BATCHED geometry validation (before withTransaction; L16/L8).
    const sourceIds = kept.map((f) => f.source_id);
    const geojsons = kept.map((f) => f.geojson);
    const { rows: vrows } = await pool.query(VALIDATION_SQL, [sourceIds, geojsons]);
    const byId = new Map(vrows.map((r) => [Number(r.source_id), r]));
    let repaired = 0;
    let collectionExtracted = 0;
    let skipped = 0;
    const insertable = [];
    for (const f of kept) {
      const v = byId.get(f.source_id);
      if (!v) {
        // unnest WITH ORDINALITY should return a row per input id; a miss is anomalous (Gemini MED).
        skipped++;
        pipeline.log.warn('[load-ravines]', `source_id ${f.source_id} missing from validation result — counted as skipped`);
        continue;
      }
      const d = validatorCounterDelta(v.status, v.is_valid_original);
      repaired += d.repaired;
      collectionExtracted += d.collectionExtracted;
      skipped += d.skipped;
      if (d.carry) insertable.push({ source_id: f.source_id, geom_wkb: v.geom_wkb });
      else push('ravine_geometry_skipped_source_id', f.source_id, 'WARN');
    }
    push('ravine_geometry_repaired_pct', featureCount > 0 ? round3(repaired / featureCount) : 0, 'INFO');
    push('ravine_geometry_collection_extracted', collectionExtracted, 'INFO');
    const skippedPct = featureCount > 0 ? skipped / featureCount : 0;
    // L8: >5% skipped → FAIL + abort BEFORE transaction (no dangling state).
    if (skippedPct > config.ravineInvalidGeometryFailPct) {
      push('ravine_geometry_skipped_pct', round3(skippedPct), 'FAIL');
      pipeline.emitSummary({
        records_total: featureCount, records_new: 0, records_updated: 0,
        records_meta: { audit_table: auditTable(auditRows), ravine_load: { ...skeletonLoadMeta(), feature_count: featureCount, invalid_geometry_skipped: skipped, invalid_geometry_repaired: repaired, geometry_collection_extracted: collectionExtracted, drift_check_passed: driftCheckPassed } },
      });
      emitRavineMeta();
      return { failed: true };
    }
    push('ravine_geometry_skipped_pct', round3(skippedPct), 'INFO');

    // §3.6 Step 3 — upsert; §3.8 Step 5 — F-C1-guarded orphan delete; all in one txn.
    const datasetVersion = contentHash || downloadValidators.etag || (downloadValidators.lastModified ? crypto.createHash('sha1').update(downloadValidators.lastModified).digest('hex') : String(runAt));
    let inserted = 0;
    let updated = 0;
    let polygonsDeleted = 0;
    let deleteSkippedEmptyGuard = false;
    const loadedSourceIds = insertable.map((r) => r.source_id);

    await pipeline.withTransaction(pool, async (client) => {
      const allCols = ['source_id', 'geom', 'source_dataset_version', 'updated_at'];
      const insertBatch = pipeline.maxRowsPerInsert(allCols.length);
      for (let i = 0; i < insertable.length; i += insertBatch) {
        const slice = insertable.slice(i, i + insertBatch);
        const values = [];
        const placeholders = [];
        let idx = 1;
        for (const row of slice) {
          placeholders.push(`($${idx++}, ST_GeomFromWKB($${idx++}, 4326), $${idx++}, $${idx++})`);
          values.push(row.source_id, row.geom_wkb, datasetVersion, runAt);
        }
        const result = await client.query(
          `INSERT INTO ravines (source_id, geom, source_dataset_version, updated_at) VALUES ${placeholders.join(', ')}
           ON CONFLICT (source_id) DO UPDATE
             SET geom = EXCLUDED.geom, source_dataset_version = EXCLUDED.source_dataset_version, updated_at = EXCLUDED.updated_at
           WHERE ravines.geom IS DISTINCT FROM EXCLUDED.geom
              OR ravines.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version
           RETURNING (xmax = 0) AS is_insert`,
          values,
        );
        inserted += result.rows.filter((r) => r.is_insert).length;
        updated += result.rows.length - result.rows.filter((r) => r.is_insert).length;
      }

      // §3.8 Step 5 — F-C1 empty-set guard (L15, JS layer): suppress DELETE on empty set.
      if (shouldSkipDelete(loadedSourceIds)) {
        deleteSkippedEmptyGuard = true;
        pipeline.log.warn('[load-ravines]', 'F-C1 empty-set guard: DELETE suppressed');
      } else {
        const del = await client.query('DELETE FROM ravines WHERE source_id <> ALL($1::BIGINT[])', [loadedSourceIds]);
        polygonsDeleted = del.rowCount || 0;
      }
    });

    // §3.7 Step 4 — L7b geometry-update drift (non-first-run WARN).
    const geometryUpdatePct = computeGeometryUpdatePct(updated, priorFeatureCount);
    if (priorFeatureCount != null && geometryUpdatePct > config.ravineDriftGeometryUpdatePct) {
      push('ravine_geometry_update_pct', round3(geometryUpdatePct), 'WARN');
    } else {
      push('ravine_geometry_update_pct', round3(geometryUpdatePct), 'INFO');
    }

    // §3.8b Step 5b — L7c mass-deletion drift.
    const massDeletePct = computeMassDeletePct(polygonsDeleted, priorFeatureCount);
    let massDeleteCheckPassed = true;
    if (priorFeatureCount != null && massDeletePct > config.ravineMassDeletePct) {
      massDeleteCheckPassed = false;
      push('ravine_mass_delete_pct', round3(massDeletePct), 'FAIL'); // override never suppresses FAIL (L7c)
    } else {
      push('ravine_mass_delete_pct', round3(massDeletePct), 'INFO');
    }
    if (deleteSkippedEmptyGuard) push('ravine_delete_skipped_empty_guard', true, 'INFO');
    // (ravine_dataset_age_years already pushed once after the HEAD, covering all paths — Observability F1.)

    // §3.9 Step 6 — cache validators + frozen §9 records_meta.ravine_load block.
    const ravineLoad = {
      spec_version: SPEC_VERSION,
      source_dataset_version: datasetVersion,
      last_modified: downloadValidators.lastModified || null,
      etag: downloadValidators.etag || null,
      content_hash: contentHash,
      feature_count: featureCount,
      polygons_inserted: inserted,
      polygons_updated: updated,
      polygons_deleted: polygonsDeleted,
      delete_skipped_empty_guard: deleteSkippedEmptyGuard,
      mass_delete_pct: round3(massDeletePct),
      invalid_geometry_repaired: repaired,
      invalid_geometry_skipped: skipped,
      geometry_collection_extracted: collectionExtracted,
      drift_check_passed: driftCheckPassed,
      mass_delete_check_passed: massDeleteCheckPassed,
      geometry_update_pct: round3(geometryUpdatePct),
      skipped_reason: null,
    };

    pipeline.emitSummary({
      records_total: featureCount, // primary entity = ravine polygons (§11)
      records_new: inserted,
      records_updated: updated,
      records_meta: { audit_table: auditTable(auditRows), ravine_load: ravineLoad },
    });
    emitRavineMeta();
    // L7c: mass-delete >50% without RAVINE_ACCEPT_MASS_DELETE → run terminates as failed
    // (verdict already FAIL via the audit row; the §8d consumer also gates on
    // mass_delete_check_passed). The override lets an acknowledged full-reload complete.
    return (massDeleteCheckPassed || acceptMassDelete) ? { ok: true } : { failed: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

// ---------------------------------------------------------------------------
// Small emit helpers
// ---------------------------------------------------------------------------
function auditTable(rows) {
  return { phase: ADVISORY_LOCK_ID, name: 'Ravine + Natural Feature Protection', verdict: verdictCascade(rows), rows };
}

function skeletonLoadMeta() {
  return {
    spec_version: SPEC_VERSION, source_dataset_version: null, last_modified: null, etag: null, content_hash: null,
    feature_count: 0, polygons_inserted: 0, polygons_updated: 0, polygons_deleted: 0,
    delete_skipped_empty_guard: false, mass_delete_pct: 0, invalid_geometry_repaired: 0, invalid_geometry_skipped: 0,
    geometry_collection_extracted: 0, drift_check_passed: true, mass_delete_check_passed: true, geometry_update_pct: 0, skipped_reason: null,
  };
}

function emitRavineMeta() {
  pipeline.emitMeta(
    { [CKAN_INPUT_KEY]: [] }, // external CKAN resource — no columns listed
    { ravines: ['source_id', 'geom', 'source_dataset_version', 'created_at', 'updated_at'] },
    ['CKAN'],
  );
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

if (require.main === module) {
  pipeline.run('load-ravines', main);
}

module.exports = {
  VALIDATION_SQL,
  computeCountDeltaPct,
  computeGeometryUpdatePct,
  computeMassDeletePct,
  shouldSkipDelete,
  validatorCounterDelta,
  dedupeBySourceId,
  verdictCascade,
  ageDaysFrom,
  datasetAgeStatus,
  skipCheckDecision,
  coerceSourceId,
  locateShapefile,
};
