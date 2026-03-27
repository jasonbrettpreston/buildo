#!/usr/bin/env node
/**
 * Link parcels to building footprints via point-in-polygon matching.
 *
 * B13 optimization: loads all building footprints into an in-memory grid
 * index (0.003° cells, ~333m) for O(1) candidate lookup per parcel.
 * Eliminates the N+1 per-parcel DB queries that took 48+ min in full mode.
 *
 * For each parcel with a centroid:
 *   1. Grid lookup: find building footprints in same + adjacent grid cells
 *   2. BBOX pre-filter: narrow candidates within ±0.003°
 *   3. Point-in-polygon: test parcel centroid + edge midpoints against each candidate
 *   4. Nearest fallback: haversine distance ≤50m when no polygon match
 *   5. Classify: largest polygon = primary, rest by area thresholds
 *   6. Insert into parcel_buildings junction table
 *
 * Uses @turf/boolean-point-in-polygon for accurate spatial testing.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - Separate matched vs upserted metrics (algorithmic vs DB mutation)
 *   - Parameter limit safeguard: flushes INSERT at 30,000 params (§9.2)
 *   - Full records_meta in PIPELINE_SUMMARY
 *
 * Usage: node scripts/link-massing.js [--full]
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point: turfPoint } = require('@turf/helpers');

const BATCH_SIZE = 500;
const GRID_SIZE = 0.003; // ~333m grid cells (same as old BBOX_OFFSET)
const SHED_THRESHOLD_SQM = 20;
const GARAGE_MAX_SQM = 60;
const NEAREST_MAX_DISTANCE_M = 50;
const PARAM_FLUSH_THRESHOLD = 30000; // §9.2: flush before hitting PG 65,535 limit

/**
 * Reproject a GeoJSON geometry from EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84).
 * Building footprints are stored in Mercator; parcels + centroids are in WGS84.
 * Pure math — no PostGIS or proj4 dependency needed.
 */
const MERCATOR_ORIGIN = 20037508.342789244;
function mercatorToWgs84(x, y) {
  const lng = (x / MERCATOR_ORIGIN) * 180;
  const lat = (Math.atan(Math.exp((y / MERCATOR_ORIGIN) * Math.PI)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

function reprojectRing(ring) {
  return ring.map(coord => mercatorToWgs84(coord[0], coord[1]));
}

function reprojectGeometry(geom) {
  if (!geom || !geom.coordinates) return geom;
  // Detect CRS: WGS84 lng is -180..180, Mercator x is ~±20M
  const sample = geom.type === 'Polygon'
    ? geom.coordinates[0]?.[0]
    : geom.type === 'MultiPolygon'
    ? geom.coordinates[0]?.[0]?.[0]
    : null;
  if (!sample || (Math.abs(sample[0]) < 200 && Math.abs(sample[1]) < 200)) {
    // Already in WGS84 range — no reprojection needed
    return geom;
  }
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map(reprojectRing) };
  }
  if (geom.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geom.coordinates.map(poly => poly.map(reprojectRing)) };
  }
  return geom;
}

function classifyStructure(areaSqm, allAreas) {
  if (allAreas.length <= 1) return 'primary';
  const maxArea = Math.max(...allAreas);
  if (areaSqm >= maxArea) return 'primary';
  if (areaSqm < SHED_THRESHOLD_SQM) return 'shed';
  if (areaSqm <= GARAGE_MAX_SQM) return 'garage';
  return 'other';
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Grid-based spatial index (B13)
// ---------------------------------------------------------------------------

/** Compute grid cell key for a lat/lng coordinate. */
function gridKey(lat, lng) {
  const r = Math.floor(lat / GRID_SIZE);
  const c = Math.floor(lng / GRID_SIZE);
  return `${r}:${c}`;
}

/** Get the 9 grid cell keys (center + 8 neighbours) for a coordinate. */
function gridNeighbourKeys(lat, lng) {
  const r = Math.floor(lat / GRID_SIZE);
  const c = Math.floor(lng / GRID_SIZE);
  const keys = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      keys.push(`${r + dr}:${c + dc}`);
    }
  }
  return keys;
}

/**
 * Flush accumulated INSERT params to DB within a transaction.
 * Returns the number of actual DB writes (rowCount from IS DISTINCT FROM).
 */
async function flushInsertBatch(pool, insertParams, insertValues) {
  if (insertParams.length === 0) return 0;
  let upserted = 0;
  await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, match_type, confidence)
       VALUES ${insertParams.join(', ')}
       ON CONFLICT (parcel_id, building_id) DO UPDATE SET
         is_primary = EXCLUDED.is_primary,
         structure_type = EXCLUDED.structure_type,
         match_type = EXCLUDED.match_type,
         confidence = EXCLUDED.confidence,
         linked_at = NOW()
       WHERE parcel_buildings.is_primary IS DISTINCT FROM EXCLUDED.is_primary
         OR parcel_buildings.structure_type IS DISTINCT FROM EXCLUDED.structure_type
         OR parcel_buildings.match_type IS DISTINCT FROM EXCLUDED.match_type
         OR parcel_buildings.confidence IS DISTINCT FROM EXCLUDED.confidence`,
      insertValues
    );
    upserted = result.rowCount || 0;
  });
  return upserted;
}

pipeline.run('link-massing', async (pool) => {
  const FULL_MODE = pipeline.isFullMode();
  const startTime = Date.now();

  pipeline.log.info('[link-massing]', `Mode: ${FULL_MODE ? 'FULL (rescan all parcels)' : 'INCREMENTAL (unlinked parcels only)'}`);

  // -----------------------------------------------------------------------
  // Phase 1: Load all building footprints into in-memory grid index
  // -----------------------------------------------------------------------
  pipeline.log.info('[link-massing]', 'Loading building footprints into memory...');
  const loadStart = Date.now();
  const bfResult = await pool.query(
    `SELECT id, geometry, footprint_area_sqm, centroid_lat, centroid_lng
     FROM building_footprints
     WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL`
  );
  const totalBuildings = bfResult.rows.length;

  // Build grid index: Map<cellKey, building[]>
  const grid = new Map();
  for (const row of bfResult.rows) {
    const lat = parseFloat(row.centroid_lat);
    const lng = parseFloat(row.centroid_lng);
    const key = gridKey(lat, lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({
      id: row.id,
      geometry: reprojectGeometry(row.geometry),
      footprint_area_sqm: parseFloat(row.footprint_area_sqm) || 0,
      centroid_lat: lat,
      centroid_lng: lng,
    });
  }
  // Free the raw result rows — grid now owns the data
  bfResult.rows.length = 0;

  const loadElapsed = ((Date.now() - loadStart) / 1000).toFixed(1);
  pipeline.log.info('[link-massing]', `Loaded ${totalBuildings.toLocaleString()} buildings into ${grid.size.toLocaleString()} grid cells (${loadElapsed}s)`);

  // -----------------------------------------------------------------------
  // Phase 2: Process parcels in batches
  // -----------------------------------------------------------------------

  // Count parcels to process
  const baseFilter = 'centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL';
  const incrementalFilter = FULL_MODE
    ? ''
    : ' AND NOT EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = parcels.id)';
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM parcels WHERE ${baseFilter}${incrementalFilter}`
  );
  const totalParcels = parseInt(countResult.rows[0].total, 10);
  pipeline.log.info('[link-massing]', `Parcels to process: ${totalParcels.toLocaleString()}`);

  let processed = 0;
  let parcelsLinked = 0;
  let buildingsMatched = 0;  // algorithmic matches (candidates that hit)
  let buildingsUpserted = 0; // actual DB writes (rowCount from IS DISTINCT FROM)
  let centroidInParcelMatches = 0;
  let nearestMatches = 0;
  let noMatch = 0;
  let lastId = 0; // keyset cursor — O(1) per batch via index seek

  while (true) {
    const parcelBatch = await pool.query(
      `SELECT id, centroid_lat, centroid_lng, geometry
       FROM parcels
       WHERE id > $2 AND ${baseFilter}${incrementalFilter}
       ORDER BY id ASC
       LIMIT $1`,
      [BATCH_SIZE, lastId]
    );

    if (parcelBatch.rows.length === 0) break;
    lastId = parcelBatch.rows[parcelBatch.rows.length - 1].id;

    let insertValues = [];
    let insertParams = [];
    let paramIdx = 1;
    let batchParcelsCount = 0;

    for (const parcel of parcelBatch.rows) {
      const lat = parseFloat(parcel.centroid_lat);
      const lng = parseFloat(parcel.centroid_lng);

      // Grid lookup: find candidate buildings in same + adjacent cells
      const candidateKeys = gridNeighbourKeys(lat, lng);
      const candidates = [];
      for (const key of candidateKeys) {
        const cell = grid.get(key);
        if (cell) {
          for (const b of cell) {
            // BBOX pre-filter within ±GRID_SIZE of parcel centroid
            if (Math.abs(b.centroid_lat - lat) <= GRID_SIZE &&
                Math.abs(b.centroid_lng - lng) <= GRID_SIZE) {
              candidates.push(b);
            }
          }
        }
      }

      if (candidates.length === 0) {
        noMatch++;
        processed++;
        continue;
      }

      // Flipped matching: test if BUILDING centroid is inside PARCEL polygon.
      // Parcels contain buildings (land contains structures), not the reverse.
      // One Turf.js test per candidate instead of 5 — faster and more accurate.
      const matchedBuildings = [];
      const parcelGeom = parcel.geometry;
      if (!parcelGeom || !parcelGeom.type || !parcelGeom.coordinates) {
        noMatch++;
        processed++;
        continue;
      }

      for (const building of candidates) {
        const buildingPt = turfPoint([building.centroid_lng, building.centroid_lat]);
        let isInside = false;

        if (parcelGeom.type === 'Polygon') {
          try {
            isInside = booleanPointInPolygon(buildingPt, {
              type: 'Feature',
              geometry: parcelGeom,
              properties: {},
            });
          } catch {
            // Invalid geometry — skip
          }
        } else if (parcelGeom.type === 'MultiPolygon') {
          for (const polyCoords of parcelGeom.coordinates) {
            try {
              isInside = booleanPointInPolygon(buildingPt, {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: polyCoords },
                properties: {},
              });
              if (isInside) break;
            } catch {
              // Invalid sub-polygon — skip
            }
          }
        }

        if (isInside) {
          matchedBuildings.push({
            building_id: building.id,
            footprint_area_sqm: building.footprint_area_sqm,
            match_type: 'centroid_in_parcel',
            confidence: 0.95,
          });
        }
      }

      // Nearest-building fallback (≤50m by haversine) when no polygon match
      if (matchedBuildings.length === 0) {
        let nearestId = null;
        let nearestDist = Infinity;
        let nearestArea = 0;

        for (const building of candidates) {
          const dist = haversineDistance(
            [lng, lat],
            [building.centroid_lng, building.centroid_lat]
          );
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = building.id;
            nearestArea = building.footprint_area_sqm;
          }
        }

        if (nearestId !== null && nearestDist <= NEAREST_MAX_DISTANCE_M) {
          matchedBuildings.push({
            building_id: nearestId,
            footprint_area_sqm: nearestArea,
            match_type: 'nearest',
            confidence: 0.60,
          });
          nearestMatches++;
        }
      }

      if (matchedBuildings.length === 0) {
        noMatch++;
        processed++;
        continue;
      }

      // Track match type stats
      for (const mb of matchedBuildings) {
        if (mb.match_type === 'centroid_in_parcel') centroidInParcelMatches++;
      }

      // Classify structures
      const allAreas = matchedBuildings.map(b => b.footprint_area_sqm);
      for (const mb of matchedBuildings) {
        const structureType = classifyStructure(mb.footprint_area_sqm, allAreas);
        const isPrimary = structureType === 'primary';

        insertParams.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        insertValues.push(
          parcel.id, mb.building_id, isPrimary, structureType, mb.match_type, mb.confidence
        );
        buildingsMatched++;
      }

      batchParcelsCount++;
      processed++;

      // §9.2 safeguard: flush if approaching PG 65,535 param limit
      if (insertValues.length >= PARAM_FLUSH_THRESHOLD) {
        buildingsUpserted += await flushInsertBatch(pool, insertParams, insertValues);
        parcelsLinked += batchParcelsCount;
        insertParams = [];
        insertValues = [];
        paramIdx = 1;
        batchParcelsCount = 0;
      }
    }

    // Flush remaining batch
    if (insertParams.length > 0) {
      buildingsUpserted += await flushInsertBatch(pool, insertParams, insertValues);
      parcelsLinked += batchParcelsCount;
    }

    if (processed % 10000 === 0 || processed >= totalParcels) {
      pipeline.progress('link-massing', processed, totalParcels, startTime);
    }
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[link-massing]', 'Linking complete', {
    parcels_processed: processed,
    parcels_linked: parcelsLinked,
    buildings_matched: buildingsMatched,
    buildings_upserted: buildingsUpserted,
    centroid_in_parcel: centroidInParcelMatches,
    nearest: nearestMatches,
    no_match: noMatch,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for massing linking observability
  const massingLinkRate = processed > 0 ? (parcelsLinked / processed) * 100 : 0;
  const massingHasFails = totalBuildings === 0 || (processed > 0 && parcelsLinked === 0);
  const massingHasWarns = massingLinkRate < 50;
  const massingAuditRows = [
    { metric: 'buildings_indexed', value: totalBuildings, threshold: '> 0', status: totalBuildings > 0 ? 'PASS' : 'FAIL' },
    { metric: 'grid_cells', value: grid.size, threshold: null, status: 'INFO' },
    { metric: 'parcels_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'parcels_linked', value: parcelsLinked, threshold: '> 0', status: (processed > 0 && parcelsLinked === 0) ? 'FAIL' : 'PASS' },
    { metric: 'match_centroid_in_parcel', value: centroidInParcelMatches, threshold: null, status: 'INFO' },
    { metric: 'match_nearest_fallback', value: nearestMatches, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: massingLinkRate.toFixed(1) + '%', threshold: '>= 50%', status: massingLinkRate >= 50 ? 'PASS' : 'WARN' },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'db_upserted', value: buildingsUpserted, threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: processed,
    records_new: 0,
    records_updated: buildingsUpserted,
    records_meta: {
      duration_ms: durationMs,
      parcels_processed: processed,
      parcels_linked: parcelsLinked,
      buildings_matched: buildingsMatched,
      buildings_upserted: buildingsUpserted,
      matches_centroid_in_parcel: centroidInParcelMatches,
      matches_nearest: nearestMatches,
      no_match_count: noMatch,
      audit_table: {
        phase: (process.env.PIPELINE_CHAIN === 'sources') ? 8 : 9,
        name: 'Building Footprint Linking',
        verdict: massingHasFails ? 'FAIL' : massingHasWarns ? 'WARN' : 'PASS',
        rows: massingAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "parcels": ["id", "centroid_lat", "centroid_lng", "geometry"], "building_footprints": ["id", "geometry", "footprint_area_sqm", "centroid_lat", "centroid_lng"] },
    { "parcel_buildings": ["parcel_id", "building_id", "is_primary", "structure_type", "match_type", "confidence", "linked_at"] }
  );
});
