// 🔗 SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.2 + §v1.3
//
// Spec 87 v1 — the trade-level supplier lead query. Resolves a supplier's
// `supplier_trades` set, then serves the live trade-keyed lead layer
// (`lead_trades` ⋈ `trade_forecasts`) filtered to those trades.
//
// TWO CONSCIOUS FENCES (Spec 87 v1.3 [GRD P9b-4/-5]):
//   1. Permit-side precision: `is_active = true` is NOT a precision signal on
//      the permit side — the archetype bundle prior writes rows at is_active=true,
//      tier 2, confidence 0.55 (classify-permits.js:614-623). So permit rows are
//      ADDITIONALLY filtered by `(tier <= 1 OR confidence > 0.55)` to exclude the
//      bundle-prior recall tier. CoA-side `is_active` IS precision-honest (post-P6.6
//      `!fromBundle`), so coa rows pass on is_active alone.
//   2. CoA-exposure gate: coa rows are included ONLY when the caller passes
//      `disableCoa = false`, mirroring the LEAD_FEED_DISABLE_COA killswitch the
//      main feed uses. When disableCoa=true, permit rows only.
//
// Ordering (Spec 87 v1.3): predicted timing first with a defined null fallback,
// then a stable recency + lead_id tiebreak so the §v1.4 gap rows (no predicted_start)
// never sort undefined.

import type { Pool } from 'pg';

export interface SupplierLead {
  lead_id: string;
  lead_type: 'permit' | 'coa';
  trade_slug: string;
  tier: number | null;
  confidence: number | null;
  predicted_start: string | null;
  target_window: string | null;
  urgency: string | null;
  opportunity_score: number | null;
}

export interface SupplierLeadsResult {
  supplier_id: number;
  trades: string[];
  leads: SupplierLead[];
}

// $1 supplier_id · $2 disableCoa (boolean) · $3 limit · $4 offset
export const SUPPLIER_LEADS_SQL = `
  SELECT
    lt.lead_id,
    CASE WHEN lt.lead_id LIKE 'coa:%' THEN 'coa' ELSE 'permit' END AS lead_type,
    t.slug AS trade_slug,
    lt.tier,
    lt.confidence::float8 AS confidence,
    tf.predicted_start::text AS predicted_start,
    tf.target_window,
    tf.urgency,
    tf.opportunity_score
  FROM supplier_trades st
  JOIN trades t         ON t.id = st.trade_id
  JOIN lead_trades lt   ON lt.trade_id = st.trade_id AND lt.is_active = true
  LEFT JOIN trade_forecasts tf
    ON tf.lead_id = lt.lead_id AND tf.trade_slug = t.slug
  WHERE st.supplier_id = $1
    AND (
      -- Permit rows: exclude the 0.55 bundle-prior recall tier (precision guard).
      (lt.lead_id LIKE 'permit:%' AND (lt.tier <= 1 OR lt.confidence > 0.55))
      OR
      -- CoA rows: gated behind the LEAD_FEED_DISABLE_COA killswitch parity.
      (lt.lead_id LIKE 'coa:%' AND $2::boolean = false)
    )
  ORDER BY tf.predicted_start ASC NULLS LAST, lt.classified_at DESC, lt.lead_id ASC
  LIMIT $3 OFFSET $4
`;

/**
 * Returns the supplier's `trade_id` footprint as `trades.slug[]`, or null if
 * the supplier account does not exist (route maps null → 404).
 */
export async function getSupplierTrades(
  pool: Pool,
  supplierId: number,
): Promise<string[] | null> {
  const exists = await pool.query('SELECT 1 FROM suppliers WHERE id = $1', [supplierId]);
  if (exists.rowCount === 0) return null;
  const { rows } = await pool.query<{ slug: string }>(
    `SELECT t.slug
       FROM supplier_trades st
       JOIN trades t ON t.id = st.trade_id
      WHERE st.supplier_id = $1
      ORDER BY t.slug ASC`,
    [supplierId],
  );
  return rows.map((r) => r.slug);
}

/**
 * Serve the supplier's full trade-set lead feed (M-scope: one response).
 * Returns null when the supplier account does not exist.
 */
export async function getSupplierLeads(
  pool: Pool,
  opts: { supplierId: number; disableCoa: boolean; limit: number; offset: number },
): Promise<SupplierLeadsResult | null> {
  const trades = await getSupplierTrades(pool, opts.supplierId);
  if (trades === null) return null;

  const { rows } = await pool.query<SupplierLead>(SUPPLIER_LEADS_SQL, [
    opts.supplierId,
    opts.disableCoa,
    opts.limit,
    opts.offset,
  ]);

  return { supplier_id: opts.supplierId, trades, leads: rows };
}
