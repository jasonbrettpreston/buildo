-- migrations/154_coa_crm_assistant_logic_variables.sql
-- SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 operator-tunable values
--
-- v2 CRIT-A fold: only 1 NEW key. The other 3 v1-proposed keys ALREADY EXIST:
--   - coa_stall_threshold (mig 093, default 30)
--   - coa_stall_threshold_p2_days (mig 136, default 90)
--   - coa_imminent_window_days (mig 136, default 7)
-- v2 HIGH-I fold: promote previously-hardcoded 60-day Postponed/Deferred threshold to
-- operator-tunable via coa_stall_threshold_postponed_days.
-- ON CONFLICT DO NOTHING ensures idempotent re-application.
-- No explicit BEGIN/COMMIT per mig 135 R8 convention for logic_variables INSERTs.

-- ============================================================================
-- UP
-- ============================================================================
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('coa_stall_threshold_postponed_days', 60,
   'Phase F.2 CRM Assistant CoA stall threshold for Postponed / Deferred statuses (mid-tier between generic 30-day and Hearing-Scheduled 90-day). Default 60 = upper edge of typical postponement before considered stalled. Operator-tunable per Spec 86 Control Panel — raise during CoA backlog spikes that produce normal long postponements.')
ON CONFLICT (variable_key) DO NOTHING;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151/152 convention)
-- ============================================================================
-- DELETE FROM logic_variables WHERE variable_key = 'coa_stall_threshold_postponed_days';
