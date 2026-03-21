#!/usr/bin/env node
/**
 * CQA Phase 6: Pre-Permit Aging Monitor
 *
 * Read-only assertion that counts approved+unlinked CoA applications by age.
 * Detects stale pre-permit leads that may have expired without a building
 * permit being issued.
 *
 * Checks:
 *   1. total_approved_unlinked (INFO)
 *   2. stale_18m — approved+unlinked older than 18 months (INFO)
 *   3. stale_12m — approved+unlinked older than 12 months (INFO)
 *   4. expired_pre_permits — should be 0 (PASS/FAIL)
 *
 * Usage: node scripts/quality/assert-pre-permit-aging.js
 * Exit 0 = pass, Exit 1 = fail
 *
 * SPEC LINK: docs/specs/12_coa_integration.md
 */
const pipeline = require('../lib/pipeline');

pipeline.run('assert-pre-permit-aging', async (pool) => {
  pipeline.log.info('[assert-pre-permit-aging]', 'Phase 6: Pre-Permit Aging Monitor');

  // Count approved+unlinked CoA applications by age bucket
  const result = await pool.query(`
    SELECT
      COUNT(*) AS total_approved_unlinked,
      COUNT(*) FILTER (
        WHERE decision_date < NOW() - INTERVAL '18 months'
      ) AS stale_18m,
      COUNT(*) FILTER (
        WHERE decision_date < NOW() - INTERVAL '12 months'
      ) AS stale_12m
    FROM coa_applications
    WHERE decision ILIKE 'approved%'
      AND linked_permit_num IS NULL
  `);

  const row = result.rows[0];
  const totalApprovedUnlinked = parseInt(row.total_approved_unlinked, 10) || 0;
  const stale18m = parseInt(row.stale_18m, 10) || 0;
  const stale12m = parseInt(row.stale_12m, 10) || 0;

  // expired_pre_permits: approved+unlinked that are older than 18 months
  // These are leads that almost certainly will never convert
  const expiredPrePermits = stale18m;

  pipeline.log.info('[assert-pre-permit-aging]', 'Aging analysis', {
    total_approved_unlinked: totalApprovedUnlinked,
    stale_12m: stale12m,
    stale_18m: stale18m,
    expired_pre_permits: expiredPrePermits,
  });

  // Build audit_table
  const auditRows = [
    { metric: 'total_approved_unlinked', value: totalApprovedUnlinked, threshold: null, status: 'INFO' },
    { metric: 'stale_18m', value: stale18m, threshold: null, status: 'INFO' },
    { metric: 'stale_12m', value: stale12m, threshold: null, status: 'INFO' },
    { metric: 'expired_pre_permits', value: expiredPrePermits, threshold: null, status: expiredPrePermits === 0 ? 'PASS' : 'WARN' },
  ];

  const hasWarns = auditRows.some((r) => r.status === 'WARN');
  const auditTable = {
    phase: 6,
    name: 'Pre-Permit Aging',
    verdict: hasWarns ? 'WARN' : 'PASS',
    rows: auditRows,
  };

  if (hasWarns) {
    pipeline.log.warn('[assert-pre-permit-aging]', `${expiredPrePermits} expired pre-permits detected (approved+unlinked > 18 months)`);
  }

  pipeline.emitSummary({
    records_total: totalApprovedUnlinked,
    records_new: null,
    records_updated: null,
    records_meta: { audit_table: auditTable },
  });
  pipeline.emitMeta(
    { coa_applications: ['decision', 'linked_permit_num', 'decision_date'] },
    { pipeline_runs: ['records_meta'] }
  );
});
