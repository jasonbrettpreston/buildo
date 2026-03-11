#!/usr/bin/env node
/**
 * Link unlinked CoA applications to building permits using address matching.
 *
 * 3-tier cascade (bulk SQL operations):
 *   1. Exact address match (street_num + street_name) → 0.95 confidence
 *   2. Fuzzy address match (street_name + ward)       → 0.60 confidence
 *   3. Description similarity (full-text search)      → 0.30-0.50 confidence
 *
 * Usage: node scripts/link-coa.js [--dry-run]
 */
const pipeline = require('./lib/pipeline');

// SQL version of the JS stripStreetType regex — removes street type suffixes
const STRIP_STREET_SQL = `TRIM(REGEXP_REPLACE(UPPER(ca.street_name),
  '\\y(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\\y',
  '', 'g'))`;

pipeline.run('link-coa', async (pool) => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('=== Buildo CoA Linker ===\n');
  if (dryRun) console.log('DRY RUN — no database writes\n');

  // Count unlinked before
  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM coa_applications WHERE linked_permit_num IS NULL`
  );
  const totalUnlinked = parseInt(beforeResult.rows[0].total, 10);
  console.log(`Unlinked CoA applications: ${totalUnlinked.toLocaleString()}\n`);

  if (totalUnlinked === 0) {
    console.log('Nothing to link.');
    return;
  }

  const startTime = Date.now();
  let exact = 0, fuzzy = 0, desc = 0;

  // ------------------------------------------------------------------
  // Tier 1: Bulk exact address match (street_num + street_name → 0.95)
  // ------------------------------------------------------------------
  console.log('Tier 1: Exact address matching...');
  if (!dryRun) {
    exact = await pipeline.withTransaction(pool, async (client) => {
      const exactResult = await client.query(`
        UPDATE coa_applications ca
        SET linked_permit_num = matched.permit_num,
            linked_confidence = 0.95,
            last_seen_at = NOW()
        FROM (
          SELECT DISTINCT ON (ca2.id) ca2.id, p.permit_num
          FROM coa_applications ca2
          JOIN permits p
            ON UPPER(TRIM(p.street_num)) = UPPER(TRIM(ca2.street_num))
            AND UPPER(p.street_name) LIKE '%' || ${STRIP_STREET_SQL.replace(/ca\./g, 'ca2.')} || '%'
          WHERE ca2.linked_permit_num IS NULL
            AND ca2.street_num IS NOT NULL AND TRIM(ca2.street_num) != ''
            AND ca2.street_name IS NOT NULL AND TRIM(ca2.street_name) != ''
            AND LENGTH(${STRIP_STREET_SQL.replace(/ca\./g, 'ca2.')}) > 0
          ORDER BY ca2.id, p.issued_date DESC NULLS LAST
        ) matched
        WHERE ca.id = matched.id
      `);
      return exactResult.rowCount || 0;
    });
  }
  console.log(`  Linked: ${exact.toLocaleString()} (confidence 0.95)`);

  // ------------------------------------------------------------------
  // Tier 2: Bulk fuzzy address match (street_name + ward → 0.60)
  // ------------------------------------------------------------------
  console.log('Tier 2: Fuzzy address matching...');
  if (!dryRun) {
    fuzzy = await pipeline.withTransaction(pool, async (client) => {
      const fuzzyResult = await client.query(`
        UPDATE coa_applications ca
        SET linked_permit_num = matched.permit_num,
            linked_confidence = 0.60,
            last_seen_at = NOW()
        FROM (
          SELECT DISTINCT ON (ca2.id) ca2.id, p.permit_num
          FROM coa_applications ca2
          JOIN permits p
            ON UPPER(p.street_name) LIKE '%' || ${STRIP_STREET_SQL.replace(/ca\./g, 'ca2.')} || '%'
            AND p.ward = ca2.ward
          WHERE ca2.linked_permit_num IS NULL
            AND ca2.street_name IS NOT NULL AND TRIM(ca2.street_name) != ''
            AND ca2.ward IS NOT NULL
            AND LENGTH(${STRIP_STREET_SQL.replace(/ca\./g, 'ca2.')}) > 0
          ORDER BY ca2.id, p.issued_date DESC NULLS LAST
        ) matched
        WHERE ca.id = matched.id
      `);
      return fuzzyResult.rowCount || 0;
    });
  }
  console.log(`  Linked: ${fuzzy.toLocaleString()} (confidence 0.60)`);

  // ------------------------------------------------------------------
  // Tier 3: Description FTS — batched via unnest + CROSS JOIN LATERAL
  // ------------------------------------------------------------------
  console.log('Tier 3: Description similarity matching...');
  const remaining = await pool.query(`
    SELECT id, application_number, ward, description
    FROM coa_applications
    WHERE linked_permit_num IS NULL
      AND description IS NOT NULL AND LENGTH(TRIM(description)) >= 10
      AND ward IS NOT NULL
    ORDER BY decision_date DESC NULLS LAST
  `);
  console.log(`  Candidates: ${remaining.rows.length.toLocaleString()}`);

  // Build ts_query strings for each candidate (JS-side keyword extraction)
  const candidates = [];
  for (const app of remaining.rows) {
    const keywords = app.description
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 8);
    if (keywords.length < 2) continue;
    candidates.push({ id: app.id, ward: app.ward, tsQuery: keywords.join(' & ') });
  }
  console.log(`  Filterable candidates: ${candidates.length.toLocaleString()}`);

  let descErrors = 0;
  const BATCH_SIZE = 500;
  if (!dryRun) {
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      const ids = batch.map((c) => c.id);
      const wards = batch.map((c) => c.ward);
      const queries = batch.map((c) => c.tsQuery);

      try {
        await pipeline.withTransaction(pool, async (client) => {
          const result = await client.query(`
            WITH candidates AS (
              SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
                AS t(coa_id, ward, ts_query)
            )
            UPDATE coa_applications ca
            SET linked_permit_num = matched.permit_num,
                linked_confidence = LEAST(0.50, 0.30 + matched.rank * 0.1),
                last_seen_at = NOW()
            FROM (
              SELECT DISTINCT ON (c.coa_id) c.coa_id, p.permit_num, lat.rank
              FROM candidates c
              CROSS JOIN LATERAL (
                SELECT permit_num,
                       ts_rank(to_tsvector('english', COALESCE(description, '')),
                               to_tsquery('english', c.ts_query)) AS rank
                FROM permits
                WHERE to_tsvector('english', COALESCE(description, '')) @@ to_tsquery('english', c.ts_query)
                  AND ward = c.ward
                ORDER BY ts_rank(to_tsvector('english', COALESCE(description, '')),
                                 to_tsquery('english', c.ts_query)) DESC
                LIMIT 1
              ) lat
              ORDER BY c.coa_id
            ) matched
            WHERE ca.id = matched.coa_id
          `, [ids, wards, queries]);
          desc += result.rowCount || 0;
        });
      } catch (err) {
        descErrors++;
        pipeline.log.warn('[link-coa]', `Tier 3 batch at offset ${offset} failed: ${err.message}`);
      }

      if ((offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= candidates.length) {
        console.log(`  Progress: ${Math.min(offset + BATCH_SIZE, candidates.length).toLocaleString()} / ${candidates.length.toLocaleString()} — ${desc} matched`);
      }
    }
  } else {
    // Dry run: count potential matches via read-only batched LATERAL
    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      const ids = batch.map((c) => c.id);
      const wards = batch.map((c) => c.ward);
      const queries = batch.map((c) => c.tsQuery);

      try {
        const result = await pool.query(`
          WITH candidates AS (
            SELECT * FROM unnest($1::int[], $2::text[], $3::text[])
              AS t(coa_id, ward, ts_query)
          )
          SELECT COUNT(*) as cnt
          FROM candidates c
          CROSS JOIN LATERAL (
            SELECT permit_num
            FROM permits
            WHERE to_tsvector('english', COALESCE(description, '')) @@ to_tsquery('english', c.ts_query)
              AND ward = c.ward
            LIMIT 1
          ) lat
        `, [ids, wards, queries]);
        desc += parseInt(result.rows[0].cnt, 10);
      } catch {
        descErrors++;
      }

      if ((offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= candidates.length) {
        console.log(`  Progress: ${Math.min(offset + BATCH_SIZE, candidates.length).toLocaleString()} / ${candidates.length.toLocaleString()} — ${desc} matched`);
      }
    }
  }
  console.log(`  Linked: ${desc.toLocaleString()} (confidence 0.30-0.50)`);
  if (descErrors > 0) console.log(`  Errors: ${descErrors}`);

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalLinked = exact + fuzzy + desc;
  const noMatch = totalUnlinked - totalLinked;

  console.log('');
  console.log('=== Results ===');
  console.log(`  Exact address matches:    ${exact.toLocaleString()} (0.95 confidence)`);
  console.log(`  Fuzzy address matches:    ${fuzzy.toLocaleString()} (0.60 confidence)`);
  console.log(`  Description matches:      ${desc.toLocaleString()} (0.30-0.50 confidence)`);
  console.log(`  No match:                 ${noMatch.toLocaleString()}`);
  console.log(`  Total linked:             ${totalLinked.toLocaleString()}/${totalUnlinked.toLocaleString()} (${((totalLinked / totalUnlinked) * 100).toFixed(1)}%)`);
  console.log(`  Duration:                 ${elapsed}s`);

  if (dryRun) {
    console.log('\nDRY RUN complete — no changes written to database.');
  }

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE linked_confidence >= 0.90) AS high_conf,
      COUNT(*) FILTER (WHERE linked_confidence >= 0.50 AND linked_confidence < 0.90) AS med_conf,
      COUNT(*) FILTER (WHERE linked_confidence > 0 AND linked_confidence < 0.50) AS low_conf,
      COUNT(*) FILTER (WHERE decision IN ('Approved', 'Approved with Conditions') AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
    FROM coa_applications
  `);
  const s = stats.rows[0];
  console.log(`\nDB Stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med, ${s.low_conf} low) | ${s.upcoming} upcoming leads`);
  pipeline.emitSummary({ records_total: totalLinked, records_new: 0, records_updated: totalLinked });
  pipeline.emitMeta(
    { "coa_applications": ["id", "application_number", "street_num", "street_name", "ward", "description", "decision_date", "linked_permit_num"], "permits": ["permit_num", "street_num", "street_name", "ward", "issued_date", "description"] },
    { "coa_applications": ["linked_permit_num", "linked_confidence", "last_seen_at"] }
  );
});
