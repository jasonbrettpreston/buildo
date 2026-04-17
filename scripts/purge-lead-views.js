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
 * SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md
 */

// Load dotenv to populate PG_* + Firebase vars from .env
require('dotenv').config();

const pipeline = require('./lib/pipeline');

const RETENTION_DAYS = 90;
const DRY_RUN = process.argv.includes('--dry-run');
const RECONCILE = process.argv.includes('--reconcile');

const ADVISORY_LOCK_ID = 101;

pipeline.run('purge-lead-views', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    // Count rows that would be purged first (for dry-run + logging).
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS stale
         FROM lead_views
        WHERE viewed_at < NOW() - ($1 || ' days')::interval`,
      [String(RETENTION_DAYS)],
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
        records_meta: { dry_run: true, retention_days: RETENTION_DAYS },
      });
      return;
    }

    if (stale === 0) {
      pipeline.log.info('[purge-lead-views]', `nothing to delete (retention ${RETENTION_DAYS}d)`);
      pipeline.emitSummary({
        records_total: 0,
        records_new: 0,
        records_updated: 0,
        records_meta: { retention_days: RETENTION_DAYS },
      });
      return;
    }

    // Batched delete to avoid a long lock on the viewed_at BRIN index.
    const BATCH_SIZE = 5000;
    let totalDeleted = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await pool.query(
        `DELETE FROM lead_views
          WHERE id IN (
            SELECT id FROM lead_views
             WHERE viewed_at < NOW() - ($1 || ' days')::interval
             LIMIT $2
          )`,
        [String(RETENTION_DAYS), BATCH_SIZE],
      );
      totalDeleted += res.rowCount ?? 0;
      if ((res.rowCount ?? 0) === 0) break;
    }

    pipeline.log.info('[purge-lead-views]', `deleted ${totalDeleted} rows older than ${RETENTION_DAYS} days`);
    pipeline.emitSummary({
      records_total: totalDeleted,
      records_new: 0,
      records_updated: totalDeleted, // deletions tracked as "updates" in the records_meta contract
      records_meta: { retention_days: RETENTION_DAYS, batch_size: BATCH_SIZE },
    });

    if (RECONCILE) {
      pipeline.log.info('[purge-lead-views]', '--reconcile requested but Firebase Admin reconciliation is not yet implemented. Spec 70 §Operating Boundaries — tracked as a follow-up for Phase 4+.');
    }
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
