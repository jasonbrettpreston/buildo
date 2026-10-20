-- 271: classify_coa_scope — step-owned logic variables (phase-4 wave 4, compressed form commit ②).
--
-- McDonald's Airtight V3 (Spec 124 R-DE (v) step-owned names, R-DF EXTERNALIZED; defects CCS-D2, CCS-D3;
-- ruling W4A-R1, operator y 2026-10-18). The converted step (scripts/classify-coa-scope.descriptor.json) reads:
--   classify_coa_scope_unmapped_max_pct   COPIED from coa_scope_unmapped_threshold_pct (default 10)
--   classify_coa_scope_batch_size   1000  NEW: was Math.min(1000, Math.floor(65535 / 5)) (classify-coa-scope.js:49-50);
--                                         the 65,535-parameter slice is the runner's R-CU protocol limit
-- The copied row takes the live value of the legacy name (an operator-set value survives), falling back to the
-- seed default when the legacy row is absent. The legacy row STAYS: commit ② lands at stage compute_ported
-- (W4A-R6; Spec 124 R-EF), so the legacy shell is still the live step and reads coa_scope_unmapped_threshold_pct
-- until the ③ cutover, whose migration deletes it and moves the name into config.retired (Spec 124 R-A). The same
-- copy form as migrations 270 / 273 / 274 / 275.
--
-- ORDERING (trap 7): the legacy script reads the OLD name, which this migration leaves in place, so the PRE
-- captured on the ① tree (replay night N1) stays valid after it is applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves an already-present new row.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-DE (v); R-DF)
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'classify_coa_scope_unmapped_max_pct',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_scope_unmapped_threshold_pct'), 10),
       'classify_coa_scope (Spec 42 §6.5 step 5): the largest percent of a run''s processed CoAs whose description fires no scope tag that still reads PASS; above it unmapped_scope_pct WARNs (the Day-1 WARN, never FAIL). Inclusive. Copied from coa_scope_unmapped_threshold_pct by migration 271 (R-DE (v)), value carried; the legacy name retires at ③. CONSUMED by classify_coa_scope via checks[].limit_from_config.'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('classify_coa_scope_batch_size', 1000,
   'classify_coa_scope: CoAs classified per UPDATE batch (each batch its own short transaction) and per cursor fetch. 1000 = the former Math.min(1000, …) cap (classify-coa-scope.js:49-50); 5 binds per row + 1, so 13,106 rows is the 65,535-parameter ceiling (R-CU). CONSUMED by classify_coa_scope.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159). The legacy row was never removed.
-- DELETE FROM logic_variables WHERE variable_key IN ('classify_coa_scope_unmapped_max_pct', 'classify_coa_scope_batch_size');
