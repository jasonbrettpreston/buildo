#!/usr/bin/env node
// 🔗 SPEC LINK: docs/specs/product/future/71_lead_timing_engine.md §Implementation
//
// Nightly job that populates timing_calibration with per-permit_type percentile
// statistics of (issued_date → first inspection). Read by the request-path
// src/features/leads/lib/timing.ts Tier 2 logic. This script does NOT share
// logic with timing.ts — it only writes the cache the library reads.
//
// - Single aggregate query; no streaming (50-200 distinct permit_types max).
// - UPSERT batch wrapped in one pipeline.withTransaction for atomicity.
// - HAVING COUNT >= 5 filters tiny samples that would mislead Tier 2.
// - BETWEEN 0 AND 730 day outlier filter excludes stale/weird data.

const pipeline = require('./lib/pipeline');

// permit_inspections has no revision_num column. Joining permits → inspections
// on permit_num alone would associate every revision of the same permit with
// the same first_inspection_date — biasing the percentiles. Collapse permits
// to one row per permit_num (using the EARLIEST issued_date for that permit)
// BEFORE the join, so each permit_num contributes exactly one delta to the
// percentile calculation.
const CALIBRATION_SQL = `
  WITH permit_root AS (
    SELECT DISTINCT ON (permit_num)
      permit_num,
      permit_type,
      issued_date
    FROM permits
    WHERE issued_date IS NOT NULL
      AND permit_type IS NOT NULL
    ORDER BY permit_num, issued_date ASC
  ),
  first_inspection AS (
    SELECT
      pr.permit_type,
      pr.permit_num,
      pr.issued_date,
      MIN(pi.inspection_date) AS first_inspection_date
    FROM permit_root pr
    JOIN permit_inspections pi ON pi.permit_num = pr.permit_num
    WHERE pi.inspection_date IS NOT NULL
      AND pi.inspection_date >= pr.issued_date
    GROUP BY pr.permit_type, pr.permit_num, pr.issued_date
  ),
  deltas AS (
    SELECT
      permit_type,
      (first_inspection_date - issued_date) AS days_to_first
    FROM first_inspection
    WHERE first_inspection_date - issued_date BETWEEN 0 AND 730
  )
  SELECT
    permit_type,
    COUNT(*)::int AS sample_size,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_to_first))::int AS p25,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days_to_first))::int AS median,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_first))::int AS p75
  FROM deltas
  GROUP BY permit_type
  HAVING COUNT(*) >= 5
`;

const ADVISORY_LOCK_ID = 71;

pipeline.run('compute-timing-calibration', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');
  let rows;
  try {
    const res = await pool.query(CALIBRATION_SQL);
    rows = res.rows;
  } catch (err) {
    // If permit_inspections table doesn't exist yet (fresh deploy before
    // deep_scrapes chain has run), degrade gracefully instead of crashing
    // the entire permits chain.
    const isUndefinedTable = err && err.code === '42P01';
    if (isUndefinedTable) {
      pipeline.log.warn('[compute-timing-calibration]', 'permit_inspections table not found — skipping calibration (run deep_scrapes chain first)', {
        err: err.message,
      });
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'permit_inspections_missing',
          audit_table: {
            phase: 15,
            name: 'Timing Calibration',
            verdict: 'SKIP',
            rows: [
              { metric: 'permit_types_processed', value: 0, threshold: null, status: 'SKIP' },
              { metric: 'permit_types_inserted', value: 0, threshold: null, status: 'SKIP' },
              { metric: 'permit_types_updated', value: 0, threshold: null, status: 'SKIP' },
              { metric: 'total_sample_size', value: 0, threshold: null, status: 'SKIP' },
            ],
          },
        },
      });
      pipeline.emitMeta(
        { permits: ['*'], permit_inspections: ['*'] },
        { timing_calibration: ['permit_type'] },
      );
      return;
    }
    pipeline.log.error('[compute-timing-calibration]', 'calibration query failed', {
      err: err && err.message,
    });
    throw err;
  }

  if (rows.length === 0) {
    pipeline.log.warn(
      '[compute-timing-calibration]',
      'no permit_types met the HAVING COUNT >= 5 threshold — timing_calibration not updated',
    );
    // Use SKIP (not WARN) to avoid poisoning chain status with
    // `completed_with_warnings` on fresh deploys where permit_inspections
    // hasn't been populated yet. Reviewer-flagged HIGH severity.
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 15,
          name: 'Timing Calibration',
          verdict: 'SKIP',
          rows: [
            { metric: 'permit_types_processed', value: 0, threshold: null, status: 'SKIP' },
            { metric: 'permit_types_inserted', value: 0, threshold: null, status: 'SKIP' },
            { metric: 'permit_types_updated', value: 0, threshold: null, status: 'SKIP' },
            { metric: 'total_sample_size', value: 0, threshold: '>= 50', status: 'SKIP' },
          ],
        },
      },
    });
    pipeline.emitMeta(
      { permits: ['*'], permit_inspections: ['*'] },
      { timing_calibration: ['permit_type'] },
    );
    return;
  }

  let result;
  try {
    result = await pipeline.withTransaction(pool, async (client) => {
      let inserted = 0;
      let updated = 0;
      for (const row of rows) {
        try {
          const upsert = await client.query(
            `INSERT INTO timing_calibration (
               permit_type,
               median_days_to_first_inspection,
               p25_days,
               p75_days,
               sample_size,
               computed_at
             ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
             ON CONFLICT (permit_type) DO UPDATE
               SET median_days_to_first_inspection = EXCLUDED.median_days_to_first_inspection,
                   p25_days                         = EXCLUDED.p25_days,
                   p75_days                         = EXCLUDED.p75_days,
                   sample_size                      = EXCLUDED.sample_size,
                   computed_at                      = EXCLUDED.computed_at
             RETURNING (xmax = 0) AS inserted`,
            [row.permit_type, row.median, row.p25, row.p75, row.sample_size, RUN_AT],
          );
          if (upsert.rows[0] && upsert.rows[0].inserted) inserted++;
          else updated++;
        } catch (err) {
          pipeline.log.error('[compute-timing-calibration]', 'upsert failed', {
            permit_type: row.permit_type,
            err: err && err.message,
          });
        }
      }
      return { inserted, updated };
    });
  } catch (err) {
    // timing_calibration table may not exist on fresh deploy (migration not yet run)
    if (err && err.code === '42P01') {
      pipeline.log.warn('[compute-timing-calibration]', 'timing_calibration table not found — run migration first', {
        err: err.message,
      });
      pipeline.emitSummary({
        records_total: rows.length, records_new: 0, records_updated: 0,
        records_meta: {
          skipped: true,
          reason: 'timing_calibration_missing',
          audit_table: {
            phase: 15,
            name: 'Timing Calibration',
            verdict: 'SKIP',
            rows: [
              { metric: 'permit_types_processed', value: rows.length, threshold: null, status: 'SKIP' },
              { metric: 'permit_types_inserted', value: 0, threshold: null, status: 'SKIP' },
              { metric: 'permit_types_updated', value: 0, threshold: null, status: 'SKIP' },
              { metric: 'total_sample_size', value: 0, threshold: null, status: 'SKIP' },
            ],
          },
        },
      });
      pipeline.emitMeta(
        { permits: ['*'], permit_inspections: ['*'] },
        { timing_calibration: ['permit_type'] },
      );
      return;
    }
    throw err;
  }

  // Build custom audit_table so the admin FreshnessTimeline surfaces
  // meaningful throughput metrics. See compute-cost-estimates.js for the
  // rationale — WF3 2026-04-10 observability gap fix.
  const totalSampleSize = rows.reduce((sum, r) => sum + (parseInt(r.sample_size, 10) || 0), 0);
  const timingAuditRows = [
    { metric: 'permit_types_processed', value: rows.length, threshold: null, status: 'INFO' },
    { metric: 'permit_types_inserted', value: result.inserted, threshold: null, status: 'INFO' },
    { metric: 'permit_types_updated', value: result.updated, threshold: null, status: 'INFO' },
    { metric: 'total_sample_size', value: totalSampleSize, threshold: '>= 50', status: totalSampleSize >= 50 ? 'PASS' : 'WARN' },
  ];
  const timingVerdict = totalSampleSize >= 50 ? 'PASS' : 'WARN';

  pipeline.emitSummary({
    records_total: rows.length,
    records_new: result.inserted,
    records_updated: result.updated,
    records_meta: {
      audit_table: {
        phase: 15,
        name: 'Timing Calibration',
        verdict: timingVerdict,
        rows: timingAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    {
      permits: ['permit_num', 'revision_num', 'permit_type', 'issued_date'],
      permit_inspections: ['permit_num', 'inspection_date'],
    },
    {
      timing_calibration: [
        'permit_type',
        'median_days_to_first_inspection',
        'p25_days',
        'p75_days',
        'sample_size',
        'computed_at',
      ],
    },
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
