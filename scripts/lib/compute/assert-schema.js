/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1
 *
 * CQA Tier 1: Pre-Ingestion Schema Validation — THE DOMAIN LOGIC ONLY.
 *
 * Fetches CKAN metadata for permits and CoA resources, CSV headers for
 * address_points and parcels, GeoJSON property keys for neighbourhoods,
 * and URL accessibility for massing / ravine / heritage / centreline
 * shapefiles. Catches upstream schema drift before ingestion runs.
 *
 * ⚠️ EXTRACTED VERBATIM at pilot 1 commit 7 from scripts/quality/assert-schema.js
 * (606 lines, HEAD 8b857169). Same fetches, same required-column sets, same
 * helpers, same operator-facing messages. What is NOT here — and deliberately so
 * — is every non-compute concern the frozen shape moved into scripts/lib/step/:
 * the pool, the advisory lock, the pipeline_runs ledger row, the strand window,
 * the audit-table assembly, the PASS/WARN/FAIL cascade, PIPELINE_SUMMARY and
 * PIPELINE_META. This module reports OBSERVATIONS against the nine checks the
 * descriptor declares and nothing else; `stepCtx.report()` throws on an id the
 * descriptor does not declare, so the two files cannot silently drift apart.
 *
 * Each source is wrapped in its OWN try/catch, exactly as the pre-conversion
 * step was. That per-check granularity is a property of the COMPUTE, not of the
 * library: a fetch allowed to escape to the top level trades nine audit rows for
 * one error string (scripts/lib/step/index.js documents the same gap).
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
// Spec 61 §8c — two Heritage shapefile ZIPs (reachability only; STATUS/HCD_TYPE +
// OBJECTID/HCD_NO attribute presence validated post-download in load-heritage.js).
const HERITAGE_REGISTER_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/e41da515-5ad1-4bc3-85ea-18ec9e55cd33/resource/108b1080-d048-439f-a9e8-e8d6cd81bddb/download/heritage_register_address_points_wgs84.zip';
const HERITAGE_HCD_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/37a3c911-0813-4e87-90ed-3b9fa6156a63/resource/8e6b9347-63a8-4dac-91fb-a6491a8c1e5a/download/heritageconservationdistrict.zip';
// Spec 62 §8c — Toronto Centreline shapefile ZIP (reachability only; the 40-col attribute /
// FEATURE_CODE_DESC + JURISDICTION value validation runs post-download in load-centreline.js).
const CENTRELINE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/d86bdca4-ab2c-470d-80fb-34647ea0e87f/download/centreline-version-2-4326.zip';
const NEIGHBOURHOODS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson';

// The reachability set — descriptor `source_archives_reachable.expect.http_head_ok`
// names the same five externals. Fences 1ceebd17 (ravine) and f6047e89 (centreline)
// live in this list AND in inputs.reads.externals; removing either from one place
// without the other is what the G4d locks detect.
const SOURCE_ARCHIVES = [
  { url: MASSING_URL, label: '3D Massing' },
  { url: RAVINE_URL, label: 'Ravine Protection' },
  { url: HERITAGE_REGISTER_URL, label: 'Heritage Register' },
  { url: HERITAGE_HCD_URL, label: 'Heritage Conservation Districts' },
  { url: CENTRELINE_URL, label: 'Toronto Centreline' },
];

// Expected CSV columns for source data.
//
// WF1 #parcel-address-bridge (2026-05-23) — Address Points dataset is now the
// canonical source for ADDRESS_NUMBER + LINEAR_NAME_FULL (Toronto stripped them
// from the Property Boundaries CSV on 2026-05-20). EXPECTED_ADDRESS_POINT_COLUMNS
// expanded to include the 10 fields Buildo now loads (per mig 162 + load-address-points
// extension). EXPECTED_PARCEL_COLUMNS shrunk to the 4 surviving columns; the 3 removed
// columns (ADDRESS_NUMBER, LINEAR_NAME_FULL, DATE_EFFECTIVE) are kept as LEGACY columns
// on the parcels table but no longer required from the source CSV.
// Coordinate columns are NOT in this flat list — they have an OR-contract checked
// separately via hasCoordinateSource (geometry OR LATITUDE+LONGITUDE).
// [WF3 2026-05-30] The earlier flat LATITUDE/LONGITUDE requirement was dead-on-arrival:
// the live Address Points CSV ships a `geometry` GeoJSON column (NOT LATITUDE/LONGITUDE),
// and load-address-points.js derives geom + lat/lng from `geometry` (primary, :285-301),
// falling back to LATITUDE+LONGITUDE (:304) only if geometry is absent. The geom backfill
// reads the DB latitude/longitude COLUMNS, not the CSV. So the coordinate-loss guard is
// "no coordinate source present" (below), not "LAT/LONG present".
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
// Neighbourhood GeoJSON: at least one of these ID properties must exist
const NEIGHBOURHOOD_ID_PROPS = ['AREA_SHORT_CODE', 'AREA_ID'];

// Toronto Zoning By-law — 10 CKAN DataStore resources (Spec 58). Pre-flight
// reachability + upsert-key/geometry presence; full attribute drift is
// enforced at load time by scripts/lib/zoning-attr-drift.js.
// Fence 58914fa8: THREE distinct required sets, not two. The descriptor's
// `zoning_resource_columns.expect.resources` map is the declared twin of this list.
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

async function fetchFieldNames(resourceId, label) {
  const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=0`;
  console.log(`  Fetching metadata for ${label}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CKAN metadata fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success || !json.result || !json.result.fields) {
    throw new Error(`CKAN response missing fields array for ${label}`);
  }

  return json.result.fields.map((f) => f.id);
}

function checkColumns(actualFields, expectedColumns, label) {
  const missing = expectedColumns.filter((col) => !actualFields.includes(col));
  if (missing.length > 0) {
    console.error(`  FAIL: ${label} is missing columns: ${missing.join(', ')}`);
    return false;
  }
  console.log(`  OK: ${label} — all ${expectedColumns.length} expected columns present (${actualFields.length} total)`);
  return true;
}

/**
 * Check if a cost string is a CKAN sentinel/junk row (not real data).
 * Mirrors the guard in load-permits.js cleanCost().
 */
function isSentinelValue(v) {
  if (!v || typeof v !== 'string') return false;
  const u = v.toUpperCase();
  return u.includes('DO NOT UPDATE') || u.includes('DO NOT DELETE');
}

/**
 * Parse a cost value the same way load-permits.js cleanCost() does:
 * strip non-numeric chars (commas, $, spaces) then parseFloat.
 */
function parseCost(v) {
  if (!v || String(v).trim() === '') return NaN;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return parseFloat(s);
}

async function validateTypeSample(resourceId, label) {
  const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=20`;
  const res = await fetch(url);
  if (!res.ok) return true; // non-fatal

  const json = await res.json();
  const records = json?.result?.records;
  if (!records || records.length === 0) {
    console.log(`  WARN: ${label} — no records available for type check`);
    return true;
  }

  // Permits: check EST_CONST_COST is parseable as number.
  // Filter out sentinel/junk rows that CKAN injects (e.g.
  // "DO NOT UPDATE OR DELETE THIS INFO FIELD") and strip commas
  // from formatted numbers (e.g. "1,000") — mirrors cleanCost()
  // in load-permits.js.
  const costRows = records.filter(
    (r) => r.EST_CONST_COST !== undefined && r.EST_CONST_COST !== null
        && r.EST_CONST_COST !== '' && !isSentinelValue(r.EST_CONST_COST)
  );
  if (costRows.length > 0) {
    const dataRows = costRows.filter((r) => !isNaN(parseCost(r.EST_CONST_COST)));
    if (dataRows.length === 0) {
      console.error(`  FAIL: ${label} — no sampled rows have parseable EST_CONST_COST`);
      return false;
    }
    const skipped = costRows.length - dataRows.length;
    if (skipped > 0) {
      console.log(`  OK: ${label} — EST_CONST_COST verified (${dataRows.length}/${costRows.length} rows numeric, ${skipped} unparseable rows skipped)`);
    } else {
      console.log(`  OK: ${label} — EST_CONST_COST type coercion verified`);
    }
  } else {
    console.warn(`  WARN: ${label} — all sampled rows are sentinel/empty for EST_CONST_COST, skipping type check`);
  }

  return true;
}

/**
 * Fetch the first chunk of a CSV file and extract the header row column names.
 */
async function fetchCsvHeaders(url, label) {
  console.log(`  Fetching CSV headers for ${label}...`);
  const res = await fetch(url, { headers: { Range: 'bytes=0-2048' } });
  // Some servers ignore Range and return 200 with full body — that's fine
  if (!res.ok && res.status !== 206) {
    throw new Error(`CSV fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const chunk = await res.text();
  const firstLine = chunk.split(/\r?\n/)[0];
  if (!firstLine) {
    throw new Error(`Empty CSV header for ${label}`);
  }
  // Parse CSV header — handle quoted column names
  return firstLine.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
}

/**
 * Fetch the first chunk of a GeoJSON file and extract property keys from the first feature.
 */
async function fetchGeoJsonPropertyKeys(url, label) {
  console.log(`  Fetching GeoJSON properties for ${label}...`);
  const res = await fetch(url, { headers: { Range: 'bytes=0-8192' } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`GeoJSON fetch failed for ${label}: ${res.status} ${res.statusText}`);
  }
  const chunk = await res.text();
  // Skip to first Feature to avoid matching CRS "properties":{"name":"..."} block
  const featureStart = chunk.indexOf('"Feature"');
  const searchChunk = featureStart >= 0 ? chunk.slice(featureStart) : chunk;
  // Extract first "properties":{...} block via regex (avoids parsing incomplete JSON)
  const match = searchChunk.match(/"properties"\s*:\s*\{([^}]+)\}/);
  if (!match) {
    throw new Error(`Could not find properties in GeoJSON for ${label}`);
  }
  // Extract key names from the properties object fragment
  const keys = [];
  const keyPattern = /"([^"]+)"\s*:/g;
  for (const m of match[1].matchAll(keyPattern)) {
    keys.push(m[1]);
  }
  return keys;
}

/**
 * HTTP HEAD request to check URL accessibility (for binary files like shapefiles).
 */
async function checkUrlAccessible(url, label) {
  console.log(`  Checking URL accessibility for ${label}...`);
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    throw new Error(`URL not accessible for ${label}: ${res.status} ${res.statusText}`);
  }
  console.log(`  OK: ${label} — URL accessible (${res.status})`);
  return true;
}

/**
 * The nine declared checks, reported as observations.
 *
 * ⚠️ PEEL 8b — ERRORS ARE ATTRIBUTED BY CHECK ID, NOT BY SUBSTRING. The
 * pre-conversion step decided which audit row an error belonged to by matching the
 * message text (`includes('permit')`, `includes('coa')`, and a
 * `zoning|ravine|centreline|…` alternation at `assert-schema.js:536`) — AS-D6, and
 * the reason AS-D1's sources verdict read a raw `sourceErrors.length` instead of the
 * rows. Every check now owns its own try/catch and hands the library
 * `report(<checkId>, { error })`, so `scripts/lib/step/verdict.js` `checkRow` turns
 * it into ONE row keyed by that check id and `deriveVerdict` reads the verdict off
 * the rows. Two consequences: adding a source no longer carries an unrecorded
 * "add a regex token" obligation, and a check that throws no longer suppresses the
 * checks after it — the outer catch that used to swallow the whole run into one
 * `ERROR:` line is gone, so an unexpected throw reaches the library and fails the
 * step loudly instead of leaving eight checks silently unreported.
 *
 * ⚠️ PEEL 8a — THE COMPUTE NO LONGER KNOWS WHAT A CHAIN IS. `stepCtx.checks` is
 * the SELECTED check-id list, derived by the library from
 * `sharing.varies_by_chain.checks` + `checks[].chains`
 * (`scripts/lib/step/verdict.js` `selectChecks`) — the same selection
 * `buildAuditTable` scores. What used to be three `chainId === '<chain>'` booleans
 * here is now one membership test per declared check, so the descriptor is the ONLY
 * place a chain appears and the two can no longer disagree. `process.env` is not
 * read: `PIPELINE_CHAIN` reaches this module through the library or not at all.
 *
 * @param {{checks: string[], report: (checkId: string, observation: object) => void}} stepCtx
 * @returns {Promise<void>}
 */
async function compute(stepCtx) {
  const selected = new Set(stepCtx.checks);
  const runs = (id) => selected.has(id);

  console.log('\n=== CQA Tier 1: Schema Validation ===\n');

  // Check permits resource
  if (runs('permit_columns')) {
    try {
      const permitFields = await fetchFieldNames(PERMITS_RESOURCE_ID, 'Building Permits');
      const permitColumnsOk = checkColumns(permitFields, EXPECTED_PERMIT_COLUMNS, 'Building Permits');
      stepCtx.report('permit_columns', { violations: permitColumnsOk ? 0 : 1 });
    } catch (err) {
      console.error(`  FAIL: Building Permits — ${err.message}`);
      stepCtx.report('permit_columns', { error: err });
    }
  }

  if (runs('permit_cost_type_sample')) {
    try {
      const permitTypeOk = await validateTypeSample(PERMITS_RESOURCE_ID, 'Building Permits');
      stepCtx.report('permit_cost_type_sample', { violations: permitTypeOk ? 0 : 1 });
    } catch (err) {
      console.error(`  FAIL: Building Permits (cost type sample) — ${err.message}`);
      stepCtx.report('permit_cost_type_sample', { error: err });
    }
  }

  // Check CoA active resource
  if (runs('coa_columns')) {
    try {
      const coaFields = await fetchFieldNames(COA_ACTIVE_RESOURCE_ID, 'CoA Active');
      const coaColumnsOk = checkColumns(coaFields, EXPECTED_COA_COLUMNS, 'CoA Active');
      stepCtx.report('coa_columns', { violations: coaColumnsOk ? 0 : 1 });
    } catch (err) {
      console.error(`  FAIL: CoA Active — ${err.message}`);
      stepCtx.report('coa_columns', { error: err });
    }
  }

  // ------------------------------------------------------------------
  // Source data validation
  // ------------------------------------------------------------------

  // Address Points CSV — one fetch, two declared checks over the same header row.
  if (runs('address_point_columns') || runs('address_point_coordinate_source')) {
    try {
      const apHeaders = await fetchCsvHeaders(ADDRESS_POINTS_URL, 'Address Points');
      if (runs('address_point_columns')) {
        const apColumnsOk = checkColumns(apHeaders, EXPECTED_ADDRESS_POINT_COLUMNS, 'Address Points');
        stepCtx.report('address_point_columns', { violations: apColumnsOk ? 0 : 1 });
      }
      if (runs('address_point_coordinate_source')) {
        // Coordinate-source contract (WF3 2026-05-30): geometry OR LATITUDE+LONGITUDE.
        // The live CSV ships `geometry`; LAT/LONG are an accepted fallback. FAIL only
        // if NEITHER is present (the real "0-row spatial bridge" loss mode).
        const coordinateOk = hasCoordinateSource(new Set(apHeaders));
        if (!coordinateOk) {
          console.error('  FAIL: Address Points — no coordinate source column present');
        }
        stepCtx.report('address_point_coordinate_source', { violations: coordinateOk ? 0 : 1 });
      }
    } catch (err) {
      console.error(`  FAIL: Address Points — ${err.message}`);
      if (runs('address_point_columns')) stepCtx.report('address_point_columns', { error: err });
      if (runs('address_point_coordinate_source')) stepCtx.report('address_point_coordinate_source', { error: err });
    }
  }

  // Parcels CSV. Selected in permits, coa AND sources (Spec 79 CRIT-3a): peel 8a
  // retires the constant `{violations: 0}` the permits/coa audit tables carried,
  // so the row now says "we looked" wherever it appears.
  if (runs('parcel_columns')) {
    try {
      const parcelHeaders = await fetchCsvHeaders(PARCELS_URL, 'Parcels');
      const parcelColumnsOk = checkColumns(parcelHeaders, EXPECTED_PARCEL_COLUMNS, 'Parcels');
      stepCtx.report('parcel_columns', { violations: parcelColumnsOk ? 0 : 1 });
    } catch (err) {
      console.error(`  FAIL: Parcels — ${err.message}`);
      stepCtx.report('parcel_columns', { error: err });
    }
  }

  // Massing / Ravine / Heritage x2 / Centreline shapefile ZIPs — accessibility
  // check only. datastore_active=false for each, so no field-set check is
  // possible pre-download; the attribute contracts are validated post-download
  // inside load-ravines.js (Spec 59 §8c), load-heritage.js (Spec 61 §8c) and
  // load-centreline.js (Spec 62 §8c). One try per archive, exactly as before:
  // one unreachable archive must not hide the other four.
  if (runs('source_archives_reachable')) {
    let archiveFailures = 0;
    for (const archive of SOURCE_ARCHIVES) {
      try {
        await checkUrlAccessible(archive.url, archive.label);
      } catch (err) {
        archiveFailures += 1;
        console.error(`  FAIL: ${archive.label} — ${err.message}`);
      }
    }
    stepCtx.report('source_archives_reachable', { violations: archiveFailures });
  }

  // Neighbourhoods GeoJSON — property key validation
  if (runs('neighbourhood_id_property')) {
    try {
      const nhoodKeys = await fetchGeoJsonPropertyKeys(NEIGHBOURHOODS_URL, 'Neighbourhoods');
      const hasIdProp = NEIGHBOURHOOD_ID_PROPS.some((p) => nhoodKeys.includes(p));
      if (!hasIdProp) {
        console.error(`  FAIL: Neighbourhoods — no ID property found in: ${nhoodKeys.join(', ')}`);
      } else {
        console.log(`  OK: Neighbourhoods — ID property found (${nhoodKeys.length} total properties)`);
      }
      stepCtx.report('neighbourhood_id_property', { violations: hasIdProp ? 0 : 1 });
    } catch (err) {
      console.error(`  FAIL: Neighbourhoods — ${err.message}`);
      stepCtx.report('neighbourhood_id_property', { error: err });
    }
  }

  // Toronto Zoning By-law — 10 CKAN DataStore resources (Spec 58).
  if (runs('zoning_resource_columns')) {
    let zoningFailures = 0;
    for (const zr of ZONING_RESOURCES) {
      try {
        const fields = await fetchFieldNames(zr.id, zr.label);
        if (!checkColumns(fields, zr.required, zr.label)) {
          zoningFailures += 1;
        }
      } catch (err) {
        zoningFailures += 1;
        console.error(`  FAIL: ${zr.label} — ${err.message}`);
      }
    }
    stepCtx.report('zoning_resource_columns', { violations: zoningFailures });
  }
}

module.exports = compute;
module.exports.compute = compute;
