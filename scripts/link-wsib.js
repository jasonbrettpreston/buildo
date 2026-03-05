#!/usr/bin/env node
/**
 * Link WSIB registry entries to builders using name matching.
 *
 * 3-tier bulk SQL cascade:
 *   1. Exact trade name match  → 0.95 confidence
 *   2. Exact legal name match  → 0.90 confidence
 *   3. Fuzzy name match (LIKE) → 0.60 confidence
 *
 * On match: updates entities.is_wsib_registered and wsib_registry.linked_entity_id.
 *
 * Usage: node scripts/link-wsib.js [--dry-run]
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const SLUG = 'link_wsib';
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('=== WSIB Registry Linker ===\n');
  if (dryRun) console.log('DRY RUN — no database writes\n');

  const client = await pool.connect();
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
      console.warn('Could not insert pipeline_runs row:', err.message);
    }
  }

  try {
    const beforeResult = await client.query(
      `SELECT COUNT(*) as total FROM wsib_registry WHERE linked_entity_id IS NULL`
    );
    const totalUnlinked = parseInt(beforeResult.rows[0].total, 10);
    console.log(`Unlinked WSIB entries: ${totalUnlinked.toLocaleString()}\n`);

    if (totalUnlinked === 0) {
      console.log('Nothing to link.');
      return;
    }

    let tier1 = 0, tier2 = 0, tier3 = 0;

    // ------------------------------------------------------------------
    // Tier 1: Exact trade name match (0.95)
    // ------------------------------------------------------------------
    console.log('Tier 1: Exact trade name matching...');
    if (!dryRun) {
      const result = await client.query(`
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
      tier1 = result.rowCount || 0;

      // Update entities is_wsib_registered flag for tier 1 matches
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
    }
    console.log(`  Linked: ${tier1.toLocaleString()} (confidence 0.95)`);

    // ------------------------------------------------------------------
    // Tier 2: Exact legal name match (0.90)
    // ------------------------------------------------------------------
    console.log('Tier 2: Exact legal name matching...');
    if (!dryRun) {
      const result = await client.query(`
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
      tier2 = result.rowCount || 0;

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
    }
    console.log(`  Linked: ${tier2.toLocaleString()} (confidence 0.90)`);

    // ------------------------------------------------------------------
    // Tier 3: Fuzzy name match — trade or legal name contains builder name (0.60)
    // Only match names >= 5 chars to avoid false positives
    // ------------------------------------------------------------------
    console.log('Tier 3: Fuzzy name matching...');
    if (!dryRun) {
      const result = await client.query(`
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
        )
        UPDATE wsib_registry w
        SET linked_entity_id = m.entity_id,
            match_confidence = 0.60,
            matched_at = NOW()
        FROM matched m
        WHERE w.id = m.wsib_id
      `);
      tier3 = result.rowCount || 0;

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
    }
    console.log(`  Linked: ${tier3.toLocaleString()} (confidence 0.60)`);

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    const durationMs = Date.now() - startMs;
    const totalLinked = tier1 + tier2 + tier3;
    const noMatch = totalUnlinked - totalLinked;

    console.log('');
    console.log('=== Results ===');
    console.log(`  Exact trade name:     ${tier1.toLocaleString()} (0.95 confidence)`);
    console.log(`  Exact legal name:     ${tier2.toLocaleString()} (0.90 confidence)`);
    console.log(`  Fuzzy name:           ${tier3.toLocaleString()} (0.60 confidence)`);
    console.log(`  No match:             ${noMatch.toLocaleString()}`);
    console.log(`  Total linked:         ${totalLinked.toLocaleString()}/${totalUnlinked.toLocaleString()} (${((totalLinked / totalUnlinked) * 100).toFixed(1)}%)`);
    console.log(`  Duration:             ${(durationMs / 1000).toFixed(1)}s`);

    if (dryRun) {
      console.log('\nDRY RUN complete — no changes written.');
    }

    // Final stats
    const stats = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL) AS linked,
        COUNT(*) FILTER (WHERE match_confidence >= 0.90) AS high_conf,
        COUNT(*) FILTER (WHERE match_confidence >= 0.50 AND match_confidence < 0.90) AS med_conf
      FROM wsib_registry
    `);
    const s = stats.rows[0];
    console.log(`\nDB Stats: ${s.total} total | ${s.linked} linked (${s.high_conf} high, ${s.med_conf} med)`);

    if (runId) {
      await pool.query(
        `UPDATE pipeline_runs
         SET completed_at = NOW(), status = 'completed', duration_ms = $1,
             records_total = $2, records_new = $3
         WHERE id = $4`,
        [durationMs, totalLinked, totalLinked, runId]
      ).catch(() => {});
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\nFatal error:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
