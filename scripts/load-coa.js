#!/usr/bin/env node
/**
 * Load Committee of Adjustment applications from Toronto Open Data (CKAN).
 * Fetches from both "Active Applications" and "Closed Applications since 2017"
 * datastore resources and upserts into coa_applications.
 *
 * Usage: node scripts/load-coa.js
 */
const { Pool } = require('pg');
const crypto = require('crypto');

const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';

// Two datastore resources to load
const RESOURCES = [
  { id: '51fd09cd-99d6-430a-9d42-c24a937b0cb0', name: 'Active Applications' },
  { id: '9c97254e-5460-4799-896f-c7823413c81c', name: 'Closed Applications since 2017' },
];

const BATCH_SIZE = 500;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

function trimToNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const ms = Date.parse(String(v).trim());
  if (isNaN(ms)) return null;
  return new Date(ms);
}

function computeHash(record) {
  const sorted = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

async function fetchAllRecords(resourceId, resourceName) {
  const records = [];
  const limit = 10000;
  let offset = 0;

  console.log(`\nFetching "${resourceName}"...`);
  while (true) {
    const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;
    console.log(`  offset=${offset}...`);
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(`datastore_search failed at offset ${offset}`);

    const batch = json.result.records || [];
    records.push(...batch);
    console.log(`  Got ${batch.length} records (total: ${records.length})`);

    if (batch.length < limit) break;
    offset += limit;
  }

  return records;
}

/**
 * Map a CKAN record to our coa_applications schema.
 *
 * Field names in the CKAN data:
 *   REFERENCE_FILE#     → application_number  (e.g. "A0246/23EYK")
 *   STREET_NUM          → street_num
 *   STREET_NAME         → street_name (we combine with STREET_TYPE + STREET_DIRECTION)
 *   WARD_NUMBER / WARD  → ward (field name differs between active/closed datasets)
 *   C_OF_A_DESCISION    → decision  (note typo in source: "DESCISION")
 *   STATUSDESC          → status
 *   HEARING_DATE        → hearing_date
 *   FINALDATE           → decision_date (for closed); for active, use APPEAL_EXPIRY_DATE
 *   DESCRIPTION         → description
 *   CONTACT_NAME        → applicant (closest available field)
 */
function mapRecord(raw) {
  // Application number
  const appNum = trimToNull(raw['REFERENCE_FILE#']);
  if (!appNum) return null;

  // Build address from separate fields
  const streetNum = trimToNull(raw.STREET_NUM);
  const streetName = trimToNull(raw.STREET_NAME);
  const streetType = trimToNull(raw.STREET_TYPE);
  const streetDir = trimToNull(raw.STREET_DIRECTION);

  // Compose full street name: "QUEEN ST E" style
  let fullStreetName = streetName || '';
  if (streetType) fullStreetName += ' ' + streetType;
  if (streetDir) fullStreetName += ' ' + streetDir;
  fullStreetName = fullStreetName.trim() || null;

  // Full address: "123 QUEEN ST E"
  const address = streetNum && fullStreetName
    ? `${streetNum} ${fullStreetName}`
    : fullStreetName || streetNum || null;

  // Ward — field name differs between datasets
  const ward = trimToNull(raw.WARD_NUMBER || raw.WARD);

  // Decision — note the typo "DESCISION" in the CKAN data
  const decision = trimToNull(raw['C_OF_A_DESCISION']);

  // Status
  const status = trimToNull(raw.STATUSDESC);

  // Dates
  const hearingDate = parseDate(raw.HEARING_DATE);
  // For closed apps, FINALDATE is the close/decision date
  // For active apps, fall back to APPEAL_EXPIRY_DATE or HEARING_DATE
  const decisionDate = parseDate(raw.FINALDATE) || parseDate(raw.APPEAL_EXPIRY_DATE);

  // Description
  const description = trimToNull(raw.DESCRIPTION);

  // Applicant — only use CONTACT_NAME (SUB_TYPE is stored separately)
  const applicant = trimToNull(raw.CONTACT_NAME);
  const subType = trimToNull(raw.SUB_TYPE);

  return {
    application_number: appNum,
    address,
    street_num: streetNum,
    street_name: fullStreetName,
    ward,
    status,
    decision,
    decision_date: decisionDate,
    hearing_date: hearingDate,
    description,
    applicant,
    sub_type: subType,
    data_hash: computeHash(raw),
  };
}

async function upsertBatch(client, batch) {
  if (batch.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  for (const rec of batch) {
    const result = await client.query(
      `INSERT INTO coa_applications (
        application_number, address, street_num, street_name, ward,
        status, decision, decision_date, hearing_date, description,
        applicant, sub_type, data_hash, first_seen_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      ON CONFLICT (application_number) DO UPDATE SET
        address = EXCLUDED.address,
        street_num = EXCLUDED.street_num,
        street_name = EXCLUDED.street_name,
        ward = EXCLUDED.ward,
        status = EXCLUDED.status,
        decision = EXCLUDED.decision,
        decision_date = EXCLUDED.decision_date,
        hearing_date = EXCLUDED.hearing_date,
        description = EXCLUDED.description,
        applicant = EXCLUDED.applicant,
        sub_type = EXCLUDED.sub_type,
        data_hash = EXCLUDED.data_hash,
        last_seen_at = NOW()
      WHERE coa_applications.data_hash IS DISTINCT FROM EXCLUDED.data_hash
      RETURNING (xmax = 0) AS is_insert`,
      [
        rec.application_number,
        rec.address,
        rec.street_num,
        rec.street_name,
        rec.ward,
        rec.status,
        rec.decision,
        rec.decision_date,
        rec.hearing_date,
        rec.description,
        rec.applicant,
        rec.sub_type,
        rec.data_hash,
      ]
    );

    if (result.rows.length > 0) {
      if (result.rows[0].is_insert) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}

async function main() {
  console.log('=== Buildo CoA Data Loader ===\n');

  // Fetch from both resources
  let allRaw = [];
  for (const res of RESOURCES) {
    const records = await fetchAllRecords(res.id, res.name);
    allRaw.push(...records);
  }

  console.log(`\nTotal fetched: ${allRaw.length} raw records from CKAN\n`);

  if (allRaw.length === 0) {
    console.log('No records found. Exiting.');
    process.exit(0);
  }

  // Log sample record to debug field names
  console.log('Sample record fields:', Object.keys(allRaw[0]).join(', '));
  console.log('Sample record:', JSON.stringify(allRaw[0], null, 2).slice(0, 500));
  console.log('');

  const mapped = allRaw.map(mapRecord).filter(Boolean);
  console.log(`Mapped ${mapped.length} valid records (${allRaw.length - mapped.length} skipped)\n`);

  // Deduplicate by application_number (active may overlap with closed)
  const byAppNum = new Map();
  for (const rec of mapped) {
    const existing = byAppNum.get(rec.application_number);
    // Prefer the record with the more recent data
    if (!existing || (rec.decision_date && (!existing.decision_date || rec.decision_date > existing.decision_date))) {
      byAppNum.set(rec.application_number, rec);
    }
  }
  const deduplicated = [...byAppNum.values()];
  console.log(`Deduplicated: ${deduplicated.length} unique applications\n`);

  const client = await pool.connect();
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
      const batch = deduplicated.slice(i, i + BATCH_SIZE);
      const { inserted, updated } = await upsertBatch(client, batch);
      totalInserted += inserted;
      totalUpdated += updated;

      const progress = Math.min(i + BATCH_SIZE, deduplicated.length);
      process.stdout.write(`\r  Progress: ${progress}/${deduplicated.length} (${totalInserted} inserted, ${totalUpdated} updated)`);
    }

    console.log(`\n\nDone! ${totalInserted} inserted, ${totalUpdated} updated.`);

    // Show stats
    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions')) AS approved,
        COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
        COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions') AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
      FROM coa_applications
    `);
    const s = stats.rows[0];
    console.log(`\nCoA Stats: ${s.total} total | ${s.approved} approved | ${s.linked} linked | ${s.upcoming} upcoming leads`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
