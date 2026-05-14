// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C R5.3
//
// Live-DB integration test for the mirror triggers (migrations 143 + 144).
// Confirms INSERT/UPDATE/DELETE on permit_trades + permit_parcels
// auto-mirrors to lead_trades + lead_parcels via the AFTER trigger.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, dbAvailable } from './setup-testcontainer';

const PERMIT_NUM = 'MIRROR-TEST-1';
const PERMIT_REV = '00';
const EXPECTED_LEAD_ID = `permit:${PERMIT_NUM}:${PERMIT_REV}`;

describe.skipIf(!dbAvailable())('permit_trades/parcels → lead_trades/parcels mirror trigger (Phase C R5.3)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool()!;
    // Clean slate
    await pool.query(`DELETE FROM permit_trades WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM lead_trades WHERE lead_id = $1`, [EXPECTED_LEAD_ID]);
    await pool.query(`DELETE FROM lead_parcels WHERE lead_id = $1`, [EXPECTED_LEAD_ID]);
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);

    // Seed a permit (trigger on permits auto-populates permits.lead_id)
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, status, permit_type, application_date)
       VALUES ($1, $2, 'Permit Issued', 'New Building', '2024-01-01')`,
      [PERMIT_NUM, PERMIT_REV],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Cleanup (cascades via permits FK)
    await pool.query(`DELETE FROM permit_trades WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.query(`DELETE FROM lead_trades WHERE lead_id = $1`, [EXPECTED_LEAD_ID]);
    await pool.query(`DELETE FROM lead_parcels WHERE lead_id = $1`, [EXPECTED_LEAD_ID]);
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PERMIT_NUM]);
    await pool.end();
  });

  it('INSERT into permit_trades mirrors to lead_trades with derived lead_id', async () => {
    // Use a trade that exists in the seed (excavation = id 1 per migration 005)
    const tradeRes = await pool.query(`SELECT id FROM trades WHERE slug = 'excavation' LIMIT 1`);
    const tradeId = tradeRes.rows[0]!.id;

    await pool.query(
      `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score)
       VALUES ($1, $2, $3, 1, 0.95, true, 'P7a', 88)`,
      [PERMIT_NUM, PERMIT_REV, tradeId],
    );

    const mirror = await pool.query(
      `SELECT lead_id, trade_id, tier, confidence, is_active, phase, lead_score FROM lead_trades WHERE lead_id = $1 AND trade_id = $2`,
      [EXPECTED_LEAD_ID, tradeId],
    );
    expect(mirror.rows.length).toBe(1);
    expect(mirror.rows[0].lead_id).toBe(EXPECTED_LEAD_ID);
    expect(mirror.rows[0].tier).toBe(1);
    expect(Number(mirror.rows[0].confidence)).toBe(0.95);
    expect(mirror.rows[0].is_active).toBe(true);
    expect(mirror.rows[0].phase).toBe('P7a');
    expect(mirror.rows[0].lead_score).toBe(88);
  });

  it('UPDATE on permit_trades mirrors to lead_trades', async () => {
    const tradeRes = await pool.query(`SELECT id FROM trades WHERE slug = 'excavation' LIMIT 1`);
    const tradeId = tradeRes.rows[0]!.id;

    await pool.query(
      `UPDATE permit_trades SET lead_score = 99, phase = 'P10' WHERE permit_num = $1 AND revision_num = $2 AND trade_id = $3`,
      [PERMIT_NUM, PERMIT_REV, tradeId],
    );

    const mirror = await pool.query(
      `SELECT lead_score, phase FROM lead_trades WHERE lead_id = $1 AND trade_id = $2`,
      [EXPECTED_LEAD_ID, tradeId],
    );
    expect(mirror.rows[0].lead_score).toBe(99);
    expect(mirror.rows[0].phase).toBe('P10');
  });

  it('DELETE from permit_trades cascades to lead_trades', async () => {
    const tradeRes = await pool.query(`SELECT id FROM trades WHERE slug = 'excavation' LIMIT 1`);
    const tradeId = tradeRes.rows[0]!.id;

    await pool.query(
      `DELETE FROM permit_trades WHERE permit_num = $1 AND revision_num = $2 AND trade_id = $3`,
      [PERMIT_NUM, PERMIT_REV, tradeId],
    );

    const mirror = await pool.query(
      `SELECT * FROM lead_trades WHERE lead_id = $1 AND trade_id = $2`,
      [EXPECTED_LEAD_ID, tradeId],
    );
    expect(mirror.rows.length).toBe(0);
  });

  it('INSERT into permit_parcels mirrors to lead_parcels with linked_at → matched_at', async () => {
    // Need a parcels row to FK against
    const parcelRes = await pool.query(`SELECT id FROM parcels LIMIT 1`);
    if (parcelRes.rows.length === 0) {
      // Seed a minimal parcel
      await pool.query(`INSERT INTO parcels (parcel_id) VALUES (999999) ON CONFLICT DO NOTHING`);
    }
    const parcel = await pool.query(`SELECT id FROM parcels LIMIT 1`);
    const parcelId = parcel.rows[0]!.id;

    await pool.query(
      `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence)
       VALUES ($1, $2, $3, 'exact_address', 0.95)`,
      [PERMIT_NUM, PERMIT_REV, parcelId],
    );

    const mirror = await pool.query(
      `SELECT lead_id, parcel_id, match_type, confidence, matched_at FROM lead_parcels WHERE lead_id = $1 AND parcel_id = $2`,
      [EXPECTED_LEAD_ID, parcelId],
    );
    expect(mirror.rows.length).toBe(1);
    expect(mirror.rows[0].lead_id).toBe(EXPECTED_LEAD_ID);
    expect(mirror.rows[0].match_type).toBe('exact_address');
    expect(Number(mirror.rows[0].confidence)).toBe(0.95);
    expect(mirror.rows[0].matched_at).toBeTruthy();
  });

  it('DELETE from permit_parcels cascades to lead_parcels', async () => {
    const parcel = await pool.query(`SELECT id FROM parcels LIMIT 1`);
    const parcelId = parcel.rows[0]!.id;

    await pool.query(
      `DELETE FROM permit_parcels WHERE permit_num = $1 AND revision_num = $2 AND parcel_id = $3`,
      [PERMIT_NUM, PERMIT_REV, parcelId],
    );

    const mirror = await pool.query(
      `SELECT * FROM lead_parcels WHERE lead_id = $1 AND parcel_id = $2`,
      [EXPECTED_LEAD_ID, parcelId],
    );
    expect(mirror.rows.length).toBe(0);
  });
});
