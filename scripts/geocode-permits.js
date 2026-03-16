#!/usr/bin/env node
/**
 * Geocode permits by looking up lat/lng from the address_points table via geo_id.
 *
 * Each permit's geo_id field corresponds to ADDRESS_POINT_ID in Toronto's
 * Address Points dataset. This script performs a single bulk UPDATE to populate
 * latitude/longitude on permits that have a valid geo_id but no coordinates yet.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with geocoding coverage stats
 *
 * Usage: node scripts/geocode-permits.js
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('./lib/pipeline');

pipeline.run('geocode-permits', async (pool) => {
  const startTime = Date.now();

  pipeline.log.info('[geocode-permits]', 'Starting permit geocoding (Address Points lookup)');

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
  pipeline.log.info('[geocode-permits]', 'Before', {
    total: parseInt(before.total),
    already_geocoded: parseInt(before.already_geocoded),
    has_geo_id: parseInt(before.has_geo_id),
    to_geocode: parseInt(before.to_geocode),
  });

  // Count address points available
  const apCount = await pool.query('SELECT COUNT(*) as count FROM address_points');
  pipeline.log.info('[geocode-permits]', `Address points loaded: ${parseInt(apCount.rows[0].count).toLocaleString()}`);

  // Bulk update: join permits to address_points via geo_id
  pipeline.log.info('[geocode-permits]', 'Running bulk UPDATE...');
  const updated = await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(`
      UPDATE permits p
      SET latitude = ap.latitude,
          longitude = ap.longitude,
          geocoded_at = NOW()
      FROM address_points ap
      WHERE ap.address_point_id = CAST(p.geo_id AS INTEGER)
        AND p.geo_id IS NOT NULL
        AND p.geo_id != ''
        AND p.geo_id ~ '^[0-9]+$'
        AND (p.latitude IS DISTINCT FROM ap.latitude
          OR p.longitude IS DISTINCT FROM ap.longitude)
    `);
    return result.rowCount;
  });

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
  const durationMs = Date.now() - startTime;

  pipeline.log.info('[geocode-permits]', 'Geocoding complete', {
    updated,
    total_geocoded: parseInt(after.geocoded),
    has_geo_id_no_match: parseInt(after.has_geo_id_no_match),
    no_geo_id: parseInt(after.no_geo_id),
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  pipeline.emitSummary({
    records_total: updated,
    records_new: updated,
    records_updated: 0,
    records_meta: {
      duration_ms: durationMs,
      permits_total: parseInt(before.total),
      total_geocoded: parseInt(after.geocoded),
      has_geo_id_no_match: parseInt(after.has_geo_id_no_match),
      no_geo_id: parseInt(after.no_geo_id),
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "geo_id", "latitude", "longitude"], "address_points": ["address_point_id", "latitude", "longitude"] },
    { "permits": ["latitude", "longitude", "geocoded_at"] }
  );
});
