#!/usr/bin/env node
/**
 * Identify and report pre-permit leads from approved CoA applications.
 *
 * Pre-permit leads are Committee of Adjustment applications that:
 * - Were approved (decision = 'Approved' or 'Approved with Conditions')
 * - Have NOT yet been linked to a building permit
 * - Were decided within the last 90 days
 *
 * These represent upcoming construction activity where a building permit
 * is likely to follow the CoA approval.
 *
 * Usage: node scripts/create-pre-permits.js
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
  console.log('Identifying pre-permit leads from CoA applications...\n');

  // Count current pre-permit leads
  const { rows: [counts] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE decision IN ('Approved', 'Approved with Conditions')
           AND linked_permit_num IS NULL
           AND decision_date >= NOW() - INTERVAL '90 days'
       ) as upcoming,
       COUNT(*) FILTER (
         WHERE decision IN ('Approved', 'Approved with Conditions')
           AND linked_permit_num IS NOT NULL
       ) as already_linked,
       COUNT(*) FILTER (
         WHERE decision IN ('Approved', 'Approved with Conditions')
       ) as total_approved,
       COUNT(*) as total
     FROM coa_applications`
  );

  const upcoming = parseInt(counts.upcoming);
  const linked = parseInt(counts.already_linked);
  const approved = parseInt(counts.total_approved);
  const total = parseInt(counts.total);

  console.log(`CoA Applications:  ${total.toLocaleString()} total`);
  console.log(`Approved:          ${approved.toLocaleString()}`);
  console.log(`Already linked:    ${linked.toLocaleString()}`);
  console.log(`Pre-permit leads:  ${upcoming.toLocaleString()} (approved, unlinked, last 90d)`);

  // Breakdown by ward
  const { rows: byWard } = await pool.query(
    `SELECT ward, COUNT(*) as count
     FROM coa_applications
     WHERE decision IN ('Approved', 'Approved with Conditions')
       AND linked_permit_num IS NULL
       AND decision_date >= NOW() - INTERVAL '90 days'
     GROUP BY ward
     ORDER BY count DESC
     LIMIT 10`
  );

  if (byWard.length > 0) {
    console.log('\nTop wards with pre-permit leads:');
    for (const row of byWard) {
      console.log(`  Ward ${row.ward}: ${parseInt(row.count).toLocaleString()}`);
    }
  }

  console.log('\nDone.');
  console.log('PIPELINE_SUMMARY:' + JSON.stringify({ records_total: total, records_new: upcoming, records_updated: 0 }));
  console.log('PIPELINE_META:' + JSON.stringify({ reads: { "coa_applications": ["decision", "linked_permit_num", "decision_date", "ward"] }, writes: {} }));
  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
