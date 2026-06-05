#!/usr/bin/env node
/**
 * Load Toronto Heritage properties — Heritage Register (Part IV/Part V points)
 * + Heritage Conservation Districts (polygons). Ontario Heritage Act Parts IV
 * (s.29) + V (s.41).
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8c)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_heritage step)
 *
 * Two CKAN zipped-shapefile datasets, each skip-checked + loaded INDEPENDENTLY
 * (DEC-K): one may skip (unchanged) while the other reloads. Per-dataset state
 * lands in records_meta.heritage_load.{heritage_register,heritage_districts};
 * the named audit rows + verdict are computed once in main() over both.
 *
 * Geometry validation uses inline §3.5 batched VALUES+UNNEST SQL (DEC-E) — NOT
 * scripts/lib/geometry-validator.js, which cannot emit the frozen skip counters.
 *
 * Usage: node scripts/load-heritage.js
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

const ADVISORY_LOCK_ID = 61; // DEC-A: lock = spec number (load-ravines=59, load-zoning=58); spec L4=62 stale
const SPEC_VERSION = '1.1'; // DEC-D: consumer (§8d L23) pins on '1.1'
// run-chain.js:253 records each step as `${chainId}:${slug}` → the stored pipeline
// name is the chain-scoped manifest slug, NOT the spec's 'source-heritage' (DEC-C;
// pre-empts the Spec 59 #409 cross-run-read bug).
const PIPELINE_NAME = 'sources:load_heritage';
const LICENSE_URL = 'https://open.toronto.ca/open-data-license/';

const REGISTER_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/e41da515-5ad1-4bc3-85ea-18ec9e55cd33/resource/108b1080-d048-439f-a9e8-e8d6cd81bddb/download/heritage_register_address_points_wgs84.zip';
const HCD_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/37a3c911-0813-4e87-90ed-3b9fa6156a63/resource/8e6b9347-63a8-4dac-91fb-a6491a8c1e5a/download/heritageconservationdistrict.zip';
const REGISTER_INPUT_KEY = 'ckan:heritage-register-wgs84';
const HCD_INPUT_KEY = 'ckan:heritage-conservation-districts';

const ConfigSchema = z.object({
  heritageSkipCheckThresholdYears: z.number().default(2), // L9
  heritageAcceptFeatureCountDriftPct: z.number().default(0.5), // L7
  heritageInvalidGeometryFailPct: z.number().default(0.05), // L8
  heritageMassDeletePct: z.number().default(0.5), // L7c
  heritageDriftGeometryUpdatePct: z.number().default(0.5), // L7b
  heritageDownloadTimeoutMs: z.number().default(60000),
});

// ── §3.5 validation SQL — one round-trip per dataset (L16, Spec 47 §B1). ──
// $1 = BIGINT[] source_ids, $2 = TEXT[] geojson (ord-aligned). Returns
// (source_id, status, geom_wkb, is_valid_original).

// Points (Heritage Register): accept ST_Point only.
const POINT_VALIDATION_SQL = `
WITH input AS (
  SELECT s.source_id, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_id, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord) ON s.ord = g.ord
)
SELECT source_id,
       CASE
         WHEN ST_GeometryType(geom) = 'ST_Point' AND NOT ST_IsEmpty(geom) THEN 'accepted'
         WHEN geom IS NULL OR ST_IsEmpty(geom)                            THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom) AS geom_wkb,
       true              AS is_valid_original
  FROM input;
`;

// Polygons (HCDs): accept Polygon/MultiPolygon, repair + ST_Multi (mirrors ravines §3.5).
const POLYGON_VALIDATION_SQL = `
WITH input AS (
  SELECT s.source_id, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_id, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord) ON s.ord = g.ord
),
validated AS (
  SELECT source_id,
         ST_GeometryType(repaired) AS repaired_type,
         ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,
         is_valid_original
    FROM (
      SELECT source_id, ST_IsValid(geom) AS is_valid_original, ST_MakeValid(geom) AS repaired
        FROM input
    ) s
)
SELECT source_id,
       CASE
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)
              AND repaired_type = 'ST_GeometryCollection'                 THEN 'collection_extracted'
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)                              THEN 'accepted'
         WHEN geom_final IS NULL OR ST_IsEmpty(geom_final)                THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom_final) AS geom_wkb,
       is_valid_original
  FROM validated;
`;

// ===========================================================================
// Pure helpers (exported for src/tests/load-heritage.logic.test.ts)
// ===========================================================================

/** L7: |loaded - prior| / prior. First run / missing prior → 0 (no drift). */
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

/** §3.5 status → counter deltas. Pure, unit-lockable. carry=insert this row. */
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

/** Dedupe parsed features by source_id (keep first) — guards ON CONFLICT "cannot affect row twice". */
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

/** 3-way row-derived verdict cascade (never a parallel boolean). Spec 47 §8.2 / 48 §3.6. */
function verdictCascade(rows) {
  if (rows.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (rows.some((r) => r.status === 'WARN')) return 'WARN';
  return 'PASS';
}

/** Days between now(ms) and an HTTP date / version string; null if unparseable. */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / 86400000);
}

/** L9 staleness: WARN if older than thresholdYears. */
function datasetAgeStatus(ageDays, thresholdYears) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdYears * 365.25 ? 'WARN' : 'INFO';
}

/**
 * L9 skip-check for ONE dataset. Skip iff a prior sub-block exists AND a cache
 * validator matches. No prior sub-block → cannot skip (DEC-K first-run guard).
 */
function skipCheckDecision({ lastModified, etag = null, contentHash = null, priorSub }) {
  if (!priorSub) return { skip: false, reason: 'no_prior_run' };
  if (!lastModified && !etag) return { skip: false, reason: 'no_validators' };
  if (lastModified && priorSub.last_modified && lastModified === priorSub.last_modified) return { skip: true, reason: 'unchanged_last_modified' };
  if (etag && priorSub.etag && etag === priorSub.etag) return { skip: true, reason: 'unchanged_etag' };
  if (contentHash && priorSub.content_hash && contentHash === priorSub.content_hash) return { skip: true, reason: 'unchanged_content_hash' };
  return { skip: false, reason: 'changed' };
}

/** Coerce OBJECTID/HCD_NO → positive integer source_id, else null (counted as skip). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

/** L2: DESIGNATED/HCD_DESDAT (Date or ISO string) → 'YYYY-MM-DD'; sentinel 1899-11-30 → NULL. */
function normalizeDesignatedDate(raw) {
  if (raw == null || raw === '') return null;
  let iso = null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    iso = raw.toISOString().slice(0, 10);
  } else {
    const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    iso = m[1];
  }
  return iso === '1899-11-30' ? null : iso;
}

/** DEC-M: coerce a source address to a non-null trimmed string; flag coerced-empty. */
function coerceAddress(raw) {
  if (raw == null) return { value: '', coerced: true };
  const s = String(raw).trim();
  return s === '' ? { value: '', coerced: true } : { value: s, coerced: false };
}

/** L25 + H-v1.1.2: case-insensitive STATUS → target status, or a filter/unknown signal. */
function classifyRegisterStatus(rawStatus) {
  const s = (rawStatus || '').toLowerCase().trim();
  if (s === 'listed') return { drop: 'filtered_listed' };
  if (s === 'part iv') return { status: 'part_iv' };
  if (s === 'part v') return { status: 'part_v_member' };
  return { drop: 'unknown_status' };
}

/** L25 + H-v1.1.2: case-insensitive HCD_TYPE → keep designated, or filter/unknown. */
function classifyHcdType(rawType) {
  const t = (rawType || '').toLowerCase().trim();
  if (t === 'under appeal' || t === 'under study') return { drop: 'filtered_appeal_study' };
  if (t === 'designated district') return { hcdType: 'designated_district' };
  return { drop: 'unknown_hcd_type' };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// ===========================================================================
// Acquisition (shared)
// ===========================================================================

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

/** Locate the single .shp (+ companion .dbf) in the extracted dir. */
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

// ===========================================================================
// Per-dataset parse + filter + attribute mapping
// ===========================================================================

/** Heritage Register → rows for heritage_properties; tallies L25 filter + unknown + coerced-empty. */
async function parseRegister(shpPath, dbfPath) {
  const source = await shapefile.open(shpPath, dbfPath);
  const rows = [];
  let badSourceId = 0;
  let nullGeometry = 0;
  let filteredListed = 0;
  let unknownStatus = 0;
  let coercedEmptyAddress = 0;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const p = r.value.properties || {};
    const cls = classifyRegisterStatus(p.STATUS);
    if (cls.drop === 'filtered_listed') { filteredListed++; continue; }
    if (cls.drop === 'unknown_status') { unknownStatus++; continue; }
    // #426: the Q2 2026 CKAN refresh dropped OBJECTID; Folder_Row is the new stable unique
    // key (verified unique across all features). A future rename → coerceSourceId null →
    // bad_source_id WARN + the assert_data_bounds >=8000 floor (loud, not silent).
    const sourceId = coerceSourceId(p.Folder_Row);
    if (sourceId == null) { badSourceId++; continue; }
    if (r.value.geometry == null) { nullGeometry++; continue; }
    const addr = coerceAddress(p.ADDRESS);
    if (addr.coerced) coercedEmptyAddress++;
    rows.push({
      source_id: sourceId,
      geojson: JSON.stringify(r.value.geometry),
      status: cls.status,
      designated_date: normalizeDesignatedDate(p.DESIGNATED),
      bylaw_no: p.BYLAW_NO != null ? String(p.BYLAW_NO) : null,
      htg_conser_name: p.HTG_CONSER != null ? String(p.HTG_CONSER) : null,
      building_type: p.BUILDING_T != null ? String(p.BUILDING_T) : null,
      reason: p.REASON != null ? String(p.REASON) : null,
      address_text: addr.value,
      construction_year: safeParseIntOrNull(p.CONSTRUCTI),
    });
  }
  return { rows, badSourceId, nullGeometry, filteredOut: filteredListed, unknownType: unknownStatus, coercedEmptyAddress };
}

/** HCDs → rows for heritage_districts; tallies L25 filter + unknown. */
async function parseHcd(shpPath, dbfPath) {
  const source = await shapefile.open(shpPath, dbfPath);
  const rows = [];
  let badSourceId = 0;
  let nullGeometry = 0;
  let filteredAppealStudy = 0;
  let unknownHcdType = 0;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const p = r.value.properties || {};
    const cls = classifyHcdType(p.HCD_TYPE);
    if (cls.drop === 'filtered_appeal_study') { filteredAppealStudy++; continue; }
    if (cls.drop === 'unknown_hcd_type') { unknownHcdType++; continue; }
    const sourceId = coerceSourceId(p.HCD_NO);
    if (sourceId == null) { badSourceId++; continue; }
    if (r.value.geometry == null) { nullGeometry++; continue; }
    rows.push({
      source_id: sourceId,
      geojson: JSON.stringify(r.value.geometry),
      name: p.HCD_NAME != null ? String(p.HCD_NAME) : '',
      hcd_type: cls.hcdType,
      designated_date: normalizeDesignatedDate(p.HCD_DESDAT),
      bylaw_no: p.HCD_BYLAWN != null ? String(p.HCD_BYLAWN) : null,
      wards: p.HCD_WARDS != null ? String(p.HCD_WARDS) : null,
    });
  }
  return { rows, badSourceId, nullGeometry, filteredOut: filteredAppealStudy, unknownType: unknownHcdType, coercedEmptyAddress: 0 };
}

// ===========================================================================
// Per-dataset upserts
// ===========================================================================

async function upsertRegister(client, insertable, datasetVersion, runAt) {
  const cols = ['source_id', 'status', 'geom', 'designated_date', 'bylaw_no', 'htg_conser_name', 'building_type', 'reason', 'address_text', 'construction_year', 'source_dataset_version', 'updated_at'];
  const batch = pipeline.maxRowsPerInsert(cols.length);
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < insertable.length; i += batch) {
    const slice = insertable.slice(i, i + batch);
    const ph = [];
    const vals = [];
    let idx = 1;
    for (const row of slice) {
      ph.push(`($${idx++}, $${idx++}, ST_GeomFromWKB($${idx++}, 4326), $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      vals.push(row.source_id, row.status, row.geom_wkb, row.designated_date, row.bylaw_no, row.htg_conser_name, row.building_type, row.reason, row.address_text, row.construction_year, datasetVersion, runAt);
    }
    const result = await client.query(
      `INSERT INTO heritage_properties (source_id, status, geom, designated_date, bylaw_no, htg_conser_name, building_type, reason, address_text, construction_year, source_dataset_version, updated_at)
       VALUES ${ph.join(', ')}
       ON CONFLICT (source_id) DO UPDATE SET
         status = EXCLUDED.status, geom = EXCLUDED.geom, designated_date = EXCLUDED.designated_date,
         bylaw_no = EXCLUDED.bylaw_no, htg_conser_name = EXCLUDED.htg_conser_name, building_type = EXCLUDED.building_type,
         reason = EXCLUDED.reason, address_text = EXCLUDED.address_text, construction_year = EXCLUDED.construction_year,
         source_dataset_version = EXCLUDED.source_dataset_version, updated_at = EXCLUDED.updated_at
       WHERE heritage_properties.geom            IS DISTINCT FROM EXCLUDED.geom
          OR heritage_properties.status          IS DISTINCT FROM EXCLUDED.status
          OR heritage_properties.designated_date IS DISTINCT FROM EXCLUDED.designated_date
          OR heritage_properties.address_text    IS DISTINCT FROM EXCLUDED.address_text
          OR heritage_properties.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version
       RETURNING (xmax = 0) AS is_insert`,
      vals,
    );
    inserted += result.rows.filter((r) => r.is_insert).length;
    updated += result.rows.length - result.rows.filter((r) => r.is_insert).length;
  }
  return { inserted, updated };
}

async function upsertHcd(client, insertable, datasetVersion, runAt) {
  const cols = ['source_id', 'name', 'hcd_type', 'geom', 'designated_date', 'bylaw_no', 'wards', 'source_dataset_version', 'updated_at'];
  const batch = pipeline.maxRowsPerInsert(cols.length);
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < insertable.length; i += batch) {
    const slice = insertable.slice(i, i + batch);
    const ph = [];
    const vals = [];
    let idx = 1;
    for (const row of slice) {
      ph.push(`($${idx++}, $${idx++}, $${idx++}, ST_GeomFromWKB($${idx++}, 4326), $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      vals.push(row.source_id, row.name, row.hcd_type, row.geom_wkb, row.designated_date, row.bylaw_no, row.wards, datasetVersion, runAt);
    }
    const result = await client.query(
      `INSERT INTO heritage_districts (source_id, name, hcd_type, geom, designated_date, bylaw_no, wards, source_dataset_version, updated_at)
       VALUES ${ph.join(', ')}
       ON CONFLICT (source_id) DO UPDATE SET
         name = EXCLUDED.name, hcd_type = EXCLUDED.hcd_type, geom = EXCLUDED.geom,
         designated_date = EXCLUDED.designated_date, bylaw_no = EXCLUDED.bylaw_no, wards = EXCLUDED.wards,
         source_dataset_version = EXCLUDED.source_dataset_version, updated_at = EXCLUDED.updated_at
       WHERE heritage_districts.geom            IS DISTINCT FROM EXCLUDED.geom
          OR heritage_districts.name            IS DISTINCT FROM EXCLUDED.name
          OR heritage_districts.designated_date IS DISTINCT FROM EXCLUDED.designated_date
          OR heritage_districts.source_dataset_version IS DISTINCT FROM EXCLUDED.source_dataset_version
       RETURNING (xmax = 0) AS is_insert`,
      vals,
    );
    inserted += result.rows.filter((r) => r.is_insert).length;
    updated += result.rows.length - result.rows.filter((r) => r.is_insert).length;
  }
  return { inserted, updated };
}

// ===========================================================================
// Generic per-dataset load orchestration (DEC-K independent)
// ===========================================================================

/**
 * Load one dataset end-to-end (skip-check → download → parse → drift → validate
 * → upsert → delete). Pushes NO audit rows (main() owns the named rows); returns
 * the per-dataset sub-block + counters so main() derives the verdict.
 */
async function loadDataset(pool, ds, config, priorSub, runAt, nowMs) {
  const acceptDrift = process.env.HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT === '1';
  const acceptMassDelete = process.env.HERITAGE_ACCEPT_MASS_DELETE === '1';
  const priorFeatureCount = priorSub ? safeParseIntOrNull(priorSub.feature_count) : null;

  // §3.2 Step 0a — HEAD skip-check.
  let headInfo;
  try {
    headInfo = await headValidators(ds.url, config.heritageDownloadTimeoutMs);
  } catch (err) {
    return { outcome: 'failed', failReason: `head:${err.message}`, sub: skeletonSub(), ageDays: null };
  }
  const ageDays = ageDaysFrom(nowMs, headInfo.lastModified || (priorSub && priorSub.last_modified));
  const skip = skipCheckDecision({ lastModified: headInfo.lastModified, etag: headInfo.etag, priorSub });
  if (skip.skip) {
    // DEC-K: carry prior feature_count + validators + drift_check_passed; zero the deltas.
    return {
      outcome: 'skipped', skipReason: skip.reason, ageDays,
      // spec_version pinned to current AFTER the prior spread so a future version bump can't
      // emit a stale per-dataset version on a SKIP run (load-ravines BUG-2 precedent). DEC-K:
      // drift_check_passed is carried from priorSub (never reset to false).
      sub: { ...skeletonSub(), ...(priorSub || {}), spec_version: SPEC_VERSION, features_inserted: 0, features_updated: 0, features_deleted: 0, skipped_reason: skip.reason },
    };
  }

  // §3.3 Step 0b — download + unzip + parse (temp dir always cleaned up).
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `heritage-${ds.key}-`));
  let parsed;
  let contentHash = null;
  let validators = {};
  try {
    const dl = await downloadZip(ds.url, path.join(tmpRoot, 'src.zip'), config.heritageDownloadTimeoutMs);
    contentHash = dl.contentHash;
    validators = { lastModified: dl.lastModified || headInfo.lastModified, etag: dl.etag || headInfo.etag };
    const extractDir = path.join(tmpRoot, 'ext');
    await extractZip(dl.zipPath, extractDir);
    const { shpPath, dbfPath } = locateShapefile(extractDir);
    parsed = await ds.parse(shpPath, dbfPath);
  } catch (err) {
    return { outcome: 'failed', failReason: `acquire:${err.message}`, sub: skeletonSub(), ageDays };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  const { kept, duplicateCount } = dedupeBySourceId(parsed.rows);
  const featureCount = kept.length;
  const datasetVersion = contentHash || validators.etag || (validators.lastModified ? crypto.createHash('sha1').update(validators.lastModified).digest('hex') : String(runAt));

  // L14: zero-feature FIRST run → FAIL (corrupt/empty source); zero-feature subsequent run is
  // handled by the F-C1 empty-set DELETE guard below (preserves the prior table, WARN).
  if (!priorSub && featureCount === 0) {
    return {
      outcome: 'failed', failReason: 'zero_features_first_run', ageDays, duplicateCount,
      sub: { ...skeletonSub(), ...validatorsToSub(validators, contentHash, datasetVersion), feature_count: 0, drift_check_passed: false },
      featureCount: 0, filteredOut: parsed.filteredOut, unknownType: parsed.unknownType, coercedEmptyAddress: parsed.coercedEmptyAddress,
    };
  }

  // §3.4 Step 1 — L7 feature-count drift. FAIL never suppressed by override (L7); override only lets the write proceed.
  const countDriftPct = computeCountDeltaPct(featureCount, priorFeatureCount);
  const driftBreached = countDriftPct > config.heritageAcceptFeatureCountDriftPct;
  const driftCheckPassed = !driftBreached;
  if (driftBreached && !acceptDrift) {
    return {
      outcome: 'failed', failReason: `count_drift ${round3(countDriftPct)}`, ageDays, countDriftPct, duplicateCount,
      sub: { ...skeletonSub(), ...validatorsToSub(validators, contentHash, datasetVersion), feature_count: featureCount, drift_check_passed: false },
      featureCount, filteredOut: parsed.filteredOut, unknownType: parsed.unknownType, coercedEmptyAddress: parsed.coercedEmptyAddress,
    };
  }

  // §3.5 Step 2 — batched geometry validation (before withTransaction; L16/L8).
  const sourceIds = kept.map((f) => f.source_id);
  const geojsons = kept.map((f) => f.geojson);
  const { rows: vrows } = await pool.query(ds.validationSql, [sourceIds, geojsons]);
  const byId = new Map(vrows.map((r) => [Number(r.source_id), r]));
  let repaired = 0;
  let collectionExtracted = 0;
  let skipped = 0;
  const insertable = [];
  for (const f of kept) {
    const v = byId.get(f.source_id);
    if (!v) { skipped++; continue; }
    const d = validatorCounterDelta(v.status, v.is_valid_original);
    repaired += d.repaired;
    collectionExtracted += d.collectionExtracted;
    skipped += d.skipped;
    if (d.carry) insertable.push({ ...f, geom_wkb: v.geom_wkb });
  }
  const skippedPct = featureCount > 0 ? skipped / featureCount : 0;
  // L8: >5% skipped → FAIL + abort BEFORE transaction (no dangling state).
  if (skippedPct > config.heritageInvalidGeometryFailPct) {
    return {
      outcome: 'failed', failReason: `geometry_skipped ${round3(skippedPct)}`, ageDays, countDriftPct, skippedPct, invalidSkipped: skipped, duplicateCount,
      sub: { ...skeletonSub(), ...validatorsToSub(validators, contentHash, datasetVersion), feature_count: featureCount, invalid_geometry_skipped: skipped, drift_check_passed: driftCheckPassed },
      featureCount, filteredOut: parsed.filteredOut, unknownType: parsed.unknownType, coercedEmptyAddress: parsed.coercedEmptyAddress,
    };
  }

  // §3.6/§3.7/§3.8 — upsert + F-C1-guarded orphan delete, one txn.
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let deleteSkippedEmptyGuard = false;
  const loadedSourceIds = insertable.map((r) => r.source_id);
  await pipeline.withTransaction(pool, async (client) => {
    const up = await ds.upsert(client, insertable, datasetVersion, runAt);
    inserted = up.inserted;
    updated = up.updated;
    if (shouldSkipDelete(loadedSourceIds)) {
      deleteSkippedEmptyGuard = true;
      pipeline.log.warn('[load-heritage]', `${ds.key}: F-C1 empty-set guard — DELETE suppressed`);
    } else {
      const del = await client.query(`DELETE FROM ${ds.table} WHERE source_id <> ALL($1::BIGINT[])`, [loadedSourceIds]);
      deleted = del.rowCount || 0;
    }
  });

  const geometryUpdatePct = computeGeometryUpdatePct(updated, priorFeatureCount);
  const massDeletePct = computeMassDeletePct(deleted, priorFeatureCount);
  const massDeleteBreached = priorFeatureCount != null && massDeletePct > config.heritageMassDeletePct;
  const massDeleteCheckPassed = !massDeleteBreached;

  return {
    outcome: (massDeleteBreached && !acceptMassDelete) ? 'failed' : 'ok',
    failReason: massDeleteBreached ? `mass_delete ${round3(massDeletePct)}` : null,
    ageDays, countDriftPct, geometryUpdatePct, massDeletePct, skippedPct, invalidSkipped: skipped,
    featureCount, inserted, updated, deleted, duplicateCount,
    filteredOut: parsed.filteredOut, unknownType: parsed.unknownType, coercedEmptyAddress: parsed.coercedEmptyAddress,
    badSourceId: parsed.badSourceId,
    sub: {
      spec_version: SPEC_VERSION,
      source_dataset_version: datasetVersion,
      last_modified: validators.lastModified || null,
      etag: validators.etag || null,
      content_hash: contentHash,
      feature_count: featureCount,
      filtered_out: parsed.filteredOut,
      unknown_count: parsed.unknownType,
      features_inserted: inserted,
      features_updated: updated,
      features_deleted: deleted,
      invalid_geometry_repaired: repaired,
      invalid_geometry_skipped: skipped,
      geometry_collection_extracted: collectionExtracted,
      drift_check_passed: driftCheckPassed,
      mass_delete_check_passed: massDeleteCheckPassed,
      geometry_update_pct: round3(geometryUpdatePct),
      delete_skipped_empty_guard: deleteSkippedEmptyGuard,
      skipped_reason: null,
    },
  };
}

function skeletonSub() {
  return {
    spec_version: SPEC_VERSION, source_dataset_version: null, last_modified: null, etag: null, content_hash: null,
    feature_count: 0, filtered_out: 0, unknown_count: 0, features_inserted: 0, features_updated: 0, features_deleted: 0,
    invalid_geometry_repaired: 0, invalid_geometry_skipped: 0, geometry_collection_extracted: 0,
    drift_check_passed: true, mass_delete_check_passed: true, geometry_update_pct: 0, delete_skipped_empty_guard: false, skipped_reason: null,
  };
}

// Rename the internal generic counters to the §9 frozen per-dataset field names at the
// emit boundary (review fold: the §8d consumer + frozen contract read these by name).
function specSub(sub, filteredKey, unknownKey) {
  const { filtered_out, unknown_count, ...rest } = sub;
  return { ...rest, [filteredKey]: filtered_out, [unknownKey]: unknown_count };
}

function validatorsToSub(validators, contentHash, datasetVersion) {
  return { source_dataset_version: datasetVersion, last_modified: validators.lastModified || null, etag: validators.etag || null, content_hash: contentHash };
}

// ===========================================================================
// Main
// ===========================================================================
async function main(pool) {
  const { logicVars } = await loadMarketplaceConfigs(pool, 'source-heritage');
  const config = ConfigSchema.parse(logicVars || {});

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const runAt = await pipeline.getDbTimestamp(pool);
    const nowMs = runAt.getTime();
    const auditRows = [];
    const push = (metric, value, status) => auditRows.push({ metric, value, status });
    push('dataset_source_license', LICENSE_URL, 'INFO');

    const acceptDrift = process.env.HERITAGE_ACCEPT_FEATURE_COUNT_DRIFT === '1';
    const acceptMassDelete = process.env.HERITAGE_ACCEPT_MASS_DELETE === '1';
    if (acceptDrift) push('heritage_override_feature_count_drift_present', true, 'WARN');
    if (acceptMassDelete) push('heritage_override_mass_delete_present', true, 'WARN');

    // Prior run (chain-scoped name; per-dataset sub-blocks under heritage_load).
    const prior = await pool
      .query(`SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [PIPELINE_NAME])
      .then((r) => (r.rows[0] ? r.rows[0].records_meta : null))
      .catch((err) => {
        pipeline.log.warn('[load-heritage]', `prior-run query failed (treating as no baseline): ${err.message}`);
        return null;
      });
    const priorLoad = prior && prior.heritage_load ? prior.heritage_load : null;

    const DATASETS = {
      heritage_register: { key: 'heritage_register', url: REGISTER_URL, table: 'heritage_properties', parse: parseRegister, validationSql: POINT_VALIDATION_SQL, upsert: upsertRegister },
      heritage_districts: { key: 'heritage_districts', url: HCD_URL, table: 'heritage_districts', parse: parseHcd, validationSql: POLYGON_VALIDATION_SQL, upsert: upsertHcd },
    };

    const reg = await loadDataset(pool, DATASETS.heritage_register, config, priorLoad ? priorLoad.heritage_register : null, runAt, nowMs);
    const hcd = await loadDataset(pool, DATASETS.heritage_districts, config, priorLoad ? priorLoad.heritage_districts : null, runAt, nowMs);

    // ── Named audit rows (DEC-I): computed over BOTH datasets. ──
    push('heritage_register_feature_count', reg.sub.feature_count, 'INFO');
    push('heritage_districts_feature_count', hcd.sub.feature_count, 'INFO');

    // filtered-listed % (Register raw = kept + filtered_out + unknown).
    const regRaw = reg.sub.feature_count + (reg.filteredOut || 0) + (reg.unknownType || 0);
    push('heritage_filtered_listed_pct', regRaw > 0 ? round3((reg.filteredOut || 0) / regRaw) : 0, 'INFO');

    // geometry-skipped %: worst of the two; FAIL > L8 threshold.
    const skippedPct = Math.max(reg.skippedPct || 0, hcd.skippedPct || 0);
    push('heritage_geometry_skipped_pct', round3(skippedPct), skippedPct > config.heritageInvalidGeometryFailPct ? 'FAIL' : 'INFO');

    // count-drift %: worst; FAIL > L7 (override never suppresses).
    const countDriftPct = Math.max(reg.countDriftPct || 0, hcd.countDriftPct || 0);
    push('heritage_count_drift_pct', round3(countDriftPct), countDriftPct > config.heritageAcceptFeatureCountDriftPct ? 'FAIL' : 'INFO');

    // mass-delete %: worst; FAIL > L7c.
    const massDeletePct = Math.max(reg.massDeletePct || 0, hcd.massDeletePct || 0);
    push('heritage_mass_delete_pct', round3(massDeletePct), massDeletePct > config.heritageMassDeletePct ? 'FAIL' : 'INFO');

    // geometry-update %: worst; WARN > L7b.
    const geometryUpdatePct = Math.max(reg.geometryUpdatePct || 0, hcd.geometryUpdatePct || 0);
    push('heritage_geometry_update_pct', round3(geometryUpdatePct), geometryUpdatePct > config.heritageDriftGeometryUpdatePct ? 'WARN' : 'INFO');

    // dataset age: max of the two; WARN > 2yr (L9).
    const maxAgeDays = Math.max(reg.ageDays == null ? -1 : reg.ageDays, hcd.ageDays == null ? -1 : hcd.ageDays);
    push('heritage_dataset_age_years', maxAgeDays < 0 ? null : Math.floor(maxAgeDays / 365.25), datasetAgeStatus(maxAgeDays < 0 ? null : maxAgeDays, config.heritageSkipCheckThresholdYears));

    // unknown enum counts → WARN when > 0 (DEC-I; must reach rows[] for the cascade).
    push('heritage_unknown_status_count', reg.unknownType || 0, (reg.unknownType || 0) > 0 ? 'WARN' : 'INFO');
    push('heritage_unknown_hcd_type_count', hcd.unknownType || 0, (hcd.unknownType || 0) > 0 ? 'WARN' : 'INFO');

    // address coerced-empty (DEC-M) → WARN when > 0.
    push('heritage_address_coerced_empty_count', reg.coercedEmptyAddress || 0, (reg.coercedEmptyAddress || 0) > 0 ? 'WARN' : 'INFO');

    // per-dataset bad-source-id + duplicate-source-id WARNs (CKAN OBJECTID/HCD_NO drift signal).
    if (reg.badSourceId > 0) push('heritage_register_bad_source_id_count', reg.badSourceId, 'WARN');
    if (hcd.badSourceId > 0) push('heritage_districts_bad_source_id_count', hcd.badSourceId, 'WARN');
    if ((reg.duplicateCount || 0) > 0) push('heritage_register_duplicate_source_id_count', reg.duplicateCount, 'WARN');
    if ((hcd.duplicateCount || 0) > 0) push('heritage_districts_duplicate_source_id_count', hcd.duplicateCount, 'WARN');

    // per-dataset acquisition / abort failures → FAIL.
    if (reg.outcome === 'failed') push('heritage_register_load_failed', reg.failReason, 'FAIL');
    if (hcd.outcome === 'failed') push('heritage_districts_load_failed', hcd.failReason, 'FAIL');
    if (reg.outcome === 'skipped') push('heritage_register_load_skipped', reg.skipReason, 'INFO');
    if (hcd.outcome === 'skipped') push('heritage_districts_load_skipped', hcd.skipReason, 'INFO');

    const featureCountCombined = reg.sub.feature_count + hcd.sub.feature_count;
    const insertedCombined = (reg.sub.features_inserted || 0) + (hcd.sub.features_inserted || 0);
    const updatedCombined = (reg.sub.features_updated || 0) + (hcd.sub.features_updated || 0);

    pipeline.emitSummary({
      records_total: featureCountCombined, // primary entity = heritage features (§11)
      records_new: insertedCombined,
      records_updated: updatedCombined,
      records_meta: {
        audit_table: { phase: ADVISORY_LOCK_ID, name: 'Heritage Properties', verdict: verdictCascade(auditRows), rows: auditRows },
        heritage_load: {
          spec_version: SPEC_VERSION,
          heritage_register: specSub(reg.sub, 'filtered_out_listed', 'unknown_status_count'),
          heritage_districts: specSub(hcd.sub, 'filtered_out_appeal_study', 'unknown_hcd_type_count'),
          geometry_update_pct: round3(geometryUpdatePct),
          mass_delete_pct: round3(massDeletePct),
        },
      },
    });
    emitHeritageMeta();

    return (reg.outcome !== 'failed' && hcd.outcome !== 'failed') ? { ok: true } : { failed: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

function emitHeritageMeta() {
  pipeline.emitMeta(
    { [REGISTER_INPUT_KEY]: [], [HCD_INPUT_KEY]: [] },
    {
      heritage_properties: ['source_id', 'status', 'geom', 'designated_date', 'bylaw_no', 'htg_conser_name', 'building_type', 'reason', 'address_text', 'construction_year', 'source_dataset_version', 'created_at', 'updated_at'],
      heritage_districts: ['source_id', 'name', 'hcd_type', 'geom', 'designated_date', 'bylaw_no', 'wards', 'source_dataset_version', 'created_at', 'updated_at'],
    },
    ['CKAN'],
  );
}

if (require.main === module) {
  pipeline.run('load-heritage', main);
}

module.exports = {
  POINT_VALIDATION_SQL,
  POLYGON_VALIDATION_SQL,
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
  normalizeDesignatedDate,
  coerceAddress,
  classifyRegisterStatus,
  classifyHcdType,
  locateShapefile,
};
