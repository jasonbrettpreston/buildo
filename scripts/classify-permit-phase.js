#!/usr/bin/env node
/**
 * Classify pre-issuance permits as "Examination" phase.
 *
 * The CKAN feed labels ~13,764 permits as status = 'Inspection' even though
 * they have no issued_date — they're actually in the city's examination
 * pipeline (zoning review, code review) awaiting issuance. These permits
 * have already passed initial screening and don't require a COA variance.
 *
 * This step reclassifies them so the scraper and dashboard correctly
 * distinguish pre-issuance (Examination) from post-issuance (Inspection).
 *
 * The permits loader upsert will restore the CKAN status if the permit
 * reappears with a different status (e.g., when it's finally issued and
 * moves to real Inspection).
 *
 * Usage: node scripts/classify-permit-phase.js
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('classify-permit-phase', async (pool) => {
  const startTime = Date.now();

  // Reclassify: permits with status = 'Inspection' but no issued_date
  // are in the city examination phase, not active construction inspection.
  const examResult = await pipeline.withTransaction(pool, async (client) => {
    return client.query(
      `UPDATE permits
       SET status = 'Examination'
       WHERE status = 'Inspection'
         AND issued_date IS NULL
       RETURNING permit_num`
    );
  });
  const examCount = examResult.rowCount || 0;
  pipeline.log.info('[classify-phase]', `Examination: ${examCount.toLocaleString()} permits reclassified`);

  // Cumulative counts
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'Examination') AS total_examination,
       COUNT(*) FILTER (WHERE status = 'Inspection') AS total_inspection,
       COUNT(*) FILTER (WHERE status = 'Permit Issued') AS total_issued,
       COUNT(*) AS total
     FROM permits`
  );
  const totalExamination = parseInt(statsResult.rows[0].total_examination, 10);
  const totalInspection = parseInt(statsResult.rows[0].total_inspection, 10);
  const totalPermits = parseInt(statsResult.rows[0].total, 10);
  const examRate = totalPermits > 0 ? (totalExamination / totalPermits * 100) : 0;

  // VACUUM if we touched many rows
  if (examCount > 100) {
    await pool.query('VACUUM ANALYZE permits');
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[classify-phase]', 'Complete', {
    examination_classified: examCount,
    total_examination: totalExamination,
    total_inspection: totalInspection,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  const auditRows = [
    { metric: 'examination_classified', value: examCount, threshold: null, status: 'INFO' },
    { metric: 'total_examination', value: totalExamination, threshold: null, status: 'INFO' },
    { metric: 'total_inspection', value: totalInspection, threshold: null, status: 'INFO' },
    { metric: 'examination_rate', value: examRate.toFixed(1) + '%', threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: examCount,
    records_new: 0,
    records_updated: examCount,
    records_meta: {
      duration_ms: durationMs,
      examination_classified: examCount,
      total_examination: totalExamination,
      total_inspection: totalInspection,
      audit_table: {
        phase: 4,
        name: 'Permit Phase Classification',
        verdict: 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["status", "issued_date"] },
    { "permits": ["status"] }
  );
});
