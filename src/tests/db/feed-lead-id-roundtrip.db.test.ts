// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1 (id-format)
//            docs/specs/03-mobile/91_mobile_lead_feed.md §3.2 (Save Mutation)
//
// P21 MANDATORY LOCK — feed lead_id round-trip.
//
// This test pins the end-to-end contract:
//
//   EMIT  : getLeadFeed() emits lead_id as `${permit_num}:${LPAD(rev,2,'0')}`
//           (the feed-colon form — no 'permit:' prefix)
//   PARSE : parseLeadId(emitted_lead_id) returns { kind:'permit', permit_num, revision_num }
//   DETAIL: LEAD_DETAIL_SQL accepts the parsed values (200-shape — row returned)
//   SAVE  : parseSaveLeadId + recordLeadView write lead_views.saved=true with the
//           canonical `permit:${num}:${LPAD(rev,2,'0')}` lead_key
//   LIST  : a flight-board-style query (lead_views WHERE saved=true) shows the saved lead
//
// Without this lock, a change to get-lead-feed.ts's `lead_id` projection or to
// parseLeadId could silently break the save flow — mocked tests can't catch it.
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- feed-lead-id-roundtrip

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { parseLeadId } from '@/lib/leads/parse-lead-id';
import { LEAD_DETAIL_SQL, type LeadDetailRow } from '@/lib/leads/lead-detail-query';
import { recordLeadView } from '@/features/leads/lib/record-lead-view';

const pool = getTestPool();

// Fixture ids — prefixed P21RT to avoid collisions with other db tests.
const PERMIT_NUM = 'TEST P21RT-001';
const PERMIT_REV = '00';
const TRADE_SLUG = 'plumbing';
const USER_ID = 'p21-roundtrip-uid';
// The feed-emitted form: permit_num || ':' || LPAD(revision_num, 2, '0')
const EXPECTED_LEAD_ID = `${PERMIT_NUM}:${PERMIT_REV}`;
// The canonical lead_key written by buildLeadKey / recordLeadView
const EXPECTED_LEAD_KEY = `permit:${PERMIT_NUM}:${PERMIT_REV}`;
const TEST_LAT = 43.651;
const TEST_LNG = -79.381;

describe.skipIf(!dbAvailable())('feed lead_id round-trip — P21 lock (Spec 91 §4.3.1)', () => {
  if (!pool) return;

  async function cleanup() {
    if (!pool) return;
    await pool.query(`DELETE FROM lead_views WHERE user_id = $1`, [USER_ID]);
    await pool.query(`DELETE FROM permit_trades WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [USER_ID]);
  }

  beforeAll(async () => {
    if (!pool) return;
    await cleanup();

    // trades row (plumbing should exist from mig 002 seed, but ensure it)
    await pool.query(
      `INSERT INTO trades (slug, name) VALUES ($1, 'Plumbing') ON CONFLICT (slug) DO NOTHING`,
      [TRADE_SLUG],
    );

    // user_profiles row — trade_slug NOT NULL mandatory (Spec 75 §DB constraint)
    await pool.query(
      `INSERT INTO user_profiles (user_id, trade_slug)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [USER_ID, TRADE_SLUG],
    );

    // permit with PostGIS location so the feed ST_DWithin filter accepts it
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, status,
                            latitude, longitude, location)
       VALUES ($1, $2, 'Residential', 'Permit Issued',
               $3::float8, $4::float8,
               ST_SetSRID(ST_MakePoint($4::float8, $3::float8), 4326))
       ON CONFLICT DO NOTHING`,
      [PERMIT_NUM, PERMIT_REV, TEST_LAT, TEST_LNG],
    );

    // permit_trades — links permit to the plumbing trade so getLeadFeed returns it
    const tradeRow = await pool.query<{ id: number }>(
      `SELECT id FROM trades WHERE slug = $1`,
      [TRADE_SLUG],
    );
    const tradeId = tradeRow.rows[0]?.id;
    if (typeof tradeId !== 'number') {
      throw new Error('P21 round-trip fixture: plumbing trade id not found');
    }
    await pool.query(
      `INSERT INTO permit_trades (permit_num, revision_num, trade_id, is_active, confidence, phase)
       VALUES ($1, $2, $3, true, 0.9, 'structural')
       ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
      [PERMIT_NUM, PERMIT_REV, tradeId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await pool?.end();
  });

  it('T1: emitted lead_id is NUM:REV (no permit: prefix); parseLeadId accepts it', async () => {
    if (!pool) return;

    // Step 1 — call the REAL getLeadFeed
    const feed = await getLeadFeed(
      {
        user_id: USER_ID,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 50,
        limit: 30,
        disableCoa: true,
        lead_type: 'permit',
      },
      pool,
    );

    const lead = feed.data.find(
      (item) => item.lead_type === 'permit' && 'permit_num' in item && item.permit_num === PERMIT_NUM,
    );
    expect(lead).toBeDefined();
    const emittedLeadId = lead!.lead_id;

    // Step 2 — the emitted form is NUM:REV (no 'permit:' prefix)
    expect(emittedLeadId).toBe(EXPECTED_LEAD_ID);

    // Step 3 — parseLeadId accepts the feed-emitted form
    const parsed = parseLeadId(emittedLeadId);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('permit');
    if (!parsed || parsed.kind !== 'permit') throw new Error('parseLeadId returned wrong kind');
    expect(parsed.permit_num).toBe(PERMIT_NUM);
    expect(parsed.revision_num).toBe(PERMIT_REV);

    // Step 4 — LEAD_DETAIL_SQL accepts the parsed values (200-shape: row returned)
    const detailRes = await pool.query<LeadDetailRow>(LEAD_DETAIL_SQL, [
      parsed.permit_num,
      parsed.revision_num,
      TRADE_SLUG,
      USER_ID,
    ]);
    expect(detailRes.rows).toHaveLength(1);
    expect(detailRes.rows[0]!.permit_num).toBe(PERMIT_NUM);
  });

  it('T2: save via recordLeadView writes canonical lead_key; flight-board query sees it', async () => {
    if (!pool) return;

    // Parse the emitted form (same as T1)
    const parsed = parseLeadId(EXPECTED_LEAD_ID);
    if (!parsed || parsed.kind !== 'permit') throw new Error('fixture parse failed');

    // Step 5 — recordLeadView (the lib called by parseSaveLeadId flow) saves the lead
    const saveResult = await recordLeadView(
      {
        user_id: USER_ID,
        trade_slug: TRADE_SLUG,
        action: 'save',
        lead_type: 'permit',
        permit_num: parsed.permit_num,
        revision_num: parsed.revision_num,
      },
      pool,
    );
    expect(saveResult.ok).toBe(true);

    // Step 6 — lead_views row has saved=true with canonical 'permit:NUM:REV' lead_key
    const { rows: lvRows } = await pool.query<{ lead_key: string; saved: boolean }>(
      `SELECT lead_key, saved
       FROM lead_views
       WHERE user_id = $1 AND lead_type = 'permit' AND permit_num = $2`,
      [USER_ID, PERMIT_NUM],
    );
    expect(lvRows).toHaveLength(1);
    expect(lvRows[0]!.saved).toBe(true);
    expect(lvRows[0]!.lead_key).toBe(EXPECTED_LEAD_KEY);

    // Step 7 — flight-board-style query: saved permit appears
    const { rows: fbRows } = await pool.query<{ permit_num: string }>(
      `SELECT lv.permit_num
       FROM lead_views lv
       INNER JOIN permits p
         ON p.permit_num = lv.permit_num AND p.revision_num = lv.revision_num
       WHERE lv.user_id = $1 AND lv.saved = true AND lv.lead_type = 'permit'`,
      [USER_ID],
    );
    expect(fbRows.some((r) => r.permit_num === PERMIT_NUM)).toBe(true);
  });
});
