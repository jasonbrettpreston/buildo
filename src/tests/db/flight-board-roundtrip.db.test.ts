// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 + §3.3.1
//            docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1 (P21 colon-form id)
//
// P22 MANDATORY LOCK — flight-board SQL round-trip.
//
// This test pins the end-to-end contract for the Flight Board LIST + DETAIL
// data layer:
//
//   SAVE  : recordLeadView writes lead_views.saved=true for a synthetic permit
//   LIST  : FLIGHT_BOARD_SQL (mirrored below) returns the saved permit
//   ID    : construct P21 colon-form id from row (NUM:REV), parseLeadId accepts it
//   DETAIL: FLIGHT_BOARD_DETAIL_SQL (mirrored below) returns the SAME row + fields
//   CHECK : computeTemporalGroup applied to both sides gives the SAME temporal_group
//
// Scenario matrix:
//   T1 — main round-trip (save → list → detail, temporal_group consistent both sides)
//   T2 — null-score case: no trade_forecasts row → LEFT JOIN gives null
//         opportunity_score → computeTemporalGroup → on_the_horizon
//   T3 — auto-archive case: lifecycle_phase='P13' (past plumbing work_phase P12)
//         → FLIGHT_BOARD_SQL still RETURNS the row (no SQL-side filter);
//         the route-level TS filter (PHASE_INDEX comparison) would exclude it —
//         asserted here by simulating the filter inline
//   T4 — invariant: add a permit_trades row (inference-basis trade) to the T3 permit
//         → archive verdict unchanged (permit_trades not in the SQL join path)
//
// Without this lock, a refactor that changes the SQL projections or LEFT JOIN
// predicate could silently break the Flight Board — mocked tests can't catch it.
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- flight-board-roundtrip

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { recordLeadView } from '@/features/leads/lib/record-lead-view';
import { parseLeadId } from '@/lib/leads/parse-lead-id';
import { computeTemporalGroup } from '@/lib/leads/flight-board-temporal';

const pool = getTestPool();

// ---------------------------------------------------------------------------
// Fixture identifiers — prefixed P22RT to avoid collision
// ---------------------------------------------------------------------------

const PERMIT_NUM = 'TEST P22RT-001';     // main round-trip + null-score
const PERMIT_ARCHIVE = 'TEST P22RT-002'; // auto-archive + invariant
const REV = '00';
const TRADE_SLUG = 'plumbing';
// user_id is uuid since mig 229 (varchar→uuid + FK auth.users). A deterministic
// uuid sharing this file's hex prefix 'f11e0000-' keeps the fixture FK-valid and
// its rows hermetically scoped (replaces the old 'p22-roundtrip-uid' string sentinel).
const USER_ID = 'f11e0000-0000-4000-8000-000000000001';

// P21 colon-form: feed-emitted `${permit_num}:${LPAD(revision_num, 2, '0')}`
const COLON_FORM_ID = `${PERMIT_NUM}:${REV}`;
const COLON_FORM_ARCHIVE_ID = `${PERMIT_ARCHIVE}:${REV}`;

// Canonical lead_key written by buildLeadKey / recordLeadView
const CANONICAL_LEAD_KEY = `permit:${PERMIT_NUM}:${REV}`;

// ---------------------------------------------------------------------------
// SQL mirrors — MUST stay in sync with the route files.
// FLIGHT_BOARD_SQL: src/app/api/leads/flight-board/route.ts
// FLIGHT_BOARD_DETAIL_SQL: src/app/api/leads/flight-board/detail/[id]/route.ts
// ---------------------------------------------------------------------------

const FLIGHT_BOARD_SQL = `
  SELECT
    lv.permit_num,
    lv.revision_num,
    TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
    p.lifecycle_phase,
    p.lifecycle_stalled,
    tf.predicted_start::text AS predicted_start,
    tf.p25_days,
    tf.p75_days,
    tf.opportunity_score,
    p.updated_at::text AS updated_at
  FROM lead_views lv
  INNER JOIN permits p
    ON p.permit_num = lv.permit_num
   AND p.revision_num = lv.revision_num
  LEFT JOIN trade_forecasts tf
    ON tf.permit_num = lv.permit_num
   AND tf.revision_num = lv.revision_num
   AND tf.trade_slug = $2
  WHERE lv.user_id = $1
    AND lv.saved = true
    AND lv.lead_type = 'permit'
  ORDER BY lv.saved_at DESC NULLS LAST
`;

const FLIGHT_BOARD_DETAIL_SQL = `
  SELECT
    lv.permit_num,
    lv.revision_num,
    TRIM(COALESCE(p.street_num, '') || ' ' || COALESCE(p.street_name, '')) AS address,
    p.lifecycle_phase,
    p.lifecycle_stalled,
    tf.predicted_start::text AS predicted_start,
    tf.p25_days,
    tf.p75_days,
    tf.opportunity_score,
    p.updated_at::text AS updated_at
  FROM lead_views lv
  INNER JOIN permits p
    ON p.permit_num = lv.permit_num
   AND p.revision_num = lv.revision_num
  LEFT JOIN trade_forecasts tf
    ON tf.permit_num = lv.permit_num
   AND tf.revision_num = lv.revision_num
   AND tf.trade_slug = $4
  WHERE lv.user_id = $1
    AND lv.permit_num = $2
    AND lv.revision_num = $3
    AND lv.saved = true
    AND lv.lead_type = 'permit'
  LIMIT 1
`;

// ---------------------------------------------------------------------------
// PHASE_INDEX (mirrors route.ts — must stay in sync)
// ---------------------------------------------------------------------------
const PHASE_INDEX: Readonly<Record<string, number>> = {
  P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6,
  P7a: 7, P7b: 8, P7c: 9, P7d: 10,
  P8: 11, P9: 12, P10: 13, P11: 14, P12: 15,
  P13: 16, P14: 17, P15: 18, P16: 19, P17: 20,
  P18: 21, P19: 22, P20: 23,
};

// plumbing work_phase = P12 (PHASE_INDEX = 15) per TRADE_TARGET_PHASE
const PLUMBING_WORK_PHASE_IDX = 15;

interface FlightBoardRow {
  permit_num: string;
  revision_num: string;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
  updated_at: string;
}

describe.skipIf(!dbAvailable())('flight-board SQL round-trip — P22 lock (Spec 77 §3.2/§3.3.1)', () => {
  if (!pool) return;

  async function cleanup() {
    if (!pool) return;
    await pool.query(`DELETE FROM trade_forecasts WHERE permit_num IN ($1, $2)`, [
      PERMIT_NUM, PERMIT_ARCHIVE,
    ]);
    await pool.query(`DELETE FROM lead_views WHERE user_id = $1`, [USER_ID]);
    await pool.query(`DELETE FROM permit_trades WHERE permit_num IN ($1, $2)`, [
      PERMIT_NUM, PERMIT_ARCHIVE,
    ]);
    await pool.query(`DELETE FROM permits WHERE permit_num IN ($1, $2)`, [
      PERMIT_NUM, PERMIT_ARCHIVE,
    ]);
    await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [USER_ID]);
    // auth.users parent last — its ON DELETE CASCADE (mig 229) covers user_profiles /
    // lead_views, but the explicit deletes above run first and are harmless no-ops.
    await pool.query(`DELETE FROM auth.users WHERE id = $1`, [USER_ID]);
  }

  beforeAll(async () => {
    if (!pool) return;
    await cleanup();

    // Ensure plumbing trade row exists
    await pool.query(
      `INSERT INTO trades (slug, name) VALUES ($1, 'Plumbing') ON CONFLICT (slug) DO NOTHING`,
      [TRADE_SLUG],
    );

    // auth.users identity row — user_profiles.user_id / lead_views.user_id FK it (mig 229).
    await pool.query(
      `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [USER_ID],
    );

    // user_profiles row — trade_slug NOT NULL mandatory
    await pool.query(
      `INSERT INTO user_profiles (user_id, trade_slug)
       VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [USER_ID, TRADE_SLUG],
    );

    // Main permit (P22RT-001): lifecycle_phase='P7a' (within plumbing work_phase P12)
    await pool.query(
      `INSERT INTO permits (
         permit_num, revision_num,
         first_seen_at, last_seen_at, updated_at,
         lifecycle_phase, lifecycle_stalled,
         street_num, street_name,
         unmapped_status, is_in_ravine_protection_area, is_heritage_designated,
         is_corner_lot, is_through_lot, garden_suite_fits,
         envelope_constrained, abuts_laneway, market_exceeds_bylaw
       ) VALUES (
         $1, $2,
         NOW(), NOW(), NOW(),
         'P7a', false,
         '123', 'Main St',
         false, false, false, false, false, false, false, false, false
       ) ON CONFLICT DO NOTHING`,
      [PERMIT_NUM, REV],
    );

    // Archive permit (P22RT-002): lifecycle_phase='P13' — past plumbing work_phase P12
    await pool.query(
      `INSERT INTO permits (
         permit_num, revision_num,
         first_seen_at, last_seen_at, updated_at,
         lifecycle_phase, lifecycle_stalled,
         street_num, street_name,
         unmapped_status, is_in_ravine_protection_area, is_heritage_designated,
         is_corner_lot, is_through_lot, garden_suite_fits,
         envelope_constrained, abuts_laneway, market_exceeds_bylaw
       ) VALUES (
         $1, $2,
         NOW(), NOW(), NOW(),
         'P13', false,
         '456', 'Archive Ave',
         false, false, false, false, false, false, false, false, false
       ) ON CONFLICT DO NOTHING`,
      [PERMIT_ARCHIVE, REV],
    );

    // Save the main permit via recordLeadView
    const saveResult = await recordLeadView(
      {
        user_id: USER_ID,
        trade_slug: TRADE_SLUG,
        action: 'save',
        lead_type: 'permit',
        permit_num: PERMIT_NUM,
        revision_num: REV,
      },
      pool,
    );
    if (!saveResult.ok) throw new Error('P22RT: recordLeadView save failed');

    // Save the archive permit (needed so FLIGHT_BOARD_SQL returns it for T3/T4)
    const saveArchive = await recordLeadView(
      {
        user_id: USER_ID,
        trade_slug: TRADE_SLUG,
        action: 'save',
        lead_type: 'permit',
        permit_num: PERMIT_ARCHIVE,
        revision_num: REV,
      },
      pool,
    );
    if (!saveArchive.ok) throw new Error('P22RT: recordLeadView save for archive failed');

    // Seed trade_forecasts for PERMIT_NUM (T1 main round-trip):
    //   predicted_start far future → on_the_horizon; opportunity_score=50 (meaningful)
    const leadIdMain = `permit:${PERMIT_NUM}:${REV}`;
    await pool.query(
      `INSERT INTO trade_forecasts (lead_id, permit_num, revision_num, trade_slug, predicted_start, p25_days, p75_days, opportunity_score)
       VALUES ($1, $2, $3, $4, '2099-06-01', 20, 60, 50)
       ON CONFLICT (lead_id, trade_slug) DO NOTHING`,
      [leadIdMain, PERMIT_NUM, REV, TRADE_SLUG],
    );
    // NOTE: No trade_forecasts row for PERMIT_ARCHIVE — the LEFT JOIN gives NULL
    // for T2 (null-score) and T3/T4 tests.
  });

  afterAll(async () => {
    await cleanup();
    await pool?.end();
  });

  // -------------------------------------------------------------------------
  // T1: Main round-trip — LIST → DETAIL, temporal_group consistent both sides
  // -------------------------------------------------------------------------

  it('T1: FLIGHT_BOARD_SQL returns saved permit; parseLeadId(NUM:REV) chains to DETAIL; temporal_group consistent', async () => {
    if (!pool) return;

    // Step 1 — run FLIGHT_BOARD_SQL (list)
    const listResult = await pool.query<FlightBoardRow>(FLIGHT_BOARD_SQL, [USER_ID, TRADE_SLUG]);
    const mainRow = listResult.rows.find((r) => r.permit_num === PERMIT_NUM);
    expect(mainRow).toBeDefined();
    if (!mainRow) throw new Error('T1: main permit not found in list');

    expect(mainRow.permit_num).toBe(PERMIT_NUM);
    expect(mainRow.revision_num).toBe(REV);
    expect(mainRow.address).toContain('Main St');
    expect(mainRow.lifecycle_phase).toBe('P7a');
    expect(mainRow.lifecycle_stalled).toBe(false);
    expect(mainRow.predicted_start).toBe('2099-06-01');
    expect(Number(mainRow.opportunity_score)).toBe(50);

    // Step 2 — construct P21 colon-form id and parse it
    const colonFormId = `${mainRow.permit_num}:${mainRow.revision_num}`;
    expect(colonFormId).toBe(COLON_FORM_ID);
    const parsed = parseLeadId(colonFormId);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('permit');
    if (!parsed || parsed.kind !== 'permit') throw new Error('T1: parseLeadId returned wrong kind');

    // Step 3 — run FLIGHT_BOARD_DETAIL_SQL (detail)
    const detailResult = await pool.query<FlightBoardRow>(FLIGHT_BOARD_DETAIL_SQL, [
      USER_ID,
      parsed.permit_num,
      parsed.revision_num,
      TRADE_SLUG,
    ]);
    expect(detailResult.rows).toHaveLength(1);
    const detailRow = detailResult.rows[0]!;
    expect(detailRow.permit_num).toBe(PERMIT_NUM);
    expect(detailRow.revision_num).toBe(REV);

    // Step 4 — assert temporal_group is the same from both sides
    const now = new Date();
    const listGroup = computeTemporalGroup(mainRow, now);
    const detailGroup = computeTemporalGroup(detailRow, now);
    expect(listGroup).toBe(detailGroup);
    // Far-future predicted_start + positive score → on_the_horizon
    expect(listGroup).toBe('on_the_horizon');
  });

  // -------------------------------------------------------------------------
  // T2: Null-score → on_the_horizon (no trade_forecasts row for PERMIT_NUM null-score case)
  //     We use PERMIT_ARCHIVE which has no trade_forecasts row; LEFT JOIN → NULL
  // -------------------------------------------------------------------------

  it('T2: no trade_forecasts row → LEFT JOIN gives null opportunity_score → on_the_horizon', async () => {
    if (!pool) return;

    // FLIGHT_BOARD_SQL for the archive permit — no trade_forecasts row seeded
    const listResult = await pool.query<FlightBoardRow>(FLIGHT_BOARD_SQL, [USER_ID, TRADE_SLUG]);
    const archiveRow = listResult.rows.find((r) => r.permit_num === PERMIT_ARCHIVE);
    expect(archiveRow).toBeDefined();
    if (!archiveRow) throw new Error('T2: archive permit not found in list');

    // LEFT JOIN gives null for forecast columns when no row exists
    expect(archiveRow.opportunity_score).toBeNull();
    expect(archiveRow.predicted_start).toBeNull();

    // computeTemporalGroup: null score → on_the_horizon regardless of other fields
    const group = computeTemporalGroup(archiveRow, new Date());
    expect(group).toBe('on_the_horizon');
  });

  // -------------------------------------------------------------------------
  // T3: Auto-archive — lifecycle_phase P13 past work_phase P12 for plumbing
  //     FLIGHT_BOARD_SQL returns the row; the TS route filter excludes it
  // -------------------------------------------------------------------------

  it('T3: lifecycle_phase P13 (past P12) appears in SQL output but is excluded by the TS auto-archive filter', async () => {
    if (!pool) return;

    const listResult = await pool.query<FlightBoardRow>(FLIGHT_BOARD_SQL, [USER_ID, TRADE_SLUG]);
    const archiveRow = listResult.rows.find((r) => r.permit_num === PERMIT_ARCHIVE);

    // The SQL has no lifecycle filter — the row is returned
    expect(archiveRow).toBeDefined();
    expect(archiveRow?.lifecycle_phase).toBe('P13');

    // Simulate the route's auto-archive filter (route.ts :94-98)
    const filtered = listResult.rows.filter((row) => {
      if (!row.lifecycle_phase) return true;
      const currentIdx = PHASE_INDEX[row.lifecycle_phase] ?? 0;
      return currentIdx <= PLUMBING_WORK_PHASE_IDX;
    });

    // The P13 permit is excluded (16 > 15); only the P7a permit survives
    expect(filtered.some((r) => r.permit_num === PERMIT_ARCHIVE)).toBe(false);
    expect(filtered.some((r) => r.permit_num === PERMIT_NUM)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T4: Invariant — adding an inference-basis permit_trades row does not change
  //     the archive verdict (permit_trades is not in FLIGHT_BOARD_SQL's join path)
  // -------------------------------------------------------------------------

  it('T4: adding a permit_trades row to the archive permit does not alter its archive verdict', async () => {
    if (!pool) return;

    // Add a permit_trades row (simulating an inference-basis trade row)
    const tradeRow = await pool.query<{ id: number }>(
      `SELECT id FROM trades WHERE slug = $1`,
      [TRADE_SLUG],
    );
    const tradeId = tradeRow.rows[0]?.id;
    if (typeof tradeId !== 'number') throw new Error('T4: plumbing trade id not found');

    await pool.query(
      `INSERT INTO permit_trades (permit_num, revision_num, trade_id, is_active, confidence)
       VALUES ($1, $2, $3, true, 0.55)
       ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
      [PERMIT_ARCHIVE, REV, tradeId],
    );

    // Re-run FLIGHT_BOARD_SQL — permit_trades is NOT in the join, so the row is unchanged
    const listResult = await pool.query<FlightBoardRow>(FLIGHT_BOARD_SQL, [USER_ID, TRADE_SLUG]);
    const archiveRow = listResult.rows.find((r) => r.permit_num === PERMIT_ARCHIVE);
    expect(archiveRow).toBeDefined();
    expect(archiveRow?.lifecycle_phase).toBe('P13'); // unchanged

    // Re-apply the route's TS filter — archive verdict is STILL excluded
    const filtered = listResult.rows.filter((row) => {
      if (!row.lifecycle_phase) return true;
      return (PHASE_INDEX[row.lifecycle_phase] ?? 0) <= PLUMBING_WORK_PHASE_IDX;
    });
    expect(filtered.some((r) => r.permit_num === PERMIT_ARCHIVE)).toBe(false);
  });
});
