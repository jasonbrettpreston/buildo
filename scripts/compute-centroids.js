#!/usr/bin/env node
/**
 * Compute centroid lat/lng for all parcels from their geometry JSONB.
 *
 * Populates the centroid_lat and centroid_lng columns added by migration 016.
 * Uses arithmetic mean of outer ring vertices (excluding closing point).
 *
 * Usage: node scripts/compute-centroids.js
 */
const pipeline = require('./lib/pipeline');

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

pipeline.run('compute-centroids', async (pool) => {
  console.log('=== Buildo Parcel Centroid Calculator ===');
  console.log('');

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM parcels WHERE geometry IS NOT NULL AND centroid_lat IS NULL`
  );
  const totalParcels = parseInt(countResult.rows[0].total, 10);
  console.log(`Parcels to compute centroids for: ${totalParcels.toLocaleString()}`);

  if (totalParcels === 0) {
    console.log('All parcels already have centroids. Done.');
    return;
  }

  const startTime = Date.now();
  let processed = 0;
  let computed = 0;
  let failed = 0;

  while (true) {
    const batch = await pool.query(
      `SELECT id, geometry FROM parcels
       WHERE geometry IS NOT NULL AND centroid_lat IS NULL
       ORDER BY id
       LIMIT $1`,
      [pipeline.BATCH_SIZE]
    );

    if (batch.rows.length === 0) break;

    // Prepare updates for this batch
    const updates = [];
    for (const row of batch.rows) {
      const geom = typeof row.geometry === 'string'
        ? JSON.parse(row.geometry)
        : row.geometry;

      const centroid = computeCentroid(geom);

      if (centroid) {
        updates.push({ id: row.id, lng: centroid[0], lat: centroid[1] });
        computed++;
      } else {
        failed++;
      }

      processed++;
    }

    // Write all updates for this batch in a single transaction
    if (updates.length > 0) {
      await pipeline.withTransaction(pool, async (client) => {
        for (const u of updates) {
          await client.query(
            `UPDATE parcels SET centroid_lng = $1, centroid_lat = $2 WHERE id = $3`,
            [u.lng, u.lat, u.id]
          );
        }
      });
    }

    if (processed % 50000 === 0 || processed >= totalParcels) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalParcels) * 100).toFixed(1);
      console.log(`  ${processed.toLocaleString()} / ${totalParcels.toLocaleString()} (${pct}%) - computed: ${computed.toLocaleString()} - ${elapsed}s`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Centroid Computation Complete ===');
  console.log(`Parcels processed: ${processed.toLocaleString()}`);
  console.log(`Centroids set:     ${computed.toLocaleString()}`);
  console.log(`Failed:            ${failed.toLocaleString()}`);
  console.log(`Duration:          ${elapsed}s`);
  pipeline.emitSummary({ records_total: computed, records_new: 0, records_updated: computed });
  pipeline.emitMeta(
    { "parcels": ["id", "geometry"] },
    { "parcels": ["centroid_lat", "centroid_lng"] }
  );
});
