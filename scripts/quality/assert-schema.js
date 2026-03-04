#!/usr/bin/env node
/**
 * CQA Tier 1: Pre-Ingestion Schema Validation
 *
 * Fetches CKAN metadata for permits and CoA resources and asserts that
 * expected columns still exist. Catches upstream schema drift before
 * ingestion runs.
 *
 * Usage: node scripts/quality/assert-schema.js
 *
 * Exit 0 = pass (all expected columns present)
 * Exit 1 = fail (missing columns detected)
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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

const EXPECTED_COA_COLUMNS = [
  'REFERENCE_FILE#', 'APPLICATION_DATE', 'STATUS',
  'STREET_NUM', 'STREET_NAME', 'STREET_TYPE',
];

const SLUG = 'assert_schema';

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

async function validateTypeSample(resourceId, label) {
  const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return true; // non-fatal

  const json = await res.json();
  const records = json?.result?.records;
  if (!records || records.length === 0) {
    console.log(`  WARN: ${label} — no records available for type check`);
    return true;
  }

  const row = records[0];

  // Permits: check EST_CONST_COST is parseable as number
  if (row.EST_CONST_COST !== undefined) {
    const cost = Number(row.EST_CONST_COST);
    if (row.EST_CONST_COST !== null && row.EST_CONST_COST !== '' && isNaN(cost)) {
      console.error(`  FAIL: ${label} — EST_CONST_COST not parseable as number: "${row.EST_CONST_COST}"`);
      return false;
    }
    console.log(`  OK: ${label} — EST_CONST_COST type coercion verified`);
  }

  return true;
}

async function run() {
  console.log('\n=== CQA Tier 1: Schema Validation ===\n');

  const startMs = Date.now();
  let runId = null;

  try {
    const res = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, status)
       VALUES ($1, NOW(), 'running') RETURNING id`,
      [SLUG]
    );
    runId = res.rows[0].id;
  } catch (err) {
    console.warn('Could not insert pipeline_runs row:', err.message);
  }

  let allPassed = true;
  const errors = [];

  try {
    // Check permits resource
    const permitFields = await fetchFieldNames(PERMITS_RESOURCE_ID, 'Building Permits');
    if (!checkColumns(permitFields, EXPECTED_PERMIT_COLUMNS, 'Building Permits')) {
      allPassed = false;
      errors.push('Permits schema drift detected');
    }
    if (!(await validateTypeSample(PERMITS_RESOURCE_ID, 'Building Permits'))) {
      allPassed = false;
      errors.push('Permits type coercion failed');
    }

    // Check CoA active resource
    const coaFields = await fetchFieldNames(COA_ACTIVE_RESOURCE_ID, 'CoA Active');
    if (!checkColumns(coaFields, EXPECTED_COA_COLUMNS, 'CoA Active')) {
      allPassed = false;
      errors.push('CoA schema drift detected');
    }
  } catch (err) {
    allPassed = false;
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startMs;
  const status = allPassed ? 'completed' : 'failed';
  const errorMsg = errors.length > 0 ? errors.join('; ') : null;

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId]
    ).catch(() => {});
  }

  console.log(`\n=== Schema Validation: ${status.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s) ===\n`);

  await pool.end();

  if (!allPassed) process.exit(1);
}

run().catch((err) => {
  console.error('Schema validation error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
