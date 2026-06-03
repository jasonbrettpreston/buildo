// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8e (M-3)
//
// Real-DB integration tests for migration 169_permits_coa_ravine_columns.sql.
// Verifies the 2 ravine columns × 2 tables (permits + coa_applications) +
// the BOOLEAN NOT NULL DEFAULT false contract. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 169 — permits + coa ravine columns', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.end();
  });

  it('adds the 2 ravine columns to BOTH permits and coa_applications with the spec §8e contract', async () => {
    if (!pool) return;
    for (const table of ['permits', 'coa_applications']) {
      const { rows } = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('is_in_ravine_protection_area','ravine_distance_m')`,
        [table],
      );
      const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));

      // L1 — regulatorily-authoritative flag: BOOLEAN NOT NULL DEFAULT false.
      expect(by.is_in_ravine_protection_area.data_type).toBe('boolean');
      expect(by.is_in_ravine_protection_area.is_nullable).toBe('NO');
      expect(by.is_in_ravine_protection_area.column_default).toMatch(/false/);

      // L2 — signed distance: nullable double precision.
      expect(by.ravine_distance_m.data_type).toBe('double precision');
      expect(by.ravine_distance_m.is_nullable).toBe('YES');
    }
  });
});
