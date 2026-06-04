// 🔗 SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §4.4 (M-1)
//
// Real-DB integration tests for migration 170_create_heritage_tables.sql.
// Verifies both heritage tables + indexes (GIST planar + geography on points; GIST
// on districts), the fuzzystrmatch extension + normalize_address() round-trip, the
// CHECK constraints, the nullable designated_date/bylaw_no (smoke-caught), and the
// geometry round-trips. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 170 — heritage tables + function + indexes', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM heritage_properties WHERE source_id >= 990000");
    await pool.query("DELETE FROM heritage_districts WHERE source_id >= 990000");
    await pool.end();
  });

  it('fuzzystrmatch extension is installed (levenshtein available for §8d)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'fuzzystrmatch'`);
    expect(rows).toHaveLength(1);
    const lev = await pool.query(`SELECT levenshtein('123 main st', '123 main st e') AS d`);
    expect(Number(lev.rows[0].d)).toBe(2);
  });

  it('normalize_address() exists + standardizes the 8 suffixes + collapses whitespace (L27/H-v1.1.1)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT normalize_address('123  MAIN   AVENUE') a, normalize_address('5 Queen Street') b,
              normalize_address('9 Elm BOULEVARD') c, normalize_address(NULL) d`,
    );
    expect(rows[0].a).toBe('123 main ave');
    expect(rows[0].b).toBe('5 queen st');
    expect(rows[0].c).toBe('9 elm blvd');
    expect(rows[0].d).toBe('');
  });

  it('heritage_properties: column contract + nullable designated_date/bylaw_no', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'heritage_properties'`,
    );
    const c = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(c.source_id.data_type).toBe('bigint');
    expect(c.source_id.is_nullable).toBe('NO');
    expect(c.status.is_nullable).toBe('NO');
    expect(c.address_text.is_nullable).toBe('NO'); // 0 source nulls
    expect(c.designated_date.is_nullable).toBe('YES'); // L2 sentinel → NULL
    expect(c.geom.data_type).toBe('USER-DEFINED');
  });

  it('heritage_districts: designated_date AND bylaw_no nullable (sentinel + 7 source nulls)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'heritage_districts'`,
    );
    const c = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]));
    expect(c.name).toBe('NO');
    expect(c.designated_date).toBe('YES'); // Parkdale Main Street sentinel
    expect(c.bylaw_no).toBe('YES'); // 7 null HCD_BYLAWN in source
    expect(c.source_dataset_version).toBe('NO');
  });

  it('heritage_properties has planar + geography GIST + status indexes', async () => {
    if (!pool) return;
    const { rows } = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'heritage_properties'`);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_heritage_properties_geom_gist');
    expect(names).toContain('idx_heritage_properties_geog_gist');
    expect(names).toContain('idx_heritage_properties_status');
    expect(rows.find((r) => r.indexname === 'idx_heritage_properties_geog_gist').indexdef).toMatch(/geography/i);
  });

  it('CHECK constraints: status enum + hcd_type; Point/MultiPolygon round-trips; UNIQUE(source_id)', async () => {
    if (!pool) return;
    // heritage_properties — Point, valid status, nullable date accepted.
    await pool.query(
      `INSERT INTO heritage_properties (source_id, status, geom, designated_date, address_text, source_dataset_version)
       VALUES (990001, 'part_iv', ST_SetSRID(ST_MakePoint(-79.4, 43.7), 4326), NULL, '1 test st', 'v1')`,
    );
    const p = await pool.query(`SELECT ST_SRID(geom) srid, GeometryType(geom) gt FROM heritage_properties WHERE source_id = 990001`);
    expect(p.rows[0].srid).toBe(4326);
    expect(p.rows[0].gt).toBe('POINT');
    // bad status rejected by CHECK.
    await expect(
      pool.query(`INSERT INTO heritage_properties (source_id, status, geom, address_text, source_dataset_version)
                  VALUES (990002, 'listed', ST_SetSRID(ST_MakePoint(-79.4,43.7),4326), 'x', 'v1')`),
    ).rejects.toThrow();

    // heritage_districts — MultiPolygon, designated hcd_type.
    const mp = "ST_Multi(ST_GeomFromText('POLYGON((-79.4 43.7,-79.39 43.7,-79.39 43.71,-79.4 43.71,-79.4 43.7))',4326))";
    await pool.query(
      `INSERT INTO heritage_districts (source_id, name, hcd_type, geom, designated_date, bylaw_no, source_dataset_version)
       VALUES (990001, 'Test HCD', 'designated_district', ${mp}, NULL, NULL, 'v1')`,
    );
    const d = await pool.query(`SELECT GeometryType(geom) gt FROM heritage_districts WHERE source_id = 990001`);
    expect(d.rows[0].gt).toBe('MULTIPOLYGON');
    // bad hcd_type rejected by CHECK.
    await expect(
      pool.query(`INSERT INTO heritage_districts (source_id, name, hcd_type, geom, source_dataset_version)
                  VALUES (990002, 'X', 'under_appeal', ${mp}, 'v1')`),
    ).rejects.toThrow();
    // UNIQUE(source_id) rejects duplicate.
    await expect(
      pool.query(`INSERT INTO heritage_districts (source_id, name, hcd_type, geom, source_dataset_version)
                  VALUES (990001, 'Dup', 'designated_district', ${mp}, 'v2')`),
    ).rejects.toThrow();
  });
});
