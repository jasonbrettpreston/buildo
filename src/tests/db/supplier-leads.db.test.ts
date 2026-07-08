// SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.1 §v1.2 §v1.3
// SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §12.9
//
// P9b — supplier_trades migration round-trip + getSupplierLeads behavior.
//   M1 — supplier_trades FK integrity (suppliers.id + trades.id) + PK uniqueness.
//   M2 — partial index idx_lead_trades_trade_active exists.
//   T1 — trade filtering: only the supplier's supplier_trades set surfaces.
//   T2 — FENCE 1 permit precision guard: the tier-2/conf-0.55 bundle prior is
//        excluded; a tier-1 direct permit lead passes.
//   T3 — FENCE 2 CoA killswitch: disableCoa=true hides coa rows; false shows them.
//   T4 — NULLS LAST ordering: a lead with a forecast sorts before a lead without.
//   T5 — unknown supplier → null (route maps to 404).
//
// Run: BUILDO_TEST_DB=1 npm run test:db

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { getSupplierLeads, getSupplierTrades } from '../../lib/admin/supplier-leads';

const pool = getTestPool();
const SLUG_A = 'p9b-trade-a';
const SLUG_B = 'p9b-trade-b';

describe.skipIf(!dbAvailable())('Spec 87 v1 — supplier_trades + supplier leads', () => {
  if (!pool) return;

  let tradeA = 0;
  let tradeB = 0;
  let supplierId = 0;

  async function cleanup() {
    await pool!.query(`DELETE FROM lead_trades WHERE lead_id LIKE 'permit:P9B%' OR lead_id LIKE 'coa:P9B%'`);
    await pool!.query(`DELETE FROM trade_forecasts WHERE lead_id LIKE 'permit:P9B%' OR lead_id LIKE 'coa:P9B%'`);
    await pool!.query(`DELETE FROM supplier_trades st USING suppliers s WHERE st.supplier_id = s.id AND s.name = 'P9B Supplier'`);
    await pool!.query(`DELETE FROM suppliers WHERE name = 'P9B Supplier'`);
    await pool!.query(`DELETE FROM trades WHERE slug IN ($1,$2)`, [SLUG_A, SLUG_B]);
  }

  beforeEach(async () => {
    await cleanup();
    const a = await pool!.query(
      `INSERT INTO trades (slug, name, kind, cost_basis) VALUES ($1,'P9B A','construction','fixed') RETURNING id`,
      [SLUG_A],
    );
    tradeA = a.rows[0].id;
    const b = await pool!.query(
      `INSERT INTO trades (slug, name, kind, cost_basis) VALUES ($1,'P9B B','construction','fixed') RETURNING id`,
      [SLUG_B],
    );
    tradeB = b.rows[0].id;
    const s = await pool!.query(
      `INSERT INTO suppliers (name, account_type, status, created_at) VALUES ('P9B Supplier','manufacturer','active',NOW()) RETURNING id`,
    );
    supplierId = s.rows[0].id;
    // Supplier serves trade A only (trade B leads must never surface).
    await pool!.query(`INSERT INTO supplier_trades (supplier_id, trade_id) VALUES ($1,$2)`, [supplierId, tradeA]);
  });

  afterAll(async () => {
    await cleanup();
    await pool!.end();
  });

  async function seedLead(leadId: string, tradeId: number, tier: number | null, conf: number | null) {
    await pool!.query(
      `INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, lead_score, classified_at)
       VALUES ($1,$2,$3,$4,true,0,NOW())`,
      [leadId, tradeId, tier, conf],
    );
  }

  it('M1: supplier_trades enforces FK + PK uniqueness', async () => {
    // duplicate (supplier_id, trade_id) violates PK
    await expect(
      pool!.query(`INSERT INTO supplier_trades (supplier_id, trade_id) VALUES ($1,$2)`, [supplierId, tradeA]),
    ).rejects.toThrow();
    // orphan supplier_id violates FK
    await expect(
      pool!.query(`INSERT INTO supplier_trades (supplier_id, trade_id) VALUES (999999999,$1)`, [tradeA]),
    ).rejects.toThrow();
  });

  it('M2: partial index idx_lead_trades_trade_active exists', async () => {
    const { rows } = await pool!.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname='idx_lead_trades_trade_active'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/WHERE is_active/);
  });

  it('T1+T2: trade filtering + permit precision guard (bundle prior excluded)', async () => {
    await seedLead('permit:P9B-direct:00', tradeA, 1, 0.9); // direct → passes
    await seedLead('permit:P9B-bundle:00', tradeA, 2, 0.55); // bundle prior → excluded
    await seedLead('permit:P9B-otherTrade:00', tradeB, 1, 0.9); // trade not served → excluded
    const res = await getSupplierLeads(pool!, { supplierId, disableCoa: true, limit: 50, offset: 0 });
    expect(res).not.toBeNull();
    expect(res!.trades).toEqual([SLUG_A]);
    const ids = res!.leads.map((l) => l.lead_id);
    expect(ids).toContain('permit:P9B-direct:00');
    expect(ids).not.toContain('permit:P9B-bundle:00');
    expect(ids).not.toContain('permit:P9B-otherTrade:00');
  });

  it('T3: CoA killswitch — coa rows hidden when disableCoa=true, shown when false', async () => {
    await seedLead('permit:P9B-direct:00', tradeA, 1, 0.9);
    await seedLead('coa:P9B-0001', tradeA, 2, 0.55); // coa: is_active alone is precision-honest
    const off = await getSupplierLeads(pool!, { supplierId, disableCoa: true, limit: 50, offset: 0 });
    expect(off!.leads.map((l) => l.lead_type)).not.toContain('coa');
    const on = await getSupplierLeads(pool!, { supplierId, disableCoa: false, limit: 50, offset: 0 });
    const coaRow = on!.leads.find((l) => l.lead_id === 'coa:P9B-0001');
    expect(coaRow).toBeDefined();
    expect(coaRow!.lead_type).toBe('coa');
  });

  it('T4: forecast-timing rows sort before the no-forecast §v1.4 gap rows (NULLS LAST)', async () => {
    await seedLead('permit:P9B-hasfc:00', tradeA, 1, 0.9);
    await seedLead('permit:P9B-nofc:00', tradeA, 1, 0.9);
    await pool!.query(
      `INSERT INTO trade_forecasts (trade_slug, lead_id, predicted_start, confidence, urgency, target_window, opportunity_score, computed_at)
       VALUES ($1, 'permit:P9B-hasfc:00', DATE '2026-08-01', 'medium', 'upcoming', 'bid', 42, NOW())`,
      [SLUG_A],
    );
    const res = await getSupplierLeads(pool!, { supplierId, disableCoa: true, limit: 50, offset: 0 });
    const ids = res!.leads.map((l) => l.lead_id);
    expect(ids.indexOf('permit:P9B-hasfc:00')).toBeLessThan(ids.indexOf('permit:P9B-nofc:00'));
    const withFc = res!.leads.find((l) => l.lead_id === 'permit:P9B-hasfc:00');
    expect(withFc!.predicted_start).toBe('2026-08-01');
    expect(withFc!.opportunity_score).toBe(42);
  });

  it('T5: unknown supplier resolves to null (404 path)', async () => {
    expect(await getSupplierTrades(pool!, 999999999)).toBeNull();
    expect(await getSupplierLeads(pool!, { supplierId: 999999999, disableCoa: true, limit: 50, offset: 0 })).toBeNull();
  });
});
