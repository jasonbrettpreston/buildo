#!/usr/bin/env node
/**
 * Link permits to parcels via address + spatial matching.
 *
 * Three-step cascade:
 *   1. Exact address (num + name + type) -> confidence 0.95
 *   2. Num + name only (ignore type mismatch) -> confidence 0.80
 *   3. Spatial proximity (nearest parcel centroid ≤100m) -> confidence 0.65
 *
 * Strategies 1 & 2 use a batch CTE approach (single SQL per batch).
 * Strategy 3 requires permits to have geocoded lat/lng coordinates and
 * uses JavaScript haversine + point-in-polygon for spatial matching.
 *
 * Parcels must have pre-computed centroid_lat/centroid_lng (run compute-centroids.js first).
 *
 * By default, only processes permits without existing parcel links (incremental).
 * Use --full to re-link all permits.
 *
 * Usage:
 *   node scripts/link-parcels.js           # incremental (unlinked only)
 *   node scripts/link-parcels.js --full    # re-link all permits
 */
const pipeline = require('./lib/pipeline');

const SPATIAL_MAX_DISTANCE_M = 100;
const SPATIAL_CONFIDENCE = 0.65;
const BBOX_OFFSET = 0.001; // ~111m lat, ~82m lng at Toronto latitude

/**
 * Ray-casting point-in-polygon test.
 * Point is [lng, lat], ring is array of [lng, lat] (closed polygon).
 */
function pointInPolygon(pt, ring) {
  if (!pt || !ring || ring.length < 4) return false;
  const [x, y] = pt;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Extract the outer ring from a GeoJSON Polygon or MultiPolygon geometry.
 * Returns the first outer ring, or null if geometry is invalid.
 */
function extractOuterRing(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon' && geometry.coordinates.length > 0) {
    return geometry.coordinates[0];
  }
  if (geometry.type === 'MultiPolygon' && geometry.coordinates.length > 0 && geometry.coordinates[0].length > 0) {
    return geometry.coordinates[0][0];
  }
  return null;
}

/**
 * Haversine distance between two [lng, lat] points in metres.
 */
function haversineDistance(p1, p2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const lat1 = toRad(p1[1]);
  const lat2 = toRad(p2[1]);
  const dLat = toRad(p2[1] - p1[1]);
  const dLng = toRad(p2[0] - p1[0]);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

pipeline.run('link-parcels', async (pool) => {
  const fullMode = pipeline.isFullMode();

  console.log('=== Buildo Permit-Parcel Linker (3-Step Cascade) ===');
  console.log(`Mode: ${fullMode ? 'FULL (all permits)' : 'INCREMENTAL (unlinked only)'}`);
  console.log('');

  const addressFilter = `(street_num IS NOT NULL AND street_num != ''
       AND street_name IS NOT NULL AND street_name != '')
       OR (latitude IS NOT NULL AND longitude IS NOT NULL)`;
  const incrementalFilter = `AND NOT EXISTS (
      SELECT 1 FROM permit_parcels pp
      WHERE pp.permit_num = p.permit_num AND pp.revision_num = p.revision_num
    )`;
  const extraFilter = fullMode ? '' : incrementalFilter;

  // Count permits to process
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits p
     WHERE (${addressFilter}) ${extraFilter}`
  );
  const totalPermits = parseInt(countResult.rows[0].total, 10);
  console.log(`Permits to process: ${totalPermits.toLocaleString()}`);

  // Count already linked
  const linkedCount = await pool.query('SELECT COUNT(*) as total FROM permit_parcels');
  console.log(`Already linked: ${parseInt(linkedCount.rows[0].total, 10).toLocaleString()}`);

  // Check if centroids are available for Strategy 3
  const centroidCount = await pool.query(
    'SELECT COUNT(*) as total FROM parcels WHERE centroid_lat IS NOT NULL'
  );
  const hasCentroids = parseInt(centroidCount.rows[0].total, 10) > 0;
  console.log(`Parcels with centroids: ${parseInt(centroidCount.rows[0].total, 10).toLocaleString()} ${hasCentroids ? '(Strategy 3 enabled)' : '(Strategy 3 disabled — run compute-centroids.js first)'}`);
  console.log('');

  const startTime = Date.now();
  let processed = 0;
  let linkedExact = 0;
  let linkedName = 0;
  let linkedSpatial = 0;
  let linkedSpatialPolygon = 0;
  let noMatch = 0;
  let offset = 0;

  while (offset < totalPermits) {
    const batch = await pool.query(
      `SELECT p.permit_num, p.revision_num, p.street_num, p.street_name, p.street_type,
              p.latitude, p.longitude
       FROM permits p
       WHERE (${addressFilter}) ${extraFilter}
       ORDER BY p.permit_num, p.revision_num
       LIMIT $1 OFFSET $2`,
      [pipeline.BATCH_SIZE, offset]
    );

    if (batch.rows.length === 0) break;

    // ------------------------------------------------------------------
    // Build normalized arrays for batch CTE matching
    // ------------------------------------------------------------------
    const permitKeys = []; // { permit_num, revision_num, num, name, type, lat, lng }
    for (const permit of batch.rows) {
      permitKeys.push({
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        num: (permit.street_num || '').trim().toUpperCase().replace(/^0+/, ''),
        name: (permit.street_name || '').trim().toUpperCase(),
        type: (permit.street_type || '').trim().toUpperCase(),
        lat: permit.latitude ? parseFloat(permit.latitude) : null,
        lng: permit.longitude ? parseFloat(permit.longitude) : null,
      });
    }

    // ------------------------------------------------------------------
    // Strategies 1 & 2: Batch CTE for exact + name_only address matching
    // ------------------------------------------------------------------
    // Build a VALUES list for all permits that have address components
    const addrPermits = permitKeys.filter(p => p.num && p.name);
    let sqlMatched = new Map(); // key: "permit_num|revision_num" -> { parcel_id, match_type, confidence }

    if (addrPermits.length > 0) {
      // Build parameterized VALUES list
      const valuesPlaceholders = [];
      const valuesParams = [];
      let paramIdx = 1;

      for (const p of addrPermits) {
        valuesPlaceholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        valuesParams.push(p.permit_num, p.revision_num, p.num, p.name, p.type);
      }

      const cteResult = await pool.query(`
        WITH input_permits (permit_num, revision_num, addr_num, street_name, street_type) AS (
          VALUES ${valuesPlaceholders.join(', ')}
        ),
        exact AS (
          SELECT DISTINCT ON (ip.permit_num, ip.revision_num)
            ip.permit_num, ip.revision_num, pa.id AS parcel_id,
            'exact_address' AS match_type, 0.95 AS confidence
          FROM input_permits ip
          JOIN parcels pa ON pa.addr_num_normalized = ip.addr_num
            AND pa.street_name_normalized = ip.street_name
            AND pa.street_type_normalized = ip.street_type
          WHERE ip.street_type != ''
          ORDER BY ip.permit_num, ip.revision_num, pa.id
        ),
        name_only AS (
          SELECT DISTINCT ON (ip.permit_num, ip.revision_num)
            ip.permit_num, ip.revision_num, pa.id AS parcel_id,
            'name_only' AS match_type, 0.80 AS confidence
          FROM input_permits ip
          JOIN parcels pa ON pa.addr_num_normalized = ip.addr_num
            AND pa.street_name_normalized = ip.street_name
          WHERE NOT EXISTS (
            SELECT 1 FROM exact e
            WHERE e.permit_num = ip.permit_num AND e.revision_num = ip.revision_num
          )
          ORDER BY ip.permit_num, ip.revision_num, pa.id
        )
        SELECT * FROM exact
        UNION ALL
        SELECT * FROM name_only
      `, valuesParams);

      for (const row of cteResult.rows) {
        const key = `${row.permit_num}|${row.revision_num}`;
        sqlMatched.set(key, {
          parcel_id: row.parcel_id,
          match_type: row.match_type,
          confidence: row.confidence,
        });
      }
    }

    // ------------------------------------------------------------------
    // Strategy 3: Spatial proximity for unmatched permits with lat/lng
    // ------------------------------------------------------------------
    const spatialPermits = permitKeys.filter(p => {
      const key = `${p.permit_num}|${p.revision_num}`;
      return !sqlMatched.has(key) && hasCentroids && p.lat !== null && p.lng !== null;
    });

    const spatialMatched = new Map();

    if (spatialPermits.length > 0) {
      for (const permit of spatialPermits) {
        const candidates = await pool.query(
          `SELECT id, centroid_lat, centroid_lng, geometry FROM parcels
           WHERE centroid_lat BETWEEN $1 - ${BBOX_OFFSET} AND $1 + ${BBOX_OFFSET}
             AND centroid_lng BETWEEN $2 - ${BBOX_OFFSET} AND $2 + ${BBOX_OFFSET}`,
          [permit.lat, permit.lng]
        );

        if (candidates.rows.length === 0) continue;

        let bestId = null;
        let bestDist = Infinity;
        let bestGeometry = null;

        for (const c of candidates.rows) {
          const dist = haversineDistance(
            [permit.lng, permit.lat],
            [parseFloat(c.centroid_lng), parseFloat(c.centroid_lat)]
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestId = c.id;
            bestGeometry = c.geometry;
          }
        }

        if (bestId !== null && bestDist <= SPATIAL_MAX_DISTANCE_M) {
          // Check if permit geocode falls inside the matched parcel polygon
          const ring = extractOuterRing(bestGeometry);
          const isInside = ring ? pointInPolygon([permit.lng, permit.lat], ring) : false;

          const key = `${permit.permit_num}|${permit.revision_num}`;
          if (isInside) {
            spatialMatched.set(key, { parcel_id: bestId, match_type: 'spatial_polygon', confidence: 0.90 });
            linkedSpatialPolygon++;
          } else {
            spatialMatched.set(key, { parcel_id: bestId, match_type: 'spatial', confidence: SPATIAL_CONFIDENCE });
          }
          linkedSpatial++;
        }
      }
    }

    // ------------------------------------------------------------------
    // Collect all matches and batch insert
    // ------------------------------------------------------------------
    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const permit of permitKeys) {
      const key = `${permit.permit_num}|${permit.revision_num}`;
      const match = sqlMatched.get(key) || spatialMatched.get(key);

      if (match) {
        if (match.match_type === 'exact_address') linkedExact++;
        else if (match.match_type === 'name_only') linkedName++;
        // spatial counts already incremented above

        insertParams.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        insertValues.push(
          permit.permit_num, permit.revision_num,
          match.parcel_id, match.match_type, match.confidence
        );
      } else {
        noMatch++;
      }

      processed++;
    }

    // Batch insert within a transaction
    if (insertParams.length > 0) {
      await pipeline.withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
           VALUES ${insertParams.join(', ')}
           ON CONFLICT (permit_num, revision_num, parcel_id) DO UPDATE SET
             match_type = EXCLUDED.match_type,
             confidence = EXCLUDED.confidence,
             linked_at = NOW()`,
          insertValues
        );
      });
    }

    offset += pipeline.BATCH_SIZE;

    if (processed % 10000 === 0 || processed >= totalPermits) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalPermits) * 100).toFixed(1);
      const totalLinked = linkedExact + linkedName + linkedSpatial;
      console.log(`  ${processed.toLocaleString()} / ${totalPermits.toLocaleString()} (${pct}%) - linked: ${totalLinked.toLocaleString()} (exact:${linkedExact.toLocaleString()} name:${linkedName.toLocaleString()} spatial:${linkedSpatial.toLocaleString()} spatial_polygon:${linkedSpatialPolygon.toLocaleString()}) - ${elapsed}s`);
    }
  }

  const totalLinked = linkedExact + linkedName + linkedSpatial;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Linking Complete ===');
  console.log(`Permits processed:    ${processed.toLocaleString()}`);
  console.log(`Successfully linked:  ${totalLinked.toLocaleString()} (${((totalLinked / Math.max(processed, 1)) * 100).toFixed(1)}%)`);
  console.log(`  Exact address:      ${linkedExact.toLocaleString()}`);
  console.log(`  Name only:          ${linkedName.toLocaleString()}`);
  console.log(`  Spatial proximity:  ${linkedSpatial.toLocaleString()}`);
  console.log(`    Polygon upgrade:  ${linkedSpatialPolygon.toLocaleString()} (confidence 0.90)`);
  console.log(`    Centroid only:    ${(linkedSpatial - linkedSpatialPolygon).toLocaleString()} (confidence 0.65)`);
  console.log(`No match found:       ${noMatch.toLocaleString()}`);
  console.log(`Duration:             ${elapsed}s`);

  pipeline.emitSummary({ records_total: totalLinked, records_new: totalLinked, records_updated: 0 });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "street_num", "street_name", "street_type", "latitude", "longitude"], "parcels": ["id", "addr_num_normalized", "street_name_normalized", "street_type_normalized", "centroid_lat", "centroid_lng", "geometry"] },
    { "permit_parcels": ["permit_num", "revision_num", "parcel_id", "match_type", "confidence", "linked_at"] }
  );
});
