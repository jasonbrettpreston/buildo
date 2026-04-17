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
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt } = require('./lib/safe-math');

const LOGIC_VARS_SCHEMA = z.object({
  wsib_fuzzy_match_threshold: z.number().finite().positive().max(1),
}).passthrough();

const ADVISORY_LOCK_ID = 94;

pipeline.run('link-wsib', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const { logicVars } = await loadMarketplaceConfigs(pool, 'link-wsib');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-wsib');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const wsibFuzzyMatchThreshold = logicVars.wsib_fuzzy_match_threshold;

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startTime = Date.now();

  pipeline.log.info('[link-wsib]', `Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const beforeResult = await pool.query(
    `SELECT COUNT(*) as total FROM wsib_registry WHERE linked_entity_id IS NULL`
  );
  const totalUnlinked = safeParsePositiveInt(beforeResult.rows[0].total, 'total');
  pipeline.log.info('[link-wsib]', `Unlinked WSIB entries: ${totalUnlinked.toLocaleString()}`);

  if (totalUnlinked === 0) {
    pipeline.log.info('[link-wsib]', 'Nothing to link.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    pipeline.emitMeta(
      { "wsib_registry": ["id", "trade_name_normalized", "legal_name_normalized", "linked_entity_id"], "entities": ["id", "name_normalized", "permit_count"] },
      { "wsib_registry": ["linked_entity_id", "match_confidence", "matched_at"], "entities": ["is_wsib_registered", "primary_phone", "primary_email", "website"] }
    );
    return;
  }

  let tier1 = 0, tier2 = 0, tier3 = 0;

  // Shared contact enrichment: aggregate WSIB data per entity to avoid non-deterministic
  // UPDATE FROM with one-to-many relationships. Uses NULLIF to handle empty strings.
  async function copyContacts(client, confidence) {
    return client.query(`
      UPDATE entities e
      SET primary_phone = COALESCE(NULLIF(TRIM(e.primary_phone), ''), w_agg.primary_phone),
          primary_email = COALESCE(NULLIF(TRIM(e.primary_email), ''), w_agg.primary_email),
          website = COALESCE(NULLIF(TRIM(e.website), ''), w_agg.website)
      FROM (
        SELECT linked_entity_id,
               MAX(primary_phone) FILTER (WHERE primary_phone IS NOT NULL AND TRIM(primary_phone) != '') AS primary_phone,
               MAX(primary_email) FILTER (WHERE primary_email IS NOT NULL AND TRIM(primary_email) != '') AS primary_email,
               MAX(website) FILTER (WHERE website IS NOT NULL AND TRIM(website) != '') AS website
        FROM wsib_registry
        WHERE match_confidence = $1
        GROUP BY linked_entity_id
      ) w_agg
      WHERE w_agg.linked_entity_id = e.id
        AND (
          (NULLIF(TRIM(e.primary_phone), '') IS NULL AND w_agg.primary_phone IS NOT NULL) OR
          (NULLIF(TRIM(e.primary_email), '') IS NULL AND w_agg.primary_email IS NOT NULL) OR
          (NULLIF(TRIM(e.website), '') IS NULL AND w_agg.website IS NOT NULL)
        )
    `, [confidence]);
  }

  // Tier 3 fuzzy match SQL — shared between live and dry-run modes.
  // Split into two CTEs (trade vs legal) so Postgres can use GIN trigram
  // indexes on each column independently. The OR-based version caused a
  // Nested Loop over 107K × 3.6K rows (~394M similarity calls).
  // TIER3_CTES: top-level WITH clause (trade_matches, legal_matches, combined)
  // TIER3_SELECT: final SELECT from combined (used in both dry-run and live paths)
  // Build Tier 3 CTEs with optional exclusion clause for dry-run mode.
  // Parameterized to avoid fragile string replacement.
  function buildTier3Ctes(extraFilter = '') {
    return `
    trade_matches AS (
      SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count,
             similarity(w.trade_name_normalized, e.name_normalized) AS score
      FROM wsib_registry w
      JOIN entities e ON w.trade_name_normalized % e.name_normalized
        AND LEFT(REGEXP_REPLACE(w.trade_name_normalized, '^(THE|A|AN) ', ''), 1)
          = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
      WHERE w.linked_entity_id IS NULL
        AND w.trade_name_normalized IS NOT NULL
        AND LENGTH(w.trade_name_normalized) >= 5
        AND LENGTH(e.name_normalized) >= 5
        AND similarity(w.trade_name_normalized, e.name_normalized) > ${wsibFuzzyMatchThreshold}
        ${extraFilter}
    ),
    legal_matches AS (
      SELECT w.id AS wsib_id, e.id AS entity_id, e.permit_count,
             similarity(w.legal_name_normalized, e.name_normalized) AS score
      FROM wsib_registry w
      JOIN entities e ON w.legal_name_normalized % e.name_normalized
        AND LEFT(REGEXP_REPLACE(w.legal_name_normalized, '^(THE|A|AN) ', ''), 1)
          = LEFT(REGEXP_REPLACE(e.name_normalized, '^(THE|A|AN) ', ''), 1)
      WHERE w.linked_entity_id IS NULL
        AND LENGTH(w.legal_name_normalized) >= 5
        AND LENGTH(e.name_normalized) >= 5
        AND similarity(w.legal_name_normalized, e.name_normalized) > ${wsibFuzzyMatchThreshold}
        ${extraFilter}
    ),
    combined AS (
      SELECT * FROM trade_matches
      UNION ALL
      SELECT * FROM legal_matches
    )`;
  }
  // Sort by similarity score first (not permit_count) to avoid cross-linking unrelated businesses.
  // LIMIT 1000 enforces the safety cap documented in the header.
  const TIER3_SELECT = `
    SELECT DISTINCT ON (wsib_id) wsib_id, entity_id
    FROM combined
    ORDER BY wsib_id, score DESC, permit_count DESC
    LIMIT 1000`;

  if (dryRun) {
    // Dry-run simulation: read-only queries using same matching logic.
    // Collect matched IDs so Tier 3 can exclude them (prevents double-counting).
    pipeline.log.info('[link-wsib]', 'DRY RUN — simulating match counts...');

    const dr1 = await pool.query(`
      SELECT DISTINCT w.id
      FROM wsib_registry w
      JOIN entities e ON e.name_normalized = w.trade_name_normalized
      WHERE w.linked_entity_id IS NULL
        AND w.trade_name_normalized IS NOT NULL
        AND LENGTH(w.trade_name_normalized) >= 3
    `);
    const tier1Ids = dr1.rows.map(r => r.id);
    tier1 = tier1Ids.length;
    pipeline.log.info('[link-wsib]', `Tier 1 (simulated): ${tier1.toLocaleString()} matches`);

    const dr2 = await pool.query(`
      SELECT DISTINCT w.id
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
    const tier2Ids = dr2.rows.map(r => r.id);
    tier2 = tier2Ids.length;
    pipeline.log.info('[link-wsib]', `Tier 2 (simulated): ${tier2.toLocaleString()} matches`);

    // Exclude Tier 1/2 matched IDs from Tier 3 to prevent double-counting
    const excludedIds = [...tier1Ids, ...tier2Ids];
    const tier3ExcludeClause = excludedIds.length > 0
      ? `AND w.id != ALL($1)`
      : '';
    const tier3Params = excludedIds.length > 0 ? [excludedIds] : [];
    // Set pg_trgm threshold for dry-run too (default 0.3 would produce different counts)
    await pool.query(`SET pg_trgm.similarity_threshold = ${wsibFuzzyMatchThreshold}`);
    const dr3 = await pool.query(
      `WITH ${buildTier3Ctes(tier3ExcludeClause)} SELECT COUNT(*) as cnt FROM (${TIER3_SELECT}) sub`,
      tier3Params
    );
    await pool.query('RESET pg_trgm.similarity_threshold');
    tier3 = safeParsePositiveInt(dr3.rows[0].cnt, 'cnt');
    pipeline.log.info('[link-wsib]', `Tier 3 (simulated): ${tier3.toLocaleString()} matches`);
  } else {
    await pipeline.withTransaction(pool, async (client) => {
      // ------------------------------------------------------------------
      // Tier 1: Exact trade name match (0.95)
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 1: Exact trade name matching...');
      const result1 = await client.query(
        `WITH matched AS (
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
            matched_at = $1::timestamptz
        FROM matched m
        WHERE w.id = m.wsib_id`,
        [RUN_AT]
      );
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
        const copy1 = await copyContacts(client, 0.95);
        if (copy1.rowCount > 0) {
          pipeline.log.info('[link-wsib]', `  Tier 1 contact copy: ${copy1.rowCount} entities enriched`);
        }
      }
      pipeline.log.info('[link-wsib]', `Tier 1 linked: ${tier1.toLocaleString()} (confidence 0.95)`);

      // ------------------------------------------------------------------
      // Tier 2: Exact legal name match (0.90)
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 2: Exact legal name matching...');
      const result2 = await client.query(
        `WITH matched AS (
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
            matched_at = $1::timestamptz
        FROM matched m
        WHERE w.id = m.wsib_id`,
        [RUN_AT]
      );
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
        const copy2 = await copyContacts(client, 0.90);
        if (copy2.rowCount > 0) {
          pipeline.log.info('[link-wsib]', `  Tier 2 contact copy: ${copy2.rowCount} entities enriched`);
        }
      }
      pipeline.log.info('[link-wsib]', `Tier 2 linked: ${tier2.toLocaleString()} (confidence 0.90)`);

      // ------------------------------------------------------------------
      // Tier 3: Fuzzy name match — pg_trgm similarity() (0.60)
      // Uses GIN trigram indexes for fast fuzzy matching.
      // Replaces bi-directional LIKE which caused Cartesian bomb.
      // ------------------------------------------------------------------
      pipeline.log.info('[link-wsib]', 'Tier 3: Fuzzy name matching (pg_trgm)...');
      // Set pg_trgm threshold to 0.6 so the GIN index only returns relevant pairs
      // (default 0.3 fetches too many garbage pairs before the WHERE filter)
      await client.query(`SET pg_trgm.similarity_threshold = ${wsibFuzzyMatchThreshold}`);
      const result3 = await client.query(
        `WITH ${buildTier3Ctes()},
        matched AS (${TIER3_SELECT})
        UPDATE wsib_registry w
        SET linked_entity_id = m.entity_id,
            match_confidence = 0.60,
            matched_at = $1::timestamptz
        FROM matched m
        WHERE w.id = m.wsib_id`,
        [RUN_AT]
      );
      tier3 = result3.rowCount || 0;

      await client.query('RESET pg_trgm.similarity_threshold');

      if (tier3 > 0) {
        await client.query(`
          UPDATE entities e
          SET is_wsib_registered = true
          FROM wsib_registry w
          WHERE w.linked_entity_id = e.id
            AND w.match_confidence = 0.60
            AND e.is_wsib_registered = false
        `);
        const copy3 = await copyContacts(client, 0.60);
        if (copy3.rowCount > 0) {
          pipeline.log.info('[link-wsib]', `  Tier 3 contact copy: ${copy3.rowCount} entities enriched`);
        }
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
  // Cumulative link rate from the stats query above — run-specific rate is misleading
  // because most WSIB entries (121K) have no matching entity in our 3.7K builder pool.
  const cumulativeTotal = safeParsePositiveInt(s.total, 'total');
  const cumulativeLinked = safeParsePositiveInt(s.linked, 'linked');
  const linkRate = cumulativeTotal > 0 ? (cumulativeLinked / cumulativeTotal) * 100 : 0;
  const wsibAuditRows = [
    { metric: 'unlinked_start', value: totalUnlinked, threshold: null, status: 'INFO' },
    { metric: 'tier_1_trade_matches', value: tier1, threshold: null, status: 'INFO' },
    { metric: 'tier_2_legal_matches', value: tier2, threshold: null, status: 'INFO' },
    { metric: 'tier_3_fuzzy_matches', value: tier3, threshold: null, status: 'INFO' },
    { metric: 'run_matched', value: totalLinked, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: linkRate.toFixed(1) + '%', threshold: '>= 5%', status: linkRate >= 5 ? 'PASS' : 'WARN' },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: totalLinked,
    records_new: 0,
    records_updated: totalLinked,
    records_meta: {
      duration_ms: durationMs,
      unlinked_start: totalUnlinked,
      matches_tier_1_trade: tier1,
      matches_tier_2_legal: tier2,
      matches_tier_3_fuzzy: tier3,
      no_match_count: noMatch,
      audit_table: {
        phase: (process.env.PIPELINE_CHAIN === 'sources') ? 12 : 5,
        name: 'WSIB Registry Matching',
        verdict: linkRate < 5 ? 'WARN' : 'PASS',
        rows: wsibAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "wsib_registry": ["id", "trade_name_normalized", "legal_name_normalized", "linked_entity_id"], "entities": ["id", "name_normalized", "permit_count"] },
    { "wsib_registry": ["linked_entity_id", "match_confidence", "matched_at"], "entities": ["is_wsib_registered", "primary_phone", "primary_email", "website"] }
  );
  });
  if (!lockResult.acquired) return;
});
