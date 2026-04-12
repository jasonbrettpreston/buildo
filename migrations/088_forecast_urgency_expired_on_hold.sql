-- Migration 088: Add 'expired' and 'on_hold' urgency values
--
-- WF3: The adversarial review found that 92% of trade forecasts were
-- 'overdue' — a graveyard of dead leads with no signal value. Two new
-- urgency tiers solve this:
--   'expired' — >90 days past predicted date; dead data, not a lead
--   'on_hold' — permit is stalled (lifecycle_stalled = true)
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- on_hold removed: stalled permits now get real urgency values via the
-- "Instant Stall Recalibration" math (penalty + rolling snowplow).
-- The frontend reads lifecycle_stalled from the permits JOIN, not from
-- trade_forecasts.urgency.
ALTER TABLE trade_forecasts
  DROP CONSTRAINT chk_forecast_urgency,
  ADD CONSTRAINT chk_forecast_urgency
    CHECK (urgency IN ('unknown', 'on_time', 'upcoming', 'imminent', 'delayed', 'overdue', 'expired'));

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE trade_forecasts SET urgency = 'overdue' WHERE urgency IN ('expired', 'on_hold');
-- ALTER TABLE trade_forecasts
--   DROP CONSTRAINT chk_forecast_urgency,
--   ADD CONSTRAINT chk_forecast_urgency
--     CHECK (urgency IN ('unknown', 'on_time', 'upcoming', 'imminent', 'delayed', 'overdue'));
