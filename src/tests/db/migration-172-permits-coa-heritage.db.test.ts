// 🔗 SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §8e (M-3)
//
// Real-DB integration for migration 172_permits_coa_heritage_columns.sql.
// Verifies the 3 heritage columns × 2 tables (permits + coa_applications), the
// designation_type CHECK, and the BOOLEAN NOT NULL DEFAULT false contract.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 172 — permits + coa heritage columns', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM permits WHERE permit_num LIKE 'HM-%'");
    await pool.end();
  });

  it('adds the 3 heritage columns to BOTH permits and coa_applications with the §8e contract', async () => {
    if (!pool) return;
    for (const table of ['permits', 'coa_applications']) {
      const { rows } = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('is_heritage_designated','heritage_designation_type','heritage_designation_date')`,
        [table],
      );
      const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));
      expect(Object.keys(by)).toHaveLength(3);
      // L1 — regulatory flag: BOOLEAN NOT NULL DEFAULT false.
      expect(by.is_heritage_designated.data_type).toBe('boolean');
      expect(by.is_heritage_designated.is_nullable).toBe('NO');
      expect(by.is_heritage_designated.column_default).toMatch(/false/);
      // type (nullable TEXT, CHECK-pinned) + date (nullable).
      expect(by.heritage_designation_type.is_nullable).toBe('YES');
      expect(by.heritage_designation_date.data_type).toBe('date');
      expect(by.heritage_designation_date.is_nullable).toBe('YES');
    }
  });

  it('CHECK constraint accepts the two valid types + NULL, rejects anything else (permits)', async () => {
    if (!pool) return;
    await pool.query("DELETE FROM permits WHERE permit_num LIKE 'HM-%'");
    await pool.query(`INSERT INTO permits (permit_num, revision_num, heritage_designation_type) VALUES ('HM-IV','00','part_iv_individual')`);
    await pool.query(`INSERT INTO permits (permit_num, revision_num, heritage_designation_type) VALUES ('HM-V','00','part_v_hcd')`);
    await pool.query(`INSERT INTO permits (permit_num, revision_num, heritage_designation_type) VALUES ('HM-NULL','00',NULL)`);
    await expect(
      pool.query(`INSERT INTO permits (permit_num, revision_num, heritage_designation_type) VALUES ('HM-BAD','00','listed')`),
    ).rejects.toThrow();
    // default false when unset.
    const { rows } = await pool.query(`SELECT is_heritage_designated FROM permits WHERE permit_num='HM-NULL'`);
    expect(rows[0].is_heritage_designated).toBe(false);
  });
});
