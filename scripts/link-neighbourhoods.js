#!/usr/bin/env node
/**
 * Link geocoded permits to neighbourhoods via point-in-polygon matching.
 *
 * Uses @turf/boolean-point-in-polygon against 158 neighbourhood polygons.
 * Only processes permits with lat/lng and neighbourhood_id IS NULL.
 *
 * Optimizations:
 *   - BBOX pre-filter: eliminates ~98% of polygon tests per permit
 *   - Marks no-match permits with neighbourhood_id = -1 to prevent re-fetch
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with permits_processed, permits_linked, no_match_count
 *
 * Usage: node scripts/link-neighbourhoods.js
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');
// Turf.js imports are lazy-loaded inside the JS fallback path (else block).
// PostGIS environments don't need Turf installed at all.
let booleanPointInPolygon, turfCentroid, point, polygon, multiPolygon;

/**
 * Compute centroid of a GeoJSON polygon/multipolygon using Turf.js.
 * Returns [lng, lat] or null.
 */
function computeCentroid(geom) {
  if (!geom || !geom.coordinates) return null;
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return null;
  try {
    const feature = { type: 'Feature', geometry: geom, properties: {} };
    const c = turfCentroid(feature);
    return c.geometry.coordinates; // [lng, lat]
  } catch {
    return null;
  }
}

/**
 * Compute bounding box [minLng, minLat, maxLng, maxLat] from a GeoJSON geometry.
 */
function computeBBox(geom) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  function walkCoords(coords) {
    if (typeof coords[0] === 'number') {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      for (const c of coords) walkCoords(c);
    }
  }
  walkCoords(geom.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

pipeline.run('link-neighbourhoods', async (pool) => {
  const startTime = Date.now();

  // Detect PostGIS for fast-path ST_Contains
  const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  const hasPostGIS = pgisCheck.rows.length > 0;

  pipeline.log.info('[link-neighbourhoods]', 'Loading neighbourhood boundaries...');
  const nhoods = await pool.query(
    'SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL'
  );
  pipeline.log.info('[link-neighbourhoods]', `Loaded ${nhoods.rows.length} neighbourhoods with geometry`);

  // turfPolygons built inside the JS fallback else block (Turf not available at module level)

  // Count permits to process
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
  pipeline.log.info('[link-neighbourhoods]', `Permits to link: ${totalPermits.toLocaleString()}`);

  if (totalPermits === 0) {
    pipeline.log.info('[link-neighbourhoods]', 'No permits to link. Done.');
    const chainId = process.env.PIPELINE_CHAIN || null;
    const skipPhase = chainId === 'sources' ? 10 : 8;
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        audit_table: {
          phase: skipPhase,
          name: 'Neighbourhood Linking',
          verdict: 'PASS',
          rows: [
            { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
            { metric: 'reason', value: 'No unlinked permits — all permits already have neighbourhoods', threshold: null, status: 'INFO' },
          ],
        },
      },
    });
    pipeline.emitMeta(
      { "permits": ["permit_num", "revision_num", "latitude", "longitude", "neighbourhood_id"], "neighbourhoods": ["id", "neighbourhood_id", "name", "geometry"], "parcels": ["id", "geometry"] },
      { "permits": ["neighbourhood_id"] }
    );
    return;
  }

  let processed = 0;
  let linked = 0;
  let noMatch = 0;
  let polygonTestsSkipped = 0;

  // PostGIS fast path: single UPDATE using ST_Contains with GiST index
  if (hasPostGIS) {
    pipeline.log.info('[link-neighbourhoods]', 'Using PostGIS ST_Contains (fast path)');
    const result = await pool.query(
      `UPDATE permits p SET neighbourhood_id = n.id
       FROM neighbourhoods n
       WHERE n.geom IS NOT NULL
         AND p.neighbourhood_id IS NULL
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         AND ST_Contains(n.geom, ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), 4326))
       RETURNING p.permit_num`
    );
    linked = result.rows.length;
    processed = linked;

    // Mark unmatched permits with -1 sentinel to prevent infinite re-processing
    const unmatchedResult = await pool.query(
      `UPDATE permits SET neighbourhood_id = -1
       WHERE neighbourhood_id IS NULL
         AND latitude IS NOT NULL AND longitude IS NOT NULL
       RETURNING permit_num`
    );
    noMatch = unmatchedResult.rows.length;
    processed += noMatch;
  } else {
    // JS fallback: batch loop with Turf.js booleanPointInPolygon
    // Lazy-load Turf.js only when PostGIS is unavailable
    booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
    turfCentroid = require('@turf/centroid').default;
    ({ point, polygon, multiPolygon } = require('@turf/helpers'));
    pipeline.log.info('[link-neighbourhoods]', 'PostGIS not available — using Turf.js point-in-polygon');

    // Pre-build Turf polygon objects + bounding boxes (JS fallback only)
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
        pipeline.log.warn('[link-neighbourhoods]', `Invalid geometry for ${n.name} (${n.neighbourhood_id})`);
        continue;
      }

      turfPolygons.push({
        db_id: n.id,
        neighbourhood_id: n.neighbourhood_id,
        name: n.name,
        geometry: turfGeom,
        bounds: computeBBox(geom),
      });
    }
    pipeline.log.info('[link-neighbourhoods]', `Built ${turfPolygons.length} Turf polygons with BBOX`);

  let lastPermitNum = '';
  let lastRevisionNum = '';

  // Step 3: Process in batches using keyset cursor for guaranteed forward progress
  while (true) {
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
         AND (p.permit_num, p.revision_num) > ($2, $3)
       ORDER BY p.permit_num, p.revision_num, pa.id DESC
       LIMIT $1`,
      [pipeline.BATCH_SIZE, lastPermitNum, lastRevisionNum]
    );

    if (batch.rows.length === 0) break;
    const lastRow = batch.rows[batch.rows.length - 1];
    lastPermitNum = lastRow.permit_num;
    lastRevisionNum = lastRow.revision_num;

    // Group by matched neighbourhood for batch updates
    const updates = {}; // db_id -> [{ permit_num, revision_num }]

    for (const permit of batch.rows) {
      let lng, lat;

      if (permit.latitude && permit.longitude) {
        lng = parseFloat(permit.longitude);
        lat = parseFloat(permit.latitude);
      } else if (permit.parcel_geometry) {
        let geom;
        try {
          geom = typeof permit.parcel_geometry === 'string'
            ? JSON.parse(permit.parcel_geometry)
            : permit.parcel_geometry;
        } catch (err) {
          pipeline.log.warn('[link-neighbourhoods]', `Invalid parcel geometry JSON for ${permit.permit_num}`, { error: err.message });
          noMatch++;
          processed++;
          if (!updates[-1]) updates[-1] = [];
          updates[-1].push({ permit_num: permit.permit_num, revision_num: permit.revision_num });
          continue;
        }
        const centroid = computeCentroid(geom);
        if (!centroid) {
          // Mark as -1 to prevent infinite loop re-fetch
          noMatch++;
          processed++;
          if (!updates[-1]) updates[-1] = [];
          updates[-1].push({ permit_num: permit.permit_num, revision_num: permit.revision_num });
          continue;
        }
        lng = centroid[0];
        lat = centroid[1];
      } else {
        // No coords at all — mark as -1
        noMatch++;
        processed++;
        if (!updates[-1]) updates[-1] = [];
        updates[-1].push({ permit_num: permit.permit_num, revision_num: permit.revision_num });
        continue;
      }

      const pt = point([lng, lat]);
      let matched = false;

      for (const nhood of turfPolygons) {
        // BBOX pre-filter: skip polygon test if point is outside bounding box
        const [minX, minY, maxX, maxY] = nhood.bounds;
        if (lng < minX || lng > maxX || lat < minY || lat > maxY) {
          polygonTestsSkipped++;
          continue;
        }

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
        // Mark as -1 so it's not re-queried
        if (!updates[-1]) updates[-1] = [];
        updates[-1].push({
          permit_num: permit.permit_num,
          revision_num: permit.revision_num,
        });
      }
      processed++;
    }

    // Batch update permits using UNNEST array pattern (avoids OR chain meltdown)
    await pipeline.withTransaction(pool, async (client) => {
      for (const [dbId, permits] of Object.entries(updates)) {
        if (permits.length === 0) continue;
        const permitNums = permits.map(p => p.permit_num);
        const revisionNums = permits.map(p => p.revision_num);
        await client.query(
          `UPDATE permits p SET neighbourhood_id = $1
           FROM (SELECT unnest($2::text[]) AS pn, unnest($3::text[]) AS rn) v
           WHERE p.permit_num = v.pn AND p.revision_num = v.rn
             AND p.neighbourhood_id IS DISTINCT FROM $1`,
          [parseInt(dbId, 10), permitNums, revisionNums]
        );
      }
    });

    pipeline.progress('link-neighbourhoods', processed, totalPermits, startTime);
  }
  } // end else (JS fallback)

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[link-neighbourhoods]', 'Linking complete', {
    permits_processed: processed,
    permits_linked: linked,
    no_match: noMatch,
    polygon_tests_skipped: polygonTestsSkipped,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for neighbourhood linking observability
  // Cumulative link rate — run-specific rate is misleading in incremental mode
  const cumulativeResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM permits WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id != -1) AS linked,
       (SELECT COUNT(*) FROM permits) AS total`
  );
  const cumulativeLinked = parseInt(cumulativeResult.rows[0].linked, 10);
  const cumulativeTotal = parseInt(cumulativeResult.rows[0].total, 10);
  const nhoodLinkRate = cumulativeTotal > 0 ? (cumulativeLinked / cumulativeTotal) * 100 : 0;
  const nhoodCount = turfPolygons.length;
  const nhoodAuditRows = [
    { metric: 'permits_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'neighbourhoods_loaded', value: nhoodCount, threshold: '== 158', status: nhoodCount === 158 ? 'PASS' : 'WARN' },
    { metric: 'run_linked', value: linked, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: nhoodLinkRate.toFixed(1) + '%', threshold: '>= 95%', status: nhoodLinkRate >= 95 ? 'PASS' : 'WARN' },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'polygon_tests_skipped', value: polygonTestsSkipped, threshold: null, status: 'INFO' },
  ];
  const nhoodHasWarns = nhoodLinkRate < 95 || nhoodCount !== 158;

  pipeline.emitSummary({
    records_total: processed,
    records_new: 0,
    records_updated: linked + noMatch,
    records_meta: {
      duration_ms: durationMs,
      permits_processed: processed,
      permits_linked: linked,
      no_match_count: noMatch,
      polygon_tests_skipped: polygonTestsSkipped,
      audit_table: {
        phase: (process.env.PIPELINE_CHAIN === 'sources') ? 10 : 8,
        name: 'Neighbourhood Linking',
        verdict: nhoodHasWarns ? 'WARN' : 'PASS',
        rows: nhoodAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "latitude", "longitude", "neighbourhood_id"], "neighbourhoods": ["id", "neighbourhood_id", "name", "geometry"], "parcels": ["id", "geometry"] },
    { "permits": ["neighbourhood_id"] }
  );
});
