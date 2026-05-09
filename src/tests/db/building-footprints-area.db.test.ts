// 🔗 SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2
//             docs/specs/01-pipeline/83_lead_cost_model.md §3 (GFA Step A consumer)
//
// Layer 2 live-DB regression-lock for the building_footprints area
// computation pipeline (mig 122 backfill + load-massing.js post-INSERT
// UPDATE pass).
//
// Why this test exists (WF2 #C 2026-05-09):
//   The shapefile arrives in EPSG:3857 (Web Mercator pseudo-meters). The
//   prior load-massing.js detected the projection and explicitly nulled
//   `footprint_area_sqm`, leaving all 427K rows with NULL areas. Mig 122
//   backfills via PostGIS `ST_Area(ST_Transform(... 3857→4326)::geography)`.
//   This test seeds two known polygons (one Web Mercator, one WGS84) and
//   verifies the SQL produces correct true-square-meter output for both.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

const SOURCE_ID_WEB_MERCATOR = 'TEST-AREA-WEBMERC-9999';
const SOURCE_ID_WGS84 = 'TEST-AREA-WGS84-9999';

// EPSG:3857 polygon — a 100m-side square (in Web Mercator pseudo-meters)
// at Toronto-ish coordinates (~43.65°N, -79.38°W projected). Web Mercator
// distorts area by 1/cos²(latitude); at 43.65°N the factor is ~1.92x.
// So a 100m-side square in Web Mercator units transforms to a real-world
// area of ~5,200 m² (= 10,000 / 1.92), NOT 10,000 m². The test pins the
// transformed value so any future regression in the projection pipeline
// (e.g., dropping the ST_Transform) shows immediately.
//
// Toronto centroid ≈ (-79.38, 43.65) → Web Mercator ≈ (-8838107, 5413956).
// A 100m × 100m square centered at that point: ±50 in each axis.
const WEB_MERCATOR_SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-8838157, 5413906],
      [-8838057, 5413906],
      [-8838057, 5414006],
      [-8838157, 5414006],
      [-8838157, 5413906],
    ],
  ],
};

// Expected real-world area of WEB_MERCATOR_SQUARE after ST_Transform(3857 → 4326)
// and ::geography cast. Empirically ≈ 5,231 m² for the Toronto-latitude
// fixture; allow ±5% tolerance.
const WEB_MERCATOR_SQUARE_EXPECTED_M2 = 5230;

// Same physical 100m × 100m square but in WGS84 lat/lng. Toronto's local
// scale at 43.65°N: 1 degree latitude ≈ 111,320 m; 1 degree longitude ≈
// 80,419 m (= 111,320 × cos(43.65°)). 100m = 0.000898° lat = 0.001244° lng.
const WGS84_SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-79.380622, 43.649551],
      [-79.379378, 43.649551],
      [-79.379378, 43.650449],
      [-79.380622, 43.650449],
      [-79.380622, 43.649551],
    ],
  ],
};

describe.skipIf(!dbAvailable())('building_footprints area backfill — live-DB regression-lock (WF2 #C 2026-05-09)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // Seed both fixtures with NULL areas so we can exercise the backfill.
    // building_footprints requires source_id (UNIQUE) + geometry (NOT NULL JSONB).
    for (const fx of [
      { source_id: SOURCE_ID_WEB_MERCATOR, geom: WEB_MERCATOR_SQUARE },
      { source_id: SOURCE_ID_WGS84, geom: WGS84_SQUARE },
    ]) {
      await pool.query(
        `INSERT INTO building_footprints (source_id, geometry, footprint_area_sqm, footprint_area_sqft)
         VALUES ($1, $2::jsonb, NULL, NULL)
         ON CONFLICT (source_id) DO UPDATE
           SET geometry = EXCLUDED.geometry,
               footprint_area_sqm = NULL,
               footprint_area_sqft = NULL`,
        [fx.source_id, JSON.stringify(fx.geom)],
      );
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM building_footprints WHERE source_id IN ($1, $2)`, [
      SOURCE_ID_WEB_MERCATOR,
      SOURCE_ID_WGS84,
    ]);
    await pool.end();
  });

  it('Web Mercator polygon: PostGIS ST_Transform(3857→4326)::geography returns the cos²(lat)-corrected area (±5%)', async () => {
    if (!pool) return;
    const r = await pool.query<{ area_sqm: string }>(
      `SELECT
        ST_Area(
          ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
        )::text AS area_sqm
       FROM building_footprints
       WHERE source_id = $1`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    expect(r.rowCount).toBe(1);
    const sqm = Number(r.rows[0]!.area_sqm);
    expect(sqm).toBeGreaterThan(WEB_MERCATOR_SQUARE_EXPECTED_M2 * 0.95);
    expect(sqm).toBeLessThan(WEB_MERCATOR_SQUARE_EXPECTED_M2 * 1.05);
  });

  it('WGS84 polygon: same SQL pipeline still produces correct ~10,000 m² when SRID is already 4326', async () => {
    if (!pool) return;
    // The mig 122 SQL ALWAYS sets SRID=3857 then transforms to 4326. For
    // a polygon whose coords are already small WGS84 lat/lng degrees,
    // forcing SRID=3857 gives a malformed-but-stable result that produces
    // a tiny area when transformed. This test establishes the BOUNDARY:
    // the canonical pipeline assumes Web Mercator inputs (which is what
    // the shapefile actually delivers — see Spec 56 §2). Mixed-projection
    // inputs would need a heuristic CASE; not in scope here.
    const r = await pool.query<{ area_3857_then_4326: string; area_native_geog: string }>(
      `SELECT
         ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography)::text AS area_3857_then_4326,
         ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)::geography)::text AS area_native_geog
       FROM building_footprints
       WHERE source_id = $1`,
      [SOURCE_ID_WGS84],
    );
    expect(r.rowCount).toBe(1);
    // The native-geography path on a true WGS84 polygon gives the correct
    // ~10,000 m² answer — a useful reference for Spec 56 §2 documentation.
    const nativeArea = Number(r.rows[0]!.area_native_geog);
    expect(nativeArea).toBeGreaterThan(9500);
    expect(nativeArea).toBeLessThan(10500);
    // The SetSRID(3857)-then-transform path on already-WGS84 coords produces
    // a near-zero or wildly distorted result. Pin the boundary so a future
    // refactor (e.g., heuristic projection detection) is a deliberate change.
    const distortedArea = Number(r.rows[0]!.area_3857_then_4326);
    expect(distortedArea).toBeLessThan(1); // not 10,000 — the pipeline assumes 3857 input
  });

  it('mig 122 backfill applied: prior NULL areas are now populated for the seeded Web Mercator fixture', async () => {
    if (!pool) return;
    // Apply the same SQL the migration uses, scoped to the seeded fixture.
    // (We don't run the migration here — mig 122 is global; this test seeds,
    // then exercises the same SQL pattern against just the seeded row.)
    await pool.query(
      `UPDATE building_footprints
       SET
         footprint_area_sqm = ROUND((ST_Area(
           ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
         ))::numeric, 2),
         footprint_area_sqft = ROUND((ST_Area(
           ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 3857), 4326)::geography
         ) * 10.7639104167)::numeric, 2)
       WHERE source_id = $1 AND footprint_area_sqm IS NULL`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    const r = await pool.query<{ area_sqm: string; area_sqft: string }>(
      `SELECT footprint_area_sqm::text AS area_sqm, footprint_area_sqft::text AS area_sqft
       FROM building_footprints WHERE source_id = $1`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    expect(r.rowCount).toBe(1);
    const sqm = Number(r.rows[0]!.area_sqm);
    const sqft = Number(r.rows[0]!.area_sqft);
    expect(sqm).toBeGreaterThan(WEB_MERCATOR_SQUARE_EXPECTED_M2 * 0.95);
    expect(sqm).toBeLessThan(WEB_MERCATOR_SQUARE_EXPECTED_M2 * 1.05);
    // sqft = sqm × 10.7639104167; sanity-check the conversion within ±0.1%
    expect(sqft).toBeGreaterThan(sqm * 10.76);
    expect(sqft).toBeLessThan(sqm * 10.77);
  });

  it('idempotency: re-running the same UPDATE leaves populated rows unchanged', async () => {
    if (!pool) return;
    // First run already applied; the WHERE IS NULL guard makes the second
    // run a no-op. Verify by running it again and asserting the row still
    // has the same area value.
    const before = await pool.query<{ area_sqm: string }>(
      `SELECT footprint_area_sqm::text AS area_sqm FROM building_footprints WHERE source_id = $1`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    await pool.query(
      `UPDATE building_footprints
       SET footprint_area_sqm = 9999.99
       WHERE source_id = $1 AND footprint_area_sqm IS NULL`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    const after = await pool.query<{ area_sqm: string }>(
      `SELECT footprint_area_sqm::text AS area_sqm FROM building_footprints WHERE source_id = $1`,
      [SOURCE_ID_WEB_MERCATOR],
    );
    // No change because the WHERE IS NULL guard rejected the malicious update.
    expect(after.rows[0]!.area_sqm).toBe(before.rows[0]!.area_sqm);
  });
});
