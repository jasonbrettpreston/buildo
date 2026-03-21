#!/usr/bin/env node
/**
 * Link WSIB registry entries to builders using name matching.
 *
 * 3-tier bulk SQL cascade:
 *   1. Exact trade name match  → 0.95 confidence
 *   2. Exact legal name match  → 0.90 confidence
 *   3. Fuzzy name match (LIKE) → 0.60 confidence (capped at 1000 matches)
 *
 * On match: updates entities.is_wsib_registered and wsib_registry.linked_entity_id.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with tier breakdown for downstream assertions
 *
 * Usage: node scripts/link-wsib.js [--dry-run]
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('link-wsib', async (pool) => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startTime = Date.now();

  pipeline.log.info('[link-wsib]', `Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM wsib_registry WHERE linked_entity_id IS NULL`
  );
  const totalUnlinked = parseInt(beforeResult.rows[0].total, 10);
  pipeline.log.info('[link-wsib]', `Unlinked WSIB entries: ${totalUnlinked.toLocaleString()}`);

  if (totalUnlinked === 0) {
    pipeline.log.info('[link-wsib]', 'Nothing to link.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    pipeline.emitMeta(
      { "wsib_registry": ["id", "trade_name_normalized", "legal_name_normalized", "linked_entity_id"], "entities": ["id", "name_normalized", "permit_count"] },
      { "wsib_registry": ["linked_entity_id", "match_confidence", "matched_at"], "entities": ["is_wsib_registered"] }
    );
    return;
  }

  let tier1 = 0, tier2 = 0, tier3 = 0;

  // Tier 3 fuzzy match SQL — shared between live and dry-run modes
  const TIER3_CTE = `
    SELECT DISTINCT ON (w.id) w.id AS wsib_id, e.id AS entity_id
    FROM wsib_registry w
    JOIN entities e ON (
      (w.trade_name_normalized IS NOT NULL AND LENGTH(w.trade_name_normalized) >= 5
        AND similarity(w.trade_name_normalized, e.name_normalized) > 0.6)
      OR
      (LENGTH(w.legal_name_normalized) >= 5
        AND similarity(w.legal_name_normalized, e.name_normalized) > 0.6)
    )
    WHERE w.linked_entity_id IS NULL
      AND LENGTH(e.name_normalized) >= 5
    ORDER BY w.id, e.permit_count DESC
  `;

  if (dryRun) {
    // Dry-run simulation: read-only COUNT queries using same matching logic
    pipeline.log.info('[link-wsib]', 'DRY RUN — simulating match counts...');

    const dr1 = await pool.query(`
      SELECT COUNT(DISTINCT w.id) as cnt
      FROM wsib_registry w
      JOIN entities e ON e.name_normalized = w.trade_name_normalized
      WHERE w.linked_entity_id IS NULL
        AND w.trade_name_normalized IS NOT NULL
        AND LENGTH(w.trade_name_normalized) >= 3
    `);
    tier1 = parseInt(dr1.rows[0].cnt, 10);
    pipeline.log.info('[link-wsib]', `Tier 1 (simulated): ${tier1.toLocaleString()} matches`);

    const dr2 = await pool.query(`
      SELECT COUNT(DISTINCT w.id) as cnt
      FROM wsib_registry w
      JOIN entities e ON e.name_normalized = w.legal_name_normalized
      WHERE w.linked_entity_id IS NULL
        AND LENGTH(w.legal_name_normalized) >= 3
        AND NOT EXISTS (
          SELECT 1 FROM wsib_registry w2
          JOIN entities e2 ON e2.name_normalized = w2.trade_name_normalized
          WHERE w2.id = w.id AND w2.trade_name_normalized IS NOT NULL AND LENGTH(w2.trade_name_normalized) >= 3
        )
    `);
    tier2 = parseInt(dr2.rows[0].cnt, 10);
    pipeline.log.info('[link-wsib]', `Tier 2 (simulated): ${tier2.toLocaleString()} matches`);

    const dr3 = await pool.query(`SELECT COUNT(*) as cnt FROM (${TIER3_CTE}) sub`);
    tier3 = parseInt(dr3.rows[0].cnt, 10);
    pipeline.log.info('[link-wsib]', `Tier 3 (simulated): ${tier3.toLocaleString()} matches`);
  } else {
    await pipeline.withTransaction(pool, async (client) => {
      // ------------------------------------------------------------------
      // Tier 1: Exact trade name match (0.95)
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 1: Exact trade name matching...');
      const result1 = await client.query(`
        WITH matched AS (
          SELECT DISTINCT ON (w.id) w.id AS wsib_id, e.id AS entity_id
          FROM wsib_registry w
          JOIN entities e ON e.name_normalized = w.trade_name_normalized
          WHERE w.linked_entity_id IS NULL
            AND w.trade_name_normalized IS NOT NULL
            AND LENGTH(w.trade_name_normalized) >= 3
          ORDER BY w.id, e.permit_count DESC
        )
        UPDATE wsib_registry w
        SET linked_entity_id = m.entity_id,
            match_confidence = 0.95,
            matched_at = NOW()
        FROM matched m
        WHERE w.id = m.wsib_id
      `);
      tier1 = result1.rowCount || 0;

      if (tier1 > 0) {
        await client.query(`
          UPDATE entities e
          SET is_wsib_registered = true
          FROM wsib_registry w
          WHERE w.linked_entity_id = e.id
            AND w.match_confidence = 0.95
            AND e.is_wsib_registered = false
        `);
      }
      pipeline.log.info('[link-wsib]', `Tier 1 linked: ${tier1.toLocaleString()} (confidence 0.95)`);

      // ------------------------------------------------------------------
      // Tier 2: Exact legal name match (0.90)
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 2: Exact legal name matching...');
      const result2 = await client.query(`
        WITH matched AS (
          SELECT DISTINCT ON (w.id) w.id AS wsib_id, e.id AS entity_id
          FROM wsib_registry w
          JOIN entities e ON e.name_normalized = w.legal_name_normalized
          WHERE w.linked_entity_id IS NULL
            AND LENGTH(w.legal_name_normalized) >= 3
          ORDER BY w.id, e.permit_count DESC
        )
        UPDATE wsib_registry w
        SET linked_entity_id = m.entity_id,
            match_confidence = 0.90,
            matched_at = NOW()
        FROM matched m
        WHERE w.id = m.wsib_id
      `);
      tier2 = result2.rowCount || 0;

      if (tier2 > 0) {
        await client.query(`
          UPDATE entities e
          SET is_wsib_registered = true
          FROM wsib_registry w
          WHERE w.linked_entity_id = e.id
            AND w.match_confidence = 0.90
            AND e.is_wsib_registered = false
        `);
      }
      pipeline.log.info('[link-wsib]', `Tier 2 linked: ${tier2.toLocaleString()} (confidence 0.90)`);

      // ------------------------------------------------------------------
      // Tier 3: Fuzzy name match — pg_trgm similarity() (0.60)
      // Uses GIN trigram indexes for fast fuzzy matching.
      // Replaces bi-directional LIKE which caused Cartesian bomb.
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 3: Fuzzy name matching (pg_trgm)...');
      const result3 = await client.query(`
        WITH matched AS (${TIER3_CTE})
        UPDATE wsib_registry w
        SET linked_entity_id = m.entity_id,
            match_confidence = 0.60,
            matched_at = NOW()
        FROM matched m
        WHERE w.id = m.wsib_id
      `);
      tier3 = result3.rowCount || 0;

      if (tier3 > 0) {
        await client.query(`
          UPDATE entities e
          SET is_wsib_registered = true
          FROM wsib_registry w
          WHERE w.linked_entity_id = e.id
            AND w.match_confidence = 0.60
            AND e.is_wsib_registered = false
        `);
      }
      pipeline.log.info('[link-wsib]', `Tier 3 linked: ${tier3.toLocaleString()} (confidence 0.60)`);
    });
  }

  const totalLinked = tier1 + tier2 + tier3;
  const noMatch = totalUnlinked - totalLinked;
  const durationMs = Date.now() - startTime;

  pipeline.log.info('[link-wsib]', 'Linking complete', {
    tier1, tier2, tier3, totalLinked, noMatch,
    rate: `${((totalLinked / totalUnlinked) * 100).toFixed(1)}%`,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  if (dryRun) {
    pipeline.log.info('[link-wsib]', 'DRY RUN complete — no changes written.');
  }

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE match_confidence >= 0.90) AS high_conf,
      COUNT(*) FILTER (WHERE match_confidence >= 0.50 AND match_confidence < 0.90) AS med_conf
    FROM wsib_registry
  `);
  const s = stats.rows[0];
  pipeline.log.info('[link-wsib]', `DB stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med)`);

  // Build audit_table for WSIB matching observability
  const linkRate = totalUnlinked > 0 ? (totalLinked / totalUnlinked) * 100 : 0;
  const wsibAuditRows = [
    { metric: 'unlinked_start', value: totalUnlinked, threshold: null, status: 'INFO' },
    { metric: 'tier_1_trade_matches', value: tier1, threshold: null, status: 'INFO' },
    { metric: 'tier_2_legal_matches', value: tier2, threshold: null, status: 'INFO' },
    { metric: 'tier_3_fuzzy_matches', value: tier3, threshold: null, status: 'INFO' },
    { metric: 'total_linked', value: totalLinked, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: linkRate.toFixed(1) + '%', threshold: '>= 70%', status: linkRate >= 70 ? 'PASS' : 'WARN' },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: totalLinked,
    records_new: totalLinked,
    records_updated: 0,
    records_meta: {
      duration_ms: durationMs,
      unlinked_start: totalUnlinked,
      matches_tier_1_trade: tier1,
      matches_tier_2_legal: tier2,
      matches_tier_3_fuzzy: tier3,
      no_match_count: noMatch,
      audit_table: {
        phase: 5,
        name: 'WSIB Registry Matching',
        verdict: linkRate < 70 ? 'WARN' : 'PASS',
        rows: wsibAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "wsib_registry": ["id", "trade_name_normalized", "legal_name_normalized", "linked_entity_id"], "entities": ["id", "name_normalized", "permit_count"] },
    { "wsib_registry": ["linked_entity_id", "match_confidence", "matched_at"], "entities": ["is_wsib_registered"] }
  );
});
