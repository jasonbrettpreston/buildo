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

// Entity type classification (mirrors src/lib/builders/normalize.ts classifyEntityType)
const NUMBERED_CORP_PATTERN = /^\d{5,}/;
const BUSINESS_KEYWORDS =
  /\b(homes?|builders?|construct|develop|design|group|project|reno|plumb|electric|hvac|roof|mason|concrete|contract|pav|excavat|landscape|paint|floor|insul|demol|glass|steel|iron|fenc|deck|drain|fire|solar|elevator|sid|waterproof|cabinet|mill|tile|stone|pool|caulk|trim|property|properties|invest|capital|holding|enterpr|restoration|maintenance|service|tech|solution|supply|architec|engineer|consult|manage|venture|tower|condo|real|custom|infra|mechanic|scaffold|crane|window|door|lumber|wood|metal|weld|pil|excavat|grad|asphalt|survey|environment|energy|systems|basement|estate|living|residence|habitat|urban|metro|civic|municipal|structural|foundation|framing|forming|drywall|glazing|insulation|masonry|siding|eavestrough|millwork|cabinetry|tiling|flooring|roofing|plumbing|electrical|painting|fencing|decking|demolition|drilling|boring|remediat|abatement|hoist|rigging|welding|paving|grading)/i;
const SUFFIX_DETECT = /\b(INC\.?|CORP\.?|LTD\.?|CO\.?|LLC\.?|L\.?P\.?|INCORPORATED|CORPORATION|LIMITED|COMPANY)\s*$/i;

function classifyEntityType(name) {
  if (!name || !name.trim()) return 'Individual';
  const trimmed = name.trim();
  if (SUFFIX_DETECT.test(trimmed.toUpperCase().replace(/[.,;'"]/g, '').trim())) return 'Corporation';
  if (NUMBERED_CORP_PATTERN.test(trimmed)) return 'Corporation';
  if (BUSINESS_KEYWORDS.test(trimmed)) return 'Corporation';
  if (trimmed.split(/\s+/).length >= 4) return 'Corporation';
  return 'Individual';
}

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
        entity_type: classifyEntityType(row.builder_name.trim()),
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
        const offset = j * 4;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        values.push(b.name, b.name_normalized, b.permit_count, b.entity_type);
      }

      const result = await client.query(`
        INSERT INTO entities (legal_name, name_normalized, permit_count, entity_type)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (name_normalized) DO UPDATE SET
          permit_count = EXCLUDED.permit_count,
          entity_type = COALESCE(entities.entity_type, EXCLUDED.entity_type),
          last_seen_at = NOW()
        WHERE entities.permit_count IS DISTINCT FROM EXCLUDED.permit_count
           OR entities.entity_type IS NULL
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

  // Backfill entity_type for any rows still NULL (from prior runs without classification)
  const backfillResult = await pool.query(`
    SELECT id, legal_name FROM entities WHERE entity_type IS NULL
  `);
  if (backfillResult.rows.length > 0) {
    pipeline.log.info('[extract-builders]', `Backfilling entity_type for ${backfillResult.rows.length} unclassified entities`);
    let backfillFailed = 0;
    // Batch: build CASE expression to update all rows in one statement
    const BACKFILL_BATCH = 500;
    const rows = backfillResult.rows;
    for (let i = 0; i < rows.length; i += BACKFILL_BATCH) {
      const batch = rows.slice(i, i + BACKFILL_BATCH);
      const cases = [];
      const ids = [];
      const params = [];
      for (let j = 0; j < batch.length; j++) {
        const etype = classifyEntityType(batch[j].legal_name);
        params.push(batch[j].id, etype);
        cases.push(`WHEN id = $${j * 2 + 1} THEN $${j * 2 + 2}::entity_type_enum`);
        ids.push(batch[j].id);
      }
      try {
        await pool.query(
          `UPDATE entities SET entity_type = CASE ${cases.join(' ')} END WHERE id = ANY($${params.length + 1}::int[])`,
          [...params, ids]
        );
      } catch (err) {
        pipeline.log.error('[extract-builders]', `Backfill batch failed: ${err.message}`);
        backfillFailed += batch.length;
      }
    }
    if (backfillFailed > 0) {
      pipeline.log.warn('[extract-builders]', `${backfillFailed} entities failed backfill`);
    }
  }

  const durationMs = Date.now() - startTime;

  // Verify
  const countResult = await pool.query('SELECT COUNT(*) as total FROM entities');
  // Classification counts
  const corpCount = builders.filter(b => b.entity_type === 'Corporation').length;
  const indivCount = builders.filter(b => b.entity_type === 'Individual').length;

  pipeline.log.info('[extract-builders]', 'Complete', {
    total_in_db: parseInt(countResult.rows[0].total),
    raw_names: rawNamesCount,
    normalized: builderMap.size,
    corporations: corpCount,
    individuals: indivCount,
    inserted,
    updated,
    unchanged: totalProcessed - inserted - updated,
    backfilled: backfillResult.rows.length,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for builder extraction observability
  const totalInDb = parseInt(countResult.rows[0].total);
  const dedupRatio = rawNamesCount > 0 ? ((1 - builderMap.size / rawNamesCount) * 100).toFixed(1) + '%' : '0%';
  const buildersAuditRows = [
    { metric: 'raw_names_distinct', value: rawNamesCount, threshold: null, status: 'INFO' },
    { metric: 'normalized_entities', value: builderMap.size, threshold: null, status: 'INFO' },
    { metric: 'dedup_ratio', value: dedupRatio, threshold: null, status: 'INFO' },
    { metric: 'db_inserted', value: inserted, threshold: null, status: 'INFO' },
    { metric: 'db_updated', value: updated, threshold: null, status: 'INFO' },
    { metric: 'total_in_db', value: totalInDb, threshold: '>= ' + builderMap.size, status: totalInDb >= builderMap.size ? 'PASS' : 'FAIL' },
    { metric: 'corporations', value: corpCount, threshold: null, status: 'INFO' },
    { metric: 'individuals', value: indivCount, threshold: null, status: 'INFO' },
    { metric: 'backfilled_entity_type', value: backfillResult.rows.length, threshold: null, status: 'INFO' },
  ];

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
      audit_table: {
        phase: 4,
        name: 'Builder Extraction',
        verdict: totalInDb < builderMap.size ? 'FAIL' : 'PASS',
        rows: buildersAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["builder_name"] },
    { "entities": ["legal_name", "name_normalized", "permit_count", "entity_type", "last_seen_at"] }
  );
});
