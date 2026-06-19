// 🔗 SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §3
//
// Real-DB integration for migration 183 — the Spec 87 sell-side schema (suppliers +
// supplier_products, empty). Verifies the tables exist empty, the account_type CHECK,
// the FK to product_groups (Spec 80 hub), and PK uniqueness. Skipped unless BUILDO_TEST_DB=1.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 183 — Spec 87 suppliers schema', () => {
  afterAll(async () => { if (pool) await pool.end(); });

  it('both tables exist and are empty (accounts are onboarded, not seeded)', async () => {
    if (!pool) return;
    const s = (await pool.query(`SELECT count(*)::int AS n FROM suppliers`)).rows[0].n;
    const sp = (await pool.query(`SELECT count(*)::int AS n FROM supplier_products`)).rows[0].n;
    expect(s).toBe(0);
    expect(sp).toBe(0);
  });

  it('account_type CHECK rejects an unknown value', async () => {
    if (!pool) return;
    await expect(
      pool.query(`INSERT INTO suppliers (name, account_type) VALUES ('X', 'bogus_type')`),
    ).rejects.toThrow();
  });

  it('supplier_products FK to product_groups (Spec 80 hub) + suppliers, with PK uniqueness', async () => {
    if (!pool) return;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `INSERT INTO suppliers (name, account_type) VALUES ('Acme Lighting', 'manufacturer') RETURNING id`,
      );
      const supplierId = rows[0].id;
      // valid product_id (lighting = 10 post-mig-180) links cleanly
      await c.query(`INSERT INTO supplier_products (supplier_id, product_id) VALUES ($1, 10)`, [supplierId]);
      // duplicate PK rejected
      await expect(
        c.query(`INSERT INTO supplier_products (supplier_id, product_id) VALUES ($1, 10)`, [supplierId]),
      ).rejects.toThrow();
      await c.query('ROLLBACK');
      // invalid product_id rejected by FK
      await c.query('BEGIN');
      const r2 = await c.query(
        `INSERT INTO suppliers (name, account_type) VALUES ('Bad', 'supplier_retailer') RETURNING id`,
      );
      await expect(
        c.query(`INSERT INTO supplier_products (supplier_id, product_id) VALUES ($1, 9999)`, [r2.rows[0].id]),
      ).rejects.toThrow();
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    // tables remain empty after the rolled-back probes
    expect((await pool.query(`SELECT count(*)::int AS n FROM suppliers`)).rows[0].n).toBe(0);
  });
});
