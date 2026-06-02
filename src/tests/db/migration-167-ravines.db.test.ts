// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §4.3 (M-1)
//
// Real-DB integration tests for migration 167_create_ravines_table.sql.
// Verifies the ravines table shape + BOTH GIST indexes (planar + geography, L13),
// the BIGINT/MultiPolygon/NOT NULL column contract, the UNIQUE(source_id) guard,
// and a geometry round-trip insert. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 167 — ravines table + GIST indexes', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM ravines WHERE source_id >= 990000");
    await pool.end();
  });

  it('ravines table exists with the spec §2 column contract', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns WHERE table_name = 'ravines' ORDER BY ordinal_position`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(byName.id.data_type).toBe('bigint');
    expect(byName.source_id.data_type).toBe('bigint');
    expect(byName.source_id.is_nullable).toBe('NO');
    expect(byName.geom.data_type).toBe('USER-DEFINED'); // PostGIS geometry
    expect(byName.source_dataset_version.is_nullable).toBe('NO');
    expect(byName.created_at.data_type).toBe('timestamp with time zone');
    expect(byName.updated_at.is_nullable).toBe('NO');
  });

  it('has BOTH GIST indexes — planar (idx_ravines_geom_gist) + geography (idx_ravines_geog_gist) per L13', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ravines'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_ravines_geom_gist');
    expect(names).toContain('idx_ravines_geog_gist');
    const geog = rows.find((r) => r.indexname === 'idx_ravines_geog_gist');
    expect(geog.indexdef).toMatch(/gist/i);
    expect(geog.indexdef).toMatch(/geography/i); // expression index on geom::geography
  });

  it('enforces UNIQUE(source_id) and geom SRID 4326 MultiPolygon', async () => {
    if (!pool) return;
    const mp =
      "ST_Multi(ST_GeomFromText('POLYGON((-79.4 43.7,-79.39 43.7,-79.39 43.71,-79.4 43.71,-79.4 43.7))',4326))";
    await pool.query(
      `INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990001, ${mp}, 'test-v1')`,
    );
    const { rows } = await pool.query(
      `SELECT ST_SRID(geom) srid, GeometryType(geom) gt FROM ravines WHERE source_id = 990001`,
    );
    expect(rows[0].srid).toBe(4326);
    expect(rows[0].gt).toBe('MULTIPOLYGON');

    // UNIQUE(source_id) rejects a duplicate.
    await expect(
      pool.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990001, ${mp}, 'test-v2')`),
    ).rejects.toThrow();
  });
});
