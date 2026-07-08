// SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.2 + §v1.3
//
// P9b — Spec 87 v1 supplier lead feed. Pure locks on the query contract + the
// admin request schema (behavioral coverage lives in the db test). These pin
// the two conscious fences (permit precision guard + CoA killswitch) and the
// deterministic ordering so a refactor can't silently drop them.

import { describe, it, expect } from 'vitest';
import { SUPPLIER_LEADS_SQL } from '@/lib/admin/supplier-leads';
import { SupplierLeadsQuerySchema } from '@/app/api/admin/suppliers/leads/types';

describe('Spec 87 v1 — supplier leads SQL contract', () => {
  it('filters to the supplier_trades footprint via JOIN on supplier_id', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/FROM supplier_trades st/);
    expect(SUPPLIER_LEADS_SQL).toMatch(/JOIN lead_trades lt\s+ON lt\.trade_id = st\.trade_id AND lt\.is_active = true/);
    expect(SUPPLIER_LEADS_SQL).toMatch(/st\.supplier_id = \$1/);
  });

  it('FENCE 1 — permit rows carry the tier/confidence precision guard (not is_active alone)', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/lt\.lead_id LIKE 'permit:%' AND \(lt\.tier <= 1 OR lt\.confidence > 0\.55\)/);
  });

  it('FENCE 2 — coa rows are gated behind the disableCoa ($2) killswitch parity', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/lt\.lead_id LIKE 'coa:%' AND \$2::boolean = false/);
  });

  it('inherits timing via LEFT JOIN trade_forecasts on lead_id + trade_slug', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/LEFT JOIN trade_forecasts tf\s+ON tf\.lead_id = lt\.lead_id AND tf\.trade_slug = t\.slug/);
  });

  it('orders by predicted_start with a defined NULLS LAST + deterministic tiebreak (Spec 87 v1.3)', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/ORDER BY tf\.predicted_start ASC NULLS LAST, lt\.classified_at DESC, lt\.lead_id ASC/);
  });

  it('paginates via LIMIT/OFFSET ($3/$4)', () => {
    expect(SUPPLIER_LEADS_SQL).toMatch(/LIMIT \$3 OFFSET \$4/);
  });
});

describe('Spec 87 v1 — admin request schema', () => {
  it('requires supplier_id (positive int), coercing string params', () => {
    expect(SupplierLeadsQuerySchema.safeParse({ supplier_id: '42' }).success).toBe(true);
    expect(SupplierLeadsQuerySchema.safeParse({}).success).toBe(false);
    expect(SupplierLeadsQuerySchema.safeParse({ supplier_id: '-1' }).success).toBe(false);
    expect(SupplierLeadsQuerySchema.safeParse({ supplier_id: '0' }).success).toBe(false);
  });

  it('defaults limit=50 / offset=0 and caps limit at 200', () => {
    const parsed = SupplierLeadsQuerySchema.parse({ supplier_id: '1' });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
    expect(SupplierLeadsQuerySchema.safeParse({ supplier_id: '1', limit: '500' }).success).toBe(false);
  });
});
