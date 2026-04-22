#!/usr/bin/env node
/**
 * Classify pre-issuance permits as "Examination" phase.
 *
 * The CKAN feed labels ~13,764 permits as status = 'Inspection' even though
 * they have no issued_date — they're actually in the city's examination
 * pipeline (zoning review, code review) awaiting issuance. These permits
 * have already passed initial screening and don't require a COA variance.
 *
 * This step writes to enriched_status (not raw status) so the permits loader
 * upsert won't conflict — raw CKAN status is preserved, and enriched_status
 * reflects our derived classification.
 *
 * Scoped to revision_num = '00' because sub-revisions (01, 02, etc.) inherit
 * lifecycle state from the base permit and should not be independently classified.
 *
 * Usage: node scripts/classify-permit-phase.js
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');

const ADVISORY_LOCK_ID = 89;

pipeline.run('classify-permit-phase', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const startTime = Date.now();

  // Count the eligible pool BEFORE updating (for records_total).
  // This is the full pool including already-classified rows — records_updated
  // will be lower due to the IS DISTINCT FROM guard in the UPDATE.
  // Scoped to revision_num = '00' to avoid cross-revision inflation.
  // Catches epoch default dates (1970-01-01) from bad municipal ETL in addition to NULL.
  const eligibleResult = await pool.query(
    `SELECT COUNT(*) AS cnt FROM permits
     WHERE status = 'Inspection'
       AND revision_num = '00'
       AND (issued_date IS NULL OR issued_date < '1970-01-02')`
  );
  const eligibleCount = safeParsePositiveInt(eligibleResult.rows[0].cnt, 'cnt');

  // Reclassify: permits with status = 'Inspection' but no issued_date
  // are in the city examination phase, not active construction inspection.
  const { examCount } = await pipeline.withTransaction(pool, async (client) => {
    const examResult = await client.query(
      `UPDATE permits
       SET enriched_status = 'Examination',
           last_seen_at = $1::timestamptz
       WHERE status = 'Inspection'
         AND revision_num = '00'
         AND (issued_date IS NULL OR issued_date < '1970-01-02')
         AND enriched_status IS DISTINCT FROM 'Examination'
       RETURNING permit_num`,
      [RUN_AT]
    );
    return { examCount: examResult.rows.length };
  });
  pipeline.log.info('[classify-phase]', `Examination: ${examCount.toLocaleString()} permits reclassified`);

  // Cumulative counts — denominator scoped to status = 'Inspection' AND revision_num = '00'
  // to match the UPDATE scope and avoid denominator dilution from sub-revisions or all-time permits
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE enriched_status = 'Examination') AS total_examination,
       COUNT(*) AS total_inspection
     FROM permits
     WHERE status = 'Inspection'
       AND revision_num = '00'`
  );
  const totalExamination = safeParsePositiveInt(statsResult.rows[0].total_examination, 'total_examination');
  const totalInspection = safeParsePositiveInt(statsResult.rows[0].total_inspection, 'total_inspection');
  const examRate = totalInspection > 0 ? (totalExamination / totalInspection * 100) : 0;

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
    records_total: eligibleCount,
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
    { "permits": ["status", "revision_num", "issued_date", "enriched_status", "last_seen_at"] },
    { "permits": ["enriched_status", "last_seen_at"] }
  );
  });
  if (!lockResult.acquired) return;
});
