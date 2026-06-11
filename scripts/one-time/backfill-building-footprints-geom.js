#!/usr/bin/env node
/**
 * One-time backfill: populate building_footprints.geom for existing rows.
 *
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md
 *
 * The stored `geometry` JSONB is EPSG:3857 (Web Mercator) since the WF2 #C
 * 2026-05-09 change (Spec 56 §2). load-massing.js derives footprint_area_sqm
 * via ST_Transform(3857->4326) but historically never populated the `geom`
 * column; migrations 065/098 only ST_SetSRID(...,4326)'d (NO transform —
 * mislabeling Mercator as WGS84) AND ran on the empty table during migrate.
 * Net: geom ended up NULL (or, on a fresh-DB-then-restore path, mislabeled),
 * so link-massing.js's PostGIS fast path ST_Contains(bf.geom, parcel_pt_4326)
 * matched 0 rows and parcel_buildings stayed empty.
 *
 * This script re-derives geom with the correct ST_Transform(3857->4326),
 * matching the area pass. WF3 plan deliberately uses a one-time script (NOT a
 * migration): a ~427K-row UPDATE inside migrate.js's single transaction would
 * hold ROW EXCLUSIVE for minutes and cannot VACUUM in-txn — the same reason
 * migration 162 moved address_points.geom backfill to a one-time script.
 *
 * Operational characteristics:
 *   - Idempotent: only touches rows where geometry IS NOT NULL AND
 *     (geom IS NULL OR geom is outside the WGS84 envelope — i.e. mislabeled
 *     Mercator). Re-running after completion is a no-op (correct 4326 rows
 *     are ST_Within the envelope -> skipped, never double-transformed).
 *   - Monotonic id cursor + batched: per-batch lock duration stays small.
 *   - Advisory lock 117 — single instance at a time.
 *   - Followed by VACUUM ANALYZE (outside any transaction).
 *
 * Usage: node scripts/one-time/backfill-building-footprints-geom.js
 */
'use strict';

const pipeline = require('../lib/pipeline');
const { safeParseIntOrNull } = require('../lib/safe-math');

const TAG = '[backfill-building-footprints-geom]';
const ADVISORY_LOCK_ID = 117;
const BATCH_SIZE = 5000;

// Rows needing geom: source geometry present, and geom is either NULL or holds
// out-of-WGS84-range coords (Mercator mislabeled as 4326).
const NEEDS_GEOM_PREDICATE = `geometry IS NOT NULL
  AND (geom IS NULL OR NOT ST_Within(geom, ST_MakeEnvelope(-180, -90, 180, 90, 4326)))`;

pipeline.run('backfill-building-footprints-geom', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const t0 = Date.now();
    pipeline.log.info(TAG, 'Starting building_footprints.geom backfill');

    const { rows: pendingRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM building_footprints WHERE ${NEEDS_GEOM_PREDICATE}`,
    );
    const pendingTotal = safeParseIntOrNull(pendingRows[0].total) ?? 0;

    const { rows: nullGeomRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM building_footprints WHERE geometry IS NULL`,
    );
    const nullGeometryTotal = safeParseIntOrNull(nullGeomRows[0].total) ?? 0;

    pipeline.log.info(
      TAG,
      `Pre-run state: ${pendingTotal.toLocaleString()} rows need geom; ` +
        `${nullGeometryTotal.toLocaleString()} have NULL source geometry (cannot be backfilled).`,
    );

    let totalUpdated = 0;
    let iteration = 0;
    let errors = 0;
    let lastId = 0; // monotonic cursor over the integer PK
    let completedNaturally = false;

    while (true) {
      iteration++;
      try {
        const updateResult = await pipeline.withTransaction(pool, async (client) => {
          return client.query(
            // Monotonic id cursor (id > $lastId) keeps each batch an index-range
            // scan and avoids re-walking already-fixed low-id rows. FOR UPDATE
            // SKIP LOCKED guards against any concurrent toucher.
            `WITH candidates AS (
               SELECT id
               FROM building_footprints
               WHERE id > $1 AND ${NEEDS_GEOM_PREDICATE}
               ORDER BY id
               LIMIT $2
               FOR UPDATE SKIP LOCKED
             )
             UPDATE building_footprints bf
             SET geom = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(bf.geometry::text), 3857), 4326)
             FROM candidates c
             WHERE bf.id = c.id
             RETURNING bf.id`,
            [lastId, BATCH_SIZE],
          );
        });

        const updated = updateResult.rowCount ?? 0;
        totalUpdated += updated;
        if (updated > 0) {
          // Advance the cursor to the max id touched this batch.
          for (const r of updateResult.rows) if (r.id > lastId) lastId = r.id;
        }

        if (updated === 0) {
          completedNaturally = true;
          pipeline.log.info(TAG, `Backfill complete after ${iteration} batch(es)`);
          break;
        }

        pipeline.log.info(
          TAG,
          `Batch ${iteration}: updated ${updated.toLocaleString()} rows ` +
            `(running total: ${totalUpdated.toLocaleString()} / ~${pendingTotal.toLocaleString()}, cursor id=${lastId})`,
        );
      } catch (err) {
        errors++;
        pipeline.log.error(TAG, err, { iteration });
        break;
      }
    }

    const elapsedMs = Date.now() - t0;

    // Reclaim dead tuples + refresh GiST stats for the link-massing fast path.
    // Outside any transaction (VACUUM cannot run in a txn).
    if (totalUpdated > 0) {
      await pool.query('VACUUM ANALYZE building_footprints');
    }

    const { rows: postRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM building_footprints WHERE ${NEEDS_GEOM_PREDICATE}`,
    );
    const remainingPending = safeParseIntOrNull(postRows[0].total) ?? 0;

    pipeline.log.info(
      TAG,
      `Done. Updated ${totalUpdated.toLocaleString()} rows in ${elapsedMs}ms. ` +
        `${remainingPending.toLocaleString()} still pending (should be 0).`,
    );

    const auditRows = [
      { metric: 'pending_pre_run', value: pendingTotal, threshold: null, status: 'INFO' },
      { metric: 'rows_backfilled', value: totalUpdated, threshold: null, status: 'INFO' },
      { metric: 'rows_with_null_geometry', value: nullGeometryTotal, threshold: '== 0', status: nullGeometryTotal > 0 ? 'WARN' : 'PASS' },
      { metric: 'remaining_pending', value: remainingPending, threshold: '== 0', status: remainingPending > 0 ? 'WARN' : 'PASS' },
      { metric: 'errors', value: errors, threshold: '== 0', status: errors > 0 ? 'FAIL' : 'PASS' },
    ];

    pipeline.emitSummary({
      records_total: totalUpdated,
      records_new: 0,
      records_updated: totalUpdated,
      records_meta: {
        duration_ms: elapsedMs,
        iterations: iteration,
        completed_naturally: completedNaturally,
        audit_table: {
          phase: 56,
          name: 'Backfill building_footprints.geom (one-time)',
          verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                 : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
                 : 'PASS',
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      { building_footprints: ['id', 'geometry', 'geom'] },
      { building_footprints: ['geom'] },
    );
  });

  if (!lockResult.acquired) return;
});
