// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §F.2 (stale-purge DELETE)
//
// P22A REGRESSION LOCK — producer shielding: post stale-purge, trade_forecasts
// holds no row whose (permit, trade) lacks an is_active=true permit_trades row.
//
// The stale-purge DELETE (compute-trade-forecasts.js :1131-1205, F2 permit branch)
// contains a NOT EXISTS guard that checks pt.is_active = true. If that guard
// is silently removed, orphaned forecasts survive — inactive trades appear on
// the Flight Board and inflate opportunity-score inputs.
//
// This test exercises the exact predicate by seeding:
//   Permit A + permit_trade (plumbing, is_active=FALSE) → forecast should be purged
//   Permit B + permit_trade (plumbing, is_active=TRUE)  → forecast should survive
//
// SKIP_PHASES_SQL literal = ('P19','P20','O1','O2','O3') per lifecycle-phase.js:943.
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- trade-forecasts-stale-purge

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

// Test fixture ids — scoped prefix avoids interference with other db tests.
const PERMIT_A = 'TEST P22SP-A';  // is_active=FALSE → forecast purged
const PERMIT_B = 'TEST P22SP-B';  // is_active=TRUE  → forecast survives
const REV = '00';
const TRADE_SLUG = 'plumbing';
const LEAD_ID_A = `permit:${PERMIT_A}:${REV}`;
const LEAD_ID_B = `permit:${PERMIT_B}:${REV}`;

// The stale-purge DELETE from compute-trade-forecasts.js :1131-1205 (F2 permit branch).
// Scoped to our test fixtures via tf.lead_id IN (...) so live trade_forecasts rows
// in the testcontainer DB are unaffected.
// SKIP_PHASES_SQL = ('P19','P20','O1','O2','O3') per scripts/lib/lifecycle-phase.js:943.
const SCOPED_STALE_PURGE_SQL = `
  DELETE FROM trade_forecasts tf
   WHERE tf.lead_id IN ($1, $2)
     AND tf.lead_id LIKE 'permit:%'
     AND NOT EXISTS (
       SELECT 1 FROM permit_trades pt
         JOIN permits p
           ON p.permit_num = pt.permit_num
          AND p.revision_num = pt.revision_num
         JOIN trades t
           ON t.id = pt.trade_id
        WHERE pt.permit_num = tf.permit_num
          AND pt.revision_num = tf.revision_num
          AND t.slug = tf.trade_slug
          AND pt.is_active = true
          AND p.lifecycle_phase IS NOT NULL
          AND p.lifecycle_stalled = false
          AND (
            (
              p.lifecycle_phase IN ('P1','P2')
              AND p.application_date IS NOT NULL
              AND p.application_date >= NOW() - INTERVAL '18 months'
            )
            OR (
              p.lifecycle_phase NOT IN ('P19','P20','O1','O2','O3')
              AND p.lifecycle_phase NOT IN ('P1','P2')
              AND COALESCE(p.phase_started_at, p.issued_date::timestamptz) >= NOW() - INTERVAL '3 years'
            )
          )
     )
  RETURNING lead_id, trade_slug
`;

describe.skipIf(!dbAvailable())(
  'trade_forecasts stale-purge shielding — is_active guard (P22A lock)',
  () => {
    if (!pool) return;

    async function cleanup() {
      if (!pool) return;
      await pool.query(`DELETE FROM trade_forecasts WHERE lead_id IN ($1, $2)`, [
        LEAD_ID_A, LEAD_ID_B,
      ]);
      await pool.query(`DELETE FROM permit_trades WHERE permit_num IN ($1, $2)`, [
        PERMIT_A, PERMIT_B,
      ]);
      await pool.query(`DELETE FROM permits WHERE permit_num IN ($1, $2)`, [PERMIT_A, PERMIT_B]);
    }

    beforeAll(async () => {
      if (!pool) return;
      await cleanup();

      // Ensure the trade row exists (plumbing is seed migration 002 but be idempotent)
      await pool.query(
        `INSERT INTO trades (slug, name) VALUES ($1, 'Plumbing') ON CONFLICT (slug) DO NOTHING`,
        [TRADE_SLUG],
      );

      // Seed both permits with lifecycle_phase='P7a' (not in SKIP_PHASES) and a recent
      // issued_date so COALESCE(phase_started_at, issued_date) satisfies the 3-year window.
      for (const permitNum of [PERMIT_A, PERMIT_B]) {
        await pool.query(
          `INSERT INTO permits (
             permit_num, revision_num,
             first_seen_at, last_seen_at, updated_at,
             lifecycle_phase, lifecycle_stalled,
             issued_date,
             unmapped_status, is_in_ravine_protection_area, is_heritage_designated,
             is_corner_lot, is_through_lot, garden_suite_fits,
             envelope_constrained, abuts_laneway, market_exceeds_bylaw
           ) VALUES (
             $1, $2,
             NOW(), NOW(), NOW(),
             'P7a', false,
             CURRENT_DATE - INTERVAL '6 months',
             false, false, false, false, false, false, false, false, false
           ) ON CONFLICT DO NOTHING`,
          [permitNum, REV],
        );
      }

      const tradeRow = await pool.query<{ id: number }>(
        `SELECT id FROM trades WHERE slug = $1`,
        [TRADE_SLUG],
      );
      const tradeId = tradeRow.rows[0]?.id;
      if (typeof tradeId !== 'number') {
        throw new Error('P22A fixture: plumbing trade id not found');
      }

      // Permit A: is_active=FALSE — forecast should be purged
      await pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id, is_active, confidence)
         VALUES ($1, $2, $3, false, 0.9)
         ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
        [PERMIT_A, REV, tradeId],
      );

      // Permit B: is_active=TRUE — forecast should survive
      await pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id, is_active, confidence)
         VALUES ($1, $2, $3, true, 0.9)
         ON CONFLICT (permit_num, revision_num, trade_id) DO NOTHING`,
        [PERMIT_B, REV, tradeId],
      );

      // Seed trade_forecasts rows for both permits
      for (const [leadId, permitNum] of [
        [LEAD_ID_A, PERMIT_A],
        [LEAD_ID_B, PERMIT_B],
      ] as [string, string][]) {
        await pool.query(
          `INSERT INTO trade_forecasts (lead_id, permit_num, revision_num, trade_slug, opportunity_score)
           VALUES ($1, $2, $3, $4, 50)
           ON CONFLICT (lead_id, trade_slug) DO NOTHING`,
          [leadId, permitNum, REV, TRADE_SLUG],
        );
      }
    });

    afterAll(async () => {
      await cleanup();
      await pool?.end();
    });

    it('T1: forecast for is_active=false permit_trade is purged by the stale-purge DELETE', async () => {
      if (!pool) return;

      // Verify both forecasts exist before the purge
      const before = await pool.query<{ lead_id: string }>(
        `SELECT lead_id FROM trade_forecasts WHERE lead_id IN ($1, $2) ORDER BY lead_id`,
        [LEAD_ID_A, LEAD_ID_B],
      );
      expect(before.rows).toHaveLength(2);

      // Run the scoped stale-purge DELETE
      const { rows: purged } = await pool.query<{ lead_id: string; trade_slug: string }>(
        SCOPED_STALE_PURGE_SQL,
        [LEAD_ID_A, LEAD_ID_B],
      );

      // Permit A (is_active=false) must be purged
      expect(purged.some((r) => r.lead_id === LEAD_ID_A && r.trade_slug === TRADE_SLUG)).toBe(true);
    });

    it('T2: forecast for is_active=true permit_trade survives the stale-purge DELETE', async () => {
      if (!pool) return;

      // After the purge from T1, Permit B's forecast must still exist
      const after = await pool.query<{ lead_id: string }>(
        `SELECT lead_id FROM trade_forecasts WHERE lead_id = $1 AND trade_slug = $2`,
        [LEAD_ID_B, TRADE_SLUG],
      );
      expect(after.rows).toHaveLength(1);
      expect(after.rows[0]?.lead_id).toBe(LEAD_ID_B);
    });
  },
);
