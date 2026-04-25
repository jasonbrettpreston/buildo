#!/usr/bin/env node
/**
 * purge-lead-views — PIPEDA/GDPR 90-day retention cleanup for lead_views.
 *
 * Spec 70 §Operating Boundaries mandates:
 *   1. Delete lead_views rows older than 90 days (retention SLA)
 *   2. Weekly Firebase Admin SDK reconciliation pass to purge rows
 *      whose user_id no longer matches an active Firebase user
 *      (handles failed deletion webhooks + user account closures)
 *
 * This script handles task 1 nightly. Task 2 (Firebase reconciliation)
 * is a weekly cron that imports firebase-admin and batch-deletes by UID.
 * Scheduled via the existing scripts/local-cron.js or a deployment
 * cron entry.
 *
 * Usage:
 *   node scripts/purge-lead-views.js                 # nightly retention sweep
 *   node scripts/purge-lead-views.js --dry-run       # count only, no delete
 *   node scripts/purge-lead-views.js --reconcile     # weekly Firebase pass
 *
 * Environment:
 *   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE — DB connection
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
 */

// Load dotenv to populate PG_* + Firebase vars from .env
require('dotenv').config();

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

const DRY_RUN = process.argv.includes('--dry-run');
const RECONCILE = process.argv.includes('--reconcile');

const ADVISORY_LOCK_ID = 101;

// D3: Zod schema — RETENTION_DAYS loaded from DB logic_variables (spec §4.1)
const LOGIC_VARS_SCHEMA = z.object({
  lead_view_retention_days: z.coerce.number().int().min(7).max(365).default(90),
}).passthrough();

pipeline.run('purge-lead-views', async (pool) => {
  // D3: Load retention threshold from DB before acquiring advisory lock (§R5 startup guard)
  const { logicVars } = await loadMarketplaceConfigs(pool, 'purge-lead-views');
  const parsed = LOGIC_VARS_SCHEMA.safeParse(logicVars);
  if (!parsed.success) throw new Error(`logicVars validation failed: ${parsed.error.message}`);
  const RETENTION_DAYS = parsed.data.lead_view_retention_days;

  // D4: Guard against misconfigured retention — zero would DELETE EVERY ROW in lead_views
  if (!Number.isInteger(RETENTION_DAYS) || RETENTION_DAYS < 1) {
    throw new Error(`[purge-lead-views] lead_view_retention_days must be a positive integer, got: ${RETENTION_DAYS}`);
  }

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // Capture cutoff once from DB clock — prevents retention window shifting between
    // batch iterations if a long run crosses midnight (Gemini CRITICAL review finding).
    const { rows: [{ cutoff: CUTOFF_AT }] } = await pool.query(
      `SELECT (NOW() - ($1 || ' days')::interval)::timestamptz AS cutoff`,
      [String(RETENTION_DAYS)],
    );

    // Count rows that would be purged first (for dry-run + logging).
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS stale
         FROM lead_views
        WHERE viewed_at < $1`,
      [CUTOFF_AT],
    );
    const stale = countRes.rows[0]?.stale ?? 0;

    pipeline.emitMeta(
      { "lead_views": ["id", "viewed_at"] },
      DRY_RUN ? {} : { "lead_views": ["id"] },
    );

    if (DRY_RUN) {
      pipeline.log.info('[purge-lead-views]', `[dry-run] ${stale} lead_views rows older than ${RETENTION_DAYS} days would be deleted`);
      pipeline.emitSummary({
        records_total: stale,
        records_new: 0,
        records_updated: 0,
        records_meta: {
          dry_run: true,
          retention_days: RETENTION_DAYS,
          audit_table: {
            phase: 101,
            name: 'Lead Views Retention Purge',
            verdict: 'INFO',
            rows: [
              { metric: 'rows_would_delete', value: stale, threshold: null, status: 'INFO' },
              { metric: 'retention_days', value: RETENTION_DAYS, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return;
    }

    if (stale === 0) {
      pipeline.log.info('[purge-lead-views]', `nothing to delete (retention ${RETENTION_DAYS}d)`);
      pipeline.emitSummary({
        records_total: 0,
        records_new: 0,
        records_updated: 0,
        records_meta: {
          retention_days: RETENTION_DAYS,
          audit_table: {
            phase: 101,
            name: 'Lead Views Retention Purge',
            verdict: 'PASS',
            rows: [
              { metric: 'rows_deleted', value: 0, threshold: null, status: 'PASS' },
              { metric: 'retention_days', value: RETENTION_DAYS, threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      return;
    }

    // Batched delete to avoid a long lock on the viewed_at BRIN index.
    // Per-batch withTransaction wrapping: each batch is individually atomic; locks
    // are released between iterations so the BRIN index stays unblocked.
    const BATCH_SIZE = 5000;
    let totalDeleted = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let batchCount = 0;
      await pipeline.withTransaction(pool, async (client) => {
        const res = await client.query(
          `DELETE FROM lead_views
            WHERE id IN (
              SELECT id FROM lead_views
               WHERE viewed_at < $1
               LIMIT $2
            )`,
          [CUTOFF_AT, BATCH_SIZE],
        );
        batchCount = res.rowCount ?? 0;
      });
      totalDeleted += batchCount;
      if (batchCount === 0) break;
    }

    pipeline.log.info('[purge-lead-views]', `deleted ${totalDeleted} rows older than ${RETENTION_DAYS} days`);
    pipeline.emitSummary({
      records_total: stale,  // rows evaluated, not rows deleted (spec §11.1)
      records_new: 0,
      records_updated: 0, // D1: deletions are not in-place modifications — count lives in audit_table
      records_meta: {
        retention_days: RETENTION_DAYS,
        batch_size: BATCH_SIZE,
        audit_table: {
          phase: 101,
          name: 'Lead Views Retention Purge',
          verdict: 'PASS',
          rows: [
            { metric: 'rows_deleted', value: totalDeleted, threshold: null, status: 'PASS' },
            { metric: 'retention_days', value: RETENTION_DAYS, threshold: null, status: 'INFO' },
            { metric: 'batch_size', value: BATCH_SIZE, threshold: null, status: 'INFO' },
          ],
        },
      },
    });

    if (RECONCILE) {
      pipeline.log.info('[purge-lead-views]', '--reconcile requested but Firebase Admin reconciliation is not yet implemented. Spec 70 §Operating Boundaries — tracked as a follow-up for Phase 4+.');
    }
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
