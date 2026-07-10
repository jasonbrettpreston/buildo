// 🔗 SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.2 + §v1.3
//
// Spec 87 v1 — the trade-level supplier lead query. Resolves a supplier's
// `supplier_trades` set, then serves the live trade-keyed lead layer
// (`lead_trades` ⋈ `trade_forecasts`) filtered to those trades.
//
// TWO CONSCIOUS FENCES (Spec 87 v1.3 [GRD P9b-4/-5]; comment refreshed P16 16E [GRD-7]):
//   1. Permit-side precision: `is_active = true` alone is not a precision signal on the
//      permit side. HISTORY: the archetype bundle prior once wrote is_active=true rows at
//      tier 2 / conf 0.55 (hence the `(tier <= 1 OR confidence > 0.55)` guard); P13-3
//      demoted those rows to is_active=false, and P16 16C RETIRED the bundle prior
//      entirely, replacing it with the lean inference layer whose rows are is_active=true
//      + attachment_basis='inference' at conf 0.50. The guard now reads
//      `(tier <= 1 OR confidence > 0.55 OR attachment_basis = 'inference')` — inference
//      rows are served BY BASIS (D5 MANDATE: raising their confidence past 0.55 to clear
//      the numeric guard is FORBIDDEN — it would couple the serving axis to a magic number).
//      CoA-side rows pass on is_active alone (evidence + gated lean inference only, post-16D).
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
  /** P16 16E — attachment provenance ('evidence' | 'inference'; null on pre-P16 rows). */
  attachment_basis: 'evidence' | 'inference' | null;
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
    lt.attachment_basis,
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
      -- Permit rows: the historical 0.55 bundle-tier guard, plus the P16 16E basis clause —
      -- lean-inference rows (conf 0.50) serve BY BASIS, never by clearing the numeric guard
      -- (D5 MANDATE: coupling the axes is forbidden).
      (lt.lead_id LIKE 'permit:%' AND (lt.tier <= 1 OR lt.confidence > 0.55 OR lt.attachment_basis = 'inference'))
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
