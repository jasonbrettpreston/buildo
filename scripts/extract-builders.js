#!/usr/bin/env node
/**
 * Extract unique builder names from permits table, normalize, and insert into builders table.
 * Follows spec 11_builder_enrichment.md normalization pipeline.
 *
 * Usage: PG_PASSWORD=postgres node scripts/extract-builders.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

function normalizeBuilderName(name) {
  let normalized = name.toUpperCase().trim();
  normalized = normalized.replace(/\s+/g, ' ');
  // Strip business suffixes iteratively
  const suffixes = [
    'INCORPORATED', 'CORPORATION', 'LIMITED', 'COMPANY',
    'INC\\.?', 'CORP\\.?', 'LTD\\.?', 'CO\\.?', 'LLC\\.?', 'L\\.?P\\.?',
  ];
  const suffixPattern = new RegExp(
    `\\s*\\b(${suffixes.join('|')})\\s*$`, 'i'
  );
  // Run twice to catch double suffixes like "CORP INCORPORATED"
  normalized = normalized.replace(suffixPattern, '').trim();
  normalized = normalized.replace(suffixPattern, '').trim();
  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;]+$/, '').trim();
  return normalized;
}

async function run() {
  console.log('Extracting builders from permits...');

  // Get distinct builder names
  const result = await pool.query(`
    SELECT builder_name, COUNT(*) as permit_count
    FROM permits
    WHERE builder_name IS NOT NULL AND TRIM(builder_name) != ''
    GROUP BY builder_name
    ORDER BY permit_count DESC
  `);

  console.log(`Found ${result.rows.length} unique raw builder names`);

  // Normalize and dedup
  const builderMap = new Map(); // name_normalized -> { name, permit_count }
  for (const row of result.rows) {
    const normalized = normalizeBuilderName(row.builder_name);
    if (!normalized) continue;

    const existing = builderMap.get(normalized);
    if (existing) {
      existing.permit_count += parseInt(row.permit_count, 10);
      // Keep the most common raw name
      if (parseInt(row.permit_count, 10) > existing.max_count) {
        existing.name = row.builder_name.trim();
        existing.max_count = parseInt(row.permit_count, 10);
      }
    } else {
      builderMap.set(normalized, {
        name: row.builder_name.trim(),
        name_normalized: normalized,
        permit_count: parseInt(row.permit_count, 10),
        max_count: parseInt(row.permit_count, 10),
      });
    }
  }

  console.log(`Normalized to ${builderMap.size} unique builders`);

  // Batch insert
  const BATCH_SIZE = 500;
  const builders = Array.from(builderMap.values());
  let inserted = 0;

  for (let i = 0; i < builders.length; i += BATCH_SIZE) {
    const batch = builders.slice(i, i + BATCH_SIZE);
    const placeholders = [];
    const values = [];

    for (let j = 0; j < batch.length; j++) {
      const b = batch[j];
      const offset = j * 3;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      values.push(b.name, b.name_normalized, b.permit_count);
    }

    await pool.query(`
      INSERT INTO builders (name, name_normalized, permit_count)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (name_normalized) DO UPDATE SET
        permit_count = EXCLUDED.permit_count,
        last_seen_at = NOW()
    `, values);

    inserted += batch.length;
    if (inserted % 1000 === 0 || i + BATCH_SIZE >= builders.length) {
      console.log(`  ${inserted} builders inserted`);
    }
  }

  // Verify
  const countResult = await pool.query('SELECT COUNT(*) as total FROM builders');
  console.log(`\nDone. ${countResult.rows[0].total} builders in database.`);

  // Show top 10
  const top = await pool.query(
    'SELECT name, permit_count FROM builders ORDER BY permit_count DESC LIMIT 10'
  );
  console.log('\nTop 10 builders by permit count:');
  top.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (${r.permit_count} permits)`));

  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
