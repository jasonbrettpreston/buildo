#!/usr/bin/env node
/**
 * Load Toronto Zoning By-law (569-2013) — 10 CKAN DataStore layers → 10 tables.
 * SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (v2.3)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_zoning step)
 *
 * Acquisition: CKAN DataStore API (datastore_search, paginated) per resource_id.
 * The DataStore injects the `_id` upsert key (D1) — shapefiles do NOT carry it
 * (R-C1, mid-process Integration review 2026-05-30); each record also returns
 * its attributes + `geometry` as a GeoJSON string. §2's "download SHP ZIP" note
 * is superseded — fold at WF6 spec-sync.
 *
 * Per-layer transactions (D2), base-first (P-H6). Each layer: paginate
 * datastore_search → attr-drift (F-H3) → per-row validate (F-M7 source_id,
 * R2-17 dup-reject, P-H5 range-reject, R2-16 HT_LABEL) → PostGIS geometry
 * validate (geometry-validator) → batched UPSERT ON CONFLICT (source_id) with
 * IS DISTINCT FROM (§6.4) → NOT EXISTS orphan delete (R2-13, F-C1 empty guard,
 * F-H1 relative-% vs pre-DELETE count). ~107 audit rows, 3-way verdict cascade
 * (P-C3), base-only counters (P-C1), frozen §9 records_meta contract.
 *
 * Usage: node scripts/load-zoning.js
 */
'use strict';

const https = require('https');

const pipeline = require('./lib/pipeline');
const { checkAttrDrift } = require('./lib/zoning-attr-drift');
const {
  POLYGON,
  LINESTRING,
  geomColumnSql,
  geometryValidationSql,
  classifyGeometry,
} = require('./lib/geometry-validator');

const ADVISORY_LOCK_ID = 58;
const LICENSE_URL = 'https://open.toronto.ca/open-data-license/';
const CKAN_PACKAGE_ID = '34927e44-fc11-4336-a8aa-a0dfb27658b7';
const CKAN_ACTION = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action';
const PIPELINE_NAME = 'sources:load_zoning'; // chain-prefixed (R2-6)
const BATCH_SIZE = 1000;
const DATASTORE_PAGE = 10000;
const HTTP_TIMEOUT_MS = 30000;

// Thresholds (spec §3).
const ORPHAN_INFO_PCT = 0.5;
const ORPHAN_WARN_PCT = 2.0;
const LOADED_PCT_PASS = 95;
const LOADED_PCT_WARN = 90;
const AGE_INFO_DAYS = 450;
const AGE_FAIL_DAYS = 730;
const FORCE_RELOAD_STALE_DAYS = 730; // F-M4
const NULL_COUNT_WARN_OVER_PCT = 10; // F-M5
const WITH_EXCEPTIONS_WARN_BELOW_PCT = 50; // F-H13
const DURATION_WARN_FACTOR = 2; // F-H14
const MAX_REDIRECTS = 5;

const NUM = 'num';
const INT = 'int';
const TEXT = 'text';

// Layer registry. resourceId = CKAN DataStore resource (spec §2 sub-layer map).
// key = §9 records_meta key (table minus `zoning_`, base → 'base').
const LAYERS = [
  {
    key: 'base', table: 'zoning_bylaw_areas', resourceId: '76a2620f-a6b4-495d-8e41-c0ede1f8a928',
    ckanSource: 'ckan:zoning-area', geomKind: POLYGON, isBase: true,
    nullTrackCols: ['coverage_max_pct', 'fsi_max', 'frontage_min_m'], distributionCol: 'zn_zone',
    cols: [
      { col: 'gen_zone', src: 'GEN_ZONE', kind: INT },
      { col: 'zn_zone', src: 'ZN_ZONE', kind: TEXT, maxLen: 20 },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT, maxLen: 50 },
      { col: 'zn_holding', src: 'ZN_HOLDING', kind: TEXT },
      { col: 'holding_id', src: 'HOLDING_ID', kind: INT },
      { col: 'frontage_min_m', src: 'FRONTAGE', kind: NUM, min: 0 },
      { col: 'area_min_sqm', src: 'ZN_AREA', kind: INT, min: 0 },
      { col: 'units_max', src: 'UNITS', kind: INT, min: 0 },
      { col: 'density_max', src: 'DENSITY', kind: NUM, min: 0 },
      { col: 'coverage_max_pct', src: 'COVERAGE', kind: NUM, min: 0, max: 100 },
      { col: 'fsi_max', src: 'FSI_TOTAL', kind: NUM, min: 0 },
      { col: 'pct_commercial_max', src: 'PRCNT_COMM', kind: NUM, min: 0, max: 100 },
      { col: 'pct_residential_max', src: 'PRCNT_RES', kind: NUM, min: 0, max: 100 },
      { col: 'pct_employment_max', src: 'PRCNT_EMMP', kind: NUM, min: 0, max: 100 },
      { col: 'pct_office_max', src: 'PRCNT_OFFC', kind: NUM, min: 0, max: 100 },
      { col: 'exception_number', src: 'EXCPTN_NO', kind: INT },
      { col: 'exception_text', src: 'ZN_EXCPTN', kind: TEXT },
      { col: 'bylaw_chapter', src: 'ZBL_CHAPT', kind: TEXT },
      { col: 'bylaw_section', src: 'ZBL_SECTN', kind: TEXT },
      { col: 'bylaw_exception_ref', src: 'ZBL_EXCPTN', kind: TEXT },
      { col: 'standard_setback', src: 'STAND_SET', kind: NUM, min: 0 },
      { col: 'zone_status', src: 'ZN_STATUS', kind: INT },
      { col: 'area_units', src: 'AREA_UNITS', kind: NUM },
    ],
  },
  {
    key: 'height_overlay', table: 'zoning_height_overlay', resourceId: 'f0a88d06-2430-4025-b15d-362cabd00f31',
    ckanSource: 'ckan:zoning-height-overlay', geomKind: POLYGON,
    cols: [
      { col: 'ht_stories', src: 'HT_STORIES', kind: INT, min: 0 },
      { col: 'ht_string', src: 'HT_STRING', kind: TEXT },
      { col: 'height_max_m', src: 'HT_LABEL', kind: 'height_label', min: 0 },
    ],
  },
  {
    key: 'lot_coverage_overlay', table: 'zoning_lot_coverage_overlay', resourceId: '58ad8814-ca4e-43d6-848d-d5fd8d873574',
    ckanSource: 'ckan:zoning-lot-coverage-overlay', geomKind: POLYGON,
    cols: [{ col: 'coverage_max_pct_override', src: 'PRCNT_CVER', kind: NUM, min: 0, max: 100 }],
  },
  {
    key: 'building_setback_overlay', table: 'zoning_building_setback_overlay', resourceId: '8d75cab6-ab97-4158-8ba5-8874860b26f7',
    ckanSource: 'ckan:zoning-building-setback-overlay', geomKind: POLYGON,
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_area_type', src: 'CH600_AREA_TYPE', kind: INT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
  {
    key: 'policy_area_overlay', table: 'zoning_policy_area_overlay', resourceId: '1a6469f8-1eaf-4ba6-a1f6-07179efbc2f2',
    ckanSource: 'ckan:zoning-policy-area-overlay', geomKind: POLYGON,
    cols: [
      { col: 'policy_id', src: 'POLICY_ID', kind: TEXT },
      { col: 'chapter_200_ref', src: 'CHAPT_200', kind: TEXT },
      { col: 'exception_link', src: 'EXCPTN_LK', kind: TEXT },
    ],
  },
  {
    key: 'policy_road_overlay', table: 'zoning_policy_road_overlay', resourceId: '4e2f9292-6082-4627-be8e-61b87a2cb273',
    ckanSource: 'ckan:zoning-policy-road-overlay', geomKind: LINESTRING,
    cols: [{ col: 'road_name', src: 'ROAD_NAME', kind: TEXT }],
  },
  {
    key: 'rooming_house_overlay', table: 'zoning_rooming_house_overlay', resourceId: '75b9805b-bc65-4c30-97fa-9c57c17233b2',
    ckanSource: 'ckan:zoning-rooming-house-overlay', geomKind: POLYGON,
    cols: [
      { col: 'rmh_area', src: 'RMH_AREA', kind: TEXT },
      { col: 'rmg_hs_no', src: 'RMG_HS_NO', kind: INT },
      { col: 'rmg_string', src: 'RMG_STRING', kind: TEXT },
      { col: 'chapter_150_25_ref', src: 'CHAP150_25', kind: TEXT },
    ],
  },
  {
    key: 'parking_zone_overlay', table: 'zoning_parking_zone_overlay', resourceId: '8f969df7-9008-49fd-a50b-df53f1f680e6',
    ckanSource: 'ckan:zoning-parking-zone-overlay', geomKind: POLYGON,
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_parkzone', src: 'ZN_PARKZONE', kind: TEXT },
    ],
  },
  {
    key: 'priority_retail_overlay', table: 'zoning_priority_retail_overlay', resourceId: '499de5f6-194a-4da3-a18f-27a8e684721d',
    ckanSource: 'ckan:zoning-priority-retail-overlay', geomKind: LINESTRING,
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_line_type', src: 'CH600_LINE_TYPE', kind: INT },
      { col: 'linear_name_full_legal', src: 'LINEAR_NAME_FULL_LEGAL', kind: TEXT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
  {
    key: 'queenstw_eat_overlay', table: 'zoning_queenstw_eat_overlay', resourceId: '1f18bd73-bbbc-4ad6-ac27-6c9cae7385b4',
    ckanSource: 'ckan:zoning-queenstw-eat-overlay', geomKind: POLYGON,
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_area_type', src: 'CH600_AREA_TYPE', kind: INT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
];

function requiredAttrColumns(layer) {
  return ['_id', 'geometry', ...layer.cols.map((c) => c.src)];
}

// ===========================================================================
// Pure helpers (exported for src/tests/zoning.logic.test.ts)
// ===========================================================================

/** Non-throwing numeric parse (H1: safeParseFloat throws on dirty text). */
function parseNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** R2-16: strict HT_LABEL parse; ranges/prose → null + unparseable (never fabricate). */
function parseHeightLabel(label) {
  if (label == null) return { value: null, unparseable: false };
  const s = String(label).trim();
  if (s === '') return { value: null, unparseable: false };
  const m = /^(\d+(?:\.\d+)?)\s*m?$/i.exec(s);
  if (!m) return { value: null, unparseable: true };
  return { value: Number(m[1]), unparseable: false };
}

/** F-M7: coerce CKAN `_id` to a positive integer (CKAN _id is 1-based), else null. */
function coerceSourceId(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null; // M4: reject 0
  return n;
}

/** Coerce per declared kind. ok=false → row reject (P-H5 out-of-range, never clamp). */
function coerceColumn(rawValue, colDef) {
  if (rawValue == null || rawValue === '') return { value: null, ok: true };
  if (colDef.kind === TEXT) {
    let v = String(rawValue);
    if (colDef.maxLen && v.length > colDef.maxLen) v = v.slice(0, colDef.maxLen);
    return { value: v, ok: true };
  }
  if (colDef.kind === 'height_label') {
    return { value: parseHeightLabel(rawValue).value, ok: true };
  }
  const num = parseNum(rawValue);
  if (num == null) return { value: null, ok: true }; // unparseable numeric → null
  // Toronto encodes "not regulated / not applicable" as a negative sentinel (-1),
  // pervasively (FSI_TOTAL, PRCNT_*, STAND_SET, FRONTAGE…), and the DB CHECK
  // constraints forbid out-of-range values. Null the cell — the faithful "no
  // value", neither clamp/fabricate nor drop the whole row — and count it, so
  // the row's zoning data (zn_zone, geometry, exceptions) still loads.
  // [Refines P-H5: reject-the-CELL-to-NULL, not reject-the-ROW. Spike 2026-05-30.]
  if ((colDef.min != null && num < colDef.min) || (colDef.max != null && num > colDef.max)) {
    return { value: null, ok: true, nulled: true };
  }
  return { value: colDef.kind === INT ? Math.trunc(num) : num, ok: true };
}

/** R2-17: reject ALL rows sharing a non-unique source_id (deterministic). */
function dedupeRejectAll(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.source_id, (counts.get(r.source_id) || 0) + 1);
  const kept = rows.filter((r) => counts.get(r.source_id) === 1);
  return { kept, duplicateCount: rows.length - kept.length };
}

/** F-H1 + R2-14: orphan status vs PRE-delete count. First deploy (0) → INFO. */
function orphanStatus(orphansRemoved, preDeleteCount) {
  if (preDeleteCount <= 0) return 'INFO';
  const pct = (orphansRemoved * 100) / preDeleteCount;
  if (pct <= ORPHAN_INFO_PCT) return 'INFO';
  if (pct <= ORPHAN_WARN_PCT) return 'WARN';
  return 'FAIL';
}

/** F-H11: loaded-pct vs baseline. No baseline → INFO + _no_baseline. */
function loadedPctStatus(currentCount, baselineCount) {
  if (baselineCount == null || baselineCount <= 0) return { pct: null, status: 'INFO', noBaseline: true };
  const pct = (currentCount * 100) / baselineCount;
  let status = 'PASS';
  if (pct < LOADED_PCT_WARN) status = 'FAIL';
  else if (pct < LOADED_PCT_PASS) status = 'WARN';
  return { pct: Math.round(pct * 10) / 10, status, noBaseline: false };
}

/** OB-2 zero-coverage gate (spec §3): ==0 → FAIL; INFO otherwise (no WARN band — matches spec). */
function loadedCountStatus(count) {
  return count === 0 ? 'FAIL' : 'INFO';
}

/** F-M5: NULL-count vs baseline. WARN if >10% above. */
function nullCountStatus(currentNull, baselineNull) {
  if (baselineNull == null) return 'INFO';
  return currentNull > baselineNull * (1 + NULL_COUNT_WARN_OVER_PCT / 100) ? 'WARN' : 'INFO';
}

/** F-H13: exceptions count vs prior. WARN if 50% below. */
function withExceptionsStatus(current, prior) {
  if (prior == null || prior <= 0) return 'INFO';
  return current < prior * (WITH_EXCEPTIONS_WARN_BELOW_PCT / 100) ? 'WARN' : 'INFO';
}

/** F-H14: per-layer duration vs prior. WARN if >2×. */
function durationStatus(currentMs, priorMs) {
  if (priorMs == null || priorMs <= 0) return 'INFO';
  return currentMs > priorMs * DURATION_WARN_FACTOR ? 'WARN' : 'INFO';
}

/** F-H10: publisher-cadence age. INFO ≤450 / WARN 450–730 / FAIL >730. */
function datasetVersionAgeStatus(ageDays) {
  if (ageDays == null || Number.isNaN(ageDays)) return 'INFO';
  if (ageDays <= AGE_INFO_DAYS) return 'INFO';
  if (ageDays <= AGE_FAIL_DAYS) return 'WARN';
  return 'FAIL';
}

/** Days between now (ms) and a CKAN version string; null if unparseable (Gemini: avoid NaN→spurious FAIL). */
function ageDaysFrom(nowMs, versionStr) {
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / 86400000);
}

/** Spec 47 §8.4 + P-M4: top-N distribution with truncation counters. */
function topNDistribution(classValues, n = 20) {
  const counts = new Map();
  for (const v of classValues) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const top = sorted.slice(0, n).map(([zone, count]) => ({ zone, count }));
  const rest = sorted.slice(n);
  return { top, truncatedClassCount: rest.length, otherCount: rest.reduce((s, [, c]) => s + c, 0) };
}

/** P-C3: 3-way row-derived verdict cascade (never a parallel boolean). */
function verdictCascade(rows) {
  if (rows.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (rows.some((r) => r.status === 'WARN')) return 'WARN';
  return 'PASS';
}

/** C3: read a prior run's metric value from records_meta.audit_table.rows (not flat keys). */
function priorMetricValue(prior, metric) {
  const rows = prior && prior.records_meta && prior.records_meta.audit_table && prior.records_meta.audit_table.rows;
  if (!Array.isArray(rows)) return null;
  const hit = rows.find((r) => r.metric === metric);
  return hit ? hit.value : null;
}

/**
 * R2-11 + F-M4: skip-check. Force reload when no prior version, no validators,
 * or cache older than 2× cadence; else skip iff unchanged.
 */
function skipCheckDecision({ lastModified, etag = null, storedVersion, nowMs }) {
  if (!storedVersion) return { skip: false, reason: 'no_prior_version' };
  if (!lastModified && !etag) return { skip: false, reason: 'no_validators' };
  const storedMs = Date.parse(storedVersion);
  if (!Number.isNaN(storedMs) && nowMs - storedMs > FORCE_RELOAD_STALE_DAYS * 86400000) {
    return { skip: false, reason: 'cache_stale_force_reload' };
  }
  if (lastModified && Date.parse(lastModified) === storedMs) return { skip: true, reason: 'unchanged' };
  return { skip: false, reason: 'changed' };
}

// ===========================================================================
// CKAN DataStore helpers
// ===========================================================================
function httpGetJson(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: HTTP_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        if (redirectsLeft <= 0) return reject(new Error('CKAN: too many redirects'));
        return httpGetJson(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.destroy(); return reject(new Error(`CKAN HTTP ${res.statusCode}`)); }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('CKAN request timed out')); });
    req.on('error', reject);
  });
}

/** Map resource_id → last_modified via a single package_show (M5: cached, one call). */
async function fetchResourceVersions() {
  const res = await httpGetJson(`${CKAN_ACTION}/package_show?id=${CKAN_PACKAGE_ID}`);
  if (!res.success) throw new Error('CKAN package_show: success=false');
  const fallback = res.result.metadata_modified;
  const map = {};
  for (const r of res.result.resources || []) map[r.id] = r.last_modified || fallback;
  return map;
}

/** Paginated datastore_search for one resource. Returns all records (each has _id, fields, geometry string). */
async function fetchDatastoreRecords(resourceId) {
  const records = [];
  let offset = 0;
  for (;;) {
    const res = await httpGetJson(
      `${CKAN_ACTION}/datastore_search?resource_id=${resourceId}&limit=${DATASTORE_PAGE}&offset=${offset}`
    );
    if (!res.success) throw new Error(`CKAN datastore_search: success=false (resource ${resourceId})`);
    const recs = res.result.records || [];
    records.push(...recs);
    if (recs.length < DATASTORE_PAGE) break;
    offset += DATASTORE_PAGE;
  }
  return records;
}

// ===========================================================================
// Per-layer load (called inside the advisory lock; each layer = one txn, D2)
// ===========================================================================
async function loadLayer(pool, layer, records, datasetVersion, prior, auditRows) {
  const t0 = Date.now();
  const m = (suffix) => (layer.isBase ? `zoning_areas_${suffix}` : `${layer.key}_${suffix}`);
  const push = (metric, value, status, extra) => auditRows.push({ metric, value, status, ...(extra || {}) });

  if (records.length === 0) {
    push(m('loaded_count'), 0, layer.isBase ? 'FAIL' : 'INFO');
    push(m('orphan_delete_skipped'), true, 'INFO'); // no rows → orphan delete not run (Obs IMP-5)
    return { key: layer.key, loaded: 0, inserted: 0, updated: 0, ok: !layer.isBase };
  }

  // F-H3 drift check against the DataStore field set.
  const presentFields = Object.keys(records[0]);
  const drift = checkAttrDrift(presentFields, requiredAttrColumns(layer));
  // Single attr_drift row (Obs IMP-4: avoid two same-key rows when both present).
  if (!drift.ok || drift.extraColumns.length > 0) {
    push(m('attr_drift'), { missing: drift.missingRequired, extra: drift.extraColumns },
      !drift.ok ? (layer.isBase ? 'FAIL' : 'WARN') : 'WARN');
  }
  if (!drift.ok) {
    return { key: layer.key, loaded: 0, inserted: 0, updated: 0, ok: false };
  }

  // Map → candidate rows.
  const candidates = [];
  let outOfRangeNulled = 0;
  let unparseableHeight = 0;
  let badSourceId = 0;
  let nullGeometry = 0;
  for (const rec of records) {
    if (rec.geometry == null) { nullGeometry++; continue; }
    const sourceId = coerceSourceId(rec._id);
    if (sourceId == null) { badSourceId++; continue; }
    const row = { source_id: sourceId, geometry: typeof rec.geometry === 'string' ? rec.geometry : JSON.stringify(rec.geometry) };
    let rejected = false;
    for (const colDef of layer.cols) {
      const { value, ok, nulled } = coerceColumn(rec[colDef.src], colDef);
      if (!ok) { rejected = true; break; } // reserved for future hard-reject columns
      if (nulled) outOfRangeNulled++;
      if (colDef.kind === 'height_label') {
        const { unparseable } = parseHeightLabel(rec[colDef.src]);
        if (unparseable) unparseableHeight++;
      }
      row[colDef.col] = value;
    }
    if (rejected) continue;
    candidates.push(row);
  }
  if (badSourceId > 0) push(m('non_integer_source_id_count'), badSourceId, 'WARN');
  if (nullGeometry > 0) push(m('null_geometry_count'), nullGeometry, 'WARN'); // Gemini LOW: don't drop silently
  if (layer.key === 'height_overlay' && unparseableHeight > 0) {
    push('zoning_height_overlay_unparseable_label_count', unparseableHeight, 'WARN');
  }
  // Out-of-range cells nulled (the -1 "not regulated" sentinel) — INFO; the row is kept.
  if (outOfRangeNulled > 0) push(m('out_of_range_nulled_count'), outOfRangeNulled, 'INFO');

  // R2-17 dup reject.
  const { kept, duplicateCount } = dedupeRejectAll(candidates);
  if (duplicateCount > 0) push(m('duplicate_source_id_count'), duplicateCount, layer.isBase ? 'FAIL' : 'WARN');

  // PostGIS geometry validation → counts + insertable set (geom is NOT NULL).
  let repaired = 0;
  let discarded = 0;
  const insertable = [];
  // Read-only PostGIS pre-validation on `pool` (NOT the layer's withTransaction
  // client): no temp-table dependency and no writes, so it is exempt from F-C4's
  // "all layer queries on client" rule (which targets the staging/upsert/delete).
  for (let i = 0; i < kept.length; i += BATCH_SIZE) {
    const slice = kept.slice(i, i + BATCH_SIZE);
    const { rows: vrows } = await pool.query(geometryValidationSql(layer.geomKind), [slice.map((r) => r.geometry)]);
    const byOrd = new Map(vrows.map((r) => [Number(r.ord), r]));
    for (let j = 0; j < slice.length; j++) {
      const verdict = classifyGeometry(byOrd.get(j + 1) || { empty_after: true });
      if (verdict === 'discarded') { discarded++; continue; }
      if (verdict === 'repaired') repaired++;
      insertable.push(slice[j]);
    }
  }
  if (layer.isBase) {
    // spec §3: INFO if 0; WARN if 1–50 AND ≤0.5%; FAIL if >50 OR >0.5% (CodeRev M1).
    const invPct = kept.length > 0 ? (discarded * 100) / kept.length : 0;
    push('zoning_areas_invalid_polygon_count', discarded,
      discarded === 0 ? 'INFO' : (discarded <= 50 && invPct <= 0.5) ? 'WARN' : 'FAIL');
    push('zoning_areas_repaired_polygon_count', repaired, 'INFO');
  } else {
    push(m('invalid_polygon_count'), discarded, discarded === 0 ? 'INFO' : 'WARN');
    push(m('repaired_polygon_count'), repaired, 'INFO');
  }

  // Batched UPSERT + NOT EXISTS orphan delete, all on `client` (F-C4).
  let inserted = 0;
  let updated = 0;
  let orphansRemoved = 0;
  let orphanSkipped = false;
  let preDelete = 0;
  await pipeline.withTransaction(pool, async (client) => {
    preDelete = Number((await client.query(`SELECT COUNT(*)::int AS c FROM ${layer.table}`)).rows[0].c);
    await client.query(`CREATE TEMP TABLE _zoning_staging (source_id INTEGER NOT NULL) ON COMMIT DROP`);

    const colNames = layer.cols.map((c) => c.col);
    const allCols = ['source_id', ...colNames, 'geometry', 'geom', 'source_dataset_version'];
    const setClause = [...colNames, 'geometry', 'geom', 'source_dataset_version'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    // H5: include geometry (jsonb) in the change guard alongside data cols + geom.
    const distinctClause = [...colNames, 'geometry', 'geom'].map((c) => `${layer.table}.${c} IS DISTINCT FROM EXCLUDED.${c}`).join(' OR ');

    const insertBatch = pipeline.maxRowsPerInsert(allCols.length); // Spec 47 §6.3 (not a magic number)
    for (let i = 0; i < insertable.length; i += insertBatch) {
      const slice = insertable.slice(i, i + insertBatch);
      const values = [];
      const placeholders = [];
      let idx = 1;
      for (const row of slice) {
        const ph = [`$${idx++}`];
        values.push(row.source_id);
        for (const c of colNames) { ph.push(`$${idx++}`); values.push(row[c] ?? null); }
        ph.push(`$${idx++}`); values.push(row.geometry); // geometry jsonb (GeoJSON string)
        ph.push(geomColumnSql(`$${idx++}`, layer.geomKind)); values.push(row.geometry); // geom expr
        ph.push(`$${idx++}`); values.push(datasetVersion); // source_dataset_version
        placeholders.push(`(${ph.join(', ')})`);
      }
      const result = await client.query(
        `INSERT INTO ${layer.table} (${allCols.join(', ')}) VALUES ${placeholders.join(', ')}
         ON CONFLICT (source_id) DO UPDATE SET ${setClause}
         WHERE ${distinctClause}
         RETURNING (xmax = 0) AS is_insert`,
        values
      );
      inserted += result.rows.filter((r) => r.is_insert).length;
      updated += result.rows.length - result.rows.filter((r) => r.is_insert).length;
      const ids = slice.map((r) => r.source_id);
      if (ids.length) await client.query(`INSERT INTO _zoning_staging VALUES ${ids.map((_, k) => `($${k + 1})`).join(', ')}`, ids);
    }

    if (insertable.length === 0) {
      orphanSkipped = true; // F-C1: empty staging can't wipe the table
    } else {
      const del = await client.query(
        `DELETE FROM ${layer.table} t WHERE NOT EXISTS (SELECT 1 FROM _zoning_staging s WHERE s.source_id = t.source_id)`
      );
      orphansRemoved = del.rowCount || 0;
    }
  });
  if (orphanSkipped) push(m('orphan_delete_skipped'), true, 'INFO');
  push(m('orphans_removed_count'), orphansRemoved, orphanStatus(orphansRemoved, preDelete));

  // Counts + observability over the INSERTABLE population (H4).
  const loaded = insertable.length;
  const unchanged = Math.max(0, loaded - inserted - updated);
  push(m('unchanged_skipped'), unchanged, 'INFO');
  if (layer.isBase) {
    push('zoning_areas_loaded_count', loaded, loadedCountStatus(loaded));
  } else {
    push(m('loaded_count'), loaded, 'INFO');
  }
  const baseline = priorMetricValue(prior, layer.isBase ? 'zoning_areas_loaded_count' : m('loaded_count'));
  const lp = loadedPctStatus(loaded, baseline);
  push(m('loaded_pct'), lp.pct, lp.status, lp.noBaseline ? { _no_baseline: true } : null);

  if (layer.isBase) {
    const withExc = insertable.filter((r) => r.exception_number != null).length;
    push('zoning_areas_with_exceptions_count', withExc,
      withExceptionsStatus(withExc, priorMetricValue(prior, 'zoning_areas_with_exceptions_count')));
    const dist = topNDistribution(insertable.map((r) => r.zn_zone));
    // WARN if the primary zone-class distribution is empty despite rows loaded (Obs CRIT-2).
    const distStatus = (dist.top.length === 0 && loaded > 0) ? 'WARN' : 'INFO';
    push('zoning_areas_distribution_top20', dist.top, distStatus,
      { _truncated_class_count: dist.truncatedClassCount, _other_count: dist.otherCount });
    for (const col of layer.nullTrackCols) {
      const nulls = insertable.filter((r) => r[col] == null).length;
      push(`${col}_null_count`, nulls, nullCountStatus(nulls, priorMetricValue(prior, `${col}_null_count`)));
    }
  }

  const elapsed = Date.now() - t0;
  push(m('duration_ms'), elapsed, durationStatus(elapsed, priorMetricValue(prior, m('duration_ms'))));

  return { key: layer.key, loaded, inserted, updated, ok: true };
}

// ===========================================================================
// Main
// ===========================================================================
async function main(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const runAt = await pipeline.getDbTimestamp(pool); // §R3.5 (Date)
    const nowMs = Date.parse(String(runAt));
    const auditRows = [];
    auditRows.push({ metric: 'dataset_source_license', value: LICENSE_URL, status: 'INFO' }); // §6

    const prior = await pool.query(
      `SELECT records_meta FROM pipeline_runs WHERE pipeline = $1 AND status = 'completed' ORDER BY started_at DESC LIMIT 1`,
      [PIPELINE_NAME]
    ).then((r) => r.rows[0] || null).catch((err) => {
      pipeline.log.warn('[load-zoning]', `prior-run query failed (treating as no baseline): ${err.message}`);
      return null;
    });
    const storedVersion = prior && prior.records_meta ? prior.records_meta.source_dataset_version : null;
    const storedLayerVersions = (prior && prior.records_meta && prior.records_meta.zoning_layer_versions) || {};

    // Resource versions (one package_show) for skip-check + source_dataset_version + age.
    let resourceVersions = {};
    try { resourceVersions = await fetchResourceVersions(); } catch (err) {
      auditRows.push({ metric: 'skip_check_error', value: String(err.message), status: 'INFO' });
    }
    const baseVersion = resourceVersions[LAYERS[0].resourceId] || String(runAt);

    // Step 0a skip-check: skip iff a prior version exists and EVERY layer is unchanged (R2-12).
    const decisions = LAYERS.map((l) =>
      skipCheckDecision({ lastModified: resourceVersions[l.resourceId], etag: null,
        storedVersion: storedLayerVersions[l.key] ?? storedVersion, nowMs }));
    if (storedVersion && decisions.every((d) => d.skip)) {
      const ageDays = ageDaysFrom(nowMs, storedVersion); // no-op → age of the stored (current prod) version
      auditRows.push({ metric: 'no_op_refresh', value: true, status: 'INFO' });
      auditRows.push({ metric: 'dataset_version_age_days', value: ageDays, status: datasetVersionAgeStatus(ageDays) });
      // Forward the FULL frozen §9 contract from the prior run — a skip-run is the
      // most-recent successful row, and WF2's consumer reads zoning_layers_loaded
      // from it (a missing key would halt WF2). Per-layer versions preserved too.
      pipeline.emitSummary({
        records_total: null,
        records_new: null,
        records_updated: null,
        records_meta: {
          zoning_layers_loaded: prior?.records_meta?.zoning_layers_loaded ?? {},
          zoning_partial_load: prior?.records_meta?.zoning_partial_load ?? false,
          source_dataset_version: storedVersion,
          zoning_layer_versions: storedLayerVersions,
          base_layer_committed_after_overlays_failed: prior?.records_meta?.base_layer_committed_after_overlays_failed ?? false,
          audit_table: { phase: ADVISORY_LOCK_ID, name: 'Toronto Zoning By-law ingest', verdict: verdictCascade(auditRows), rows: auditRows },
        },
      });
      return { skipped: true };
    }

    const layersLoaded = {};
    const missingLayers = [];
    let baseCommittedThenOverlayFailed = false; // F-M3 (C5)
    let baseOk = false;
    let baseInserted = 0;
    let baseUpdated = 0;
    let baseLoaded = 0;

    for (const layer of LAYERS) {
      const datasetVersion = resourceVersions[layer.resourceId] || String(runAt);
      let records;
      try {
        records = await fetchDatastoreRecords(layer.resourceId);
      } catch (err) {
        const metric = layer.isBase ? 'zoning_areas_fetch_error' : `${layer.key}_fetch_error`;
        auditRows.push({ metric, value: String(err.message), status: layer.isBase ? 'FAIL' : 'WARN' });
        if (layer.isBase) {
          layersLoaded.base = false;
          auditRows.push({ metric: 'zoning_partial_load', value: { missing_layers: ['base'] }, status: 'FAIL' });
          throw err; // D3 base fetch failure → FAIL + abort
        }
        auditRows.push({ metric: `${layer.key}_fetch_skipped`, value: true, status: 'WARN' });
        layersLoaded[layer.key] = false;
        missingLayers.push(layer.key);
        if (baseOk) baseCommittedThenOverlayFailed = true; // C5
        continue;
      }

      let res;
      try {
        res = await loadLayer(pool, layer, records, datasetVersion, prior, auditRows);
      } catch (err) {
        // H1/DeepSeek: a layer-body error must not crash the chain uncaught.
        const metric = layer.isBase ? 'zoning_areas_load_error' : `${layer.key}_load_error`;
        auditRows.push({ metric, value: String(err.message), status: layer.isBase ? 'FAIL' : 'WARN' });
        if (layer.isBase) { layersLoaded.base = false; throw err; }
        layersLoaded[layer.key] = false;
        missingLayers.push(layer.key);
        if (baseOk) baseCommittedThenOverlayFailed = true;
        continue;
      }

      layersLoaded[layer.key] = res.ok;
      if (layer.isBase) {
        // D3 (CodeRev H2): a base non-throw failure (drift / zero rows) must still HALT the chain.
        if (!res.ok) throw new Error('load_zoning: base layer load returned ok=false — aborting chain per D3');
        baseOk = res.ok; baseInserted = res.inserted; baseUpdated = res.updated; baseLoaded = res.loaded;
      } else if (!res.ok) {
        missingLayers.push(layer.key);
        if (baseOk) baseCommittedThenOverlayFailed = true; // C5
      }
    }

    // dataset age from the base resource's last_modified (C4; NaN-safe via ageDaysFrom).
    const ageDays = ageDaysFrom(nowMs, baseVersion);
    auditRows.push({ metric: 'dataset_version_age_days', value: ageDays, status: datasetVersionAgeStatus(ageDays) });

    const recordsMeta = {
      zoning_layers_loaded: layersLoaded,
      zoning_partial_load: missingLayers.length ? { missing_layers: missingLayers } : false,
      source_dataset_version: baseVersion,
      zoning_layer_versions: Object.fromEntries(LAYERS.map((l) => [l.key, resourceVersions[l.resourceId] || null])),
      base_layer_committed_after_overlays_failed: baseCommittedThenOverlayFailed,
      audit_table: {
        phase: ADVISORY_LOCK_ID,
        name: 'Toronto Zoning By-law ingest',
        verdict: verdictCascade(auditRows),
        rows: auditRows,
      },
    };

    // base-only counters (P-C1).
    pipeline.emitSummary({
      records_total: baseLoaded,
      records_new: baseInserted,
      records_updated: baseUpdated,
      records_meta: recordsMeta,
    });

    pipeline.emitMeta(
      Object.fromEntries(LAYERS.map((l) => [l.ckanSource, requiredAttrColumns(l)])),
      Object.fromEntries(LAYERS.map((l) => [l.table, ['source_id', ...l.cols.map((c) => c.col), 'geometry', 'geom', 'source_dataset_version']])),
      ['CKAN'],
    );

    return { baseOk };
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP already
}

if (require.main === module) {
  pipeline.run('load-zoning', main);
}

module.exports = {
  LAYERS,
  requiredAttrColumns,
  parseNum,
  parseHeightLabel,
  coerceSourceId,
  coerceColumn,
  dedupeRejectAll,
  orphanStatus,
  loadedPctStatus,
  loadedCountStatus,
  nullCountStatus,
  withExceptionsStatus,
  durationStatus,
  datasetVersionAgeStatus,
  topNDistribution,
  verdictCascade,
  priorMetricValue,
  skipCheckDecision,
  ageDaysFrom,
};
