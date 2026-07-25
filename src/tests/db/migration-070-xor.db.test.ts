// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §Database Schema
//
// Real-DB integration test for the lead_views XOR CHECK constraint
// (migration 070). Mocked tests can't catch a runtime constraint violation
// because the mock pool returns whatever the test wants. This test runs
// against a real Postgres + the actual migration SQL.
//
// What it locks in:
//   - Permit-only INSERT succeeds (permit_num + revision_num set, entity_id null)
//   - Builder-only INSERT succeeds (entity_id set, permit fields null)
//   - Both-set INSERT fails with check_violation (SQLSTATE 23514)
//   - Neither-set INSERT fails with check_violation (SQLSTATE 23514)
//
// Migration 229 (Supabase Phase 1, D6) converted lead_views.user_id to UUID
// with a real FK to auth.users(id) ON DELETE CASCADE. The pre-229 string
// sentinel ('xor-test-uid-1…') now fails at the uuid PARSE (22P02) before the
// XOR CHECK is ever evaluated — which silently masked this suite's constraint
// coverage (the both-set/neither-set REJECT cases were seeing 22P02, not the
// intended 23514). The fixture user is now a real auth.users row (deterministic
// uuid, cleaned up in afterAll), following offboarding-sweep.db.test.ts /
// lead-detail-saved-state.db.test.ts: self-detect auth.users availability and
// skip gracefully when it is absent (a bare-postgis container without the
// Supabase auth schema). A valid uuid lets every row reach the CHECK, so the
// 23514 assertions genuinely exercise the constraint again.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import type { DatabaseError } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// Deterministic fixture uuid (unique '07000d15' prefix for this file) — a real
// auth.users row is seeded under it so the FK (mig 229) is satisfied. All lead_views
// rows share this user_id; per-test distinctness is carried by lead_key, as before.
const XOR_USER_ID = '07000d15-0000-4000-8000-000000000001';

describe.skipIf(!dbAvailable())('migration 070 — lead_views XOR CHECK', () => {
  let hasAuthUsers = false;

  // WF3 2026-05-08 — seed the FK targets the four it() blocks point at.
  // The "accepts ..." tests need both targets to actually exist; without seeds
  // they hit FK violation (23503) instead of the intended success / CHECK fire.
  // Pattern mirrors lead-views-fk.db.test.ts:18-34.
  beforeAll(async () => {
    if (!pool) return;
    const authCheck = await pool.query<{ has_auth: boolean }>(
      `SELECT to_regclass('auth.users') IS NOT NULL AS has_auth`,
    );
    hasAuthUsers = authCheck.rows[0]?.has_auth === true;
    // mig 229 FK: lead_views.user_id → auth.users(id). Seed the parent row so
    // the XOR CHECK (not the FK) is what the constraint tests exercise.
    if (hasAuthUsers) {
      await pool.query(
        `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [XOR_USER_ID],
      );
    }
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, status)
       VALUES ('24 999001', '00', 'TEST', 'Permit Issued')
       ON CONFLICT (permit_num, revision_num) DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO entities (id, legal_name, name_normalized)
       VALUES (9999, 'XOR Test Builder', 'xor-test-builder-9999')
       ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Order: delete the children first (CASCADE would also cover this, but
    // explicit deletes keep the cleanup intent obvious).
    if (hasAuthUsers) {
      await pool.query(`DELETE FROM lead_views WHERE user_id = $1`, [XOR_USER_ID]);
    }
    await pool.query("DELETE FROM entities WHERE id = 9999");
    await pool.query("DELETE FROM permits WHERE permit_num = '24 999001' AND revision_num = '00'");
    // Removing the auth.users parent CASCADEs away any lead_views rows left
    // under XOR_USER_ID (mig 229 fk_lead_views_user).
    if (hasAuthUsers) {
      await pool.query(`DELETE FROM auth.users WHERE id = $1`, [XOR_USER_ID]);
    }
    await pool.end();
  });

  const baseRow = {
    lead_key: 'permit:24 999001:00',
    trade_slug: 'plumbing',
  };

  it('accepts a permit-only row (permit_num + revision_num, entity_id null)', async () => {
    if (!pool || !hasAuthUsers) return;
    const res = await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, $2, 'permit', '24 999001', '00', NULL, $3, NOW(), false)
       RETURNING id`,
      [XOR_USER_ID, baseRow.lead_key + 'a', baseRow.trade_slug],
    );
    expect(res.rowCount).toBe(1);
  });

  it('accepts a builder-only row (entity_id set, permit fields null)', async () => {
    if (!pool || !hasAuthUsers) return;
    const res = await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, $2, 'builder', NULL, NULL, 9999, $3, NOW(), false)
       RETURNING id`,
      [XOR_USER_ID, 'builder:9999b', baseRow.trade_slug],
    );
    expect(res.rowCount).toBe(1);
  });

  it('REJECTS both-set rows with SQLSTATE 23514 (check_violation)', async () => {
    if (!pool || !hasAuthUsers) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'permit', '24 999001', '00', 9999, $3, NOW(), false)`,
        [XOR_USER_ID, 'permit:24 999001:00c', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });

  it('REJECTS neither-set rows with SQLSTATE 23514 (check_violation)', async () => {
    if (!pool || !hasAuthUsers) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'permit', NULL, NULL, NULL, $3, NOW(), false)`,
        [XOR_USER_ID, 'permit:emptyd', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });

  // ── WF2 P6 (mig 212) — CoA lead_type + third XOR arm ────────────────────────
  // CoA rows carry identity via lead_key='coa:...'; all three shape columns null.
  it('accepts a coa row (all shape cols null, identity via lead_key)', async () => {
    if (!pool || !hasAuthUsers) return;
    const res = await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, $2, 'coa', NULL, NULL, NULL, $3, NOW(), false)
       RETURNING id`,
      [XOR_USER_ID, 'coa:A0125-24', baseRow.trade_slug],
    );
    expect(res.rowCount).toBe(1);
  });

  it('REJECTS a coa row with permit_num set (XOR arm violation, 23514)', async () => {
    if (!pool || !hasAuthUsers) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'coa', '24 999001', '00', NULL, $3, NOW(), false)`,
        [XOR_USER_ID, 'coa:badshape', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });

  it('REJECTS a junk lead_type (type CHECK, 23514)', async () => {
    if (!pool || !hasAuthUsers) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'garbage', NULL, NULL, NULL, $3, NOW(), false)`,
        [XOR_USER_ID, 'junk:1', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });
});
