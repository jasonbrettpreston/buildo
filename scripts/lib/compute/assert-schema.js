/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 *
 * CQA Tier 1: Pre-Ingestion Schema Validation — THE DOMAIN LOGIC ONLY.
 *
 * Fetches CKAN metadata for permits and CoA resources, CSV headers for
 * address_points and parcels, GeoJSON property keys for neighbourhoods,
 * and URL accessibility for massing / ravine / heritage / centreline
 * shapefiles. Catches upstream schema drift before ingestion runs.
 *
 * ⚠️ THIS FILE IS SHAPED BY §5.5 (PROPOSED at pilot 1 peel 8c, ratify at C3) and
 * enforced by scripts/ast-grep-rules/compute-shape.yml over scripts/lib/compute/**:
 *
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, name === check id, gathered in the
 *      CHECKS dispatch table at the bottom and exported, so a test can call any
 *      single check without running the other eight.
 *   2. `compute(ctx)` iterates `ctx.checks` — the SELECTED check ids the library
 *      hands it — and does nothing else. It contains no domain logic and no chain.
 *   3. EVERY OBSERVATION GOES THROUGH `ctx.report(<checkId>, …)`. There is no
 *      `console.*` in this file: operator narration goes through the `ctx.log`
 *      seam, so a caller can silence or capture it.
 *   4. EVERY I/O CALL GOES THROUGH AN INJECTED SEAM — `ctx.fetch` (never bare
 *      `fetch(`), `ctx.clock` (never `Date.now()`). No `process.env`, no `pg`, no
 *      `fs`: a compute that can reach those is a compute a test cannot pin.
 *   5. Check functions appear in DESCRIPTOR ORDER; everything reusable lives below
 *      the `// ---- helpers ----` marker; policy text lives in the descriptor's
 *      `checks[].why`, not in a comment here.
 *
 * ⚠️ PEEL 8b — ERRORS ARE ATTRIBUTED BY CHECK ID, NOT BY SUBSTRING. The
 * pre-conversion step decided which audit row an error belonged to by matching the
 * message text (`includes('permit')`, `includes('coa')`, and a
 * `zoning|ravine|centreline|…` alternation at `assert-schema.js:536`) — AS-D6, and
 * the reason AS-D1's sources verdict read a raw `sourceErrors.length` instead of the
 * rows. The dispatch loop is now the error boundary: whatever a check function
 * throws is reported as `{ error }` under THAT check's id, so
 * `scripts/lib/step/verdict.js` renders one row keyed by the check and
 * `deriveVerdict` reads the verdict off the rows.
 *
 * ⚠️ PEEL 8a — THE COMPUTE NO LONGER KNOWS WHAT A CHAIN IS. `ctx.checks` is the
 * SELECTED check-id list, derived by the library from
 * `sharing.varies_by_chain.checks` + `checks[].chains`
 * (`scripts/lib/step/verdict.js` `selectChecks`) — the same selection
 * `buildAuditTable` scores. The descriptor is the only place a chain appears.
 *
 * What is NOT here — and deliberately so — is every non-compute concern the frozen
 * shape moved into scripts/lib/step/: the pool, the advisory lock, the
 * pipeline_runs ledger row, the strand window, the audit-table assembly, the
 * PASS/WARN/FAIL cascade, PIPELINE_SUMMARY and PIPELINE_META. `ctx.report()` throws
 * on an id the descriptor does not declare, so the two files cannot silently drift.
 */
'use strict';

const { hasCoordinateSource } = require('../address-points-csv-drift');

const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';

// Resource IDs
const PERMITS_RESOURCE_ID = '6d0229af-bc54-46de-9c2b-26759b01dd05';
const COA_ACTIVE_RESOURCE_ID = '51fd09cd-99d6-430a-9d42-c24a937b0cb0';

// Expected columns per resource
const EXPECTED_PERMIT_COLUMNS = [
  'PERMIT_NUM', 'REVISION_NUM', 'PERMIT_TYPE', 'STATUS',
  'DESCRIPTION', 'EST_CONST_COST', 'STREET_NUM', 'STREET_NAME',
  'BUILDER_NAME', 'ISSUED_DATE', 'APPLICATION_DATE',
];

// Active resource columns only — CONTACT_NAME and WARD_NUMBER are Closed-resource-only.
// Active uses WARD (text), Closed uses WARD_NUMBER (int4). Both handled in load-coa.js mapRecord.
const EXPECTED_COA_COLUMNS = [
  'REFERENCE_FILE#', 'IN_DATE', 'STATUSDESC',
  'STREET_NUM', 'STREET_NAME', 'STREET_TYPE',
  'C_OF_A_DESCISION', 'HEARING_DATE', 'WARD',
  'DESCRIPTION', 'SUB_TYPE',
];

// Source data download URLs
const ADDRESS_POINTS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/abedd8bc-e3dd-4d45-8e69-79165a76e4fa/resource/64d4e54b-738f-4cd9-a9e7-8050fac8a52f/download/address-points-4326.csv';
const PARCELS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/property-boundaries/resource/23d1f792-018f-4069-ac5d-443e932e1b78/download/Property%20Boundaries%20-%204326.csv';
const MASSING_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/387b2e3b-2a76-4199-8b3b-0b7d22e2ec10/resource/667237d6-4d3c-4cf3-8cb7-e91c48d59375/download/3dmassingshapefile_2025_wgs84.zip';
const RAVINE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/ravine-natural-feature-protection-area/resource/bb81bb0f-f88a-4f3e-bca7-a328154ba31b/download/ravine-natural-feature-protection-area-wgs84.zip';
const HERITAGE_REGISTER_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/e41da515-5ad1-4bc3-85ea-18ec9e55cd33/resource/108b1080-d048-439f-a9e8-e8d6cd81bddb/download/heritage_register_address_points_wgs84.zip';
const HERITAGE_HCD_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/37a3c911-0813-4e87-90ed-3b9fa6156a63/resource/8e6b9347-63a8-4dac-91fb-a6491a8c1e5a/download/heritageconservationdistrict.zip';
const CENTRELINE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/d86bdca4-ab2c-470d-80fb-34647ea0e87f/download/centreline-version-2-4326.zip';
const NEIGHBOURHOODS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson';

// The reachability subject set — the declared twin is
// `source_archives_reachable.expect.http_head_ok` + `inputs.reads.externals`.
const SOURCE_ARCHIVES = [
  { url: MASSING_URL, label: '3D Massing' },
  { url: RAVINE_URL, label: 'Ravine Protection' },
  { url: HERITAGE_REGISTER_URL, label: 'Heritage Register' },
  { url: HERITAGE_HCD_URL, label: 'Heritage Conservation Districts' },
  { url: CENTRELINE_URL, label: 'Toronto Centreline' },
];

// Declared twins: `address_point_columns.expect` / `parcel_columns.expect`. The
// coordinate columns are deliberately absent from the flat list — their OR-contract
// is the separate check `address_point_coordinate_source`.
const EXPECTED_ADDRESS_POINT_COLUMNS = [
  'ADDRESS_POINT_ID',
  'ADDRESS_NUMBER',
  'LINEAR_NAME_FULL',
  'ADDRESS_FULL',
  'LO_NUM',
  'HI_NUM',
  'MAINT_STAGE',
  'ADDRESS_STATUS',
  'ADDRESS_CLASS_DESC',
  'CLASS_FAMILY_DESC',
  'PLACE_NAME',
];
const EXPECTED_PARCEL_COLUMNS = [
  'PARCELID',
  'FEATURE_TYPE',
  'STATEDAREA',
  'geometry',
];
const NEIGHBOURHOOD_ID_PROPS = ['AREA_SHORT_CODE', 'AREA_ID'];

// Declared twin: `zoning_resource_columns.expect.resources` — three distinct
// required sets over 10 CKAN DataStore resources.
const ZONING_RESOURCES = [
  { id: '76a2620f-a6b4-495d-8e41-c0ede1f8a928', label: 'Zoning Area (base)', required: ['_id', 'geometry', 'ZN_ZONE', 'ZN_STRING', 'COVERAGE', 'FSI_TOTAL'] },
  { id: 'f0a88d06-2430-4025-b15d-362cabd00f31', label: 'Zoning Height Overlay', required: ['_id', 'geometry', 'HT_LABEL'] },
  { id: '58ad8814-ca4e-43d6-848d-d5fd8d873574', label: 'Zoning Lot Coverage Overlay', required: ['_id', 'geometry', 'PRCNT_CVER'] },
  { id: '8d75cab6-ab97-4158-8ba5-8874860b26f7', label: 'Zoning Building Setback Overlay', required: ['_id', 'geometry'] },
  { id: '1a6469f8-1eaf-4ba6-a1f6-07179efbc2f2', label: 'Zoning Policy Area Overlay', required: ['_id', 'geometry'] },
  { id: '4e2f9292-6082-4627-be8e-61b87a2cb273', label: 'Zoning Policy Road Overlay', required: ['_id', 'geometry'] },
  { id: '75b9805b-bc65-4c30-97fa-9c57c17233b2', label: 'Zoning Rooming House Overlay', required: ['_id', 'geometry'] },
  { id: '8f969df7-9008-49fd-a50b-df53f1f680e6', label: 'Zoning Parking Zone Overlay', required: ['_id', 'geometry'] },
  { id: '499de5f6-194a-4da3-a18f-27a8e684721d', label: 'Zoning Priority Retail Street Overlay', required: ['_id', 'geometry'] },
  { id: '1f18bd73-bbbc-4ad6-ac27-6c9cae7385b4', label: 'Zoning QueenStW Eat Community Overlay', required: ['_id', 'geometry'] },
];

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

async function permit_columns(ctx) {
  const fields = await fetchFieldNames(ctx, PERMITS_RESOURCE_ID, 'Building Permits');
  const ok = checkColumns(ctx, fields, EXPECTED_PERMIT_COLUMNS, 'Building Permits');
  ctx.report('permit_columns', { violations: ok ? 0 : 1 });
}

async function permit_cost_type_sample(ctx) {
  const ok = await validateTypeSample(ctx, PERMITS_RESOURCE_ID, 'Building Permits');
  ctx.report('permit_cost_type_sample', { violations: ok ? 0 : 1 });
}

async function coa_columns(ctx) {
  const fields = await fetchFieldNames(ctx, COA_ACTIVE_RESOURCE_ID, 'CoA Active');
  const ok = checkColumns(ctx, fields, EXPECTED_COA_COLUMNS, 'CoA Active');
  ctx.report('coa_columns', { violations: ok ? 0 : 1 });
}

async function address_point_columns(ctx) {
  const headers = await csvHeaders(ctx, ADDRESS_POINTS_URL, 'Address Points');
  const ok = checkColumns(ctx, headers, EXPECTED_ADDRESS_POINT_COLUMNS, 'Address Points');
  ctx.report('address_point_columns', { violations: ok ? 0 : 1 });
}

async function address_point_coordinate_source(ctx) {
  const headers = await csvHeaders(ctx, ADDRESS_POINTS_URL, 'Address Points');
  const ok = hasCoordinateSource(new Set(headers));
  if (!ok) ctx.log.error(tag(ctx), 'FAIL: Address Points — no coordinate source column present');
  ctx.report('address_point_coordinate_source', { violations: ok ? 0 : 1 });
}

async function parcel_columns(ctx) {
  const headers = await csvHeaders(ctx, PARCELS_URL, 'Parcels');
  const ok = checkColumns(ctx, headers, EXPECTED_PARCEL_COLUMNS, 'Parcels');
  ctx.report('parcel_columns', { violations: ok ? 0 : 1 });
}

async function source_archives_reachable(ctx) {
  // One try per archive: one unreachable archive must not hide the other four.
  let failures = 0;
  for (const archive of SOURCE_ARCHIVES) {
    try {
      await checkUrlAccessible(ctx, archive.url, archive.label);
    } catch (err) {
      failures += 1;
      ctx.log.error(tag(ctx), `FAIL: ${archive.label} — ${err.message}`);
    }
  }
  ctx.report('source_archives_reachable', { violations: failures });
}

async function neighbourhood_id_property(ctx) {
  const keys = await fetchGeoJsonPropertyKeys(ctx, NEIGHBOURHOODS_URL, 'Neighbourhoods');
  const ok = NEIGHBOURHOOD_ID_PROPS.some((p) => keys.includes(p));
  if (!ok) ctx.log.error(tag(ctx), `FAIL: Neighbourhoods — no ID property found in: ${keys.join(', ')}`);
  else ctx.log.info(tag(ctx), `OK: Neighbourhoods — ID property found (${keys.length} total properties)`);
  ctx.report('neighbourhood_id_property', { violations: ok ? 0 : 1 });
}

async function zoning_resource_columns(ctx) {
  // One try per resource, for the same reason as the archive loop.
  let failures = 0;
  for (const zr of ZONING_RESOURCES) {
    try {
      const fields = await fetchFieldNames(ctx, zr.id, zr.label);
      if (!checkColumns(ctx, fields, zr.required, zr.label)) failures += 1;
    } catch (err) {
      failures += 1;
      ctx.log.error(tag(ctx), `FAIL: ${zr.label} — ${err.message}`);
    }
  }
  ctx.report('zoning_resource_columns', { violations: failures });
}

// ---- helpers ----

/** The log tag, from the descriptor — never a literal, so a rename cannot desync it. */
function tag(ctx) {
  return `[${ctx.descriptor.identity.name}]`;
}

/**
 * Per-invocation memo for ranged CSV header reads. `address_point_columns` and
 * `address_point_coordinate_source` are two declared checks over ONE header row;
 * without the memo, splitting them into two dispatch entries would double the
 * request count. Keyed by ctx so nothing survives the run.
 */
const CSV_HEADER_MEMO = new WeakMap();

function csvHeaders(ctx, url, label) {
  let byUrl = CSV_HEADER_MEMO.get(ctx);
  if (!byUrl) {
    byUrl = new Map();
    CSV_HEADER_MEMO.set(ctx, byUrl);
  }
  if (!byUrl.has(url)) byUrl.set(url, fetchCsvHeaders(ctx, url, label));
  return byUrl.get(url);
}

async function fetchFieldNames(ctx, resourceId, label) {
  const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=0`;
  ctx.log.info(tag(ctx), `Fetching metadata for ${label}...`);

  const res = await ctx.fetch(url);
  if (!res.ok) {
    throw new Error(`CKAN metadata fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success || !json.result || !json.result.fields) {
    throw new Error(`CKAN response missing fields array for ${label}`);
  }

  return json.result.fields.map((f) => f.id);
}

function checkColumns(ctx, actualFields, expectedColumns, label) {
  const missing = expectedColumns.filter((col) => !actualFields.includes(col));
  if (missing.length > 0) {
    ctx.log.error(tag(ctx), `FAIL: ${label} is missing columns: ${missing.join(', ')}`);
    return false;
  }
  ctx.log.info(tag(ctx), `OK: ${label} — all ${expectedColumns.length} expected columns present (${actualFields.length} total)`);
  return true;
}

/** A CKAN sentinel/junk row (not real data). Mirrors the guard in load-permits.js cleanCost(). */
function isSentinelValue(v) {
  if (!v || typeof v !== 'string') return false;
  const u = v.toUpperCase();
  return u.includes('DO NOT UPDATE') || u.includes('DO NOT DELETE');
}

/** Parse a cost value the same way load-permits.js cleanCost() does. */
function parseCost(v) {
  if (!v || String(v).trim() === '') return NaN;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return parseFloat(s);
}

async function validateTypeSample(ctx, resourceId, label) {
  const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=20`;
  const res = await ctx.fetch(url);
  if (!res.ok) return true; // non-fatal — declared in the descriptor's limitations[]

  const json = await res.json();
  const records = json && json.result ? json.result.records : undefined;
  if (!records || records.length === 0) {
    ctx.log.warn(tag(ctx), `WARN: ${label} — no records available for type check`);
    return true;
  }

  const costRows = records.filter(
    (r) => r.EST_CONST_COST !== undefined && r.EST_CONST_COST !== null
        && r.EST_CONST_COST !== '' && !isSentinelValue(r.EST_CONST_COST)
  );
  if (costRows.length > 0) {
    const dataRows = costRows.filter((r) => !isNaN(parseCost(r.EST_CONST_COST)));
    if (dataRows.length === 0) {
      ctx.log.error(tag(ctx), `FAIL: ${label} — no sampled rows have parseable EST_CONST_COST`);
      return false;
    }
    const skipped = costRows.length - dataRows.length;
    if (skipped > 0) {
      ctx.log.info(tag(ctx), `OK: ${label} — EST_CONST_COST verified (${dataRows.length}/${costRows.length} rows numeric, ${skipped} unparseable rows skipped)`);
    } else {
      ctx.log.info(tag(ctx), `OK: ${label} — EST_CONST_COST type coercion verified`);
    }
  } else {
    ctx.log.warn(tag(ctx), `WARN: ${label} — all sampled rows are sentinel/empty for EST_CONST_COST, skipping type check`);
  }

  return true;
}

/** Fetch the first chunk of a CSV file and extract the header row column names. */
async function fetchCsvHeaders(ctx, url, label) {
  ctx.log.info(tag(ctx), `Fetching CSV headers for ${label}...`);
  const res = await ctx.fetch(url, { headers: { Range: 'bytes=0-2048' } });
  // Some servers ignore Range and return 200 with full body — that's fine
  if (!res.ok && res.status !== 206) {
    throw new Error(`CSV fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const chunk = await res.text();
  const firstLine = chunk.split(/\r?\n/)[0];
  if (!firstLine) {
    throw new Error(`Empty CSV header for ${label}`);
  }
  return firstLine.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
}

/** Fetch the first chunk of a GeoJSON file and extract property keys from the first feature. */
async function fetchGeoJsonPropertyKeys(ctx, url, label) {
  ctx.log.info(tag(ctx), `Fetching GeoJSON properties for ${label}...`);
  const res = await ctx.fetch(url, { headers: { Range: 'bytes=0-8192' } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`GeoJSON fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const chunk = await res.text();
  // Skip to first Feature to avoid matching CRS "properties":{"name":"..."} block
  const featureStart = chunk.indexOf('"Feature"');
  const searchChunk = featureStart >= 0 ? chunk.slice(featureStart) : chunk;
  const match = searchChunk.match(/"properties"\s*:\s*\{([^}]+)\}/);
  if (!match) {
    throw new Error(`Could not find properties in GeoJSON for ${label}`);
  }
  const keys = [];
  const keyPattern = /"([^"]+)"\s*:/g;
  for (const m of match[1].matchAll(keyPattern)) {
    keys.push(m[1]);
  }
  return keys;
}

/** HTTP HEAD request to check URL accessibility (for binary files like shapefiles). */
async function checkUrlAccessible(ctx, url, label) {
  ctx.log.info(tag(ctx), `Checking URL accessibility for ${label}...`);
  const res = await ctx.fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`URL not accessible for ${label}: ${res.status} ${res.statusText}`);
  }
  ctx.log.info(tag(ctx), `OK: ${label} — URL accessible (${res.status})`);
  return true;
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  permit_columns,
  permit_cost_type_sample,
  coa_columns,
  address_point_columns,
  address_point_coordinate_source,
  parcel_columns,
  source_archives_reachable,
  neighbourhood_id_property,
  zoning_resource_columns,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * The loop is the error boundary (peel 8b): whatever a check throws becomes
 * `{ error }` under that check's own id, so one failing check never suppresses the
 * checks after it and never lands on another check's audit row.
 *
 * @param {{checks: string[], report: Function, log: object, fetch: Function, descriptor: object}} ctx
 * @returns {Promise<void>}
 */
async function compute(ctx) {
  ctx.log.info(tag(ctx), '=== CQA Tier 1: Schema Validation ===');
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`${tag(ctx)} descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(tag(ctx), `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
