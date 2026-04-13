-- Migration 091: Signal Evolution — Lead Analytics + Valuation Audit + Opportunity Scoring
--
-- Adds infrastructure for:
--   1. lead_analytics — behavioral signal tracking (saves + claims per lead)
--      for competition discount calculation
--   2. cost_estimates audit columns — geometric override flag + modeled GFA
--   3. trade_forecasts scoring — opportunity_score + bimodal target_window
--
-- NOTE: trade_contract_values already exists on cost_estimates (migration 089).
-- Intentionally NOT included here to prevent duplicate-column error.
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- 1. Lead Analytics — behavioral signal tracking
-- lead_key format: 'permit:24 101234:01' (composite as single string)
-- tracking_count = claimed users (high intensity)
-- saving_count = saved users (low intensity)
-- Competition discount: 1 / (1 + tracking_count + 0.3 * saving_count)
CREATE TABLE lead_analytics (
  lead_key        VARCHAR(100) PRIMARY KEY,
  tracking_count  INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_tracking_count CHECK (tracking_count >= 0),
  saving_count    INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_saving_count CHECK (saving_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: An expression index on (tracking_count + saving_count) was
-- initially planned but removed per adversarial review HIGH-2: the
-- competition discount formula uses 0.3 * saving_count weighting,
-- which does NOT match a raw sum index. The planner would never use
-- it. Add a targeted index when the actual query pattern is known.

-- 2. Cost Estimates — geometric audit columns
-- is_geometric_override: true if cost used massing/GFA geometry
-- modeled_gfa_sqm: gross floor area in m² (NULL if not geometric)
-- trade_contract_values already exists (migration 089) — skipped
ALTER TABLE cost_estimates
  ADD COLUMN is_geometric_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN modeled_gfa_sqm DECIMAL;

-- 3. Trade Forecasts — opportunity scoring + bimodal window label
-- opportunity_score: 0-100 composite (urgency + competition + cost)
-- target_window: which bimodal window the forecast is targeting
ALTER TABLE trade_forecasts
  ADD COLUMN opportunity_score INTEGER NOT NULL DEFAULT 0
    CONSTRAINT chk_opportunity_score CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  ADD COLUMN target_window VARCHAR(20)
    CONSTRAINT chk_target_window CHECK (target_window IS NULL OR target_window IN ('bid', 'work'));

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE trade_forecasts DROP COLUMN IF EXISTS target_window;
-- ALTER TABLE trade_forecasts DROP COLUMN IF EXISTS opportunity_score;
-- ALTER TABLE cost_estimates DROP COLUMN IF EXISTS modeled_gfa_sqm;
-- ALTER TABLE cost_estimates DROP COLUMN IF EXISTS is_geometric_override;
-- DROP TABLE IF EXISTS lead_analytics;
