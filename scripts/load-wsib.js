#!/usr/bin/env node
/**
 * Load WSIB Businesses Classification Details CSV into wsib_registry.
 *
 * Filters to Class G (Construction) rows only. De-duplicates by
 * (legal_name_normalized, mailing_address), keeping the G-subclass row.
 *
 * Usage: node scripts/load-wsib.js --file path/to/BusinessClassificationDetails(2025).csv
 */
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const { parse } = require('csv-parse');

const SLUG = 'load_wsib';
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

// Expected CSV columns (order matters for validation)
const EXPECTED_COLUMNS = [
  'Legal name', 'Trade name', 'Mailing Address', 'Predominant class',
  'NAICS code', 'Description', 'Class/subclass', 'Description', 'Business size',
];

// Business suffix stripping — same logic as extract-builders.js
const SUFFIXES = [
  'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
  'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
];
const SUFFIX_PATTERN = new RegExp(`\\s*\\b(${SUFFIXES.join('|')})\\s*$`, 'i');

function normalizeName(name) {
  if (!name || !name.trim()) return null;
  let n = name.toUpperCase().trim();
  n = n.replace(/\s+/g, ' ');
  n = n.replace(SUFFIX_PATTERN, '').trim();
  n = n.replace(SUFFIX_PATTERN, '').trim(); // Run twice for double suffixes
  n = n.replace(/[.,;]+$/, '').trim();
  return n || null;
}

function buildRow(row, legalName, legalNorm, tradeName, tradeNorm, address, predominantClass, subclass) {
  // Handle duplicate "Description" columns — csv-parse names them Description and Description_1
  // or similar. We need to figure out which is NAICS desc and which is subclass desc.
  const keys = Object.keys(row);
  const descKeys = keys.filter((k) => k.startsWith('Description'));
  const naicsDesc = descKeys.length > 0 ? (row[descKeys[0]] || '').trim() : '';
  const subclassDesc = descKeys.length > 1 ? (row[descKeys[1]] || '').trim() : '';

  return {
    legal_name: legalName,
    trade_name: tradeName,
    legal_name_normalized: legalNorm,
    trade_name_normalized: tradeNorm,
    mailing_address: address,
    predominant_class: predominantClass,
    naics_code: (row['NAICS code'] || '').trim() || null,
    naics_description: naicsDesc || null,
    subclass: subclass || null,
    subclass_description: subclassDesc || null,
    business_size: (row['Business size'] || '').trim() || null,
  };
}

pipeline.run('load-wsib', async (pool) => {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error('Usage: node scripts/load-wsib.js --file <path-to-csv>');
    process.exit(1);
  }
  const filePath = args[fileIdx + 1];

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('=== WSIB Registry Loader ===\n');
  console.log(`Source: ${filePath}`);

  const startMs = Date.now();
  let runId = null;

  if (!CHAIN_ID) {
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
  }

  // Parse CSV and collect Class G rows, de-duplicated
  const seen = new Map(); // key: legal_name_normalized|mailing_address
  let totalRows = 0;
  let gRows = 0;
  let skippedNonG = 0;
  let skippedNoName = 0;
  let headerValidated = false;

  await new Promise((resolve, reject) => {
    const parser = fs.createReadStream(filePath, 'utf-8')
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
      }));

    parser.on('data', (row) => {
      totalRows++;

      // Validate header on first row
      if (!headerValidated) {
        const cols = Object.keys(row);
        // Check critical columns exist (CSV has duplicate "Description" so check by key names)
        const required = ['Legal name', 'Predominant class', 'Mailing Address'];
        for (const req of required) {
          if (!cols.includes(req)) {
            parser.destroy(new Error(`Schema drift: missing column "${req}". Found: ${cols.join(', ')}`));
            return;
          }
        }
        headerValidated = true;
      }

      const predominantClass = (row['Predominant class'] || '').trim();
      const subclass = (row['Class/subclass'] || '').trim();

      // Filter: keep rows where predominant class OR subclass starts with G
      if (!predominantClass.startsWith('G') && !subclass.startsWith('G')) {
        skippedNonG++;
        return;
      }

      const legalName = (row['Legal name'] || '').trim();
      const legalNorm = normalizeName(legalName);
      if (!legalNorm) {
        skippedNoName++;
        return;
      }

      const tradeName = (row['Trade name'] || '').trim() || null;
      const tradeNorm = normalizeName(tradeName);
      const address = (row['Mailing Address'] || '').trim() || null;

      // De-duplicate: keep first G-subclass row per (legal_name_normalized, address)
      const dedupeKey = `${legalNorm}|${address || ''}`;
      if (seen.has(dedupeKey)) {
        // If existing entry doesn't have a G subclass but this one does, replace
        const existing = seen.get(dedupeKey);
        if (!existing.predominant_class.startsWith('G') && predominantClass.startsWith('G')) {
          seen.set(dedupeKey, buildRow(row, legalName, legalNorm, tradeName, tradeNorm, address, predominantClass, subclass));
        }
        return;
      }

      seen.set(dedupeKey, buildRow(row, legalName, legalNorm, tradeName, tradeNorm, address, predominantClass, subclass));
      gRows++;

      if (totalRows % 50000 === 0) {
        console.log(`  Progress: ${totalRows.toLocaleString()} rows read, ${gRows.toLocaleString()} Class G kept`);
      }
    });

    parser.on('error', reject);
    parser.on('end', resolve);
  });

  console.log(`\nParsing complete:`);
  console.log(`  Total CSV rows:    ${totalRows.toLocaleString()}`);
  console.log(`  Non-G skipped:     ${skippedNonG.toLocaleString()}`);
  console.log(`  No-name skipped:   ${skippedNoName}`);
  console.log(`  Unique Class G:    ${seen.size.toLocaleString()}`);

  // Bulk upsert into wsib_registry
  console.log('\nUpserting into wsib_registry...');
  let inserted = 0;
  let updated = 0;

  const rows = Array.from(seen.values());
  const BATCH = 2000;

  await pipeline.withTransaction(pool, async (client) => {
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = [];
      const placeholders = [];

      for (let j = 0; j < batch.length; j++) {
        const r = batch[j];
        const offset = j * 12;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`
        );
        values.push(
          r.legal_name, r.trade_name, r.legal_name_normalized, r.trade_name_normalized,
          r.mailing_address, r.predominant_class, r.naics_code, r.naics_description,
          r.subclass, r.subclass_description, r.business_size, new Date()
        );
      }

      // Check param count stays under PostgreSQL 65535 limit
      if (values.length > 65000) {
        throw new Error(`Batch too large: ${values.length} params (limit 65535)`);
      }

      const result = await client.query(`
        INSERT INTO wsib_registry (
          legal_name, trade_name, legal_name_normalized, trade_name_normalized,
          mailing_address, predominant_class, naics_code, naics_description,
          subclass, subclass_description, business_size, last_seen_at
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (legal_name_normalized, mailing_address)
        DO UPDATE SET
          trade_name = EXCLUDED.trade_name,
          trade_name_normalized = EXCLUDED.trade_name_normalized,
          predominant_class = EXCLUDED.predominant_class,
          naics_code = EXCLUDED.naics_code,
          naics_description = EXCLUDED.naics_description,
          subclass = EXCLUDED.subclass,
          subclass_description = EXCLUDED.subclass_description,
          business_size = EXCLUDED.business_size,
          last_seen_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `, values);

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;

      if ((i + BATCH) % 10000 < BATCH) {
        console.log(`  Progress: ${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
      }
    }
  });

  const durationMs = Date.now() - startMs;
  const status = 'completed';

  console.log(`\n=== Results ===`);
  console.log(`  Inserted:    ${inserted.toLocaleString()} rows`);
  console.log(`  Updated:     ${updated.toLocaleString()} rows`);
  console.log(`  Duration:    ${(durationMs / 1000).toFixed(1)}s`);

  // Final DB stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE trade_name IS NOT NULL) AS with_trade,
      COUNT(DISTINCT predominant_class) AS class_count
    FROM wsib_registry
  `);
  const s = stats.rows[0];
  console.log(`\nDB Stats: ${s.total} total | ${s.linked} linked | ${s.with_trade} with trade name | ${s.class_count} classes`);
  pipeline.emitMeta(
    { "WSIB CSV": ["legal_name", "trade_name", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size"] },
    { "wsib_registry": ["legal_name", "trade_name", "legal_name_normalized", "trade_name_normalized", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size", "last_seen_at"] }
  );

  pipeline.emitSummary({ records_total: inserted + updated, records_new: inserted, records_updated: updated });

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2,
           records_total = $3, records_new = $4
       WHERE id = $5`,
      [status, durationMs, inserted + updated, inserted, runId]
    ).catch(() => {});
  }
});
