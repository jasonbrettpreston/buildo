-- Migration 093: Control Panel Pipeline Gaps
--
-- Closes 3 gaps identified in WF5 audit against spec 86_control_panel.md:
--   1. trade_configurations missing per-trade multiplier columns
--   2. logic_variables missing lead_expiry_days + coa_stall_threshold
--
-- All operations are instant (ADD COLUMN with DEFAULT on small table,
-- INSERT on PK table). No table rewrites, no locks on large tables.
--
-- SPEC LINK: docs/specs/product/future/86_control_panel.md §2

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Per-trade urgency multipliers on trade_configurations (32 rows).
--    Spec 86 §2: each trade should have its own bid/work multiplier
--    instead of using the global los_multiplier_bid/los_multiplier_work.
ALTER TABLE trade_configurations
  ADD COLUMN multiplier_bid  DECIMAL(4,2) NOT NULL DEFAULT 2.5,
  ADD COLUMN multiplier_work DECIMAL(4,2) NOT NULL DEFAULT 1.5;

-- 2. Seed trade-specific multiplier overrides for trades where the
--    global default (2.5/1.5) doesn't reflect market reality.
--    Heavy-equipment / long-lead trades get higher bid multipliers.
--    Commodity / short-notice trades get lower multipliers.
UPDATE trade_configurations SET multiplier_bid = 3.0, multiplier_work = 1.8
  WHERE trade_slug IN ('excavation', 'shoring', 'structural-steel', 'elevator');

UPDATE trade_configurations SET multiplier_bid = 2.8, multiplier_work = 1.6
  WHERE trade_slug IN ('concrete', 'framing', 'hvac', 'plumbing', 'electrical');

UPDATE trade_configurations SET multiplier_bid = 2.0, multiplier_work = 1.2
  WHERE trade_slug IN ('painting', 'caulking', 'temporary-fencing', 'trim-work');

-- 3. Missing logic_variables keys (spec 86 §1).
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lead_expiry_days',     90,  'TTL in days for claimed_unverified tracked projects before auto-archive'),
  ('coa_stall_threshold',  30,  'Days without CoA activity before marking a pre-permit lead as stalled')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE trade_configurations DROP COLUMN multiplier_bid;
-- ALTER TABLE trade_configurations DROP COLUMN multiplier_work;
-- DELETE FROM logic_variables WHERE variable_key IN ('lead_expiry_days', 'coa_stall_threshold');
