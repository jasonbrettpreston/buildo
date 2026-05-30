// 🔗 SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (v2.3) §4
//
// Live-DB integration test for the Spec 58 zoning ingest — migration 164 schema
// + the loader's SQL contracts, exercised against real PostGIS. Skipped unless
// DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer) is set; the harness
// applies migrations 001..NNN (incl. 164) before this runs.
//
// Verifies the bug-class that mocked-pool tests are blind to:
//   - all 10 tables exist with a GIST geom index, source_id UNIQUE, key CHECKs
//   - the loader's geom INSERT expression yields MULTIPOLYGON/MULTILINESTRING @ 4326
//   - CHECK constraints reject out-of-range values (proving why the loader nulls -1)
//   - NOT EXISTS orphan delete removes only orphans; empty staging WOULD wipe the
//     table (proving why the loader's JS-side empty-staging guard, F-C1, is required)
//   - the IS DISTINCT FROM upsert is idempotent (re-insert identical row = no-op)
//   - F-C4: a temp table created on a client is visible to that same client

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { geomColumnSql } from '../../../scripts/lib/geometry-validator';

const POLY = '{"type":"Polygon","coordinates":[[[-79.4,43.6],[-79.3,43.6],[-79.3,43.7],[-79.4,43.7],[-79.4,43.6]]]}';
const TEST_BASE = 900_000_000; // test source_id range — cleaned in afterAll, never collides with CKAN _id

const ALL_TABLES = [
  'zoning_bylaw_areas', 'zoning_height_overlay', 'zoning_lot_coverage_overlay',
  'zoning_building_setback_overlay', 'zoning_policy_area_overlay', 'zoning_policy_road_overlay',
  'zoning_rooming_house_overlay', 'zoning_parking_zone_overlay', 'zoning_priority_retail_overlay',
  'zoning_queenstw_eat_overlay',
];

// Helper: insert a base row using the loader's exact geom expression.
async function insertBase(pool: Pool, sourceId: number, coverage: number | null = null) {
  await pool.query(
    `INSERT INTO zoning_bylaw_areas (source_id, zn_zone, zn_string, coverage_max_pct, geometry, geom, source_dataset_version)
     VALUES ($1, $2, $3, $4, $5, ${geomColumnSql('$6', 'polygon')}, NOW())`,
    [sourceId, 'RD', 'RD (x1500)', coverage, POLY, POLY],
  );
}

describe.skipIf(!dbAvailable())('Spec 58 zoning ingest — live DB (migration 164 + loader SQL)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM zoning_bylaw_areas WHERE source_id >= ${TEST_BASE}`).catch(() => {});
    await pool.end();
  });

  describe('migration 164 schema', () => {
    it('all 10 zoning tables exist', async () => {
      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`, [ALL_TABLES],
      );
      expect(rows.map((r) => r.table_name).sort()).toEqual([...ALL_TABLES].sort());
    });

    it('every table has a GIST index on geom', async () => {
      const { rows } = await pool.query(
        `SELECT tablename FROM pg_indexes WHERE indexdef ILIKE '%USING gist%(geom)%' AND tablename = ANY($1)`, [ALL_TABLES],
      );
      expect(new Set(rows.map((r) => r.tablename)).size).toBe(10);
    });

    it('source_id is UNIQUE NOT NULL on every table (the upsert conflict target)', async () => {
      const { rows } = await pool.query(
        `SELECT c.relname AS table_name FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
          WHERE con.contype = 'u' AND c.relname = ANY($1)
            AND pg_get_constraintdef(con.oid) ILIKE '%(source_id)%'`, [ALL_TABLES],
      );
      expect(new Set(rows.map((r) => r.table_name)).size).toBe(10);
    });

    it('base CHECK constraints present (coverage 0–100, fsi >= 0) and no zoning_exceptions table (D6)', async () => {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'zoning_bylaw_areas'::regclass AND contype = 'c'`,
      );
      const defs = rows.map((r) => r.def).join(' | ');
      expect(defs).toMatch(/coverage_max_pct.*0.*100/i);
      expect(defs).toMatch(/fsi_max\s*>=\s*0/i);
      const exc = await pool.query(`SELECT to_regclass('zoning_exceptions') AS t`);
      expect(exc.rows[0].t).toBeNull();
    });

    it('base non-spatial indexes present (zn_zone, partial exception_number, bylaw_chapter)', async () => {
      const { rows } = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'zoning_bylaw_areas'`,
      );
      const names = rows.map((r) => r.indexname).join(' ');
      expect(names).toContain('idx_zoning_bylaw_areas_zn_zone');
      expect(names).toContain('idx_zoning_bylaw_areas_exception_number');
      expect(names).toContain('idx_zoning_bylaw_areas_bylaw_chapter');
    });
  });

  describe('loader SQL contracts', () => {
    it('the geom expression produces MULTIPOLYGON at SRID 4326', async () => {
      await insertBase(pool, TEST_BASE + 1);
      const { rows } = await pool.query(
        `SELECT ST_GeometryType(geom) AS t, ST_SRID(geom) AS srid FROM zoning_bylaw_areas WHERE source_id = $1`,
        [TEST_BASE + 1],
      );
      expect(rows[0].t).toBe('ST_MultiPolygon');
      expect(rows[0].srid).toBe(4326);
    });

    it('CHECK rejects out-of-range coverage (200) — proving the loader must null the -1 sentinel', async () => {
      await expect(insertBase(pool, TEST_BASE + 2, 200)).rejects.toThrow();
    });

    it('IS DISTINCT FROM upsert is idempotent — re-inserting an identical row is a no-op', async () => {
      await insertBase(pool, TEST_BASE + 3, 50);
      const res = await pool.query(
        `INSERT INTO zoning_bylaw_areas (source_id, zn_zone, zn_string, coverage_max_pct, geometry, geom, source_dataset_version)
         VALUES ($1, $2, $3, $4, $5, ${geomColumnSql('$6', 'polygon')}, NOW())
         ON CONFLICT (source_id) DO UPDATE SET coverage_max_pct = EXCLUDED.coverage_max_pct, geometry = EXCLUDED.geometry, geom = EXCLUDED.geom
         WHERE zoning_bylaw_areas.coverage_max_pct IS DISTINCT FROM EXCLUDED.coverage_max_pct
            OR zoning_bylaw_areas.geometry IS DISTINCT FROM EXCLUDED.geometry
         RETURNING source_id`,
        [TEST_BASE + 3, 'RD', 'RD (x1500)', 50, POLY, POLY],
      );
      expect(res.rowCount).toBe(0); // unchanged → guarded out
    });

    it('NOT EXISTS orphan delete removes only orphans; empty staging WOULD wipe (F-C1 rationale)', async () => {
      await insertBase(pool, TEST_BASE + 10, 10);
      await insertBase(pool, TEST_BASE + 11, 20);

      // Temp tables are connection-scoped, so the whole sequence must run on ONE
      // dedicated client (pool.query could dispatch each statement to a different
      // connection where the temp table is invisible) — same reason as F-C4.
      const client = await pool.connect();
      try {
        // Non-empty staging containing only +10 → +11 is an orphan and is removed.
        await client.query('BEGIN');
        await client.query('CREATE TEMP TABLE _stg (source_id INTEGER NOT NULL) ON COMMIT DROP');
        await client.query(`INSERT INTO _stg VALUES (${TEST_BASE + 10})`);
        const del = await client.query(
          `DELETE FROM zoning_bylaw_areas t WHERE t.source_id >= ${TEST_BASE + 10}
             AND NOT EXISTS (SELECT 1 FROM _stg s WHERE s.source_id = t.source_id)`,
        );
        expect(del.rowCount).toBe(1);
        await client.query('ROLLBACK');

        // Empty staging: the SAME delete would remove BOTH rows — this is exactly
        // why load-zoning.js skips the DELETE when insertable.length === 0 (F-C1).
        await client.query('BEGIN');
        await client.query('CREATE TEMP TABLE _stg_empty (source_id INTEGER NOT NULL) ON COMMIT DROP');
        const wipe = await client.query(
          `DELETE FROM zoning_bylaw_areas t WHERE t.source_id >= ${TEST_BASE + 10}
             AND NOT EXISTS (SELECT 1 FROM _stg_empty s WHERE s.source_id = t.source_id)`,
        );
        expect(wipe.rowCount).toBe(2); // would wipe both → the JS guard is mandatory
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('F-C4: a temp table created on a client is visible to that same client', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('CREATE TEMP TABLE _fc4 (source_id INTEGER NOT NULL) ON COMMIT DROP');
        await client.query('INSERT INTO _fc4 VALUES (1), (2)');
        const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM _fc4');
        expect(rows[0].c).toBe(2);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });
});
