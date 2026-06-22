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
 * SPEC LINK: docs/specs/01-pipeline/56_source_massing.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
// Turf.js imports are lazy-loaded inside the JS fallback path (else block).
// PostGIS environments don't need Turf installed at all.
let booleanPointInPolygon, turfPoint;

const ADVISORY_LOCK_ID = 91;

const LOGIC_VARS_SCHEMA = z.object({
  massing_shed_threshold_sqm:    z.coerce.number().finite().positive(),
  massing_garage_max_sqm:        z.coerce.number().finite().positive(),
  massing_nearest_max_distance_m: z.coerce.number().finite().positive(),
}).passthrough();

const BATCH_SIZE = 500;
const GRID_SIZE = 0.003; // ~333m grid cells (same as old BBOX_OFFSET)
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

function classifyStructure(areaSqm, allAreas, shedThreshold, garageMax) {
  if (allAreas.length <= 1) return 'primary';
  const maxArea = Math.max(...allAreas);
  if (areaSqm >= maxArea) return 'primary';
  if (areaSqm < shedThreshold) return 'shed';
  if (areaSqm <= garageMax) return 'garage';
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
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, match_type, confidence, linked_at)
       VALUES ${insertParams.join(', ')}
       ON CONFLICT (parcel_id, building_id) DO UPDATE SET
         is_primary = EXCLUDED.is_primary,
         structure_type = EXCLUDED.structure_type,
         match_type = EXCLUDED.match_type,
         confidence = EXCLUDED.confidence,
         linked_at = EXCLUDED.linked_at
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
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const { logicVars } = await loadMarketplaceConfigs(pool, 'link-massing');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-massing');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const shedThresholdSqm    = logicVars.massing_shed_threshold_sqm;
  const garageMaxSqm        = logicVars.massing_garage_max_sqm;
  const nearestMaxDistanceM = logicVars.massing_nearest_max_distance_m;

  const FULL_MODE = pipeline.isFullMode();
  const startTime = Date.now();

  // Detect PostGIS fast path: requires BOTH the PostGIS extension AND the
  // building_footprints.geom column (added by migration 065/098). Migration 065
  // conditionally skips the column if PostGIS was not installed at migration time,
  // so we must check column existence independently to avoid a crash.
  const pgisCheck = await pool.query(`
    SELECT
      EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS has_ext,
      EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'building_footprints' AND column_name = 'geom'
      ) AS has_geom_col
  `);
  const { has_ext, has_geom_col } = pgisCheck.rows[0];
  const hasPostGIS = has_ext === true && has_geom_col === true;
  if (has_ext && !has_geom_col) {
    pipeline.log.warn('[link-massing]',
      'PostGIS installed but building_footprints.geom missing — ' +
      'falling back to JS path. Apply migration 098 to restore fast path.');
  }

  pipeline.log.info('[link-massing]', `Mode: ${FULL_MODE ? 'FULL (rescan all parcels)' : 'INCREMENTAL (unlinked parcels only)'}${hasPostGIS ? ' [PostGIS]' : ' [JS fallback]'}`);

  // -----------------------------------------------------------------------
  // PostGIS fast path: ST_Contains with GiST index (B10/B11/B12)
  // Bypasses entire in-memory grid + streamQuery + Turf.js loop.
  // Single SQL query per batch using native spatial index.
  // -----------------------------------------------------------------------
  let processed = 0;
  let containsMatches = 0;
  let nearestMatches = 0;
  let noMatch = 0;
  let buildingsUpserted = 0;
  let totalBuildings = 0;
  let parcelsLinked = 0;
  let buildingsMatched = 0;
  let centroidInParcelMatches = 0;
  const grid = new Map(); // empty unless JS fallback runs

  if (hasPostGIS) {
    pipeline.log.info('[link-massing]', 'Using PostGIS building-centroid-in-parcel (fast path — no in-memory grid)');

    // WF3 2026-06-22: the new predicate joins parcels.geom (the OLD path used the centroid_lat/lng
    // columns only). A GiST index on parcels.geom is required or the per-batch join degrades to a
    // 486K seq-scan. Mirror enrich-parcels.assertPreconditions — HALT with an actionable error.
    const parcelGistCheck = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'parcels' AND indexdef ILIKE '%gist%' AND indexdef ILIKE '%geom%' LIMIT 1`
    );
    if (parcelGistCheck.rows.length === 0) {
      throw new Error('[link-massing] no GiST index on parcels.geom (expected idx_parcels_geom_gist, migration 039) — refusing the building-centroid-in-parcel join (would seq-scan 486K parcels)');
    }

    const baseFilter = 'centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL';
    const incrementalFilter = FULL_MODE
      ? ''
      : ' AND NOT EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = parcels.id)';

    // FULL-mode stale-link cleanup (parity with the JS path lines below). The PostGIS path
    // historically lacked this — a full re-link left ghost rows for parcels that matched under the
    // OLD (parcel-centroid-in-building) predicate but not the new one. ONE DELETE, before the loop,
    // in a transaction, scoped identically to the parcels being re-evaluated.
    if (FULL_MODE) {
      const ghostsRemoved = await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(
          `DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE ${baseFilter})`
        );
        return result.rowCount || 0;
      });
      if (ghostsRemoved > 0) {
        pipeline.log.info('[link-massing]', `Full mode: cleared ${ghostsRemoved.toLocaleString()} existing links for re-evaluation`);
      }
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM parcels WHERE ${baseFilter}${incrementalFilter}`
    );
    const totalParcels = safeParsePositiveInt(countResult.rows[0].total, 'total');
    pipeline.log.info('[link-massing]', `Parcels to process: ${totalParcels.toLocaleString()}`);

    // Nearest-fallback bbox prefilter span in DEGREES (≥ the metre distance at Toronto's latitude;
    // /78000 over-covers E-W per the enrich-parcels precedent) — MANDATORY before the geography
    // ST_DWithin/ST_Distance or it runs a nested-loop over all footprints (tasks/lessons.md).
    const nearestDegSpan = nearestMaxDistanceM / 78000.0;

    // Process in keyset-paginated batches
    let lastId = 0;
    while (true) {
      const parcelBatch = await pool.query(
        `SELECT id FROM parcels
         WHERE ${baseFilter}${incrementalFilter} AND id > $2
         ORDER BY id ASC
         LIMIT $1`,
        [pipeline.BATCH_SIZE, lastId]
      );
      if (parcelBatch.rows.length === 0) break;
      lastId = parcelBatch.rows[parcelBatch.rows.length - 1].id;

      const parcelIds = parcelBatch.rows.map(p => p.id);

      // Building-centroid-in-parcel (WF3 fix): the building's centre-of-mass sits on the lot.
      // bf.geom && p.geom is the GiST bbox prefilter; ST_Contains(p.geom, building_centroid) is exact.
      // Everything stays SRID 4326 (parcels.geom + building_footprints.geom both 4326). p.geom IS NOT
      // NULL guards the rare ungeometried parcel (ST_Contains(NULL,…) → NULL → silently dropped anyway).
      const matchResult = await pool.query(
        `SELECT p.id AS parcel_id, bf.id AS building_id, bf.footprint_area_sqm
         FROM parcels p
         JOIN building_footprints bf
           ON bf.geom && p.geom
           AND ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(bf.centroid_lng, bf.centroid_lat), 4326))
         WHERE p.id = ANY($1::int[]) AND p.geom IS NOT NULL`,
        [parcelIds]
      );

      const matchedParcelIds = new Set(matchResult.rows.map(r => r.parcel_id));

      // Upsert matched parcel-building links using flushInsertBatch.
      // Group by parcel for deterministic primary assignment (mirrors JS fallback path).
      if (matchResult.rows.length > 0) {
        const insertParams = [];
        const insertValues = [];
        let paramIdx = 1;

        const byParcel = new Map();
        for (const r of matchResult.rows) {
          const pid = r.parcel_id;
          if (!byParcel.has(pid)) byParcel.set(pid, []);
          byParcel.get(pid).push({
            building_id: r.building_id,
            footprint_area_sqm: r.footprint_area_sqm != null ? safeParseFloat(r.footprint_area_sqm, 'footprint_area_sqm') : 0,
          });
        }

        // Clear is_primary for affected parcels before upserting — prevents partial unique index
        // violation (mig 081 idx_parcel_buildings_one_primary) when primary shifts to a different building.
        const parcelIdArray = [...byParcel.keys()];
        await pool.query(
          `UPDATE parcel_buildings SET is_primary = false WHERE parcel_id = ANY($1) AND is_primary = true`,
          [parcelIdArray]
        );

        for (const [parcelId, buildings] of byParcel) {
          // Sort by area DESC, building_id ASC for deterministic primary assignment
          // (matches migration 081 repair ORDER BY and JS fallback tie-breaker)
          buildings.sort((a, b) => b.footprint_area_sqm - a.footprint_area_sqm || a.building_id - b.building_id);
          const allAreas = buildings.map(b => b.footprint_area_sqm);
          const primaryBuildingId = buildings[0].building_id;

          for (const b of buildings) {
            let structureType = classifyStructure(b.footprint_area_sqm, allAreas, shedThresholdSqm, garageMaxSqm);
            if (structureType === 'primary' && b.building_id !== primaryBuildingId) {
              structureType = b.footprint_area_sqm <= garageMaxSqm ? 'garage' : 'other';
            }
            const isPrimary = structureType === 'primary';

            insertParams.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamptz)`);
            insertValues.push(parcelId, b.building_id, isPrimary, structureType, 'centroid_in_parcel', 0.95, RUN_AT); // §47 §6.1 — linked_at on INSERT
            buildingsMatched++;
            centroidInParcelMatches++;
          }
        }

        buildingsUpserted += await flushInsertBatch(pool, insertParams, insertValues);
        containsMatches += matchResult.rows.length;
        parcelsLinked += byParcel.size;
      }

      // Nearest-fallback (parity with the JS path): parcels with no building-centroid inside get the
      // single nearest footprint within massing_nearest_max_distance_m. DISTINCT ON picks the nearest;
      // bf.geom && ST_Expand(p.geom, deg) prefilters on the GiST index before the geography distance.
      const unmatchedIds = parcelIds.filter(id => !matchedParcelIds.has(id));
      if (unmatchedIds.length > 0) {
        const nearestResult = await pool.query(
          `SELECT DISTINCT ON (p.id) p.id AS parcel_id, bf.id AS building_id, bf.footprint_area_sqm
           FROM parcels p
           JOIN building_footprints bf
             ON bf.geom && ST_Expand(p.geom, $2)
             AND ST_DWithin(p.geom::geography, bf.geom::geography, $3)
           WHERE p.id = ANY($1::int[]) AND p.geom IS NOT NULL
           ORDER BY p.id, ST_Distance(p.geom::geography, bf.geom::geography) ASC`,
          [unmatchedIds, nearestDegSpan, nearestMaxDistanceM]
        );
        if (nearestResult.rows.length > 0) {
          const nInsertParams = [];
          const nInsertValues = [];
          let nIdx = 1;
          for (const r of nearestResult.rows) {
            // One nearest building per parcel → always primary (these parcels had no centroid match,
            // and FULL pre-clear / incremental NOT-EXISTS means no pre-existing primary to conflict).
            nInsertParams.push(`($${nIdx++}, $${nIdx++}, $${nIdx++}, $${nIdx++}, $${nIdx++}, $${nIdx++}, $${nIdx++}::timestamptz)`);
            nInsertValues.push(r.parcel_id, r.building_id, true, 'primary', 'nearest', 0.60, RUN_AT);
            buildingsMatched++;
            nearestMatches++;
          }
          buildingsUpserted += await flushInsertBatch(pool, nInsertParams, nInsertValues);
          parcelsLinked += nearestResult.rows.length;
          for (const r of nearestResult.rows) matchedParcelIds.add(r.parcel_id);
        }
      }

      processed += parcelBatch.rows.length;
      noMatch += parcelBatch.rows.filter(p => !matchedParcelIds.has(p.id)).length;

      if (processed % 10000 === 0 || processed >= totalParcels) {
        pipeline.progress('link-massing', processed, totalParcels, startTime);
      }
    }
  } else {

  // -----------------------------------------------------------------------
  // Phase 1 (JS fallback): Load all building footprints into in-memory grid index
  // -----------------------------------------------------------------------
  // Lazy-load Turf.js only when PostGIS is unavailable
  booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
  ({ point: turfPoint } = require('@turf/helpers'));
  pipeline.log.info('[link-massing]', 'Streaming building footprints into grid index...');
  const loadStart = Date.now();

  // Build grid index: Map<cellKey, building[]>
  // Uses streamQuery to avoid loading the entire building_footprints table into V8 memory.
  // The grid Map itself must be in memory (it's the spatial index), but the raw pg result
  // buffer is freed row-by-row instead of holding all rows simultaneously.
  // NOTE: grid and totalBuildings declared in outer scope (line 172/176) — no re-declaration here.
  for await (const row of pipeline.streamQuery(pool,
    `SELECT id, geometry, footprint_area_sqm, centroid_lat, centroid_lng
     FROM building_footprints
     WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL`
  )) {
    const lat = safeParseFloat(row.centroid_lat, 'centroid_lat');
    const lng = safeParseFloat(row.centroid_lng, 'centroid_lng');
    const key = gridKey(lat, lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({
      id: row.id,
      geometry: reprojectGeometry(row.geometry),
      footprint_area_sqm: row.footprint_area_sqm != null ? safeParseFloat(row.footprint_area_sqm, 'footprint_area_sqm') : 0,
      centroid_lat: lat,
      centroid_lng: lng,
    });
    totalBuildings++;
  }

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
  const totalParcels = safeParsePositiveInt(countResult.rows[0].total, 'total');
  pipeline.log.info('[link-massing]', `Parcels to process: ${totalParcels.toLocaleString()}`);

  // In FULL_MODE, clean stale parcel_buildings links before re-evaluation.
  // Without this, parcels whose boundaries were redrawn accumulate ghost links
  // to buildings they no longer intersect.
  if (FULL_MODE) {
    const ghostsRemoved = await pipeline.withTransaction(pool, async (client) => {
      const result = await client.query(
        'DELETE FROM parcel_buildings WHERE parcel_id IN (SELECT id FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL)'
      );
      return result.rowCount || 0;
    });
    if (ghostsRemoved > 0) {
      pipeline.log.info('[link-massing]', `Full mode: cleared ${ghostsRemoved.toLocaleString()} existing links for re-evaluation`);
    }
  }

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
      const lat = safeParseFloat(parcel.centroid_lat, 'centroid_lat');
      const lng = safeParseFloat(parcel.centroid_lng, 'centroid_lng');

      // Compute parcel envelope to dynamically scale BBOX for large parcels
      // (airports, campuses, industrial complexes can exceed the default 333m grid)
      let searchRadius = GRID_SIZE;
      const parcelGeomRaw = parcel.geometry;
      if (parcelGeomRaw && parcelGeomRaw.coordinates) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        const rings = parcelGeomRaw.type === 'Polygon'
          ? [parcelGeomRaw.coordinates[0]]
          : parcelGeomRaw.type === 'MultiPolygon'
          ? parcelGeomRaw.coordinates.map(p => p[0])
          : [];
        for (const ring of rings) {
          if (!ring) continue;
          for (const coord of ring) {
            if (coord[1] < minLat) minLat = coord[1];
            if (coord[1] > maxLat) maxLat = coord[1];
            if (coord[0] < minLng) minLng = coord[0];
            if (coord[0] > maxLng) maxLng = coord[0];
          }
        }
        if (minLat !== Infinity) {
          const halfHeight = (maxLat - minLat) / 2;
          const halfWidth = (maxLng - minLng) / 2;
          const halfDiagonal = Math.sqrt(halfHeight ** 2 + halfWidth ** 2);
          searchRadius = Math.max(GRID_SIZE, halfDiagonal + GRID_SIZE * 0.5);
        }
      }

      // Grid lookup: find candidate buildings in same + adjacent cells
      // For large parcels, expand grid search to cover the full envelope
      const gridSpan = Math.ceil(searchRadius / GRID_SIZE);
      const candidates = [];
      const r0 = Math.floor(lat / GRID_SIZE);
      const c0 = Math.floor(lng / GRID_SIZE);
      for (let dr = -gridSpan; dr <= gridSpan; dr++) {
        for (let dc = -gridSpan; dc <= gridSpan; dc++) {
          const cell = grid.get(`${r0 + dr}:${c0 + dc}`);
          if (cell) {
            for (const b of cell) {
              if (Math.abs(b.centroid_lat - lat) <= searchRadius &&
                  Math.abs(b.centroid_lng - lng) <= searchRadius) {
                candidates.push(b);
              }
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

      const parcelFeature = { type: 'Feature', geometry: parcelGeom, properties: {} };

      for (const building of candidates) {
        const buildingPt = turfPoint([building.centroid_lng, building.centroid_lat]);
        let isInside = false;

        try {
          // booleanPointInPolygon natively supports both Polygon and MultiPolygon
          isInside = booleanPointInPolygon(buildingPt, parcelFeature);
        } catch (err) {
          pipeline.log.warn('[link-massing]', `Invalid geometry in PiP test`, { parcel_id: parcel.id, building_id: building.id, error: err.message });
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

        if (nearestId !== null && nearestDist <= nearestMaxDistanceM) {
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

      // Classify structures — deterministic primary assignment
      // Sort by area DESC, building_id ASC for deterministic tie-breaker
      // (matches migration 081 repair ORDER BY and PostGIS path)
      matchedBuildings.sort((a, b) => b.footprint_area_sqm - a.footprint_area_sqm || a.building_id - b.building_id);
      const allAreas = matchedBuildings.map(b => b.footprint_area_sqm);
      const maxArea = Math.max(...allAreas);
      const primaryBuildingId = matchedBuildings[0].building_id;
      for (const mb of matchedBuildings) {
        let structureType = classifyStructure(mb.footprint_area_sqm, allAreas, shedThresholdSqm, garageMaxSqm);
        // Enforce single primary: only the first building at max area gets 'primary'
        if (structureType === 'primary' && mb.building_id !== primaryBuildingId) {
          structureType = mb.footprint_area_sqm <= garageMaxSqm ? 'garage' : 'other';
        }
        const isPrimary = structureType === 'primary';

        insertParams.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamptz)`
        );
        insertValues.push(
          parcel.id, mb.building_id, isPrimary, structureType, mb.match_type, mb.confidence,
          RUN_AT, // §47 §6.1 — linked_at on INSERT so first-time links are never NULL
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
  } // end else (JS fallback)

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
  // Cumulative link rate — run-specific rate is misleading in incremental mode where
  // the unlinked pool is permanently unmatchable parcels (no nearby buildings).
  const cumulativeResult = await pool.query(
    `SELECT
       (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) AS linked,
       (SELECT COUNT(*) FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL) AS total`
  );
  const cumulativeLinked = safeParsePositiveInt(cumulativeResult.rows[0].linked, 'linked');
  const cumulativeTotal = safeParsePositiveInt(cumulativeResult.rows[0].total, 'total');
  const massingLinkRate = cumulativeTotal > 0 ? (cumulativeLinked / cumulativeTotal) * 100 : 0;
  // WF3 2026-06-10: row-derived verdict (Spec 48 — derive from row statuses, not a parallel
  // `hasFails ?` boolean). The link_rate row FAILs on the PostGIS fast path when it ran over a
  // non-empty parcel set yet matched < floor — the signal that bf.geom is broken. A broken-geom
  // run previously hid as WARN because the old `!hasPostGIS && totalBuildings===0` gate cannot
  // fire on the PostGIS path (hasPostGIS is true). processed>0 guard avoids a false-FAIL on an
  // empty-parcels run.
  const linkRateStatus = massingLinkRate >= 50
    ? 'PASS'
    : (hasPostGIS && processed > 0 ? 'FAIL' : 'WARN');
  const massingAuditRows = [
    { metric: 'buildings_indexed', value: totalBuildings, threshold: hasPostGIS ? null : '> 0', status: hasPostGIS ? 'INFO' : (totalBuildings > 0 ? 'PASS' : 'FAIL') },
    { metric: 'grid_cells', value: hasPostGIS ? 'N/A (PostGIS)' : grid.size, threshold: null, status: 'INFO' },
    { metric: 'parcels_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'run_matched', value: parcelsLinked, threshold: null, status: 'INFO' },
    { metric: 'match_centroid_in_parcel', value: centroidInParcelMatches, threshold: null, status: 'INFO' },
    { metric: 'match_nearest_fallback', value: nearestMatches, threshold: null, status: 'INFO' },
    { metric: 'link_rate', value: massingLinkRate.toFixed(1) + '%', threshold: '>= 50%', status: linkRateStatus },
    { metric: 'no_match', value: noMatch, threshold: null, status: 'INFO' },
    { metric: 'parcel_buildings_written', value: buildingsUpserted, threshold: null, status: 'INFO' },
  ];
  const massingVerdict = massingAuditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : massingAuditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  pipeline.emitSummary({
    records_total: processed,
    records_new: 0,
    records_updated: parcelsLinked,
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
        verdict: massingVerdict,
        rows: massingAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "parcels": ["id", "centroid_lat", "centroid_lng", "geometry"], "building_footprints": ["id", "geometry", "footprint_area_sqm", "centroid_lat", "centroid_lng"] },
    { "parcel_buildings": ["parcel_id", "building_id", "is_primary", "structure_type", "match_type", "confidence", "linked_at"] }
  );
  });
  if (!lockResult.acquired) return;
});
