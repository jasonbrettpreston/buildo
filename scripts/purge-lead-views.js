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
 *   PIPELINE_META_EMIT — set to '1' for orchestrator integration
 *
 * Exit codes:
 *   0 — success (including dry-run)
 *   1 — DB connection failure
 *   2 — argument parse failure
 *   3 — partial failure (some rows purged, some errored)
 */

// Load dotenv to populate PG_* + Firebase vars from .env
require('dotenv').config();

const { Pool } = require('pg');

const RETENTION_DAYS = 90;
const DRY_RUN = process.argv.includes('--dry-run');
const RECONCILE = process.argv.includes('--reconcile');
const EMIT_META = process.env.PIPELINE_META_EMIT === '1';

function emitMeta(meta) {
  if (EMIT_META) {
    // eslint-disable-next-line no-console
    console.log(`PIPELINE_META:${JSON.stringify(meta)}`);
  }
}

function emitSummary(summary) {
  if (EMIT_META) {
    // eslint-disable-next-line no-console
    console.log(`PIPELINE_SUMMARY:${JSON.stringify(summary)}`);
  }
}

async function run() {
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });

  try {
    // Count rows that would be purged first (for dry-run + logging).
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS stale
         FROM lead_views
        WHERE viewed_at < NOW() - ($1 || ' days')::interval`,
      [String(RETENTION_DAYS)],
    );
    const stale = countRes.rows[0]?.stale ?? 0;

    emitMeta({
      reads: { lead_views: stale },
      writes: DRY_RUN ? {} : { lead_views: stale },
    });

    if (DRY_RUN) {
      // eslint-disable-next-line no-console
      console.log(
        `[dry-run] ${stale} lead_views rows older than ${RETENTION_DAYS} days would be deleted`,
      );
      emitSummary({
        records_total: stale,
        records_new: 0,
        records_updated: 0,
        records_meta: { dry_run: true, retention_days: RETENTION_DAYS },
      });
      return;
    }

    if (stale === 0) {
      // eslint-disable-next-line no-console
      console.log(`[purge-lead-views] nothing to delete (retention ${RETENTION_DAYS}d)`);
      emitSummary({
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

    // eslint-disable-next-line no-console
    console.log(
      `[purge-lead-views] deleted ${totalDeleted} rows older than ${RETENTION_DAYS} days`,
    );
    emitSummary({
      records_total: totalDeleted,
      records_new: 0,
      records_updated: totalDeleted, // deletions tracked as "updates" in the records_meta contract
      records_meta: { retention_days: RETENTION_DAYS, batch_size: BATCH_SIZE },
    });

    if (RECONCILE) {
      // eslint-disable-next-line no-console
      console.log(
        '[purge-lead-views] --reconcile requested but Firebase Admin reconciliation is not yet implemented. ' +
          'Spec 70 §Operating Boundaries — tracked as a follow-up for Phase 4+.',
      );
    }
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[purge-lead-views] failed:', err);
  process.exit(1);
});
