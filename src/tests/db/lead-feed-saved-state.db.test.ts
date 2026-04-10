// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema + §API Endpoints
//
// Real-DB integration test for the LEAD_FEED_SQL is_saved roundtrip.
//
// Why this test exists: Phase 3-vi shipped a silent regression where
// the lv_p / lv_b LEFT JOIN predicates omitted the 'permit:' /
// 'builder:' prefixes that buildLeadKey() writes. The JOINs never
// matched, so is_saved was structurally always false for the entire
// feed — every refetch reset every heart server-side. The Phase 3-vi
// test suite codified the WRONG format in a regex assertion, locking
// the bug in. Mocked-pool tests can't catch this class because the
// mock returns whatever the test wants.
//
// What this locks in (the contract that should never silently break
// again):
//
//   1. A permit lead_view written by recordLeadView() with the
//      canonical lead_key produces is_saved=true on the next
//      getLeadFeed() call. Pins the lv_p prefix JOIN.
//   2. Same for a builder lead. Pins the lv_b prefix JOIN.
//   3. A second user (no lead_views rows) sees the SAME leads with
//      is_saved=false for both. Pins the user-scope predicate so a
//      future "drop the user_id from the JOIN" footgun fails loudly.
//   4. recordLeadView({ action:'unsave' }) propagates: a fresh
//      getLeadFeed() returns is_saved=false. Pins read-after-write.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set so the default
// `npm run test` doesn't fail when Docker isn't running locally.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { recordLeadView } from '@/features/leads/lib/record-lead-view';
import type { LeadFeedItem } from '@/features/leads/types';

const pool = getTestPool();

// Test fixture identifiers — all prefixed `TEST 9991` / `feed-test-`
// so the afterAll cleanup is targeted and concurrent tests are
// unaffected.
const PERMIT_NUM_A = 'TEST 999100';
const PERMIT_NUM_B = 'TEST 999101';
const PERMIT_REV = '00';
const TRADE_SLUG = 'plumbing';
const SAVED_USER = 'feed-test-uid-saved';
const OTHER_USER = 'feed-test-uid-other';
const ENTITY_LEGAL_NAME = 'TEST 999100 BUILDER CO';
const ENTITY_NAME_NORM = 'test 999100 builder co';
const TEST_LAT = 43.65;
const TEST_LNG = -79.38;

// Captured during seed so the assertions can reference the real
// SERIAL-generated entity_id (the 'builder:' lead_key includes it).
let entityId: number | null = null;

describe.skipIf(!dbAvailable())('LEAD_FEED_SQL — is_saved roundtrip (Phase 3-vi regression guard)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // Trade row — `plumbing` should already exist from migration 002
    // seeding, but defensively ensure it.
    await pool.query(
      `INSERT INTO trades (slug, name)
       VALUES ($1, 'Plumbing')
       ON CONFLICT (slug) DO NOTHING`,
      [TRADE_SLUG],
    );

    // Two permits at the same coords — one will be the standalone
    // permit lead, the other gets linked to the builder via
    // entity_projects so the builder candidate has at least one
    // active permit in radius.
    for (const permitNum of [PERMIT_NUM_A, PERMIT_NUM_B]) {
      // Explicit ::float8 casts on lat/lng — without them, Postgres
      // can't deduce $3/$4's type because each placeholder appears
      // in two contexts (numeric column + ST_MakePoint float8 arg)
      // and node-pg's parameterized-query path errors with
      // "inconsistent types deduced for parameter $N".
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, permit_type, status,
                              latitude, longitude, location)
         VALUES ($1, $2, 'TEST', 'Permit Issued',
                 $3::float8, $4::float8,
                 ST_SetSRID(ST_MakePoint($4::float8, $3::float8), 4326))
         ON CONFLICT DO NOTHING`,
        [permitNum, PERMIT_REV, TEST_LAT, TEST_LNG],
      );
    }

    // permit_trades for both permits → plumbing, active, high
    // confidence, structural phase. Both rows are needed: PERMIT_NUM_A
    // produces the permit candidate, PERMIT_NUM_B is the builder's
    // active permit (the builder CTE re-joins permit_trades on the
    // permit it picks up via entity_projects).
    const tradeIdRes = await pool.query<{ id: number }>(
      `SELECT id FROM trades WHERE slug = $1`,
      [TRADE_SLUG],
    );
    const tradeId = tradeIdRes.rows[0]?.id;
    if (typeof tradeId !== 'number') {
      throw new Error('Test fixture: plumbing trade row missing — migration 002 may not have seeded.');
    }
    for (const permitNum of [PERMIT_NUM_A, PERMIT_NUM_B]) {
      await pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id,
                                    is_active, confidence, phase)
         VALUES ($1, $2, $3, true, 0.9, 'structural')
         ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
        [permitNum, PERMIT_REV, tradeId],
      );
    }

    // Entity (builder)
    const entityRes = await pool.query<{ id: number }>(
      `INSERT INTO entities (legal_name, name_normalized, entity_type,
                             primary_phone, website)
       VALUES ($1, $2, 'Corporation', '416-555-0100', 'https://example.test')
       ON CONFLICT (name_normalized) DO UPDATE SET legal_name = EXCLUDED.legal_name
       RETURNING id`,
      [ENTITY_LEGAL_NAME, ENTITY_NAME_NORM],
    );
    entityId = entityRes.rows[0]?.id ?? null;
    if (entityId === null) {
      throw new Error('Test fixture: failed to insert/return entity row.');
    }

    // entity_projects — link the entity to PERMIT_NUM_B as Builder.
    await pool.query(
      `INSERT INTO entity_projects (entity_id, permit_num, revision_num, role)
       VALUES ($1, $2, $3, 'Builder')
       ON CONFLICT (entity_id, permit_num, revision_num, role) DO NOTHING`,
      [entityId, PERMIT_NUM_B, PERMIT_REV],
    );

    // wsib_registry — the builder CTE filters to is_gta=true,
    // last_enriched_at IS NOT NULL, business_size IN (...) and
    // phone-or-website. Provide all four.
    await pool.query(
      `INSERT INTO wsib_registry (
         legal_name, legal_name_normalized, predominant_class, business_size,
         linked_entity_id, is_gta, last_enriched_at, primary_phone, website
       )
       VALUES ($1, $2, '732', 'Medium Business', $3, true, NOW(),
               '416-555-0100', 'https://example.test')
       ON CONFLICT (legal_name_normalized, mailing_address) DO NOTHING`,
      [ENTITY_LEGAL_NAME, ENTITY_NAME_NORM, entityId],
    );

    // lead_views: write via the REAL recordLeadView() so the test
    // pins the writer/reader contract end-to-end. Both rows are
    // saved=true initially. Cross-user assertion uses OTHER_USER
    // which has no lead_views rows.
    const permitWrite = await recordLeadView(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        action: 'save',
        lead_type: 'permit',
        permit_num: PERMIT_NUM_A,
        revision_num: PERMIT_REV,
      },
      pool,
    );
    if (!permitWrite.ok) {
      throw new Error('Test fixture: recordLeadView failed for permit save.');
    }
    const builderWrite = await recordLeadView(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        action: 'save',
        lead_type: 'builder',
        entity_id: entityId,
      },
      pool,
    );
    if (!builderWrite.ok) {
      throw new Error('Test fixture: recordLeadView failed for builder save.');
    }
  });

  afterAll(async () => {
    if (!pool) return;
    // FK-safe deletion order. Each statement narrowly targets the
    // test fixture so concurrent tests aren't disturbed.
    await pool.query(
      `DELETE FROM lead_views WHERE user_id IN ($1, $2)`,
      [SAVED_USER, OTHER_USER],
    );
    await pool.query(
      `DELETE FROM entity_projects WHERE permit_num IN ($1, $2)`,
      [PERMIT_NUM_A, PERMIT_NUM_B],
    );
    await pool.query(
      `DELETE FROM wsib_registry WHERE legal_name_normalized = $1`,
      [ENTITY_NAME_NORM],
    );
    await pool.query(
      `DELETE FROM entities WHERE name_normalized = $1`,
      [ENTITY_NAME_NORM],
    );
    await pool.query(
      `DELETE FROM permit_trades WHERE permit_num IN ($1, $2)`,
      [PERMIT_NUM_A, PERMIT_NUM_B],
    );
    await pool.query(
      `DELETE FROM permits WHERE permit_num IN ($1, $2)`,
      [PERMIT_NUM_A, PERMIT_NUM_B],
    );
    await pool.end();
  });

  function permitItem(items: LeadFeedItem[]): LeadFeedItem | undefined {
    return items.find(
      (i) => i.lead_type === 'permit' && i.permit_num === PERMIT_NUM_A,
    );
  }

  function builderItem(items: LeadFeedItem[]): LeadFeedItem | undefined {
    return items.find(
      (i) => i.lead_type === 'builder' && i.entity_id === entityId,
    );
  }

  it('returns BOTH permit and builder leads for the saved user (sanity)', async () => {
    if (!pool) return;
    const result = await getLeadFeed(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 5,
        limit: 15,
      },
      pool,
    );
    expect(permitItem(result.data)).toBeDefined();
    expect(builderItem(result.data)).toBeDefined();
  });

  it('PERMIT lead is_saved === true after recordLeadView save (lv_p prefix JOIN contract)', async () => {
    if (!pool) return;
    const result = await getLeadFeed(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 5,
        limit: 15,
      },
      pool,
    );
    const item = permitItem(result.data);
    expect(item).toBeDefined();
    expect(item?.is_saved).toBe(true);
  });

  it('BUILDER lead is_saved === true after recordLeadView save (lv_b prefix JOIN contract)', async () => {
    if (!pool) return;
    const result = await getLeadFeed(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 5,
        limit: 15,
      },
      pool,
    );
    const item = builderItem(result.data);
    expect(item).toBeDefined();
    expect(item?.is_saved).toBe(true);
  });

  it('a different user sees the same leads with is_saved === false (user-scope JOIN guard)', async () => {
    if (!pool) return;
    const result = await getLeadFeed(
      {
        user_id: OTHER_USER,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 5,
        limit: 15,
      },
      pool,
    );
    const permit = permitItem(result.data);
    const builder = builderItem(result.data);
    expect(permit).toBeDefined();
    expect(builder).toBeDefined();
    expect(permit?.is_saved).toBe(false);
    expect(builder?.is_saved).toBe(false);
  });

  it('unsave roundtrip — recordLeadView({action:"unsave"}) is visible to next getLeadFeed read', async () => {
    if (!pool) return;
    if (entityId === null) throw new Error('entityId not seeded');

    // Flip the permit lead_view to saved=false via the writer path,
    // then re-read the feed for the saved user. The previously-saved
    // permit must now report is_saved=false; the builder lead must
    // still report is_saved=true (we only unsaved the permit).
    const w = await recordLeadView(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        action: 'unsave',
        lead_type: 'permit',
        permit_num: PERMIT_NUM_A,
        revision_num: PERMIT_REV,
      },
      pool,
    );
    expect(w.ok).toBe(true);

    const result = await getLeadFeed(
      {
        user_id: SAVED_USER,
        trade_slug: TRADE_SLUG,
        lat: TEST_LAT,
        lng: TEST_LNG,
        radius_km: 5,
        limit: 15,
      },
      pool,
    );
    const permit = permitItem(result.data);
    const builder = builderItem(result.data);
    expect(permit?.is_saved).toBe(false);
    expect(builder?.is_saved).toBe(true);
  });
});
