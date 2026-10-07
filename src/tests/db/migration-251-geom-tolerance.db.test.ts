// SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (owner — Known Failure Modes: an exact comparator over a publisher-jittered float source)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4 (the geometry-change trigger)
// SPEC LINK: migrations/251_parcels_geom_material_change.sql (the predicate + the rewired trigger function)
//
// WF3 parcels geom drift, Commit 1 — red-first proof (.cursor/wf3_parcels_geom_drift_tolerance_active_task.md,
// locks L0, L1/L5 at trigger altitude, L2, L3, L4, L6, L7, L8, L14).
//
// THE DEFECT. The CKAN Property Boundaries publish re-serialises every parcel with sub-millimetre
// vertex jitter and arbitrary ring start vertices (measured: 99.83 % of 485,547 rows moved < 1e-8°).
// trg_parcels_invalidate_on_geom_change() compared geom with IS DISTINCT FROM, so a no-op re-export
// NULLed massing / zoning / centroid and the three dataset-version stamps on ~every parcel.
// Migration 251 adds public.parcels_geom_materially_changed() (tolerance = logic variable
// parcels_geom_change_tolerance_deg, default 1e-7°) and rewires the trigger onto it.
//
// ⛔ TRAP ① (from the 245/249 tests): a fresh parcel has NULL stamps, so every case STAMPS all 7
// columns first and asserts the precondition.
// ⛔ TRAP ②: the loader-level L1/L5 (RETURNING 0, stored bytes kept) are Commit 2 — a trigger cannot
// veto a write. Here L1/L5 run at TRIGGER altitude: the write lands, but nothing is invalidated.
// ⛔ TRAP ③: tolerance-row mutations run inside BEGIN/ROLLBACK on ONE client, never on the pool.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/migration-251-geom-tolerance.db.test.ts --no-file-parallelism
// Perf measurement (opt-in, not a lock): BUILDO_GEOM_PERF=1 on the same command.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const stepLib = require(path.join(process.cwd(), 'scripts/lib/step/index.js'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

/** The plan the runner executes for load_parcels — its validation_sql derives geom exactly as production does. */
const plan = writeLib.buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS);
const VALIDATION_SQL: string = plan.validation_sql;

const pool = getTestPool();
const FX = 'GEOMTOL';
const FX_PARCEL_ID = (n: number) => `${FX}${n}`;
const VAR = 'parcels_geom_change_tolerance_deg';
const MIGRATION = path.join(process.cwd(), 'migrations/251_parcels_geom_material_change.sql');
const STAMPS = [
  'ravine_dataset_version_when_enriched',
  'heritage_dataset_version_when_enriched',
  'centreline_dataset_version_when_enriched',
] as const;
const FOUR = ['massing_enriched_at', 'zoning_enriched_at', 'centroid_lat', 'centroid_lng'] as const;
const SEVEN = [...FOUR, ...STAMPS] as const;

type Pt = [number, number];
type Ring = Pt[];
const D = 0.0003; // ~30 m box

/** A ~30 m box in the Atlantic, ~1 km apart per n — never near a real Toronto fixture. */
function boxRing(n: number): Ring {
  const x0 = -36 + n * 0.01;
  const y0 = 44 + n * 0.01;
  return [[x0, y0], [x0 + D, y0], [x0 + D, y0 + D], [x0, y0 + D], [x0, y0]];
}
const poly = (ring: Ring) => JSON.stringify({ type: 'Polygon', coordinates: [ring] });
/** Every vertex moved by a deterministic, non-uniform offset of at most 1e-9° (the measured jitter band). */
function jitter(ring: Ring, seed = 1): Ring {
  const moved: Ring = ring.slice(0, -1).map(([x, y], i): Pt => [
    x + (((i * 7 + seed * 3) % 5) - 2) * 0.5e-9,
    y + (((i * 3 + seed * 5) % 5) - 2) * 0.5e-9,
  ]);
  return [...moved, moved[0]!];
}
/** The same ring started at vertex k (closed). */
function rotate(ring: Ring, k: number): Ring {
  const open = ring.slice(0, -1);
  const r = [...open.slice(k), ...open.slice(0, k)];
  return [...r, r[0]!];
}
const translate = (ring: Ring, dx: number, dy = 0): Ring => ring.map(([x, y]): Pt => [x + dx, y + dy]);
/** A vertex added 1e-5° (≈1.1 m) outside the midpoint of the first edge. */
function protrude(ring: Ring): Ring {
  const a = ring[0]!;
  const b = ring[1]!;
  return [a, [(a[0] + b[0]) / 2, a[1] - 1e-5], ...ring.slice(1)];
}

describe.skipIf(!dbAvailable())('migration 251 — parcels geometry change is judged by a tolerance predicate', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  async function insParcel(pid: string, geomJson: string | null, geometryJson?: string): Promise<number> {
    const { rows } = await pool!.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
       VALUES ($1, 'TEST', $2::jsonb,
               CASE WHEN $3::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326)) END)
       RETURNING id`,
      [pid, geometryJson ?? geomJson, geomJson],
    );
    return rows[0].id as number;
  }

  /** The loader's write shape: geometry jsonb + geom derived from it, in one UPDATE. */
  async function reload(id: number, geomJson: string, extraSet = ''): Promise<void> {
    await pool!.query(
      `UPDATE parcels
          SET geometry = $2::jsonb,
              geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))${extraSet}
        WHERE id = $1`,
      [id, geomJson],
    );
  }

  async function readRow(id: number) {
    const { rows } = await pool!.query(
      `SELECT ${SEVEN.join(', ')}, address_number FROM parcels WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  /** Stamp all 7 invalidated columns non-NULL (⛔ TRAP ①) and assert the stamp landed. */
  async function stampAll(id: number): Promise<void> {
    await pool!.query(
      `UPDATE parcels
          SET ravine_dataset_version_when_enriched = 'rav-v1',
              heritage_dataset_version_when_enriched = 'her-v1|her-v1',
              centreline_dataset_version_when_enriched = 'cl-v1',
              centroid_lat = 44.5, centroid_lng = -36.5,
              massing_enriched_at = NOW(), zoning_enriched_at = NOW()
        WHERE id = $1`,
      [id],
    );
    const row = await readRow(id);
    for (const c of SEVEN) expect(row[c], `precondition: ${c} must be non-NULL before provocation`).not.toBeNull();
  }

  function expectKept(row: Record<string, unknown>, cols: readonly string[], why: string): void {
    for (const c of cols) expect(row[c], `${c} must be KEPT — ${why}`).not.toBeNull();
  }
  function expectNulled(row: Record<string, unknown>, cols: readonly string[], why: string): void {
    for (const c of cols) expect(row[c], `${c} must be NULLed — ${why}`).toBeNull();
  }

  /** Predicate on two WKT shapes (SRID 4326 unless given); a null WKT is a NULL geometry. */
  async function m(a: string | null, b: string | null, sridA = 4326, sridB = 4326, client?: PoolClient): Promise<boolean | null> {
    const text = `SELECT public.parcels_geom_materially_changed(ST_GeomFromText($1::text, $3::int), ST_GeomFromText($2::text, $4::int)) AS m`;
    const values = [a, b, sridA, sridB];
    const { rows } = client ? await client.query(text, values) : await pool!.query(text, values);
    return rows[0].m as boolean | null;
  }

  async function inRollback(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  async function cleanup(): Promise<void> {
    await pool!.query(`DELETE FROM parcels WHERE parcel_id LIKE $1`, [`${FX}%`]);
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  // WKT fixtures for the predicate unit cases (L8): a ~30 m square near Toronto.
  const X0 = -79.4;
  const Y0 = 43.7;
  const X1 = X0 + D;
  const Y1 = Y0 + D;
  const SQ = `POLYGON((${X0} ${Y0},${X1} ${Y0},${X1} ${Y1},${X0} ${Y1},${X0} ${Y0}))`;
  const SQ_JIT = `POLYGON((${X0 + 1e-9} ${Y0},${X1} ${Y0 - 1e-9},${X1 - 1e-9} ${Y1},${X0} ${Y1 + 1e-9},${X0 + 1e-9} ${Y0}))`;
  const SQ_ROT = `POLYGON((${X1} ${Y1},${X0} ${Y1},${X0} ${Y0},${X1} ${Y0},${X1} ${Y1}))`;
  const SQ_MOVED = `POLYGON((${X0 + 1e-5} ${Y0},${X1 + 1e-5} ${Y0},${X1 + 1e-5} ${Y1},${X0 + 1e-5} ${Y1},${X0 + 1e-5} ${Y0}))`;
  const SQ_COLLINEAR = `POLYGON((${X0} ${Y0},${(X0 + X1) / 2} ${Y0},${X1} ${Y0},${X1} ${Y1},${X0} ${Y1},${X0} ${Y0}))`;
  const BOWTIE = `POLYGON((${X0} ${Y0},${X1} ${Y1},${X1} ${Y0},${X0} ${Y1},${X0} ${Y0}))`;
  const HX0 = X0 + D / 3;
  const HX1 = X0 + (2 * D) / 3;
  const HY0 = Y0 + D / 3;
  const HY1 = Y0 + (2 * D) / 3;
  const SQ_HOLE = `POLYGON((${X0} ${Y0},${X1} ${Y0},${X1} ${Y1},${X0} ${Y1},${X0} ${Y0}),(${HX0} ${HY0},${HX0} ${HY1},${HX1} ${HY1},${HX1} ${HY0},${HX0} ${HY0}))`;
  const MP1 = `MULTIPOLYGON(((${X0} ${Y0},${X1} ${Y0},${X1} ${Y1},${X0} ${Y1},${X0} ${Y0})))`;
  const MP2 = `MULTIPOLYGON(((${X0} ${Y0},${X1} ${Y0},${X1} ${Y1},${X0} ${Y1},${X0} ${Y0})),((${X0 + 1} ${Y0},${X1 + 1} ${Y0},${X1 + 1} ${Y1},${X0 + 1} ${Y1},${X0 + 1} ${Y0})))`;

  describe('L0 — the predicate exists and its tolerance row is seeded (red before migration 251)', () => {
    it('public.parcels_geom_materially_changed(geometry, geometry) is registered', async () => {
      const { rows } = await pool!.query(
        `SELECT to_regprocedure('public.parcels_geom_materially_changed(geometry,geometry)') IS NOT NULL AS present`,
      );
      expect(rows[0].present).toBe(true);
    });

    it(`logic variable ${VAR} is seeded at 1e-7`, async () => {
      const { rows } = await pool!.query(`SELECT variable_value::float8 AS v FROM logic_variables WHERE variable_key = $1`, [VAR]);
      expect(rows).toHaveLength(1);
      expect(rows[0].v).toBe(1e-7);
    });

    it('the live trigger body keeps the literal NEW.<col> := NULL arm for all 7 columns (FLEET-2 requirement probe)', async () => {
      const { rows } = await pool!.query(
        `SELECT p.prosrc FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = 'parcels'::regclass AND t.tgname = 'trg_parcels_geom_invalidation'`,
      );
      expect(rows).toHaveLength(1);
      expect(stepLib.triggerBodyMissingColumns(rows[0].prosrc, [...SEVEN])).toEqual([]);
      expect(rows[0].prosrc).toMatch(/parcels_geom_materially_changed\(OLD\.geom, NEW\.geom\)/);
    });
  });

  describe('L8 — predicate unit cases', () => {
    it('byte-identical and both-NULL are immaterial; NULL <-> shape and EMPTY <-> shape are material', async () => {
      expect(await m(SQ, SQ)).toBe(false);
      expect(await m(null, null)).toBe(false);
      expect(await m(null, SQ)).toBe(true);
      expect(await m(SQ, null)).toBe(true);
      expect(await m('POLYGON EMPTY', SQ)).toBe(true);
      expect(await m(SQ, 'POLYGON EMPTY')).toBe(true);
    });

    it('sub-tolerance jitter and a ring rotation are immaterial; a 1e-5° (≈1 m) move is material', async () => {
      expect(await m(SQ, SQ_JIT)).toBe(false);
      expect(await m(SQ, SQ_ROT)).toBe(false);
      expect(await m(SQ, SQ_MOVED)).toBe(true);
    });

    it('a structural change is always material: vertex count (even collinear), rings, parts, type, SRID', async () => {
      expect(await m(SQ, SQ_COLLINEAR)).toBe(true);
      expect(await m(SQ_COLLINEAR, SQ)).toBe(true);
      expect(await m(SQ, SQ_HOLE)).toBe(true);
      expect(await m(MP1, MP2)).toBe(true);
      expect(await m(SQ, MP1), 'a raw Polygon vs MultiPolygon geom is a TYPE change at predicate level').toBe(true);
      expect(await m(SQ, SQ, 4326, 3857), 'mixed SRID is material, never a GEOS raise').toBe(true);
    });

    it('an invalid shape on either side is material even at Hausdorff 0 (bow-tie vs its square)', async () => {
      expect(await m(SQ, BOWTIE)).toBe(true);
      expect(await m(BOWTIE, SQ)).toBe(true);
    });

    it('Polygon vs MultiPolygon raw GeoJSON of one shape, both derived through the loader validation_sql, is immaterial', async () => {
      const ring = boxRing(90);
      const asPoly = poly(ring);
      const asMulti = JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring]] });
      const a = await pool!.query(VALIDATION_SQL, [['A'], [asPoly]]);
      const b = await pool!.query(VALIDATION_SQL, [['B'], [asMulti]]);
      const { rows } = await pool!.query(
        `SELECT public.parcels_geom_materially_changed(ST_GeomFromWKB($1, 4326), ST_GeomFromWKB($2, 4326)) AS m`,
        [a.rows[0].geom_wkb, b.rows[0].geom_wkb],
      );
      expect(rows[0].m).toBe(false);
    });

    it('tol at its 1e-8 floor still reads 1e-9 jitter as immaterial', async () => {
      await inRollback(async (c) => {
        await c.query(`UPDATE logic_variables SET variable_value = 1e-8 WHERE variable_key = $1`, [VAR]);
        expect(await m(SQ, SQ_JIT, 4326, 4326, c)).toBe(false);
        expect(await m(SQ, SQ_MOVED, 4326, 4326, c)).toBe(true);
      });
    });

    it('fail-closed: a missing, zero, below-min or above-max tolerance RAISEs on an inexact pair', async () => {
      for (const bad of [null, 0, 5e-9, 1e-6]) {
        await inRollback(async (c) => {
          if (bad === null) await c.query(`DELETE FROM logic_variables WHERE variable_key = $1`, [VAR]);
          else await c.query(`UPDATE logic_variables SET variable_value = $2 WHERE variable_key = $1`, [VAR, bad]);
          await expect(m(SQ, SQ_JIT, 4326, 4326, c), `tol=${bad}`).rejects.toThrow(
            /parcels_geom_change_tolerance_deg is .*outside \[1e-8, 5e-7\]/,
          );
        });
      }
    });

    it('fail-closed reaches a bare UPDATE (the trigger path), while a byte-identical pair never reads the row', async () => {
      await inRollback(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
           VALUES ($1, 'TEST', $2::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))) RETURNING id`,
          [FX_PARCEL_ID(80), poly(boxRing(80))],
        );
        await c.query(`DELETE FROM logic_variables WHERE variable_key = $1`, [VAR]);
        expect(await m(SQ, SQ, 4326, 4326, c), 'exact pair: no tolerance read').toBe(false);
        await c.query('SAVEPOINT s');
        await expect(
          c.query(`UPDATE parcels SET geom = ST_Translate(geom, 1e-9, 0) WHERE id = $1`, [rows[0].id]),
        ).rejects.toThrow(/parcels_geom_change_tolerance_deg is MISSING/);
        await c.query('ROLLBACK TO SAVEPOINT s');
      });
    });

    it('the migration is re-runnable and a re-apply keeps an operator-tuned tolerance', async () => {
      const sql = fs.readFileSync(MIGRATION, 'utf8');
      await inRollback(async (c) => {
        await c.query(`UPDATE logic_variables SET variable_value = 2e-7 WHERE variable_key = $1`, [VAR]);
        await c.query(sql);
        await c.query(sql);
        const { rows } = await c.query(`SELECT variable_value::float8 AS v FROM logic_variables WHERE variable_key = $1`, [VAR]);
        expect(rows).toHaveLength(1);
        expect(rows[0].v).toBe(2e-7);
        expect(await m(SQ, SQ_JIT, 4326, 4326, c)).toBe(false);
      });
    });
  });

  describe('trigger altitude — jitter, rotation and a jsonb-only change invalidate nothing (red before 251)', () => {
    it('L1: a reload with every vertex jittered ≤ 1e-9° keeps all 7 (the write still lands — ⛔ TRAP ②)', async () => {
      const id = await insParcel(FX_PARCEL_ID(1), poly(boxRing(1)));
      await stampAll(id);
      await reload(id, poly(jitter(boxRing(1))));
      expectKept(await readRow(id), SEVEN, 'sub-tolerance jitter is not a shape change');
    });

    it('L2: the same ring re-published from a different start vertex keeps all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(2), poly(boxRing(2)));
      await stampAll(id);
      await reload(id, poly(rotate(boxRing(2), 2)));
      expectKept(await readRow(id), SEVEN, 'a rotated ring is the same shape');
    });

    it('L5: an address change plus jitter stores the address and keeps all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(3), poly(boxRing(3)));
      await stampAll(id);
      await reload(id, poly(jitter(boxRing(3), 4)), `, address_number = '99'`);
      const row = await readRow(id);
      expect(row.address_number).toBe('99');
      expectKept(row, SEVEN, 'an address-only change with sub-tolerance jitter');
    });

    it('L6: a trigger-only geom write ST_Translate(geom, 1e-9, 0) keeps all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(4), poly(boxRing(4)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geom = ST_Translate(geom, 1e-9, 0) WHERE id = $1`, [id]);
      expectKept(await readRow(id), SEVEN, 'a 1e-9° translate is sub-tolerance');
    });

    it('Q2: a raw-jsonb-only change with a non-NULL, unchanged geom keeps all 7 (retires 245 ① / 249 ④ knowingly)', async () => {
      const id = await insParcel(FX_PARCEL_ID(5), poly(boxRing(5)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geometry = $2::jsonb WHERE id = $1`, [id, poly(boxRing(6))]);
      expectKept(await readRow(id), SEVEN, 'every consumer reads geom, and geom did not change');
    });
  });

  describe('fences — a material change still NULLs all 7 (green before and after 251)', () => {
    it('L3: a 1e-5° (≈1 m) move NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(10), poly(boxRing(10)));
      await stampAll(id);
      await reload(id, poly(translate(boxRing(10), 1e-5)));
      expectNulled(await readRow(id), SEVEN, 'a 1 m move is material');
    });

    it('L6: a trigger-only geom write ST_Translate(geom, 1e-5, 0) NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(11), poly(boxRing(11)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geom = ST_Translate(geom, 1e-5, 0) WHERE id = $1`, [id]);
      expectNulled(await readRow(id), SEVEN, 'a 1 m translate is material');
    });

    it('L4: a vertex added 1e-5° off an edge NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(12), poly(boxRing(12)));
      await stampAll(id);
      await reload(id, poly(protrude(boxRing(12))));
      expectNulled(await readRow(id), SEVEN, 'a protruding vertex is material');
    });

    it('L4: the same vertex removed NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(13), poly(protrude(boxRing(13))));
      await stampAll(id);
      await reload(id, poly(boxRing(13)));
      expectNulled(await readRow(id), SEVEN, 'a removed vertex is material');
    });
  });

  describe('L14 — trigger edge cases', () => {
    it('geom NULL on both sides + a geometry jsonb change NULLs massing/zoning/centroid and KEEPS the 3 stamps', async () => {
      const id = await insParcel(FX_PARCEL_ID(20), null, poly(boxRing(20)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geometry = $2::jsonb WHERE id = $1`, [id, poly(boxRing(21))]);
      const row = await readRow(id);
      expectNulled(row, FOUR, 'the 242/245 jsonb arm survives for a geom-less row');
      expectKept(row, STAMPS, 'geom NULL -> NULL is not a geom change');
    });

    it('geom NULL -> shape NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(22), null, poly(boxRing(22)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)) WHERE id = $1`, [id]);
      expectNulled(await readRow(id), SEVEN, 'NULL -> shape is material');
    });

    it('geom shape -> NULL NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(23), poly(boxRing(23)));
      await stampAll(id);
      await pool!.query(`UPDATE parcels SET geom = NULL WHERE id = $1`, [id]);
      expectNulled(await readRow(id), SEVEN, 'shape -> NULL is material');
    });

    it('a material geom + geometry move NULLs all 7', async () => {
      const id = await insParcel(FX_PARCEL_ID(24), poly(boxRing(24)));
      await stampAll(id);
      await reload(id, poly(boxRing(25)));
      expectNulled(await readRow(id), SEVEN, 'a ~1 km move is material');
    });
  });

  describe('L7 — real-data metamorphic: June-2026 dump vs the 2026-09-24 publish', () => {
    // Classes are INDEPENDENT facts measured in JS on the raw GeoJSON (fixture $comment):
    //   jitter              — same ring structure, every vertex moved < 1e-8°;
    //   vertex_count_change — the total vertex count differs (always material);
    //   same_count          — equal vertex count; js_hausdorff_vertex_to_boundary_deg is a JS
    //                         re-implementation of the discrete Hausdorff measure (vertex to nearest
    //                         segment of the other shape, both directions). Index-matched vertex
    //                         displacement is NOT the oracle: it over-reads hole/part reorders and
    //                         vertices slid along a straight edge (same shape — measured 2026-10-06).
    // Pairs within [tol/2, 2×tol] of the JS measure are a characterisation band: listed, not asserted.
    type Pair = {
      class: 'jitter' | 'vertex_count_change' | 'same_count';
      parcel_id: string;
      old: string;
      new: string;
      old_vertices: number;
      new_vertices: number;
      js_hausdorff_vertex_to_boundary_deg: number | null;
      max_disp_index_deg: number | null;
      max_disp_rotation_invariant_deg: number | null;
    };
    const fixture = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src/tests/db/fixtures/parcels-geom-jitter-pairs.json'), 'utf8'),
    ) as { pairs: Pair[] };

    it('jitter is immaterial, vertex-count changes are material, same-count pairs follow the JS Hausdorff oracle, 2×tol negative controls are material', async () => {
      const pairs = fixture.pairs;
      const keys = pairs.map((p) => p.parcel_id);
      const oldV = await pool!.query(VALIDATION_SQL, [keys, pairs.map((p) => p.old)]);
      const newV = await pool!.query(VALIDATION_SQL, [keys, pairs.map((p) => p.new)]);
      const oldBy = new Map(oldV.rows.map((r: { source_key: string; geom_wkb: Buffer | null }) => [String(r.source_key), r.geom_wkb]));
      const newBy = new Map(newV.rows.map((r: { source_key: string; geom_wkb: Buffer | null }) => [String(r.source_key), r.geom_wkb]));
      const tolRow = await pool!.query(`SELECT variable_value::float8 AS v FROM logic_variables WHERE variable_key = $1`, [VAR]);
      const tol = tolRow.rows[0].v as number;
      const usable = pairs.filter((p) => oldBy.get(p.parcel_id) && newBy.get(p.parcel_id));
      const { rows } = await pool!.query(
        `SELECT k,
                public.parcels_geom_materially_changed(ST_GeomFromWKB(a, 4326), ST_GeomFromWKB(b, 4326)) AS m,
                public.parcels_geom_materially_changed(ST_GeomFromWKB(a, 4326), ST_Translate(ST_GeomFromWKB(b, 4326), $4::float8, 0)) AS neg,
                ST_HausdorffDistance(ST_GeomFromWKB(a, 4326), ST_GeomFromWKB(b, 4326)) AS hd
           FROM unnest($1::text[], $2::bytea[], $3::bytea[]) AS t(k, a, b)`,
        [usable.map((p) => p.parcel_id), usable.map((p) => oldBy.get(p.parcel_id)), usable.map((p) => newBy.get(p.parcel_id)), 2 * tol],
      );
      const byKey = new Map<string, { m: boolean; neg: boolean; hd: number }>(rows.map((r) => [r.k as string, r]));
      const table: Record<string, { n: number; material: number; neg_material: number }> = {};
      const wrong: Array<{ parcel_id: string; class: string; m: boolean; hd: number; js: number | null }> = [];
      const band: Array<{ parcel_id: string; m: boolean; hd: number; js: number | null }> = [];
      for (const p of usable) {
        const r = byKey.get(p.parcel_id)!;
        const js = p.js_hausdorff_vertex_to_boundary_deg;
        const key = p.class === 'same_count' ? (js! > 2 * tol ? 'same_count_moved' : js! < tol / 2 ? 'same_count_still' : 'same_count_band') : p.class;
        const t = (table[key] ??= { n: 0, material: 0, neg_material: 0 });
        t.n += 1;
        if (r.m) t.material += 1;
        if (r.neg) t.neg_material += 1;
        if (key === 'same_count_band') {
          band.push({ parcel_id: p.parcel_id, m: r.m, hd: r.hd, js });
          continue;
        }
        const expected = key === 'vertex_count_change' || key === 'same_count_moved';
        if (r.m !== expected) wrong.push({ parcel_id: p.parcel_id, class: key, m: r.m, hd: r.hd, js });
      }
      // The characterisation table (recorded in the red-evidence JSON and the plan's L7 row).
      console.log('L7 table', JSON.stringify({ tol, fixture_pairs: pairs.length, usable: usable.length, table, band, disagreements: wrong }));
      expect(usable.length, 'every fixture side must survive the loader validation_sql').toBe(pairs.length);
      const jit = table.jitter!;
      const vcc = table.vertex_count_change!;
      expect(jit.n).toBeGreaterThanOrEqual(200);
      expect(jit.material, 'jitter pairs: 100 % immaterial').toBe(0);
      expect(jit.neg_material, 'negative controls (jitter + 2×tol translate): 100 % material').toBe(jit.n);
      expect(vcc.material, 'vertex-count changes: 100 % material').toBe(vcc.n);
      expect(wrong, 'a pair whose verdict disagrees with its independent JS oracle').toEqual([]);
    });
  });

  describe.skipIf(process.env.BUILDO_GEOM_PERF !== '1')('perf (opt-in measurement, not a lock)', () => {
    it('one UPDATE … SET geom = ST_Translate(geom, 1e-9, 0) over 100,000 parcels, rolled back', async () => {
      await inRollback(async (c) => {
        await c.query(
          `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
           SELECT 'GEOMTOLPERF' || g, 'TEST', ST_AsGeoJSON(s.geom)::jsonb, s.geom
             FROM generate_series(1, 100000) g,
                  LATERAL (SELECT ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-79.6 + (g % 400) * 0.001, 43.6 + (g / 400) * 0.001), 4326), 0.0002, 4)) AS geom) s`,
        );
        const t0 = process.hrtime.bigint();
        const jit = await c.query(`UPDATE parcels SET geom = ST_Translate(geom, 1e-9, 0) WHERE parcel_id LIKE 'GEOMTOLPERF%'`);
        const t1 = process.hrtime.bigint();
        const kept = await c.query(`SELECT count(*)::int AS n FROM parcels WHERE parcel_id LIKE 'GEOMTOLPERF%' AND geom IS NOT NULL`);
        console.log('perf', JSON.stringify({ rows: jit.rowCount, ms: Number(t1 - t0) / 1e6, n: kept.rows[0].n }));
        expect(jit.rowCount).toBe(100000);
      });
    }, 600_000);
  });
});
