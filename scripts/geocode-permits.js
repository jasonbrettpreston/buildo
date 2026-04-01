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
 * SPEC LINK: docs/specs/05_geocoding.md
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
  // Single UPDATE is inherently atomic — no transaction wrapper needed
  const geocodeResult = await pool.query(`
    UPDATE permits p
    SET latitude = ap.latitude,
        longitude = ap.longitude,
        geocoded_at = NOW()
    FROM address_points ap
    WHERE p.geo_id IS NOT NULL
      AND p.geo_id != ''
      AND p.geo_id ~ '^[0-9]+$'
      AND ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END
      AND (p.latitude IS DISTINCT FROM ap.latitude
        OR p.longitude IS DISTINCT FROM ap.longitude)
  `);
  const updated = geocodeResult.rowCount;

  // Cleanup: clear stale coordinates on permits that lost their geo_id
  // (e.g., city corrected a typo and removed the geo_id from the feed)
  // Only clears permits with geocoded_at set (i.e., previously geocoded by this script),
  // to avoid wiping coordinates set by other geocoding methods.
  const zombieResult = await pool.query(`
    UPDATE permits
    SET latitude = NULL, longitude = NULL, geocoded_at = NULL
    WHERE (geo_id IS NULL OR geo_id = '')
      AND latitude IS NOT NULL
      AND geocoded_at IS NOT NULL
  `);
  const zombiesCleaned = zombieResult.rowCount;
  if (zombiesCleaned > 0) {
    pipeline.log.info('[geocode-permits]', `Cleaned ${zombiesCleaned} zombie locations (geo_id removed but coords persisted)`);
  }

  // Post-update stats
  const afterCounts = await pool.query(`
    SELECT
      COUNT(*) as total,
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

  // Build audit_table for geocoding observability
  // Use after.total as denominator to avoid read-skew with concurrent inserts
  const totalPermits = parseInt(after.total);
  const totalGeocoded = parseInt(after.geocoded);
  const geocodeCoverage = totalPermits > 0 ? (totalGeocoded / totalPermits) * 100 : 0;
  const geocodeAuditRows = [
    { metric: 'total_permits', value: totalPermits, threshold: null, status: 'INFO' },
    { metric: 'already_geocoded', value: parseInt(before.already_geocoded), threshold: null, status: 'INFO' },
    { metric: 'newly_geocoded', value: updated, threshold: null, status: 'INFO' },
    { metric: 'total_geocoded', value: totalGeocoded, threshold: null, status: 'INFO' },
    { metric: 'geocode_coverage', value: geocodeCoverage.toFixed(1) + '%', threshold: '>= 95%', status: geocodeCoverage >= 95 ? 'PASS' : 'WARN' },
    { metric: 'no_geo_id', value: parseInt(after.no_geo_id), threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: parseInt(before.to_geocode),
    records_new: 0,
    records_updated: updated + zombiesCleaned,
    records_meta: {
      duration_ms: durationMs,
      permits_total: totalPermits,
      total_geocoded: totalGeocoded,
      has_geo_id_no_match: parseInt(after.has_geo_id_no_match),
      no_geo_id: parseInt(after.no_geo_id),
      zombies_cleaned: zombiesCleaned,
      audit_table: {
        phase: (process.env.PIPELINE_CHAIN === 'sources') ? 3 : 6,
        name: 'Permit Geocoding',
        verdict: geocodeCoverage < 95 ? 'WARN' : 'PASS',
        rows: geocodeAuditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "permits": ["permit_num", "revision_num", "geo_id", "latitude", "longitude"], "address_points": ["address_point_id", "latitude", "longitude"] },
    { "permits": ["latitude", "longitude", "geocoded_at"] }
  );
});
