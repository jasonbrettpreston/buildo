#!/usr/bin/env node
/**
 * Load permits from building-permits-active-permits.json into the database.
 * Streams the file and batch-inserts in groups of 1000.
 *
 * Usage: PG_PASSWORD=postgres node scripts/load-permits.js [path-to-json]
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BATCH_SIZE = 1000;
const filePath = process.argv[2] || path.join(__dirname, '..', 'building-permits-active-permits.json');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

function trimToNull(v) {
  if (!v) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const ms = Date.parse(String(v).trim());
  if (isNaN(ms)) return null;
  return new Date(ms);
}

function cleanCost(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v);
  if (s.includes('DO NOT UPDATE') || s.includes('DO NOT DELETE')) return null;
  const parsed = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  if (isNaN(parsed)) return null;
  return parsed;
}

function computeHash(raw) {
  const sorted = {};
  for (const key of Object.keys(raw).sort()) {
    sorted[key] = raw[key];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function extractWard(raw) {
  // WARD field may not exist; extract from WARD_GRID (e.g. "W0523" -> "05")
  if (raw.WARD) return trimToNull(raw.WARD);
  if (raw.WARD_GRID) {
    const m = String(raw.WARD_GRID).match(/W(\d{2})/);
    if (m) return m[1];
  }
  return null;
}

function mapRecord(raw) {
  return {
    permit_num: raw.PERMIT_NUM,
    revision_num: raw.REVISION_NUM || '00',
    permit_type: raw.PERMIT_TYPE || null,
    structure_type: raw.STRUCTURE_TYPE || null,
    work: raw.WORK || null,
    street_num: raw.STREET_NUM || null,
    street_name: raw.STREET_NAME || null,
    street_type: raw.STREET_TYPE || null,
    street_direction: trimToNull(raw.STREET_DIRECTION),
    city: raw.CITY || 'TORONTO',
    postal: raw.POSTAL || null,
    geo_id: raw.GEO_ID || null,
    building_type: raw.BUILDING_TYPE || null,
    category: raw.CATEGORY || null,
    application_date: parseDate(raw.APPLICATION_DATE),
    issued_date: parseDate(raw.ISSUED_DATE),
    completed_date: parseDate(raw.COMPLETED_DATE),
    status: raw.STATUS || null,
    description: raw.DESCRIPTION || null,
    est_const_cost: cleanCost(raw.EST_CONST_COST),
    builder_name: raw.BUILDER_NAME || null,
    owner: raw.OWNER || null,
    dwelling_units_created: parseInt(raw.DWELLING_UNITS_CREATED, 10) || 0,
    dwelling_units_lost: parseInt(raw.DWELLING_UNITS_LOST, 10) || 0,
    ward: extractWard(raw),
    council_district: raw.COUNCIL_DISTRICT || null,
    current_use: raw.CURRENT_USE || null,
    proposed_use: raw.PROPOSED_USE || null,
    housing_units: parseInt(raw.HOUSING_UNITS, 10) || 0,
    storeys: parseInt(raw.STOREYS, 10) || 0,
    data_hash: computeHash(raw),
    raw_json: JSON.stringify(raw),
  };
}

async function insertBatch(client, batch) {
  if (batch.length === 0) return;

  // Deduplicate within batch - last occurrence wins
  const seen = new Map();
  for (const row of batch) {
    seen.set(`${row.permit_num}--${row.revision_num}`, row);
  }
  batch = Array.from(seen.values());

  const cols = [
    'permit_num', 'revision_num', 'permit_type', 'structure_type', 'work',
    'street_num', 'street_name', 'street_type', 'street_direction', 'city',
    'postal', 'geo_id', 'building_type', 'category',
    'application_date', 'issued_date', 'completed_date',
    'status', 'description', 'est_const_cost',
    'builder_name', 'owner', 'dwelling_units_created', 'dwelling_units_lost',
    'ward', 'council_district', 'current_use', 'proposed_use',
    'housing_units', 'storeys', 'data_hash', 'raw_json',
  ];

  const valuesPerRow = cols.length; // 32
  const placeholders = [];
  const values = [];

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i];
    const rowPlaceholders = [];
    for (let j = 0; j < cols.length; j++) {
      const idx = i * valuesPerRow + j + 1;
      rowPlaceholders.push(`$${idx}`);
      values.push(row[cols[j]]);
    }
    placeholders.push(`(${rowPlaceholders.join(',')})`);
  }

  const sql = `
    INSERT INTO permits (${cols.join(',')})
    VALUES ${placeholders.join(',\n')}
    ON CONFLICT (permit_num, revision_num) DO UPDATE SET
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      est_const_cost = EXCLUDED.est_const_cost,
      data_hash = EXCLUDED.data_hash,
      last_seen_at = NOW(),
      raw_json = EXCLUDED.raw_json
  `;

  await client.query(sql, values);
}

async function run() {
  console.log(`Loading permits from: ${filePath}`);
  console.log(`File size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB`);

  // Stream-parse the JSON array
  const raw = fs.readFileSync(filePath, 'utf-8');
  console.log('Parsing JSON...');
  const records = JSON.parse(raw);
  console.log(`Parsed ${records.length} records`);

  const client = await pool.connect();
  let inserted = 0;
  let errors = 0;
  let batch = [];
  const startTime = Date.now();

  try {
    for (const record of records) {
      try {
        if (!record.PERMIT_NUM || !record.REVISION_NUM) {
          errors++;
          continue;
        }
        batch.push(mapRecord(record));
        if (batch.length >= BATCH_SIZE) {
          await insertBatch(client, batch);
          inserted += batch.length;
          batch = [];
          if (inserted % 10000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  ${inserted.toLocaleString()} inserted (${elapsed}s)`);
          }
        }
      } catch (err) {
        errors++;
        if (errors <= 5) console.error(`  Error on record ${inserted + errors}:`, err.message);
      }
    }

    // Final batch
    if (batch.length > 0) {
      await insertBatch(client, batch);
      inserted += batch.length;
    }
  } finally {
    client.release();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${duration}s`);
  console.log(`  Inserted/updated: ${inserted.toLocaleString()}`);
  console.log(`  Errors: ${errors}`);

  // Log sync run
  await pool.query(
    `INSERT INTO sync_runs (started_at, completed_at, status, records_total, records_new, records_updated, records_unchanged, records_errors, duration_ms)
     VALUES (NOW() - interval '${duration} seconds', NOW(), 'completed', $1, $1, 0, 0, $2, $3)`,
    [inserted, errors, Math.round(parseFloat(duration) * 1000)]
  );
  console.log('  Sync run logged');

  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
