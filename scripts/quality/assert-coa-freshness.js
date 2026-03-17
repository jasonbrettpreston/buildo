#!/usr/bin/env node
/**
 * CQA Step 3: CoA Source Freshness Monitor (Portal Rot Check)
 *
 * Queries coa_applications for the most recent hearing_date to detect
 * if the city's CKAN portal has stopped publishing new data.
 *
 * Read-only — no database writes. Independently testable and triggerable.
 *
 * Metrics:
 *   max_hearing_date: latest hearing date in the dataset
 *   max_days_stale: days between NOW and max_hearing_date
 *
 * Pass Criteria:
 *   max_days_stale < 45 (WARN if >= 45, data may be frozen)
 *
 * Usage: node scripts/quality/assert-coa-freshness.js
 *
 * SPEC LINK: docs/specs/12_coa_integration.md
 */
const pipeline = require('../lib/pipeline');

pipeline.run('assert-coa-freshness', async (pool) => {
  const startTime = Date.now();

  pipeline.log.info('[assert-coa-freshness]', 'Checking CoA source data freshness...');

  // Query the most recent hearing date across all CoA applications
  const result = await pool.query(`
    SELECT
      MAX(hearing_date)::date as max_hearing_date,
      MAX(decision_date)::date as max_decision_date,
      COUNT(*) as total_records
    FROM coa_applications
  `);

  const row = result.rows[0];
  const totalRecords = parseInt(row.total_records) || 0;
  const maxHearingDate = row.max_hearing_date;
  const maxDecisionDate = row.max_decision_date;

  if (totalRecords === 0) {
    pipeline.log.warn('[assert-coa-freshness]', 'No CoA records found — table is empty');
    pipeline.emitSummary({
      records_total: 0, records_new: null, records_updated: null,
      records_meta: {
        audit_table: {
          phase: 3, name: 'Source Freshness', verdict: 'WARN',
          rows: [{ metric: 'total_records', value: 0, threshold: '> 0', status: 'WARN' }],
        },
      },
    });
    pipeline.emitMeta({ coa_applications: ['hearing_date', 'decision_date'] }, {});
    return;
  }

  // Compute staleness from hearing_date (scheduled into the future for active apps)
  const maxHearingMs = maxHearingDate ? new Date(maxHearingDate).getTime() : 0;
  const maxDecisionMs = maxDecisionDate ? new Date(maxDecisionDate).getTime() : 0;
  const newestMs = Math.max(maxHearingMs, maxDecisionMs);
  const maxDaysStale = newestMs > 0
    ? Math.max(0, Math.round((Date.now() - newestMs) / (1000 * 60 * 60 * 24)))
    : null;

  const isStale = maxDaysStale !== null && maxDaysStale >= 45;

  pipeline.log.info('[assert-coa-freshness]', 'Freshness check complete', {
    total_records: totalRecords,
    max_hearing_date: maxHearingDate,
    max_decision_date: maxDecisionDate,
    max_days_stale: maxDaysStale,
    stale: isStale,
  });

  if (isStale) {
    pipeline.log.warn('[assert-coa-freshness]', `Portal rot warning: newest data is ${maxDaysStale} days old. CKAN data may be frozen.`);
  }

  const durationMs = Date.now() - startTime;
  const rows = [
    { metric: 'total_records', value: totalRecords, threshold: null, status: 'INFO' },
    { metric: 'max_hearing_date', value: maxHearingDate || 'none', threshold: null, status: 'INFO' },
    { metric: 'max_decision_date', value: maxDecisionDate || 'none', threshold: null, status: 'INFO' },
    { metric: 'max_days_stale', value: maxDaysStale, threshold: '< 45', status: isStale ? 'WARN' : 'PASS' },
  ];

  pipeline.emitSummary({
    records_total: 0, records_new: null, records_updated: null,
    records_meta: {
      duration_ms: durationMs,
      audit_table: {
        phase: 3,
        name: 'Source Freshness',
        verdict: isStale ? 'WARN' : 'PASS',
        rows,
      },
    },
  });
  pipeline.emitMeta(
    { coa_applications: ['hearing_date', 'decision_date'] },
    {}
  );
});
