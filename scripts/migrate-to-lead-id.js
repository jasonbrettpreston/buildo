#!/usr/bin/env node
/**
 * migrate-to-lead-id — Phase C one-shot backfill of `lead_id` on the
 * four consumer tables (cost_estimates, trade_forecasts, tracked_projects,
 * lead_analytics).
 *
 * Phase B added `lead_id TEXT` as a nullable column with a CHECK constraint
 * enforcing the canonical format. Phase C populates it on every existing
 * row, then migrations 138-141 promote NOT NULL + UNIQUE.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C
 *
 * R0.8 audit results (executed 2026-05-13 against local dev DB):
 *   - cost_estimates:    247,030 rows (1:1 with permits — heavy backfill)
 *   - trade_forecasts:   654,179 rows (~2.7× permits — heaviest backfill)
 *   - tracked_projects:  0 rows (empty in Phase C; populated by Phase D/F)
 *   - lead_analytics:    0 rows (empty in Phase C)
 *
 * Atomicity (per R2 DeepSeek review): all 4 UPDATEs land inside a single
 * `pipeline.withTransaction` envelope. Advisory lock 4205 already
 * serializes invocations; the single transaction ensures partial failure
 * leaves the DB in a pre-Phase-C state, not a mixed state.
 *
 * Idempotency: every UPDATE guarded by `WHERE lead_id IS NULL`. Re-runs
 * after a successful pass match zero rows and emit an audit_table with
 * `rows_backfilled_<table> = 0`.
 *
 * Usage:
 *   node scripts/migrate-to-lead-id.js
 *
 * Exit codes: 0 on success, 1 on any failure (advisory lock acquisition,
 * UPDATE error, post-condition null-count > 0).
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { deriveLeadId } = require('./lib/leads/lead-id');

const TAG = '[migrate-to-lead-id]';

// §R2 — advisory lock 4205 (Spec 42 §6.8 Phase C allocation: 4201-4205)
const ADVISORY_LOCK_ID = 4205;

// Sanity check: the deriver must be importable from this script. The
// deriver isn't used directly in the SQL UPDATEs (which use the same
// LPAD logic inline for performance — one server-side UPDATE beats
// 247K + 654K round-trips), but importing here confirms the JS twin
// exists and is callable, catching dual-path drift at script startup.
if (typeof deriveLeadId !== 'function') {
  throw new Error(`${TAG} deriveLeadId import failed — Spec 84 §7 dual-path broken`);
}

pipeline.run('migrate-to-lead-id', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // §R3.5 — capture DB clock once at start (consistency across the run)
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    pipeline.log.info(TAG, `Starting Phase C lead_id backfill at ${RUN_AT.toISOString()}`);

    // ── R5.2.f Preflight (Gemini-js + DeepSeek-js CRIT): the canonical
    // LPAD(revision_num, 2, '0') truncates any revision_num > 2 chars,
    // which would collapse distinct rev_nums into the same lead_id and
    // break the Phase C UNIQUE promotion in migrations 138-141. R0.10
    // audit confirmed MAX(LENGTH(revision_num)) = 2 in production at
    // 2026-05-13, but this preflight makes the invariant a runtime check
    // — if a future ingestion ever lands a 3+ char revision, the backfill
    // aborts loudly before producing duplicates.
    const preflight = await pool.query(
      `SELECT COUNT(*)::int AS n FROM permits WHERE LENGTH(revision_num) > 2`,
    );
    const overWide = preflight.rows[0]?.n ?? 0;
    if (overWide > 0) {
      throw new Error(`${TAG} preflight FAIL: ${overWide} permit row(s) have revision_num longer than 2 chars. LPAD-truncation would cause lead_id collisions. Investigate before retrying.`);
    }

    // §R9 — single withTransaction envelope wraps ALL 4 UPDATEs.
    // Partial failure rolls back every table to pre-Phase-C state.
    const counts = await pipeline.withTransaction(pool, async (client) => {
      const result = {
        cost_estimates: 0,
        trade_forecasts: 0,
        tracked_projects: 0,
        lead_analytics: 0,
      };

      // ── cost_estimates: backfill from (permit_num, revision_num) ────
      // The canonical Phase B trigger format is reproduced server-side
      // via LPAD(revision_num, 2, '0'). R0.10 audit confirmed all
      // revision_nums are ≤ 2 chars; over-width truncation semantics
      // (PG LPAD truncates) match deriveLeadId().
      //
      // Defensive guards (R5.2.f DeepSeek-js + Gemini-js): explicit
      // NOT NULL filters on permit_num + revision_num so a NULL on
      // either column produces zero rows updated rather than a
      // NULL-propagated 'permit:NULL:00' value that would silently
      // pass the post-condition.
      const ce = await client.query(`
        UPDATE cost_estimates
        SET lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
        WHERE lead_id IS NULL
          AND permit_num IS NOT NULL
          AND revision_num IS NOT NULL
      `);
      result.cost_estimates = ce.rowCount ?? 0;
      pipeline.log.info(TAG, `cost_estimates backfilled: ${result.cost_estimates} rows`);

      // ── trade_forecasts: same shape (heaviest table, ~654K rows) ────
      // Same defensive NOT NULL guards as cost_estimates.
      const tf = await client.query(`
        UPDATE trade_forecasts
        SET lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
        WHERE lead_id IS NULL
          AND permit_num IS NOT NULL
          AND revision_num IS NOT NULL
      `);
      result.trade_forecasts = tf.rowCount ?? 0;
      pipeline.log.info(TAG, `trade_forecasts backfilled: ${result.trade_forecasts} rows`);

      // ── tracked_projects: lead_type-aware ──────────────────────────
      // Permit-side rows (lead_type='permit' OR NULL) get permit:...
      // CoA-side rows (lead_type='coa') stay NULL — Phase D/F populates
      // them with coa:... lead_ids after CoA classifiers ship. The
      // partial UNIQUE in migration 140 (WHERE lead_id IS NOT NULL)
      // accommodates this dual-key window.
      const tp = await client.query(`
        UPDATE tracked_projects
        SET lead_id = 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
        WHERE lead_id IS NULL
          AND (lead_type IS NULL OR lead_type = 'permit')
          AND permit_num IS NOT NULL
          AND revision_num IS NOT NULL
      `);
      result.tracked_projects = tp.rowCount ?? 0;
      pipeline.log.info(TAG, `tracked_projects backfilled: ${result.tracked_projects} rows`);

      // ── lead_analytics: copy from lead_key ─────────────────────────
      // R0.7 audit (2026-05-13) confirmed lead_analytics is currently
      // empty; this UPDATE is a no-op in Phase C. When Phase D
      // classifiers populate the table, lead_key already carries the
      // canonical format (per migrations 091 + 132 trigger); a simple
      // copy is sufficient.
      const la = await client.query(`
        UPDATE lead_analytics
        SET lead_id = lead_key
        WHERE lead_id IS NULL AND lead_key IS NOT NULL
      `);
      result.lead_analytics = la.rowCount ?? 0;
      pipeline.log.info(TAG, `lead_analytics backfilled: ${result.lead_analytics} rows`);

      // ── Post-backfill invariant checks ────────────────────────────
      // After backfill, the only NULL lead_id rows that should remain
      // are tracked_projects rows for which permit_num/revision_num are
      // both NULL (impossible per current schema) OR future CoA rows
      // (not yet inserted). The cost_estimates / trade_forecasts /
      // lead_analytics tables must have zero NULLs.
      for (const table of ['cost_estimates', 'trade_forecasts', 'lead_analytics']) {
        const check = await client.query(
          `SELECT COUNT(*)::int AS n FROM ${table} WHERE lead_id IS NULL`,
        );
        const nullCount = check.rows[0]?.n ?? 0;
        if (nullCount > 0) {
          throw new Error(`${TAG} ${table} still has ${nullCount} NULL lead_id rows after backfill — aborting Phase C`);
        }
      }

      return result;
    });

    // §R10/§R11 emits MUST stay inside the withAdvisoryLock callback —
    // when the lock is NOT acquired, the SDK emits its own SKIP summary
    // and returns false, so this block doesn't run. R5.2.f Worktree CRIT
    // caught the prior revision where these emits sat after the lock
    // call and double-emitted on contended runs.
    const audit = {
      phase: 42,
      name: 'Phase C lead_id backfill',
      verdict: 'PASS',
      rows: [
        { metric: 'rows_backfilled_cost_estimates', value: counts.cost_estimates, threshold: null, status: 'INFO' },
        { metric: 'rows_backfilled_trade_forecasts', value: counts.trade_forecasts, threshold: null, status: 'INFO' },
        { metric: 'rows_backfilled_tracked_projects', value: counts.tracked_projects, threshold: null, status: 'INFO' },
        { metric: 'rows_backfilled_lead_analytics', value: counts.lead_analytics, threshold: null, status: 'INFO' },
      ],
    };

    const totalBackfilled =
      counts.cost_estimates + counts.trade_forecasts +
      counts.tracked_projects + counts.lead_analytics;

    pipeline.emitSummary({
      records_total: totalBackfilled,
      records_new: 0,
      records_updated: totalBackfilled,
      records_meta: { audit_table: audit },
    });

    pipeline.emitMeta(
      {
        cost_estimates: ['permit_num', 'revision_num', 'lead_id'],
        trade_forecasts: ['permit_num', 'revision_num', 'lead_id'],
        tracked_projects: ['permit_num', 'revision_num', 'lead_id', 'lead_type'],
        lead_analytics: ['lead_key', 'lead_id'],
      },
      {
        cost_estimates: ['lead_id'],
        trade_forecasts: ['lead_id'],
        tracked_projects: ['lead_id'],
        lead_analytics: ['lead_id'],
      },
    );

    pipeline.log.info(TAG, `Phase C backfill complete — ${totalBackfilled} total rows updated`);
  });

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP summary
});
