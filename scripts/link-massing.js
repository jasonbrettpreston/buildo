#!/usr/bin/env node
/**
 * Link parcels to building footprints via point-in-polygon matching.
 *
 * For each parcel with a centroid:
 *   1. BBOX pre-filter: find building footprints within ±0.003° (~333m)
 *   2. Point-in-polygon: test if parcel centroid falls inside each building polygon
 *   3. Classify: largest polygon = primary, rest by area thresholds
 *   4. Insert into parcel_buildings junction table
 *
 * Uses @turf/boolean-point-in-polygon for accurate spatial testing.
 *
 * Usage: node scripts/link-massing.js
 */
const { Pool } = require('pg');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point: turfPoint } = require('@turf/helpers');

const BATCH_SIZE = 500;
const BBOX_OFFSET = 0.003; // ~333m pre-filter radius
const SHED_THRESHOLD_SQM = 20;
const GARAGE_MAX_SQM = 60;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

function classifyStructure(areaSqm, allAreas) {
  if (allAreas.length <= 1) return 'primary';
  const maxArea = Math.max(...allAreas);
  if (areaSqm >= maxArea) return 'primary';
  if (areaSqm < SHED_THRESHOLD_SQM) return 'shed';
  if (areaSqm <= GARAGE_MAX_SQM) return 'garage';
  return 'other';
}

async function main() {
  console.log('=== Buildo Parcel-Building Linker ===');
  console.log('');

  // Count parcels with centroids
  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM parcels WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL'
  );
  const totalParcels = parseInt(countResult.rows[0].total, 10);
  console.log(`Parcels with centroids: ${totalParcels.toLocaleString()}`);

  // Count building footprints
  const bfCount = await pool.query('SELECT COUNT(*) as total FROM building_footprints');
  console.log(`Building footprints:    ${parseInt(bfCount.rows[0].total, 10).toLocaleString()}`);

  // Count already linked
  const linkedCount = await pool.query('SELECT COUNT(*) as total FROM parcel_buildings');
  console.log(`Already linked:         ${parseInt(linkedCount.rows[0].total, 10).toLocaleString()}`);
  console.log('');

  const startTime = Date.now();
  let processed = 0;
  let parcelsLinked = 0;
  let buildingsLinked = 0;
  let noMatch = 0;
  let offset = 0;

  while (offset < totalParcels) {
    const parcelBatch = await pool.query(
      `SELECT id, centroid_lat, centroid_lng
       FROM parcels
       WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (parcelBatch.rows.length === 0) break;

    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const parcel of parcelBatch.rows) {
      const lat = parseFloat(parcel.centroid_lat);
      const lng = parseFloat(parcel.centroid_lng);

      // BBOX pre-filter: find building footprints near this parcel
      const candidates = await pool.query(
        `SELECT id, geometry, footprint_area_sqm
         FROM building_footprints
         WHERE centroid_lat BETWEEN $1 - $3 AND $1 + $3
           AND centroid_lng BETWEEN $2 - $3 AND $2 + $3`,
        [lat, lng, BBOX_OFFSET]
      );

      if (candidates.rows.length === 0) {
        noMatch++;
        processed++;
        continue;
      }

      // Point-in-polygon test for each candidate
      const parcelPoint = turfPoint([lng, lat]);
      const matchedBuildings = [];

      for (const building of candidates.rows) {
        const geom = building.geometry;
        if (!geom || !geom.type || !geom.coordinates) continue;

        let isInside = false;

        if (geom.type === 'Polygon') {
          try {
            isInside = booleanPointInPolygon(parcelPoint, {
              type: 'Feature',
              geometry: geom,
              properties: {},
            });
          } catch {
            // Invalid geometry — skip
          }
        } else if (geom.type === 'MultiPolygon') {
          // Test each sub-polygon
          for (const polyCoords of geom.coordinates) {
            try {
              isInside = booleanPointInPolygon(parcelPoint, {
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
            footprint_area_sqm: parseFloat(building.footprint_area_sqm) || 0,
          });
        }
      }

      if (matchedBuildings.length === 0) {
        noMatch++;
        processed++;
        continue;
      }

      // Classify structures
      const allAreas = matchedBuildings.map(b => b.footprint_area_sqm);
      for (const mb of matchedBuildings) {
        const structureType = classifyStructure(mb.footprint_area_sqm, allAreas);
        const isPrimary = structureType === 'primary';

        insertParams.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        insertValues.push(
          parcel.id, mb.building_id, isPrimary, structureType
        );
        buildingsLinked++;
      }

      parcelsLinked++;
      processed++;
    }

    // Batch insert
    if (insertParams.length > 0) {
      try {
        await pool.query(
          `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type)
           VALUES ${insertParams.join(', ')}
           ON CONFLICT (parcel_id, building_id) DO UPDATE SET
             is_primary = EXCLUDED.is_primary,
             structure_type = EXCLUDED.structure_type,
             linked_at = NOW()`,
          insertValues
        );
      } catch (err) {
        console.error(`  Error inserting batch at offset ${offset}:`, err.message);
      }
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
  console.log(`No match found:         ${noMatch.toLocaleString()}`);
  console.log(`Duration:               ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Linking failed:', err);
  process.exit(1);
});
