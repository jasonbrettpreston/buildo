// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §15 (step testing — the fixture rungs)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute owns the SQL TEXT, ruling A-2 option 2)
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §3 (the matching predicate)
//
// RUNG 1 — INLINE WKT, and it is non-negotiable for a KNN / containment step (claim #169).
//
// ⚠️ WHAT MAKES THIS RUNG 1 RATHER THAN A UNIT TEST. The geometries below are written by
// hand and small enough to reason about on paper, the expected answer is DERIVED FROM THE
// GEOMETRY rather than from a previous run, and — the part that matters — the SQL under
// test is the PRODUCTION SQL: every query here comes out of
// `scripts/lib/compute/link-massing.js buildMatchSql`, not a paraphrase of it. A test that
// re-types the predicate proves the tester understood it, never that the step contains it.
//
// The three properties fixed here are the three that were BUGS:
//   1. building-centroid-IN-parcel, not the reverse (fence b16c036d) — a house covers ~35%
//      of its lot, so the LOT's centroid lands in the yard and the pre-flip predicate
//      missed most single-family parcels;
//   2. the bounded nearest fallback matches a NEIGHBOURING footprint only inside the
//      declared cap, and refuses outside it (fence d324ab27);
//   3. the ST_Expand bbox prefilter is a SUPERSET of the geography cut (B-10) — if it ever
//      became a subset the prefilter would silently drop true matches, which no
//      performance test would notice.
//
// Skipped unless DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer). Everything
// runs inside BEGIN/ROLLBACK.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute under test
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-massing.js')) as {
  buildMatchSql: (d: unknown, c: Record<string, number> | null, mode?: string) => {
    primary_match_sql: string;
    fallback_match_sql: string;
    fallback_bbox_degrees: number;
    fallback_max_distance: number;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor (guards.srid, eligibility)
const descriptor = require(path.join(REPO_ROOT, 'scripts/link-massing.descriptor.json'));

/** The resolved config a seeded database yields — the values the fixtures are reasoned against. */
const CONFIG = {
  massing_shed_threshold_sqm: 20,
  massing_garage_max_sqm: 60,
  massing_nearest_max_distance_m: 50,
  link_massing_centroid_confidence: 0.95,
  link_massing_nearest_confidence: 0.6,
};

const PLAN = compute.buildMatchSql(descriptor, CONFIG, 'full');

/** A hand-written axis-aligned square, as WKT. Near the equator a degree is ~111 km. */
function square(x0: number, y0: number, side: number): string {
  const x1 = x0 + side;
  const y1 = y0 + side;
  return `POLYGON((${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}, ${x0} ${y0}))`;
}

const PARCEL_BASE = 994_000_000;

describe.skipIf(!dbAvailable())('rung 1 — inline WKT through the production match SQL', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  /** Seed one lot + one footprint from WKT and return the parcel's row id. */
  async function seed(
    c: PoolClient,
    n: number,
    lotWkt: string,
    houseWkt: string,
  ): Promise<number> {
    const lot = await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, centroid_lat, centroid_lng)
       VALUES ($1, 'TEST', ST_AsGeoJSON(ST_GeomFromText($2, 4326))::jsonb, ST_GeomFromText($2, 4326),
               ST_Y(ST_Centroid(ST_GeomFromText($2, 4326))), ST_X(ST_Centroid(ST_GeomFromText($2, 4326))))
       RETURNING id`,
      [PARCEL_BASE + n, lotWkt],
    );
    await c.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, centroid_lat, centroid_lng)
       VALUES ($1, ST_AsGeoJSON(ST_GeomFromText($2, 4326))::jsonb, ST_GeomFromText($2, 4326), 40,
               ST_Y(ST_Centroid(ST_GeomFromText($2, 4326))), ST_X(ST_Centroid(ST_GeomFromText($2, 4326))))
       RETURNING id`,
      [`R1-LM-${n}`, houseWkt],
    );
    return Number(lot.rows[0].id);
  }

  it('the containment pass links a house sitting at the FRONT of its lot — the lot centroid is in the rear yard', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // Lot 0.0002 wide, centroid at (0.0001, 0.0001). House 0.00006 wide at the front,
      // centroid ~(0.00006, 0.00006): INSIDE the lot, while the lot centroid is OUTSIDE the house.
      const id = await seed(c, 1, square(0, 0, 0.0002), square(0.00003, 0.00003, 0.00006));
      const hit = await c.query(PLAN.primary_match_sql.replace(/;$/, ''), [[id]]);
      expect(hit.rows.length, 'the production containment SQL must link the front-of-lot house').toBe(1);
      expect(Number(hit.rows[0].parcel_id)).toBe(id);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('the containment pass does NOT link a footprint whose centroid sits outside the lot', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // The house is entirely east of the lot: bounding boxes still touch nothing, and the
      // centroid is well outside. A match here would mean the predicate reverted.
      const id = await seed(c, 2, square(0, 0, 0.0002), square(0.0004, 0.0004, 0.00006));
      const hit = await c.query(PLAN.primary_match_sql.replace(/;$/, ''), [[id]]);
      expect(hit.rows.length, 'a neighbour must not be contained').toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('the nearest fallback links a neighbouring footprint INSIDE the declared cap and refuses one outside it', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // ~0.0002 degrees of latitude is ~22 m — inside the 50 m cap.
      const near = await seed(c, 3, square(0, 0, 0.0001), square(0, 0.0003, 0.0001));
      const nearHit = await c.query(PLAN.fallback_match_sql.replace(/;$/, ''), [
        [near], PLAN.fallback_bbox_degrees, PLAN.fallback_max_distance,
      ]);
      expect(nearHit.rows.length, 'a footprint ~22 m away is inside the 50 m cap').toBe(1);

      // ~0.002 degrees is ~222 m — well outside.
      const far = await seed(c, 4, square(1, 1, 0.0001), square(1, 1.002, 0.0001));
      const farHit = await c.query(PLAN.fallback_match_sql.replace(/;$/, ''), [
        [far], PLAN.fallback_bbox_degrees, PLAN.fallback_max_distance,
      ]);
      expect(farHit.rows.length, 'a footprint ~222 m away is outside the 50 m cap').toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('B-10 — the ST_Expand prefilter is a SUPERSET of the geography cut, never a subset', async () => {
    // The prefilter exists for speed, but a prefilter NARROWER than the true cut silently
    // drops real matches and no performance test would ever notice. Asserted as a property
    // of the two bounds rather than of one example: the degree span must cover the metre
    // cap at this latitude with room to spare.
    const c: PoolClient = await pool.connect();
    try {
      const { rows } = await c.query(
        `SELECT ST_Distance(
                  ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
                  ST_SetSRID(ST_MakePoint(0, $1::float8), 4326)::geography
                ) AS metres_at_span`,
        [PLAN.fallback_bbox_degrees],
      );
      const metresAtSpan = Number(rows[0].metres_at_span);
      expect(
        metresAtSpan,
        `the ${PLAN.fallback_bbox_degrees} degree prefilter must reach at least the ${PLAN.fallback_max_distance} m cap`,
      ).toBeGreaterThanOrEqual(PLAN.fallback_max_distance);
    } finally { c.release(); }
  });
});

describe('rung 1 — the SQL under test is the production SQL (runs without a database)', () => {
  it('is executed from buildMatchSql, not re-typed here', () => {
    // The guard that keeps this file rung 1. If a future edit inlines a predicate instead of
    // reading it off the compute, these assertions go red rather than the suite quietly
    // testing a copy of the step.
    expect(PLAN.primary_match_sql).toMatch(/ST_Contains\(p\.geom, ST_SetSRID\(ST_MakePoint\(bf\.centroid_lng, bf\.centroid_lat\), 4326\)\)/);
    expect(PLAN.fallback_match_sql).toMatch(/ST_Expand\(p\.geom, \$2\)/);
    expect(PLAN.fallback_match_sql.indexOf('ST_Expand')).toBeLessThan(PLAN.fallback_match_sql.indexOf('ST_DWithin'));
    expect(PLAN.fallback_max_distance).toBe(CONFIG.massing_nearest_max_distance_m);
  });
});
