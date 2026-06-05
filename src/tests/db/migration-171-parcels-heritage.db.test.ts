// 🔗 SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §4.4 (M-2)
//
// Real-DB integration tests for migration 171_parcels_heritage_columns.sql.
// Verifies the 4 parcels heritage columns, the designation_type CHECK, the
// NOT-NULL-DEFAULT-false boolean, and the nullable date/lineage columns.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 171 — parcels heritage columns', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-MIG-%'");
    await pool.end();
  });

  it('adds the 4 columns with the right nullability + boolean default', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'parcels'
          AND column_name IN ('is_heritage_designated','heritage_designation_type','heritage_designation_date','heritage_dataset_version_when_enriched')`,
    );
    const c = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(Object.keys(c)).toHaveLength(4);
    expect(c.is_heritage_designated.is_nullable).toBe('NO');
    expect(c.is_heritage_designated.column_default).toMatch(/false/);
    expect(c.heritage_designation_type.is_nullable).toBe('YES');
    expect(c.heritage_designation_date.data_type).toBe('date');
    expect(c.heritage_designation_date.is_nullable).toBe('YES');
    expect(c.heritage_dataset_version_when_enriched.data_type).toBe('text');
  });

  it('CHECK constraint accepts the two valid types + NULL, rejects anything else', async () => {
    if (!pool) return;
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'HER-MIG-%'");
    const geom = "ST_GeomFromText('POLYGON((-79.4 43.7,-79.39 43.7,-79.39 43.71,-79.4 43.71,-79.4 43.7))',4326)";
    // valid: part_iv_individual, part_v_hcd, NULL
    await pool.query(`INSERT INTO parcels (parcel_id, geom, heritage_designation_type) VALUES ('HER-MIG-IV', ${geom}, 'part_iv_individual')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom, heritage_designation_type) VALUES ('HER-MIG-V', ${geom}, 'part_v_hcd')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom, heritage_designation_type) VALUES ('HER-MIG-NULL', ${geom}, NULL)`);
    // invalid → CHECK rejects
    await expect(
      pool.query(`INSERT INTO parcels (parcel_id, geom, heritage_designation_type) VALUES ('HER-MIG-BAD', ${geom}, 'listed')`),
    ).rejects.toThrow();
  });

  it('is_heritage_designated defaults to false when unset', async () => {
    if (!pool) return;
    const geom = "ST_GeomFromText('POLYGON((-79.4 43.7,-79.39 43.7,-79.39 43.71,-79.4 43.71,-79.4 43.7))',4326)";
    await pool.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('HER-MIG-DEFAULT', ${geom})`);
    const { rows } = await pool.query(`SELECT is_heritage_designated FROM parcels WHERE parcel_id = 'HER-MIG-DEFAULT'`);
    expect(rows[0].is_heritage_designated).toBe(false);
  });
});
