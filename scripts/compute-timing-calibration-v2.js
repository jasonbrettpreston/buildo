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
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md
 * SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md
 *
 * DUAL PATH NOTE: N/A — per spec §5 Operating Boundaries, phase_calibration
 * is written only by this pipeline script. No TS module computes the same
 * field.
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { mapInspectionStageToPhase } = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

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

// WF3-03 (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 86;

// Zod schema for the logicVars used by this script.
// calibration_min_sample_size=0 would admit single-observation noise into
// the calibration table; fail fast before computing. spec 47 §4.2.
const CALIB_SCHEMA = z.object({
  calibration_min_sample_size: z.coerce.number().finite().int().min(1),
}).passthrough();

// 8 params per row: from_phase, to_phase, permit_type, median_days, p25_days,
// p75_days, sample_size, computed_at (RUN_AT). spec 47 §6.2.
const CALIBRATION_BATCH_SIZE = pipeline.maxRowsPerInsert(8); // Math.floor(65535 / 8) = 8191

pipeline.run('compute-timing-calibration-v2', async (pool) => {
  // ─── Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
  // §4: ALL state-dependent initialization (getDbTimestamp, loadMarketplaceConfigs)
  // MUST execute inside the lock callback to ensure absolute isolation.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

  // §14.1: Capture run timestamp at pipeline startup — used as computed_at
  // for all UPSERT rows. Prevents "Midnight Cross" where NOW() in a loop
  // yields different calendar dates for rows in the same logical run.
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // ─── Load + validate control panel variables ──────────────────
  // calibration_min_sample_size must come from DB (§4.1 — no hardcoded
  // business-logic thresholds in source code).
  const { logicVars } = await loadMarketplaceConfigs(pool, 'calibration-v2');
  const validation = validateLogicVars(logicVars, CALIB_SCHEMA, 'calibration-v2');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const minSampleSize = logicVars.calibration_min_sample_size;
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
    HAVING COUNT(*) >= $1
  `, [minSampleSize]);
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
    HAVING COUNT(*) >= $1
  `, [minSampleSize]);
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
       ORDER BY i.permit_num, i.inspection_date ASC, i.stage_name ASC
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
    HAVING COUNT(*) >= $1
  `, [minSampleSize]);
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
       ORDER BY i.permit_num, i.inspection_date ASC, i.stage_name ASC
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
    HAVING COUNT(*) >= $1
  `, [minSampleSize]);
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

  // WF3-03 (H-W2 / 86-W1): atomic UPSERT pipeline with chunking.
  //
  // Chunk size guards the §9.2 PostgreSQL 65535-parameter limit
  // (8 cols × CALIBRATION_BATCH_SIZE params per chunk, after adding RUN_AT).
  // At today's geometry allRows ≈ 500–800; cap is defensive against future
  // phase-taxonomy growth without requiring a code change.
  //
  // Pre/post counts are captured INSIDE withTransaction so telemetry
  // deltas reflect the same atomic snapshot as the writes (would
  // otherwise race with concurrent writers — though the advisory lock
  // mitigates this in practice). Fixes independent FAIL-1.
  let upserted = 0;
  let preRowCount = 0;
  let postRowCount = 0;

  await pipeline.withTransaction(pool, async (client) => {
    const { rows: preCount } = await client.query(
      'SELECT COUNT(*)::int AS n FROM phase_calibration',
    );
    preRowCount = preCount[0].n;

    if (allRows.length > 0) {
      for (let off = 0; off < allRows.length; off += CALIBRATION_BATCH_SIZE) {
        const chunk = allRows.slice(off, off + CALIBRATION_BATCH_SIZE);
        const vals = [];
        const params = [];
        for (let i = 0; i < chunk.length; i++) {
          const row = chunk[i];
          const base = i * 8;
          vals.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
          params.push(
            row.from_phase, row.to_phase, row.permit_type,
            row.median_days, row.p25_days, row.p75_days, row.sample_size, RUN_AT,
          );
        }
        const result = await client.query(
          `INSERT INTO phase_calibration
             (from_phase, to_phase, permit_type, median_days, p25_days, p75_days, sample_size, computed_at)
           VALUES ${vals.join(', ')}
           ON CONFLICT (from_phase, to_phase, COALESCE(permit_type, '__ALL__'))
           DO UPDATE SET
             median_days = EXCLUDED.median_days,
             p25_days = EXCLUDED.p25_days,
             p75_days = EXCLUDED.p75_days,
             sample_size = EXCLUDED.sample_size,
             computed_at = EXCLUDED.computed_at`,
          params,
        );
        // spec §8.1: use rowCount not chunk.length — ON CONFLICT guard means
        // unchanged rows may be skipped (implementation-dependent on PG version,
        // but rowCount is always the authoritative count of rows touched).
        upserted += result.rowCount ?? 0;
      }
    }

    const { rows: postCount } = await client.query(
      'SELECT COUNT(*)::int AS n FROM phase_calibration',
    );
    postRowCount = postCount[0].n;
  });
  pipeline.log.info('[calibration-v2]', `Upserted ${upserted} calibration rows`);

  // ═══════════════════════════════════════════════════════════
  // Step 4: Post-UPSERT audit (spec 47 §8.2 — real audit_table)
  // ═══════════════════════════════════════════════════════════
  const { rows: auditDbRows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_rows,
      SUM(CASE WHEN median_days < 0 THEN 1 ELSE 0 END)::int AS negative_gap_count,
      SUM(CASE WHEN p25_days IS NULL OR p75_days IS NULL OR sample_size IS NULL THEN 1 ELSE 0 END)::int AS null_stats_count
    FROM phase_calibration
  `);
  const negativeGapCount = auditDbRows[0]?.negative_gap_count ?? 0;
  const nullStatsCount   = auditDbRows[0]?.null_stats_count   ?? 0;

  const auditTableRows = [
    { metric: 'phase_pairs_computed',   value: allRows.length,   threshold: null, status: 'INFO' },
    { metric: 'pairs_above_threshold',  value: allRows.length,   threshold: 1,    status: allRows.length >= 1  ? 'PASS' : 'WARN' },
    { metric: 'negative_gap_count',     value: negativeGapCount, threshold: 0,    status: negativeGapCount > 0 ? 'WARN' : 'PASS' },
    { metric: 'null_stats_count',       value: nullStatsCount,   threshold: 0,    status: nullStatsCount > 0   ? 'WARN' : 'PASS' },
  ];
  const auditVerdict =
    auditTableRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditTableRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // ═══════════════════════════════════════════════════════════
  // Step 5: Telemetry
  // ═══════════════════════════════════════════════════════════
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
      total_calibration_rows: postRowCount,
      min_sample_size: minSampleSize,
      audit_table: {
        phase: 15,
        name: 'Timing Calibration V2',
        verdict: auditVerdict,
        rows: auditTableRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      permits: ['permit_num', 'permit_type', 'issued_date'],
    },
    {
      phase_calibration: ['from_phase', 'to_phase', 'permit_type', 'median_days', 'p25_days', 'p75_days', 'sample_size', 'computed_at'],
    },
  );
  }, { skipEmit: false }); // end withAdvisoryLock

  // Lock held — emit rich SKIP with audit_table (FreshnessTimeline verdict).
  if (!lockResult.acquired) {
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        skipped: true, reason: 'advisory_lock_held_elsewhere',
        audit_table: {
          phase: 15,
          name: 'Timing Calibration V2',
          verdict: 'PASS',
          rows: [{ metric: 'skipped_lock_held', value: 1, threshold: null, status: 'INFO' }],
        },
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
