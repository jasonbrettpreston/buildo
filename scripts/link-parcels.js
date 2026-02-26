#!/usr/bin/env node
/**
 * Link permits to parcels via address + spatial matching.
 *
 * Three-step cascade:
 *   1. Exact address (num + name + type) -> confidence 0.95
 *   2. Num + name only (ignore type mismatch) -> confidence 0.80
 *   3. Spatial proximity (nearest parcel centroid ≤100m) -> confidence 0.65
 *
 * Strategy 3 requires permits to have geocoded lat/lng coordinates.
 * Parcels must have pre-computed centroid_lat/centroid_lng (run compute-centroids.js first).
 *
 * Processes ALL permits with valid street addresses or geocoded coordinates.
 *
 * Usage: node scripts/link-parcels.js
 */
const { Pool } = require('pg');

const BATCH_SIZE = 1000;
const SPATIAL_MAX_DISTANCE_M = 100;
const SPATIAL_CONFIDENCE = 0.65;
const BBOX_OFFSET = 0.001; // ~111m lat, ~82m lng at Toronto latitude

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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

async function main() {
  console.log('=== Buildo Permit-Parcel Linker (3-Step Cascade) ===');
  console.log('');

  // Count all permits with valid street addresses OR geocoded coordinates
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits
     WHERE (street_num IS NOT NULL AND street_num != ''
       AND street_name IS NOT NULL AND street_name != '')
       OR (latitude IS NOT NULL AND longitude IS NOT NULL)`
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
  let noMatch = 0;
  let offset = 0;

  while (offset < totalPermits) {
    const batch = await pool.query(
      `SELECT permit_num, revision_num, street_num, street_name, street_type,
              latitude, longitude
       FROM permits
       WHERE (street_num IS NOT NULL AND street_num != ''
         AND street_name IS NOT NULL AND street_name != '')
         OR (latitude IS NOT NULL AND longitude IS NOT NULL)
       ORDER BY permit_num, revision_num
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (batch.rows.length === 0) break;

    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const permit of batch.rows) {
      const num = (permit.street_num || '').trim().toUpperCase().replace(/^0+/, '');
      const name = (permit.street_name || '').trim().toUpperCase();
      const type = (permit.street_type || '').trim().toUpperCase();

      let match = null;

      // Strategy 1: Exact address match (num + name + type)
      if (num && name && type) {
        const exact = await pool.query(
          `SELECT id FROM parcels
           WHERE addr_num_normalized = $1
             AND street_name_normalized = $2
             AND street_type_normalized = $3
           LIMIT 1`,
          [num, name, type]
        );
        if (exact.rows.length > 0) {
          match = { parcel_id: exact.rows[0].id, match_type: 'exact_address', confidence: 0.95 };
          linkedExact++;
        }
      }

      // Strategy 2: Num + name only (ignore type)
      if (!match && num && name) {
        const nameOnly = await pool.query(
          `SELECT id FROM parcels
           WHERE addr_num_normalized = $1
             AND street_name_normalized = $2
           LIMIT 1`,
          [num, name]
        );
        if (nameOnly.rows.length > 0) {
          match = { parcel_id: nameOnly.rows[0].id, match_type: 'name_only', confidence: 0.80 };
          linkedName++;
        }
      }

      // Strategy 3: Spatial proximity (nearest centroid within 100m)
      if (!match && hasCentroids && permit.latitude && permit.longitude) {
        const lat = parseFloat(permit.latitude);
        const lng = parseFloat(permit.longitude);

        const candidates = await pool.query(
          `SELECT id, centroid_lat, centroid_lng FROM parcels
           WHERE centroid_lat BETWEEN $1 - ${BBOX_OFFSET} AND $1 + ${BBOX_OFFSET}
             AND centroid_lng BETWEEN $2 - ${BBOX_OFFSET} AND $2 + ${BBOX_OFFSET}`,
          [lat, lng]
        );

        if (candidates.rows.length > 0) {
          let bestId = null;
          let bestDist = Infinity;

          for (const c of candidates.rows) {
            const dist = haversineDistance(
              [lng, lat],
              [parseFloat(c.centroid_lng), parseFloat(c.centroid_lat)]
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestId = c.id;
            }
          }

          if (bestId !== null && bestDist <= SPATIAL_MAX_DISTANCE_M) {
            match = { parcel_id: bestId, match_type: 'spatial', confidence: SPATIAL_CONFIDENCE };
            linkedSpatial++;
          }
        }
      }

      if (match) {
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

    // Batch insert
    if (insertParams.length > 0) {
      await pool.query(
        `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
         VALUES ${insertParams.join(', ')}
         ON CONFLICT (permit_num, revision_num, parcel_id) DO UPDATE SET
           match_type = EXCLUDED.match_type,
           confidence = EXCLUDED.confidence,
           linked_at = NOW()`,
        insertValues
      );
    }

    offset += BATCH_SIZE;

    if (processed % 10000 === 0 || processed >= totalPermits) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalPermits) * 100).toFixed(1);
      const totalLinked = linkedExact + linkedName + linkedSpatial;
      console.log(`  ${processed.toLocaleString()} / ${totalPermits.toLocaleString()} (${pct}%) - linked: ${totalLinked.toLocaleString()} (exact:${linkedExact.toLocaleString()} name:${linkedName.toLocaleString()} spatial:${linkedSpatial.toLocaleString()}) - ${elapsed}s`);
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
  console.log(`No match found:       ${noMatch.toLocaleString()}`);
  console.log(`Duration:             ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Linking failed:', err);
  process.exit(1);
});
