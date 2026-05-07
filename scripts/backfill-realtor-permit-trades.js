#!/usr/bin/env node
/**
 * Backfill Realtor permit_trades — one-time migration ride-along.
 *
 * SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 item 4 (option (a))
 *
 * Per Spec 91 §1.2 algorithmic invariant + §3.5 MANDATED option (a):
 * every active permit gets a (permit_num, revision_num, trade_id=33)
 * row in `permit_trades` so realtors see the same set of permits that
 * tradespeople do. The realtor calibration is purely DB-side
 * (trade_configurations.realtor + TRADE_TARGET_PHASE_FALLBACK.realtor);
 * `getLeadFeed` and the flight-board endpoint do NOT branch on persona.
 *
 * Operational characteristics:
 *   - Server-side batched INSERT...SELECT with NOT EXISTS guard
 *     → idempotent: re-running is safe and a no-op once complete
 *   - Batch size kept small (10K rows) to bound lock duration on
 *     `permit_trades` per batch — concurrent classify-permits runs
 *     can interleave between batches without contention
 *   - Advisory lock 91 — only one backfill instance can run at a time
 *   - Progress logged every batch (operator-visible row count + ETA)
 *
 * Usage (after running migration 118):
 *   node scripts/backfill-realtor-permit-trades.js
 *
 * Rerun is safe — NOT EXISTS guard makes additional batches no-ops.
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { safeParseIntOrNull } = require('./lib/safe-math');

const TAG = '[backfill-realtor-permit-trades]';

// Per Spec 47 §R2 — advisory lock id matches the spec number (91).
const ADVISORY_LOCK_ID = 91;

// Bound the work per batch so the table-level lock on `permit_trades`
// never lasts more than a few hundred ms. 10K rows is well within
// PostgreSQL's per-transaction working set limits.
const BATCH_SIZE = 10000;

// Realtor trade id from migration 118. Hardcoded vs. looked-up because
// (a) the trades.id column is SERIAL but seeded with explicit id 33 in
// migration 118, and (b) the active_task plan-lock pinned this id.
const REALTOR_TRADE_ID = 33;
const REALTOR_TRADE_SLUG = 'realtor';

// Active permit statuses — matches the canonical filter at
// src/lib/quality/metrics.ts:473 (ACTIVE_FILTER) + refresh-snapshot.js.
// Realtor rows are written ONLY for active permits — completed/closed
// permits are filtered out so the realtor backfill doesn't bloat
// permit_trades with rows that the feed query will never surface.
// (DeepSeek Cycle 7 review HIGH.)
const ACTIVE_STATUSES = [
  'Permit Issued',
  'Revision Issued',
  'Under Review',
  'Inspection',
  'Examination',
];

pipeline.run('backfill-realtor-permit-trades', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    // Per Spec 47 §R3.5 — capture the DB clock ONCE at startup. All
    // `classified_at` writes use this single value so the entire
    // backfill is timestamped with one consistent, server-side time
    // (avoids client-clock skew + the in-SQL "current-time" footgun).
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    pipeline.log.info(TAG, 'Starting realtor permit_trades backfill');

    // Pre-flight: confirm the realtor row exists in `trades` (migration
    // 118 must have run). A missing trade_id would FK-violate the INSERT.
    const { rows: tradeCheck } = await pool.query(
      `SELECT id FROM trades WHERE id = $1 AND slug = $2`,
      [REALTOR_TRADE_ID, REALTOR_TRADE_SLUG],
    );
    if (tradeCheck.length === 0) {
      throw new Error(
        `Realtor trade row not found (id=${REALTOR_TRADE_ID}, slug='${REALTOR_TRADE_SLUG}'). ` +
          `Run migration 118_realtor_trade.sql first.`,
      );
    }

    // Total count for progress reporting — scoped to ACTIVE permits only
    // so progress + summary numbers match what we actually backfill.
    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM permits WHERE status = ANY($1)`,
      [ACTIVE_STATUSES],
    );
    const totalActivePermits = safeParseIntOrNull(totalRows[0].total) ?? 0;
    pipeline.log.info(
      TAG,
      `Total ACTIVE permits in scope: ${totalActivePermits.toLocaleString()}`,
    );

    // Total realtor rows already present (idempotency tracking).
    const { rows: existingRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM permit_trades WHERE trade_id = $1`,
      [REALTOR_TRADE_ID],
    );
    const existingRealtorRows = safeParseIntOrNull(existingRows[0].total) ?? 0;
    pipeline.log.info(
      TAG,
      `Existing realtor rows in permit_trades: ${existingRealtorRows.toLocaleString()}`,
    );

    let totalInserted = 0;
    let iteration = 0;
    let completedNaturally = false;

    // No MAX_ITERATIONS cap — the natural termination is `inserted === 0`
    // from the NOT EXISTS guard, which guarantees forward progress every
    // batch. A hard cap risked silent under-completion at scale (DeepSeek
    // Cycle 7 review CRITICAL: 50M rows × 10K batch = 5K iterations,
    // exceeding the previous 1K MAX_ITERATIONS guard).
    while (true) {
      iteration++;
      // Server-side batched INSERT...SELECT. NOT EXISTS guard skips any
      // permit that already has a realtor row (idempotent re-run). LIMIT
      // bounds the per-batch work; the outer loop continues until a
      // batch returns 0 rows (= no permits left to backfill).
      //
      // ACTIVE-status filter (DeepSeek Cycle 7 review HIGH): only active
      // permits get a realtor row. Completed/closed permits never appear
      // in feeds, so realtor rows for them would be dead weight in
      // permit_trades.
      //
      // Per Spec 47 §R3.5 — `classified_at` written using the captured
      // RUN_AT timestamptz parameter (not in-SQL clock functions),
      // since this timestamp is written to the DB.
      // Per Spec 47 §R9 — every data mutation runs inside withTransaction.
      // The transaction scope is one batch; each batch commits independently
      // so a mid-backfill abort (e.g., operator Ctrl-C) leaves the DB in a
      // consistent partial state where re-running picks up where we left off
      // (the NOT EXISTS guard makes already-inserted rows skip cleanly).
      const insertResult = await pipeline.withTransaction(pool, async (client) => {
        return client.query(
          `INSERT INTO permit_trades
             (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
           SELECT p.permit_num, p.revision_num, $1, 1, 1.0, true, NULL, NULL, $4::timestamptz
           FROM permits p
           WHERE p.status = ANY($3)
             AND NOT EXISTS (
               SELECT 1 FROM permit_trades pt
               WHERE pt.permit_num = p.permit_num
                 AND pt.revision_num = p.revision_num
                 AND pt.trade_id = $1
             )
           LIMIT $2
           ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
          [REALTOR_TRADE_ID, BATCH_SIZE, ACTIVE_STATUSES, RUN_AT],
        );
      });

      const inserted = insertResult.rowCount ?? 0;
      totalInserted += inserted;

      if (inserted === 0) {
        completedNaturally = true;
        pipeline.log.info(TAG, `Backfill complete after ${iteration} batch(es)`);
        break;
      }

      pipeline.log.info(
        TAG,
        `Batch ${iteration}: inserted ${inserted.toLocaleString()} rows ` +
          `(running total: ${totalInserted.toLocaleString()} / ` +
          `~${totalActivePermits.toLocaleString()} active permits)`,
      );
    }

    const elapsedMs = Date.now() - t0;
    const finalRealtorRows = existingRealtorRows + totalInserted;
    pipeline.log.info(
      TAG,
      `Done. Inserted ${totalInserted.toLocaleString()} new rows in ${elapsedMs}ms. ` +
        `Total realtor rows now: ${finalRealtorRows.toLocaleString()}.`,
    );

    // Per Spec 47 §R10 — emit pipeline summary so the run lands in
    // pipeline_runs with the right archetype + counts. Verdict is
    // computed from completion status, NOT hardcoded PASS (DeepSeek
    // Cycle 7 review LOW).
    const coverageOk = finalRealtorRows >= totalActivePermits;
    const summaryVerdict = completedNaturally && coverageOk ? 'PASS' : 'WARN';
    pipeline.emitSummary({
      records_total: totalActivePermits,
      records_new: totalInserted,
      records_updated: 0,
      records_meta: {
        backfill: {
          phase: 91,
          name: 'Backfill Realtor permit_trades',
          verdict: summaryVerdict,
          rows: [
            {
              metric: 'realtor_rows_after_backfill',
              value: finalRealtorRows,
              threshold: totalActivePermits,
              status: coverageOk ? 'PASS' : 'WARN',
            },
            {
              metric: 'rows_inserted_this_run',
              value: totalInserted,
              threshold: null,
              status: 'PASS',
            },
            {
              metric: 'completed_naturally',
              value: completedNaturally ? 1 : 0,
              threshold: 1,
              status: completedNaturally ? 'PASS' : 'FAIL',
            },
            {
              metric: 'elapsed_ms',
              value: elapsedMs,
              threshold: null,
              status: 'PASS',
            },
          ],
        },
      },
    });

    // Per Spec 47 §R11 — emit pipeline meta with read/write tables.
    pipeline.emitMeta(
      {
        permits: ['permit_num', 'revision_num', 'status'],
        trades: ['id', 'slug'],
      },
      {
        permit_trades: [
          'permit_num',
          'revision_num',
          'trade_id',
          'tier',
          'confidence',
          'is_active',
          'phase',
          'lead_score',
          'classified_at',
        ],
      },
    );
  });

  // Per Spec 47 §R12 — withAdvisoryLock returns { acquired: bool }; if
  // another instance held the lock, the SDK already emitted a SKIP summary.
  if (!lockResult.acquired) return;
});
