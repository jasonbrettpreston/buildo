// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §Database Schema
//
// Real-DB integration test for the lead_views FK CASCADE on permits.
// Migration 070 declares ON DELETE CASCADE for the permits FK so that
// purging or correcting a permit row doesn't leave orphaned lead_views.
// Phase 2 adversarial reviews flagged this as "dangerous" and the followup
// kept it WONTFIX with the explicit cleanup-strategy rationale. This test
// proves the cascade actually fires at runtime — mocked tests can't.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// mig 229 converted lead_views.user_id varchar→uuid with a FK to
// auth.users(id), so the child lead_views INSERT now needs a real uuid
// user_id AND a matching auth.users parent row. IMPORTANT: the cascade
// UNDER TEST here is still the migration-070 PERMITS FK — deleting the
// parent PERMIT cascade-deletes the lead_views row. That topology is
// unchanged by mig 229 (only the user_id column type/FK changed), so the
// auth.users row is a seed prerequisite, NOT the cascade source; the test's
// intent (permit purge removes orphaned lead_views) is preserved verbatim.
// uuid prefix `1eadf000-` ('lead'/'f000' are valid hex digits).
const FK_TEST_UID = '1eadf000-0000-4000-8000-000000000001';

describe.skipIf(!dbAvailable())('migration 070 — lead_views FK CASCADE', () => {
  beforeAll(async () => {
    if (!pool) return;
    // Seed the auth.users parent first (mig 229 FK prerequisite for the
    // lead_views child insert below).
    await pool.query(
      `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [FK_TEST_UID],
    );
    // Insert a parent permit + a child lead_views row pointing at it.
    await pool.query(`
      INSERT INTO permits (permit_num, revision_num, permit_type, status,
                           latitude, longitude, location)
      VALUES ('FK 999001', '00', 'TEST', 'Permit Issued',
              43.65, -79.38,
              ST_SetSRID(ST_MakePoint(-79.38, 43.65), 4326))
      ON CONFLICT DO NOTHING
    `);
    await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, 'permit:FK 999001:00', 'permit', 'FK 999001', '00', NULL, 'plumbing', NOW(), false)
       ON CONFLICT DO NOTHING`,
      [FK_TEST_UID],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Defensive cleanup in case the cascade test was skipped or partial.
    await pool.query(`DELETE FROM lead_views WHERE user_id = $1`, [FK_TEST_UID]);
    await pool.query("DELETE FROM permits WHERE permit_num = 'FK 999001'");
    // Parent identity row last (its lead_views children are already gone).
    await pool.query(`DELETE FROM auth.users WHERE id = $1`, [FK_TEST_UID]);
    await pool.end();
  });

  it('child lead_views row is deleted when the parent permit is deleted', async () => {
    if (!pool) return;
    // Sanity: row exists pre-delete.
    const before = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM lead_views WHERE user_id = $1`,
      [FK_TEST_UID],
    );
    expect(Number(before.rows[0]?.c)).toBe(1);

    // Delete the parent.
    await pool.query("DELETE FROM permits WHERE permit_num = 'FK 999001'");

    // Child should be gone.
    const after = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM lead_views WHERE user_id = $1`,
      [FK_TEST_UID],
    );
    expect(Number(after.rows[0]?.c)).toBe(0);
  });
});
