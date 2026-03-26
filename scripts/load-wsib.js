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
    // When running inside a chain, skip gracefully instead of crashing
    if (CHAIN_ID) {
      pipeline.log.info('[load-wsib]', 'No --file argument (chain context). Skipping.');
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          audit_table: {
            phase: 11,
            name: 'WSIB Registry Ingestion',
            verdict: 'PASS',
            rows: [
              { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
              { metric: 'reason', value: 'No CSV file provided — WSIB requires annual manual download', threshold: null, status: 'INFO' },
              { metric: 'instructions', value: 'Download BusinessClassificationDetails CSV from wsib.ca → save to data/ folder → run: node scripts/load-wsib.js --file data/BusinessClassificationDetails(YYYY).csv', threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      pipeline.emitMeta(
        { "WSIB CSV": ["legal_name", "trade_name", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size"] },
        { "wsib_registry": ["legal_name", "trade_name", "legal_name_normalized", "trade_name_normalized", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size", "last_seen_at"] }
      );
      return;
    }
    throw new Error('Usage: node scripts/load-wsib.js --file <path-to-csv>');
  }
  const filePath = args[fileIdx + 1];

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  pipeline.log.info('[load-wsib]', `Source: ${filePath}`);

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
      pipeline.log.warn('[load-wsib]', `Could not insert pipeline_runs row: ${err.message}`);
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
        pipeline.log.info('[load-wsib]', `${totalRows.toLocaleString()} rows read, ${gRows.toLocaleString()} Class G kept`);
      }
    });

    parser.on('error', reject);
    parser.on('end', resolve);
  });

  pipeline.log.info('[load-wsib]', 'Parsing complete', {
    total_csv_rows: totalRows, non_g_skipped: skippedNonG,
    no_name_skipped: skippedNoName, unique_class_g: seen.size,
  });

  pipeline.log.info('[load-wsib]', 'Upserting into wsib_registry...');
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
        const offset = j * 11;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, NOW())`
        );
        values.push(
          r.legal_name, r.trade_name, r.legal_name_normalized, r.trade_name_normalized,
          r.mailing_address, r.predominant_class, r.naics_code, r.naics_description,
          r.subclass, r.subclass_description, r.business_size
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
        WHERE wsib_registry.trade_name IS DISTINCT FROM EXCLUDED.trade_name
           OR wsib_registry.trade_name_normalized IS DISTINCT FROM EXCLUDED.trade_name_normalized
           OR wsib_registry.predominant_class IS DISTINCT FROM EXCLUDED.predominant_class
           OR wsib_registry.naics_code IS DISTINCT FROM EXCLUDED.naics_code
           OR wsib_registry.naics_description IS DISTINCT FROM EXCLUDED.naics_description
           OR wsib_registry.subclass IS DISTINCT FROM EXCLUDED.subclass
           OR wsib_registry.subclass_description IS DISTINCT FROM EXCLUDED.subclass_description
           OR wsib_registry.business_size IS DISTINCT FROM EXCLUDED.business_size
        RETURNING (xmax = 0) AS is_insert
      `, values);

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;

      if ((i + BATCH) % 10000 < BATCH) {
        pipeline.progress('load-wsib', Math.min(i + BATCH, rows.length), rows.length, startMs);
      }
    }
  });

  const durationMs = Date.now() - startMs;
  const status = 'completed';

  pipeline.log.info('[load-wsib]', 'Load complete', {
    inserted, updated, duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

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
  pipeline.log.info('[load-wsib]', `DB stats: ${s.total} total | ${s.linked} linked | ${s.with_trade} with trade | ${s.class_count} classes`);
  pipeline.emitMeta(
    { "WSIB CSV": ["legal_name", "trade_name", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size"] },
    { "wsib_registry": ["legal_name", "trade_name", "legal_name_normalized", "trade_name_normalized", "mailing_address", "predominant_class", "naics_code", "naics_description", "subclass", "subclass_description", "business_size", "last_seen_at"] }
  );

  const gRowCount = seen.size;
  const skipNoNameRate = gRowCount + skippedNoName > 0
    ? (skippedNoName / (gRowCount + skippedNoName)) * 100 : 0;
  const skipNoNameRateStr = skipNoNameRate.toFixed(1) + '%';
  const auditRows = [
    { metric: 'total_csv_rows', value: totalRows, threshold: null, status: 'INFO' },
    { metric: 'unique_class_g', value: gRowCount, threshold: '>= 110000', status: gRowCount < 110000 ? 'WARN' : 'PASS' },
    { metric: 'records_inserted', value: inserted, threshold: null, status: 'INFO' },
    { metric: 'records_updated', value: updated, threshold: null, status: 'INFO' },
    { metric: 'skipped_non_g', value: skippedNonG, threshold: null, status: 'INFO' },
    { metric: 'skipped_no_name', value: skippedNoName, threshold: null, status: 'INFO' },
    { metric: 'skip_no_name_rate', value: skipNoNameRateStr, threshold: '< 1%', status: skipNoNameRate >= 1 ? 'WARN' : 'PASS' },
  ];
  const hasWarns = gRowCount < 110000 || skipNoNameRate >= 1;

  pipeline.emitSummary({
    records_total: inserted + updated,
    records_new: inserted,
    records_updated: updated,
    records_meta: {
      duration_ms: durationMs,
      total_csv_rows: totalRows,
      unique_class_g: gRowCount,
      records_inserted: inserted,
      records_updated: updated,
      skipped_non_g: skippedNonG,
      skipped_no_name: skippedNoName,
      audit_table: {
        phase: 11,
        name: 'WSIB Registry Ingestion',
        verdict: hasWarns ? 'WARN' : 'PASS',
        rows: auditRows,
      },
    },
  });

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
