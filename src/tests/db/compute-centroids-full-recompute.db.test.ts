// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 12/R-M, §7 rung (a)+(d))
// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
// SPEC LINK: docs/reports/defect-ledger.md (CC-D3)
//
// CC-D3 — THE FULL-MODE REPAIR'S RED-FIRST PROOF. `.cursor/active_task.md`
// "FIX per Spec 124 §7 rung (a)+(d)" (WF3, 2026-08-30, operator "yes to the
// recommendations").
//
// THE DEFECT compute_centroids's own scope (`centroid_lat IS NULL`) never
// revisits an already-filled row, so a stored centroid computed by a RETIRED
// algorithm (the pre-PostGIS-offload JS arithmetic mean) or by an untracked
// bulk seed/restore can drift arbitrarily far from today's
// `ST_Y(ST_Centroid(geom))`/`ST_X(ST_Centroid(geom))` and never self-heal.
// Measured live 2026-08-29: 292,587/486,530 (60.1%) of parcels.
//
// THE FIX — a declared FULL mode (`outputs.writes[1]`, class
// `set_based_scoped`/`set_source:"compute"`, LG-22), reachable ONLY via
// `override.force_full` (`COMPUTE_CENTROIDS_FORCE_FULL`), never scheduled:
//   1. `buildFullRecomputeSql().drift_select_sql` IS the guard — it reads
//      ONLY rows whose stored centroid differs (IS DISTINCT FROM) from a
//      freshly computed ST_Centroid. An identical row is never selected, so
//      it can never reach the UPDATE that follows.
//   2. The exact rows the SELECT returns are persisted as a before-image
//      (`write.persistBeforeImageRows`, R-M generalized to a value-
//      overwriting guarded write) BEFORE any UPDATE runs.
//   3. `write.executeGuardedUpdate` applies the repair to EXACTLY those ids
//      (`WHERE id = ANY($1::int[])`) — never a re-derived predicate, so a
//      batch can never touch a row that was not before-imaged.
//
// ⚠️ WHY THIS FILE CALLS THE LIBRARY FUNCTIONS DIRECTLY, NOT
// `scripts/compute-centroids.js` AS A CHILD PROCESS (unlike migration-245's
// own DB test). `drift_select_sql` scopes `geom IS NOT NULL` — the WHOLE
// TABLE, by design (Rule 1: the guard IS the scope, nothing hidden). Spawning
// the real script with COMPUTE_CENTROIDS_FORCE_FULL=1 against the shared
// loopback dev DB would re-run a 292K-row production repair on every test
// invocation — safe (idempotent by guard) but slow and not what a repeatable
// unit suite should trigger. The ONE LIVE run this WF3 authorizes is recorded
// separately (docs/reports/defect-ledger.md CC-D3, this step's own
// limitations[] entry) — this file proves the MECHANISM (guard, before-image,
// exact-id UPDATE) against two FAR-OUT fixture rows that can never collide
// with a real Toronto parcel, the same isolation strategy migration-245's own
// test uses for ITS fixtures.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/compute-centroids-full-recompute.db.test.ts --no-file-parallelism

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const computeCentroids = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-centroids.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const write = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/compute-centroids.descriptor.json'));

/** Fixture key prefix — every seeded row is deleted by prefix. */
const FX = 'CCD3FULL';
const FX_PARCEL_ID = (n: number) => `${FX}${n}`;

describe.skipIf(!dbAvailable())('CC-D3 — compute_centroids FULL-mode repair (guard, before-image, exact-id UPDATE)', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // Small, realistically-sized ~30m polygons far out in the Pacific (nowhere
  // near Toronto or migration-245's own Atlantic fixtures, so they can never
  // collide with a real spatial fixture or another test file's own rows).
  function farBox(n: number): string {
    const x0 = 165 + n * 0.01;
    const y0 = -45 + n * 0.01;
    const d = 0.0003; // ~30 m at this latitude
    return JSON.stringify({
      type: 'Polygon',
      coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]],
    });
  }

  async function insParcel(pid: string, geomJson: string): Promise<{ id: number; trueLat: number; trueLng: number }> {
    const { rows } = await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))
       RETURNING id, ST_Y(ST_Centroid(geom)) AS true_lat, ST_X(ST_Centroid(geom)) AS true_lng`,
      [pid, geomJson],
    );
    return { id: rows[0].id as number, trueLat: Number(rows[0].true_lat), trueLng: Number(rows[0].true_lng) };
  }

  async function stampCentroid(id: number, lat: number, lng: number): Promise<void> {
    await pool!.query(`UPDATE parcels SET centroid_lat = $2, centroid_lng = $3 WHERE id = $1`, [id, lat, lng]);
  }

  async function readCentroid(id: number) {
    const { rows } = await pool!.query(`SELECT centroid_lat, centroid_lng FROM parcels WHERE id = $1`, [id]);
    return { lat: rows[0].centroid_lat === null ? null : Number(rows[0].centroid_lat), lng: rows[0].centroid_lng === null ? null : Number(rows[0].centroid_lng) };
  }

  async function cleanup(): Promise<void> {
    await pool!.query(`DELETE FROM parcels WHERE parcel_id LIKE $1`, [`${FX}%`]);
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  describe('buildFullRecomputeSql — structural shape (no DB needed)', () => {
    it('update_sql is UPDATE-only (LG-22 forbidden-token boundary) and scoped by id = ANY($1)', () => {
      const sql = computeCentroids.buildFullRecomputeSql(descriptor, {});
      expect(sql.update_sql).toMatch(/\bUPDATE\b/i);
      expect(sql.update_sql).not.toMatch(write.GUARDED_UPDATE_FORBIDDEN_RE);
      expect(sql.update_sql).toMatch(/id\s*=\s*ANY\(\$1/i);
    });

    it('drift_select_sql is the guard predicate — IS DISTINCT FROM the fresh ST_Centroid, scoped by geom IS NOT NULL', () => {
      const sql = computeCentroids.buildFullRecomputeSql(descriptor, {});
      expect(sql.drift_select_sql).toMatch(/geom IS NOT NULL/);
      expect(sql.drift_select_sql).toMatch(/IS DISTINCT FROM/);
      expect(sql.drift_select_sql).toMatch(/ST_Centroid\(geom\)/);
    });

    it('batch_size falls back to a sane default and reads execution.batch_size_from_config when config supplies it', () => {
      const withConfig = computeCentroids.buildFullRecomputeSql(descriptor, {
        [computeCentroids.FULL_RECOMPUTE_BATCH_VAR]: 250,
      });
      expect(withConfig.batch_size).toBe(250);
      const withoutConfig = computeCentroids.buildFullRecomputeSql(descriptor, {});
      expect(withoutConfig.batch_size).toBeGreaterThan(0);
    });
  });

  describe('① the guard — an identical row is never selected, a drifted row is', () => {
    it('a centroid matching the fresh ST_Centroid is EXCLUDED from drift_select_sql; a drifted one is INCLUDED', async () => {
      const a = await insParcel(FX_PARCEL_ID(1), farBox(1)); // will be stamped CORRECT
      const b = await insParcel(FX_PARCEL_ID(2), farBox(2)); // will be stamped DRIFTED

      await stampCentroid(a.id, a.trueLat, a.trueLng); // exact match — guard must exclude
      await stampCentroid(b.id, b.trueLat + 0.01, b.trueLng + 0.01); // ~1km off — guard must include

      const sql = computeCentroids.buildFullRecomputeSql(descriptor, {});
      const { rows } = await pool!.query(sql.drift_select_sql);
      const ids = new Set(rows.map((r: { id: number }) => r.id));

      expect(ids.has(a.id), 'a row whose stored centroid already equals a fresh ST_Centroid must NOT be selected — the guard exists precisely to avoid rewriting it').toBe(false);
      expect(ids.has(b.id), 'a row whose stored centroid differs from a fresh ST_Centroid must be selected — this is the CC-D3 population the repair targets').toBe(true);

      const bRow = rows.find((r: { id: number }) => r.id === b.id);
      expect(Number(bRow.shift_m), 'shift_m must report a real, positive distance for the drifted row').toBeGreaterThan(0);
    });
  });

  describe('② the before-image — persisted BEFORE the update, row count equals the id list, then the exact-id UPDATE repairs only those rows', () => {
    it('persistBeforeImageRows writes exactly the pre-update values, and executeGuardedUpdate touches only the ids it was given', async () => {
      const untouched = await insParcel(FX_PARCEL_ID(3), farBox(3));
      const repaired1 = await insParcel(FX_PARCEL_ID(4), farBox(4));
      const repaired2 = await insParcel(FX_PARCEL_ID(5), farBox(5));

      // `untouched` is deliberately left OUT of the id list below (never
      // before-imaged, never updated) — proves executeGuardedUpdate touches
      // ONLY the exact ids it is given, never a re-derived predicate.
      await stampCentroid(untouched.id, untouched.trueLat + 0.02, untouched.trueLng + 0.02);
      await stampCentroid(repaired1.id, repaired1.trueLat + 0.02, repaired1.trueLng + 0.02);
      await stampCentroid(repaired2.id, repaired2.trueLat + 0.02, repaired2.trueLng + 0.02);

      const sql = computeCentroids.buildFullRecomputeSql(descriptor, {});
      const { rows: drift } = await pool!.query(sql.drift_select_sql);
      const driftIds = new Set(drift.map((r: { id: number }) => r.id));
      expect(driftIds.has(repaired1.id) && driftIds.has(repaired2.id)).toBe(true);

      const beforeImageRows = drift
        .filter((r: { id: number }) => r.id === repaired1.id || r.id === repaired2.id)
        .map((r: { id: number; centroid_lat: number; centroid_lng: number }) => ({ id: r.id, centroid_lat: r.centroid_lat, centroid_lng: r.centroid_lng }));

      const runAt = new Date();
      const bi = write.persistBeforeImageRows(beforeImageRows, 'parcels', 'compute_centroids', runAt);
      expect(bi.written).toBe(true);
      expect(bi.rows, 'before-image row count must equal the number of rows the guard selected').toBe(2);

      const filePath = path.join(REPO_ROOT, bi.path);
      const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length, 'the persisted file must carry exactly one JSONL line per before-imaged row').toBe(2);
      const parsed = lines.map((l) => JSON.parse(l));
      expect(parsed.map((r) => r.id).sort()).toEqual([repaired1.id, repaired2.id].sort());
      // The persisted values are the PRE-repair (drifted) stamp, not the fresh value.
      expect(Number(parsed.find((r) => r.id === repaired1.id).centroid_lat)).toBeCloseTo(repaired1.trueLat + 0.02, 4);
      fs.unlinkSync(filePath);

      const result = await write.executeGuardedUpdate(pool, sql.update_sql, [[repaired1.id, repaired2.id]]);
      expect(result.length, 'executeGuardedUpdate must report exactly the rows it touched').toBe(2);

      const afterRepaired1 = await readCentroid(repaired1.id);
      const afterRepaired2 = await readCentroid(repaired2.id);
      const afterUntouched = await readCentroid(untouched.id);

      expect(afterRepaired1.lat).toBeCloseTo(repaired1.trueLat, 5);
      expect(afterRepaired1.lng).toBeCloseTo(repaired1.trueLng, 5);
      expect(afterRepaired2.lat).toBeCloseTo(repaired2.trueLat, 5);
      expect(afterRepaired2.lng).toBeCloseTo(repaired2.trueLng, 5);
      // `untouched` was never in the id list passed to executeGuardedUpdate —
      // its own deliberately-drifted stamp must survive unchanged.
      expect(afterUntouched.lat).toBeCloseTo(untouched.trueLat + 0.02, 4);
      expect(afterUntouched.lng).toBeCloseTo(untouched.trueLng + 0.02, 4);

      // A SECOND pass over the now-repaired rows must select NEITHER —
      // idempotent_rerun: zero_writes, proven twice-run per Spec 124 §2 Rule 8's
      // "founding commit 7e130bff" discipline.
      const { rows: driftAfter } = await pool!.query(sql.drift_select_sql);
      const idsAfter = new Set(driftAfter.map((r: { id: number }) => r.id));
      expect(idsAfter.has(repaired1.id)).toBe(false);
      expect(idsAfter.has(repaired2.id)).toBe(false);
    });
  });

  describe('③ executeGuardedUpdate structurally refuses a non-UPDATE statement', () => {
    it('rejects a statement containing INSERT INTO / DELETE FROM / TRUNCATE, even if the caller mislabels it', async () => {
      await expect(write.executeGuardedUpdate(pool, 'DELETE FROM parcels WHERE id = ANY($1::int[])', [[]]))
        .rejects.toThrow(/structurally refuses/);
    });
  });

  describe('④ incremental scope is untouched by the FULL-mode addition', () => {
    it('the incremental write target (outputs.writes[0]) keeps its pre-CC-D3 class, guard and scope', () => {
      const incremental = descriptor.outputs.writes[0];
      expect(incremental.write_discipline.class).toBe('write_once_backfill');
      expect(incremental.write_discipline.guard).toBe('none');
      expect(incremental.write_discipline.scope).toBe('geom IS NOT NULL AND centroid_lat IS NULL');
    });

    it('the FULL-mode target is declared as a distinct, second write target', () => {
      expect(descriptor.outputs.writes.length).toBe(2);
      const full = descriptor.outputs.writes[1];
      expect(full.write_discipline.class).toBe('set_based_scoped');
      expect(full.write_discipline.set_source).toBe('compute');
      expect(full.write_discipline.guard).toBe('is_distinct_from');
      expect(full.retract).toBe('none');
    });
  });
});
