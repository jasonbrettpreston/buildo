#!/usr/bin/env node
/**
 * Generate Pre-Permit lead forecasts from approved CoA applications.
 *
 * Pre-permit leads are Committee of Adjustment applications that:
 * - Were approved (decision = 'Approved' or 'Approved with Conditions')
 * - Have NOT yet been linked to a building permit
 * - Were decided within the last 90 days
 *
 * This script:
 *   1. INSERTs Pre-Permit placeholder rows into the permits table (PRE- prefix)
 *   2. Expires aging Pre-Permits older than 18 months (Forecasted → Expired/Abandoned)
 *   3. Reports eligible lead counts by ward
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with pre_permits_generated, aging_leads_expired
 *   - ON CONFLICT DO NOTHING for idempotent re-runs (§9.3)
 *
 * Usage: node scripts/create-pre-permits.js
 *
 * SPEC LINK: docs/specs/12_coa_integration.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('create-pre-permits', async (pool) => {
  const startTime = Date.now();

  pipeline.log.info('[create-pre-permits]', 'Generating pre-permit leads from CoA applications...');

  // Count current state
  const { rows: [counts] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
           AND linked_permit_num IS NULL
           AND decision_date >= NOW() - INTERVAL '90 days'
       ) as upcoming,
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
           AND linked_permit_num IS NOT NULL
       ) as already_linked,
       COUNT(*) FILTER (
         WHERE decision ILIKE 'approved%'
       ) as total_approved,
       COUNT(*) as total
     FROM coa_applications`
  );

  const upcoming = parseInt(counts.upcoming);
  const linked = parseInt(counts.already_linked);
  const approved = parseInt(counts.total_approved);
  const total = parseInt(counts.total);

  pipeline.log.info('[create-pre-permits]', `CoA: ${total.toLocaleString()} total, ${approved.toLocaleString()} approved, ${linked.toLocaleString()} linked, ${upcoming.toLocaleString()} eligible leads`);

  // Step 1: Generate Pre-Permit placeholder rows
  const inserted = await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(`
      INSERT INTO permits (
        permit_num, revision_num, permit_type, status,
        description, ward, street_num, street_name, application_date
      )
      SELECT
        'PRE-' || application_number,
        '00',
        'Pre-Permit',
        'Forecasted',
        description, ward, street_num, street_name, decision_date
      FROM coa_applications
      WHERE decision ILIKE 'approved%'
        AND linked_permit_num IS NULL
        AND decision_date >= NOW() - INTERVAL '90 days'
      ON CONFLICT (permit_num, revision_num) DO NOTHING
    `);
    return result.rowCount || 0;
  });

  pipeline.log.info('[create-pre-permits]', `Generated ${inserted.toLocaleString()} new Pre-Permit leads`);

  // Step 2: Expire aging Pre-Permits (>18 months without a real permit)
  const expired = await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(`
      UPDATE permits
      SET status = 'Expired/Abandoned',
          last_seen_at = NOW()
      WHERE permit_type = 'Pre-Permit'
        AND status = 'Forecasted'
        AND application_date < NOW() - INTERVAL '18 months'
    `);
    return result.rowCount || 0;
  });

  if (expired > 0) {
    pipeline.log.info('[create-pre-permits]', `Expired ${expired.toLocaleString()} aging Pre-Permits (>18 months)`);
  }

  // Ward breakdown for leads
  const { rows: byWard } = await pool.query(
    `SELECT ward, COUNT(*) as count
     FROM coa_applications
     WHERE decision ILIKE 'approved%'
       AND linked_permit_num IS NULL
       AND decision_date >= NOW() - INTERVAL '90 days'
     GROUP BY ward
     ORDER BY count DESC
     LIMIT 10`
  );

  if (byWard.length > 0) {
    pipeline.log.info('[create-pre-permits]', 'Top wards', {
      wards: Object.fromEntries(byWard.map(r => [r.ward, parseInt(r.count)])),
    });
  }

  const durationMs = Date.now() - startTime;
  const eligibleRemaining = approved - linked;

  // Audit table
  const auditRows = [
    { metric: 'pre_permits_generated', value: inserted, threshold: null, status: 'PASS' },
    { metric: 'aging_leads_expired', value: expired, threshold: null, status: 'PASS' },
    { metric: 'eligible_coa_remaining', value: eligibleRemaining, threshold: null, status: 'INFO' },
  ];
  const chainId = process.env.PIPELINE_CHAIN || null;
  const auditTable = {
    phase: chainId === 'coa' ? 5 : 13,
    name: 'Pre-Permit Lead Generation',
    verdict: 'PASS',
    rows: auditRows,
  };

  pipeline.log.info('[create-pre-permits]', 'Done', {
    generated: inserted, expired, eligible_remaining: eligibleRemaining,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  pipeline.emitSummary({
    records_total: inserted + expired,
    records_new: inserted,
    records_updated: expired,
    records_meta: {
      duration_ms: durationMs,
      pre_permits_generated: inserted,
      aging_leads_expired: expired,
      eligible_coa_remaining: eligibleRemaining,
      audit_table: auditTable,
    },
  });
  pipeline.emitMeta(
    { "coa_applications": ["application_number", "decision", "linked_permit_num", "decision_date", "ward", "street_num", "street_name", "description"] },
    { "permits": ["permit_num", "revision_num", "permit_type", "status", "description", "ward", "street_num", "street_name", "application_date", "last_seen_at"] }
  );
});
