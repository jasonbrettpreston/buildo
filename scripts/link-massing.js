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
 * Usage: node scripts/link-massing.js [--full]
 */
const pipeline = require('./lib/pipeline');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point: turfPoint } = require('@turf/helpers');

const BATCH_SIZE = 500;
const GRID_SIZE = 0.003; // ~333m grid cells (same as old BBOX_OFFSET)
const SHED_THRESHOLD_SQM = 20;
const GARAGE_MAX_SQM = 60;
const NEAREST_MAX_DISTANCE_M = 50;

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

/**
 * Get 5 test points for multi-point matching: centroid + 4 bounding box midpoints.
 * parcel must have { centroid_lat, centroid_lng, geometry }.
 */
function getTestPoints(parcel) {
  const lat = parseFloat(parcel.centroid_lat);
  const lng = parseFloat(parcel.centroid_lng);
  const points = [{ lng, lat, label: 'centroid' }];

  const geom = parcel.geometry;
  if (geom && geom.coordinates) {
    let ring = null;
    if (geom.type === 'Polygon' && geom.coordinates.length > 0) {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon' && geom.coordinates.length > 0 && geom.coordinates[0].length > 0) {
      ring = geom.coordinates[0][0];
    }
    if (ring && ring.length >= 4) {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const coord of ring) {
        if (coord[0] < minLng) minLng = coord[0];
        if (coord[0] > maxLng) maxLng = coord[0];
        if (coord[1] < minLat) minLat = coord[1];
        if (coord[1] > maxLat) maxLat = coord[1];
      }
      const midLng = (minLng + maxLng) / 2;
      const midLat = (minLat + maxLat) / 2;
      points.push({ lng: midLng, lat: maxLat, label: 'top' });
      points.push({ lng: midLng, lat: minLat, label: 'bottom' });
      points.push({ lng: minLng, lat: midLat, label: 'left' });
      points.push({ lng: maxLng, lat: midLat, label: 'right' });
    }
  }

  return points;
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

pipeline.run('link-massing', async (pool) => {
  const FULL_MODE = pipeline.isFullMode();

  console.log('=== Buildo Parcel-Building Linker ===');
  console.log(`Mode: ${FULL_MODE ? 'FULL (rescan all parcels)' : 'INCREMENTAL (unlinked parcels only)'}`);
  console.log('');

  // -----------------------------------------------------------------------
  // Phase 1: Load all building footprints into in-memory grid index
  // -----------------------------------------------------------------------
  console.log('Loading building footprints into memory...');
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
      geometry: row.geometry,
      footprint_area_sqm: parseFloat(row.footprint_area_sqm) || 0,
      centroid_lat: lat,
      centroid_lng: lng,
    });
  }
  // Free the raw result rows — grid now owns the data
  bfResult.rows.length = 0;

  const loadElapsed = ((Date.now() - loadStart) / 1000).toFixed(1);
  console.log(`  Loaded ${totalBuildings.toLocaleString()} buildings into ${grid.size.toLocaleString()} grid cells (${loadElapsed}s)`);

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
  console.log(`Parcels to process:     ${totalParcels.toLocaleString()}`);

  // Count already linked
  const linkedCount = await pool.query('SELECT COUNT(*) as total FROM parcel_buildings');
  console.log(`Already linked:         ${parseInt(linkedCount.rows[0].total, 10).toLocaleString()}`);
  console.log('');

  const startTime = Date.now();
  let processed = 0;
  let parcelsLinked = 0;
  let buildingsLinked = 0;
  let polygonMatches = 0;
  let multipointMatches = 0;
  let nearestMatches = 0;
  let noMatch = 0;
  let offset = 0;

  while (offset < totalParcels) {
    const parcelBatch = await pool.query(
      `SELECT id, centroid_lat, centroid_lng, geometry
       FROM parcels
       WHERE ${baseFilter}${incrementalFilter}
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (parcelBatch.rows.length === 0) break;

    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;
    let batchBuildingsCount = 0;
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

      // Multi-point matching: test centroid + 4 bbox midpoints against each building
      const testPoints = getTestPoints(parcel);
      const matchedBuildings = [];

      for (const building of candidates) {
        const geom = building.geometry;
        if (!geom || !geom.type || !geom.coordinates) continue;

        let hitLabel = null;

        for (const tp of testPoints) {
          const testPt = turfPoint([tp.lng, tp.lat]);
          let isInside = false;

          if (geom.type === 'Polygon') {
            try {
              isInside = booleanPointInPolygon(testPt, {
                type: 'Feature',
                geometry: geom,
                properties: {},
              });
            } catch {
              // Invalid geometry — skip
            }
          } else if (geom.type === 'MultiPolygon') {
            for (const polyCoords of geom.coordinates) {
              try {
                isInside = booleanPointInPolygon(testPt, {
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
            hitLabel = tp.label;
            break;
          }
        }

        if (hitLabel) {
          matchedBuildings.push({
            building_id: building.id,
            footprint_area_sqm: building.footprint_area_sqm,
            match_type: hitLabel === 'centroid' ? 'polygon' : 'multipoint',
            confidence: hitLabel === 'centroid' ? 0.90 : 0.80,
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
        if (mb.match_type === 'polygon') polygonMatches++;
        else if (mb.match_type === 'multipoint') multipointMatches++;
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
        batchBuildingsCount++;
      }

      batchParcelsCount++;
      processed++;
    }

    // Batch insert within a transaction
    if (insertParams.length > 0) {
      await pipeline.withTransaction(pool, async (client) => {
        await client.query(
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
        buildingsLinked += batchBuildingsCount;
        parcelsLinked += batchParcelsCount;
      });
    }

    offset += BATCH_SIZE;

    if (processed % 10000 === 0 || processed >= totalParcels) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalParcels) * 100).toFixed(1);
      console.log(`  ${processed.toLocaleString()} / ${totalParcels.toLocaleString()} (${pct}%) - linked: ${parcelsLinked.toLocaleString()} parcels, ${buildingsLinked.toLocaleString()} buildings - ${elapsed}s`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Linking Complete ===');
  console.log(`Parcels processed:      ${processed.toLocaleString()}`);
  console.log(`Parcels linked:         ${parcelsLinked.toLocaleString()} (${((parcelsLinked / Math.max(processed, 1)) * 100).toFixed(1)}%)`);
  console.log(`Buildings linked:       ${buildingsLinked.toLocaleString()}`);
  console.log(`  Polygon (centroid):   ${polygonMatches.toLocaleString()} (confidence 0.90)`);
  console.log(`  Multipoint (edge):    ${multipointMatches.toLocaleString()} (confidence 0.80)`);
  console.log(`  Nearest (≤${NEAREST_MAX_DISTANCE_M}m):     ${nearestMatches.toLocaleString()} (confidence 0.60)`);
  console.log(`No match found:         ${noMatch.toLocaleString()}`);
  console.log(`Duration:               ${elapsed}s`);

  pipeline.emitSummary({ records_total: parcelsLinked, records_new: 0, records_updated: parcelsLinked });
  pipeline.emitMeta(
    { "parcels": ["id", "centroid_lat", "centroid_lng", "geometry"], "building_footprints": ["id", "geometry", "footprint_area_sqm", "centroid_lat", "centroid_lng"] },
    { "parcel_buildings": ["parcel_id", "building_id", "is_primary", "structure_type", "match_type", "confidence", "linked_at"] }
  );
});
