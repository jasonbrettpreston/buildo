#!/usr/bin/env node
/**
 * Link permits to parcels via address + spatial matching.
 *
 * Three-step cascade:
 *   1. Exact address (num + name + type) -> confidence 0.95
 *   2. Num + name only (ignore type mismatch) -> confidence 0.80
 *   3. Spatial proximity (nearest parcel centroid ≤100m) -> confidence 0.65
 *      (upgraded to 0.90 if permit geocode falls inside parcel polygon)
 *
 * Strategies 1 & 2 use a batch CTE approach (single SQL per batch).
 * Strategy 3 uses JavaScript haversine + point-in-polygon for spatial matching.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - IS DISTINCT FROM prevents dead tuple bloat on re-runs (§9.3)
 *   - records_meta with tier breakdown for downstream assertions
 *
 * Usage:
 *   node scripts/link-parcels.js           # incremental (unlinked only)
 *   node scripts/link-parcels.js --full    # re-link all permits
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
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
  const startTime = Date.now();

  pipeline.log.info('[link-parcels]', `Mode: ${fullMode ? 'FULL (all permits)' : 'INCREMENTAL (unlinked only)'}`);

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
  pipeline.log.info('[link-parcels]', `Permits to process: ${totalPermits.toLocaleString()}`);

  // Check if centroids are available for Strategy 3
  const centroidCount = await pool.query(
    'SELECT COUNT(*) as total FROM parcels WHERE centroid_lat IS NOT NULL'
  );
  const hasCentroids = parseInt(centroidCount.rows[0].total, 10) > 0;
  pipeline.log.info('[link-parcels]', `Parcels with centroids: ${parseInt(centroidCount.rows[0].total, 10).toLocaleString()} ${hasCentroids ? '(Strategy 3 enabled)' : '(Strategy 3 disabled)'}`);

  if (totalPermits === 0) {
    pipeline.log.info('[link-parcels]', 'No permits to process. Done.');
    pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0 });
    pipeline.emitMeta(
      { "permits": ["permit_num", "revision_num", "street_num", "street_name", "street_type", "latitude", "longitude"], "parcels": ["id", "addr_num_normalized", "street_name_normalized", "street_type_normalized", "centroid_lat", "centroid_lng", "geometry"] },
      { "permit_parcels": ["permit_num", "revision_num", "parcel_id", "match_type", "confidence", "linked_at"] }
    );
    return;
  }

  let processed = 0;
  let linkedExact = 0;
  let linkedName = 0;
  let linkedSpatial = 0;
  let linkedSpatialPolygon = 0;
  let noMatch = 0;
  let dbUpserted = 0;
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
    const permitKeys = [];
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
    const addrPermits = permitKeys.filter(p => p.num && p.name);
    const sqlMatched = new Map();

    if (addrPermits.length > 0) {
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
          // Defensive: ensure geometry is parsed object (JSONB auto-parses, but safety first)
          const parsedGeom = typeof bestGeometry === 'string' ? JSON.parse(bestGeometry) : bestGeometry;
          const ring = extractOuterRing(parsedGeom);
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

    // Batch insert within a transaction — IS DISTINCT FROM prevents dead tuple bloat (§9.3)
    if (insertParams.length > 0) {
      await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(
          `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
           VALUES ${insertParams.join(', ')}
           ON CONFLICT (permit_num, revision_num, parcel_id) DO UPDATE SET
             match_type = EXCLUDED.match_type,
             confidence = EXCLUDED.confidence,
             linked_at = NOW()
           WHERE permit_parcels.match_type IS DISTINCT FROM EXCLUDED.match_type
              OR permit_parcels.confidence IS DISTINCT FROM EXCLUDED.confidence`,
          insertValues
        );
        dbUpserted += result.rowCount || 0;
      });
    }

    offset += pipeline.BATCH_SIZE;

    if (processed % 10000 === 0 || processed >= totalPermits) {
      pipeline.progress('link-parcels', processed, totalPermits, startTime);
    }
  }

  const totalLinked = linkedExact + linkedName + linkedSpatial;
  const durationMs = Date.now() - startTime;

  pipeline.log.info('[link-parcels]', 'Linking complete', {
    processed,
    linked: totalLinked,
    exact: linkedExact,
    name_only: linkedName,
    spatial: linkedSpatial,
    spatial_polygon: linkedSpatialPolygon,
    no_match: noMatch,
    db_upserted: dbUpserted,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for parcel linking observability
  const totalMatched = linkedExact + linkedName + linkedSpatial;
  const parcelLinkRate = processed > 0 ? (totalMatched / processed) * 100 : 0;
  const parcelAuditRows = [
    { metric: 'permits_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'tier_1_exact_address', value: linkedExact, threshold: null, status: 'INFO' },
    { metric: 'tier_2_name_only', value: linkedName, threshold: null, status: 'INFO' },
    { metric: 'tier_3_spatial', value: linkedSpatial, threshold: null, status: 'INFO' },
    { metric: 'tier_3_polygon', value: linkedSpatialPolygon, threshold: null, status: 'INFO' },
    { metric: 'total_matched', value: totalMatched, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: parcelLinkRate.toFixed(1) + '%', threshold: '>= 75%', status: parcelLinkRate >= 75 ? 'PASS' : 'WARN' },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'db_upserted', value: dbUpserted, threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: processed,
    records_new: 0,
    records_updated: dbUpserted,
    records_meta: {
      duration_ms: durationMs,
      permits_processed: processed,
      matches_tier_1_exact: linkedExact,
      matches_tier_2_name: linkedName,
      matches_tier_3_spatial: linkedSpatial,
      matches_tier_3_polygon: linkedSpatialPolygon,
      matches_tier_3_centroid: linkedSpatial - linkedSpatialPolygon,
      no_match_count: noMatch,
      db_upserted: dbUpserted,
      audit_table: {
        phase: 7,
        name: 'Parcel Linking',
        verdict: parcelLinkRate < 75 ? 'WARN' : 'PASS',
        rows: parcelAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "street_num", "street_name", "street_type", "latitude", "longitude"], "parcels": ["id", "addr_num_normalized", "street_name_normalized", "street_type_normalized", "centroid_lat", "centroid_lng", "geometry"] },
    { "permit_parcels": ["permit_num", "revision_num", "parcel_id", "match_type", "confidence", "linked_at"] }
  );
});
