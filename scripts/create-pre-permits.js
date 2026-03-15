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
const pipeline = require('./lib/pipeline');

pipeline.run('create-pre-permits', async (pool) => {
  pipeline.log.info('[create-pre-permits]', 'Identifying pre-permit leads from CoA applications...');

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

  pipeline.log.info('[create-pre-permits]', `CoA Applications: ${total.toLocaleString()} total`);
  pipeline.log.info('[create-pre-permits]', `Approved: ${approved.toLocaleString()}`);
  pipeline.log.info('[create-pre-permits]', `Already linked: ${linked.toLocaleString()}`);
  pipeline.log.info('[create-pre-permits]', `Pre-permit leads: ${upcoming.toLocaleString()} (approved, unlinked, last 90d)`);

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
    pipeline.log.info('[create-pre-permits]', 'Top wards with pre-permit leads:');
    for (const row of byWard) {
      pipeline.log.info('[create-pre-permits]', `  Ward ${row.ward}: ${parseInt(row.count).toLocaleString()}`);
    }
  }

  // Build audit_table
  const eligibleCoaRecords = approved - linked;
  const auditRows = [
    { metric: 'eligible_coa_records', value: eligibleCoaRecords, threshold: null, status: 'INFO' },
    { metric: 'pre_permits_created', value: upcoming, threshold: null, status: 'INFO' },
  ];
  const auditTable = {
    phase: 5,
    name: 'Pre-Permit Leads',
    verdict: 'PASS',
    rows: auditRows,
  };

  pipeline.log.info('[create-pre-permits]', 'Done.');
  pipeline.emitSummary({
    records_total: upcoming,
    records_new: null,
    records_updated: null,
    records_meta: { audit_table: auditTable },
  });
  pipeline.emitMeta(
    { "coa_applications": ["decision", "linked_permit_num", "decision_date", "ward"] },
    {}
  );
});
