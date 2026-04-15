#!/usr/bin/env node
/**
 * compute-cost-estimates.js — Surgical Cost Estimation Muscle
 *
 * SPEC LINK: docs/specs/product/future/83_lead_cost_model.md §7
 * DUAL CODE PATH: Both this Muscle and src/features/leads/lib/cost-model.ts
 * delegate all formula logic to estimateCostShared() in
 * src/features/leads/lib/cost-model-shared.js (the Brain). No valuation
 * math lives in this file. Any formula change must land in the Brain.
 *
 * CHAIN: Runs inside the permits chain (step 14 of 14). Not the sources chain.
 *
 * RUNBOOK: Script is idempotent — ON CONFLICT DO UPDATE is safe to re-run
 * after a crash. Stream-level batch failures emit failed_rows in audit_table;
 * investigate before re-running. Advisory lock 83 prevents concurrent runs.
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
// Brain: pure valuation logic shared by this Muscle and the TS read-path.
const { estimateCostShared, MODEL_VERSION } = require('../src/features/leads/lib/cost-model-shared');

// ─── Constants ───────────────────────────────────────────────────────────────
// Spec 40 §3.5: advisory lock ID = spec number convention.
const ADVISORY_LOCK_ID = 83;

// Spec 47 §6.3: BATCH_SIZE = Math.floor((65535 - 1) / column_count).
// cost_estimates bulk UPSERT writes 15 columns per row:
// permit_num, revision_num, estimated_cost, cost_source, cost_tier,
// cost_range_low, cost_range_high, premium_factor, complexity_score,
// model_version, is_geometric_override, modeled_gfa_sqm,
// effective_area_sqm, trade_contract_values, computed_at.
const BULK_COLUMN_COUNT = 15;
const BATCH_SIZE = Math.floor((65535 - 1) / BULK_COLUMN_COUNT); // 4368

// ─── Zod config schema ───────────────────────────────────────────────────────
// Every logic_variable consumed by this script must appear here. Validated at
// startup — bad DB values (NULL, 0, wrong type) throw immediately with a clear
// message instead of silently producing NaN or corrupting estimates.
const COST_MODEL_CONFIG_SCHEMA = z.object({
  urban_coverage_ratio:    z.number().positive().max(1),
  suburban_coverage_ratio: z.number().positive().max(1),
  trust_threshold_pct:     z.number().positive().max(1),
  liar_gate_threshold:     z.number().positive().max(1),
});

// ─── Source query ─────────────────────────────────────────────────────────────
// Joins permits with parcel massing, neighbourhood demographics, and the
// LATERAL permit_trades subquery that provides active_trade_slugs.
// COALESCE(pt.active_trades, ARRAY[]::text[]) ensures the column is always an
// array, never NULL — prevents the Brain from seeing a null active_trade_slugs.
const SOURCE_SQL = `
  SELECT
    p.permit_num,
    p.revision_num,
    p.permit_type,
    p.structure_type,
    p.work,
    p.est_const_cost::float8              AS est_const_cost,
    p.scope_tags,
    p.dwelling_units_created,
    p.storeys,
    pp_parcel.lot_size_sqm::float8        AS lot_size_sqm,
    pp_parcel.frontage_m::float8          AS frontage_m,
    bf.footprint_area_sqm::float8         AS footprint_area_sqm,
    bf.estimated_stories,
    n.avg_household_income::float8        AS avg_household_income,
    n.tenure_renter_pct::float8           AS tenure_renter_pct,
    COALESCE(pt.active_trades, ARRAY[]::text[]) AS active_trade_slugs
  FROM permits p
  LEFT JOIN LATERAL (
    SELECT parcel_id
    FROM permit_parcels
    WHERE permit_num = p.permit_num AND revision_num = p.revision_num
    ORDER BY parcel_id ASC
    LIMIT 1
  ) pp ON true
  LEFT JOIN parcels pp_parcel ON pp_parcel.id = pp.parcel_id
  LEFT JOIN LATERAL (
    SELECT building_id
    FROM parcel_buildings
    WHERE parcel_id = pp.parcel_id AND is_primary = true
    LIMIT 1
  ) pb ON true
  LEFT JOIN building_footprints bf ON bf.id = pb.building_id
  LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(t.slug) AS active_trades
    FROM permit_trades pt2
    JOIN trades t ON t.id = pt2.trade_id
    WHERE pt2.permit_num = p.permit_num AND pt2.revision_num = p.revision_num
      AND pt2.is_active = true
  ) pt ON true
`;

// ─── Bulk UPSERT SQL builder ──────────────────────────────────────────────────
// Builds a parameterized multi-row VALUES INSERT for batchSize rows.
// IS DISTINCT FROM guard on 5 columns prevents WAL bloat from no-op rewrites.
function buildBulkUpsertSQL(batchSize) {
  const valueGroups = [];
  for (let i = 0; i < batchSize; i++) {
    const b = i * BULK_COLUMN_COUNT;
    valueGroups.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14}::jsonb,$${b+15}::timestamptz)`,
    );
  }
  return `
    INSERT INTO cost_estimates (
      permit_num, revision_num, estimated_cost, cost_source, cost_tier,
      cost_range_low, cost_range_high, premium_factor, complexity_score,
      model_version, is_geometric_override, modeled_gfa_sqm,
      effective_area_sqm, trade_contract_values, computed_at
    ) VALUES
      ${valueGroups.join(',\n      ')}
    ON CONFLICT (permit_num, revision_num) DO UPDATE SET
      estimated_cost        = EXCLUDED.estimated_cost,
      cost_source           = EXCLUDED.cost_source,
      cost_tier             = EXCLUDED.cost_tier,
      cost_range_low        = EXCLUDED.cost_range_low,
      cost_range_high       = EXCLUDED.cost_range_high,
      premium_factor        = EXCLUDED.premium_factor,
      complexity_score      = EXCLUDED.complexity_score,
      model_version         = EXCLUDED.model_version,
      is_geometric_override = EXCLUDED.is_geometric_override,
      modeled_gfa_sqm       = EXCLUDED.modeled_gfa_sqm,
      effective_area_sqm    = EXCLUDED.effective_area_sqm,
      trade_contract_values = EXCLUDED.trade_contract_values,
      computed_at           = EXCLUDED.computed_at
    WHERE EXCLUDED.estimated_cost        IS DISTINCT FROM cost_estimates.estimated_cost
       OR EXCLUDED.cost_source           IS DISTINCT FROM cost_estimates.cost_source
       OR EXCLUDED.is_geometric_override IS DISTINCT FROM cost_estimates.is_geometric_override
       OR EXCLUDED.effective_area_sqm    IS DISTINCT FROM cost_estimates.effective_area_sqm
       OR EXCLUDED.trade_contract_values::text IS DISTINCT FROM cost_estimates.trade_contract_values::text
    RETURNING (xmax = 0) AS inserted
  `;
}

// ─── Batch flush ──────────────────────────────────────────────────────────────
// Flushes a batch of cost estimates as a single bulk VALUES UPSERT in one
// transaction. No per-row try/catch — errors propagate to withTransaction which
// rolls back the entire batch, and the outer catch increments failedBatches.
async function flushBatch(pool, rows, RUN_AT) {
  if (rows.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  return await pipeline.withTransaction(pool, async (client) => {
    const sql = buildBulkUpsertSQL(rows.length);
    const params = [];
    for (const r of rows) {
      params.push(
        r.permit_num,
        r.revision_num,
        r.estimated_cost,
        r.cost_source,
        r.cost_tier,
        r.cost_range_low,
        r.cost_range_high,
        r.premium_factor,
        r.complexity_score,
        MODEL_VERSION,
        r.is_geometric_override,
        r.modeled_gfa_sqm,
        r.effective_area_sqm,
        JSON.stringify(r.trade_contract_values || {}),
        RUN_AT,
      );
    }
    const res = await client.query(sql, params);
    const inserted = res.rows.filter((r) => r.inserted).length;
    const updated = res.rows.filter((r) => !r.inserted).length;
    // Rows unchanged (IS DISTINCT FROM filter rejected them) return no RETURNING row
    const skipped = rows.length - res.rows.length;
    return { inserted, updated, skipped };
  });
}

// ─── Pipeline entry point ──────────────────────────────────────────────────────
// Guarded by require.main === module so the module can be require()-d from
// parity-battery tests without starting the pool or executing the run.
if (require.main === module) {
  // ── CLI flags ──────────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const rowLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  if (dryRun) pipeline.log.info('[compute-cost-estimates]', 'DRY-RUN mode — no DB writes will occur');
  if (rowLimit) pipeline.log.info('[compute-cost-estimates]', `Row limit: ${rowLimit}`);

  pipeline.run('compute-cost-estimates', async (pool) => {
    // ── 1. Load control panel ──────────────────────────────────────────────
    const { logicVars } = await loadMarketplaceConfigs(pool, 'compute-cost-estimates');

    // ── 2. Zod validation — fail fast if any critical knob is invalid ──────
    const validation = validateLogicVars(logicVars, COST_MODEL_CONFIG_SCHEMA, 'compute-cost-estimates');
    if (!validation.valid) {
      throw new Error(`[compute-cost-estimates] Config validation failed: ${validation.errors.join(', ')}`);
    }

    // ── 3. Pre-fetch surgical rate tables (before lock — read-only) ────────
    const [tradeRatesRes, scopeMatrixRes] = await Promise.all([
      pool.query(
        'SELECT trade_slug, base_rate_sqft::float8, structure_complexity_factor::float8 FROM trade_sqft_rates',
      ),
      pool.query(
        'SELECT permit_type, structure_type, gfa_allocation_percentage::float8 FROM scope_intensity_matrix',
      ),
    ]);
    const tradeRates = Object.fromEntries(
      tradeRatesRes.rows.map((r) => [r.trade_slug, {
        base_rate_sqft: r.base_rate_sqft,
        structure_complexity_factor: r.structure_complexity_factor,
      }]),
    );
    const scopeMatrix = Object.fromEntries(
      scopeMatrixRes.rows.map((r) => [
        `${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}`,
        r.gfa_allocation_percentage,
      ]),
    );
    if (tradeRatesRes.rows.length === 0) {
      throw new Error('trade_sqft_rates table is empty — aborting to prevent zero-cost estimates for all permits');
    }
    pipeline.log.info(
      '[compute-cost-estimates]',
      `Pre-fetched ${tradeRatesRes.rows.length} trade rates, ${scopeMatrixRes.rows.length} matrix entries`,
    );

    // ── 4. Build Brain config ──────────────────────────────────────────────
    const config = {
      tradeRates,
      scopeMatrix,
      urbanCoverageRatio:    logicVars.urban_coverage_ratio,
      suburbanCoverageRatio: logicVars.suburban_coverage_ratio,
      liarGateThreshold:     logicVars.liar_gate_threshold,
    };

    // ── 5. Concurrency guard — advisory lock on dedicated client ───────────
    // CRITICAL: lock on pool.connect() not pool.query. pool.query checks out
    // an ephemeral connection that returns to the pool after the query — the
    // session-scoped advisory lock would be released when the connection is
    // reaped. The dedicated client stays checked-out for the full run.
    // (WF3-03 PR-C / 83-W5 — mirrors classify-lifecycle-phase.js pattern)
    const lockClient = await pool.connect();
    let lockClientReleased = false;

    // §5.5 — Graceful shutdown: register SIGTERM immediately after pool.connect()
    // so a container preemption (Kubernetes scale-down, OOM kill, manual kill -15)
    // releases advisory lock 83 before process exits. Without this, a forced kill
    // bypasses the finally block, orphaning the lock and blocking future runs.
    process.on('SIGTERM', async () => {
      pipeline.log.warn(
        '[compute-cost-estimates]',
        'SIGTERM — releasing advisory lock and shutting down gracefully',
      );
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
      } catch (e) { /* best-effort — lock expires with session anyway */ }
      if (!lockClientReleased) {
        lockClientReleased = true;
        lockClient.release();
      }
      process.exit(143);
    });

    try {
      const { rows: lockRows } = await lockClient.query(
        'SELECT pg_try_advisory_lock($1) AS got',
        [ADVISORY_LOCK_ID],
      );
      if (!lockRows[0].got) {
        pipeline.log.warn(
          '[compute-cost-estimates]',
          `Advisory lock ${ADVISORY_LOCK_ID} held by another process — exiting`,
        );
        pipeline.emitSummary({
          records_total: 0,
          records_new: 0,
          records_updated: 0,
          records_meta: {
            skipped: true,
            reason: 'advisory_lock_held_elsewhere',
            advisory_lock_id: ADVISORY_LOCK_ID,
            audit_table: {
              phase: 14,
              name: 'Cost Estimates',
              verdict: 'SKIP',
              rows: [
                { metric: 'permits_processed', value: 0, threshold: null, status: 'SKIP' },
                { metric: 'permits_inserted',  value: 0, threshold: null, status: 'SKIP' },
                { metric: 'permits_updated',   value: 0, threshold: null, status: 'SKIP' },
              ],
            },
          },
        });
        pipeline.emitMeta(
          {
            permits:                ['permit_num'],
            permit_trades:          ['permit_num', 'revision_num', 'trade_slug'],
            trade_sqft_rates:       ['trade_slug'],
            scope_intensity_matrix: ['permit_type', 'structure_type'],
          },
          { cost_estimates: ['permit_num'] },
        );
        lockClientReleased = true;
        lockClient.release();
        return;
      }
    } catch (lockErr) {
      lockClientReleased = true;
      lockClient.release();
      throw lockErr;
    }

  try {
    // ── 6. RUN_AT: single DB timestamp captured once after lock ────────────
    // Using SELECT NOW() here (not in batched SQL) prevents Midnight Cross
    // drift: if the run starts just before midnight and flushes batches just
    // after, all computed_at values are anchored to the same instant.
    // (Spec 47 §8 — no NOW() in WHERE/SET clauses of the batch UPSERT)
    const { rows: [{ now: RUN_AT }] } = await lockClient.query('SELECT NOW()');

    // ── 7. Stream + batch ──────────────────────────────────────────────────
    let processed  = 0;
    let inserted   = 0;
    let updated    = 0;
    let skipped    = 0;
    let failedBatches = 0;
    let failedRows = 0;
    let nullEstimates     = 0;
    let liarsGateOverrides  = 0;
    let zeroTotalBypasses   = 0;
    let batch = [];

    try {
      const sourceSQL = rowLimit ? `${SOURCE_SQL} LIMIT ${rowLimit}` : SOURCE_SQL;

      for await (const row of pipeline.streamQuery(pool, sourceSQL)) {
        processed++;

        if (dryRun) continue; // count rows without writing

        const estimate = estimateCostShared(row, config);
        batch.push(estimate);

        if (estimate.estimated_cost == null) nullEstimates++;
        if (estimate._liarsGateOverride) liarsGateOverrides++;
        if (estimate._zeroTotalBypass)   zeroTotalBypasses++;

        if (batch.length >= BATCH_SIZE) {
          try {
            const res = await flushBatch(pool, batch, RUN_AT);
            inserted += res.inserted;
            updated  += res.updated;
            skipped  += res.skipped;
          } catch (err) {
            failedBatches++;
            failedRows += batch.length;
            pipeline.log.error('[compute-cost-estimates]', 'batch failed', {
              batch_size: batch.length,
              err: err && err.message,
            });
          }
          batch.length = 0; // reuse array allocation (faster than batch = [])
        }
      }

      // Final partial batch
      if (batch.length > 0) {
        try {
          const res = await flushBatch(pool, batch, RUN_AT);
          inserted += res.inserted;
          updated  += res.updated;
          skipped  += res.skipped;
        } catch (err) {
          failedBatches++;
          failedRows += batch.length;
          pipeline.log.error('[compute-cost-estimates]', 'final batch failed', {
            batch_size: batch.length,
            err: err && err.message,
          });
        }
      }
    } catch (streamErr) {
      // If a batch was in-flight when the stream died, those rows are lost.
      // Count them as failed so emitSummary reflects reality.
      if (batch.length > 0) {
        failedBatches++;
        failedRows += batch.length;
        pipeline.log.error('[compute-cost-estimates]', 'stream error — dropping in-flight batch', {
          dropped_rows: batch.length,
          err: streamErr && streamErr.message,
        });
      } else {
        pipeline.log.error('[compute-cost-estimates]', 'stream error', {
          err: streamErr && streamErr.message,
        });
      }
      throw streamErr;
    }

    // ── 8. data_quality_snapshots — observability counters ─────────────────
    // Best-effort UPDATE for today's snapshot row (if it exists). The snapshot
    // row is created by refresh-snapshot.js which runs later in the chain;
    // if absent, this UPDATE is a no-op and the values appear only in
    // audit_table for this pipeline_run.
    if (!dryRun) {
      try {
        const snapResult = await pool.query(
          `UPDATE data_quality_snapshots
              SET cost_estimates_liar_gate_overrides = $1,
                  cost_estimates_zero_total_bypass   = $2
            WHERE snapshot_date = ($3::timestamptz AT TIME ZONE 'UTC')::date`,
          [liarsGateOverrides, zeroTotalBypasses, RUN_AT],
        );
        if (snapResult.rowCount === 0) {
          pipeline.log.info(
            '[compute-cost-estimates]',
            'data_quality_snapshots: no row for today — counters stored in audit_table only',
          );
        }
      } catch (snapErr) {
        pipeline.log.warn('[compute-cost-estimates]', 'data_quality_snapshots update failed', {
          err: snapErr && snapErr.message,
        });
      }
    }

    // ── 9. Emit summary ────────────────────────────────────────────────────
    const modelCoveragePct = processed > 0
      ? ((processed - nullEstimates) / processed) * 100
      : 0;
    const costAuditRows = [
      { metric: 'permits_processed',         value: processed,          threshold: null,    status: 'INFO' },
      { metric: 'permits_inserted',          value: inserted,           threshold: null,    status: 'INFO' },
      { metric: 'permits_updated',           value: updated,            threshold: null,    status: 'INFO' },
      { metric: 'permits_skipped_unchanged', value: skipped,            threshold: null,    status: 'INFO' },
      { metric: 'liar_gate_overrides',       value: liarsGateOverrides, threshold: null,    status: 'INFO' },
      { metric: 'zero_total_bypass',         value: zeroTotalBypasses,  threshold: null,    status: 'INFO' },
      { metric: 'model_coverage_pct',        value: modelCoveragePct.toFixed(1) + '%', threshold: '>= 80%', status: modelCoveragePct >= 80 ? 'PASS' : 'WARN' },
    ];
    if (failedRows > 0) {
      costAuditRows.push({ metric: 'failed_rows',    value: failedRows,    threshold: '== 0', status: 'WARN' });
      costAuditRows.push({ metric: 'failed_batches', value: failedBatches, threshold: '== 0', status: 'WARN' });
    }
    const costVerdict = failedRows > 0 || modelCoveragePct < 80 ? 'WARN' : 'PASS';

    pipeline.emitSummary({
      records_total:   processed,
      records_new:     inserted,
      records_updated: updated,
      records_meta: {
        audit_table: {
          phase:   14,
          name:    'Cost Estimates',
          verdict: costVerdict,
          rows:    costAuditRows,
        },
        ...(failedBatches > 0 ? { failed_batches: failedBatches, failed_rows: failedRows } : {}),
        ...(dryRun ? { dry_run: true } : {}),
      },
    });

    pipeline.emitMeta(
      {
        permits:                ['permit_num', 'revision_num', 'permit_type', 'structure_type', 'est_const_cost', 'scope_tags'],
        permit_trades:          ['permit_num', 'revision_num', 'trade_slug'],
        permit_parcels:         ['permit_num', 'revision_num', 'parcel_id'],
        parcels:                ['id', 'lot_size_sqm'],
        parcel_buildings:       ['parcel_id', 'building_id', 'is_primary'],
        building_footprints:    ['id', 'footprint_area_sqm', 'estimated_stories'],
        neighbourhoods:         ['neighbourhood_id', 'avg_household_income', 'tenure_renter_pct'],
        trade_sqft_rates:       ['trade_slug', 'base_rate_sqft', 'structure_complexity_factor'],
        scope_intensity_matrix: ['permit_type', 'structure_type', 'gfa_allocation_percentage'],
      },
      {
        cost_estimates: [
          'permit_num', 'revision_num', 'estimated_cost', 'cost_source', 'cost_tier',
          'cost_range_low', 'cost_range_high', 'premium_factor', 'complexity_score',
          'model_version', 'is_geometric_override', 'modeled_gfa_sqm',
          'effective_area_sqm', 'trade_contract_values', 'computed_at',
        ],
        data_quality_snapshots: ['cost_estimates_liar_gate_overrides', 'cost_estimates_zero_total_bypass'],
      },
    );

    // Lock released in outer finally block.

  } finally {
    // Release advisory lock on the SAME pinned client that acquired it.
    // Lock release on a different connection would be a silent no-op.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      pipeline.log.warn(
        '[compute-cost-estimates]',
        'Failed to release advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    } finally {
      if (!lockClientReleased) {
        lockClientReleased = true;
        lockClient.release();
      }
    }
  }
}); // pipeline.run

} // if (require.main === module)

// ─── Exports ──────────────────────────────────────────────────────────────────
// Re-export the Brain's estimateCostShared so parity-battery tests can access
// both JS and TS paths via a single require() of this file.
module.exports = { estimateCostShared };
