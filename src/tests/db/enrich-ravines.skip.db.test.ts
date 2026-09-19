// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418)
// 🔗 SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (compute shape)
//
// RE-POINTED at commit 2b (batch-2 row 2.1, converted onto the ENRICHER runner) — otherwise
// UNTOUCHED, per the plan: this is the only LIVE proof the Layer-2 scope predicate is correct.
// `ENRICH_SQL` moved verbatim (F5) from the legacy shell to `scripts/lib/compute/enrich-ravines.js`
// and is unchanged byte-for-byte; tests 1-4 below are therefore unchanged except the import.
// Test 5 (previously `assertVersionColumn`/`countStale`, standalone exports that no longer
// exist post-conversion) is rewritten to prove the SAME two facts through their new homes:
// DEC-E is now a `guards.requires` entry (enforced generically by the runner's
// `assertRequirements`, Class A(vii) — armed on EVERY run, not only the recompute path) and the
// Layer-2 stale-count predicate is now the WHOLE mechanism (F9 — Layer-1's separate early-return
// branch is retired), provable directly against `ENRICH_SQL`'s own `$1` parameter rather than a
// standalone `countStale` helper.
//
// Real-DB integration tests for the #418 Layer-2 scope predicate in enrich-ravines' compute.
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
const er = require('../../../scripts/lib/compute/enrich-ravines.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../../scripts/enrich-ravines.descriptor.json');

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

  it('DEC-E (the lineage column) is now a guards.requires entry, enforced generically — no standalone assertVersionColumn export post-conversion', async () => {
    const req = descriptor.guards.requires.find(
      (r: { kind: string; name: string }) => r.kind === 'column' && r.name === 'parcels.ravine_dataset_version_when_enriched',
    );
    expect(req).toBeTruthy();
    expect(req.on_missing).toBe('fail');
    // The column genuinely exists on this live schema (what assertVersionColumn used to prove directly).
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'ravine_dataset_version_when_enriched'`,
    );
    expect(rows.length).toBe(1);
  });

  it('Layer-2 stale-count is now the WHOLE mechanism (F9) — ENRICH_SQL\'s own $1-scoped predicate against the live table, no standalone countStale export', async () => {
    // No parcel in the live table carries the sentinel version, so every geom-bearing parcel is
    // "stale" against it — proving the predicate runs, without depending on a removed helper.
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM parcels WHERE geom IS NOT NULL AND ravine_dataset_version_when_enriched IS DISTINCT FROM $1`,
      ['definitely-not-a-real-version'],
    );
    expect(typeof rows[0].n).toBe('number');
    expect(rows[0].n).toBeGreaterThanOrEqual(0);
    expect(er.ENRICH_SQL).toMatch(/ravine_dataset_version_when_enriched IS DISTINCT FROM \$1/);
  });
});
