-- 213_supplier_trades.sql
-- SPEC LINK: docs/specs/01-pipeline/87_supplier_audience.md §v1.1 + §v1.2
--
-- Spec 87 v1 — the trade-level supplier path. Adds the ONE genuinely new table
-- (supplier_trades) + the partial index the per-trade active-lead feed needs.
--
--   1. supplier_trades — marketplace-account → trade_id many-to-many. FK targets
--      are BOTH already live: suppliers.id (mig 183) + trades.id (Spec 80). This
--      is distinct from trade_suppliers (mig 113 — slug-based onboarding list) and
--      from supplier_products (mig 183 — the dormant v2 product hub).
--   2. idx_lead_trades_trade_active — partial index on lead_trades(trade_id)
--      WHERE is_active. Today lead_trades has only idx_lead_trades_trade (trade_id)
--      and idx_lead_trades_active (is_active) as independent single-column indexes;
--      neither serves the trade_id-first + is_active feed lookup (Spec 87 v1.2 [INT #8]).

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

CREATE TABLE supplier_trades (
  supplier_id INTEGER     NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  trade_id    INTEGER     NOT NULL REFERENCES trades(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- PK doubles as UNIQUE(supplier_id, trade_id) (Spec 87 v1.1) and gives the
  -- supplier_id-leading btree that resolves a supplier's trade_id[] footprint.
  CONSTRAINT supplier_trades_pkey PRIMARY KEY (supplier_id, trade_id)
);

-- Partial index for the per-trade active-lead feed JOIN (Spec 87 v1.2).
CREATE INDEX idx_lead_trades_trade_active ON lead_trades (trade_id) WHERE is_active;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 153/212 convention).
-- ============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS idx_lead_trades_trade_active;
--   DROP TABLE IF EXISTS supplier_trades;
-- COMMIT;
