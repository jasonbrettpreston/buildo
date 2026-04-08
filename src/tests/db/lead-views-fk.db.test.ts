// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema
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

describe.skipIf(!dbAvailable())('migration 070 — lead_views FK CASCADE', () => {
  beforeAll(async () => {
    if (!pool) return;
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
       VALUES ('fk-test-uid', 'permit:FK 999001:00', 'permit', 'FK 999001', '00', NULL, 'plumbing', NOW(), false)
       ON CONFLICT DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Defensive cleanup in case the cascade test was skipped or partial.
    await pool.query("DELETE FROM lead_views WHERE user_id = 'fk-test-uid'");
    await pool.query("DELETE FROM permits WHERE permit_num = 'FK 999001'");
    await pool.end();
  });

  it('child lead_views row is deleted when the parent permit is deleted', async () => {
    if (!pool) return;
    // Sanity: row exists pre-delete.
    const before = await pool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM lead_views WHERE user_id = 'fk-test-uid'",
    );
    expect(Number(before.rows[0]?.c)).toBe(1);

    // Delete the parent.
    await pool.query("DELETE FROM permits WHERE permit_num = 'FK 999001'");

    // Child should be gone.
    const after = await pool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM lead_views WHERE user_id = 'fk-test-uid'",
    );
    expect(Number(after.rows[0]?.c)).toBe(0);
  });
});
