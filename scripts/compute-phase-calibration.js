#!/usr/bin/env node
/**
 * compute-phase-calibration — phase-level velocity calibration.
 *
 * Reads `permit_phase_transitions` (the ledger written by step 21
 * classify-lifecycle-phase), computes per-cohort percentile statistics
 * (median, p25, p75 days in phase) per (permit_type, phase) bucket,
 * and writes them to `phase_stay_calibration` for downstream consumers.
 *
 * Closes Spec 84 bug 84-W4 ("Dead Transition Write: Ledger is written
 * but not used"). The inspector's lifecycle.timeline[] panel reads
 * this table for cohort comparisons.
 *
 * Read-only relative to source data — fully idempotent. Re-runs
 * recompute the entire table from current ledger state via
 * DELETE + INSERT in a single transaction.
 *
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (calibration source)
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §4 (chain step 21.5)
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

// Spec 47 §R2 — advisory lock 93. The Bundle G registry
// (src/tests/pipeline-advisory-lock.infra.test.ts) enforces global
// lock-ID uniqueness, so this script cannot reuse owning-spec 84
// (already taken by classify-lifecycle-phase.js, the ledger writer).
// 93 was assigned via the registry's free-ID convention.
const ADVISORY_LOCK_ID = 93;

const LOGIC_VARS_SCHEMA = z.object({
  // Reused from existing trade calibration — same freshness semantics
  // apply (warn when calibration data goes stale).
  calibration_freshness_warn_hours: z.coerce.number().finite().positive(),
}).passthrough();

if (require.main === module) {
  pipeline.run('compute-phase-calibration', async (pool) => {
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      // §R3.5 — capture DB clock once; reused for every timestamp written
      // below so a recompute spanning a midnight boundary still produces
      // a single consistent computed_at across all rows.
      const RUN_AT = await pipeline.getDbTimestamp(pool);

      // §R4 — config load + Zod validation
      const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-phase-calibration');
      const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'compute-phase-calibration');
      if (!validation.valid) {
        throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
      }

      // §R7 — read + compute. Single CTE-based aggregation:
      //   1. transitions_with_duration: LAG window over (permit_num,
      //      revision_num) chronological transitions to compute
      //      from_phase duration.
      //   2. PERCENTILE_CONT WITHIN GROUP for median/p25/p75 per
      //      (permit_type, from_phase) bucket.
      //
      // Note: ledger has denormalized `permit_type` column (verified at
      // R2) — no JOIN to permits needed.
      // SQL note: the LAG window MUST run over the unfiltered transition
      // stream so that row N's phase_duration sees row N-1's
      // transitioned_at. Filtering `from_phase IS NOT NULL` PRE-LAG would
      // exclude row 1 (the entry-to-system transition) and break row 2's
      // LAG predecessor — producing NULL durations across the board.
      // Both filters (from_phase, permit_type) are applied POST-LAG.
      // ROUND() before ::INTEGER cast — Postgres casts truncate, which
      // would systematically bias every cohort downward (e.g. p75=10.9d
      // → 10d). Critical for stall-detection accuracy.
      const aggSql = `
        WITH transitions_with_duration AS (
          SELECT
            permit_num,
            revision_num,
            permit_type,
            from_phase,
            transitioned_at,
            transitioned_at - LAG(transitioned_at) OVER (
              PARTITION BY permit_num, revision_num ORDER BY transitioned_at
            ) AS phase_duration
          FROM permit_phase_transitions
        )
        SELECT
          permit_type,
          from_phase AS phase,
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0
          ))::INTEGER AS median_days,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0
          ))::INTEGER AS p25_days,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM phase_duration) / 86400.0
          ))::INTEGER AS p75_days,
          COUNT(*)::INTEGER AS sample_size
        FROM transitions_with_duration
        WHERE from_phase IS NOT NULL
          AND permit_type IS NOT NULL
          AND phase_duration IS NOT NULL
        GROUP BY permit_type, from_phase
      `;

      const aggRes = await pool.query(aggSql);
      const buckets = aggRes.rows;

      // §R10 records_total — count source transitions evaluated (not
      // buckets written). sys_velocity_rows_sec needs the input row count.
      const sourceRowsEvaluated = buckets.reduce((sum, b) => sum + b.sample_size, 0);

      // §R9 — atomic write. DELETE + INSERT in a single transaction so
      // consumers (the inspector) never see a partial table during a
      // recompute. The DELETE's blast radius is bounded — phase_stay_calibration
      // is small (~165 rows post-population).
      let inserted = 0;
      let unreliable = 0; // sample_size < 30 — flagged for telemetry
      const permitTypesSeen = new Set();
      const phasesSeen = new Set();

      await pipeline.withTransaction(pool, async (client) => {
        await client.query('DELETE FROM phase_stay_calibration');
        for (const b of buckets) {
          await client.query(
            `INSERT INTO phase_stay_calibration
               (permit_type, phase, median_days, p25_days, p75_days, sample_size, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [b.permit_type, b.phase, b.median_days, b.p25_days, b.p75_days, b.sample_size, RUN_AT],
          );
          inserted++;
          permitTypesSeen.add(b.permit_type);
          phasesSeen.add(b.phase);
          if (b.sample_size < 30) unreliable++;
        }
      });

      // §R10 — emitSummary with audit_table
      const auditRows = [
        { metric: 'total_buckets',          value: inserted,                       threshold: '>= 1', status: inserted >= 1 ? 'PASS' : 'FAIL' },
        { metric: 'permit_types_calibrated', value: permitTypesSeen.size,          threshold: null,   status: 'INFO' },
        { metric: 'phases_calibrated',       value: phasesSeen.size,               threshold: null,   status: 'INFO' },
        { metric: 'unreliable_buckets',      value: unreliable,                    threshold: null,   status: unreliable > 0 ? 'WARN' : 'INFO' },
      ];

      pipeline.emitSummary({
        records_total: sourceRowsEvaluated,
        records_new: inserted,
        records_updated: 0,
        records_meta: {
          audit_table: {
            phase: 84,
            name: 'Phase Calibration',
            verdict: inserted >= 1 ? (unreliable > 0 ? 'WARN' : 'PASS') : 'FAIL',
            rows: auditRows,
          },
        },
      });

      // §R11 — emitMeta
      pipeline.emitMeta(
        { permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type'] },
        { phase_stay_calibration: ['permit_type', 'phase', 'median_days', 'p25_days', 'p75_days', 'sample_size', 'computed_at'] },
      );
    }); // withAdvisoryLock

    if (!lockResult.acquired) return;
  });
}

module.exports = { ADVISORY_LOCK_ID };
