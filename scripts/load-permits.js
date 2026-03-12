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
  const s = String(v).trim();
  // Extract YYYY-MM-DD only — avoids timezone-dependent Date.parse() which
  // treats "2021-10-18" as UTC but "2021-10-18T00:00:00" as local time,
  // producing different hashes for the same logical date.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return m[1];
}

function cleanCost(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v);
  if (s.includes('DO NOT UPDATE') || s.includes('DO NOT DELETE')) return null;
  const parsed = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  if (isNaN(parsed)) return null;
  return parsed;
}

/**
 * Compute a stable SHA-256 hash from a mapped permit record.
 * Hashes only the cleaned/mapped fields we store — NOT the raw CKAN object.
 * This prevents upstream metadata changes (_id, rank, new CKAN fields) from
 * triggering false hash mismatches and cascading unnecessary reclassification.
 */
function computeHash(mapped) {
  const sorted = {};
  for (const key of Object.keys(mapped).sort()) {
    sorted[key] = mapped[key];
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
  const mapped = {
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
  };
  // Hash the mapped fields only — excludes raw_json, data_hash, and _ckan_id
  mapped.data_hash = computeHash(mapped);
  mapped.raw_json = JSON.stringify(raw);
  // Preserve CKAN _id for cross-page deduplication tiebreaker
  if (raw._id != null) mapped._ckan_id = raw._id;
  return mapped;
}

/**
 * Deduplicate mapped records by permit_num + revision_num.
 * For duplicates, the record with the highest _ckan_id wins (deterministic
 * tiebreaker that is stable across CKAN pagination order changes).
 * This prevents the 488-update ping-pong caused by ~252 CKAN duplicate pairs.
 */
function deduplicateRecords(records) {
  const seen = new Map();
  for (const rec of records) {
    const key = `${rec.permit_num}--${rec.revision_num}`;
    const existing = seen.get(key);
    if (!existing || (rec._ckan_id || 0) > (existing._ckan_id || 0)) {
      seen.set(key, rec);
    }
  }
  return Array.from(seen.values());
}

/**
 * Async generator that yields pages of CKAN records.
 * Keeps peak memory at O(page_size) instead of O(total_records) (§9.5).
 */
async function* fetchFromCKAN() {
  const limit = 10000;
  let offset = 0;
  let totalFetched = 0;

  console.log('Fetching permits from CKAN datastore API (streaming)...');
  while (true) {
    const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=${limit}&offset=${offset}`;
    console.log(`  offset=${offset}...`);
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(`datastore_search failed at offset ${offset}`);

    const batch = json.result.records || [];
    totalFetched += batch.length;
    console.log(`  Got ${batch.length} records (total: ${totalFetched})`);

    yield batch;

    if (batch.length < limit) break;
    offset += limit;
  }
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
      permit_type = EXCLUDED.permit_type,
      structure_type = EXCLUDED.structure_type,
      work = EXCLUDED.work,
      street_num = EXCLUDED.street_num,
      street_name = EXCLUDED.street_name,
      street_type = EXCLUDED.street_type,
      street_direction = EXCLUDED.street_direction,
      city = EXCLUDED.city,
      postal = EXCLUDED.postal,
      geo_id = EXCLUDED.geo_id,
      building_type = EXCLUDED.building_type,
      category = EXCLUDED.category,
      application_date = EXCLUDED.application_date,
      issued_date = EXCLUDED.issued_date,
      completed_date = EXCLUDED.completed_date,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      est_const_cost = EXCLUDED.est_const_cost,
      builder_name = EXCLUDED.builder_name,
      owner = EXCLUDED.owner,
      dwelling_units_created = EXCLUDED.dwelling_units_created,
      dwelling_units_lost = EXCLUDED.dwelling_units_lost,
      ward = EXCLUDED.ward,
      council_district = EXCLUDED.council_district,
      current_use = EXCLUDED.current_use,
      proposed_use = EXCLUDED.proposed_use,
      housing_units = EXCLUDED.housing_units,
      storeys = EXCLUDED.storeys,
      data_hash = EXCLUDED.data_hash,
      last_seen_at = NOW(),
      raw_json = EXCLUDED.raw_json
    WHERE permits.data_hash IS DISTINCT FROM EXCLUDED.data_hash
    RETURNING (xmax = 0) AS is_insert
  `;

  const result = await client.query(sql, values);
  return result.rows;
}

/**
 * Map raw CKAN records, filtering out invalid ones.
 * Returns mapped records (with _ckan_id for dedup tiebreaker).
 */
function mapRawRecords(records, counters) {
  const mapped = [];
  for (const record of records) {
    try {
      if (!record.PERMIT_NUM || !record.REVISION_NUM) {
        counters.errors++;
        continue;
      }
      mapped.push(mapRecord(record));
    } catch (err) {
      counters.errors++;
      if (counters.errors <= 5) pipeline.log.error('[load-permits]', err, { record: counters.processed + counters.errors });
    }
  }
  return mapped;
}

/**
 * Upsert mapped records in batches.
 * Strips _ckan_id (dedup-only field, not a DB column) before insertion.
 */
async function upsertRecords(pool, records, counters, startTime) {
  let batch = [];

  for (const record of records) {
    // Strip _ckan_id — it's a dedup tiebreaker, not a DB column
    const { _ckan_id, ...dbRecord } = record;
    batch.push(dbRecord);
    if (batch.length >= pipeline.BATCH_SIZE) {
      const rows = await pipeline.withTransaction(pool, async (client) => {
        return insertBatch(client, batch);
      });
      for (const r of rows) {
        if (r.is_insert) counters.newInserts++;
        else counters.updated++;
      }
      counters.processed += batch.length;
      batch = [];
      if (counters.processed % 10000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ${counters.processed.toLocaleString()} processed (${elapsed}s)`);
      }
    }
  }

  // Flush remaining batch
  if (batch.length > 0) {
    const rows = await pipeline.withTransaction(pool, async (client) => {
      return insertBatch(client, batch);
    });
    for (const r of rows) {
      if (r.is_insert) counters.newInserts++;
      else counters.updated++;
    }
    counters.processed += batch.length;
  }
}

// Only run when executed directly (not when required for testing)
if (require.main === module) pipeline.run('load-permits', async (pool) => {
  const counters = { newInserts: 0, updated: 0, processed: 0, errors: 0 };
  const startTime = Date.now();

  // Phase 1: Map all raw records (streamed page-by-page from CKAN or local file)
  let allMapped = [];

  if (localFilePath) {
    // --file mode: read from local JSON file
    console.log(`Loading permits from local file: ${localFilePath}`);
    console.log(`File size: ${(fs.statSync(localFilePath).size / 1024 / 1024).toFixed(1)} MB`);
    const raw = fs.readFileSync(localFilePath, 'utf-8');
    console.log('Parsing JSON...');
    const records = JSON.parse(raw);
    console.log(`Parsed ${records.length} records`);
    allMapped = mapRawRecords(records, counters);
  } else {
    // Default: stream from CKAN API page by page (§9.5)
    for await (const page of fetchFromCKAN()) {
      const pageMapped = mapRawRecords(page, counters);
      allMapped.push(...pageMapped);
    }
  }

  // Phase 2: Deduplicate across all pages — highest _ckan_id wins.
  // Prevents the ~488 ghost-update ping-pong from ~252 CKAN duplicate pairs.
  const beforeDedup = allMapped.length;
  allMapped = deduplicateRecords(allMapped);
  const dupsRemoved = beforeDedup - allMapped.length;
  if (dupsRemoved > 0) {
    console.log(`  Deduplicated: removed ${dupsRemoved} cross-page duplicate(s)`);
  }

  // Phase 3: Upsert deduplicated records in batches
  await upsertRecords(pool, allMapped, counters, startTime);

  const { newInserts, updated, processed, errors } = counters;

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

  // Log sync run (duration parameterized to prevent SQL injection — §4.2)
  const durationSeconds = parseFloat(duration);
  await pool.query(
    `INSERT INTO sync_runs (started_at, completed_at, status, records_total, records_new, records_updated, records_unchanged, records_errors, duration_ms)
     VALUES (NOW() - make_interval(secs => $7), NOW(), 'completed', $1, $2, $3, $4, $5, $6)`,
    [processed, newInserts, updated, unchanged, errors, Math.round(durationSeconds * 1000), durationSeconds]
  );
  console.log('  Sync run logged');
});

// Export for testing (used by sync.logic.test.ts)
module.exports = { deduplicateRecords };
