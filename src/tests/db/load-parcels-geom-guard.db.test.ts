// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d (#418 DEC-FENCE2)
//
// WF3 2026-09-28 — the parcels write guard must see the DERIVED `geom`, not only the raw
// `geometry` jsonb. `parcels.geom` is `f(geometry)` under a FIXED f (the library polygon arm:
// `ST_Multi(COALESCE(ST_CollectionExtract(ST_MakeValid(g), 3), ST_MakeValid(g)))`), and the
// pre-conversion loader's INSERT column list never carried `geom`, so 9,855 rows sit with
// `geom IS NULL` and 16 with an unrepaired (invalid) geom. Nothing in the write path can ever
// change them, because the guard's disjuncts are all `geometry`-shaped or source-column-shaped
// and `geom` is set unconditionally (`geom = EXCLUDED.geom`) whenever the guard passes.
//
// The contract this file drives, RED today and GREEN once §5 (A+W) lands: a stored `geom` that
// is NULL, or that is not the step's own declared derivation of its source GeoJSON, converges
// on the NEXT run — 1 row RETURNed, and the three DEC-FENCE2 lineage stamps NULLed because the
// shape every enrich-* step reads has changed. It drives the REAL plan built by
// `writeLib.buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS)` — its
// `validation_sql` produces the WKB (so "the declared derivation" is never re-typed here) and
// its `upsertSqlFor(1)`/`bindRow(row)` do the write — inside BEGIN/ROLLBACK against a scratch
// parcel_id (the `load-parcels-ravine-invalidation.db.test.ts` pattern; nothing is committed).
//
// Fences this file must NOT break (each re-proven below): a byte-identical rerun stays a
// no-op (4ce9fffc), an address-only update still writes and still PRESERVES the stamps
// (92ee03b9 (b) DEC-FENCE2), a moved parcel still writes and still NULLs the stamps
// (92ee03b9 (a)), and the same GeoJSON re-serialised still writes nothing (6e058be5).
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL is set (setup-testcontainer).

import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

/** The plan the runner actually executes for THIS descriptor's single write target. */
const plan = writeLib.buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS);

/** The scratch key. Never a real parcel id, and deleted on both ends of every transaction. */
const KEY = 'GEOMGUARD-001';

/** G1 — the valid 0.01° square at (-79.40, 43.70) `load-parcels-ravine-invalidation` also uses. */
const G1 = JSON.stringify({
  type: 'Polygon',
  coordinates: [[[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]]],
});

/** G2 — the same square moved to (-79.30, 43.80): a real coordinate change. */
const G2 = JSON.stringify({
  type: 'Polygon',
  coordinates: [[[-79.30, 43.80], [-79.29, 43.80], [-79.29, 43.81], [-79.30, 43.81], [-79.30, 43.80]]],
});

/**
 * NESTED — a 0.01° square plus a 0.004° square STRICTLY inside it, as one MultiPolygon.
 * Invalid by construction ("Nested shells"): the inner shell is interior to the outer one, so
 * the stored area double-counts. This is the fixture class of the 16 stale geoms (plan G8).
 */
const NESTED = JSON.stringify({
  type: 'MultiPolygon',
  coordinates: [
    [[[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]]],
    [[[-79.398, 43.702], [-79.394, 43.702], [-79.394, 43.706], [-79.398, 43.706], [-79.398, 43.702]]],
  ],
});

/** G1 re-serialised: key order `coordinates, type` and a pretty-printed body (the 6e058be5 fence). */
const G1_RESERIALISED = JSON.stringify(
  {
    coordinates: [[[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]]],
    type: 'Polygon',
  },
  null,
  2,
);

/** G1's ring as a MultiPolygon: different raw jsonb, identical derived geom (the arm applies ST_Multi). */
const G1_AS_MULTI = JSON.stringify({
  type: 'MultiPolygon',
  coordinates: [[[[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]]]],
});

/** The stamp columns DEC-FENCE2 owns (outputs.invalidates[], #418). */
const STAMP_COLUMNS = [
  'ravine_dataset_version_when_enriched',
  'heritage_dataset_version_when_enriched',
  'centreline_dataset_version_when_enriched',
] as const;

describe.skipIf(!dbAvailable())('load-parcels.js — the write guard sees the derived geom (WF3 2026-09-28, real DB)', () => {
  const pool = getTestPool()!;

  /**
   * The step's OWN declared derivation of `geojson`, taken from the plan's validator SQL so
   * this file never re-types the expression (it would then be a second source of truth for
   * "what geom should be", which is exactly the drift the guard exists to catch).
   */
  async function wkbOf(client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ geom_wkb: Buffer }> }> }, geojson: string): Promise<Buffer> {
    const { rows } = await client.query(plan.validation_sql, [[KEY], [geojson]]);
    expect(rows).toHaveLength(1);
    return rows[0]!.geom_wkb;
  }

  /** One row carrying EVERY column this write binds, plus `over` for the case under test. */
  function rowFor(geojson: string, wkb: Buffer, over: Record<string, unknown> = {}): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const column of plan.step_columns as Array<{ name: string }>) row[column.name] = null;
    return {
      ...row,
      parcel_id: KEY,
      feature_type: 'COMMON',
      address_number: '100',
      linear_name_full: 'MAIN ST',
      addr_num_normalized: '100',
      street_name_normalized: 'MAIN',
      street_type_normalized: 'ST',
      lot_size_sqm: 100,
      date_effective: '2020-01-01',
      is_irregular: false,
      geometry: geojson,
      geom: wkb,
      ...over,
    };
  }

  /** The statement the runner issues, at one row. Returns how many rows it RETURNed. */
  async function upsert(client: { query: (sql: string, values: unknown[]) => Promise<{ rows: unknown[] }> }, row: Record<string, unknown>): Promise<number> {
    const { rows } = await client.query(plan.upsertSqlFor(1), plan.bindRow(row));
    return rows.length;
  }

  /** The DEC-FENCE2 stamp precondition: all three lineage stamps set to a known version. */
  async function setStamps(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }): Promise<void> {
    await client.query(
      `UPDATE parcels
          SET ravine_dataset_version_when_enriched = 'rv1',
              heritage_dataset_version_when_enriched = 'hv1',
              centreline_dataset_version_when_enriched = 'cv1'
        WHERE parcel_id = $1`,
      [KEY],
    );
  }

  /** The three stamps, as stored. */
  async function stampsOf(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<Record<string, unknown>> {
    const { rows } = await client.query(
      `SELECT ${STAMP_COLUMNS.join(', ')} FROM parcels WHERE parcel_id = $1`,
      [KEY],
    );
    return rows[0]!;
  }

  /** Every test body's frame: connect, BEGIN, seed the step's own insert, roll back, release. */
  async function inRollback(fn: (client: import('pg').PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM parcels WHERE parcel_id = $1', [KEY]);
      await upsert(client, rowFor(G1, await wkbOf(client, G1)));
      await fn(client);
    } finally {
      // ROLLBACK in `finally`, so a failed assertion never hands a connection with an open
      // (or aborted) transaction back to the pool — nothing this file writes is ever committed.
      await client.query('ROLLBACK');
      client.release();
    }
  }

  afterAll(async () => {
    await pool.query('DELETE FROM parcels WHERE parcel_id = $1', [KEY]);
    await pool.end();
  });

  it('fixture sanity: the NESTED MultiPolygon is INVALID (nested shells) — the 16 stale geoms\' class', async () => {
    const { rows } = await pool.query<{ valid: boolean }>(
      'SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS valid',
      [NESTED],
    );
    expect(rows[0]!.valid).toBe(false);
  });

  it('T-a [RED] WF3 2026-09-28: a stored INVALID (legacy unrepaired) geom converges on the next run — 1 row, valid geom, all 3 DEC-FENCE2 stamps NULLed', async () => {
    await inRollback(async (client) => {
      // The step's own insert, then the LEGACY arm's value: `ST_SetSRID(ST_GeomFromGeoJSON(...))`
      // — the shape 16 rows still carry (plan G8), which nothing in the guard can see.
      await upsert(client, rowFor(NESTED, await wkbOf(client, NESTED)));
      await client.query(
        'UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) WHERE parcel_id = $1',
        [KEY],
      );
      await setStamps(client);

      // The incoming row is IDENTICAL to the stored one in every column the guard compares
      // today — geometry included. Only the derived `geom` differs from its own derivation.
      const returned = await upsert(client, rowFor(NESTED, await wkbOf(client, NESTED)));
      expect(returned, 'a stale derived geom must count as a change').toBe(1);

      const { rows } = await client.query<{ valid: boolean }>(
        'SELECT ST_IsValid(geom) AS valid FROM parcels WHERE parcel_id = $1',
        [KEY],
      );
      expect(rows[0]!.valid, 'the stored geom is now the step\'s own repaired derivation').toBe(true);

      const stamps = await stampsOf(client);
      for (const column of STAMP_COLUMNS) {
        expect(stamps[column], `${column}: the shape the enrichers read changed`).toBeNull();
      }
    });
  });

  it('T-b [RED] WF3 2026-09-28: a NULL stored geom is filled from the step\'s own derivation — 1 row, byte-equal WKB', async () => {
    await inRollback(async (client) => {
      const wkb1 = await wkbOf(client, G1);
      await client.query('UPDATE parcels SET geom = NULL WHERE parcel_id = $1', [KEY]);

      const returned = await upsert(client, rowFor(G1, wkb1));
      expect(returned, 'geom IS NULL is a change against the row\'s own derivation').toBe(1);

      const { rows } = await client.query<{ geom_hex: string }>(
        "SELECT encode(ST_AsBinary(geom), 'hex') AS geom_hex FROM parcels WHERE parcel_id = $1",
        [KEY],
      );
      expect(rows[0]!.geom_hex).toBe(wkb1.toString('hex'));
    });
  });

  it('T-c [GREEN] no-op fence (4ce9fffc): a row stored exactly as the converted step writes it returns 0 rows', async () => {
    await inRollback(async (client) => {
      expect(await upsert(client, rowFor(G1, await wkbOf(client, G1))), 'a byte-identical rerun must write nothing').toBe(0);
    });
  });

  it('T-d [GREEN] DEC-FENCE2 92ee03b9 (b): an address-only update writes and PRESERVES all 3 stamps (geom-invariant)', async () => {
    await inRollback(async (client) => {
      const wkb1 = await wkbOf(client, G1);
      await setStamps(client);

      expect(await upsert(client, rowFor(G1, wkb1, { address_number: '200' }))).toBe(1);

      const { rows } = await client.query<{ address_number: string }>(
        'SELECT address_number FROM parcels WHERE parcel_id = $1',
        [KEY],
      );
      expect(rows[0]!.address_number).toBe('200');

      const stamps = await stampsOf(client);
      expect(stamps.ravine_dataset_version_when_enriched).toBe('rv1');
      expect(stamps.heritage_dataset_version_when_enriched).toBe('hv1');
      expect(stamps.centreline_dataset_version_when_enriched).toBe('cv1');
    });
  });

  it('T-e [GREEN] DEC-FENCE2 92ee03b9 (a): a moved parcel writes and NULLs all 3 stamps (→ recomputed downstream)', async () => {
    await inRollback(async (client) => {
      await setStamps(client);

      expect(await upsert(client, rowFor(G2, await wkbOf(client, G2)))).toBe(1);

      const stamps = await stampsOf(client);
      for (const column of STAMP_COLUMNS) {
        expect(stamps[column], `${column}: a moved parcel can cross a ravine/HCD boundary`).toBeNull();
      }
    });
  });

  it('T-f [GREEN] structural-compare fence (6e058be5): the same GeoJSON RE-SERIALISED (key order + whitespace) returns 0 rows', async () => {
    await inRollback(async (client) => {
      const wkb1 = await wkbOf(client, G1);
      expect(G1_RESERIALISED, 'the fixture must really be a different serialisation of G1').not.toBe(G1);

      expect(await upsert(client, rowFor(G1_RESERIALISED, wkb1)), 'geometry is jsonb — the comparison is structural').toBe(0);
    });
  });

  it('T-g [GREEN] WF3 2026-09-28 §5(ii): raw geometry differs but the derived geom is identical — writes 1 row, geom unchanged, all 3 stamps KEPT', async () => {
    await inRollback(async (client) => {
      const wkb1 = await wkbOf(client, G1);
      const wkbMulti = await wkbOf(client, G1_AS_MULTI);
      expect(wkbMulti.equals(wkb1), 'fixture: both serialisations must derive the same geom').toBe(true);
      await setStamps(client);

      expect(await upsert(client, rowFor(G1_AS_MULTI, wkbMulti)), 'geometry jsonb changed, so the geometry guard term fires').toBe(1);

      const stamps = await stampsOf(client);
      expect(stamps.ravine_dataset_version_when_enriched).toBe('rv1');
      expect(stamps.heritage_dataset_version_when_enriched).toBe('hv1');
      expect(stamps.centreline_dataset_version_when_enriched).toBe('cv1');
    });
  });
});
