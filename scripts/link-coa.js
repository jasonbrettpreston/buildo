#!/usr/bin/env node
/**
 * Link unlinked CoA applications to building permits using address matching.
 *
 * 3-tier cascade (bulk SQL operations):
 *   1. Exact address match (street_num + street_name + ward) → 0.95 confidence
 *   2. Fuzzy address match (street_name + ward)              → 0.60 confidence
 *   3. Description similarity (full-text search + ward)      → 0.30-0.50 confidence
 *
 * Ward comparison uses LTRIM(ward, '0') to normalize format differences
 * (CoA uses "2", permits use "02").
 *
 * Tier 3 uses plainto_tsquery for stop-word safety.
 *
 * Usage: node scripts/link-coa.js [--dry-run]
 *
 * SPEC LINK: docs/specs/12_coa_integration.md
 */
const pipeline = require('./lib/pipeline');

// SQL version of the JS stripStreetType regex — removes street type suffixes
// Strip street type suffixes and escape LIKE wildcards (% and _) for safe use in LIKE patterns
const STRIP_STREET_SQL = `REPLACE(REPLACE(TRIM(REGEXP_REPLACE(UPPER(ca.street_name),
  '\\y(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\\y',
  '', 'g')), '%', '\\%'), '_', '\\_')`;

pipeline.run('link-coa', async (pool) => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startTime = Date.now();

  pipeline.log.info('[link-coa]', `Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // Count unlinked before
  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM coa_applications WHERE linked_permit_num IS NULL`
  );
  const totalUnlinked = parseInt(beforeResult.rows[0].total, 10);
  pipeline.log.info('[link-coa]', `Unlinked CoA applications: ${totalUnlinked.toLocaleString()}`);

  if (totalUnlinked === 0) {
    pipeline.log.info('[link-coa]', 'Nothing to link.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    return;
  }

  let exact = 0, fuzzy = 0, desc = 0;
  let descErrors = 0;

  // ------------------------------------------------------------------
  // Tier 1: Bulk exact address match (street_num + street_name + ward → 0.95)
  // Ward normalized with LTRIM to handle "2" vs "02" format mismatch.
  // ------------------------------------------------------------------
  pipeline.log.info('[link-coa]', 'Tier 1: Exact address + ward matching...');
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
            AND LTRIM(p.ward, '0') = LTRIM(ca2.ward, '0')
            AND p.permit_type != 'Pre-Permit'
          WHERE ca2.linked_permit_num IS NULL
            AND ca2.street_num IS NOT NULL AND TRIM(ca2.street_num) != ''
            AND ca2.street_name IS NOT NULL AND TRIM(ca2.street_name) != ''
            AND ca2.ward IS NOT NULL
            AND LENGTH(${STRIP_STREET_SQL.replace(/ca\./g, 'ca2.')}) > 0
          ORDER BY ca2.id, p.issued_date DESC NULLS LAST
        ) matched
        WHERE ca.id = matched.id
      `);
      return exactResult.rowCount || 0;
    });
  }
  pipeline.log.info('[link-coa]', `Tier 1 linked: ${exact.toLocaleString()} (confidence 0.95)`);

  // ------------------------------------------------------------------
  // Tier 2: Bulk fuzzy address match (street_name + ward → 0.60)
  // ------------------------------------------------------------------
  pipeline.log.info('[link-coa]', 'Tier 2: Fuzzy address + ward matching...');
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
            AND LTRIM(p.ward, '0') = LTRIM(ca2.ward, '0')
            AND p.permit_type != 'Pre-Permit'
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
  pipeline.log.info('[link-coa]', `Tier 2 linked: ${fuzzy.toLocaleString()} (confidence 0.60)`);

  // ------------------------------------------------------------------
  // Tier 3: Description FTS — batched via unnest + CROSS JOIN LATERAL
  // Uses plainto_tsquery for stop-word safety (no dangling & crash risk).
  // ------------------------------------------------------------------
  pipeline.log.info('[link-coa]', 'Tier 3: Description similarity matching...');
  const remaining = await pool.query(`
    SELECT id, application_number, ward, description
    FROM coa_applications
    WHERE linked_permit_num IS NULL
      AND description IS NOT NULL AND LENGTH(TRIM(description)) >= 10
      AND ward IS NOT NULL
    ORDER BY decision_date DESC NULLS LAST
  `);
  pipeline.log.info('[link-coa]', `Tier 3 candidates: ${remaining.rows.length.toLocaleString()}`);

  // Build keyword strings for each candidate (JS-side keyword extraction)
  // Joined with spaces for plainto_tsquery (not & for to_tsquery)
  const candidates = [];
  for (const app of remaining.rows) {
    const keywords = app.description
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 8);
    if (keywords.length < 2) continue;
    candidates.push({ id: app.id, ward: app.ward, tsQuery: keywords.join(' ') });
  }
  pipeline.log.info('[link-coa]', `Tier 3 filterable: ${candidates.length.toLocaleString()}`);

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
              SELECT DISTINCT ON (c.coa_id) c.coa_id, lat.permit_num, lat.rank
              FROM candidates c
              CROSS JOIN LATERAL (
                SELECT permit_num,
                       ts_rank(to_tsvector('english', COALESCE(description, '')),
                               plainto_tsquery('english', c.ts_query)) AS rank
                FROM permits
                WHERE to_tsvector('english', COALESCE(description, '')) @@ plainto_tsquery('english', c.ts_query)
                  AND LTRIM(ward, '0') = LTRIM(c.ward, '0')
                  AND permit_type != 'Pre-Permit'
                ORDER BY ts_rank(to_tsvector('english', COALESCE(description, '')),
                                 plainto_tsquery('english', c.ts_query)) DESC
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
        pipeline.progress('link-coa', Math.min(offset + BATCH_SIZE, candidates.length), candidates.length, startTime);
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
            WHERE to_tsvector('english', COALESCE(description, '')) @@ plainto_tsquery('english', c.ts_query)
              AND LTRIM(ward, '0') = LTRIM(c.ward, '0')
              AND permit_type != 'Pre-Permit'
            LIMIT 1
          ) lat
        `, [ids, wards, queries]);
        desc += parseInt(result.rows[0].cnt, 10);
      } catch {
        descErrors++;
      }

      if ((offset + BATCH_SIZE) % 2000 === 0 || offset + BATCH_SIZE >= candidates.length) {
        pipeline.progress('link-coa', Math.min(offset + BATCH_SIZE, candidates.length), candidates.length, startTime);
      }
    }
  }
  pipeline.log.info('[link-coa]', `Tier 3 linked: ${desc.toLocaleString()} (confidence 0.30-0.50)${descErrors > 0 ? `, ${descErrors} batch errors` : ''}`);

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const durationMs = Date.now() - startTime;
  const totalLinked = exact + fuzzy + desc;
  const noMatch = totalUnlinked - totalLinked;

  pipeline.log.info('[link-coa]', 'Linking complete', {
    exact, fuzzy, desc, noMatch, totalLinked,
    rate: `${((totalLinked / totalUnlinked) * 100).toFixed(1)}%`,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  if (dryRun) {
    pipeline.log.info('[link-coa]', 'DRY RUN complete — no changes written.');
  }

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE linked_confidence >= 0.90) AS high_conf,
      COUNT(*) FILTER (WHERE linked_confidence >= 0.50 AND linked_confidence < 0.90) AS med_conf,
      COUNT(*) FILTER (WHERE linked_confidence > 0 AND linked_confidence < 0.50) AS low_conf,
      COUNT(*) FILTER (WHERE decision ILIKE 'approved%' AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
    FROM coa_applications
  `);
  const s = stats.rows[0];
  pipeline.log.info('[link-coa]', `DB stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med, ${s.low_conf} low) | ${s.upcoming} upcoming leads`);

  // Integrity queries for audit_table
  const linksToPrePermits = await pool.query(
    `SELECT COUNT(*) FROM coa_applications ca
     JOIN permits p ON p.permit_num = ca.linked_permit_num
     WHERE ca.linked_permit_num IS NOT NULL
       AND p.permit_type = 'Pre-Permit'`
  );
  const prePermitLinkCount = parseInt(linksToPrePermits.rows[0].count, 10) || 0;

  const crossWardLinks = await pool.query(
    `SELECT COUNT(*) FROM coa_applications ca
     JOIN permits p ON p.permit_num = ca.linked_permit_num
     WHERE ca.linked_permit_num IS NOT NULL
       AND ca.ward IS NOT NULL AND p.ward IS NOT NULL
       AND LTRIM(ca.ward, '0') != LTRIM(p.ward, '0')`
  );
  const crossWardCount = parseInt(crossWardLinks.rows[0].count, 10) || 0;

  // Build audit_table
  const auditRows = [
    { metric: 'total_candidates', value: totalUnlinked, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_1_exact', value: exact, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_2_fuzzy', value: fuzzy, threshold: null, status: 'INFO' },
    { metric: 'matches_tier_3_desc', value: desc, threshold: null, status: 'INFO' },
    { metric: 'tier_3_errors', value: descErrors, threshold: '== 0', status: descErrors > 0 ? 'FAIL' : 'PASS' },
    { metric: 'unlinked_remaining', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'links_to_pre_permits', value: prePermitLinkCount, threshold: '== 0', status: prePermitLinkCount > 0 ? 'FAIL' : 'PASS' },
    { metric: 'cross_ward_links', value: crossWardCount, threshold: '== 0', status: crossWardCount > 0 ? 'WARN' : 'PASS' },
  ];
  const linkAuditHasFails = prePermitLinkCount > 0;
  const linkAuditHasWarns = descErrors > 0 || crossWardCount > 0;
  const chainId = process.env.PIPELINE_CHAIN || null;
  const linkAuditTable = {
    phase: chainId === 'coa' ? 4 : 12,
    name: 'Link CoA',
    verdict: linkAuditHasFails ? 'FAIL' : linkAuditHasWarns ? 'WARN' : 'PASS',
    rows: auditRows,
  };

  const meta = {
    duration_ms: durationMs,
    matches_tier_1_exact: exact,
    matches_tier_2_fuzzy: fuzzy,
    matches_tier_3_desc: desc,
    tier_3_errors: descErrors,
    unlinked_remaining: noMatch,
    audit_table: linkAuditTable,
  };
  pipeline.emitSummary({ records_total: totalLinked, records_new: 0, records_updated: totalLinked, records_meta: meta });
  pipeline.emitMeta(
    { "coa_applications": ["id", "application_number", "street_num", "street_name", "ward", "description", "decision_date", "linked_permit_num"], "permits": ["permit_num", "street_num", "street_name", "ward", "issued_date", "description"] },
    { "coa_applications": ["linked_permit_num", "linked_confidence", "last_seen_at"] }
  );
});
