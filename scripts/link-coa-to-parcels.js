#!/usr/bin/env node
/**
 * Link CoA applications to parcels via Tier 1a/1b address-only matching.
 * Then bundles two derived passes per CoA:
 *   (a) point-in-polygon neighbourhood_id lookup against the matched parcel's centroid
 *   (b) lat/lng back-fill into coa_applications from parcels.centroid_lat/centroid_lng
 * Plus the parcel_linked_at = RUN_AT marker.
 *
 * Why bundle three writes into one script (Spec 42 §6.11.1)?
 *   The permit-side chain runs link-parcels.js + link-neighbourhoods.js as separate
 *   steps. The CoA chain bundles them because:
 *     - Minimizes advisory-lock contention + chain-step count
 *     - CoAs have NO pre-link lat/lng → both downstream passes depend on the
 *       parcel match. Running them separately would re-fetch the same rows.
 *     - Atomicity: per-record SAVEPOINT ensures any one of the 3 writes failing
 *       on a single CoA rolls back THAT CoA only, not the entire batch.
 *
 * Why no Tier 2 spatial cascade?
 *   CoA records have NO lat/lng before this script runs. The lat/lng back-fill
 *   happens AFTER the Tier 1 address match. By definition any CoA that fails
 *   Tier 1 has no lat/lng → Tier 2 spatial centroid-distance fallback is
 *   unreachable. Documented in Spec 42 §6.5 step 9 + R2.v5 fix #14.
 *
 * Observability:
 *   - Structured logging via pipeline.log (Spec 00 §6.1)
 *   - Per-tier audit_table breakdown (tier_1a_exact / tier_1b_name_only / no_parcel_match)
 *   - centroid_outside_polygon_count: tracks ST_Centroid (mig 016 / compute-centroids.js:103)
 *     edge cases where parcel centroid lands outside its own polygon (L-shaped lots).
 *     Audit metric only — if >1% surfaces, file a follow-up WF3 to upgrade to ST_PointOnSurface.
 *   - Day-1 unmatched threshold via logic_variables.coa_unmatched_threshold_pct (WARN, not FAIL).
 *
 * Usage:
 *   node scripts/link-coa-to-parcels.js
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9 + §6.8 (lock 4201)
 *            docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');

// §R2 — advisory lock 4201 (Spec 42 §6.8 Phase D allocation)
const ADVISORY_LOCK_ID = 4201;

// §R4 — Zod schema for required logic_variables. Distinct key names from
// link-coa.js's `coa_match_conf_high`/`coa_match_conf_medium` (different
// domain — CoA-to-permit match, not CoA-to-parcel match).
const LOGIC_VARS_SCHEMA = z.object({
  coa_unmatched_threshold_pct: z.coerce.number().finite().nonnegative().max(100),
  coa_parcel_conf_tier1a:      z.coerce.number().finite().positive().max(1).optional(),
  coa_parcel_conf_tier1b:      z.coerce.number().finite().positive().max(1).optional(),
}).passthrough();

const GHOST_CLEANUP_BATCH_SIZE = 1000;

// Turf.js imports are lazy-loaded only when PostGIS is unavailable
let booleanPointInPolygon, point, polygon, multiPolygon;

// ───────────────────── Geometry helpers (verbatim parity with link-parcels.js) ─────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Point is [lng, lat], ring is array of [lng, lat] (closed polygon).
 */
function pointInPolygon(pt, ring) {
  if (!pt || !ring || ring.length < 4) return false;
  const [x, y] = pt;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test if a point is inside a GeoJSON Polygon or MultiPolygon, respecting holes.
 * For Polygon: must be inside outer ring AND NOT inside any inner ring (hole).
 * For MultiPolygon: must be inside at least one sub-polygon (with hole exclusion).
 */
function pointInGeoJSON(pt, geometry) {
  if (!geometry || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    if (!rings[0] || rings[0].length < 4) return false;
    if (!pointInPolygon(pt, rings[0])) return false;
    // Must NOT be inside any hole (inner rings)
    for (let i = 1; i < rings.length; i++) {
      if (rings[i] && rings[i].length >= 4 && pointInPolygon(pt, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (!poly[0] || poly[0].length < 4) continue;
      if (!pointInPolygon(pt, poly[0])) continue;
      // Check holes in this sub-polygon
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        if (poly[i] && poly[i].length >= 4 && pointInPolygon(pt, poly[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

/**
 * Haversine distance between two [lng, lat] points in metres.
 * (Preserved from twin for parity; not used in the Tier 1a/1b cascade but the
 * neighbourhood pass could use it if a future spatial fallback is added.)
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

// ─────────────────────────── Main entrypoint ───────────────────────────

pipeline.run('link-coa-to-parcels', async (pool) => {
  // §R3.5 + §R5 — startup validation BEFORE lock contention (per scripts/CLAUDE.md skeleton + Spec 47 §R3.5)
  const RUN_AT = await pipeline.getDbTimestamp(pool);
  const startTime = Date.now();

  // §R4 — load + validate logic_vars BEFORE acquiring the lock so misconfiguration
  // fails fast without blocking other invocations on the lock.
  const { logicVars } = await loadMarketplaceConfigs(pool, 'link-coa-to-parcels');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'link-coa-to-parcels');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const coaUnmatchedThresholdPct = logicVars.coa_unmatched_threshold_pct;
  const tier1aConfidence = logicVars.coa_parcel_conf_tier1a ?? 0.95;
  const tier1bConfidence = logicVars.coa_parcel_conf_tier1b ?? 0.80;

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    // §R5 — detect PostGIS for the bundled neighbourhood pass
    const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
    const hasPostGIS = pgisCheck.rows.length > 0;
    if (hasPostGIS) {
      pipeline.log.info('[link-coa-to-parcels]', 'PostGIS detected — neighbourhood lookup will use ST_Contains');
    }

    // Load neighbourhoods (used by both PostGIS path — for the per-row ST_Contains query —
    // and by the Turf fallback to build polygon objects).
    const nhoods = await pool.query(
      'SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods WHERE geometry IS NOT NULL'
    );
    pipeline.log.info('[link-coa-to-parcels]', `Loaded ${nhoods.rows.length} neighbourhoods with geometry`);

    // Pre-build Turf polygon objects + BBOX (only consumed in the JS fallback path).
    let turfPolygons = [];
    if (!hasPostGIS) {
      booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
      ({ point, polygon, multiPolygon } = require('@turf/helpers'));
      for (const n of nhoods.rows) {
        const geom = typeof n.geometry === 'string' ? JSON.parse(n.geometry) : n.geometry;
        if (!geom || !geom.coordinates) continue;
        let turfGeom;
        try {
          if (geom.type === 'Polygon') turfGeom = polygon(geom.coordinates);
          else if (geom.type === 'MultiPolygon') turfGeom = multiPolygon(geom.coordinates);
          else continue;
        } catch {
          pipeline.log.warn('[link-coa-to-parcels]', `Invalid geometry for ${n.name}`);
          continue;
        }
        turfPolygons.push({ db_id: n.id, name: n.name, geometry: turfGeom, bounds: computeBBox(geom) });
      }
      pipeline.log.info('[link-coa-to-parcels]', `Built ${turfPolygons.length} Turf polygons with BBOX`);
    }

    // Count unprocessed CoAs (parcel_linked_at IS NULL — drives back-fill per plan-review fix #1).
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n FROM coa_applications
        WHERE parcel_linked_at IS NULL AND lead_id IS NOT NULL`
    );
    const totalCoa = safeParsePositiveInt(countResult.rows[0].n, 'unprocessed_coa');
    pipeline.log.info('[link-coa-to-parcels]', `Unprocessed CoAs to process: ${totalCoa.toLocaleString()}`);

    if (totalCoa === 0) {
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          audit_table: {
            phase: 11,
            name: 'CoA Parcel Linking',
            verdict: 'PASS',
            rows: [
              { metric: 'status', value: 'SKIPPED', threshold: null, status: 'INFO' },
              { metric: 'reason', value: 'No unprocessed CoAs — all already have parcel_linked_at set', threshold: null, status: 'INFO' },
            ],
          },
        },
      });
      pipeline.emitMeta(
        { coa_applications: ['id', 'lead_id', 'street_num', 'street_name_normalized', 'parcel_linked_at'],
          parcels: ['id', 'addr_num_normalized', 'street_name_normalized', 'centroid_lat', 'centroid_lng', 'geom'],
          neighbourhoods: ['id', 'geom'] },
        { lead_parcels: ['lead_id', 'parcel_id', 'match_type', 'confidence', 'matched_at'],
          coa_applications: ['neighbourhood_id', 'latitude', 'longitude', 'parcel_linked_at'] }
      );
      return;
    }

    // Counters for per-tier audit breakdown (R2.v5 fix #12).
    let processed = 0;
    let tier1aExact = 0;
    let tier1bNameOnly = 0;
    let noAddressData = 0;     // CoA has no street_name_normalized (handled in pre-pass below)
    let noParcelMatch = 0;     // address present but no parcel found
    let neighbourhoodMatched = 0;
    let neighbourhoodNoMatch = 0;
    let latLngWritten = 0;
    let centroidOutsidePolygon = 0;
    let perRowErrors = 0;
    let lastId = 0;

    // ─── Pre-pass: mark unmatchable rows (no street_name_normalized) processed ───
    // R8 Gemini MED — pull these out of the main loop so the batch SELECT can
    // skip them entirely. Single one-shot UPDATE; no per-row SAVEPOINT needed
    // because no other writes are coupled.
    const unmatchablePass = await pool.query(
      `UPDATE coa_applications
          SET parcel_linked_at = $1::timestamptz
        WHERE parcel_linked_at IS NULL
          AND lead_id IS NOT NULL
          AND street_name_normalized IS NULL`,
      [RUN_AT]
    );
    noAddressData = unmatchablePass.rowCount ?? 0;
    processed += noAddressData;
    if (noAddressData > 0) {
      pipeline.log.info('[link-coa-to-parcels]', `Pre-pass: marked ${noAddressData} unmatchable CoAs (no street_name_normalized) as processed`);
    }

    // ───────────────────── Main batch loop with per-record SAVEPOINTs ─────────────────────
    while (true) {
      // R8 Gemini MED: filter `street_name_normalized IS NOT NULL` at the
      // SELECT level — rows without a street name are unmatchable by either
      // tier and would just increment `noAddressData`. Pre-filtering saves
      // ~3 rows per run today but defends against scale.
      const batch = await pool.query(
        `SELECT ca.id,
                ca.lead_id,
                ca.street_num,
                ca.street_name_normalized,
                ca.latitude,
                ca.longitude,
                ca.neighbourhood_id
           FROM coa_applications ca
          WHERE ca.parcel_linked_at IS NULL
            AND ca.lead_id IS NOT NULL
            AND ca.street_name_normalized IS NOT NULL
            AND ca.id > $1
          ORDER BY ca.id ASC
          LIMIT $2`,
        [lastId, pipeline.BATCH_SIZE]
      );

      if (batch.rows.length === 0) break;
      lastId = batch.rows[batch.rows.length - 1].id;

      // §R9 — outer transaction wraps the batch; per-row SAVEPOINTs isolate failures.
      // Poison-pill protection (R2.v5 fix #11 — Gemini CRITICAL C2): a bad row's
      // SAVEPOINT rolls back to that row only; the rest of the batch commits.
      await pipeline.withTransaction(pool, async (client) => {
        for (const coa of batch.rows) {
          processed++;
          try {
            await client.query('SAVEPOINT row_sp');

            // ─── Tier 1a: addr_num + street_name_normalized exact match ───
            let parcelMatch = null;
            let matchTier = null;
            let confidence = null;

            const hasStreetNum  = coa.street_num && coa.street_num.trim() !== '';
            const hasStreetName = coa.street_name_normalized && coa.street_name_normalized.trim() !== '';

            // Tier 1a requires BOTH; Tier 1b requires name only.
            // Counter buckets are mutually exclusive (post-Tier-1b):
            //   - no_address_data: street_name absent (unmatchable by either tier)
            //   - tier_1a_exact / tier_1b_name_only: matched
            //   - no_parcel_match: had address but no parcel found

            if (hasStreetNum && hasStreetName) {
              const t1a = await client.query(
                `SELECT id, centroid_lat, centroid_lng${hasPostGIS ? ', geom' : ', geometry'}
                   FROM parcels
                  WHERE addr_num_normalized = $1
                    AND street_name_normalized = $2
                  ORDER BY id DESC
                  LIMIT 1`,
                [coa.street_num.trim(), coa.street_name_normalized.trim()]
              );
              if (t1a.rows.length > 0) {
                parcelMatch = t1a.rows[0];
                matchTier = 'tier_1a_exact';
                confidence = tier1aConfidence;
                tier1aExact++;
              }
            }

            // ─── Tier 1b: name-only match (no street_num set, name present) ───
            if (!parcelMatch && !hasStreetNum && hasStreetName) {
              const t1b = await client.query(
                `SELECT id, centroid_lat, centroid_lng${hasPostGIS ? ', geom' : ', geometry'}
                   FROM parcels
                  WHERE street_name_normalized = $1
                  ORDER BY id DESC
                  LIMIT 1`,
                [coa.street_name_normalized.trim()]
              );
              if (t1b.rows.length > 0) {
                parcelMatch = t1b.rows[0];
                matchTier = 'tier_1b_name_only';
                confidence = tier1bConfidence;
                tier1bNameOnly++;
              }
            }

            // Bucket the non-match case (pre-pass already handled !hasStreetName rows).
            if (!parcelMatch) {
              noParcelMatch++;     // had street_name (filtered at SELECT), no parcel found
            }

            if (parcelMatch) {
              // ─── Write 1: INSERT into lead_parcels ───
              // lead_id sourced directly from ca.lead_id (R2.v3 fix — never re-derive).
              await client.query(
                `INSERT INTO lead_parcels (lead_id, parcel_id, match_type, confidence, matched_at)
                 VALUES ($1, $2, $3, $4, $5::timestamptz)
                 ON CONFLICT (lead_id, parcel_id) DO UPDATE SET
                   match_type = EXCLUDED.match_type,
                   confidence = EXCLUDED.confidence,
                   matched_at = EXCLUDED.matched_at
                 WHERE lead_parcels.match_type IS DISTINCT FROM EXCLUDED.match_type
                    OR lead_parcels.confidence IS DISTINCT FROM EXCLUDED.confidence`,
                [coa.lead_id, parcelMatch.id, matchTier, confidence, RUN_AT]
              );

              // ─── Write 2: neighbourhood lookup using parcel's centroid ───
              let neighbourhoodId = null;
              const lat = parcelMatch.centroid_lat !== null ? safeParseFloat(parcelMatch.centroid_lat, 'centroid_lat') : null;
              const lng = parcelMatch.centroid_lng !== null ? safeParseFloat(parcelMatch.centroid_lng, 'centroid_lng') : null;

              if (lat !== null && lng !== null) {
                if (hasPostGIS) {
                  const nh = await client.query(
                    `SELECT id FROM neighbourhoods
                      WHERE geom IS NOT NULL
                        AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326))
                      LIMIT 1`,
                    [lng, lat]
                  );
                  if (nh.rows.length > 0) {
                    neighbourhoodId = nh.rows[0].id;
                  }

                  // Centroid-outside-polygon audit: ST_Centroid (mig 016) can land
                  // outside concave/L-shaped lots. Plan-review fix #2.
                  if (parcelMatch.geom) {
                    const insideCheck = await client.query(
                      `SELECT ST_Contains($1::geometry, ST_SetSRID(ST_MakePoint($2::double precision, $3::double precision), 4326)) AS inside`,
                      [parcelMatch.geom, lng, lat]
                    );
                    if (insideCheck.rows[0] && insideCheck.rows[0].inside === false) {
                      centroidOutsidePolygon++;
                    }
                  }
                } else {
                  // JS fallback: BBOX pre-filter + Turf boolean-point-in-polygon.
                  const pt = point([lng, lat]);
                  for (const nhood of turfPolygons) {
                    const [minX, minY, maxX, maxY] = nhood.bounds;
                    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
                    if (booleanPointInPolygon(pt, nhood.geometry)) {
                      neighbourhoodId = nhood.db_id;
                      break;
                    }
                  }

                  // Centroid-outside-polygon (JS path): parse parcel geometry once.
                  if (parcelMatch.geometry) {
                    let parsedGeom = parcelMatch.geometry;
                    if (typeof parsedGeom === 'string') {
                      try { parsedGeom = JSON.parse(parsedGeom); } catch { parsedGeom = null; }
                    }
                    if (parsedGeom && !pointInGeoJSON([lng, lat], parsedGeom)) {
                      centroidOutsidePolygon++;
                    }
                  }
                }

                if (neighbourhoodId !== null) neighbourhoodMatched++;
                else neighbourhoodNoMatch++;
              } else {
                neighbourhoodNoMatch++;
              }

              // ─── Write 3: lat/lng + neighbourhood_id + parcel_linked_at back-fill ───
              // R2.v5 fix #5: NULL sentinel for no-match neighbourhood (NOT -1).
              // R2.v5 plan-review fix #3: IS DISTINCT FROM guards prevent dead-tuple bloat.
              const updateResult = await client.query(
                `UPDATE coa_applications
                    SET latitude         = $1::numeric,
                        longitude        = $2::numeric,
                        neighbourhood_id = $3::bigint,
                        parcel_linked_at = $4::timestamptz
                  WHERE id = $5
                    AND (latitude         IS DISTINCT FROM $1::numeric
                      OR longitude        IS DISTINCT FROM $2::numeric
                      OR neighbourhood_id IS DISTINCT FROM $3::bigint
                      OR parcel_linked_at IS DISTINCT FROM $4::timestamptz)`,
                [lat, lng, neighbourhoodId, RUN_AT, coa.id]
              );
              if (updateResult.rowCount > 0) latLngWritten++;
            } else {
              // No parcel match: still mark parcel_linked_at = RUN_AT so the
              // pagination filter doesn't re-fetch this row next run.
              // parcel_linked_at IS NOT NULL is the canonical "processed" gate
              // (independent of match outcome, per R2.v5 fix #5).
              await client.query(
                `UPDATE coa_applications
                    SET parcel_linked_at = $1::timestamptz
                  WHERE id = $2
                    AND parcel_linked_at IS NULL`,
                [RUN_AT, coa.id]
              );
            }

            await client.query('RELEASE SAVEPOINT row_sp');
          } catch (err) {
            // Per-row failure: roll back this row only; the batch continues.
            // RELEASE after ROLLBACK TO prevents savepoint-stack accumulation
            // across many error iterations within the same batch transaction
            // (R8 DeepSeek defensive — PG replaces same-named savepoints, but
            // explicit RELEASE keeps the stack tidy).
            await client.query('ROLLBACK TO SAVEPOINT row_sp');
            await client.query('RELEASE SAVEPOINT row_sp');
            pipeline.log.warn('[link-coa-to-parcels]', `Per-row error: lead_id=${coa.lead_id} id=${coa.id}`, { error: err.message });
            perRowErrors++;
          }
        }
      });

      if (processed % 1000 === 0 || processed >= totalCoa) {
        pipeline.progress('link-coa-to-parcels', processed, totalCoa, startTime);
      }
    }

    // ─────────── Ghost cleanup: separate transaction, batched LIMIT 1000 loop ───────────
    // R2.v5 fix #6: existence-based scope (NOT EXISTS), NOT status-based. Closed/refused
    // CoAs retain their lead_parcels rows for historical analysis. The filter
    // `lead_id LIKE 'coa:%'` is the ONE non-redundant use of that pattern in this script
    // (permit-side rows must be protected from this cleanup).
    let ghostDeleted = 0;
    while (true) {
      const ghostResult = await pool.query(
        `DELETE FROM lead_parcels
          WHERE ctid IN (
            SELECT lp.ctid FROM lead_parcels lp
             WHERE lp.lead_id LIKE 'coa:%'
               AND NOT EXISTS (
                 SELECT 1 FROM coa_applications ca WHERE ca.lead_id = lp.lead_id
               )
             LIMIT $1
          )`,
        [GHOST_CLEANUP_BATCH_SIZE]
      );
      const deleted = ghostResult.rowCount ?? 0;
      ghostDeleted += deleted;
      if (deleted === 0) break;
    }
    if (ghostDeleted > 0) {
      pipeline.log.info('[link-coa-to-parcels]', `Ghost cleanup: removed ${ghostDeleted} orphan lead_parcels rows`);
    }

    // ────────────────────── Audit table + summary emit ──────────────────────
    const durationMs = Date.now() - startTime;
    const totalMatched = tier1aExact + tier1bNameOnly;
    const totalUnmatched = noAddressData + noParcelMatch;
    const unmatchedPct = processed > 0 ? (totalUnmatched / processed) * 100 : 0;
    const centroidOutsidePct = totalMatched > 0 ? (centroidOutsidePolygon / totalMatched) * 100 : 0;

    // Per-tier audit breakdown (R2.v5 fix #12).
    // Day-1 threshold: WARN, not FAIL (R2.v5 fix #9). Operators recalibrate post-burn-in.
    const auditRows = [
      { metric: 'coa_processed',                  value: processed,                                              threshold: null,                                          status: 'INFO' },
      { metric: 'tier_1a_exact',                  value: tier1aExact,                                            threshold: null,                                          status: 'INFO' },
      { metric: 'tier_1b_name_only',              value: tier1bNameOnly,                                         threshold: null,                                          status: 'INFO' },
      { metric: 'no_address_data',                value: noAddressData,                                          threshold: null,                                          status: 'INFO' },
      { metric: 'no_parcel_match',                value: noParcelMatch,                                          threshold: null,                                          status: 'INFO' },
      { metric: 'coa_parcels_linked_pct',         value: processed > 0 ? ((totalMatched / processed) * 100).toFixed(1) + '%' : '0.0%', threshold: `>= ${100 - coaUnmatchedThresholdPct}%`, status: unmatchedPct <= coaUnmatchedThresholdPct ? 'PASS' : 'WARN' },
      { metric: 'unmatched_coa_count',            value: totalUnmatched,                                         threshold: `<= ${coaUnmatchedThresholdPct}%`,             status: unmatchedPct <= coaUnmatchedThresholdPct ? 'PASS' : 'WARN' },
      { metric: 'coa_neighbourhood_coverage_pct', value: totalMatched > 0 ? ((neighbourhoodMatched / totalMatched) * 100).toFixed(1) + '%' : '0.0%', threshold: '>= 95%', status: totalMatched === 0 || (neighbourhoodMatched / totalMatched) >= 0.95 ? 'PASS' : 'WARN' },
      { metric: 'coa_geocoded_pct',               value: totalMatched > 0 ? ((latLngWritten / totalMatched) * 100).toFixed(1) + '%' : '0.0%', threshold: null,           status: 'INFO' },
      { metric: 'centroid_outside_polygon_count', value: centroidOutsidePolygon,                                 threshold: '<= 1% of matches',                            status: centroidOutsidePct <= 1 ? 'PASS' : 'WARN' },
      { metric: 'ghost_orphans_cleaned',          value: ghostDeleted,                                           threshold: null,                                          status: 'INFO' },
      { metric: 'per_row_errors',                 value: perRowErrors,                                           threshold: '== 0',                                        status: perRowErrors === 0 ? 'PASS' : 'WARN' },
    ];

    const hasWarn = auditRows.some(r => r.status === 'WARN');

    // §R10 — PIPELINE_SUMMARY (records_total = processed, records_new = newly matched, records_updated = total writes)
    pipeline.emitSummary({
      records_total: processed,
      records_new: 0,
      records_updated: totalMatched,
      records_meta: {
        duration_ms: durationMs,
        coa_processed: processed,
        tier_1a_exact: tier1aExact,
        tier_1b_name_only: tier1bNameOnly,
        no_address_data: noAddressData,
        no_parcel_match: noParcelMatch,
        neighbourhood_matched: neighbourhoodMatched,
        neighbourhood_no_match: neighbourhoodNoMatch,
        lat_lng_written: latLngWritten,
        centroid_outside_polygon: centroidOutsidePolygon,
        ghost_deleted: ghostDeleted,
        per_row_errors: perRowErrors,
        audit_table: {
          phase: 42,
          name: 'CoA Parcel Linking',
          verdict: hasWarn ? 'WARN' : 'PASS',
          rows: auditRows,
        },
      },
    });

    // §R11 — PIPELINE_META declares reads + writes
    pipeline.emitMeta(
      {
        coa_applications: ['id', 'lead_id', 'street_num', 'street_name_normalized', 'parcel_linked_at'],
        parcels: ['id', 'addr_num_normalized', 'street_name_normalized', 'centroid_lat', 'centroid_lng', 'geom'],
        neighbourhoods: ['id', 'geom'],
      },
      {
        lead_parcels: ['lead_id', 'parcel_id', 'match_type', 'confidence', 'matched_at'],
        coa_applications: ['neighbourhood_id', 'latitude', 'longitude', 'parcel_linked_at'],
      }
    );

    pipeline.log.info('[link-coa-to-parcels]', 'Linking complete', {
      processed,
      tier_1a_exact: tier1aExact,
      tier_1b_name_only: tier1bNameOnly,
      no_address_data: noAddressData,
      no_parcel_match: noParcelMatch,
      neighbourhood_matched: neighbourhoodMatched,
      lat_lng_written: latLngWritten,
      centroid_outside_polygon: centroidOutsidePolygon,
      ghost_deleted: ghostDeleted,
      per_row_errors: perRowErrors,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });
  }); // withAdvisoryLock

  // §R12 — SDK already emitted SKIP summary if lock was contended
  if (!lockResult.acquired) return;
});
