#!/usr/bin/env node
/**
 * Geocode permits by looking up lat/lng from the address_points table via geo_id.
 *
 * Each permit's geo_id field corresponds to ADDRESS_POINT_ID in Toronto's
 * Address Points dataset. This script performs a single bulk UPDATE to populate
 * latitude/longitude on permits that have a valid geo_id but no coordinates yet.
 *
 * Usage:
 *   node scripts/geocode-permits.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function main() {
  console.log('=== Buildo Permit Geocoder (Address Points Lookup) ===');
  console.log('');

  const startTime = Date.now();

  // Count permits needing geocoding
  const beforeCounts = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as already_geocoded,
      COUNT(*) FILTER (WHERE geo_id IS NOT NULL AND geo_id != '') as has_geo_id,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND geo_id IS NOT NULL AND geo_id != ''
      ) as to_geocode
    FROM permits
  `);
  const before = beforeCounts.rows[0];
  console.log(`Total permits:       ${parseInt(before.total).toLocaleString()}`);
  console.log(`Already geocoded:    ${parseInt(before.already_geocoded).toLocaleString()}`);
  console.log(`Have geo_id:         ${parseInt(before.has_geo_id).toLocaleString()}`);
  console.log(`To geocode:          ${parseInt(before.to_geocode).toLocaleString()}`);
  console.log('');

  // Count address points available
  const apCount = await pool.query('SELECT COUNT(*) as count FROM address_points');
  console.log(`Address points loaded: ${parseInt(apCount.rows[0].count).toLocaleString()}`);
  console.log('');

  // Bulk update: join permits to address_points via geo_id
  console.log('Running bulk UPDATE...');
  const result = await pool.query(`
    UPDATE permits p
    SET latitude = ap.latitude,
        longitude = ap.longitude,
        geocoded_at = NOW()
    FROM address_points ap
    WHERE ap.address_point_id = CAST(p.geo_id AS INTEGER)
      AND p.latitude IS NULL
      AND p.geo_id IS NOT NULL
      AND p.geo_id != ''
      AND p.geo_id ~ '^[0-9]+$'
  `);

  const updated = result.rowCount;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('=== Geocoding Complete ===');
  console.log(`Permits updated:     ${updated.toLocaleString()}`);

  // Post-update stats
  const afterCounts = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as geocoded,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND geo_id IS NOT NULL AND geo_id != ''
      ) as has_geo_id_no_match,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND (geo_id IS NULL OR geo_id = '')
      ) as no_geo_id
    FROM permits
  `);
  const after = afterCounts.rows[0];
  console.log(`Total geocoded:      ${parseInt(after.geocoded).toLocaleString()}`);
  console.log(`geo_id but no match: ${parseInt(after.has_geo_id_no_match).toLocaleString()}`);
  console.log(`No geo_id at all:    ${parseInt(after.no_geo_id).toLocaleString()}`);
  console.log(`Duration:            ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Geocoding failed:', err);
  process.exit(1);
});
