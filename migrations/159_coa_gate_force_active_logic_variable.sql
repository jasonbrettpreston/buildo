-- 159: Operator override flag for compute-trade-forecasts CoA audit-verdict gate.
--
-- Spec 79 §7a Pass-2.5 WF3 #2 (Finding J, 2026-05-20): the audit-verdict gate
-- in scripts/compute-trade-forecasts.js (lines 218-247) blocks CoA forecast
-- writes when the most-recent `permits:compute_phase_calibration` verdict is
-- WARN/FAIL. The bundled WF3 fix adds a grace bypass during the first 7 days
-- of pipeline runs, which breaks the chicken-and-egg cleanly during cold-start
-- (calibration needs cohorts → cohorts need forecasts → forecasts blocked by
-- gate).
--
-- This logic_variable is the *operator safety valve* for the post-grace
-- scenario: if cohorts still haven't populated after 7 days (e.g., slow ramp,
-- a separate bug suppresses CoA writes silently, etc.), the gate would re-block
-- with no escape path. Setting `coa_gate_force_active = 1` overrides the gate
-- regardless of grace or calibration verdict — last-resort decisive override.
-- Mirror of the existing `coa_gate_calibration_window_days` operator-tunable
-- pattern (mig already-applied; gate window = 7 days).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any
-- operator-set value applied via admin Control Panel after first deploy.
--
-- SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md §7a (per-lead Inspector spot-check)
-- SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §C+F (compute_trade_forecasts CoA UNION)
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (audit_table cascade)

-- UP

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('coa_gate_force_active', 0,
   'Operator override for compute-trade-forecasts.js CoA audit-verdict gate. ' ||
   '0 = normal gate behavior (calibration verdict + cold-start grace decide). ' ||
   '1 = force CoA writes regardless of calibration verdict — safety valve for ' ||
   'post-grace deadlocks where coa_cohort_presence remains 0 after 7 days of ' ||
   'runs. When set to 1, the script emits a WARN audit row and a pipeline.log.warn ' ||
   'on every run; reset to 0 once the calibration root cause is resolved.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b; matches mig 119 + mig 148 convention — a
-- transactional DOWN would destroy operator-tuned values.)
--
-- To roll back manually:
--   DELETE FROM logic_variables WHERE variable_key = 'coa_gate_force_active';
--
-- Then revert scripts/compute-trade-forecasts.js to the pre-WF3-#2 gate logic
-- (remove the force-active override block + audit row + Zod schema entry +
-- seed entry).
