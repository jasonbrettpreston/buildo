// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (compute_centroids + link_parcels steps)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels / enrich_parcels steps)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §10 (P1)
// SPEC LINK: migrations/242_parcels_geom_invalidation_trigger.sql (the two arms this extends)
// SPEC LINK: migrations/245_parcels_centroid_geom_invalidation.sql (the fourth arm)
//
// P1 — THE CENTROID INVALIDATOR. THE RED-FIRST PROOF for
// `.cursor/active_task.md` §"P1 — The centroid invalidator" (filed HIGH
// 2026-08-23).
//
// THE DEFECT. `parcels.centroid_lat` / `centroid_lng` are geometry-derived
// (`compute-centroids.js:105` fills ONLY `WHERE geom IS NOT NULL AND
// centroid_lat IS NULL` — a one-way fill, never a refresh) and they are the
// join key for `link-parcels.js:415-423`'s Tier-3 centroid-proximity fallback.
// NOTHING invalidates them on ANY write path:
//   · migration 242's `BEFORE UPDATE OF geom, geometry` trigger NULLs
//     `massing_enriched_at` / `zoning_enriched_at` only;
//   · `load-parcels.js:353-361` (DEC-FENCE2 / #418) NULLs the three
//     `*_dataset_version_when_enriched` stamps only, and only inside its own
//     UPSERT.
// A moved parcel therefore keeps a stale centroid FOREVER — and a stale
// centroid does not read as missing data, it reads as a confident wrong
// answer at a spatial join. The fix (migration 245) adds the fourth arm to
// 242's trigger FUNCTION via `CREATE OR REPLACE` — never by editing 242,
// which is already applied and would not re-run.
//
// ⛔ TRAP ① — THE NAIVE VERSION FALSE-GREENS ON DEFAULTS. A freshly INSERTed
// parcel has `centroid_lat = NULL` already (migration 016 added the columns
// with no DEFAULT; `compute-centroids.js` is the only writer). A test that
// inserts a parcel, moves it, and asserts `toBeNull()` PASSES IDENTICALLY
// whether the fix landed or not — it proves the default, not the trigger.
// Every case below therefore STAMPS a non-NULL centroid first and asserts
// that stamp is non-NULL before provoking anything.
//
// ⛔ TRAP ② — `IS DISTINCT FROM`, NOT "the column was in the SET list". The
// Postgres `UPDATE OF geom, geometry` contract fires on column MEMBERSHIP of
// the SET list, not on a value change, and `load-parcels.js`'s UPSERT lists
// both columns whenever ANY tracked field moved. 242 guards this internally
// with `IS DISTINCT FROM`; the fourth arm must sit INSIDE that same guard, or
// every address-only reload silently discards ~486K correct centroids and
// forces a full recompute. Case ③ is that guard's lock — it is the case that
// goes red if a future edit "simplifies" the arm out of the IF.
//
// ⛔ TRAP ③ — A NON-GEOMETRY UPDATE IS NOT THIS DEFECT. `BEFORE UPDATE OF
// geom, geometry` never fires for an UPDATE whose SET list omits both. A case
// that mutates `lot_size_sqm` and expects invalidation would be red forever
// and would be red for the wrong reason. Every provocation below SETs geom
// and/or geometry explicitly.
//
// ⛔ TRAP ④ — THE REFILL PROOF MUST ASSERT THE VALUE, NOT THE EXIT CODE.
// `compute-centroids.js` runs under advisory lock 99 and returns exit 0 on a
// lock miss (§R12 SKIP) and exit 0 again on its `totalParcels === 0` early
// return. A refill assertion that checks `status === 0` proves nothing: it is
// green on a run that computed nothing at all. Case ④ reads the refilled
// coordinates back out of the row and pins them to the NEW geometry.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/migration-245-centroid-invalidation.db.test.ts --no-file-parallelism

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const CENTROIDS_SCRIPT = path.join(REPO_ROOT, 'scripts/compute-centroids.js');

/** Fixture key prefix — every seeded row is deleted by prefix. */
const FX = 'P1CENTR';
const FX_PARCEL_ID = (n: number) => `${FX}${n}`;

describe.skipIf(!dbAvailable())('migration 245 — geometry change invalidates parcels.centroid_lat/lng', () => {
  if (!pool) {
    // C1/C4 pattern: throw ONLY when opted in — a missing pool there is a real
    // defect, not the designed plain-mode skip.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1/C4/C7 pattern) ──
  // setup-testcontainer.ts:41-46 returns EARLY on an ambient DATABASE_URL before
  // ever consulting BUILDO_TEST_DB, so dbAvailable() alone does not prove this is
  // a disposable container. Case ④ spawns scripts/compute-centroids.js, which
  // issues an unbounded `UPDATE parcels SET centroid_lat = …` over EVERY row with
  // a NULL centroid. Refusing to run against anything but an explicit opt-in +
  // loopback host is what keeps a stray DATABASE_URL from pointing that at a real
  // database.
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn a child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'migration-245-centroid-invalidation.db.test.ts spawns scripts/compute-centroids.js, which runs an ' +
      'unbounded UPDATE over every NULL-centroid parcel. Refusing to run without an explicit opt-in ' +
      '(BUILDO_TEST_DB=1 or CI=true) — an ambient DATABASE_URL is NOT sufficient, because ' +
      'setup-testcontainer.ts:41-46 short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to seed fixtures and spawn a mutating child against non-loopback host "${dbUrl.hostname}".`);
  }
  if (dbUrl.pathname.length <= 1) {
    throw new Error(`DATABASE_URL has no database path: ${dbUrl.protocol}//${dbUrl.host}${dbUrl.pathname}`);
  }
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
  };

  // Small, realistically-sized ~30m polygons far out in the Atlantic (nowhere
  // near Toronto, so they can never collide with a real spatial fixture).
  // Consecutive `n` values are ~1 km apart at this latitude — far enough that a
  // refilled centroid is unambiguously the NEW geometry's, not the old one's
  // (see ⛔ TRAP ④: a 1 cm move would make case ④'s assertion undecidable).
  function farBox(n: number): string {
    const x0 = -35 + n * 0.01;
    const y0 = 45 + n * 0.01;
    const d = 0.0003; // ~30 m at this latitude
    return JSON.stringify({
      type: 'Polygon',
      coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]],
    });
  }

  async function insParcel(pid: string, geomJson: string): Promise<number> {
    const { rows } = await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326)) RETURNING id`,
      [pid, geomJson],
    );
    return rows[0].id as number;
  }

  /**
   * Stamp a parcel with a non-NULL centroid + both migration-242 watermarks.
   * ⛔ TRAP ① lives here: without this stamp the whole file false-greens.
   */
  async function stampAll(id: number): Promise<void> {
    await pool!.query(
      `UPDATE parcels
          SET centroid_lat = 45.5, centroid_lng = -35.5,
              massing_enriched_at = NOW(), zoning_enriched_at = NOW()
        WHERE id = $1`,
      [id],
    );
    const { rows } = await pool!.query(
      `SELECT centroid_lat, centroid_lng, massing_enriched_at, zoning_enriched_at FROM parcels WHERE id = $1`,
      [id],
    );
    expect(rows[0].centroid_lat, 'precondition: the centroid stamp must be non-NULL before provocation').not.toBeNull();
    expect(rows[0].centroid_lng, 'precondition: the centroid stamp must be non-NULL before provocation').not.toBeNull();
    expect(rows[0].massing_enriched_at, 'precondition: migration 242 watermark must be non-NULL').not.toBeNull();
    expect(rows[0].zoning_enriched_at, 'precondition: migration 242 watermark must be non-NULL').not.toBeNull();
  }

  async function readRow(id: number) {
    const { rows } = await pool!.query(
      `SELECT centroid_lat, centroid_lng, massing_enriched_at, zoning_enriched_at,
              ST_X(ST_Centroid(geom)) AS true_lng, ST_Y(ST_Centroid(geom)) AS true_lat
         FROM parcels WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async function cleanup(): Promise<void> {
    await pool!.query(`DELETE FROM parcels WHERE parcel_id LIKE $1`, [`${FX}%`]);
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  // =========================================================================
  // ① THE RED-FIRST PROOF — a geometry move NULLs BOTH centroid columns
  // =========================================================================
  describe('① geometry change invalidates the centroid (✓red before migration 245)', () => {
    it('a parcel geometry change NULLs centroid_lat AND centroid_lng', async () => {
      const id = await insParcel(FX_PARCEL_ID(1), farBox(1));
      await stampAll(id);

      // The geometry-change event in its most literal form: the parcel's own
      // geom moves ~1 km. Both columns are in the SET list (⛔ TRAP ③) and the
      // value genuinely differs (⛔ TRAP ②).
      await pool!.query(
        `UPDATE parcels
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb
          WHERE id = $1`,
        [id, farBox(2)],
      );

      const after = await readRow(id);
      // THE red-first assertion — no invalidator exists on any write path today,
      // so the centroid survives the move and now points ~1 km from the parcel.
      expect(
        after.centroid_lat,
        'a parcel geometry change must invalidate (NULL) centroid_lat — it did not; the stale centroid is ' +
          'link-parcels.js:415-423\'s Tier-3 join key.',
      ).toBeNull();
      expect(
        after.centroid_lng,
        'a parcel geometry change must invalidate (NULL) centroid_lng — it did not.',
      ).toBeNull();
    });

    it('the same invalidation fires when ONLY geom is in the SET list', async () => {
      const id = await insParcel(FX_PARCEL_ID(2), farBox(3));
      await stampAll(id);
      await pool!.query(
        `UPDATE parcels SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326) WHERE id = $1`,
        [id, farBox(4)],
      );
      const after = await readRow(id);
      expect(after.centroid_lat).toBeNull();
      expect(after.centroid_lng).toBeNull();
    });

    it('the same invalidation fires when ONLY the geometry jsonb is in the SET list', async () => {
      const id = await insParcel(FX_PARCEL_ID(3), farBox(5));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geometry = $2::jsonb WHERE id = $1`, [id, farBox(6)]);
      const after = await readRow(id);
      expect(after.centroid_lat).toBeNull();
      expect(after.centroid_lng).toBeNull();
    });
  });

  // =========================================================================
  // ② REGRESSION LOCK — migration 245 CREATE OR REPLACEs 242's function body.
  //    The two arms 242 shipped must survive the replacement verbatim.
  // =========================================================================
  describe('② migration 242\'s existing arms survive the CREATE OR REPLACE', () => {
    it('a geometry change still NULLs massing_enriched_at and zoning_enriched_at', async () => {
      const id = await insParcel(FX_PARCEL_ID(4), farBox(7));
      await stampAll(id);
      await pool!.query(
        `UPDATE parcels
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb
          WHERE id = $1`,
        [id, farBox(8)],
      );
      const after = await readRow(id);
      expect(after.massing_enriched_at, 'migration 242 arm 1 was dropped by the replacement').toBeNull();
      expect(after.zoning_enriched_at, 'migration 242 arm 2 was dropped by the replacement').toBeNull();
    });

    it('the trigger is still BEFORE UPDATE OF geom, geometry on parcels (245 replaces the FUNCTION, not the trigger)', async () => {
      const { rows } = await pool!.query(
        `SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname = 'trg_parcels_geom_invalidation'`,
      );
      expect(rows.length, 'migration 242\'s trigger must still exist').toBe(1);
      expect(rows[0].def).toMatch(/BEFORE UPDATE OF geom, geometry/);
      expect(rows[0].def).toMatch(/FOR EACH ROW/);
      expect(rows[0].def).toMatch(/trg_parcels_invalidate_on_geom_change\(\)/);
    });
  });

  // =========================================================================
  // ③ THE `IS DISTINCT FROM` LOCK (⛔ TRAP ②) — a no-op re-SET must NOT
  //    invalidate. This is the case that goes red if the fourth arm is ever
  //    lifted out of 242's guard.
  // =========================================================================
  describe('③ a same-value re-SET of geom/geometry is a no-op', () => {
    it('re-SETting geom and geometry to their CURRENT values preserves the centroid and both watermarks', async () => {
      const box = farBox(9);
      const id = await insParcel(FX_PARCEL_ID(5), box);
      await stampAll(id);

      // load-parcels.js's UPSERT lists geom + geometry on EVERY tracked-field
      // change, including address-only updates. That must stay free.
      await pool!.query(
        `UPDATE parcels
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb
          WHERE id = $1`,
        [id, box],
      );

      const after = await readRow(id);
      expect(
        after.centroid_lat,
        'an address-only reload re-lists geom in its SET clause; discarding ~486K correct centroids on that ' +
          'is the regression the IS DISTINCT FROM guard exists to prevent.',
      ).not.toBeNull();
      expect(after.centroid_lng).not.toBeNull();
      expect(after.massing_enriched_at).not.toBeNull();
      expect(after.zoning_enriched_at).not.toBeNull();
    });

    it('an UPDATE that touches neither geom nor geometry preserves the centroid (⛔ TRAP ③)', async () => {
      const id = await insParcel(FX_PARCEL_ID(6), farBox(10));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET lot_size_sqm = 900 WHERE id = $1`, [id]);
      const after = await readRow(id);
      expect(after.centroid_lat).not.toBeNull();
      expect(after.centroid_lng).not.toBeNull();
    });
  });

  // =========================================================================
  // ④ THE REFILL PROOF — compute_centroids picks the invalidated parcel back
  //    up on its next run and recomputes it FROM THE NEW GEOMETRY.
  //    ⛔ TRAP ④: assert the VALUE, never the exit code.
  // =========================================================================
  describe('④ the next compute_centroids run refills the invalidated centroid', () => {
    it(
      'a parcel whose centroid was invalidated by a geometry move is recomputed to the NEW geometry',
      async () => {
        const id = await insParcel(FX_PARCEL_ID(7), farBox(11));
        await stampAll(id);
        const stamped = await readRow(id);
        const stampedLat = Number(stamped.centroid_lat);

        await pool!.query(
          `UPDATE parcels
              SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), geometry = $2::jsonb
            WHERE id = $1`,
          [id, farBox(12)],
        );
        const invalidated = await readRow(id);
        expect(invalidated.centroid_lat, 'the invalidator must have fired before the refill can be proven').toBeNull();

        // compute-centroids.js:105 fills `WHERE geom IS NOT NULL AND
        // centroid_lat IS NULL` — the invalidated row now satisfies that
        // predicate. Prove it by running the REAL script.
        const r = spawnSync('node', [CENTROIDS_SCRIPT], {
          env: childEnv as NodeJS.ProcessEnv,
          encoding: 'utf8',
          timeout: 120_000,
          maxBuffer: 32 * 1024 * 1024,
        });
        expect(r.error, `child process failed to run/complete: ${r.error?.message}`).toBeUndefined();
        expect(r.status, `compute-centroids.js exited ${r.status}\n${r.stderr}`).toBe(0);

        const refilled = await readRow(id);
        // ⛔ TRAP ④ — the VALUE, not the exit code. Exit 0 is also what a
        // lock-miss SKIP and a zero-work early return produce.
        expect(refilled.centroid_lat, 'compute_centroids did not refill the invalidated centroid').not.toBeNull();
        expect(refilled.centroid_lng).not.toBeNull();

        // …and it is the NEW geometry's centroid, not a replay of the old stamp.
        expect(Number(refilled.centroid_lat)).not.toBeCloseTo(stampedLat, 4);
        expect(Number(refilled.centroid_lat)).toBeCloseTo(Number(refilled.true_lat), 5);
        expect(Number(refilled.centroid_lng)).toBeCloseTo(Number(refilled.true_lng), 5);
      },
      180_000,
    );
  });
});
