#!/usr/bin/env node
/**
 * PRE-Permit Retirement Shim (Phase G)
 *
 * Retired the speculative PRE-permit lead mechanism per Spec 42 §6.11 row "Phase G".
 * This script previously:
 *   - INSERTed Pre-Permit placeholder rows from approved+unlinked CoA applications
 *   - Expired aging Pre-Permits (>18 months)
 *   - Reconciled ghost Pre-Permits when a CoA got linked to a real permit
 *
 * It is now a one-shot idempotent DELETE shim that:
 *   - Counts existing Pre-Permit rows BEFORE deletion (records_total per Spec 47 §11.1)
 *   - DELETEs all PRE-% rows across 10 tables (9 children + 1 parent) in one withTransaction
 *   - Emits per-table deleted counts in audit_table.rows
 *   - First run with N>0 deletions → verdict=PASS; subsequent no-op runs → verdict=SKIP
 *     (distinguishes "cleanup ran" from "already complete")
 *   - No reads of logic_variables (the old `pre_permit_expiry_months` knob is vestigial)
 *
 * After all chain runs report verdict=SKIP, this script is removed from `scripts/manifest.json`
 * in Commit 2 of Phase G WF1 and the file is `git rm`'d.
 *
 * Usage: node scripts/create-pre-permits.js
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G"
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §10 (one-shot migration safety)
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');

const ADVISORY_LOCK_ID = 100;

pipeline.run('create-pre-permits', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const startTime = Date.now();

    // Pre-count rows BEFORE the DELETE pass. This is `records_total` per Spec 47 §11.1
    // (rows evaluated; the subject of the step is the parent Pre-Permit row, not its children).
    const { rows: [{ n: preDeleteCount }] } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits WHERE permit_type = 'Pre-Permit'`,
    );

    pipeline.log.info(
      '[create-pre-permits]',
      `PRE-Permit Retirement Shim — ${preDeleteCount.toLocaleString()} Pre-Permits found before DELETE pass`,
    );

    // Single transaction; children before parent.
    // Two FK categories present:
    //   - RESTRICT (mig 039): permit_trades, permit_parcels → must precede DELETE FROM permits
    //   - CASCADE (mig 086/109): permit_history, permit_products, permit_phase_transitions
    //     → CASCADE would handle these but we DELETE explicitly so each row count is observable
    //       in audit_table per Phase G v2-Q1 ("no reliance on CASCADE")
    //   - No-FK / lead_id-keyed (mig 126/143/144 + Phase C dual-write):
    //     lead_trades, lead_parcels, tracked_projects, lifecycle_transitions
    //     → explicit DELETE; Phase C trigger mirrors permit_trades/permit_parcels INSERTs
    //       into lead_trades/lead_parcels using `lead_id = 'permit:' || permit_num || ':' || ...`
    const counts = await pipeline.withTransaction(pool, async (client) => {
      const leadTrades = await client.query(
        `DELETE FROM lead_trades WHERE lead_id LIKE 'permit:PRE-%'`,
      );
      const leadParcels = await client.query(
        `DELETE FROM lead_parcels WHERE lead_id LIKE 'permit:PRE-%'`,
      );
      // tracked_projects was rekeyed to lead_id by Phase C dual-write (mig 142+).
      const trackedProjects = await client.query(
        `DELETE FROM tracked_projects WHERE lead_id LIKE 'permit:PRE-%'`,
      );
      const permitHistory = await client.query(
        `DELETE FROM permit_history WHERE permit_num LIKE 'PRE-%'`,
      );
      const permitProducts = await client.query(
        `DELETE FROM permit_products WHERE permit_num LIKE 'PRE-%'`,
      );
      const permitPhaseTransitions = await client.query(
        `DELETE FROM permit_phase_transitions WHERE permit_num LIKE 'PRE-%'`,
      );
      // lifecycle_transitions (mig 126): no FK; lead_id-keyed. Defensive delete in case
      // Phase E classifier wrote PRE-% rows.
      const lifecycleTransitions = await client.query(
        `DELETE FROM lifecycle_transitions WHERE lead_id LIKE 'permit:PRE-%'`,
      );
      const permitTrades = await client.query(
        `DELETE FROM permit_trades WHERE permit_num LIKE 'PRE-%'`,
      );
      const permitParcels = await client.query(
        `DELETE FROM permit_parcels WHERE permit_num LIKE 'PRE-%'`,
      );
      // Parent table last; commit gate. Uses permit_type='Pre-Permit' (literal) per spec.
      const permits = await client.query(
        `DELETE FROM permits WHERE permit_type = 'Pre-Permit'`,
      );

      return {
        leadTradesDeleted:             safeParsePositiveInt(leadTrades.rowCount || 0, 'lead_trades'),
        leadParcelsDeleted:            safeParsePositiveInt(leadParcels.rowCount || 0, 'lead_parcels'),
        trackedProjectsDeleted:        safeParsePositiveInt(trackedProjects.rowCount || 0, 'tracked_projects'),
        permitHistoryDeleted:          safeParsePositiveInt(permitHistory.rowCount || 0, 'permit_history'),
        permitProductsDeleted:         safeParsePositiveInt(permitProducts.rowCount || 0, 'permit_products'),
        permitPhaseTransitionsDeleted: safeParsePositiveInt(permitPhaseTransitions.rowCount || 0, 'permit_phase_transitions'),
        lifecycleTransitionsDeleted:   safeParsePositiveInt(lifecycleTransitions.rowCount || 0, 'lifecycle_transitions'),
        permitTradesDeleted:           safeParsePositiveInt(permitTrades.rowCount || 0, 'permit_trades'),
        permitParcelsDeleted:          safeParsePositiveInt(permitParcels.rowCount || 0, 'permit_parcels'),
        permitsDeleted:                safeParsePositiveInt(permits.rowCount || 0, 'permits'),
      };
    });

    const durationMs = Date.now() - startTime;

    pipeline.log.info('[create-pre-permits]', 'Retirement shim done', {
      pre_count: preDeleteCount,
      ...counts,
      duration_ms: durationMs,
    });

    // verdict='SKIP' on no-op (preDeleteCount === 0) distinguishes "cleanup already complete"
    // from "cleanup ran this invocation" — operator can tell from pipeline_runs.audit_table
    // whether the one-shot retirement has executed.
    const verdict = preDeleteCount === 0 ? 'SKIP' : 'PASS';

    const auditRows = [
      { metric: 'pre_permits_deleted',                  value: counts.permitsDeleted,                threshold: null, status: 'PASS' },
      { metric: 'pre_permit_trades_deleted',            value: counts.permitTradesDeleted,           threshold: null, status: 'PASS' },
      { metric: 'pre_permit_parcels_deleted',           value: counts.permitParcelsDeleted,          threshold: null, status: 'PASS' },
      { metric: 'pre_lead_trades_deleted',              value: counts.leadTradesDeleted,             threshold: null, status: 'PASS' },
      { metric: 'pre_lead_parcels_deleted',             value: counts.leadParcelsDeleted,            threshold: null, status: 'PASS' },
      { metric: 'pre_tracked_projects_deleted',         value: counts.trackedProjectsDeleted,        threshold: null, status: 'PASS' },
      { metric: 'pre_permit_history_deleted',           value: counts.permitHistoryDeleted,          threshold: null, status: 'PASS' },
      { metric: 'pre_permit_products_deleted',          value: counts.permitProductsDeleted,         threshold: null, status: 'PASS' },
      { metric: 'pre_permit_phase_transitions_deleted', value: counts.permitPhaseTransitionsDeleted, threshold: null, status: 'PASS' },
      { metric: 'pre_lifecycle_transitions_deleted',    value: counts.lifecycleTransitionsDeleted,   threshold: null, status: 'PASS' },
    ];

    const chainId = process.env.PIPELINE_CHAIN || null;
    const auditTable = {
      phase: chainId === 'coa' ? 5 : 18,
      name: 'PRE-Permit Retirement Shim (Phase G)',
      verdict,
      rows: auditRows,
    };

    // Per purge-lead-views.js precedent + Spec 47 §11.1:
    //   records_total = scope evaluated (pre-delete COUNT of parent table)
    //   records_new   = 0  (deletions are not inserts)
    //   records_updated = 0 (deletions are not in-place modifications — per-table counts live in audit_table)
    pipeline.emitSummary({
      records_total: preDeleteCount,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        duration_ms: durationMs,
        audit_table: auditTable,
      },
    });

    // emitMeta: reads = permits (pre-count); writes = all 10 tables. Per-table deleted counts
    // come from result.rowCount on the DELETEs themselves (no separate SELECT reads).
    // tracked_projects key is `['lead_id']` (rekeyed by Phase C; NOT permit_num/revision_num).
    pipeline.emitMeta(
      { permits: ['permit_num', 'permit_type'] },
      {
        permits:                  ['permit_num', 'permit_type'],
        permit_trades:            ['permit_num', 'revision_num'],
        permit_parcels:           ['permit_num', 'revision_num'],
        lead_trades:              ['lead_id'],
        lead_parcels:             ['lead_id'],
        tracked_projects:         ['lead_id'],
        permit_history:           ['permit_num', 'revision_num'],
        permit_products:          ['permit_num', 'revision_num'],
        permit_phase_transitions: ['permit_num', 'revision_num'],
        lifecycle_transitions:    ['lead_id'],
      },
    );
  });

  if (!lockResult.acquired) return;
});
