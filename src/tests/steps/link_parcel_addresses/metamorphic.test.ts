// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §15 (claim #172 — metamorphic invariants)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (the compute owns the SQL TEXT)
// SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §Bridge (the containment predicate)
//
// METAMORPHIC INVARIANTS — properties that hold for EVERY input, not for one fixture.
//
// ⚠️ WHY THIS FILE EXISTS SEPARATELY FROM THE RUNG-1 FIXTURES. A fixture says "this parcel
// and this address point link"; it cannot say "the answer does not depend on WHERE in the
// city the pair sits" or "running the batch twice, or in a different insertion order, never
// changes the result". `ST_Within` is a pure geometric containment predicate: it must be
// TRANSLATION-INVARIANT (claim #172's own text — "a parcel translated +1000/+1000 with its
// address points must link identically") and INSERTION-ORDER-INVARIANT (the batch loop's
// keyset pagination makes no ordering promise about the join's row-materialization order).
// Neither property is falsifiable by a single fixture at one coordinate.
//
// Skipped unless DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer). Everything
// runs inside BEGIN/ROLLBACK.
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

function square(x0: number, y0: number, side: number): string {
  const x1 = x0 + side;
  const y1 = y0 + side;
  return `POLYGON((${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}, ${x0} ${y0}))`;
}

const AP_BASE = 996_000_000;
let parcelSeq = 0;
let apSeq = 0;

describe.skipIf(!dbAvailable())('metamorphic — the spatial predicate (PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  async function seedParcel(c: PoolClient, wkt: string): Promise<number> {
    parcelSeq += 1;
    const r = await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geom) VALUES ($1, 'TEST', ST_GeomFromText($2, 4326)) RETURNING id`,
      [`M-LPA-${parcelSeq}`, wkt],
    );
    return Number(r.rows[0].id);
  }

  async function seedAddressPoint(c: PoolClient, wkt: string): Promise<number> {
    apSeq += 1;
    const id = AP_BASE + apSeq;
    // latitude/longitude are DECIMAL(10,7) display-only columns (mig 018) — 3 integer
    // digits max, well short of the +1000 translation offset this file deliberately
    // exercises on `geom`. Only `geom` feeds ST_Within (LG-18's compute-authored predicate
    // reads nothing else), so a fixed in-range dummy here is correct, not a shortcut.
    await c.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, address_class_desc, geom)
       VALUES ($1, 43.0, -79.0, 'Structure', ST_GeomFromText($2, 4326))`,
      [id, wkt],
    );
    return id;
  }

  async function runBatch(c: PoolClient, lastId: number): Promise<void> {
    await c.query(BATCH_SQL, [lastId, 10, new Date().toISOString()]);
  }

  async function linked(c: PoolClient, parcelId: number, apId: number): Promise<boolean> {
    const { rows } = await c.query(
      'SELECT 1 FROM parcel_address_points WHERE parcel_id = $1 AND address_point_id = $2',
      [parcelId, apId],
    );
    return rows.length === 1;
  }

  it('M1 — TRANSLATION INVARIANCE: moving a parcel and its address point together by ANY offset, including +1000/+1000, does not change whether they link', async () => {
    // The claim's own worked example (#172): a parcel translated +1000/+1000 with its
    // address points must link identically. ST_Within on a plain GEOMETRY column (not
    // GEOGRAPHY, mig 039/083/162) never enforces lat/lng range bounds, so this is a genuine
    // property of the predicate, not a coincidence of realistic coordinates.
    const offsets: Array<[number, number]> = [[0, 0], [-79.4, 43.7], [10, -20], [1000, 1000]];
    const c: PoolClient = await pool.connect();
    try {
      for (const [dx, dy] of offsets) {
        await c.query('BEGIN');
        const parcelId = await seedParcel(c, square(dx, dy, 0.0002));
        const insideId = await seedAddressPoint(c, `POINT(${dx + 0.0001} ${dy + 0.0001})`);
        const outsideId = await seedAddressPoint(c, `POINT(${dx + 0.001} ${dy + 0.001})`);
        await runBatch(c, parcelId - 1);
        expect(await linked(c, parcelId, insideId), `offset (${dx}, ${dy}): the contained point must link`).toBe(true);
        expect(await linked(c, parcelId, outsideId), `offset (${dx}, ${dy}): the outside point must not link`).toBe(false);
        await c.query('ROLLBACK');
      }
    } finally { c.release(); }
  });

  it('M2 — INSERTION-ORDER INVARIANCE: the batch loop\'s keyset pagination makes no promise about join row order, so linking a pair before or after an unrelated pair must yield the same result', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // Two independent parcel/address-point pairs, seeded in "address point THEN parcel"
      // order for the second pair (reversed vs. the first) — the join's own ON predicate,
      // not insertion order, must decide the outcome.
      const p1 = await seedParcel(c, square(0, 0, 0.0002));
      const ap1 = await seedAddressPoint(c, 'POINT(0.0001 0.0001)');
      const ap2 = await seedAddressPoint(c, 'POINT(2.0001 2.0001)');
      const p2 = await seedParcel(c, square(2, 2, 0.0002));
      const firstId = Math.min(p1, p2) - 1; // scope the batch to cover both fresh parcels
      await runBatch(c, firstId);
      expect(await linked(c, p1, ap1), 'pair 1 (parcel seeded before its AP) must link').toBe(true);
      expect(await linked(c, p2, ap2), 'pair 2 (AP seeded before its parcel) must link identically').toBe(true);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});

describe('metamorphic — the SQL under test is the production SQL (runs without a database)', () => {
  it('the translation/order invariants above exercise buildBatchSql, not a re-typed predicate', () => {
    expect(BATCH_SQL).toMatch(/ST_Within\(ap\.geom,\s*pb\.geom\)/);
  });
});
