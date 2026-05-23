#!/usr/bin/env node
/**
 * One-time backfill: populate address_points.geom for 525K existing rows.
 *
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 *
 * Migration 162 added the geom column GEOMETRY(Point, 4326) but did NOT
 * backfill existing rows in-transaction (per WF1 plan v4 fold C3: a 525K
 * UPDATE inside a migration transaction blocks VACUUM and causes table
 * bloat). This script populates geom from the existing latitude/longitude
 * columns in batches, using server-side ST_SetSRID(ST_MakePoint(lng, lat)).
 *
 * Operational characteristics:
 *   - Idempotent: only touches rows where geom IS NULL AND latitude IS NOT NULL
 *     AND longitude IS NOT NULL. Re-running after completion is a no-op.
 *   - Checkpointable: each batch commits independently. Operator Ctrl-C
 *     leaves the DB in a consistent partial state; next run resumes.
 *   - Batch-bounded UPDATE: row-id IN (SELECT ... LIMIT N) keeps per-batch
 *     lock duration < 1 second on address_points.
 *   - Advisory lock 116 — only one instance can run at a time. (Lock 115
 *     is reserved for Phase 2c link-parcel-addresses.js.)
 *   - Progress logged every batch.
 *
 * Usage:
 *   node scripts/one-time/backfill-address-points-geom.js
 *
 * After completion: `link-parcel-addresses.js` (Phase 2c) will spatial-join
 * parcels.geom ∩ address_points.geom to populate parcel_address_points.
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { safeParseIntOrNull } = require('../lib/safe-math');

const TAG = '[backfill-address-points-geom]';

const ADVISORY_LOCK_ID = 116;

const BATCH_SIZE = 5000;

pipeline.run('backfill-address-points-geom', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    pipeline.log.info(TAG, 'Starting address_points.geom backfill');

    const { rows: pendingRows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM address_points
       WHERE geom IS NULL
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL`,
    );
    const pendingTotal = safeParseIntOrNull(pendingRows[0].total) ?? 0;

    const { rows: nullCoordRows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM address_points
       WHERE geom IS NULL
         AND (latitude IS NULL OR longitude IS NULL)`,
    );
    const nullCoordTotal = safeParseIntOrNull(nullCoordRows[0].total) ?? 0;

    pipeline.log.info(
      TAG,
      `Pre-run state: ${pendingTotal.toLocaleString()} rows need geom; ` +
        `${nullCoordTotal.toLocaleString()} have NULL lat/lng (cannot be geom-backfilled).`,
    );

    let totalUpdated = 0;
    let iteration = 0;
    let errors = 0;
    let completedNaturally = false;

    while (true) {
      iteration++;
      try {
        const updateResult = await pipeline.withTransaction(pool, async (client) => {
          return client.query(
            // Gemini CRIT + DeepSeek MED IMPL fold: ORDER BY address_point_id
            // enables a PK-btree index scan over the unprocessed rows. Without
            // ORDER BY, the planner can re-scan already-NULL pages on later
            // iterations as more rows are filled, causing progressive slowdown.
            // With ORDER BY + LIMIT, each batch advances monotonically through
            // the PK index.
            `WITH candidates AS (
               SELECT address_point_id
               FROM address_points
               WHERE geom IS NULL
                 AND latitude IS NOT NULL
                 AND longitude IS NOT NULL
               ORDER BY address_point_id
               LIMIT $1
               FOR UPDATE SKIP LOCKED
             )
             UPDATE address_points ap
             SET geom = ST_SetSRID(ST_MakePoint(ap.longitude, ap.latitude), 4326)
             FROM candidates c
             WHERE ap.address_point_id = c.address_point_id
               AND ap.geom IS NULL`,
            [BATCH_SIZE],
          );
        });

        const updated = updateResult.rowCount ?? 0;
        totalUpdated += updated;

        if (updated === 0) {
          completedNaturally = true;
          pipeline.log.info(TAG, `Backfill complete after ${iteration} batch(es)`);
          break;
        }

        pipeline.log.info(
          TAG,
          `Batch ${iteration}: updated ${updated.toLocaleString()} rows ` +
            `(running total: ${totalUpdated.toLocaleString()} / ` +
            `~${pendingTotal.toLocaleString()})`,
        );
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { iteration });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;

    const { rows: postRows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM address_points
       WHERE geom IS NULL
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL`,
    );
    const remainingPending = safeParseIntOrNull(postRows[0].total) ?? 0;

    pipeline.log.info(
      TAG,
      `Done. Updated ${totalUpdated.toLocaleString()} rows in ${elapsedMs}ms. ` +
        `${remainingPending.toLocaleString()} still pending (should be 0).`,
    );

    const auditRows = [
      {
        metric: 'pending_pre_run',
        value: pendingTotal,
        threshold: null,
        status: 'INFO',
      },
      {
        metric: 'rows_backfilled',
        value: totalUpdated,
        threshold: null,
        status: 'INFO',
      },
      {
        metric: 'rows_with_null_coords',
        value: nullCoordTotal,
        threshold: '== 0',
        status: nullCoordTotal > 0 ? 'WARN' : 'PASS',
      },
      {
        metric: 'remaining_pending',
        value: remainingPending,
        threshold: '== 0',
        status: remainingPending > 0 ? 'WARN' : 'PASS',
      },
      {
        metric: 'errors',
        value: errors,
        threshold: '== 0',
        status: errors > 0 ? 'FAIL' : 'PASS',
      },
    ];

    // Independent F1 + Observability I1 IMPL fold: records_total = rows
    // evaluated this run (Spec 47 §11.1), NOT the pre-run backlog count.
    // Pre-run backlog has its own row in audit_table (pending_pre_run) per
    // §11.2 Overflow Rule. Using pendingTotal as records_total would also
    // mis-report sys_velocity_rows_sec on resumed runs.
    pipeline.emitSummary({
      records_total: totalUpdated,
      records_new: 0,
      records_updated: totalUpdated,
      records_meta: {
        duration_ms: elapsedMs,
        iterations: iteration,
        completed_naturally: completedNaturally,
        audit_table: {
          phase: 54,
          name: 'Backfill address_points.geom (one-time)',
          verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                 : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
                 : 'PASS',
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      { address_points: ['address_point_id', 'latitude', 'longitude', 'geom'] },
      { address_points: ['geom'] },
    );
  });

  if (!lockResult.acquired) return;
});
