// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema
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
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set.

import type { DatabaseError } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 070 — lead_views XOR CHECK', () => {
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM lead_views WHERE user_id LIKE 'xor-test-%'");
    await pool.end();
  });

  const baseRow = {
    user_id: 'xor-test-uid-1',
    lead_key: 'permit:24 999001:00',
    trade_slug: 'plumbing',
  };

  it('accepts a permit-only row (permit_num + revision_num, entity_id null)', async () => {
    if (!pool) return;
    const res = await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, $2, 'permit', '24 999001', '00', NULL, $3, NOW(), false)
       RETURNING id`,
      [baseRow.user_id + 'a', baseRow.lead_key + 'a', baseRow.trade_slug],
    );
    expect(res.rowCount).toBe(1);
  });

  it('accepts a builder-only row (entity_id set, permit fields null)', async () => {
    if (!pool) return;
    const res = await pool.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
       VALUES ($1, $2, 'builder', NULL, NULL, 9999, $3, NOW(), false)
       RETURNING id`,
      [baseRow.user_id + 'b', 'builder:9999b', baseRow.trade_slug],
    );
    expect(res.rowCount).toBe(1);
  });

  it('REJECTS both-set rows with SQLSTATE 23514 (check_violation)', async () => {
    if (!pool) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'permit', '24 999001', '00', 9999, $3, NOW(), false)`,
        [baseRow.user_id + 'c', 'permit:24 999001:00c', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });

  it('REJECTS neither-set rows with SQLSTATE 23514 (check_violation)', async () => {
    if (!pool) return;
    let caught: DatabaseError | null = null;
    try {
      await pool.query(
        `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved)
         VALUES ($1, $2, 'permit', NULL, NULL, NULL, $3, NOW(), false)`,
        [baseRow.user_id + 'd', 'permit:emptyd', baseRow.trade_slug],
      );
    } catch (err) {
      caught = err as DatabaseError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe('23514');
  });
});
