// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d (M-2)
//
// Real-DB integration tests for migration 168_parcels_ravine_columns.sql.
// Verifies the 3 ravine columns + the BOOLEAN NOT NULL DEFAULT false contract.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 168 — parcels ravine columns', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.end();
  });

  it('adds the 3 ravine columns with the spec §8d contract', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'parcels' AND column_name IN
          ('is_in_ravine_protection_area','ravine_distance_m','ravine_dataset_version_when_enriched')`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));

    // L1 — regulatorily-authoritative flag: BOOLEAN NOT NULL DEFAULT false.
    expect(by.is_in_ravine_protection_area.data_type).toBe('boolean');
    expect(by.is_in_ravine_protection_area.is_nullable).toBe('NO');
    expect(by.is_in_ravine_protection_area.column_default).toMatch(/false/);

    // L2 — signed distance: nullable double precision.
    expect(by.ravine_distance_m.data_type).toBe('double precision');
    expect(by.ravine_distance_m.is_nullable).toBe('YES');

    // L3 — lineage: nullable text.
    expect(by.ravine_dataset_version_when_enriched.data_type).toBe('text');
    expect(by.ravine_dataset_version_when_enriched.is_nullable).toBe('YES');
  });

  it('defaults is_in_ravine_protection_area to false on insert (no enrichment yet)', async () => {
    if (!pool) return;
    // A parcel inserted without the ravine columns gets the constant default.
    await pool.query(
      `INSERT INTO parcels (parcel_id) VALUES ('RAV-MIG-168-001')
         ON CONFLICT (parcel_id) DO NOTHING`,
    );
    const { rows } = await pool.query(
      `SELECT is_in_ravine_protection_area, ravine_distance_m
         FROM parcels WHERE parcel_id = 'RAV-MIG-168-001'`,
    );
    expect(rows[0].is_in_ravine_protection_area).toBe(false);
    expect(rows[0].ravine_distance_m).toBeNull();
    await pool.query(`DELETE FROM parcels WHERE parcel_id = 'RAV-MIG-168-001'`);
  });
});
