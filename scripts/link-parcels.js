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
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');

const LOGIC_VARS_SCHEMA = z.object({
  spatial_match_max_distance_m: z.number().finite().positive(),
  spatial_match_confidence:     z.number().finite().positive().max(1),
}).passthrough();
const BBOX_OFFSET = 0.001; // ~111m lat, ~82m lng at Toronto latitude

const ADVISORY_LOCK_ID = 90;

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
 * Test if a point is inside a GeoJSON Polygon or MultiPolygon, respecting holes.
 * For Polygon: must be inside outer ring AND NOT inside any inner ring (hole).
 * For MultiPolygon: must be inside at least one sub-polygon (with hole exclusion).
 */
function pointInGeoJSON(pt, geometry) {
  if (!geometry || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    if (!rings[0] || rings[0].length < 4) return false;
    // Must be inside outer ring
    if (!pointInPolygon(pt, rings[0])) return false;
    // Must NOT be inside any hole (inner rings)
    for (let i = 1; i < rings.length; i++) {
      if (rings[i] && rings[i].length >= 4 && pointInPolygon(pt, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (!poly[0] || poly[0].length < 4) continue;
      if (!pointInPolygon(pt, poly[0])) continue;
      // Check holes in this sub-polygon
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        if (poly[i] && poly[i].length >= 4 && pointInPolygon(pt, poly[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
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
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const { logicVars } = await loadMarketplaceConfigs(pool, 'link-parcels');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-parcels');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const spatialMaxDistanceM = logicVars.spatial_match_max_distance_m;
  const spatialConfidence   = logicVars.spatial_match_confidence;

  const fullMode = pipeline.isFullMode();
  const startTime = Date.now();

  // Detect PostGIS for spatial query optimization (ST_Contains, ST_DWithin)
  const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  const hasPostGIS = pgisCheck.rows.length > 0;
  if (hasPostGIS) pipeline.log.info('[link-parcels]', 'PostGIS detected — spatial queries will use ST_Contains/ST_DWithin');

  pipeline.log.info('[link-parcels]', `Mode: ${fullMode ? 'FULL (all permits)' : 'INCREMENTAL (unlinked only)'}`);

  const addressFilter = `(street_num IS NOT NULL AND street_num != ''
       AND street_name IS NOT NULL AND street_name != '')
       OR (latitude IS NOT NULL AND longitude IS NOT NULL)`;
  // Incremental filter: re-link only permits never linked, or newly geocoded since last link.
  //
  // WHY NOT `parcel_linked_at < last_seen_at`:
  //   load-permits.js touches last_seen_at = NOW() for EVERY permit in the daily feed
  //   (even unchanged ones) so that close-stale-permits.js can detect feed disappearance.
  //   Using last_seen_at here causes link_parcels to process the entire 232K-permit table
  //   on every chain run, defeating the incremental design.
  //
  // WHY geocoded_at:
  //   geocoded_at is set ONLY when geocode-permits.js writes new lat/lng. The key
  //   re-link case is: permit arrives address-only → links by address → later gets
  //   geocoded → should re-link spatially for a higher-confidence spatial match.
  //   Address-only changes (no geocode update) are rare; use --full for those.
  const incrementalFilter = `AND (p.parcel_linked_at IS NULL
       OR (p.geocoded_at IS NOT NULL AND p.parcel_linked_at < p.geocoded_at))`;
  const extraFilter = fullMode ? '' : incrementalFilter;

  // Count permits to process
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits p
     WHERE (${addressFilter}) ${extraFilter}`
  );
  const totalPermits = safeParsePositiveInt(countResult.rows[0].total, 'total');
  pipeline.log.info('[link-parcels]', `Permits to process: ${totalPermits.toLocaleString()}`);

  // Check if centroids are available for Strategy 3
  const centroidCount = await pool.query(
    'SELECT COUNT(*) as total FROM parcels WHERE centroid_lat IS NOT NULL'
  );
  const centroidsTotal = safeParsePositiveInt(centroidCount.rows[0].total, 'total');
  const hasCentroids = centroidsTotal > 0;
  pipeline.log.info('[link-parcels]', `Parcels with centroids: ${centroidsTotal.toLocaleString()} ${hasCentroids ? '(Strategy 3 enabled)' : '(Strategy 3 disabled)'}`);

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
  let lastPermitNum = '';
  let lastRevisionNum = '';

  while (true) {
    const batch = await pool.query(
      `SELECT p.permit_num, p.revision_num, p.street_num, p.street_name, p.street_type,
              p.latitude, p.longitude
       FROM permits p
       WHERE (${addressFilter}) ${extraFilter}
         AND (p.permit_num, p.revision_num) > ($2, $3)
       ORDER BY p.permit_num, p.revision_num
       LIMIT $1`,
      [pipeline.BATCH_SIZE, lastPermitNum, lastRevisionNum]
    );

    if (batch.rows.length === 0) break;
    const lastRow = batch.rows[batch.rows.length - 1];
    lastPermitNum = lastRow.permit_num;
    lastRevisionNum = lastRow.revision_num;

    // ------------------------------------------------------------------
    // Build normalized arrays for batch CTE matching
    // ------------------------------------------------------------------
    const permitKeys = [];
    for (const permit of batch.rows) {
      permitKeys.push({
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        num: (permit.street_num || '').trim().toUpperCase().replace(/^0+(?=\d)/, ''),
        name: (permit.street_name || '').trim().toUpperCase(),
        type: (permit.street_type || '').trim().toUpperCase(),
        lat: permit.latitude ? safeParseFloat(permit.latitude, 'latitude') : null,
        lng: permit.longitude ? safeParseFloat(permit.longitude, 'longitude') : null,
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
          WHERE (ip.street_type = '' OR pa.street_type_normalized = ip.street_type)
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

    if (spatialPermits.length > 0 && hasPostGIS) {
      // PostGIS fast path: ST_Contains for polygon match, ST_DWithin for centroid fallback
      const spNums = spatialPermits.map(p => p.permit_num);
      const spRevs = spatialPermits.map(p => p.revision_num);
      const spLngs = spatialPermits.map(p => p.lng);
      const spLats = spatialPermits.map(p => p.lat);

      // Step 1: Polygon containment matches
      const polyResult = await pool.query(
        `SELECT v.pn AS permit_num, v.rv AS revision_num, pa.id AS parcel_id
         FROM (SELECT unnest($1::text[]) AS pn, unnest($2::text[]) AS rv,
                      unnest($3::float[]) AS lng, unnest($4::float[]) AS lat) v
         JOIN parcels pa ON pa.geom IS NOT NULL
           AND ST_Contains(pa.geom, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326))`,
        [spNums, spRevs, spLngs, spLats]
      );
      for (const row of polyResult.rows) {
        const key = `${row.permit_num}|${row.revision_num}`;
        spatialMatched.set(key, { parcel_id: row.parcel_id, match_type: 'spatial_polygon', confidence: 0.90 });
        linkedSpatialPolygon++;
        linkedSpatial++;
      }

      // Step 2: Centroid proximity fallback for unmatched permits
      const unmatchedPermits = spatialPermits.filter(p => !spatialMatched.has(`${p.permit_num}|${p.revision_num}`));
      if (unmatchedPermits.length > 0) {
        const umNums = unmatchedPermits.map(p => p.permit_num);
        const umRevs = unmatchedPermits.map(p => p.revision_num);
        const umLngs = unmatchedPermits.map(p => p.lng);
        const umLats = unmatchedPermits.map(p => p.lat);

        const nearResult = await pool.query(
          `SELECT DISTINCT ON (v.pn, v.rv) v.pn AS permit_num, v.rv AS revision_num, pa.id AS parcel_id
           FROM (SELECT unnest($1::text[]) AS pn, unnest($2::text[]) AS rv,
                        unnest($3::float[]) AS lng, unnest($4::float[]) AS lat) v
           JOIN parcels pa ON pa.centroid_lat IS NOT NULL
             AND ST_DWithin(
               ST_SetSRID(ST_MakePoint(pa.centroid_lng::float, pa.centroid_lat::float), 4326)::geography,
               ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography,
               $5
             )
           ORDER BY v.pn, v.rv, ST_Distance(
             ST_SetSRID(ST_MakePoint(pa.centroid_lng::float, pa.centroid_lat::float), 4326)::geography,
             ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
           )`,
          [umNums, umRevs, umLngs, umLats, spatialMaxDistanceM]
        );
        for (const row of nearResult.rows) {
          const key = `${row.permit_num}|${row.revision_num}`;
          spatialMatched.set(key, { parcel_id: row.parcel_id, match_type: 'spatial', confidence: spatialConfidence });
          linkedSpatial++;
        }
      }
    } else if (spatialPermits.length > 0) {
      // JS fallback: BBOX pre-filter + ray-casting + haversine
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
            [safeParseFloat(c.centroid_lng, 'centroid_lng'), safeParseFloat(c.centroid_lat, 'centroid_lat')]
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestId = c.id;
            bestGeometry = c.geometry;
          }
        }

        if (bestId !== null && bestDist <= spatialMaxDistanceM) {
          let parsedGeom = bestGeometry;
          if (typeof bestGeometry === 'string') {
            try { parsedGeom = JSON.parse(bestGeometry); } catch { parsedGeom = null; }
          }
          const isInside = parsedGeom ? pointInGeoJSON([permit.lng, permit.lat], parsedGeom) : false;

          const key = `${permit.permit_num}|${permit.revision_num}`;
          if (isInside) {
            spatialMatched.set(key, { parcel_id: bestId, match_type: 'spatial_polygon', confidence: 0.90 });
            linkedSpatialPolygon++;
          } else {
            spatialMatched.set(key, { parcel_id: bestId, match_type: 'spatial', confidence: spatialConfidence });
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
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamptz)`
        );
        insertValues.push(
          permit.permit_num, permit.revision_num,
          match.parcel_id, match.match_type, match.confidence,
          RUN_AT, // §47 §6.1 — linked_at set on INSERT so first-time links are never NULL
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
          `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence, linked_at)
           VALUES ${insertParams.join(', ')}
           ON CONFLICT (permit_num, revision_num, parcel_id) DO UPDATE SET
             match_type = EXCLUDED.match_type,
             confidence = EXCLUDED.confidence,
             linked_at = EXCLUDED.linked_at
           WHERE permit_parcels.match_type IS DISTINCT FROM EXCLUDED.match_type
              OR permit_parcels.confidence IS DISTINCT FROM EXCLUDED.confidence`,
          insertValues
        );
        dbUpserted += result.rowCount || 0;
      });
    }

    // Ghost cleanup + timestamp update in a single transaction for atomicity
    const allNums = permitKeys.map(p => p.permit_num);
    const allRevs = permitKeys.map(p => p.revision_num);

    await pipeline.withTransaction(pool, async (client) => {
      // For permits WITH matches: delete old parcel links not in the current match set
      // (handles address corrections where a permit now links to a different parcel)
      const matchedParcelIds = new Map(); // "pnum|rev" -> parcel_id
      for (const permit of permitKeys) {
        const key = `${permit.permit_num}|${permit.revision_num}`;
        const match = sqlMatched.get(key) || spatialMatched.get(key);
        if (match) matchedParcelIds.set(key, match.parcel_id);
      }
      // Batch delete stale links for matched permits (O(1) instead of O(matches)).
      if (matchedParcelIds.size > 0) {
        const delNums = [], delRevs = [], keepIds = [];
        for (const [key, parcelId] of matchedParcelIds) {
          const [permitNum, revisionNum] = key.split('|');
          delNums.push(permitNum);
          delRevs.push(revisionNum);
          keepIds.push(parcelId);
        }
        await client.query(
          `DELETE FROM permit_parcels pp
           USING (SELECT unnest($1::text[]) AS permit_num,
                         unnest($2::text[]) AS revision_num,
                         unnest($3::int[])  AS keep_parcel_id) AS v
           WHERE pp.permit_num   = v.permit_num
             AND pp.revision_num = v.revision_num
             AND pp.parcel_id   != v.keep_parcel_id`,
          [delNums, delRevs, keepIds]
        );
      }

      // For permits with ZERO matches: delete all their old links
      const zeroMatchPermits = permitKeys.filter(p => !matchedParcelIds.has(`${p.permit_num}|${p.revision_num}`));
      if (zeroMatchPermits.length > 0) {
        const zNums = zeroMatchPermits.map(p => p.permit_num);
        const zRevs = zeroMatchPermits.map(p => p.revision_num);
        await client.query(
          `DELETE FROM permit_parcels
           WHERE (permit_num, revision_num) IN (SELECT unnest($1::text[]), unnest($2::text[]))`,
          [zNums, zRevs]
        );
      }

      // Mark ALL processed permits as evaluated (regardless of match count)
      await client.query(
        `UPDATE permits SET parcel_linked_at = $3::timestamptz
         WHERE (permit_num, revision_num) IN (SELECT unnest($1::text[]), unnest($2::text[]))`,
        [allNums, allRevs, RUN_AT]
      );
    });

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

  // Cumulative link rate — the meaningful metric: total permits with parcel links / total permits.
  // Run-specific rate (totalMatched / processed) is misleading in steady-state because the
  // unlinked pool is mostly permanently unmatchable permits with bad addresses.
  const cumulativeResult = await pool.query(
    `SELECT
       (SELECT COUNT(DISTINCT (permit_num, revision_num)) FROM permit_parcels) AS linked,
       (SELECT COUNT(*) FROM permits) AS total`
  );
  const cumulativeLinked = safeParsePositiveInt(cumulativeResult.rows[0].linked, 'linked');
  const cumulativeTotal = safeParsePositiveInt(cumulativeResult.rows[0].total, 'total');
  const parcelLinkRate = cumulativeTotal > 0 ? (cumulativeLinked / cumulativeTotal) * 100 : 0;

  const parcelAuditRows = [
    { metric: 'permits_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'tier_1_exact_address', value: linkedExact, threshold: null, status: 'INFO' },
    { metric: 'tier_2_name_only', value: linkedName, threshold: null, status: 'INFO' },
    { metric: 'tier_3_spatial', value: linkedSpatial, threshold: null, status: 'INFO' },
    { metric: 'tier_3_polygon', value: linkedSpatialPolygon, threshold: null, status: 'INFO' },
    { metric: 'run_matched', value: totalMatched, threshold: null, status: 'INFO' },
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
        phase: (process.env.PIPELINE_CHAIN === 'sources') ? 6 : 7,
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
  if (!lockResult.acquired) return;
});
