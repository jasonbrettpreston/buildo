#!/usr/bin/env node
/**
 * Link geocoded permits to neighbourhoods via point-in-polygon matching.
 *
 * Uses @turf/boolean-point-in-polygon against 158 neighbourhood polygons.
 * Only processes permits with lat/lng and neighbourhood_id IS NULL.
 *
 * Usage: node scripts/link-neighbourhoods.js
 *
 * Dependency: npm install @turf/boolean-point-in-polygon @turf/helpers
 */
const pipeline = require('./lib/pipeline');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point, polygon, multiPolygon } = require('@turf/helpers');

/**
 * Compute centroid of a GeoJSON polygon/multipolygon.
 * Returns [lng, lat] or null.
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
  if (!ring || ring.length < 3) return null;
  let sumLng = 0, sumLat = 0;
  // Exclude closing point (same as first)
  const n = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
    ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / n, sumLat / n];
}

pipeline.run('link-neighbourhoods', async (pool) => {
  console.log('=== Buildo Permit-Neighbourhood Linker ===');
  console.log('');

  // Step 1: Load all neighbourhood boundaries
  console.log('Loading neighbourhood boundaries...');
  const nhoods = await pool.query(
    'SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL'
  );
  console.log(`  Loaded ${nhoods.rows.length} neighbourhoods with geometry.`);

  // Pre-build Turf polygon objects
  const turfPolygons = [];
  for (const n of nhoods.rows) {
    const geom = typeof n.geometry === 'string' ? JSON.parse(n.geometry) : n.geometry;
    if (!geom || !geom.coordinates) continue;

    let turfGeom;
    try {
      if (geom.type === 'Polygon') {
        turfGeom = polygon(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        turfGeom = multiPolygon(geom.coordinates);
      } else {
        continue;
      }
    } catch {
      console.log(`  Warning: Invalid geometry for ${n.name} (${n.neighbourhood_id})`);
      continue;
    }

    turfPolygons.push({
      db_id: n.id,
      neighbourhood_id: n.neighbourhood_id,
      name: n.name,
      geometry: turfGeom,
    });
  }
  console.log(`  Built ${turfPolygons.length} Turf polygons.`);

  // Step 2: Count permits to process
  // Use parcel centroid if permit has no lat/lng (most common case)
  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT (p.permit_num, p.revision_num)) as total
     FROM permits p
     LEFT JOIN permit_parcels pp ON pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
     LEFT JOIN parcels pa ON pa.id = pp.parcel_id
     WHERE p.neighbourhood_id IS NULL
       AND (
         (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
         OR pa.geometry IS NOT NULL
       )`
  );
  const totalPermits = parseInt(countResult.rows[0].total, 10);
  console.log(`Permits to link (geocoded or parcel-linked): ${totalPermits.toLocaleString()}`);
  console.log('');

  if (totalPermits === 0) {
    console.log('No permits to link. Done.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    pipeline.emitMeta(
      { "permits": ["permit_num", "revision_num", "latitude", "longitude", "neighbourhood_id"], "neighbourhoods": ["id", "neighbourhood_id", "name", "geometry"], "parcels": ["id", "geometry"] },
      { "permits": ["neighbourhood_id"] }
    );
    return;
  }

  const startTime = Date.now();
  let processed = 0;
  let linked = 0;
  let noMatch = 0;

  // Step 3: Process in batches
  while (true) {
    // Get permits with either direct lat/lng or parcel geometry
    const batch = await pool.query(
      `SELECT DISTINCT ON (p.permit_num, p.revision_num)
              p.permit_num, p.revision_num, p.latitude, p.longitude,
              pa.geometry as parcel_geometry
       FROM permits p
       LEFT JOIN permit_parcels pp ON pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
       LEFT JOIN parcels pa ON pa.id = pp.parcel_id
       WHERE p.neighbourhood_id IS NULL
         AND (
           (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
           OR pa.geometry IS NOT NULL
         )
       ORDER BY p.permit_num, p.revision_num
       LIMIT $1`,
      [pipeline.BATCH_SIZE]
    );

    if (batch.rows.length === 0) break;

    // Group by matched neighbourhood for batch updates
    const updates = {}; // db_id -> [{ permit_num, revision_num }]

    for (const permit of batch.rows) {
      let lng, lat;

      if (permit.latitude && permit.longitude) {
        // Use direct geocoded location
        lng = permit.longitude;
        lat = permit.latitude;
      } else if (permit.parcel_geometry) {
        // Compute centroid from parcel geometry
        const geom = typeof permit.parcel_geometry === 'string'
          ? JSON.parse(permit.parcel_geometry)
          : permit.parcel_geometry;
        const centroid = computeCentroid(geom);
        if (!centroid) { noMatch++; processed++; continue; }
        lng = centroid[0];
        lat = centroid[1];
      } else {
        noMatch++; processed++; continue;
      }

      const pt = point([lng, lat]);
      let matched = false;

      for (const nhood of turfPolygons) {
        if (booleanPointInPolygon(pt, nhood.geometry)) {
          if (!updates[nhood.db_id]) updates[nhood.db_id] = [];
          updates[nhood.db_id].push({
            permit_num: permit.permit_num,
            revision_num: permit.revision_num,
          });
          matched = true;
          linked++;
          break;
        }
      }

      if (!matched) {
        noMatch++;
        // Mark as -1 so it's not re-queried (neighbourhood_id IS NULL won't match)
        if (!updates[-1]) updates[-1] = [];
        updates[-1].push({
          permit_num: permit.permit_num,
          revision_num: permit.revision_num,
        });
      }
      processed++;
    }

    // Batch update permits (neighbourhood_id = -1 marks "no neighbourhood found")
    await pipeline.withTransaction(pool, async (client) => {
      for (const [dbId, permits] of Object.entries(updates)) {
        if (permits.length === 0) continue;
        const values = [];
        const conditions = [];
        let idx = 2; // $1 is neighbourhood_id
        for (const p of permits) {
          conditions.push(`(permit_num = $${idx++} AND revision_num = $${idx++})`);
          values.push(p.permit_num, p.revision_num);
        }
        await client.query(
          `UPDATE permits SET neighbourhood_id = $1 WHERE (${conditions.join(' OR ')}) AND neighbourhood_id IS DISTINCT FROM $1`,
          [parseInt(dbId, 10), ...values]
        );
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = ((processed / totalPermits) * 100).toFixed(1);
    console.log(`  ${processed.toLocaleString()} / ${totalPermits.toLocaleString()} (${pct}%) - linked: ${linked.toLocaleString()} - ${elapsed}s`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Linking Complete ===');
  console.log(`Permits processed:   ${processed.toLocaleString()}`);
  console.log(`Successfully linked: ${linked.toLocaleString()} (${((linked / Math.max(processed, 1)) * 100).toFixed(1)}%)`);
  console.log(`No match found:      ${noMatch.toLocaleString()}`);
  console.log(`Duration:            ${elapsed}s`);
  pipeline.emitSummary({ records_total: linked, records_new: 0, records_updated: linked });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "latitude", "longitude", "neighbourhood_id"], "neighbourhoods": ["id", "neighbourhood_id", "name", "geometry"], "parcels": ["id", "geometry"] },
    { "permits": ["neighbourhood_id"] }
  );
});
