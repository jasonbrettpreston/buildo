// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §5
//
// Real-DB integration tests for migration 215 admin_watchlist + the flight
// list SQL semantics that mocked-pool tests cannot validate
// (feedback_db_integration_tests — SQL-string tests miss CHECK/NOT-NULL/
// UNIQUE):
//   · the XOR shape CHECK (permit vs coa arm) rejects malformed rows,
//   · bulk-save ON CONFLICT (admin_uid, lead_key) idempotency,
//   · bulk-delete by id array scoped to admin_uid (a foreign id is inert),
//   · the [PF7] UNION ALL flight-list JOIN to permits + trade_forecasts with
//     the [PF-G3] active-trade gate (inactive trades cannot supply the
//     expected start),
//   · the coa watch round-trip,
//   · [PF10] no-auto-eviction: a lifecycle-advanced permit still returns.
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL is set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// The EXACT list SQL from the route (kept in lockstep by reading the source —
// a drifted copy here would validate the wrong query).
const routeSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'app', 'api', 'admin', 'leads', 'watchlist', 'route.ts'),
  'utf8',
);
const WATCHLIST_SQL = /const WATCHLIST_SQL = `([\s\S]*?)`;/.exec(routeSrc)?.[1] as string;

const UID = 'wl-test-admin';
const OTHER_UID = 'wl-test-other';

interface ListRow {
  id: number;
  lead_type: 'permit' | 'coa';
  lead_key: string;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
}

describe.skipIf(!dbAvailable())('migration 215 — admin_watchlist + flight-list SQL', () => {
  beforeAll(async () => {
    if (!pool) return;
    // Parent fixtures: one permit with trades+forecasts, one coa.
    await pool.query(`
      INSERT INTO permits (permit_num, revision_num, permit_type, status,
                           street_num, street_name, lifecycle_phase, lifecycle_stalled)
      VALUES ('WL 900001', '00', 'TEST', 'Permit Issued', '12', 'WATCH ST', 'P12', false)
      ON CONFLICT DO NOTHING
    `);
    await pool.query(`
      INSERT INTO coa_applications (application_number, address, status, lifecycle_phase, lifecycle_stalled)
      VALUES ('WL-A1/26', '99 WATCH AVE', 'Approved', 'P20', false)
      ON CONFLICT DO NOTHING
    `);
    // Two trades: one active, one inactive — the inactive one carries the
    // EARLIER forecast so the [PF-G3] gate is actually load-bearing.
    await pool.query(`
      INSERT INTO trades (slug, name) VALUES ('wl-trade-active', 'WL Active'), ('wl-trade-inactive', 'WL Inactive')
      ON CONFLICT DO NOTHING
    `);
    await pool.query(`
      INSERT INTO permit_trades (permit_num, revision_num, trade_id, is_active)
      SELECT 'WL 900001', '00', t.id, t.slug = 'wl-trade-active'
      FROM trades t WHERE t.slug IN ('wl-trade-active', 'wl-trade-inactive')
      ON CONFLICT DO NOTHING
    `);
    await pool.query(`
      INSERT INTO trade_forecasts (permit_num, revision_num, trade_slug, lead_id, predicted_start, p25_days, p75_days, opportunity_score)
      VALUES
        ('WL 900001', '00', 'wl-trade-active',   'permit:WL 900001:00', '2026-09-10', 7, 21, 40),
        ('WL 900001', '00', 'wl-trade-inactive', 'permit:WL 900001:00', '2026-08-01', 3, 9, 90)
      ON CONFLICT DO NOTHING
    `);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM admin_watchlist WHERE admin_uid IN ($1, $2)', [UID, OTHER_UID]);
    await pool.query("DELETE FROM trade_forecasts WHERE lead_id = 'permit:WL 900001:00'");
    await pool.query(
      "DELETE FROM permit_trades WHERE permit_num = 'WL 900001' AND revision_num = '00'",
    );
    await pool.query("DELETE FROM trades WHERE slug IN ('wl-trade-active', 'wl-trade-inactive')");
    await pool.query("DELETE FROM permits WHERE permit_num = 'WL 900001'");
    await pool.query("DELETE FROM coa_applications WHERE application_number = 'WL-A1/26'");
    await pool.end();
  });

  it('XOR CHECK — a permit row with a coa_application_number is rejected', async () => {
    if (!pool) return;
    await expect(
      pool.query(
        `INSERT INTO admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num, coa_application_number)
         VALUES ($1, 'permit', 'permit:BAD:00', 'BAD', '00', 'A9/99')`,
        [UID],
      ),
    ).rejects.toThrow(/admin_watchlist_shape_check/);
  });

  it('XOR CHECK — a coa row carrying permit identifiers is rejected', async () => {
    if (!pool) return;
    await expect(
      pool.query(
        `INSERT INTO admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num, coa_application_number)
         VALUES ($1, 'coa', 'coa:A9/99', 'BAD', '00', 'A9/99')`,
        [UID],
      ),
    ).rejects.toThrow(/admin_watchlist_shape_check/);
  });

  it('lead_type CHECK — builder is not admissible', async () => {
    if (!pool) return;
    await expect(
      pool.query(
        `INSERT INTO admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num)
         VALUES ($1, 'builder', 'builder:1', NULL, NULL)`,
        [UID],
      ),
    ).rejects.toThrow(/admin_watchlist_lead_type_check|admin_watchlist_shape_check/);
  });

  it('bulk-save ON CONFLICT (admin_uid, lead_key) is idempotent', async () => {
    if (!pool) return;
    const insertSql = `
      INSERT INTO admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num, address_snapshot)
      VALUES ($1, 'permit', 'permit:WL 900001:00', 'WL 900001', '00', '12 WATCH ST')
      ON CONFLICT (admin_uid, lead_key) DO NOTHING
      RETURNING id`;
    const first = await pool.query(insertSql, [UID]);
    expect(first.rowCount).toBe(1);
    const second = await pool.query(insertSql, [UID]);
    expect(second.rowCount).toBe(0); // skipped_existing
    // A DIFFERENT admin saving the same lead is its own row (per-admin board).
    const other = await pool.query(insertSql, [OTHER_UID]);
    expect(other.rowCount).toBe(1);
  });

  it('coa watch round-trip through the [PF7] UNION ALL list SQL', async () => {
    if (!pool) return;
    await pool.query(
      `INSERT INTO admin_watchlist (admin_uid, lead_type, lead_key, coa_application_number)
       VALUES ($1, 'coa', 'coa:WL-A1/26', 'WL-A1/26')
       ON CONFLICT (admin_uid, lead_key) DO NOTHING`,
      [UID],
    );
    const res = await pool.query<ListRow>(WATCHLIST_SQL, [UID, 50, 0]);
    const coaRow = res.rows.find((r) => r.lead_key === 'coa:WL-A1/26');
    expect(coaRow).toBeDefined();
    expect(coaRow!.lead_type).toBe('coa');
    // No snapshot supplied → live coa address fallback.
    expect(coaRow!.address).toBe('99 WATCH AVE');
    expect(coaRow!.lifecycle_stalled).toBe(false);
  });

  it('[PF-G3] the expected start comes from the ACTIVE trade — the inactive earlier forecast is excluded', async () => {
    if (!pool) return;
    const res = await pool.query<ListRow>(WATCHLIST_SQL, [UID, 50, 0]);
    const permitRow = res.rows.find((r) => r.lead_key === 'permit:WL 900001:00');
    expect(permitRow).toBeDefined();
    // The inactive trade's 2026-08-01 forecast must NOT win the MIN.
    expect(permitRow!.predicted_start).toBe('2026-09-10');
    expect(permitRow!.p25_days).toBe(7);
    expect(permitRow!.p75_days).toBe(21);
    // MAX(score) is likewise active-gated: 40, not the inactive 90.
    expect(permitRow!.opportunity_score).toBe(40);
    // address_snapshot wins over the live street-concat ([PF8]).
    expect(permitRow!.address).toBe('12 WATCH ST');
  });

  it('[PF10] no-auto-eviction — a lifecycle-ADVANCED permit still returns from the list SQL', async () => {
    if (!pool) return;
    // P20 is far past any trade's work phase — the consumer flight-board
    // would drop this row; the watchlist must keep it.
    await pool.query(
      "UPDATE permits SET lifecycle_phase = 'P20' WHERE permit_num = 'WL 900001' AND revision_num = '00'",
    );
    const res = await pool.query<ListRow>(WATCHLIST_SQL, [UID, 50, 0]);
    const row = res.rows.find((r) => r.lead_key === 'permit:WL 900001:00');
    expect(row).toBeDefined();
    expect(row!.lifecycle_phase).toBe('P20');
  });

  it('bulk-delete is admin_uid-scoped — a foreign id is inert', async () => {
    if (!pool) return;
    const otherRow = await pool.query<{ id: number }>(
      'SELECT id FROM admin_watchlist WHERE admin_uid = $1 LIMIT 1',
      [OTHER_UID],
    );
    const foreignId = otherRow.rows[0]!.id;
    // UID attempts to delete OTHER_UID's row → 0 deleted.
    const del = await pool.query(
      'DELETE FROM admin_watchlist WHERE admin_uid = $1 AND id = ANY($2::int[]) RETURNING id',
      [UID, [foreignId]],
    );
    expect(del.rowCount).toBe(0);
    // The owner deletes it fine.
    const ownDel = await pool.query(
      'DELETE FROM admin_watchlist WHERE admin_uid = $1 AND id = ANY($2::int[]) RETURNING id',
      [OTHER_UID, [foreignId]],
    );
    expect(ownDel.rowCount).toBe(1);
  });
});
