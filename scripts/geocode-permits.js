#!/usr/bin/env node
/**
 * Geocode permits by looking up lat/lng from the address_points table via geo_id.
 *
 * Each permit's geo_id field corresponds to ADDRESS_POINT_ID in Toronto's
 * Address Points dataset. This script performs a bulk UPDATE to populate
 * latitude/longitude on permits that have a valid geo_id but no coordinates yet,
 * followed by a zombie-cleanup UPDATE to clear stale coordinates.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - records_meta with geocoding coverage stats
 *
 * Usage: node scripts/geocode-permits.js
 *
 * SPEC LINK: docs/specs/05_geocoding.md
 *
 * WF3-S2: wrapped the main geocode UPDATE and the zombie-cleanup UPDATE in
 * pipeline.withTransaction so a dashboard read between them cannot see
 * coordinates that disagree with the zombie-cleanup state. The original
 * comment "Single UPDATE is inherently atomic" was wrong — there are two.
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');

/**
 * Core geocoding logic. Accepts an optional withTransaction override for
 * testing (so tests can inject a mock transaction without fighting module
 * mock resolution). All logging and emit calls always use the real pipeline.
 *
 * @param {import('pg').Pool} pool
 * @param {{ withTransaction?: typeof pipeline.withTransaction }} [opts]
 */
async function geocodePermits(pool, opts) {
  const withTransaction = (opts && opts.withTransaction) ? opts.withTransaction : pipeline.withTransaction.bind(pipeline);
  const RUN_AT = await pipeline.getDbTimestamp(pool);
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
    total: safeParsePositiveInt(before.total, 'total'),
    already_geocoded: safeParsePositiveInt(before.already_geocoded, 'already_geocoded'),
    has_geo_id: safeParsePositiveInt(before.has_geo_id, 'has_geo_id'),
    to_geocode: safeParsePositiveInt(before.to_geocode, 'to_geocode'),
  });

  // Count address points available
  const apCount = await pool.query('SELECT COUNT(*) as count FROM address_points');
  pipeline.log.info('[geocode-permits]', `Address points loaded: ${safeParsePositiveInt(apCount.rows[0].count, 'count').toLocaleString()}`);

  // Both UPDATEs share a single transaction: if the zombie cleanup fails,
  // the main geocode is rolled back so the permits table is never left in
  // a state where some coordinates are updated but zombie rows still exist.
  pipeline.log.info('[geocode-permits]', 'Running bulk UPDATEs (atomic)...');
  let updated = 0;
  let zombiesCleaned = 0;

  await withTransaction(pool, async (client) => {
    // UPDATE 1: bulk geocode — join permits to address_points via geo_id
    const geocodeResult = await client.query(`
      UPDATE permits p
      SET latitude = ap.latitude,
          longitude = ap.longitude,
          geocoded_at = $1::timestamptz
      FROM address_points ap
      WHERE p.geo_id IS NOT NULL
        AND p.geo_id != ''
        AND p.geo_id ~ '^[0-9]+$'
        AND ap.address_point_id = CASE WHEN p.geo_id ~ '^[0-9]+$' THEN p.geo_id::INTEGER END
        AND (p.latitude IS DISTINCT FROM ap.latitude
          OR p.longitude IS DISTINCT FROM ap.longitude)
    `, [RUN_AT]);
    updated = geocodeResult.rowCount;

    // UPDATE 2: zombie cleanup — clear stale coordinates on permits that lost
    // their geo_id (e.g., city corrected a typo and removed it from the feed).
    // Only clears permits with geocoded_at set (previously geocoded by this script),
    // to avoid wiping coordinates set by other geocoding methods.
    const zombieResult = await client.query(`
      UPDATE permits
      SET latitude = NULL, longitude = NULL, geocoded_at = NULL
      WHERE (geo_id IS NULL OR geo_id = '')
        AND latitude IS NOT NULL
        AND geocoded_at IS NOT NULL
    `);
    zombiesCleaned = zombieResult.rowCount;
  });

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
    total_geocoded: safeParsePositiveInt(after.geocoded, 'geocoded'),
    has_geo_id_no_match: safeParsePositiveInt(after.has_geo_id_no_match, 'has_geo_id_no_match'),
    no_geo_id: safeParsePositiveInt(after.no_geo_id, 'no_geo_id'),
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for geocoding observability
  const totalPermits = safeParsePositiveInt(after.total, 'total');
  const totalGeocoded = safeParsePositiveInt(after.geocoded, 'geocoded');
  const geocodeCoverage = totalPermits > 0 ? (totalGeocoded / totalPermits) * 100 : 0;
  const geocodeAuditRows = [
    { metric: 'total_permits', value: totalPermits, threshold: null, status: 'INFO' },
    { metric: 'already_geocoded', value: safeParsePositiveInt(before.already_geocoded, 'already_geocoded'), threshold: null, status: 'INFO' },
    { metric: 'newly_geocoded', value: updated, threshold: null, status: 'INFO' },
    { metric: 'total_geocoded', value: totalGeocoded, threshold: null, status: 'INFO' },
    { metric: 'geocode_coverage', value: geocodeCoverage.toFixed(1) + '%', threshold: '>= 95%', status: geocodeCoverage >= 95 ? 'PASS' : 'WARN' },
    { metric: 'no_geo_id', value: safeParsePositiveInt(after.no_geo_id, 'no_geo_id'), threshold: null, status: 'INFO' },
  ];

  pipeline.emitSummary({
    records_total: safeParsePositiveInt(before.to_geocode, 'to_geocode'),
    records_new: 0,
    records_updated: updated + zombiesCleaned,
    records_meta: {
      duration_ms: durationMs,
      permits_total: totalPermits,
      total_geocoded: totalGeocoded,
      has_geo_id_no_match: safeParsePositiveInt(after.has_geo_id_no_match, 'has_geo_id_no_match'),
      no_geo_id: safeParsePositiveInt(after.no_geo_id, 'no_geo_id'),
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
}

module.exports = { geocodePermits };

const ADVISORY_LOCK_ID = 5;

if (require.main === module) {
  pipeline.run('geocode-permits', async (pool) => {
    const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
      await geocodePermits(pool);
    });
    if (!lockResult.acquired) return;
  });
}
