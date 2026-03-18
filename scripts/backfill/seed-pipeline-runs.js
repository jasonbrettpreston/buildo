#!/usr/bin/env node
/**
 * One-time backfill: seed pipeline_runs with historical timestamps.
 * Extracted from migrations/033_pipeline_runs.sql.
 *
 * Run once after initial migration on a fresh database:
 *   node scripts/backfill/seed-pipeline-runs.js
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING / HAVING COUNT(*) > 0.
 */
const { Pool } = require('pg');

async function run() {
  const pool = new Pool(
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

  const tag = '[seed-pipeline-runs]';

  try {
    // Permits: use the most recent sync_runs entry
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'permits', started_at, completed_at, 'completed', records_total
      FROM sync_runs ORDER BY started_at DESC LIMIT 1
      ON CONFLICT DO NOTHING
    `);
    console.log(`${tag} permits — seeded`);

    // CoA: use MAX(last_seen_at) from coa_applications
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'coa', MAX(last_seen_at), MAX(last_seen_at), 'completed', COUNT(*)::int
      FROM coa_applications
      HAVING COUNT(*) > 0
    `);
    console.log(`${tag} coa — seeded`);

    // Builders: use MAX(created_at) from builders
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'builders', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
      FROM builders
      HAVING COUNT(*) > 0
    `);
    console.log(`${tag} builders — seeded`);

    // Address points
    const apExists = await pool.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'address_points'
    `);
    if (apExists.rows.length > 0) {
      await pool.query(`
        INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
        SELECT 'address_points', NOW(), NOW(), 'completed', COUNT(*)::int
        FROM address_points
        HAVING COUNT(*) > 0
      `);
      console.log(`${tag} address_points — seeded`);
    }

    // Parcels
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'parcels', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
      FROM parcels
      HAVING COUNT(*) > 0
    `);
    console.log(`${tag} parcels — seeded`);

    // Massing (building_footprints)
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'massing', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
      FROM building_footprints
      HAVING COUNT(*) > 0
    `);
    console.log(`${tag} massing — seeded`);

    // Neighbourhoods
    await pool.query(`
      INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, records_total)
      SELECT 'neighbourhoods', MAX(created_at), MAX(created_at), 'completed', COUNT(*)::int
      FROM neighbourhoods
      HAVING COUNT(*) > 0
    `);
    console.log(`${tag} neighbourhoods — seeded`);

    console.log(`${tag} Done — all pipelines seeded.`);
  } catch (err) {
    console.error(`${tag} FAILED:`, err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
