// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418)
//
// Real-DB integration tests for the #418 incremental-skip in enrich-ravines.js.
// ISOLATION: like enrich-parcels.db.test.ts, every mutating case runs inside a
// BEGIN/ROLLBACK on a dedicated connection and asserts ONLY on its own parcel_id
// prefix ('RAV-418-…') — the container DB is shared across the whole suite, and
// ENRICH_SQL / countStale operate on the WHOLE parcels table, so absolute global
// counts are not stable. We assert the version-scope predicate against our own rows.
//
// Locks:
//  - the staleness predicate (Layer-1): NULL/older stamp ⇒ stale; after an enrich the
//    stamp matches ⇒ not stale (the skip condition); a bumped version re-stales;
//  - Layer-2 scoping recomputes ONLY stale parcels — a "poison" parcel (flag corrupted
//    but stamp current) is NOT recomputed, while a fresh unstamped parcel IS;
//  - a degenerate (zero-area POINT) parcel still gets STAMPED (never perpetually stale);
//  - assertVersionColumn (DEC-E) passes against the migrated schema; countStale runs live.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const er = require('../../../scripts/enrich-ravines.js');

// A ravine box covering lon -79.41..-79.39, lat 43.69..43.71.
const RAVINE = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
const INSIDE = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))',4326)";
const OUTSIDE = "ST_GeomFromText('POLYGON((-79.31 43.80,-79.30 43.80,-79.30 43.81,-79.31 43.81,-79.31 43.80))',4326)";
const POINT = "ST_GeomFromText('POINT(-79.405 43.705)',4326)"; // degenerate (zero-area) but valid

// Stale-count using the EXACT #418 predicate, scoped to this test's parcels so it is
// robust to other suite rows in the shared container.
async function myStale(c: PoolClient, ver: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE parcel_id LIKE 'RAV-418-%' AND geom IS NOT NULL
        AND ravine_dataset_version_when_enriched IS DISTINCT FROM $1`,
    [ver],
  );
  return rows[0].n;
}

describe.skipIf(!dbAvailable())('enrich-ravines.js — #418 incremental skip (real PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('Layer-1: NULL/older stamp is stale; an enrich clears it (skip condition); a bump re-stales', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990201, ${RAVINE}, 'v1')`);
      await c.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-418-IN', ${INSIDE}), ('RAV-418-OUT', ${OUTSIDE})`);
      expect(await myStale(c, 'v1')).toBe(2);          // both NULL-stamped ⇒ stale
      await c.query(er.ENRICH_SQL, ['v1']);
      expect(await myStale(c, 'v1')).toBe(0);          // ⇒ Layer-1 skip condition for my parcels
      expect(await myStale(c, 'v2')).toBe(2);          // a ravines refresh re-stales every parcel
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('enriches correctly: inside ⇒ true/≤0, outside ⇒ false/>0, both stamped', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990201, ${RAVINE}, 'v1')`);
      await c.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-418-IN', ${INSIDE}), ('RAV-418-OUT', ${OUTSIDE})`);
      await c.query(er.ENRICH_SQL, ['v1']);
      const { rows } = await c.query(
        `SELECT parcel_id, is_in_ravine_protection_area AS inr, ravine_distance_m AS dist,
                ravine_dataset_version_when_enriched AS ver
           FROM parcels WHERE parcel_id LIKE 'RAV-418-%' ORDER BY parcel_id`,
      );
      const inside = rows.find((r) => r.parcel_id === 'RAV-418-IN');
      const outside = rows.find((r) => r.parcel_id === 'RAV-418-OUT');
      expect(inside.inr).toBe(true);
      expect(Number(inside.dist)).toBeLessThanOrEqual(0);
      expect(inside.ver).toBe('v1');
      expect(outside.inr).toBe(false);
      expect(Number(outside.dist)).toBeGreaterThan(0);
      expect(outside.ver).toBe('v1');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('Layer-2 scope: recomputes ONLY stale parcels (a current-stamp poison row is left untouched)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990201, ${RAVINE}, 'v1')`);
      await c.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-418-IN', ${INSIDE})`);
      await c.query(er.ENRICH_SQL, ['v1']); // IN ⇒ is_in_ravine true, stamped v1
      // Poison: corrupt the flag but KEEP the current stamp ⇒ the parcel is NOT stale.
      await c.query(`UPDATE parcels SET is_in_ravine_protection_area = false WHERE parcel_id = 'RAV-418-IN'`);
      // A genuinely new, unstamped parcel.
      await c.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-418-NEW', ${INSIDE})`);
      expect(await myStale(c, 'v1')).toBe(1); // only NEW is stale

      await c.query(er.ENRICH_SQL, ['v1']);   // parcel_c is scoped to NEW only
      const { rows } = await c.query(
        `SELECT parcel_id, is_in_ravine_protection_area AS inr, ravine_dataset_version_when_enriched AS ver
           FROM parcels WHERE parcel_id LIKE 'RAV-418-%' ORDER BY parcel_id`,
      );
      const inn = rows.find((r) => r.parcel_id === 'RAV-418-IN');
      const nw = rows.find((r) => r.parcel_id === 'RAV-418-NEW');
      expect(inn.inr).toBe(false); // poison preserved ⇒ the current-stamp parcel was NOT recomputed
      expect(nw.inr).toBe(true);   // the stale parcel WAS recomputed
      expect(nw.ver).toBe('v1');
      expect(await myStale(c, 'v1')).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('a degenerate (zero-area POINT) parcel still gets STAMPED — never perpetually stale', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990201, ${RAVINE}, 'v1')`);
      await c.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-418-PT', ${POINT})`);
      expect(await myStale(c, 'v1')).toBe(1);
      await c.query(er.ENRICH_SQL, ['v1']);
      const { rows } = await c.query(
        `SELECT ravine_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id = 'RAV-418-PT'`,
      );
      expect(rows[0].ver).toBe('v1');         // stamped ⇒ drops out of staleCount
      expect(await myStale(c, 'v1')).toBe(0); // cannot force a recompute on every future run
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('assertVersionColumn passes (DEC-E) and countStale runs against the live table', async () => {
    await expect(er.assertVersionColumn(pool)).resolves.toBeUndefined();
    const n = await er.countStale(pool, 'definitely-not-a-real-version');
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
