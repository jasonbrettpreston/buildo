-- 316: compute_maxbld_scenarios (Layer 3, MB-27 increment 5) — four settings the increment-5 split and fitted rows read through lv():
-- the Spec 78 P5.9 plate minimum and strict margin re-seeded under new prefixed names (item 10 B + FD-5 a; C18: the literal P5.9 names are two
-- of the keys migration 313 retired, so they are not reused; D-66 names the margin) and the item 9 livable minimums (D-64 names).
-- Each value is pinned (min = max = value) and changes only by a ruling. Mirrors scripts/seeds/logic_variables.json entry for entry (the seed
-- file is the test truth). The 296 form. Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
-- Applied by the normal migration flow; rehearsed on the test stack first (MCINC-7).
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-451
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DE (v))
-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('compute_maxbld_scenarios_plate_min_dimension_m', 3, NULL, 'Spec 78 P5.9 min_dimension_m re-seeded under the C18 name (MB-27 increment 5 item 10 B + FD-5 a, operator 2026-11-12 "a"; fitted/CONDITIONS-FD1-6.md C18): the least width or depth of a house or garden suite plate in the split and the fitted checks, in metres; a computed house narrower than it answers not_buildable (narrow lots, operator "narrow y"). Our minimum (D-57 wording), not a by-law value. Pinned: changes only by a ruling. CONSUMED by the increment-5 split and fitted catalogue rows.'),
  ('compute_maxbld_scenarios_suite_gfa_lt_main_margin_sqm', 0.01, NULL, 'Spec 78 P5.9 suite_gfa_strict_margin_sqm re-seeded under the D-66 name (MB-27 increment 5 FD-5 a; C18): 150.7.60.50(2) "must be less than" the house GFA is applied as suite GFA <= main GFA - this margin, in m2. Pinned: changes only by a ruling. CONSUMED by the increment-5 split rows (INV-2 suite_lt_main).'),
  ('compute_maxbld_scenarios_min_suite_gfa_m2', 25, NULL, 'M-451 LV-7 (MB-27 increment 5 item 9 (a), operator 2026-11-12 "a"; name D-64): a split whose garden suite is below this GFA, in m2, is dropped with its reason, worded "below the livable minimum we apply" (never "not permitted", never 150.7). Operator value, confidence medium. Pinned: changes only by a ruling. CONSUMED by the increment-5 split rows.'),
  ('compute_maxbld_scenarios_min_main_dwelling_gfa_m2', 60, NULL, 'M-451 LV-8 (MB-27 increment 5 item 9 (a), operator 2026-11-12 "a"; name D-64): a split whose main dwelling is below this GFA, in m2, is dropped with its reason, worded "below the livable minimum we apply" (never "not permitted", never 150.7). Operator value, confidence medium. Pinned: changes only by a ruling. CONSUMED by the increment-5 split rows.')
ON CONFLICT (variable_key) DO NOTHING;
-- DOWN — manual rollback only, intentionally not transactional (matches migrations 159, 283, 294 and 296).
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_plate_min_dimension_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_suite_gfa_lt_main_margin_sqm';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_min_suite_gfa_m2';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_min_main_dwelling_gfa_m2';
