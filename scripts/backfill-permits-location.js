#!/usr/bin/env node
/**
 * Backfill permits.location PostGIS Point column from latitude/longitude.
 *
 * 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
 *
 * Migration 067 adds the column + a BEFORE INSERT/UPDATE trigger that
 * keeps it in sync going forward. This script is the one-time backfill
 * for the existing 237K rows.
 *
 * Strategy:
 *   - Stream candidate permit keys (location IS NULL AND lat+lng present)
 *     using pipeline.streamQuery to avoid loading the full result set.
 *   - Buffer keys into batches of 5,000.
 *   - Per batch: a single transactional UPDATE that recomputes location
 *     for that batch only, with an `IS DISTINCT FROM` guard so re-runs
 *     touch zero rows (idempotent).
 *
 * Flags:
 *   --dry-run    Count candidates only; perform no writes.
 *
 * Usage:
 *   node scripts/backfill-permits-location.js
 *   node scripts/backfill-permits-location.js --dry-run
 */
const pipeline = require('./lib/pipeline');

const BATCH_SIZE = 5000;
const SCRIPT_NAME = 'backfill-permits-location';

const DRY_RUN = process.argv.includes('--dry-run');

const CANDIDATE_SQL = `
  SELECT permit_num, revision_num
  FROM permits
  WHERE location IS NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
  ORDER BY permit_num, revision_num
`;

async function updateBatch(client, keys) {
  if (keys.length === 0) return 0;
  // Build $1,$2 / $3,$4 ... pairs and a VALUES list to join against permits
  const valuesPlaceholders = [];
  const params = [];
  let p = 1;
  for (const k of keys) {
    valuesPlaceholders.push(`($${p++}::text, $${p++}::int)`);
    params.push(k.permit_num, k.revision_num);
  }
  const sql = `
    UPDATE permits AS p
    SET location = ST_SetSRID(ST_MakePoint(p.longitude::float8, p.latitude::float8), 4326)
    FROM (VALUES ${valuesPlaceholders.join(',')}) AS k(permit_num, revision_num)
    WHERE p.permit_num = k.permit_num
      AND p.revision_num = k.revision_num
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
      AND p.location IS DISTINCT FROM ST_SetSRID(ST_MakePoint(p.longitude::float8, p.latitude::float8), 4326)
  `;
  const res = await client.query(sql, params);
  return res.rowCount || 0;
}

pipeline.run(SCRIPT_NAME, async (pool) => {
  pipeline.log.info(`[${SCRIPT_NAME}]`, DRY_RUN ? 'Starting dry-run' : 'Starting backfill');

  let candidateCount = 0;
  let updatedCount = 0;
  let batchNum = 0;
  let buffer = [];
  const startMs = Date.now();

  for await (const row of pipeline.streamQuery(pool, CANDIDATE_SQL)) {
    candidateCount += 1;
    buffer.push({ permit_num: row.permit_num, revision_num: row.revision_num });

    if (buffer.length >= BATCH_SIZE) {
      batchNum += 1;
      if (!DRY_RUN) {
        const batch = buffer;
        const written = await pipeline.withTransaction(pool, (client) => updateBatch(client, batch));
        updatedCount += written;
        pipeline.track(0, written);
      }
      pipeline.progress(SCRIPT_NAME, candidateCount, candidateCount, startMs);
      buffer = [];
    }
  }

  // Tail batch
  if (buffer.length > 0) {
    batchNum += 1;
    if (!DRY_RUN) {
      const batch = buffer;
      const written = await pipeline.withTransaction(pool, (client) => updateBatch(client, batch));
      updatedCount += written;
      pipeline.track(0, written);
    }
    buffer = [];
  }

  pipeline.log.info(`[${SCRIPT_NAME}]`, 'Backfill complete', {
    dry_run: DRY_RUN,
    candidates: candidateCount,
    updated: updatedCount,
    batches: batchNum,
  });

  pipeline.emitMeta(
    { permits: ['permit_num', 'revision_num', 'latitude', 'longitude', 'location'] },
    DRY_RUN ? {} : { permits: ['location'] }
  );
  const notUpdated = candidateCount - updatedCount;
  const backfillVerdict = DRY_RUN || notUpdated === 0 ? 'PASS' : 'WARN';
  pipeline.emitSummary({
    records_total: candidateCount,
    records_new: 0,
    records_updated: updatedCount,
    records_meta: {
      dry_run: DRY_RUN,
      batches: batchNum,
      batch_size: BATCH_SIZE,
      audit_table: {
        phase: 0,
        name: 'Backfill Permits Location',
        verdict: backfillVerdict,
        rows: [
          { metric: 'permits_backfilled', value: updatedCount,  threshold: null,   status: 'INFO' },
          { metric: 'permits_not_updated', value: notUpdated,   threshold: '== 0', status: DRY_RUN || notUpdated === 0 ? 'PASS' : 'WARN' },
        ],
      },
    },
  });
}).catch((err) => {
  pipeline.log.error(`[${SCRIPT_NAME}]`, err, { phase: 'fatal' });
  throw err;
});
