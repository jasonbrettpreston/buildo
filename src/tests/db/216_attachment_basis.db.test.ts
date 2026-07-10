// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.C (P16 D4 attachment_basis provenance)
//
// Live-DB proof of migration 216:
//   (a) the attachment_basis CHECK rejects a junk value on both permit_trades and lead_trades;
//   (b) the mig-143 mirror trigger propagates attachment_basis permit_trades → lead_trades on
//       INSERT and UPDATE (the [Integration A1] both-branches concern).
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const PN = 'P16-ATTACH-TEST';
const RN = '00';
const LEAD_ID = `permit:${PN}:${RN}`;

describe.skipIf(!dbAvailable())('migration 216 — attachment_basis CHECK + mirror (live DB)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    // Parent row for the permit_trades FK (fk_permit_trades_permits).
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [PN, RN],
    );
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM permit_trades WHERE permit_num = $1`, [PN]);
    await pool.query(`DELETE FROM lead_trades WHERE lead_id = $1`, [LEAD_ID]);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [PN]);
  });

  it('the CHECK rejects a junk attachment_basis on permit_trades', async () => {
    await expect(
      pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis)
         VALUES ($1, $2, 8, 1, 1.0, true, 'structural', 0, 'garbage')`,
        [PN, RN],
      ),
    ).rejects.toThrow(/attachment_basis/i);
  });

  it('the CHECK rejects a junk attachment_basis on lead_trades', async () => {
    await expect(
      pool.query(
        `INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis)
         VALUES ($1, 8, 1, 1.0, true, 'structural', 0, 'garbage')`,
        [LEAD_ID],
      ),
    ).rejects.toThrow(/attachment_basis/i);
  });

  it('the mirror trigger propagates attachment_basis on INSERT and UPDATE (both branches)', async () => {
    // INSERT an evidence row → mirror lands 'evidence' on lead_trades.
    await pool.query(
      `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis)
       VALUES ($1, $2, 8, 1, 1.0, true, 'structural', 0, 'evidence')`,
      [PN, RN],
    );
    let row = await pool.query(
      `SELECT attachment_basis FROM lead_trades WHERE lead_id = $1 AND trade_id = 8`,
      [LEAD_ID],
    );
    expect(row.rows[0]?.attachment_basis).toBe('evidence');

    // UPDATE the permit_trades row to 'inference' → mirror UPDATE branch re-stamps lead_trades.
    await pool.query(
      `UPDATE permit_trades SET attachment_basis = 'inference', is_active = false WHERE permit_num = $1 AND revision_num = $2 AND trade_id = 8`,
      [PN, RN],
    );
    row = await pool.query(
      `SELECT attachment_basis FROM lead_trades WHERE lead_id = $1 AND trade_id = 8`,
      [LEAD_ID],
    );
    expect(row.rows[0]?.attachment_basis).toBe('inference');
  }, 60_000);
});
