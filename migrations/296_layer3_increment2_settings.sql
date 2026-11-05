-- 296: compute_maxbld_scenarios (Layer 3, MB-27 increment 2) — the M-462 roof-assembly settings table the catalogue rows
-- roof_assembly_depth_a_m and roof_assembly_depth_b_m read through lv(): the four OBC 2024 Table 9.23.4.2.-F rafter spans
-- (SPF No.1/No.2, 400 mm o.c., 1.5 kPa column) and the exact assembly depths (rafter + sheathing 9.5 mm, Table 9.23.16.7.-A +
-- ceiling board 12.7 mm, Table 9.29.5.3). Each value is pinned (min = max = value) and changes only by a ruling.
-- Mirrors scripts/seeds/logic_variables.json entry for entry (the seed file is the test truth; this migration puts the same
-- rows in the table the admin screen and the runner read). The 294 form. No value is carried over from the old engine.
-- WRITTEN, NOT APPLIED (DB window; one writer; lands after 295, P3). Idempotent: ON CONFLICT (variable_key) DO NOTHING
-- preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-462
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DE (v))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('compute_maxbld_scenarios_rafter_span_1_m', 3.89, NULL, 'M-462 (69a:600): the maximum span of the 38x140 rafter in OBC 2024 Table 9.23.4.2.-F (SPF No.1/No.2, 400 mm o.c., 1.5 kPa column). Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_roof_assembly_depth_1_m', 0.1622, NULL, 'M-462 (69a:600): roof assembly depth with the 38x140 rafter = rafter depth + sheathing 9.5 mm (Table 9.23.16.7.-A, edges unsupported, a disclosed choice) + ceiling board 12.7 mm (Table 9.29.5.3), the exact sum. Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_rafter_span_2_m', 5.11, NULL, 'M-462 (69a:600): the maximum span of the 38x184 rafter in OBC 2024 Table 9.23.4.2.-F (SPF No.1/No.2, 400 mm o.c., 1.5 kPa column). Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_roof_assembly_depth_2_m', 0.2062, NULL, 'M-462 (69a:600): roof assembly depth with the 38x184 rafter = rafter depth + sheathing 9.5 mm (Table 9.23.16.7.-A, edges unsupported, a disclosed choice) + ceiling board 12.7 mm (Table 9.29.5.3), the exact sum. Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_rafter_span_3_m', 6.52, NULL, 'M-462 (69a:600): the maximum span of the 38x235 rafter in OBC 2024 Table 9.23.4.2.-F (SPF No.1/No.2, 400 mm o.c., 1.5 kPa column). Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_roof_assembly_depth_3_m', 0.2572, NULL, 'M-462 (69a:600): roof assembly depth with the 38x235 rafter = rafter depth + sheathing 9.5 mm (Table 9.23.16.7.-A, edges unsupported, a disclosed choice) + ceiling board 12.7 mm (Table 9.29.5.3), the exact sum. Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_rafter_span_4_m', 7.66, NULL, 'M-462 (69a:600): the maximum span of the 38x286 rafter in OBC 2024 Table 9.23.4.2.-F (SPF No.1/No.2, 400 mm o.c., 1.5 kPa column). Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.'),
  ('compute_maxbld_scenarios_roof_assembly_depth_4_m', 0.3082, NULL, 'M-462 (69a:600): roof assembly depth with the 38x286 rafter = rafter depth + sheathing 9.5 mm (Table 9.23.16.7.-A, edges unsupported, a disclosed choice) + ceiling board 12.7 mm (Table 9.29.5.3), the exact sum. Pinned: changes only by a ruling. CONSUMED by the catalogue rows roof_assembly_depth_a_m and roof_assembly_depth_b_m.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 159, 283 and 294).
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_rafter_span_1_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_roof_assembly_depth_1_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_rafter_span_2_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_roof_assembly_depth_2_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_rafter_span_3_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_roof_assembly_depth_3_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_rafter_span_4_m';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_roof_assembly_depth_4_m';
