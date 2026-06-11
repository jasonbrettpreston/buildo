// 🔗 SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §8e (M-3)
//
// Real-DB integration for migration 176_permits_coa_centreline_columns.sql.
// Verifies the 3 centreline columns × 2 tables (permits + coa_applications): the two
// BOOLEAN NOT NULL DEFAULT false flags + the nullable TEXT frontage name (NO CHECK — free text).
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 176 — permits + coa centreline columns', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM permits WHERE permit_num LIKE 'CL-%'");
    await pool.end();
  });

  it('adds the 3 centreline columns to BOTH permits and coa_applications with the §8e contract', async () => {
    if (!pool) return;
    for (const table of ['permits', 'coa_applications']) {
      const { rows } = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('is_corner_lot','is_through_lot','primary_frontage_street_name')`,
        [table],
      );
      const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));
      expect(Object.keys(by)).toHaveLength(3);
      // Booleans: NOT NULL DEFAULT false (a multi-parcel lead can be both — no carve-out).
      for (const flag of ['is_corner_lot', 'is_through_lot']) {
        expect(by[flag].data_type).toBe('boolean');
        expect(by[flag].is_nullable).toBe('NO');
        expect(by[flag].column_default).toMatch(/false/);
      }
      // Frontage name: nullable free-text, NO CHECK.
      expect(by.primary_frontage_street_name.data_type).toBe('text');
      expect(by.primary_frontage_street_name.is_nullable).toBe('YES');
    }
  });

  it('booleans default false; frontage accepts arbitrary street names (no CHECK)', async () => {
    if (!pool) return;
    await pool.query("DELETE FROM permits WHERE permit_num LIKE 'CL-%'");
    await pool.query(`INSERT INTO permits (permit_num, revision_num) VALUES ('CL-DEFAULT','00')`);
    await pool.query(`INSERT INTO permits (permit_num, revision_num, is_corner_lot, is_through_lot, primary_frontage_street_name)
                      VALUES ('CL-SET','00', true, true, 'Queen St W')`);
    const def = (await pool.query(`SELECT is_corner_lot, is_through_lot, primary_frontage_street_name FROM permits WHERE permit_num='CL-DEFAULT'`)).rows[0];
    expect(def.is_corner_lot).toBe(false);
    expect(def.is_through_lot).toBe(false);
    expect(def.primary_frontage_street_name).toBeNull();
    const set = (await pool.query(`SELECT is_corner_lot, is_through_lot, primary_frontage_street_name FROM permits WHERE permit_num='CL-SET'`)).rows[0];
    expect(set.is_corner_lot).toBe(true);
    expect(set.is_through_lot).toBe(true); // both true allowed (DEC-A: not mutually exclusive)
    expect(set.primary_frontage_street_name).toBe('Queen St W');
  });
});
