// SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §Known Failure Modes (KFM-1)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R11
//
// P9a — self-feed tracked_projects from lead_views.saved (Spec 82 KFM-1 option C).
// Exercises the SHIPPED SQL (scripts/lib/self-feed-tracked-projects.js) against a
// real DB with fixtures (the dev/CI DB has zero lead_views rows). Coverage:
//   T1 — saved permit + coa views insert one 'saved' tracked_projects row each;
//        an UNSAVED view is NOT fed; a builder view is skipped (no CRM branch).
//   T2 — ON CONFLICT DO NOTHING preserves an existing row's memory columns.
//   T3 — re-save-after-archive REACTIVATES status archived → saved WITHOUT
//        touching the notification-memory columns.
//   T4 — the GLOBAL uniq_tracked_projects_lead_id (mig 140) caps a coa lead at
//        one tracker; a second user's save degrades gracefully (DO NOTHING).
//
// Run: BUILDO_TEST_DB=1 npm run test:db

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runSelfFeed } = require('../../../scripts/lib/self-feed-tracked-projects');
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const U = 'p9a_selffeed_user';
const U2 = 'p9a_selffeed_user2';
const PN = 'P9A-TEST-0001';
const RUN_AT = '2026-07-07T12:00:00Z';

describe.skipIf(!dbAvailable())('self-feed tracked_projects (Spec 82 KFM-1)', () => {
  if (!pool) return;

  async function cleanup() {
    await pool!.query(`DELETE FROM tracked_projects WHERE user_id IN ($1,$2)`, [U, U2]);
    await pool!.query(`DELETE FROM lead_views WHERE user_id IN ($1,$2)`, [U, U2]);
    await pool!.query(`DELETE FROM permits WHERE permit_num = $1`, [PN]);
  }

  beforeEach(async () => {
    await cleanup();
    // Minimal permits row for the lead_views permit-side FK.
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, first_seen_at, last_seen_at,
         lifecycle_stalled, updated_at, unmapped_status, is_in_ravine_protection_area,
         is_heritage_designated, is_corner_lot, is_through_lot, garden_suite_fits,
         envelope_constrained, abuts_laneway, market_exceeds_bylaw)
       VALUES ($1,'00',NOW(),NOW(),false,NOW(),false,false,false,false,false,false,false,false,false)`,
      [PN],
    );
  });

  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  it('T1: feeds saved permit + coa views; skips unsaved + builder', async () => {
    await pool!.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved, saved_at) VALUES
        ($1, $2, 'permit', $3, '00', NULL, 'plumbing', NOW(), true, NOW()),
        ($1, 'coa:B0999-9999', 'coa', NULL, NULL, NULL, 'framing', NOW(), true, NOW()),
        ($1, 'coa:B0888-8888', 'coa', NULL, NULL, NULL, 'roofing', NOW(), false, NULL)`,
      [U, `permit:${PN}:00`, PN],
    );
    const r = await runSelfFeed(pool, RUN_AT);
    expect(r.inserted).toBe(2);
    expect(r.reactivated).toBe(0);

    const { rows } = await pool!.query(
      `SELECT trade_slug, permit_num, lead_id, status FROM tracked_projects WHERE user_id=$1 ORDER BY trade_slug`,
      [U],
    );
    expect(rows).toHaveLength(2);
    const framing = rows.find((x) => x.trade_slug === 'framing');
    expect(framing.lead_id).toBe('coa:B0999-9999');
    expect(framing.permit_num).toBeNull();
    expect(framing.status).toBe('saved');
    const plumbing = rows.find((x) => x.trade_slug === 'plumbing');
    expect(plumbing.permit_num).toBe(PN);
    expect(plumbing.lead_id).toBeNull();
    // roofing was unsaved → not fed
    expect(rows.find((x) => x.trade_slug === 'roofing')).toBeUndefined();
  });

  it('T2: ON CONFLICT DO NOTHING preserves existing memory columns', async () => {
    await pool!.query(
      `INSERT INTO tracked_projects (user_id, permit_num, revision_num, trade_slug, lead_id, status, claimed_at, updated_at, last_notified_urgency, last_notified_stalled, notified_decision_rendered)
       VALUES ($1, $2, '00', 'plumbing', NULL, 'claimed', NOW(), NOW(), 'imminent', true, true)`,
      [U, PN],
    );
    await pool!.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved, saved_at)
       VALUES ($1, $2, 'permit', $3, '00', NULL, 'plumbing', NOW(), true, NOW())`,
      [U, `permit:${PN}:00`, PN],
    );
    const r = await runSelfFeed(pool, RUN_AT);
    expect(r.inserted).toBe(0); // conflict on uq_tracked_user_permit_trade

    const { rows } = await pool!.query(
      `SELECT status, last_notified_urgency, last_notified_stalled, notified_decision_rendered
       FROM tracked_projects WHERE user_id=$1 AND trade_slug='plumbing'`,
      [U],
    );
    expect(rows[0].status).toBe('claimed'); // NOT clobbered to 'saved'
    expect(rows[0].last_notified_urgency).toBe('imminent');
    expect(rows[0].last_notified_stalled).toBe(true);
    expect(rows[0].notified_decision_rendered).toBe(true);
  });

  it('T3: re-save-after-archive reactivates status without touching memory', async () => {
    await pool!.query(
      `INSERT INTO tracked_projects (user_id, permit_num, revision_num, trade_slug, lead_id, status, claimed_at, updated_at, last_notified_urgency, last_notified_stalled)
       VALUES ($1, $2, '00', 'plumbing', NULL, 'archived', NOW(), NOW(), 'imminent', true)`,
      [U, PN],
    );
    await pool!.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved, saved_at)
       VALUES ($1, $2, 'permit', $3, '00', NULL, 'plumbing', NOW(), true, NOW())`,
      [U, `permit:${PN}:00`, PN],
    );
    const r = await runSelfFeed(pool, RUN_AT);
    expect(r.inserted).toBe(0);
    expect(r.reactivated).toBe(1);

    const { rows } = await pool!.query(
      `SELECT status, last_notified_urgency, last_notified_stalled FROM tracked_projects WHERE user_id=$1 AND trade_slug='plumbing'`,
      [U],
    );
    expect(rows[0].status).toBe('saved'); // reactivated
    expect(rows[0].last_notified_urgency).toBe('imminent'); // memory preserved
    expect(rows[0].last_notified_stalled).toBe(true);
  });

  it('T4: global uniq caps a coa lead at one tracker (graceful DO NOTHING)', async () => {
    await pool!.query(
      `INSERT INTO lead_views (user_id, lead_key, lead_type, permit_num, revision_num, entity_id, trade_slug, viewed_at, saved, saved_at) VALUES
        ($1, 'coa:B0777-7777', 'coa', NULL, NULL, NULL, 'framing', NOW(), true, NOW()),
        ($2, 'coa:B0777-7777', 'coa', NULL, NULL, NULL, 'framing', NOW(), true, NOW())`,
      [U, U2],
    );
    const r = await runSelfFeed(pool, RUN_AT); // must not throw
    expect(r.inserted).toBe(1); // only the first user's row lands
    const { rows } = await pool!.query(
      `SELECT count(*)::int AS c FROM tracked_projects WHERE lead_id='coa:B0777-7777'`,
    );
    expect(rows[0].c).toBe(1);
  });
});
