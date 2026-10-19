-- 275: compute_coa_cost_estimates — the step's literals, knobs and step-owned thresholds become registered logic variables.
--
-- Phase-4 wave 4 lane C; lands with compute_coa_cost_estimates full-form row 7 (Spec 123 §7, operator Q5 y 2026-10-19),
-- written against the MATERIALIZER rows form, Spec 124 R-EH (RE-FREEZE #37).
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED, R-CV form; R-DE (i); R-DE (v); R-BD knobs).
-- Defects closed: CCCE-D2 (literals), CCCE-D3 (the env kill switch), CCCE-D8 (step-owned names).
--
--   compute_coa_cost_estimates_batch_size            1000  was Math.min(1000, …) (compute-coa-cost-estimates.js:88)
--   compute_coa_cost_estimates_distribution_p25      0.25  was PERCENTILE_CONT(0.25) (:657); pinned min = max — the
--   compute_coa_cost_estimates_distribution_p50      0.50     metric cost_distribution_p25_p50_p75 names them (R-CV
--   compute_coa_cost_estimates_distribution_p75      0.75     definitional form, the refresh_snapshot window precedent)
--   compute_coa_cost_estimates_coverage_threshold_pct      COPIED from coa_cost_coverage_threshold_pct (default 65)
--   compute_coa_cost_estimates_coverage_fail_pct           COPIED from coa_cost_coverage_fail_pct (default 5)
--   archetype_cost_enabled                              1  SHARED (Q-CE1, unruled): replaces ARCHETYPE_COST_DISABLED=1 (:241),
--                                                         which the rollback runbook flips for BOTH cost Muscles
--                                                         (docs/specs/01-pipeline/runbooks/83_archetype_cost_rollback.md:21);
--                                                         decided with the wave-3 twin compute_cost_estimates.
--
-- The shared cost-model family (liar_gate_threshold, …, cost_escalation_index) keeps its names: Q-C3. model_range_pct and
-- fallback_range_pct have ONE consumer (this step, through scripts/lib/coa-cost-model.js), so R-DE (v) makes them step-owned
-- copies below; the legacy names stay until ③ because the legacy script reads them.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DE; R-DF)
--            docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('compute_coa_cost_estimates_batch_size', 1000,
   'McDonald''s Airtight V3 (Spec 124 R-DE (i); CCCE-D2): the MATERIALIZER keyset batch size — source CoAs per transaction. ' ||
   '1000 = the former Math.min(1000, …) cap; the parameter slice is the runner''s R-CU protocol limit. Not verdict-affecting. ' ||
   'CONSUMED by compute_coa_cost_estimates (execution.batch_size_from_config).'),
  ('compute_coa_cost_estimates_distribution_p25', 0.25,
   'McDonald''s Airtight V3 (CCCE-D2; R-CV definitional form): the lower percentile of the cost_distribution_p25_p50_p75 ' ||
   'INFO row. Pinned min = max: the metric name states it. Bound as a query parameter. CONSUMED by compute_coa_cost_estimates (buildPostSql).'),
  ('compute_coa_cost_estimates_distribution_p50', 0.5,
   'McDonald''s Airtight V3 (CCCE-D2; R-CV definitional form): the median of the cost_distribution_p25_p50_p75 INFO row. ' ||
   'Pinned min = max. CONSUMED by compute_coa_cost_estimates (buildPostSql).'),
  ('compute_coa_cost_estimates_distribution_p75', 0.75,
   'McDonald''s Airtight V3 (CCCE-D2; R-CV definitional form): the upper percentile of the cost_distribution_p25_p50_p75 ' ||
   'INFO row. Pinned min = max. CONSUMED by compute_coa_cost_estimates (buildPostSql).'),
  ('archetype_cost_enabled', 1,
   'McDonald''s Airtight V3 (CCCE-D3; Q-CE1, shared with compute_cost_estimates): 1 = the Spec 83 §3-ARCHETYPE ladder ' ||
   'prices first; 0 = the rollback — every lead falls to the legacy geometric T4 path. Replaces the ARCHETYPE_COST_DISABLED ' ||
   'env kill switch (runbooks/83_archetype_cost_rollback.md). min 0, max 1. CONSUMED by compute_coa_cost_estimates (materializeRows).')
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'compute_coa_cost_estimates_coverage_threshold_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_cost_coverage_threshold_pct'), 65),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCCE-D8): the WARN floor of cost_estimate_coverage_pct (priced / processed). ' ||
       'Seeded from coa_cost_coverage_threshold_pct, which retires at ③. CONSUMED by compute_coa_cost_estimates ' ||
       '(checks[].warn_limit_from_config).'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'compute_coa_cost_estimates_coverage_fail_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_cost_coverage_fail_pct'), 5),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCCE-D8): the FAIL floor of cost_estimate_coverage_pct — coverage at or ' ||
       'below it FAILs (the Spec 83 §3.A D3 OB-2 mirror). Seeded from coa_cost_coverage_fail_pct, which retires at ③. ' ||
       'CONSUMED by compute_coa_cost_estimates (checks[].limit_from_config).'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'compute_coa_cost_estimates_model_range_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'model_range_pct'), 0.2),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCCE-D8): the CoA cost model ±range for a model-priced estimate. ' ||
       'Step-owned (one consumer, so not a Q-C3 shared name). Seeded from model_range_pct, which retires at ③. ' ||
       'CONSUMED by compute_coa_cost_estimates (materializeRows, via buildCoaConfig).'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'compute_coa_cost_estimates_fallback_range_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'fallback_range_pct'), 0.4),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCCE-D8): the CoA cost model ±range for a fallback-priced estimate. ' ||
       'Step-owned (one consumer, so not a Q-C3 shared name). Seeded from fallback_range_pct, which retires at ③. ' ||
       'CONSUMED by compute_coa_cost_estimates (materializeRows, via buildCoaConfig).'
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('compute_coa_cost_estimates_batch_size',
--   'compute_coa_cost_estimates_distribution_p25', 'compute_coa_cost_estimates_distribution_p50',
--   'compute_coa_cost_estimates_distribution_p75', 'archetype_cost_enabled',
--   'compute_coa_cost_estimates_coverage_threshold_pct', 'compute_coa_cost_estimates_coverage_fail_pct',
--   'compute_coa_cost_estimates_model_range_pct', 'compute_coa_cost_estimates_fallback_range_pct');
