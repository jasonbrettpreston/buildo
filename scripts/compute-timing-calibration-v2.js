#!/usr/bin/env node
/**
 * Compute Timing Calibration V2 — phase-to-phase median lead times.
 *
 * Mines sequential passed-inspection stage pairs from permit_inspections,
 * maps them to lifecycle phases, and computes median/p25/p75 lead times
 * per (from_phase, to_phase, permit_type). Also computes "ISSUED → P_X"
 * calibration for permits where we know issued_date + first inspection.
 *
 * Output: rows in `phase_calibration` table, consumed by Phase 4's
 * flight tracker to generate per-permit, per-trade predictions.
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md §Phase 3
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { mapInspectionStageToPhase } = require('./lib/lifecycle-phase');

// Build a SQL CASE expression that mirrors the JS mapInspectionStageToPhase
// function. This lets Postgres do the mapping server-side in a single query
// instead of round-tripping 17K rows to JS.
//
// CRITICAL: this CASE must produce the same output as mapInspectionStageToPhase
// for every stage_name in the DB. The infra test verifies structural parity.
const STAGE_TO_PHASE_SQL = `
  CASE
    WHEN lower(stage_name) LIKE '%excavation%'
      OR lower(stage_name) LIKE '%shoring%'
      OR lower(stage_name) LIKE '%site grading%'
      OR lower(stage_name) LIKE '%demolition%'
    THEN 'P9'
    WHEN lower(stage_name) LIKE '%footings%'
      OR lower(stage_name) LIKE '%foundations%'
      OR lower(stage_name) = 'foundation'
    THEN 'P10'
    WHEN lower(stage_name) LIKE '%structural framing%'
      OR lower(stage_name) LIKE '%framing%'
    THEN 'P11'
    WHEN lower(stage_name) LIKE '%insulation%'
      OR lower(stage_name) LIKE '%vapour%'
    THEN 'P13'
    WHEN lower(stage_name) LIKE '%fire separations%'
    THEN 'P14'
    WHEN lower(stage_name) LIKE '%interior final%'
      OR lower(stage_name) LIKE '%plumbing final%'
      OR lower(stage_name) LIKE '%hvac final%'
    THEN 'P15'
    WHEN lower(stage_name) LIKE '%exterior final%'
    THEN 'P16'
    WHEN lower(stage_name) LIKE '%occupancy%'
      OR lower(stage_name) LIKE '%final inspection%'
    THEN 'P17'
    WHEN lower(stage_name) LIKE '%hvac%'
      OR lower(stage_name) LIKE '%plumbing%'
      OR lower(stage_name) LIKE '%electrical%'
      OR lower(stage_name) LIKE '%fire protection%'
      OR lower(stage_name) LIKE '%fire access%'
      OR lower(stage_name) LIKE '%water service%'
      OR lower(stage_name) LIKE '%water distribution%'
      OR lower(stage_name) LIKE '%drain%'
      OR lower(stage_name) LIKE '%sewers%'
      OR lower(stage_name) LIKE '%fire service%'
    THEN 'P12'
    ELSE NULL
  END
`;

// Same CASE but for the LAG'd previous stage (uses prev_stage alias)
const PREV_STAGE_TO_PHASE_SQL = STAGE_TO_PHASE_SQL.replace(/stage_name/g, 'prev_stage');

// Phase ordinal for filtering backwards transitions (adversarial HIGH-3).
// Rework / data-entry errors can produce P11→P10 pairs that are
// nonsensical for forward prediction. Only forward transitions (higher
// ordinal) should enter the calibration table.
const PHASE_ORDINAL_SQL = `
  CASE
    WHEN phase = 'P9'  THEN 1
    WHEN phase = 'P10' THEN 2
    WHEN phase = 'P11' THEN 3
    WHEN phase = 'P12' THEN 4
    WHEN phase = 'P13' THEN 5
    WHEN phase = 'P14' THEN 6
    WHEN phase = 'P15' THEN 7
    WHEN phase = 'P16' THEN 8
    WHEN phase = 'P17' THEN 9
    ELSE NULL
  END
`;
const FROM_ORDINAL_SQL = PHASE_ORDINAL_SQL.replace(/phase/g, 'from_phase');
const TO_ORDINAL_SQL = PHASE_ORDINAL_SQL.replace(/phase/g, 'to_phase');

pipeline.run('compute-timing-calibration-v2', async (pool) => {
  // ═══════════════════════════════════════════════════════════
  // Step 1: Compute phase-to-phase calibration from inspection pairs
  // ═══════════════════════════════════════════════════════════
  //
  // Uses LAG window function to pair consecutive passed inspections
  // on the same permit, maps both stages to lifecycle phases, and
  // computes percentiles. Single query — Postgres does all the work.
  pipeline.log.info('[calibration-v2]', 'Computing phase-to-phase calibration from inspection pairs...');

  const phasePairsResult = await pool.query(`
    WITH stage_timeline AS (
      SELECT i.permit_num, p.permit_type,
             i.stage_name, i.inspection_date,
             LAG(i.stage_name) OVER w AS prev_stage,
             LAG(i.inspection_date) OVER w AS prev_date
        FROM permit_inspections i
        JOIN permits p USING (permit_num)
       WHERE i.status = 'Passed'
             AND i.inspection_date IS NOT NULL
      WINDOW w AS (PARTITION BY i.permit_num ORDER BY i.inspection_date, i.stage_name)
    ),
    phase_pairs AS (
      SELECT permit_type,
             ${PREV_STAGE_TO_PHASE_SQL} AS from_phase,
             ${STAGE_TO_PHASE_SQL} AS to_phase,
             (inspection_date - prev_date) AS gap_days
        FROM stage_timeline
       WHERE prev_stage IS NOT NULL
         AND prev_date IS NOT NULL
    )
    SELECT from_phase, to_phase, permit_type,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days))::int AS median_days,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY gap_days))::int AS p25_days,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gap_days))::int AS p75_days,
           COUNT(*) AS sample_size
      FROM phase_pairs
     WHERE from_phase IS NOT NULL
       AND to_phase IS NOT NULL
       AND from_phase <> to_phase
       AND gap_days >= 0
       -- Only forward transitions: filter out rework/data-entry anomalies
       -- like P11→P10 (framing before foundation). Adversarial review HIGH-3.
       AND (${TO_ORDINAL_SQL}) > (${FROM_ORDINAL_SQL})
     GROUP BY 1, 2, 3
    HAVING COUNT(*) >= 5
  `);
  const phasePairRows = phasePairsResult.rows;
  pipeline.log.info(
    '[calibration-v2]',
    `Phase-to-phase pairs: ${phasePairRows.length} (per permit_type)`,
  );

  // Also compute "all types" aggregates (permit_type = NULL)
  const allTypesResult = await pool.query(`
    WITH stage_timeline AS (
      SELECT i.permit_num,
             i.stage_name, i.inspection_date,
             LAG(i.stage_name) OVER w AS prev_stage,
             LAG(i.inspection_date) OVER w AS prev_date
        FROM permit_inspections i
       WHERE i.status = 'Passed'
             AND i.inspection_date IS NOT NULL
      WINDOW w AS (PARTITION BY i.permit_num ORDER BY i.inspection_date, i.stage_name)
    ),
    phase_pairs AS (
      SELECT ${PREV_STAGE_TO_PHASE_SQL} AS from_phase,
             ${STAGE_TO_PHASE_SQL} AS to_phase,
             (inspection_date - prev_date) AS gap_days
        FROM stage_timeline
       WHERE prev_stage IS NOT NULL
         AND prev_date IS NOT NULL
    )
    SELECT from_phase, to_phase, NULL::varchar AS permit_type,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days))::int AS median_days,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY gap_days))::int AS p25_days,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gap_days))::int AS p75_days,
           COUNT(*) AS sample_size
      FROM phase_pairs
     WHERE from_phase IS NOT NULL
       AND to_phase IS NOT NULL
       AND from_phase <> to_phase
       AND gap_days >= 0
       AND (${TO_ORDINAL_SQL}) > (${FROM_ORDINAL_SQL})
     GROUP BY 1, 2
    HAVING COUNT(*) >= 5
  `);
  const allTypesRows = allTypesResult.rows;
  pipeline.log.info(
    '[calibration-v2]',
    `Phase-to-phase pairs (all types): ${allTypesRows.length}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 2: Compute "ISSUED → first phase" calibration
  // ═══════════════════════════════════════════════════════════
  //
  // For permits where we know issued_date and the first passed
  // inspection stage, compute the gap as an "ISSUED → P_X" row.
  // This covers the common path where the flight tracker knows
  // the issued_date but the permit hasn't been inspected yet.
  pipeline.log.info('[calibration-v2]', 'Computing ISSUED → first-phase calibration...');

  const issuedResult = await pool.query(`
    WITH first_inspection AS (
      SELECT DISTINCT ON (i.permit_num)
             i.permit_num, p.permit_type,
             i.stage_name, i.inspection_date,
             p.issued_date
        FROM permit_inspections i
        JOIN permits p USING (permit_num)
       WHERE i.status = 'Passed'
         AND i.inspection_date IS NOT NULL
         AND p.issued_date IS NOT NULL
       ORDER BY i.permit_num, i.inspection_date ASC
    )
    SELECT 'ISSUED' AS from_phase,
           ${STAGE_TO_PHASE_SQL} AS to_phase,
           permit_type,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS median_days,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS p25_days,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS p75_days,
           COUNT(*) AS sample_size
      FROM first_inspection
     WHERE ${STAGE_TO_PHASE_SQL} IS NOT NULL
       AND (inspection_date - issued_date) >= 0
     GROUP BY 1, 2, 3
    HAVING COUNT(*) >= 5
  `);
  const issuedRows = issuedResult.rows;
  pipeline.log.info(
    '[calibration-v2]',
    `ISSUED → phase pairs: ${issuedRows.length}`,
  );

  // Also "all types" for ISSUED
  const issuedAllResult = await pool.query(`
    WITH first_inspection AS (
      SELECT DISTINCT ON (i.permit_num)
             i.permit_num,
             i.stage_name, i.inspection_date,
             p.issued_date
        FROM permit_inspections i
        JOIN permits p USING (permit_num)
       WHERE i.status = 'Passed'
         AND i.inspection_date IS NOT NULL
         AND p.issued_date IS NOT NULL
       ORDER BY i.permit_num, i.inspection_date ASC
    )
    SELECT 'ISSUED' AS from_phase,
           ${STAGE_TO_PHASE_SQL} AS to_phase,
           NULL::varchar AS permit_type,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS median_days,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS p25_days,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inspection_date - issued_date))::int AS p75_days,
           COUNT(*) AS sample_size
      FROM first_inspection
     WHERE ${STAGE_TO_PHASE_SQL} IS NOT NULL
       AND (inspection_date - issued_date) >= 0
     GROUP BY 1, 2
    HAVING COUNT(*) >= 5
  `);
  const issuedAllRows = issuedAllResult.rows;
  pipeline.log.info(
    '[calibration-v2]',
    `ISSUED → phase pairs (all types): ${issuedAllRows.length}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 3: UPSERT all calibration rows
  // ═══════════════════════════════════════════════════════════
  const allRows = [...phasePairRows, ...allTypesRows, ...issuedRows, ...issuedAllRows];
  pipeline.log.info('[calibration-v2]', `Total calibration rows to upsert: ${allRows.length}`);

  // Track new vs updated for telemetry (independent review Defect 1)
  const { rows: preCount } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM phase_calibration',
  );
  const preRowCount = preCount[0].n;

  let upserted = 0;
  if (allRows.length > 0) {
    // Batch UPSERT using the unique index on (from_phase, to_phase, COALESCE(permit_type, '__ALL__'))
    for (const row of allRows) {
      await pool.query(
        `INSERT INTO phase_calibration
           (from_phase, to_phase, permit_type, median_days, p25_days, p75_days, sample_size, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (from_phase, to_phase, COALESCE(permit_type, '__ALL__'))
         DO UPDATE SET
           median_days = EXCLUDED.median_days,
           p25_days = EXCLUDED.p25_days,
           p75_days = EXCLUDED.p75_days,
           sample_size = EXCLUDED.sample_size,
           computed_at = NOW()`,
        [row.from_phase, row.to_phase, row.permit_type,
         row.median_days, row.p25_days, row.p75_days, row.sample_size],
      );
      upserted++;
    }
  }
  pipeline.log.info('[calibration-v2]', `Upserted ${upserted} calibration rows`);

  // ═══════════════════════════════════════════════════════════
  // Step 4: Telemetry
  // ═══════════════════════════════════════════════════════════
  const { rows: calRows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM phase_calibration',
  );
  const postRowCount = calRows[0].n;
  const newRows = postRowCount - preRowCount;

  pipeline.emitSummary({
    records_total: allRows.length,
    records_new: Math.max(0, newRows),
    records_updated: upserted - Math.max(0, newRows),
    records_meta: {
      phase_pairs_by_type: phasePairRows.length,
      phase_pairs_all_types: allTypesRows.length,
      issued_pairs_by_type: issuedRows.length,
      issued_pairs_all_types: issuedAllRows.length,
      total_calibration_rows: calRows[0].n,
    },
  });

  pipeline.emitMeta(
    {
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      permits: ['permit_num', 'permit_type', 'issued_date'],
    },
    {
      phase_calibration: ['from_phase', 'to_phase', 'permit_type', 'median_days', 'p25_days', 'p75_days', 'sample_size'],
    },
  );
});
