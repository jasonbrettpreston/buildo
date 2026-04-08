// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Implementation
//
// Real-DB integration test for the PostGIS geography cast on permits.location.
// The Phase 0+1 Gemini holistic review caught that ST_DWithin(p.location, ...)
// without an explicit `::geography` cast can resolve to the geometry overload
// and interpret radius_m as DEGREES (1 degree ≈ 111km), making the radius
// filter geographically nonsensical. The fix in commit 43f366a added explicit
// `p.location::geography` casts everywhere — this test locks the runtime
// behavior so a future refactor can't silently regress it.
//
// What it locks in:
//   - Two known-coordinate permits at ~500m and ~5km from a query point
//   - ST_DWithin with radius_m = 1000 (1km) returns ONLY the close one
//   - ST_DWithin with radius_m = 10000 (10km) returns BOTH
//   - If the geography cast were missing, both calls would either return
//     everything (degree interpretation) or nothing (incorrect cast)
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// Toronto City Hall — query origin
const ORIGIN_LAT = 43.6535;
const ORIGIN_LNG = -79.3839;

describe.skipIf(!dbAvailable())('migration 067 — PostGIS geography cast', () => {
  beforeAll(async () => {
    if (!pool) return;
    // Insert 2 fixture permits with controlled coordinates.
    // Permit 1: ~500m east of City Hall (longitude offset only)
    // Permit 2: ~5km north of City Hall (latitude offset)
    await pool.query(`
      INSERT INTO permits (permit_num, revision_num, permit_type, status,
                           latitude, longitude, location)
      VALUES
        ('GEO 999001', '00', 'TEST', 'Permit Issued',
         ${ORIGIN_LAT}, ${ORIGIN_LNG + 0.0062},
         ST_SetSRID(ST_MakePoint(${ORIGIN_LNG + 0.0062}, ${ORIGIN_LAT}), 4326)),
        ('GEO 999002', '00', 'TEST', 'Permit Issued',
         ${ORIGIN_LAT + 0.045}, ${ORIGIN_LNG},
         ST_SetSRID(ST_MakePoint(${ORIGIN_LNG}, ${ORIGIN_LAT + 0.045}), 4326))
      ON CONFLICT DO NOTHING
    `);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM permits WHERE permit_num LIKE 'GEO 99900%'");
    await pool.end();
  });

  it('ST_DWithin with 1km radius returns ONLY the ~500m permit', async () => {
    if (!pool) return;
    const res = await pool.query<{ permit_num: string }>(
      `SELECT permit_num FROM permits
        WHERE permit_num LIKE 'GEO 99900%'
          AND ST_DWithin(
            location::geography,
            ST_MakePoint($1::float8, $2::float8)::geography,
            1000
          )`,
      [ORIGIN_LNG, ORIGIN_LAT],
    );
    const nums = res.rows.map((r) => r.permit_num);
    expect(nums).toEqual(['GEO 999001']);
  });

  it('ST_DWithin with 10km radius returns BOTH fixture permits', async () => {
    if (!pool) return;
    const res = await pool.query<{ permit_num: string }>(
      `SELECT permit_num FROM permits
        WHERE permit_num LIKE 'GEO 99900%'
          AND ST_DWithin(
            location::geography,
            ST_MakePoint($1::float8, $2::float8)::geography,
            10000
          )
        ORDER BY permit_num`,
      [ORIGIN_LNG, ORIGIN_LAT],
    );
    expect(res.rows.map((r) => r.permit_num)).toEqual([
      'GEO 999001',
      'GEO 999002',
    ]);
  });

  it('distance via <-> operator returns meters (not degrees)', async () => {
    if (!pool) return;
    // The ~500m permit should report distance < 700m. If the geography
    // cast were absent, the operator would return degrees (a tiny float).
    const res = await pool.query<{ d: number }>(
      `SELECT (location::geography <-> ST_MakePoint($1::float8, $2::float8)::geography)::float8 AS d
         FROM permits
        WHERE permit_num = 'GEO 999001'`,
      [ORIGIN_LNG, ORIGIN_LAT],
    );
    const d = res.rows[0]?.d ?? -1;
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(700);
  });
});
