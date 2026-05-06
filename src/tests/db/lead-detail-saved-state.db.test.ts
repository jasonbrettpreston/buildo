// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 + §4.3.1
//
// Real-DB integration test for the LEAD_DETAIL_SQL `is_saved` lateral.
//
// Mirror of lead-feed-saved-state.db.test.ts but for the single-lead
// detail endpoint introduced in WF1-A. The Multi-Agent plan review caught
// a `$2` vs `$4` parameter-binding bug at plan stage; this test pins the
// SQL semantics so the same class of regression cannot land silently.
//
// What this locks in (the contract that should never silently break):
//
//   1. A permit + a lead_views row (saved=true, user_id=ctx.uid) →
//      detail returns is_saved=true. Pins the lv_self LATERAL EXISTS +
//      `$4::text` user_id binding.
//   2. Same permit, same row, BUT user_id != ctx.uid → detail returns
//      is_saved=false. Pins user-scope (would fail if `$2` was used
//      where `$4` is required).
//   3. Same permit, no lead_views row at all → detail returns
//      is_saved=false. Pins the EXISTS-returns-boolean-not-null contract.
//   4. Same permit, lead_views row with saved=false (user un-saved) →
//      detail returns is_saved=false. Pins read-after-write.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set so the default
// `npm run test` doesn't fail when Docker isn't running locally.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import {
  LEAD_DETAIL_SQL,
  toLeadDetail,
  type LeadDetailRow,
} from '@/lib/leads/lead-detail-query';

const pool = getTestPool();

const PERMIT_NUM = 'TEST 999500';
const PERMIT_REV = '00';
const TRADE_SLUG = 'plumbing';
const SAVED_USER = 'detail-test-uid-saved';
const OTHER_USER = 'detail-test-uid-other';
const TEST_LAT = 43.65;
const TEST_LNG = -79.38;
const LEAD_KEY = `permit:${PERMIT_NUM}:${PERMIT_REV}`;

async function runDetailQuery(viewerUid: string): Promise<LeadDetailRow | null> {
  if (!pool) return null;
  const res = await pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, [
    PERMIT_NUM,
    PERMIT_REV,
    TRADE_SLUG,
    viewerUid,
  ]);
  return res.rows[0] ?? null;
}

describe.skipIf(!dbAvailable())('LEAD_DETAIL_SQL — is_saved roundtrip (WF1-A regression guard)', () => {
  beforeAll(async () => {
    if (!pool) return;

    await pool.query(
      `INSERT INTO trades (slug, name)
       VALUES ($1, 'Plumbing')
       ON CONFLICT (slug) DO NOTHING`,
      [TRADE_SLUG],
    );

    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, status,
                            latitude, longitude, location)
       VALUES ($1, $2, 'TEST', 'Permit Issued',
               $3::float8, $4::float8,
               ST_SetSRID(ST_MakePoint($4::float8, $3::float8), 4326))
       ON CONFLICT DO NOTHING`,
      [PERMIT_NUM, PERMIT_REV, TEST_LAT, TEST_LNG],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM lead_views WHERE user_id IN ($1, $2)`, [
      SAVED_USER,
      OTHER_USER,
    ]);
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.end();
  });

  it('returns is_saved=false when no lead_views row exists for any user', async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM lead_views WHERE lead_key = $1`, [LEAD_KEY]);

    const row = await runDetailQuery(SAVED_USER);
    expect(row).not.toBeNull();
    expect(row!.saved).toBe(false);

    const detail = toLeadDetail(row!);
    expect(detail.is_saved).toBe(false);
  });

  it('returns is_saved=true after the viewer saves the permit (lv_self user_id=$4 binding)', async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM lead_views WHERE lead_key = $1`, [LEAD_KEY]);
    await pool.query(
      `INSERT INTO lead_views (lead_key, lead_type, permit_num, revision_num,
                               user_id, trade_slug, saved, viewed_at, saved_at)
       VALUES ($1, 'permit', $2, $3, $4, $5, true, NOW(), NOW())`,
      [LEAD_KEY, PERMIT_NUM, PERMIT_REV, SAVED_USER, TRADE_SLUG],
    );

    const row = await runDetailQuery(SAVED_USER);
    expect(row).not.toBeNull();
    expect(row!.saved).toBe(true);

    const detail = toLeadDetail(row!);
    expect(detail.is_saved).toBe(true);
  });

  it('returns is_saved=false for a different viewer when only the SAVED_USER has saved (user-scope guard)', async () => {
    // Continues from the previous test's seeded state — saved row exists for
    // SAVED_USER. OTHER_USER queries the same permit and must see false.
    if (!pool) return;

    const row = await runDetailQuery(OTHER_USER);
    expect(row).not.toBeNull();
    // Critical: if the SQL bound user_id to $2 (revision_num) instead of $4,
    // both users would see the same value. This pins the user_id=$4 binding.
    expect(row!.saved).toBe(false);

    const detail = toLeadDetail(row!);
    expect(detail.is_saved).toBe(false);
  });

  it('returns is_saved=false after the viewer un-saves (read-after-write)', async () => {
    if (!pool) return;
    await pool.query(
      `UPDATE lead_views SET saved = false, saved_at = NULL
       WHERE lead_key = $1 AND user_id = $2`,
      [LEAD_KEY, SAVED_USER],
    );

    const row = await runDetailQuery(SAVED_USER);
    expect(row).not.toBeNull();
    expect(row!.saved).toBe(false);

    const detail = toLeadDetail(row!);
    expect(detail.is_saved).toBe(false);
  });
});
