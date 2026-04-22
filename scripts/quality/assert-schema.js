#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 *
 * CQA Tier 1: Pre-Ingestion Schema Validation
 *
 * Fetches CKAN metadata for permits and CoA resources, CSV headers for
 * address_points and parcels, GeoJSON property keys for neighbourhoods,
 * and URL accessibility for massing shapefiles. Catches upstream schema
 * drift before ingestion runs.
 *
 * Usage: node scripts/quality/assert-schema.js
 *
 * Exit 0 = pass (all expected columns present)
 * Exit 1 = fail (missing columns detected)
 */
const pipeline = require('../lib/pipeline');

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
const NEIGHBOURHOODS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson';

// Expected CSV columns for source data
const EXPECTED_ADDRESS_POINT_COLUMNS = ['ADDRESS_POINT_ID', 'geometry'];
const EXPECTED_PARCEL_COLUMNS = [
  'PARCELID', 'FEATURE_TYPE', 'ADDRESS_NUMBER', 'LINEAR_NAME_FULL',
  'STATEDAREA', 'geometry', 'DATE_EFFECTIVE',
];
// Neighbourhood GeoJSON: at least one of these ID properties must exist
const NEIGHBOURHOOD_ID_PROPS = ['AREA_SHORT_CODE', 'AREA_ID'];

const SLUG = 'assert_schema';
const ADVISORY_LOCK_ID = 102;

// When run from a chain (via run-chain.js), PIPELINE_CHAIN env var is set.
// The chain orchestrator handles its own pipeline_runs tracking, so we skip
// inserting our own row. Also scopes which checks to run.
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

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

pipeline.run('assert-schema', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  console.log('\n=== CQA Tier 1: Schema Validation ===\n'); // eslint-disable-line no-console

  const startMs = Date.now();
  let runId = null;

  // Skip own pipeline_runs tracking when run from a chain — the chain
  // orchestrator inserts chain-scoped rows (e.g. permits:assert_schema).
  if (!CHAIN_ID) {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running') RETURNING id`,
        [SLUG]
      );
      runId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[assert-schema]', `Could not insert pipeline_runs row: ${err.message}`);
    }
  }

  let allPassed = true;
  const errors = [];

  // Determine which checks to run based on chain context.
  // Each chain only validates schemas relevant to its own data sources.
  const runPermitChecks = !CHAIN_ID || CHAIN_ID === 'permits';
  const runCoaChecks    = !CHAIN_ID || CHAIN_ID === 'coa';
  const runSourceChecks = !CHAIN_ID || CHAIN_ID === 'sources';

  try {
    // Check permits resource
    if (runPermitChecks) {
      const permitFields = await fetchFieldNames(PERMITS_RESOURCE_ID, 'Building Permits');
      if (!checkColumns(permitFields, EXPECTED_PERMIT_COLUMNS, 'Building Permits')) {
        allPassed = false;
        errors.push('Permits schema drift detected');
      }
      if (!(await validateTypeSample(PERMITS_RESOURCE_ID, 'Building Permits'))) {
        allPassed = false;
        errors.push('Permits type coercion failed');
      }
    }

    // Check CoA active resource
    if (runCoaChecks) {
      const coaFields = await fetchFieldNames(COA_ACTIVE_RESOURCE_ID, 'CoA Active');
      if (!checkColumns(coaFields, EXPECTED_COA_COLUMNS, 'CoA Active')) {
        allPassed = false;
        errors.push('CoA schema drift detected');
      }
    }

    // ------------------------------------------------------------------
    // Source data validation
    // ------------------------------------------------------------------

    if (runSourceChecks) {
      // Address Points CSV
      try {
        const apHeaders = await fetchCsvHeaders(ADDRESS_POINTS_URL, 'Address Points');
        if (!checkColumns(apHeaders, EXPECTED_ADDRESS_POINT_COLUMNS, 'Address Points')) {
          allPassed = false;
          errors.push('Address Points schema drift detected');
        }
      } catch (err) {
        allPassed = false;
        errors.push(`Address Points: ${err.message}`);
        console.error(`  FAIL: Address Points — ${err.message}`);
      }

      // Parcels CSV
      try {
        const parcelHeaders = await fetchCsvHeaders(PARCELS_URL, 'Parcels');
        if (!checkColumns(parcelHeaders, EXPECTED_PARCEL_COLUMNS, 'Parcels')) {
          allPassed = false;
          errors.push('Parcels schema drift detected');
        }
      } catch (err) {
        allPassed = false;
        errors.push(`Parcels: ${err.message}`);
        console.error(`  FAIL: Parcels — ${err.message}`);
      }

      // Massing Shapefile ZIP — accessibility check only
      try {
        await checkUrlAccessible(MASSING_URL, '3D Massing');
      } catch (err) {
        allPassed = false;
        errors.push(`3D Massing: ${err.message}`);
        console.error(`  FAIL: 3D Massing — ${err.message}`);
      }

      // Neighbourhoods GeoJSON — property key validation
      try {
        const nhoodKeys = await fetchGeoJsonPropertyKeys(NEIGHBOURHOODS_URL, 'Neighbourhoods');
        const hasIdProp = NEIGHBOURHOOD_ID_PROPS.some((p) => nhoodKeys.includes(p));
        if (!hasIdProp) {
          allPassed = false;
          errors.push(`Neighbourhoods missing ID property (expected one of: ${NEIGHBOURHOOD_ID_PROPS.join(', ')})`);
          console.error(`  FAIL: Neighbourhoods — no ID property found in: ${nhoodKeys.join(', ')}`);
        } else {
          console.log(`  OK: Neighbourhoods — ID property found (${nhoodKeys.length} total properties)`);
        }
      } catch (err) {
        allPassed = false;
        errors.push(`Neighbourhoods: ${err.message}`);
        console.error(`  FAIL: Neighbourhoods — ${err.message}`);
      }
    }
  } catch (err) {
    allPassed = false;
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  // Build permits-specific audit_table when permit columns were checked
  let permitsAuditTable = null;
  if (runPermitChecks) {
    const permitSchemaErrors = errors.filter((e) => e.toLowerCase().includes('permit'));
    const permitApiErrors = errors.filter((e) => e.toLowerCase().includes('ckan') && !e.toLowerCase().includes('coa'));
    const permitAuditRows = [
      { metric: 'permit_columns_checked', value: EXPECTED_PERMIT_COLUMNS.length, threshold: null, status: 'INFO' },
      { metric: 'schema_mismatch_count', value: permitSchemaErrors.length, threshold: '== 0', status: permitSchemaErrors.length > 0 ? 'FAIL' : 'PASS' },
      { metric: 'api_errors', value: permitApiErrors.length, threshold: '== 0', status: permitApiErrors.length > 0 ? 'FAIL' : 'PASS' },
    ];
    const permitHasFails = permitAuditRows.some((r) => r.status === 'FAIL');
    permitsAuditTable = {
      phase: 1,
      name: 'Schema Validation',
      verdict: permitHasFails ? 'FAIL' : 'PASS',
      rows: permitAuditRows,
    };
  }

  // Build CoA-specific audit_table when CoA columns were checked
  let coaAuditTable = null;
  if (runCoaChecks) {
    const coaSchemaErrors = errors.filter((e) => e.toLowerCase().includes('coa'));
    const coaApiErrors = errors.filter((e) => e.toLowerCase().includes('ckan') && !e.toLowerCase().includes('permit'));
    const coaAuditRows = [
      { metric: 'coa_columns_checked', value: EXPECTED_COA_COLUMNS.length, threshold: null, status: 'INFO' },
      { metric: 'schema_mismatch_count', value: coaSchemaErrors.length, threshold: '== 0', status: coaSchemaErrors.length > 0 ? 'FAIL' : 'PASS' },
      { metric: 'api_errors', value: coaApiErrors.length, threshold: '== 0', status: coaApiErrors.length > 0 ? 'FAIL' : 'PASS' },
    ];
    const coaHasFails = coaAuditRows.some((r) => r.status === 'FAIL');
    coaAuditTable = {
      phase: 1,
      name: 'Schema Validation',
      verdict: coaHasFails ? 'FAIL' : 'PASS',
      rows: coaAuditRows,
    };
  }

  const durationMs = Date.now() - startMs;
  const status = allPassed ? 'completed' : 'failed';
  const errorMsg = errors.length > 0 ? errors.join('; ') : null;
  const meta = JSON.stringify({
    checks_passed: errors.length === 0 ? 'all' : undefined,
    checks_failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    // Chain-aware: only emit the relevant audit_table (exclusive)
    ...(() => {
      if (CHAIN_ID === 'permits' && permitsAuditTable) return { audit_table: permitsAuditTable };
      if (CHAIN_ID === 'coa' && coaAuditTable) return { audit_table: coaAuditTable };
      if (CHAIN_ID === 'sources') {
        const sourceErrors = errors.filter((e) =>
          /address|parcel|massing|neighbourhood/i.test(e)
        );
        const sourceAuditRows = [
          { metric: 'sources_checked', value: 4, threshold: null, status: 'INFO' },
          { metric: 'schema_errors', value: sourceErrors.length, threshold: '== 0', status: sourceErrors.length > 0 ? 'FAIL' : 'PASS' },
        ];
        return {
          audit_table: {
            phase: 1,
            name: 'Schema Validation',
            verdict: sourceErrors.length > 0 ? 'FAIL' : 'PASS',
            rows: sourceAuditRows,
          },
        };
      }
      // Standalone — prefer permits if available
      if (permitsAuditTable) return { audit_table: permitsAuditTable };
      if (coaAuditTable) return { audit_table: coaAuditTable };
      return {};
    })(),
  });

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_meta = $5
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId, meta]
    ).catch((err) => pipeline.log.warn('[assert-schema]', `pipeline_runs UPDATE failed: ${err.message}`));
  }

  // Always emit PIPELINE_SUMMARY so chain orchestrator can capture records_meta
  pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null, records_meta: JSON.parse(meta) });
  pipeline.emitMeta(
    { "CKAN API": ["metadata"] },
    { "pipeline_runs": ["checks_passed", "checks_failed"] }
  );

  console.log(`\n=== Schema Validation: ${status.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s) ===\n`);

  // Schema drift must halt the chain — allowing downstream scripts to run
  // with malformed data would silently corrupt 240K+ permit records.
  if (!allPassed) throw new Error('Schema validation failed — schema drift detected');
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
