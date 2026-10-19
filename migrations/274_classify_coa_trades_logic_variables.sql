-- 274: classify_coa_trades — the step's literals and step-owned thresholds become registered logic variables.
--
-- Phase-4 wave 4 lane C; lands with classify_coa_trades full-form row 7 (Spec 123 §7, operator Q5 y 2026-10-19),
-- written against the MATERIALIZER rows form, Spec 124 R-EH (RE-FREEZE #37).
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED, R-CV form; R-DE (i) batch_size_from_config, R-DE (v) names).
-- Defects closed: CCT-D4 (seven literals), CCT-D8 (step-owned names), with CCT-D5's fallbacks deleted in the compute.
--
--   classify_coa_trades_batch_size          1000  was Math.min(1000, …) (classify-coa-trades.js:85, :89)
--   classify_coa_trades_max_detail_keys       50  was SLUG_MISS_CAP (:172); the *_max_detail_keys precedent (mig 263)
--   classify_coa_trades_tier                   3  was the literal tier (:308, :331); pinned min = max — CoA rows are
--                                                 always tier 3 (migrations/124_create_lead_trades.sql:13)
--   classify_coa_trades_lead_score_scale     100  was `* 100` (:316, :335); pinned min = max (a unit, R-CV)
--   classify_coa_trades_realtor_confidence   0.7  was the realtor append confidence (:327)
--   classify_coa_trades_unmapped_threshold_pct    COPIED from coa_trades_unmapped_threshold_pct (default 20)
--   classify_coa_trades_active_trades_warn_max    COPIED from coa_active_trades_warn_max (default 18)
--
-- The two COPIED rows take the live value of the legacy name (an operator-set value survives); the legacy names
-- stay until ③ because the legacy script reads them until cutover, then retire in the ③ commit.
-- Shared names (vocab_coverage_*, p16_inference_layer_enabled) are NOT re-seeded here: Q-C3 (unruled).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DE; R-DF)
--            docs/specs/01-pipeline/42_chain_coa.md §6.8 row 667

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('classify_coa_trades_batch_size', 1000,
   'McDonald''s Airtight V3 (Spec 124 R-DE (i), R-DF EXTERNALIZED; CCT-D4): the MATERIALIZER keyset batch size — source CoAs per ' ||
   'transaction. 1000 = the former Math.min(1000, …) cap; the 65,535-parameter slice is the runner''s R-CU protocol limit. ' ||
   'Not verdict-affecting. CONSUMED by classify_coa_trades (execution.batch_size_from_config).'),
  ('classify_coa_trades_max_detail_keys', 50,
   'McDonald''s Airtight V3 (CCT-D4; the *_max_detail_keys precedent): how many distinct unresolved trade slugs the ' ||
   'slug_resolution_misses detail lists. 50 = the former SLUG_MISS_CAP. A DISPLAY bound: slug_resolution_miss_count is ' ||
   'always exact. CONSUMED by classify_coa_trades (scripts/lib/compute/classify-coa-trades.js finalizeMatched).'),
  ('classify_coa_trades_tier', 3,
   'McDonald''s Airtight V3 (CCT-D4; R-CV pinned form): the lead_trades tier written for every CoA trade row. Pinned ' ||
   'min = max = 3 — migration 124 defines CoA-side rows as always tier 3 (description-only matching). CONSUMED by ' ||
   'classify_coa_trades (materializeRows).'),
  ('classify_coa_trades_lead_score_scale', 100,
   'McDonald''s Airtight V3 (CCT-D4; R-CV unit form): lead_score = round(confidence × this). Pinned min = max = 100 ' ||
   '(confidence 0..1 → score 0..100). CONSUMED by classify_coa_trades (materializeRows).'),
  ('classify_coa_trades_realtor_confidence', 0.7,
   'McDonald''s Airtight V3 (CCT-D4): the confidence of the realtor trade row appended to a residential CoA ' ||
   '(Spec 80 §5 realtor gate). 0.7 = the former literal. CONSUMED by classify_coa_trades (materializeRows).'),
  ('classify_coa_trades_eligible_min_count', 1,
   'McDonald''s Airtight V3 (R-CV definitional form; gate A): the fewest CoAs a run must process before coa_eligible ' ||
   'stops WARNing (an empty cursor WARNs, legacy :460-465, pinned L16). Pinned min = max = 1: the check states it. ' ||
   'CONSUMED by classify_coa_trades (checks[].limit_from_config coa_eligible).')
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'classify_coa_trades_unmapped_threshold_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_trades_unmapped_threshold_pct'), 20),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCT-D8): the WARN ceiling on the share of processed CoAs that ' ||
       'produce zero trades (variance-only CoAs legitimately do). Seeded from coa_trades_unmapped_threshold_pct, which ' ||
       'retires at ③. CONSUMED by classify_coa_trades (checks[].limit_from_config unmapped_scope_pct).'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'classify_coa_trades_active_trades_warn_max',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_active_trades_warn_max'), 18),
       'McDonald''s Airtight V3 (Spec 124 R-DE (v); CCT-D8): the WARN ceiling on the mean ALL-ACTIVE trades per CoA ' ||
       '(evidence + inference + realtor; P16 [GRD-3]). Seeded from coa_active_trades_warn_max, which retires at ③. ' ||
       'CONSUMED by classify_coa_trades (checks[].limit_from_config avg_active_trades_per_lead).'
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('classify_coa_trades_batch_size', 'classify_coa_trades_max_detail_keys',
--   'classify_coa_trades_tier', 'classify_coa_trades_lead_score_scale', 'classify_coa_trades_realtor_confidence',
--   'classify_coa_trades_unmapped_threshold_pct', 'classify_coa_trades_active_trades_warn_max',
--   'classify_coa_trades_eligible_min_count');
