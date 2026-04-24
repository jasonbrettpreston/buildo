// 🔗 SPEC LINK: docs/specs/00-architecture/01_database_schema.md §Tier 2 FK Hardening
//
// Real-DB integration tests for migration 109_fk_hardening.sql.
// Verifies all 5 new FK constraints are correctly enforced:
//   a. permit_history   → permits        ON DELETE CASCADE
//   b. permit_history   → sync_runs      ON DELETE SET NULL
//   c. tracked_projects → permits        ON DELETE CASCADE
//   d. permits          → neighbourhoods ON DELETE SET NULL
//   e. permit_products  → permits        ON DELETE CASCADE
//
// Each constraint is tested for:
//   • valid FK insert accepted (happy path)
//   • orphaned FK insert rejected (unhappy path)
//   • CASCADE / SET NULL fires correctly on parent deletion
//
// Skipped unless BUILDO_TEST_DB=1 or DATABASE_URL is set (CI).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// Permit keys chosen to be visually distinct and unlikely to collide with seed data.
const P1 = 'FK109-001';
const P2 = 'FK109-002';
const REV = '00';
// Neighbourhood identifier from the Toronto source data (not the SERIAL id).
const TEST_NEIGH_SRC_ID = 99901;

describe.skipIf(!dbAvailable())('migration 109 — Tier 2 FK hardening', () => {
  let syncRunId: number;
  let neighbourhoodSerialId: number;

  beforeAll(async () => {
    if (!pool) return;

    await pool.query(
      `INSERT INTO permits (permit_num, revision_num)
       VALUES ($1, $2), ($3, $2)
       ON CONFLICT DO NOTHING`,
      [P1, REV, P2],
    );

    const sr = await pool.query<{ id: number }>(
      `INSERT INTO sync_runs (status) VALUES ('completed') RETURNING id`,
    );
    syncRunId = sr.rows[0]!.id;

    const nb = await pool.query<{ id: number }>(
      `INSERT INTO neighbourhoods (neighbourhood_id, name)
       VALUES ($1, 'FK109 Test Neighbourhood')
       ON CONFLICT (neighbourhood_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [TEST_NEIGH_SRC_ID],
    );
    neighbourhoodSerialId = nb.rows[0]!.id;
  });

  afterAll(async () => {
    if (!pool) return;
    // Delete permits first — CASCADE removes permit_history, tracked_projects,
    // permit_products rows that reference them.
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE 'FK109-%'`);
    await pool.query(`DELETE FROM sync_runs WHERE id = $1`, [syncRunId]);
    await pool.query(
      `DELETE FROM neighbourhoods WHERE neighbourhood_id = $1`,
      [TEST_NEIGH_SRC_ID],
    );
    await pool.end();
  });

  // ─── a. permit_history → permits (CASCADE) ──────────────────────────────────

  describe('fk_permit_history_permits — CASCADE', () => {
    it('accepts permit_history row with a valid parent permit', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO permit_history (permit_num, revision_num, field_name)
           VALUES ($1, $2, 'status')`,
          [P1, REV],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects permit_history row referencing a non-existent permit', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO permit_history (permit_num, revision_num, field_name)
           VALUES ('ORPHAN-109', '00', 'status')`,
        ),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it('deletes permit_history rows when the parent permit is deleted', async () => {
      if (!pool) return;
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num)
         VALUES ('FK109-PH-CAS', '00') ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO permit_history (permit_num, revision_num, field_name)
         VALUES ('FK109-PH-CAS', '00', 'cascade_test')`,
      );

      const before = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM permit_history WHERE permit_num = 'FK109-PH-CAS'`,
      );
      expect(Number(before.rows[0]?.c)).toBe(1);

      await pool.query(`DELETE FROM permits WHERE permit_num = 'FK109-PH-CAS'`);

      const after = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM permit_history WHERE permit_num = 'FK109-PH-CAS'`,
      );
      expect(Number(after.rows[0]?.c)).toBe(0);
    });
  });

  // ─── b. permit_history → sync_runs (SET NULL) ───────────────────────────────

  describe('fk_permit_history_sync_runs — SET NULL', () => {
    it('accepts permit_history row with a valid sync_run_id', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO permit_history (permit_num, revision_num, field_name, sync_run_id)
           VALUES ($1, $2, 'sync_field', $3)`,
          [P1, REV, syncRunId],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects permit_history row with a non-existent sync_run_id', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO permit_history (permit_num, revision_num, field_name, sync_run_id)
           VALUES ($1, $2, 'bad_sync', 999999)`,
          [P1, REV],
        ),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it('nulls sync_run_id when the parent sync_run is deleted', async () => {
      if (!pool) return;
      const sr = await pool.query<{ id: number }>(
        `INSERT INTO sync_runs (status) VALUES ('test') RETURNING id`,
      );
      const tmpId = sr.rows[0]!.id;

      await pool.query(
        `INSERT INTO permit_history (permit_num, revision_num, field_name, sync_run_id)
         VALUES ($1, $2, 'set_null_test', $3)`,
        [P1, REV, tmpId],
      );

      const histRow = await pool.query<{ id: number }>(
        `SELECT id FROM permit_history WHERE sync_run_id = $1`,
        [tmpId],
      );
      const histId = histRow.rows[0]!.id;

      await pool.query(`DELETE FROM sync_runs WHERE id = $1`, [tmpId]);

      const after = await pool.query<{ sync_run_id: number | null }>(
        `SELECT sync_run_id FROM permit_history WHERE id = $1`,
        [histId],
      );
      expect(after.rows[0]?.sync_run_id).toBeNull();
    });
  });

  // ─── c. tracked_projects → permits (CASCADE) ────────────────────────────────

  describe('fk_tracked_projects_permits — CASCADE', () => {
    it('accepts tracked_projects row with a valid parent permit', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO tracked_projects (user_id, permit_num, revision_num, trade_slug)
           VALUES ('fk109-user', $1, $2, 'plumbing')
           ON CONFLICT DO NOTHING`,
          [P1, REV],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects tracked_projects row referencing a non-existent permit', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO tracked_projects (user_id, permit_num, revision_num, trade_slug)
           VALUES ('fk109-user', 'ORPHAN-109', '00', 'plumbing')`,
        ),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it('deletes tracked_projects rows when the parent permit is deleted', async () => {
      if (!pool) return;
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num)
         VALUES ('FK109-TP-CAS', '00') ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO tracked_projects (user_id, permit_num, revision_num, trade_slug)
         VALUES ('fk109-user', 'FK109-TP-CAS', '00', 'electrical')`,
      );

      await pool.query(`DELETE FROM permits WHERE permit_num = 'FK109-TP-CAS'`);

      const after = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM tracked_projects WHERE permit_num = 'FK109-TP-CAS'`,
      );
      expect(Number(after.rows[0]?.c)).toBe(0);
    });
  });

  // ─── d. permits → neighbourhoods (SET NULL) ──────────────────────────────────

  describe('fk_permits_neighbourhoods — SET NULL', () => {
    it('accepts a permit with a valid neighbourhood_id', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `UPDATE permits SET neighbourhood_id = $1
           WHERE permit_num = $2 AND revision_num = $3`,
          [neighbourhoodSerialId, P2, REV],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a permit pointing to a non-existent neighbourhood_id', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `UPDATE permits SET neighbourhood_id = 999999
           WHERE permit_num = $1 AND revision_num = $2`,
          [P2, REV],
        ),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it('nulls neighbourhood_id on permits when the parent neighbourhood is deleted', async () => {
      if (!pool) return;
      const nb = await pool.query<{ id: number }>(
        `INSERT INTO neighbourhoods (neighbourhood_id, name)
         VALUES (99902, 'FK109 Temp Neighbourhood') RETURNING id`,
      );
      const tmpId = nb.rows[0]!.id;

      await pool.query(
        `UPDATE permits SET neighbourhood_id = $1
         WHERE permit_num = $2 AND revision_num = $3`,
        [tmpId, P1, REV],
      );

      await pool.query(`DELETE FROM neighbourhoods WHERE id = $1`, [tmpId]);

      const after = await pool.query<{ neighbourhood_id: number | null }>(
        `SELECT neighbourhood_id FROM permits
         WHERE permit_num = $1 AND revision_num = $2`,
        [P1, REV],
      );
      expect(after.rows[0]?.neighbourhood_id).toBeNull();
    });
  });

  // ─── e. permit_products → permits (CASCADE) ──────────────────────────────────

  describe('fk_permit_products_permits — CASCADE', () => {
    it('accepts permit_products row with a valid parent permit', async () => {
      if (!pool) return;
      // product_id=1 (kitchen-cabinets) seeded by migration 031.
      await expect(
        pool.query(
          `INSERT INTO permit_products
             (permit_num, revision_num, product_id, product_slug, product_name)
           VALUES ($1, $2, 1, 'kitchen-cabinets', 'Kitchen Cabinets')
           ON CONFLICT DO NOTHING`,
          [P1, REV],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects permit_products row referencing a non-existent permit', async () => {
      if (!pool) return;
      await expect(
        pool.query(
          `INSERT INTO permit_products
             (permit_num, revision_num, product_id, product_slug, product_name)
           VALUES ('ORPHAN-109', '00', 1, 'kitchen-cabinets', 'Kitchen Cabinets')`,
        ),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it('deletes permit_products rows when the parent permit is deleted', async () => {
      if (!pool) return;
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num)
         VALUES ('FK109-PP-CAS', '00') ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO permit_products
           (permit_num, revision_num, product_id, product_slug, product_name)
         VALUES ('FK109-PP-CAS', '00', 2, 'appliances', 'Appliances')`,
      );

      await pool.query(`DELETE FROM permits WHERE permit_num = 'FK109-PP-CAS'`);

      const after = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM permit_products WHERE permit_num = 'FK109-PP-CAS'`,
      );
      expect(Number(after.rows[0]?.c)).toBe(0);
    });
  });
});
