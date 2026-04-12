-- Migration 088: Add 'expired' urgency tier; remove 'on_hold'
--
-- WF3: Stalled permits now get real urgency values via the "Instant
-- Stall Recalibration" math (penalty + rolling snowplow). The frontend
-- reads lifecycle_stalled directly from the permits table JOIN.
-- 'on_hold' is removed; 'expired' is added for permits >90 days past
-- their predicted date (dead data, not actionable leads).
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- Clear any existing on_hold rows BEFORE swapping the constraint.
-- Without this, the ADD CONSTRAINT fails if on_hold rows exist in the
-- DB when the migration runs. Adversarial WF3 Defect 4.
UPDATE trade_forecasts SET urgency = 'overdue' WHERE urgency = 'on_hold';

ALTER TABLE trade_forecasts
  DROP CONSTRAINT chk_forecast_urgency,
  ADD CONSTRAINT chk_forecast_urgency
    CHECK (urgency IN ('unknown', 'on_time', 'upcoming', 'imminent', 'delayed', 'overdue', 'expired'));

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE trade_forecasts SET urgency = 'overdue' WHERE urgency = 'expired';
-- ALTER TABLE trade_forecasts
--   DROP CONSTRAINT chk_forecast_urgency,
--   ADD CONSTRAINT chk_forecast_urgency
--     CHECK (urgency IN ('unknown', 'on_time', 'upcoming', 'imminent', 'delayed', 'overdue'));
