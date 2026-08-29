// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §15 (step testing — the fixture rungs, claim #169)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute owns the SQL TEXT, ruling A-2 option 2)
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §Bridge (the ST_Within containment predicate)
//
// RUNG 1 — INLINE WKT, and it is non-negotiable for a spatial containment step (claim #169,
// link_massing precedent: src/tests/steps/link_massing/rung1-inline-wkt.test.ts).
//
// ⚠️ WHAT MAKES THIS RUNG 1 RATHER THAN A UNIT TEST. The geometries below are written by
// hand and small enough to reason about on paper, the expected answer is DERIVED FROM THE
// GEOMETRY rather than from a previous run, and — the part that matters — the SQL under
// test is the PRODUCTION SQL: every query here comes out of
// `scripts/lib/compute/link-parcel-addresses.js buildBatchSql`, the SAME INSERT...SELECT...
// JOIN ST_Within...ON CONFLICT DO NOTHING statement `runMaterializePhase` executes every
// real run via LG-18's `executeInsertSelectNoRetract` (G2's "verbatim" guarantee). A test
// that re-types the predicate proves the tester understood it, never that the step contains
// it.
//
// Skipped unless DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer). Everything
// runs inside BEGIN/ROLLBACK, isolated by fresh SERIAL parcel ids and explicit
// address_point_id values well above the live corpus's range.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute under test
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/link-parcel-addresses.js')) as {
  buildBatchSql: () => string;
};

const BATCH_SQL = compute.buildBatchSql();

/** A hand-written axis-aligned square, as WKT. Near the equator a degree is ~111 km. */
function square(x0: number, y0: number, side: number): string {
  const x1 = x0 + side;
  const y1 = y0 + side;
  return `POLYGON((${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}, ${x0} ${y0}))`;
}

/** address_point_id is an INTEGER PRIMARY KEY (mig 018), not SERIAL — callers supply the id. */
const AP_BASE = 995_000_000;

describe.skipIf(!dbAvailable())('rung 1 — inline WKT through the production batch SQL', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  /** Seed one parcel from WKT, return its (fresh SERIAL) id. */
  async function seedParcel(c: PoolClient, n: number, wkt: string): Promise<number> {
    const r = await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geom) VALUES ($1, 'TEST', ST_GeomFromText($2, 4326)) RETURNING id`,
      [`R1-LPA-${n}`, wkt],
    );
    return Number(r.rows[0].id);
  }

  /** Seed one address point at a WKT POINT — latitude/longitude are NOT NULL (mig 018), derived from the same point. */
  async function seedAddressPoint(c: PoolClient, id: number, wkt: string): Promise<void> {
    await c.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, address_class_desc, geom)
       VALUES ($1, ST_Y(ST_GeomFromText($2, 4326)), ST_X(ST_GeomFromText($2, 4326)), 'Structure', ST_GeomFromText($2, 4326))`,
      [id, wkt],
    );
  }

  /** Runs the production batch SQL scoped to exactly the just-inserted parcel (id > lastId, LIMIT >= 1). */
  async function runBatch(c: PoolClient, lastId: number): Promise<void> {
    await c.query(BATCH_SQL, [lastId, 10, new Date().toISOString()]);
  }

  it('the production batch SQL links an address point INSIDE the parcel polygon', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // A 0.0002-degree square (~22 m); the point sits dead centre.
      const parcelId = await seedParcel(c, 1, square(0, 0, 0.0002));
      const apId = AP_BASE + 1;
      await seedAddressPoint(c, apId, 'POINT(0.0001 0.0001)');
      await runBatch(c, parcelId - 1);
      const hit = await c.query(
        'SELECT 1 FROM parcel_address_points WHERE parcel_id = $1 AND address_point_id = $2',
        [parcelId, apId],
      );
      expect(hit.rows.length, 'the production ST_Within predicate must link a contained address point').toBe(1);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('the production batch SQL does NOT link an address point OUTSIDE the parcel polygon', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const parcelId = await seedParcel(c, 2, square(0, 0, 0.0002));
      const apId = AP_BASE + 2;
      // Well east of the square — bounding boxes do not even touch.
      await seedAddressPoint(c, apId, 'POINT(0.001 0.001)');
      await runBatch(c, parcelId - 1);
      const hit = await c.query(
        'SELECT 1 FROM parcel_address_points WHERE parcel_id = $1 AND address_point_id = $2',
        [parcelId, apId],
      );
      expect(hit.rows.length, 'an address point outside the polygon must not be linked').toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('the production batch SQL skips an address point with NULL geom (G5\'s guard)', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const parcelId = await seedParcel(c, 3, square(0, 0, 0.0002));
      const apId = AP_BASE + 3;
      // NOT NULL lat/lng (schema requires it), but geom left NULL — the pre-conversion
      // script's own guard (ap.geom IS NOT NULL, LG-18's ported predicate).
      await c.query(
        `INSERT INTO address_points (address_point_id, latitude, longitude, address_class_desc) VALUES ($1, 0.0001, 0.0001, 'Structure')`,
        [apId],
      );
      await runBatch(c, parcelId - 1);
      const hit = await c.query(
        'SELECT 1 FROM parcel_address_points WHERE parcel_id = $1 AND address_point_id = $2',
        [parcelId, apId],
      );
      expect(hit.rows.length, 'a NULL-geom address point must never be linked, even at the same coordinates').toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('a second run over the same pair is idempotent — ON CONFLICT DO NOTHING, zero duplicate rows (G3)', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      const parcelId = await seedParcel(c, 4, square(0, 0, 0.0002));
      const apId = AP_BASE + 4;
      await seedAddressPoint(c, apId, 'POINT(0.0001 0.0001)');
      await runBatch(c, parcelId - 1);
      await runBatch(c, parcelId - 1);
      const count = await c.query(
        'SELECT COUNT(*)::int AS n FROM parcel_address_points WHERE parcel_id = $1 AND address_point_id = $2',
        [parcelId, apId],
      );
      expect(count.rows[0].n, 'ON CONFLICT DO NOTHING must produce exactly one row across two identical batch runs').toBe(1);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});

describe('rung 1 — the SQL under test is the production SQL (runs without a database)', () => {
  it('is executed from buildBatchSql, not re-typed here', () => {
    // The guard that keeps this file rung 1. If a future edit inlines a predicate instead of
    // reading it off the compute, these assertions go red rather than the suite quietly
    // testing a copy of the step.
    expect(BATCH_SQL).toMatch(/ST_Within\(ap\.geom,\s*pb\.geom\)/);
    expect(BATCH_SQL).toMatch(/ON CONFLICT \(parcel_id, address_point_id\) DO NOTHING/);
    expect(BATCH_SQL).toMatch(/ap\.geom IS NOT NULL/);
  });
});
