#!/usr/bin/env node
/**
 * Compute centroid lat/lng for all parcels from their geometry JSONB.
 *
 * Populates the centroid_lat and centroid_lng columns added by migration 016.
 * Uses arithmetic mean of outer ring vertices (excluding closing point).
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - Cursor-based pagination prevents infinite loop on malformed geometries
 *   - Bulk unnest UPDATE instead of N+1 per-row queries
 *   - records_meta with centroids_computed, failed_geometries
 *
 * Usage: node scripts/compute-centroids.js
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');

/**
 * Compute centroid [lng, lat] from a GeoJSON geometry.
 * Returns null if geometry is invalid.
 */
function computeCentroid(geom) {
  if (!geom || !geom.coordinates) return null;

  let ring;
  if (geom.type === 'Polygon') {
    ring = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon') {
    ring = geom.coordinates[0]?.[0];
  } else {
    return null;
  }

  if (!ring || ring.length < 4) return null;

  // Exclude closing point if it matches the first
  const last = ring[ring.length - 1];
  const n =
    last[0] === ring[0][0] && last[1] === ring[0][1]
      ? ring.length - 1
      : ring.length;

  if (n < 3) return null;

  let sumLng = 0;
  let sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }

  return [sumLng / n, sumLat / n];
}

const ADVISORY_LOCK_ID = 99;

pipeline.run('compute-centroids', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const startTime = Date.now();

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM parcels WHERE geometry IS NOT NULL AND centroid_lat IS NULL`
  );
  const totalParcels = safeParsePositiveInt(countResult.rows[0].total, 'total');
  pipeline.log.info('[compute-centroids]', `Parcels to compute: ${totalParcels.toLocaleString()}`);

  if (totalParcels === 0) {
    pipeline.log.info('[compute-centroids]', 'All parcels already have centroids. Done.');
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 5,
          name: 'Centroid Computation',
          verdict: 'PASS',
          rows: [
            { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
            { metric: 'reason', value: 'All parcels already have centroids — nothing to compute', threshold: null, status: 'INFO' },
          ],
        },
      },
    });
    pipeline.emitMeta({ "parcels": ["id", "geometry"] }, { "parcels": ["centroid_lat", "centroid_lng"] });
    return;
  }

  // Detect PostGIS for fast-path ST_Centroid
  const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  const hasPostGIS = pgisCheck.rows.length > 0;

  let processed = 0;
  let computed = 0;
  let failed = 0;

  if (hasPostGIS) {
    // PostGIS fast path: single SQL statement using ST_Centroid on the native geom column
    pipeline.log.info('[compute-centroids]', 'Using PostGIS ST_Centroid (fast path)');
    const result = await pool.query(
      `UPDATE parcels SET
         centroid_lat = ST_Y(ST_Centroid(geom)),
         centroid_lng = ST_X(ST_Centroid(geom))
       WHERE geom IS NOT NULL AND centroid_lat IS NULL
       RETURNING id`
    );
    computed = result.rows.length;
    processed = computed;
    // Count failures: parcels with geometry but no geom (failed GeoJSON conversion)
    const failedResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM parcels WHERE geometry IS NOT NULL AND geom IS NULL AND centroid_lat IS NULL`
    );
    failed = failedResult.rows[0].cnt;
    processed += failed;
  } else {
    // JS fallback: batch loop with arithmetic mean centroid
    pipeline.log.info('[compute-centroids]', 'PostGIS not available — using JS centroid computation');
    let lastId = 0;

    while (true) {
      const batch = await pool.query(
        `SELECT id, geometry FROM parcels
         WHERE geometry IS NOT NULL AND centroid_lat IS NULL AND id > $1
         ORDER BY id
         LIMIT $2`,
        [lastId, pipeline.BATCH_SIZE]
      );

      if (batch.rows.length === 0) break;
      lastId = batch.rows[batch.rows.length - 1].id;

      const ids = [];
      const lngs = [];
      const lats = [];

      for (const row of batch.rows) {
        let geom;
        try {
          geom = typeof row.geometry === 'string'
            ? JSON.parse(row.geometry)
            : row.geometry;
        } catch (err) {
          pipeline.log.warn('[compute-centroids]', `Skipping parcel ${row.id}: malformed geometry JSON — ${err.message}`);
          failed++;
          processed++;
          continue;
        }

        const centroid = computeCentroid(geom);

        if (centroid) {
          ids.push(row.id);
          lngs.push(centroid[0]);
          lats.push(centroid[1]);
          computed++;
        } else {
          failed++;
        }

        processed++;
      }

      if (ids.length > 0) {
        await pipeline.withTransaction(pool, async (client) => {
          await client.query(
            `UPDATE parcels AS p SET
               centroid_lng = v.lng,
               centroid_lat = v.lat
             FROM (
               SELECT unnest($1::int[]) AS id,
                      unnest($2::float[]) AS lng,
                      unnest($3::float[]) AS lat
             ) AS v
             WHERE p.id = v.id`,
            [ids, lngs, lats]
          );
        });
      }

      if (processed % 50000 === 0 || processed >= totalParcels) {
        pipeline.progress('compute-centroids', processed, totalParcels, startTime);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[compute-centroids]', 'Complete', {
    processed, computed, failed,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  const computeRate = processed > 0 ? ((computed / processed) * 100).toFixed(1) : '0.0';
  const auditRows = [
    { metric: 'parcels_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'centroids_computed', value: computed, threshold: null, status: 'INFO' },
    { metric: 'failed_geometries', value: failed, threshold: '== 0', status: failed > 0 ? 'WARN' : 'PASS' },
    { metric: 'compute_rate', value: `${computeRate}%`, threshold: '>= 98%', status: safeParseFloat(computeRate, 'compute_rate') < 98 ? 'WARN' : 'PASS' },
  ];
  const hasWarns = failed > 0 || safeParseFloat(computeRate, 'compute_rate') < 98;

  pipeline.emitSummary({
    records_total: processed,
    records_new: 0,
    records_updated: computed,
    records_meta: {
      duration_ms: durationMs,
      parcels_processed: processed,
      centroids_computed: computed,
      failed_geometries: failed,
      audit_table: {
        phase: 5,
        name: 'Centroid Computation',
        verdict: hasWarns ? 'WARN' : 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "parcels": ["id", "geometry"] },
    { "parcels": ["centroid_lat", "centroid_lng"] }
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
