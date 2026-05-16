-- migrations/152_coa_forecast_logic_variables.sql
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (CoA-stage Anchor priority)
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 (operator-tunable values in DB)
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.4 (baseline window)
--
-- Seeds two new logic_variables consumed by compute-trade-forecasts.js Phase F.1:
--   1. coa_lifecycle_transition_stale_days (default 180) — snowplow staleness gate (v3 CRIT-D fold)
--   2. coa_gate_calibration_window_days (default 7)      — gate freshness window (v4 MED-J fold)
-- No explicit BEGIN/COMMIT (mig 135 R8 convention for logic_variables INSERTs).
-- ON CONFLICT DO NOTHING ensures idempotent re-application.

-- ============================================================================
-- UP
-- ============================================================================
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('coa_lifecycle_transition_stale_days', 180,
   'CoA forecast snowplow staleness gate: if lifecycle_transitions.MAX(transitioned_at) anchor is older than this many days, the CoA forecast becomes snowplow-eligible (treats long-stalled E.2-classified CoAs without subsequent transitions as Rescue Missions). Default 180 = 6 months ≈ p75 of typical CoA decision cohort duration per Spec 84 §7.'),
  ('coa_gate_calibration_window_days', 7,
   'CoA audit-verdict gate freshness window: compute_phase_calibration must have a permits-chain pipeline_runs row within this many days for the gate to consult its verdict. Older runs trigger no_prior_run state. Default 7 aligns with Spec 48 §3.4 baseline window. Operator may raise this if calibration runs are less frequent than weekly.')
ON CONFLICT (variable_key) DO NOTHING;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151 convention)
-- ============================================================================
-- DELETE FROM logic_variables WHERE variable_key IN (
--   'coa_lifecycle_transition_stale_days',
--   'coa_gate_calibration_window_days'
-- );
