#!/usr/bin/env node
/**
 * Load permits from Toronto Open Data (CKAN) into the database.
 * Fetches live from the CKAN datastore API by default.
 * Use --file <path> to load from a local JSON file instead.
 *
 * Usage:
 *   node scripts/load-permits.js              # fetch live from CKAN
 *   node scripts/load-permits.js --file data.json  # load from local file
 */
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CKAN datastore endpoint for Active Building Permits
const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const RESOURCE_ID = '6d0229af-bc54-46de-9c2b-26759b01dd05';

// CLI: --file <path> for local file fallback
const fileArgIdx = process.argv.indexOf('--file');
const localFilePath = fileArgIdx !== -1 ? process.argv[fileArgIdx + 1] : null;

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

/**
 * Fetch all permit records from the CKAN datastore API with pagination.
 */
async function fetchFromCKAN() {
  const records = [];
  const limit = 10000;
  let offset = 0;

  console.log('Fetching permits from CKAN datastore API...');
  while (true) {
    const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=${limit}&offset=${offset}`;
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

async function insertBatch(client, batch) {
  if (batch.length === 0) return [];

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
    WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash
    RETURNING (xmax = 0) AS is_insert
  `;

  const result = await client.query(sql, values);
  return result.rows;
}

pipeline.run('load-permits', async (pool) => {
  let records;

  if (localFilePath) {
    // --file mode: read from local JSON file
    console.log(`Loading permits from local file: ${localFilePath}`);
    console.log(`File size: ${(fs.statSync(localFilePath).size / 1024 / 1024).toFixed(1)} MB`);
    const raw = fs.readFileSync(localFilePath, 'utf-8');
    console.log('Parsing JSON...');
    records = JSON.parse(raw);
    console.log(`Parsed ${records.length} records`);
  } else {
    // Default: fetch live from CKAN API
    records = await fetchFromCKAN();
    console.log(`Fetched ${records.length} records from CKAN`);
  }

  let newInserts = 0;
  let updated = 0;
  let processed = 0;
  let errors = 0;
  let batch = [];
  const startTime = Date.now();

  for (const record of records) {
    try {
      if (!record.PERMIT_NUM || !record.REVISION_NUM) {
        errors++;
        continue;
      }
      batch.push(mapRecord(record));
      if (batch.length >= pipeline.BATCH_SIZE) {
        const rows = await pipeline.withTransaction(pool, async (client) => {
          return insertBatch(client, batch);
        });
        for (const r of rows) {
          if (r.is_insert) newInserts++;
          else updated++;
        }
        processed += batch.length;
        batch = [];
        if (processed % 10000 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ${processed.toLocaleString()} processed (${elapsed}s)`);
        }
      }
    } catch (err) {
      errors++;
      if (errors <= 5) pipeline.log.error('[load-permits]', err, { record: processed + errors });
    }
  }

  // Final batch
  if (batch.length > 0) {
    const rows = await pipeline.withTransaction(pool, async (client) => {
      return insertBatch(client, batch);
    });
    for (const r of rows) {
      if (r.is_insert) newInserts++;
      else updated++;
    }
    processed += batch.length;
  }

  const unchanged = processed - newInserts - updated;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${duration}s`);
  console.log(`  Processed: ${processed.toLocaleString()}`);
  console.log(`  New: ${newInserts.toLocaleString()}`);
  console.log(`  Updated: ${updated.toLocaleString()}`);
  console.log(`  Unchanged: ${unchanged.toLocaleString()}`);
  console.log(`  Errors: ${errors}`);
  pipeline.emitSummary({ records_total: newInserts + updated, records_new: newInserts, records_updated: updated });
  pipeline.emitMeta(
    { "CKAN API": ["PERMIT_NUM", "REVISION_NUM", "PERMIT_TYPE", "STRUCTURE_TYPE", "WORK", "STREET_NUM", "STREET_NAME", "STREET_TYPE", "STREET_DIRECTION", "CITY", "POSTAL", "GEO_ID", "BUILDING_TYPE", "CATEGORY", "APPLICATION_DATE", "ISSUED_DATE", "COMPLETED_DATE", "STATUS", "DESCRIPTION", "EST_CONST_COST", "BUILDER", "OWNER", "DWELLING_UNITS_CREATED", "DWELLING_UNITS_LOST", "WARD", "COUNCIL_DISTRICT", "CURRENT_USE", "PROPOSED_USE", "HOUSING_UNITS", "STOREYS"] },
    { "permits": ["permit_num", "revision_num", "permit_type", "structure_type", "work", "street_num", "street_name", "street_type", "street_direction", "city", "postal", "geo_id", "building_type", "category", "application_date", "issued_date", "completed_date", "status", "description", "est_const_cost", "builder_name", "owner", "dwelling_units_created", "dwelling_units_lost", "ward", "council_district", "current_use", "proposed_use", "housing_units", "storeys", "data_hash", "raw_json"] }
  );

  // Log sync run
  await pool.query(
    `INSERT INTO sync_runs (started_at, completed_at, status, records_total, records_new, records_updated, records_unchanged, records_errors, duration_ms)
     VALUES (NOW() - interval '${duration} seconds', NOW(), 'completed', $1, $2, $3, $4, $5, $6)`,
    [processed, newInserts, updated, unchanged, errors, Math.round(parseFloat(duration) * 1000)]
  );
  console.log('  Sync run logged');
});
