#!/usr/bin/env node
/**
 * Extract unique builder names from permits table, normalize, and insert into builders table.
 * Follows spec 11_builder_enrichment.md normalization pipeline.
 *
 * Usage: PG_PASSWORD=postgres node scripts/extract-builders.js
 */
const pipeline = require('./lib/pipeline');

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

pipeline.run('extract-builders', async (pool) => {
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
  let updated = 0;

  await pipeline.withTransaction(pool, async (client) => {
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

      const result = await client.query(`
        INSERT INTO entities (legal_name, name_normalized, permit_count)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (name_normalized) DO UPDATE SET
          permit_count = EXCLUDED.permit_count,
          last_seen_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `, values);

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;
      const processed = inserted + updated;
      if (processed % 1000 === 0 || i + BATCH_SIZE >= builders.length) {
        console.log(`  ${processed} builders processed (${inserted} new, ${updated} updated)`);
      }
    }
  });

  // Verify
  const countResult = await pool.query('SELECT COUNT(*) as total FROM entities');
  console.log(`\nDone. ${countResult.rows[0].total} builders in database.`);

  // Show top 10
  const top = await pool.query(
    'SELECT legal_name AS name, permit_count FROM entities ORDER BY permit_count DESC LIMIT 10'
  );
  console.log('\nTop 10 builders by permit count:');
  top.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (${r.permit_count} permits)`));
  pipeline.emitSummary({ records_total: builderMap.size, records_new: inserted, records_updated: updated });
  pipeline.emitMeta(
    { "permits": ["builder_name"] },
    { "entities": ["legal_name", "name_normalized", "permit_count", "last_seen_at"] }
  );
});
