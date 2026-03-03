#!/usr/bin/env node
/**
 * Enrich builders with WSIB (Workplace Safety & Insurance Board) status.
 *
 * TODO: Implement WSIB API integration or web scraping.
 * Currently a placeholder that reports builders missing WSIB data.
 *
 * Usage: node scripts/enrich-wsib.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function run() {
  console.log('WSIB Enrichment Status Report\n');

  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE wsib_status IS NOT NULL AND wsib_status != 'unknown') as with_wsib,
       COUNT(*) FILTER (WHERE wsib_status IS NULL OR wsib_status = 'unknown') as missing_wsib
     FROM builders`
  );

  console.log(`Builders total:   ${parseInt(stats.total).toLocaleString()}`);
  console.log(`With WSIB:        ${parseInt(stats.with_wsib).toLocaleString()}`);
  console.log(`Missing WSIB:     ${parseInt(stats.missing_wsib).toLocaleString()}`);
  console.log('');
  console.log('NOTE: WSIB API integration not yet implemented.');
  console.log('This pipeline step will be activated when WSIB lookup is available.');

  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
