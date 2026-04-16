#!/usr/bin/env node
/**
 * One-time backfill: migrate builders → entities + backfill entity_projects.
 * Extracted from migrations/043_entities_data_migration.sql.
 *
 * Run once after initial migration on a fresh database:
 *   node scripts/backfill/migrate-entities.js
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE.
 *
 * WF3-S1: wrapped all 4 INSERTs in pipeline.withTransaction so partial
 * failure (e.g. step 3 throws) rolls back steps 1–N-1, preventing orphaned
 * entity rows without entity_projects join rows.
 */
const { Pool } = require('pg');
const pipeline = require('../lib/pipeline');

/**
 * @param {{ pool?: import('pg').Pool, _pipeline?: typeof pipeline }} [opts]
 *   Optional overrides for testing. When omitted, creates a real Pool and
 *   uses the production pipeline SDK.
 */
async function run(opts) {
  const pool = opts && opts.pool ? opts.pool : new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432', 10),
          database: process.env.PG_DATABASE || 'buildo',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
        }
  );
  const pl = (opts && opts._pipeline) ? opts._pipeline : pipeline;

  const tag = '[migrate-entities]';

  try {
    await pl.withTransaction(pool, async (client) => {
      // Step 1: Migrate existing builders → entities
      const step1 = await client.query(`
        INSERT INTO entities (legal_name, trade_name, name_normalized, primary_phone, primary_email, website,
                              google_place_id, google_rating, google_review_count,
                              permit_count, first_seen_at, last_seen_at, last_enriched_at)
        SELECT name, NULL, name_normalized, phone, email, website,
               google_place_id, google_rating, google_review_count,
               permit_count, first_seen_at, last_seen_at, enriched_at
        FROM builders
        ON CONFLICT (name_normalized) DO NOTHING
      `);
      console.log(`${tag} Step 1 — builders → entities: ${step1.rowCount} rows inserted`);

      // Step 2: Backfill entity_projects from permits (Builder role)
      const step2 = await client.query(`
        INSERT INTO entity_projects (entity_id, permit_num, revision_num, role)
        SELECT DISTINCT e.id, p.permit_num, p.revision_num, 'Builder'::project_role_enum
        FROM permits p
        JOIN entities e ON e.name_normalized = UPPER(REGEXP_REPLACE(TRIM(p.builder_name), '\\s+', ' ', 'g'))
        WHERE p.builder_name IS NOT NULL AND TRIM(p.builder_name) != ''
        ON CONFLICT DO NOTHING
      `);
      console.log(`${tag} Step 2 — entity_projects (Builder): ${step2.rowCount} rows inserted`);

      // Step 3: Upsert CoA applicants into entities
      const step3 = await client.query(`
        INSERT INTO entities (legal_name, name_normalized, first_seen_at, last_seen_at)
        SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(TRIM(applicant), '\\s+', ' ', 'g')))
               applicant,
               UPPER(REGEXP_REPLACE(TRIM(applicant), '\\s+', ' ', 'g')),
               MIN(first_seen_at) OVER (PARTITION BY UPPER(REGEXP_REPLACE(TRIM(applicant), '\\s+', ' ', 'g'))),
               MAX(last_seen_at) OVER (PARTITION BY UPPER(REGEXP_REPLACE(TRIM(applicant), '\\s+', ' ', 'g')))
        FROM coa_applications
        WHERE applicant IS NOT NULL AND TRIM(applicant) != ''
        ON CONFLICT (name_normalized) DO UPDATE SET last_seen_at = GREATEST(entities.last_seen_at, EXCLUDED.last_seen_at)
      `);
      console.log(`${tag} Step 3 — CoA applicants → entities: ${step3.rowCount} rows upserted`);

      // Step 4: Backfill entity_projects from CoA applications (Applicant role)
      const step4 = await client.query(`
        INSERT INTO entity_projects (entity_id, coa_file_num, role)
        SELECT DISTINCT e.id, c.application_number, 'Applicant'::project_role_enum
        FROM coa_applications c
        JOIN entities e ON e.name_normalized = UPPER(REGEXP_REPLACE(TRIM(c.applicant), '\\s+', ' ', 'g'))
        WHERE c.applicant IS NOT NULL AND TRIM(c.applicant) != ''
        ON CONFLICT DO NOTHING
      `);
      console.log(`${tag} Step 4 — entity_projects (Applicant): ${step4.rowCount} rows inserted`);
    });

    console.log(`${tag} Done — entity migration complete.`);
  } catch (err) {
    console.error(`${tag} FAILED:`, err.message);
    process.exitCode = 1;
  } finally {
    // Only end the pool if we created it (not injected by caller)
    if (!opts || !opts.pool) await pool.end();
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
