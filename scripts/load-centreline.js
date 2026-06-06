#!/usr/bin/env node
/**
 * Load Toronto Centreline (TCL) street-network LineStrings.
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md (v1.1 §8c)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_centreline step)
 *
 * Acquisition mirrors load-ravines.js: download the CKAN zipped shapefile
 * (datastore_active=false), unzip via node-stream-zip, parse with `shapefile`.
 *
 * Producer contract frozen at spec §9 (records_meta.centreline_load + emitMeta).
 * Geometry validation uses an inline batched VALUES+UNNEST SQL (L16/§B1) — NOT
 * scripts/lib/geometry-validator.js, which cannot emit the invalid_geometry_skipped
 * counter the §9 contract freezes (matches the load-ravines DEC-B precedent).
 * Write path is L26 staging-table full-replace (47K rows ≫ single-batch param limit).
 *
 * Implementation note: spec L15/§3.8 prescribes pipeline.recordAuditRow+throw for guards,
 * but the proven load-ravines/heritage precedent emits one PIPELINE_SUMMARY per path
 * (success OR each failure branch) + returns a status object. We follow the precedent;
 * the L15 recordAuditRow text is routed to review_followups.md.
 *
 * Usage: node scripts/load-centreline.js
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

const ADVISORY_LOCK_ID = 63; // L4 re-derived: spec's 65 collides with enrich-parcels (live LOCK_ID_REGISTRY); 63 free.
const SPEC_VERSION = '1.1'; // L10 (re-baselined; spec §3.1 code block's '1.0' is stale → followup)
// run-chain.js records each step as `${chainId}:${slug}` → stored pipeline name is the
// chain-scoped slug, NOT 'source-centreline' (spec §9 read-name froze the wrong string → followup).
const PIPELINE_NAME = 'sources:load_centreline';
const MARKETPLACE_KEY = 'source-centreline'; // loadMarketplaceConfigs key (spec §3.1 skeleton)
const LICENSE_URL = 'https://open.toronto.ca/open-data-license/';
const CKAN_DOWNLOAD_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/d86bdca4-ab2c-470d-80fb-34647ea0e87f/download/centreline-version-2-4326.zip';
const CKAN_INPUT_KEY = 'ckan:toronto-centreline-tcl-shp';

const ConfigSchema = z.object({
  centrelineSkipCheckThresholdDays: z.number().default(7), // L9
  centrelineAcceptFeatureCountDriftPct: z.number().default(0.5), // L7
  centrelineInvalidGeometryFailPct: z.number().default(0.05), // L8
  centrelineMinFeatureCount: z.number().default(40000), // L21 (assert-data-bounds uses a hardcoded floor; this is the loader's own reference)
  centrelineDownloadTimeoutMs: z.number().default(120000), // 117 MB zip — larger timeout than ravines
});

// F-S9 (Spec 47 §4.2): safeParse wrapper, not raw .parse().
function validateConfig(logicVars) {
  const result = ConfigSchema.safeParse(logicVars || {});
  if (!result.success) {
    throw new Error(`[load-centreline] config validation failed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return result.data;
}

// ===========================================================================
// L25 feature-type + jurisdiction filter sets (all lowercase; values normalized
// via .trim().toLowerCase() before membership — F-S10 + F14 CKAN-whitespace hardening).
// ===========================================================================
const STREET_CLASS_INCLUDE = new Set([
  'local', 'collector', 'major arterial', 'minor arterial',
  'laneway', 'expressway', 'expressway ramp',
  'major arterial ramp', 'collector ramp', 'other ramp',
  'access road', 'busway',
]);
const STREET_CLASS_EXCLUDE = new Set([
  'trail', 'river', 'hydro line', 'major railway', 'minor railway',
  'walkway', 'major shoreline', 'minor shoreline (land locked)',
  'creek/tributary', 'ferry route', 'geostatistical line',
  'pending', 'other',
]);
const UNKNOWN_FEATURE_SENTINEL = 'unknown_operator_review';

// DBF attribute field names (10-char truncated; per Phase 0 fields.csv mapping, Q0.6).
// validateShapefileColumns asserts these exist post-parse (F13 — the #426 CKAN-rename lesson).
const DBF = {
  centreline_id: 'CENTREL2',
  linear_name_full: 'LINEAR_4',
  linear_name: 'LINEAR_26',
  linear_name_type: 'LINEAR_27',
  linear_name_dir: 'LINEAR_28',
  feature_code_desc: 'FEATURE36',
  jurisdiction: 'JURISDI37',
  from_intersection_id: 'FROM_IN31',
  to_intersection_id: 'TO_INTE32',
  lo_num_l: 'LO_NUM_10',
  hi_num_l: 'HI_NUM_11',
  lo_num_r: 'LO_NUM_12',
  hi_num_r: 'HI_NUM_13',
  parity_l: 'PARITY_8',
  parity_r: 'PARITY_9',
  oneway_dir_code_desc: 'ONEWAY_34',
};
// Fields whose absence breaks ingest (geometry + key/classification/topology fields).
const REQUIRED_DBF_FIELDS = [
  DBF.centreline_id, DBF.feature_code_desc, DBF.jurisdiction,
  DBF.linear_name, DBF.linear_name_full,
  DBF.from_intersection_id, DBF.to_intersection_id,
  DBF.lo_num_l, DBF.hi_num_l, DBF.lo_num_r, DBF.hi_num_r, DBF.parity_l, DBF.parity_r,
];

// Inline LineString geometry validation (L16/§B1). $1 = BIGINT[] source_ids, $2 = TEXT[] geojson.
// LineString uniform per Phase 0 (no ST_Multi). ST_MakeValid on a malformed line may yield a
// non-LineString → skipped_unsupported_type (the GEOMETRY(LineString) column rejects it anyway).
const VALIDATION_SQL = `
WITH input AS (
  SELECT s.source_id, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_id, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord) ON s.ord = g.ord
),
validated AS (
  SELECT source_id, ST_MakeValid(geom) AS repaired, ST_IsValid(geom) AS is_valid_original
    FROM input
)
SELECT source_id,
       CASE
         WHEN ST_GeometryType(repaired) = 'ST_LineString' AND NOT ST_IsEmpty(repaired) THEN 'accepted'
         WHEN repaired IS NULL OR ST_IsEmpty(repaired)                                  THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(repaired) AS geom_wkb,
       is_valid_original
  FROM validated;
`;

// ===========================================================================
// Pure helpers (exported for src/tests/load-centreline.logic.test.ts)
// ===========================================================================

/** Coerce CENTRELINE_ID → positive integer source_id, else null (counted as skip). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

/** Coerce an intersection node id → BIGINT or null (NULL is valid per schema). */
function coerceNodeId(raw) {
  const n = safeParseIntOrNull(raw);
  return n == null ? null : n;
}

/** Normalize a CKAN string field for Set membership: trim + lowercase (F14). */
function normCode(raw) {
  return (raw == null ? '' : String(raw)).trim().toLowerCase();
}

/**
 * L25 classification of a single feature's FEATURE_CODE_DESC + JURISDICTION.
 * Returns { drop, featureCodeDesc, jurisdiction, unknownFeature, unknownJurisdiction }.
 * drop=true → excluded (non-street or FEDERAL). Otherwise featureCodeDesc is the raw value
 * (or the sentinel for unknowns) and jurisdiction is the raw value (or 'UNKNOWN').
 */
function classifyFeature(rawFeatureCode, rawJurisdiction) {
  const fc = normCode(rawFeatureCode);
  const ju = normCode(rawJurisdiction);

  if (STREET_CLASS_EXCLUDE.has(fc)) return { drop: true, reason: 'non_street' };
  if (ju === 'federal') return { drop: true, reason: 'federal' };

  let unknownFeature = false;
  let featureCodeDesc;
  if (STREET_CLASS_INCLUDE.has(fc)) {
    featureCodeDesc = rawFeatureCode == null ? '' : String(rawFeatureCode).trim();
  } else {
    featureCodeDesc = UNKNOWN_FEATURE_SENTINEL; // unknown → sentinel + WARN
    unknownFeature = true;
  }

  const unknownJurisdiction = ju === 'unknown' || ju === '';
  const jurisdiction = rawJurisdiction == null || String(rawJurisdiction).trim() === ''
    ? 'UNKNOWN'
    : String(rawJurisdiction).trim();

  return { drop: false, featureCodeDesc, jurisdiction, unknownFeature, unknownJurisdiction };
}

/** F13: assert the expected DBF attribute fields are present on the parsed feature props. */
function validateShapefileColumns(props) {
  if (!props || typeof props !== 'object') {
    throw new Error('[load-centreline] shapefile produced no feature properties — cannot validate columns');
  }
  const missing = REQUIRED_DBF_FIELDS.filter((f) => !(f in props));
  if (missing.length > 0) {
    throw new Error(
      `[load-centreline] shapefile missing expected attribute field(s): ${missing.join(', ')}. ` +
      `CKAN may have renamed columns (cf. #426 Heritage OBJECTID drop) — update the DBF map in load-centreline.js.`,
    );
  }
}

/** L7 count-delta. First run / missing prior → 0 (no drift). */
function computeCountDeltaPct(loaded, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return Math.abs(loaded - prior) / prior;
}

/** Dedupe parsed features by source_id (keep first); UNIQUE(source_id) duplicate-detection guard. */
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

/** §3.5 status → counter delta. */
function validatorCounterDelta(status) {
  return status === 'accepted' ? { skipped: 0, carry: true } : { skipped: 1, carry: false };
}

/** 3-way row-derived verdict cascade. Spec 47 §8.2. */
function verdictCascade(rows) {
  if (rows.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (rows.some((r) => r.status === 'WARN')) return 'WARN';
  return 'PASS';
}

/** Days between now(ms) and an HTTP date; null if unparseable. */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / 86400000);
}

/** L9 staleness: WARN if older than thresholdDays (daily-publish cadence). */
function datasetAgeStatus(ageDays, thresholdDays) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdDays ? 'WARN' : 'INFO';
}

/** L9 skip-check. Skip iff a prior version exists AND a cache validator matches. */
function skipCheckDecision({ lastModified, etag = null, contentHash = null, prior }) {
  const pm = prior && prior.centreline_load ? prior.centreline_load : null;
  if (!pm) return { skip: false, reason: 'no_prior_run' };
  if (!lastModified && !etag && !contentHash) return { skip: false, reason: 'no_validators' };
  if (lastModified && pm.last_modified && lastModified === pm.last_modified) return { skip: true, reason: 'unchanged_last_modified' };
  if (etag && pm.etag && etag === pm.etag) return { skip: true, reason: 'unchanged_etag' };
  if (contentHash && pm.content_hash && contentHash === pm.content_hash) return { skip: true, reason: 'unchanged_content_hash' };
  return { skip: false, reason: 'changed' };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// ===========================================================================
// Acquisition (download + unzip + scan + parse) — mirrors load-ravines.js
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
    return Object.keys(await zip.entries());
  } finally {
    await zip.close();
  }
}

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

/**
 * Parse + L25-filter the shapefile → { features, counters }. Each kept feature carries
 * its source_id + geojson + the 18-column attribute payload.
 */
async function parseShapefile(shpPath, dbfPath) {
  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  const c = {
    raw: 0, badSourceId: 0, nullGeometry: 0,
    droppedNonStreet: 0, droppedFederal: 0,
    unknownFeatureCode: 0, unknownJurisdiction: 0,
  };
  let validatedColumns = false;
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    c.raw++;
    const props = r.value.properties || {};
    if (!validatedColumns) { validateShapefileColumns(props); validatedColumns = true; } // F13

    const sourceId = coerceSourceId(props[DBF.centreline_id]);
    if (sourceId == null) { c.badSourceId++; continue; }

    const cls = classifyFeature(props[DBF.feature_code_desc], props[DBF.jurisdiction]);
    if (cls.drop) { if (cls.reason === 'federal') c.droppedFederal++; else c.droppedNonStreet++; continue; }
    if (cls.unknownFeature) c.unknownFeatureCode++;
    if (cls.unknownJurisdiction) c.unknownJurisdiction++;

    if (r.value.geometry == null) { c.nullGeometry++; continue; }

    const txt = (k) => { const v = props[k]; return v == null || String(v).trim() === '' ? null : String(v).trim(); };
    features.push({
      source_id: sourceId,
      geojson: JSON.stringify(r.value.geometry),
      linear_name_full: txt(DBF.linear_name_full),
      linear_name: txt(DBF.linear_name),
      linear_name_type: txt(DBF.linear_name_type),
      linear_name_dir: txt(DBF.linear_name_dir),
      feature_code_desc: cls.featureCodeDesc,
      jurisdiction: cls.jurisdiction,
      from_intersection_id: coerceNodeId(props[DBF.from_intersection_id]),
      to_intersection_id: coerceNodeId(props[DBF.to_intersection_id]),
      lo_num_l: txt(DBF.lo_num_l),
      hi_num_l: txt(DBF.hi_num_l),
      lo_num_r: txt(DBF.lo_num_r),
      hi_num_r: txt(DBF.hi_num_r),
      parity_l: txt(DBF.parity_l),
      parity_r: txt(DBF.parity_r),
      oneway_dir_code_desc: txt(DBF.oneway_dir_code_desc),
    });
  }
  return { features, counters: c };
}

// ===========================================================================
// Main
// ===========================================================================
async function main(pool) {
  const { logicVars } = await loadMarketplaceConfigs(pool, MARKETPLACE_KEY);
  const config = validateConfig(logicVars);

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const runAt = await pipeline.getDbTimestamp(pool); // §R3.5 — DB clock inside lock
    const nowMs = runAt.getTime();
    const auditRows = [];
    const push = (metric, value, status) => auditRows.push({ metric, value, status });
    push('dataset_source_license', LICENSE_URL, 'INFO');

    const acceptDrift = process.env.CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT === '1';
    if (acceptDrift) push('centreline_override_feature_count_drift_present', true, 'WARN');

    // Prior run (chain-scoped name).
    const prior = await pool
      .query(`SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [PIPELINE_NAME])
      .then((r) => (r.rows[0] ? r.rows[0].records_meta : null))
      .catch((err) => { pipeline.log.warn('[load-centreline]', `prior-run query failed (no baseline): ${err.message}`); return null; });
    const priorFeatureCount = prior && prior.centreline_load ? safeParseIntOrNull(prior.centreline_load.feature_count_filtered) : null;
    const hasPriorRun = !!(prior && prior.centreline_load);

    // §3.2 Step 0a — HEAD skip-check.
    let headInfo = null;
    try {
      headInfo = await headValidators(CKAN_DOWNLOAD_URL, config.centrelineDownloadTimeoutMs);
    } catch (err) {
      // §3.9: HEAD 4xx/5xx → WARN + proceed to download (do NOT skip on failure).
      push('centreline_head_error', String(err.message), 'WARN');
      headInfo = { lastModified: null, etag: null };
    }
    if (headInfo && !headInfo.lastModified && !headInfo.etag) push('centreline_no_cache_validators', true, 'WARN');

    const headAgeDays = ageDaysFrom(nowMs, (headInfo && headInfo.lastModified) || (prior && prior.centreline_load && prior.centreline_load.last_modified));
    push('centreline_dataset_age_days', headAgeDays, datasetAgeStatus(headAgeDays, config.centrelineSkipCheckThresholdDays));

    const skip = skipCheckDecision({ lastModified: headInfo && headInfo.lastModified, etag: headInfo && headInfo.etag, prior });
    if (skip.skip) {
      push('centreline_load_skipped', skip.reason, 'INFO');
      emitSummary(auditRows, { ...skeletonLoadMeta(), ...(prior.centreline_load || {}), spec_version: SPEC_VERSION });
      emitCentrelineMeta();
      return { skipped: true };
    }

    // §3.3 Step 0b — download + unzip + scan + parse (temp dir, always cleaned up).
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'centreline-'));
    let features = [];
    let counters = null;
    let contentHash = null;
    let downloadValidators = {};
    try {
      const dl = await downloadZip(CKAN_DOWNLOAD_URL, path.join(tmpRoot, 'centreline.zip'), config.centrelineDownloadTimeoutMs);
      contentHash = dl.contentHash;
      downloadValidators = { lastModified: dl.lastModified || (headInfo && headInfo.lastModified), etag: dl.etag || (headInfo && headInfo.etag) };
      const extractDir = path.join(tmpRoot, 'ext');
      await extractZip(dl.zipPath, extractDir);
      const { shpPath, dbfPath } = locateShapefile(extractDir);
      const parsed = await parseShapefile(shpPath, dbfPath);
      features = parsed.features;
      counters = parsed.counters;
    } catch (err) {
      push('centreline_acquisition_error', String(err.message), 'FAIL'); // §3.9 download/zip/parse failure → FAIL, no writes
      emitSummary(auditRows, skeletonLoadMeta());
      emitCentrelineMeta();
      return { failed: true };
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }

    push('centreline_feature_count_raw', counters.raw, 'INFO');
    if (counters.badSourceId > 0) push('centreline_bad_centreline_id_count', counters.badSourceId, 'WARN');
    if (counters.nullGeometry > 0) push('centreline_null_geometry_count', counters.nullGeometry, 'WARN');
    if (counters.unknownFeatureCode > 0) push('centreline_unknown_feature_code_count', counters.unknownFeatureCode, 'WARN');
    if (counters.unknownJurisdiction > 0) push('centreline_unknown_jurisdiction_count', counters.unknownJurisdiction, 'WARN');

    // Dedupe by source_id (UNIQUE(source_id) guard).
    const { kept, duplicateCount } = dedupeBySourceId(features);
    if (duplicateCount > 0) push('centreline_duplicate_centreline_id_count', duplicateCount, 'WARN');
    const featureCount = kept.length;
    push('centreline_feature_count_filtered', featureCount, 'INFO');

    // §3.4 — L7 feature-count drift (vs prior filtered count).
    const countDeltaPct = computeCountDeltaPct(featureCount, priorFeatureCount);
    let driftCheckPassed = true;
    if (countDeltaPct > config.centrelineAcceptFeatureCountDriftPct) {
      driftCheckPassed = false;
      push('centreline_count_drift_pct', round3(countDeltaPct), 'FAIL'); // override never suppresses FAIL
      if (!acceptDrift) {
        emitSummary(auditRows, { ...skeletonLoadMeta(), feature_count_filtered: featureCount, feature_count_raw: counters.raw, drift_check_passed: false });
        emitCentrelineMeta();
        return { failed: true };
      }
    }

    // §3.5 Step 2 — batched LineString validation (before withTransaction; L16/L8).
    // L16: 5K-row chunks (47K segments ≫ a single-call comfort threshold; bounds PG planner
    // memory for the per-chunk ST_MakeValid CTE and keeps the input arrays modest).
    const VALIDATION_CHUNK = 5000;
    const byId = new Map();
    for (let i = 0; i < kept.length; i += VALIDATION_CHUNK) {
      const slice = kept.slice(i, i + VALIDATION_CHUNK);
      const { rows: vrows } = await pool.query(VALIDATION_SQL, [slice.map((f) => f.source_id), slice.map((f) => f.geojson)]);
      for (const r of vrows) byId.set(Number(r.source_id), r);
    }
    let skipped = 0;
    const insertable = [];
    for (const f of kept) {
      const v = byId.get(f.source_id);
      const d = validatorCounterDelta(v ? v.status : 'skipped_null');
      if (!v) { pipeline.log.warn('[load-centreline]', `source_id ${f.source_id} missing from validation result — counted as skipped`); }
      skipped += d.skipped;
      if (d.carry) insertable.push({ ...f, geom_wkb: v.geom_wkb });
      else push('centreline_geometry_skipped_source_id', f.source_id, 'WARN');
    }
    const skippedPct = featureCount > 0 ? skipped / featureCount : 0;
    // L8: >5% skipped → FAIL + abort BEFORE transaction.
    if (skippedPct > config.centrelineInvalidGeometryFailPct) {
      push('centreline_geometry_skipped_pct', round3(skippedPct), 'FAIL');
      emitSummary(auditRows, { ...skeletonLoadMeta(), feature_count_filtered: featureCount, feature_count_raw: counters.raw, invalid_geometry_skipped: skipped, drift_check_passed: driftCheckPassed });
      emitCentrelineMeta();
      return { failed: true };
    }
    push('centreline_geometry_skipped_pct', round3(skippedPct), 'INFO');

    // §3.7 Step 4 — L15 F-C1 dual-mode guard BEFORE the transaction.
    // First run + empty → FAIL (block deploy on empty source). Subsequent run + empty → WARN + preserve.
    let fC1Fired = false;
    let deleteSkippedEmptyGuard = false;
    if (insertable.length === 0) {
      fC1Fired = true;
      if (!hasPriorRun) {
        push('f_c1_empty_temp_guard_fired', true, 'FAIL');
        emitSummary(auditRows, { ...skeletonLoadMeta(), feature_count_filtered: featureCount, feature_count_raw: counters.raw, f_c1_empty_temp_guard_fired: true, drift_check_passed: driftCheckPassed });
        emitCentrelineMeta();
        return { failed: true };
      }
      // subsequent run: preserve existing target; skip DELETE+INSERT entirely.
      deleteSkippedEmptyGuard = true;
      push('f_c1_empty_temp_guard_fired', true, 'WARN');
      push('centreline_delete_skipped_empty_guard', true, 'INFO');
      emitSummary(auditRows, { ...skeletonLoadMeta(), ...(prior.centreline_load || {}), spec_version: SPEC_VERSION, feature_count_filtered: featureCount, feature_count_raw: counters.raw, features_inserted: 0, features_updated: 0, features_deleted: 0, delete_skipped_empty_guard: true, f_c1_empty_temp_guard_fired: true, drift_check_passed: driftCheckPassed });
      emitCentrelineMeta();
      return { ok: true };
    }

    // §3.7 Step 4 — L26 staging-table full-replace inside one transaction.
    const datasetVersion = contentHash || downloadValidators.etag || (downloadValidators.lastModified ? crypto.createHash('sha1').update(downloadValidators.lastModified).digest('hex') : String(runAt));
    let inserted = 0;
    let deleted = 0;
    await pipeline.withTransaction(pool, async (client) => {
      // F-S11: INCLUDING DEFAULTS INCLUDING CONSTRAINTS (UNIQUE(source_id) without the GIST).
      await client.query('CREATE TEMP TABLE temp_centreline (LIKE toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP');

      const cols = [
        'source_id', 'geom', 'linear_name_full', 'linear_name', 'linear_name_type', 'linear_name_dir',
        'feature_code_desc', 'jurisdiction', 'from_intersection_id', 'to_intersection_id',
        'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r',
        'oneway_dir_code_desc', 'source_dataset_version', 'updated_at',
      ];
      const perRowParams = cols.length; // 19 (geom passed as WKB param → ST_GeomFromWKB)
      const batch = pipeline.maxRowsPerInsert(perRowParams);
      for (let i = 0; i < insertable.length; i += batch) {
        const slice = insertable.slice(i, i + batch);
        const placeholders = [];
        const values = [];
        let idx = 1;
        for (const row of slice) {
          placeholders.push(
            `($${idx++}, ST_GeomFromWKB($${idx++}, 4326), $${idx++}, $${idx++}, $${idx++}, $${idx++}, ` +
            `$${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, ` +
            `$${idx++}, $${idx++}, $${idx++})`,
          );
          values.push(
            row.source_id, row.geom_wkb, row.linear_name_full, row.linear_name, row.linear_name_type, row.linear_name_dir,
            row.feature_code_desc, row.jurisdiction, row.from_intersection_id, row.to_intersection_id,
            row.lo_num_l, row.hi_num_l, row.lo_num_r, row.hi_num_r, row.parity_l, row.parity_r,
            row.oneway_dir_code_desc, datasetVersion, runAt,
          );
        }
        await client.query(`INSERT INTO temp_centreline (${cols.join(', ')}) VALUES ${placeholders.join(', ')}`, values);
      }

      const del = await client.query('DELETE FROM toronto_centreline');
      deleted = del.rowCount || 0;
      const ins = await client.query(`INSERT INTO toronto_centreline (${cols.join(', ')}) SELECT ${cols.join(', ')} FROM temp_centreline`);
      inserted = ins.rowCount || 0;
    });

    push('centreline_features_inserted', inserted, 'INFO');
    push('centreline_features_deleted', deleted, 'INFO');

    const centrelineLoad = {
      spec_version: SPEC_VERSION,
      source_dataset_version: datasetVersion,
      last_modified: downloadValidators.lastModified || null,
      etag: downloadValidators.etag || null,
      content_hash: contentHash,
      feature_count_raw: counters.raw,
      feature_count_filtered: featureCount,
      filtered_out_non_street: counters.droppedNonStreet,
      filtered_out_federal: counters.droppedFederal,
      unknown_feature_code_count: counters.unknownFeatureCode,
      unknown_jurisdiction_count: counters.unknownJurisdiction,
      features_inserted: inserted,
      features_updated: 0, // staging-CTE full-replace — never UPDATE
      features_deleted: deleted,
      invalid_geometry_skipped: skipped,
      delete_skipped_empty_guard: deleteSkippedEmptyGuard,
      f_c1_empty_temp_guard_fired: fC1Fired,
      drift_check_passed: driftCheckPassed,
    };

    emitSummary(auditRows, centrelineLoad, { recordsTotal: featureCount, recordsNew: inserted });
    emitCentrelineMeta();
    return { ok: true };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------
function auditTable(rows) {
  return { phase: ADVISORY_LOCK_ID, name: 'Toronto Centreline', verdict: verdictCascade(rows), rows };
}

/** records_total = filtered feature count (primary entity = centreline segments, §11). */
function emitSummary(rows, centrelineLoad, { recordsTotal = null, recordsNew = null } = {}) {
  pipeline.emitSummary({
    records_total: recordsTotal,
    records_new: recordsNew,
    records_updated: 0, // staging-CTE full-replace
    records_meta: { audit_table: auditTable(rows), centreline_load: centrelineLoad },
  });
}

function skeletonLoadMeta() {
  return {
    spec_version: SPEC_VERSION, source_dataset_version: null, last_modified: null, etag: null, content_hash: null,
    feature_count_raw: 0, feature_count_filtered: 0, filtered_out_non_street: 0, filtered_out_federal: 0,
    unknown_feature_code_count: 0, unknown_jurisdiction_count: 0,
    features_inserted: 0, features_updated: 0, features_deleted: 0, invalid_geometry_skipped: 0,
    delete_skipped_empty_guard: false, f_c1_empty_temp_guard_fired: false, drift_check_passed: true,
  };
}

function emitCentrelineMeta() {
  pipeline.emitMeta(
    { [CKAN_INPUT_KEY]: [] },
    {
      toronto_centreline: [
        'source_id', 'geom', 'linear_name_full', 'linear_name', 'linear_name_type', 'linear_name_dir',
        'feature_code_desc', 'jurisdiction', 'from_intersection_id', 'to_intersection_id',
        'lo_num_l', 'hi_num_l', 'lo_num_r', 'hi_num_r', 'parity_l', 'parity_r',
        'oneway_dir_code_desc', 'source_dataset_version', 'created_at', 'updated_at',
      ],
    },
    ['CKAN'],
  );
}

if (require.main === module) {
  pipeline.run('load-centreline', main);
}

module.exports = {
  VALIDATION_SQL,
  STREET_CLASS_INCLUDE,
  STREET_CLASS_EXCLUDE,
  UNKNOWN_FEATURE_SENTINEL,
  REQUIRED_DBF_FIELDS,
  DBF,
  coerceSourceId,
  coerceNodeId,
  normCode,
  classifyFeature,
  validateShapefileColumns,
  computeCountDeltaPct,
  dedupeBySourceId,
  validatorCounterDelta,
  verdictCascade,
  ageDaysFrom,
  datasetAgeStatus,
  skipCheckDecision,
  locateShapefile,
};
