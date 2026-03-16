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

  if (dryRun) {
    pipeline.log.info('[link-wsib]', 'DRY RUN — skipping writes. Tier counts will be 0.');
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
      // Tier 3: Fuzzy name match — LIKE substring (0.60)
      // Capped at 1000 matches to prevent Cartesian bomb timeout.
      // pg_trgm similarity() would be faster but requires CREATE EXTENSION.
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 3: Fuzzy name matching...');
      const result3 = await client.query(`
        WITH matched AS (
          SELECT DISTINCT ON (w.id) w.id AS wsib_id, e.id AS entity_id
          FROM wsib_registry w
          JOIN entities e ON (
            (w.trade_name_normalized IS NOT NULL AND LENGTH(w.trade_name_normalized) >= 5
              AND (e.name_normalized LIKE '%' || w.trade_name_normalized || '%'
                OR w.trade_name_normalized LIKE '%' || e.name_normalized || '%'))
            OR
            (LENGTH(w.legal_name_normalized) >= 5
              AND (e.name_normalized LIKE '%' || w.legal_name_normalized || '%'
                OR w.legal_name_normalized LIKE '%' || e.name_normalized || '%'))
          )
          WHERE w.linked_entity_id IS NULL
            AND LENGTH(e.name_normalized) >= 5
          ORDER BY w.id, e.permit_count DESC
          LIMIT 1000
        )
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
    },
  });
  pipeline.emitMeta(
    { "wsib_registry": ["id", "trade_name_normalized", "legal_name_normalized", "linked_entity_id"], "entities": ["id", "name_normalized", "permit_count"] },
    { "wsib_registry": ["linked_entity_id", "match_confidence", "matched_at"], "entities": ["is_wsib_registered"] }
  );
});
