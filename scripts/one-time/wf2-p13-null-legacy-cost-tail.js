#!/usr/bin/env node
/**
 * One-time (P13-2): null the LEGACY (model/permit) cost_estimates tail whose
 * estimated_cost or modeled_gfa_sqm breaches the magnitude ceilings — the honest
 * "we cannot price this" outcome for rows priced on mislinked whole-campus/whole-block
 * massing GFA (e.g. Sunnybrook 792K m² attributed to an elevator-cab permit → ~$985M).
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3 (Liar's Gate / magnitude bounds)
 *
 * Why this exists: compute-cost-estimates now carries a DURABLE magnitude clamp (same
 * predicate), so a full re-run would produce this state. This one-off applies it to the
 * live corpus immediately WITHOUT a full ~minutes recompute, so the assert-data-bounds
 * magnitude gates and the served leads reflect reality now. The clamp maintains it going
 * forward (the June-stamped tail re-derives identically each run, IS-DISTINCT-FROM-guarded).
 *
 * Behaviour:
 *   - cost_source is PRESERVED (records that the legacy path was tried); estimated_cost,
 *     cost_tier, cost_range_low, cost_range_high are nulled.
 *   - Backs up the affected (permit_num, revision_num, estimated_cost, cost_tier,
 *     cost_range_low, cost_range_high, modeled_gfa_sqm) to `_backup_p13_legacy_cost_tail`
 *     BEFORE nulling. Restore: UPDATE cost_estimates ce SET estimated_cost=b.estimated_cost,
 *     cost_tier=b.cost_tier, cost_range_low=b.cost_range_low, cost_range_high=b.cost_range_high
 *     FROM _backup_p13_legacy_cost_tail b WHERE ce.permit_num=b.permit_num AND ce.revision_num=b.revision_num;
 *   - Idempotent: the predicate requires estimated_cost IS NOT NULL, so a re-run nulls 0.
 *   - Ceilings read from logic_variables (cost_est_legacy_cost_ceiling_cad / _gfa_ceiling_sqm)
 *     so this stays in lock-step with the compute clamp + assert gate.
 *
 * Usage: node -r dotenv/config scripts/one-time/wf2-p13-null-legacy-cost-tail.js
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { loadMarketplaceConfigs } = require('../lib/config-loader');

const TAG = '[wf2-p13-null-legacy-cost-tail]';
const ADVISORY_LOCK_ID = 122; // next-free per Spec 47 §A.5 (one-time single-instance)

pipeline.run('wf2-p13-null-legacy-cost-tail', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-data-bounds');
    const costCeiling = Number(logicVars.cost_est_legacy_cost_ceiling_cad);
    const gfaCeiling  = Number(logicVars.cost_est_legacy_gfa_ceiling_sqm);
    if (!Number.isFinite(costCeiling) || costCeiling <= 0
        || !Number.isFinite(gfaCeiling) || gfaCeiling <= 0) {
      throw new Error(`${TAG} invalid ceilings (cost=${costCeiling}, gfa=${gfaCeiling}) — seed logic_variables first`);
    }

    const PREDICATE = `cost_source IN ('model','permit') AND estimated_cost IS NOT NULL
       AND (estimated_cost > ${costCeiling} OR (modeled_gfa_sqm IS NOT NULL AND modeled_gfa_sqm > ${gfaCeiling}))`;

    const { rows: preRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cost_estimates WHERE ${PREDICATE}`,
    );
    const toNull = preRows[0].n;
    pipeline.log.info(TAG, `${toNull} legacy rows breach the ceilings (cost > $${(costCeiling / 1e6).toFixed(0)}M or gfa > ${(gfaCeiling / 1000).toFixed(0)}K m²)`);
    if (toNull === 0) {
      pipeline.log.info(TAG, `nothing to do (idempotent no-op)`);
      pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
      pipeline.emitMeta({ cost_estimates: ['estimated_cost', 'modeled_gfa_sqm'] }, {});
      return;
    }

    const updated = await pipeline.withTransaction(pool, async (client) => {
      await client.query(`DROP TABLE IF EXISTS _backup_p13_legacy_cost_tail`);
      await client.query(
        `CREATE TABLE _backup_p13_legacy_cost_tail AS
           SELECT permit_num, revision_num, estimated_cost, cost_tier,
                  cost_range_low, cost_range_high, modeled_gfa_sqm, cost_source
             FROM cost_estimates WHERE ${PREDICATE}`,
      );
      const res = await client.query(
        `UPDATE cost_estimates
            SET estimated_cost = NULL, cost_tier = NULL,
                cost_range_low = NULL, cost_range_high = NULL
          WHERE ${PREDICATE}`,
      );
      return res.rowCount;
    });

    pipeline.log.info(TAG, `nulled ${updated} legacy cost rows (backed up to _backup_p13_legacy_cost_tail)`);
    pipeline.emitSummary({
      records_total: toNull,
      records_new: 0,
      records_updated: updated,
      records_meta: {
        audit_table: {
          phase: 83,
          name: 'P13-2 legacy cost tail null-and-flag',
          verdict: 'PASS',
          rows: [
            { metric: 'legacy_rows_nulled', value: updated, threshold: null, status: 'INFO' },
            { metric: 'cost_ceiling_cad', value: costCeiling, threshold: null, status: 'INFO' },
            { metric: 'gfa_ceiling_sqm', value: gfaCeiling, threshold: null, status: 'INFO' },
          ],
        },
      },
    });
    pipeline.emitMeta(
      { cost_estimates: ['estimated_cost', 'modeled_gfa_sqm', 'cost_source'] },
      { cost_estimates: ['estimated_cost', 'cost_tier', 'cost_range_low', 'cost_range_high'] },
    );
  });

  if (!lockResult.acquired) return;
});
