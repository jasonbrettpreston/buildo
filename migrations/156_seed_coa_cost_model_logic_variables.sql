-- migrations/156_seed_coa_cost_model_logic_variables.sql
-- SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A (CoA geometric path)
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 (operator-tunable values)
-- SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md (validation trigger)
--
-- Surfaced by Spec 79 pipeline validation CoA chain Step 7 (2026-05-19):
-- compute-coa-cost-estimates.js crashed with Zod validation failure because
-- the two keys below were missing from logic_variables. The Zod schema (lines
-- 78-79 of the script) requires both as finite non-negative numbers in [0,1];
-- when absent, z.coerce.number() returns NaN → validation fails → script
-- exits 1 BEFORE the runtime fallback in coa-cost-model.js:64-65 can run.
--
-- Defaults match DEFAULT_MODEL_RANGE_PCT (0.20) and DEFAULT_FALLBACK_RANGE_PCT
-- (0.40) from scripts/lib/coa-cost-model.js lines 23-24 — the values the
-- runtime fallback would have used. These are code-side conventions, not
-- spec-mandated numeric values (Spec 83 §3.A leaves range magnitudes to
-- code).
--
-- UPSERT strategy (DeepSeek WF3 #5 v2 HIGH fold):
--
-- INSERT ... ON CONFLICT DO UPDATE WHERE existing IS NULL OR existing = 'NaN'
--
-- This restores the value when:
--   (1) the row is absent (this DB's state today)
--   (2) the row exists but has NULL value (corrupt seed elsewhere)
--   (3) the row exists but has NaN value ('NaN'::numeric is a valid PG
--       NUMERIC literal and would still fail Zod's .finite() check)
--
-- It does NOT overwrite a row containing a valid operator-tuned value
-- (e.g., model_range_pct=0.25 set via Spec 86 Control Panel) — preserving
-- the operator-tunability contract per Spec 47 §4.1.

-- ============================================================================
-- UP
-- ============================================================================
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('model_range_pct', 0.20,
   'CoA geometric cost-model range as a fraction (Spec 83 §3.A). The cost estimate ±range produces the displayed low/high envelope. Default 0.20 = ±20%. Operator-tunable via Spec 86 Control Panel.'),
  ('fallback_range_pct', 0.40,
   'CoA geometric cost-model fallback range when the primary model declines (insufficient confidence). Default 0.40 = ±40% — wider than primary range to reflect lower confidence. Operator-tunable via Spec 86 Control Panel.')
ON CONFLICT (variable_key) DO UPDATE
  SET variable_value = EXCLUDED.variable_value,
      description    = EXCLUDED.description,
      updated_at     = NOW()
  WHERE logic_variables.variable_value IS NULL
     OR logic_variables.variable_value = 'NaN'::numeric;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151/152/154 convention)
-- ============================================================================
-- DELETE FROM logic_variables WHERE variable_key IN ('model_range_pct', 'fallback_range_pct');
