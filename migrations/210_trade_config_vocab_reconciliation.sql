-- 210: Spec 80 P4 trade-vocab reconciliation — map 2 classifier-emitted trades into
-- trade_configurations, and seed the non-forecastable exclusion list as a JSONB logic variable.
--
-- Baseline (2026-07-06): the classifier emits 3 trade slugs absent from the 33-row
-- trade_configurations control panel, so compute-trade-forecasts.js counts them as
-- `unmapped_trades` (≈207,538 rows / 3.6% of permit_trades):
--   site-preparation 80,213  — early sitework; maps to the excavation-family phase window.
--   overhead-doors   75,622  — closing/finishing install; maps to a trim-work-family window.
--   site-maintenance 108,604 — NO phase-anchored install window → non-forecastable (excluded).
--
-- Mapping mechanism = trade_configurations rows (the verified population path — mig 092/118/178);
-- exclusion mechanism = logic_variables JSONB (avoids fabricating NOT-NULL phase columns for a trade
-- that has no install window). site-maintenance rows are then skipped WITHOUT hitting unmapped_trades.
--
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (Forecastability contract)
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5

-- UP
-- 1. Two mapped trade_configurations rows. ON CONFLICT DO NOTHING (mig 118 precedent — a re-run
--    must never silently revert an operator hotfix to imminent_window_days / allocation_pct).
--      site-preparation → excavation-family early sitework: bid P3 → work P9, imminent 7,
--                         multipliers 3.0/1.8 (copied from excavation), allocation 0.0163 (sibling
--                         site-work trades demolition/shoring = 0.0163).
--      overhead-doors   → closing/finishing trade, trim-work phase targets: bid P11 → work P15,
--                         imminent 14, multipliers 2.0/1.2, allocation 0.0081 (trim-work sibling).
INSERT INTO trade_configurations
  (trade_slug, bid_phase_cutoff, work_phase_target, imminent_window_days, allocation_pct, multiplier_bid, multiplier_work)
VALUES
  ('site-preparation', 'P3',  'P9',  7,  0.0163, 3.0, 1.8),
  ('overhead-doors',   'P11', 'P15', 14, 0.0081, 2.0, 1.2)
ON CONFLICT (trade_slug) DO NOTHING;

-- 2. forecast_excluded_trade_slugs — JSONB logic variable (mig 097 convention: sentinel 0 in the
--    NOT-NULL DECIMAL variable_value, the real value in variable_value_json). CONSUMED by
--    compute-trade-forecasts.js: rows whose trade_slug is in this array are skipped BEFORE branch
--    dispatch (so they never increment records_total NOR unmapped_trades) and are surfaced via the
--    excluded_rows + excluded_trade_slugs audit rows. Seeded here (not scripts/seeds/logic_variables.json
--    — apply-logic-variables.js only writes numeric variable_value; JSONB vars are migration-only,
--    mirroring income_premium_tiers/mig 097). ON CONFLICT DO NOTHING.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('forecast_excluded_trade_slugs', 0, '["site-maintenance"]'::jsonb,
   'Spec 80 P4 / Spec 85 §3 — trade slugs excluded from trade_forecasts as non-forecastable (no phase-anchored install window). Rows carrying these slugs are skipped WITHOUT incrementing unmapped_trades; counted as excluded_rows + listed in excluded_trade_slugs audit rows. JSONB array per mig 097 convention (variable_value sentinel 0, array in variable_value_json). CONSUMED by scripts/compute-trade-forecasts.js.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes EVERY uncommented line, including
-- anything under -- DOWN; keep the whole DOWN section commented so it never runs as part of UP).
-- To revert:
--   DELETE FROM trade_configurations WHERE trade_slug IN ('site-preparation', 'overhead-doors');
--   DELETE FROM logic_variables WHERE variable_key = 'forecast_excluded_trade_slugs';
