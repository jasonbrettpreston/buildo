-- 211: D3a — declarative coa_gate_policy logic variable for the CoA audit-verdict gate.
--
-- compute-trade-forecasts.js gates the CoA forecast branch on the most-recent
-- permits:compute_phase_calibration verdict. Under the post-rebuild cold calibration corpus the
-- verdict is WARN (unreliable buckets < 30 samples), which fail-closes the CoA branch even though
-- the WARN is a sample-size caveat, not a wrongness signal. coa_gate_policy makes the acceptance
-- policy declarative + operator-revertible (no ticking-clock date, no forgettable force flag):
--   'pass_only'    — only a PASS verdict activates the CoA branch (strict; the pre-D3a behavior).
--   'pass_or_warn' — a WARN verdict within the freshness window ALSO activates it; FAIL / absent
--                    (no_prior_run / stale window) / non-completed runs stay BLOCKED. Each accepted
--                    WARN emits the coa_audit_gate_warn_accepted WARN audit row (loud, not silent).
--
-- Stored as a JSONB string (non-numeric → cannot live in the DECIMAL variable_value; config-loader
-- reads object JSON only, so compute-trade-forecasts.js reads this row directly). Migration-only,
-- mirroring income_premium_tiers (mig 097) — NOT in scripts/seeds/logic_variables.json.
--
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3.6

-- UP
-- 1. Seed the strict default 'pass_only'. ON CONFLICT DO NOTHING (never revert an operator override).
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('coa_gate_policy', 0, '"pass_only"'::jsonb,
   'Spec 85 §3.6 / D3a — CoA audit-verdict gate policy. ''pass_only'' = only a PASS calibration verdict activates the CoA forecast branch (strict). ''pass_or_warn'' = a WARN verdict within the freshness window ALSO activates it (FAIL/absent/stale stay blocked); each accepted WARN emits the coa_audit_gate_warn_accepted WARN audit row. JSONB string (config-loader reads object JSON only, so compute-trade-forecasts.js reads this directly). CONSUMED by scripts/compute-trade-forecasts.js.')
ON CONFLICT (variable_key) DO NOTHING;

-- 2. Live re-baseline to 'pass_or_warn' (mig 209 conditional-update pattern — idempotent; flips only
--    a row still at the seed default, never an operator-tuned value). This is the intended live posture
--    while the post-rebuild calibration corpus warms up; an operator reverts to pass_only via the
--    Control Panel once compute_phase_calibration returns to PASS.
UPDATE logic_variables
   SET variable_value_json = '"pass_or_warn"'::jsonb, updated_at = NOW()
 WHERE variable_key = 'coa_gate_policy'
   AND variable_value_json = '"pass_only"'::jsonb;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DELETE FROM logic_variables WHERE variable_key = 'coa_gate_policy';
