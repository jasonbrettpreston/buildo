#!/usr/bin/env node
/**
 * Extract unique builder names from permits table, normalize, and insert into entities table.
 * Follows spec 11_builder_enrichment.md normalization pipeline.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - Separates algorithmic progress from DB mutation counts
 *   - records_meta with raw_names, normalized_entities, db_inserts, db_updates
 *
 * Usage: node scripts/extract-builders.js
 *
 * SPEC LINK: docs/specs/11_builder_enrichment.md
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
  const startTime = Date.now();

  pipeline.log.info('[extract-builders]', 'Extracting builders from permits...');

  // Get distinct builder names
  const result = await pool.query(`
    SELECT builder_name, COUNT(*) as permit_count
    FROM permits
    WHERE builder_name IS NOT NULL AND TRIM(builder_name) != ''
    GROUP BY builder_name
    ORDER BY permit_count DESC
  `);

  const rawNamesCount = result.rows.length;
  pipeline.log.info('[extract-builders]', `Found ${rawNamesCount.toLocaleString()} unique raw builder names`);

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

  pipeline.log.info('[extract-builders]', `Normalized to ${builderMap.size.toLocaleString()} unique builders`);

  // Batch insert
  const BATCH_SIZE = 500;
  const builders = Array.from(builderMap.values());
  let inserted = 0;
  let updated = 0;
  let totalProcessed = 0;

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
        WHERE entities.permit_count IS DISTINCT FROM EXCLUDED.permit_count
        RETURNING (xmax = 0) AS is_insert
      `, values);

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;
      totalProcessed += batch.length;

      if (totalProcessed % 1000 === 0 || i + BATCH_SIZE >= builders.length) {
        pipeline.progress('extract-builders', totalProcessed, builders.length, startTime);
      }
    }
  });

  const durationMs = Date.now() - startTime;

  // Verify
  const countResult = await pool.query('SELECT COUNT(*) as total FROM entities');
  pipeline.log.info('[extract-builders]', 'Complete', {
    total_in_db: parseInt(countResult.rows[0].total),
    raw_names: rawNamesCount,
    normalized: builderMap.size,
    inserted,
    updated,
    unchanged: totalProcessed - inserted - updated,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  pipeline.emitSummary({
    records_total: builderMap.size,
    records_new: inserted,
    records_updated: updated,
    records_meta: {
      duration_ms: durationMs,
      raw_names_found: rawNamesCount,
      normalized_unique_entities: builderMap.size,
      db_inserts: inserted,
      db_updates: updated,
    },
  });
  pipeline.emitMeta(
    { "permits": ["builder_name"] },
    { "entities": ["legal_name", "name_normalized", "permit_count", "last_seen_at"] }
  );
});
