-- 283: compute_maxbld_scenarios (Layer 3, Spec 78 Phase 5) — the 22 P5.9 logic variables, seeded at step commit ① (P3-1).
--
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED; Spec 132 core.8 (R-CV): every number a step uses is a registered
-- `<slug>_<name>` logic variable, seeded by migration with its default carried). Names, defaults and bounds are the Spec 78
-- P5.9 table, generated from it (never retyped); bounds ride in the description until the descriptor exists (P3-7) and
-- carry them as min/max. Law numbers are never logic variables (Spec 78 §6.7): none is seeded here.
-- WRITTEN, NOT APPLIED (DB window; one writer). No consumer reads these yet (compute_maxbld_scenarios is not registered).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (P5.9)
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DF EXTERNALIZED; R-DE (v))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('compute_maxbld_scenarios_storey_height_m', 3,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): wall-storey floor-to-floor. Default 3, bounds [2.4, 4]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_roof_pitch', 1,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): pitch of form (b) (M-184). Default 1, bounds [0.25, 1.667]. Bound note: capped by `roof_slope_max`. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_roof_assembly_depth_m', 0.3,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): rafter depth off attic clearance. Default 0.3, bounds [0, 0.6]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_basement_livable_share', 1,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): livable share of the plate below grade. Default 1, bounds [0, 1]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_circulation_share', 0.1,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): stairs/halls per houseplex floor. Default 0.1, bounds [0, 0.3]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_unit_min_interior_sqm', 30,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): heuristic unit floor. Default 30, bounds [15, 60]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_suite_weight', 1,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): `w`. Default 1, bounds [1, 1]. Pinned min = max (a unit or an operator-ruled value). Bound note: (pinned, O-10). CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_depth_search_step_m', 0.5,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): rear-wall search step. Default 0.5, bounds [0.1, 2]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_suite_gfa_strict_margin_sqm', 0.01,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): makes "less than" strict. Default 0.01, bounds [0.01, 1]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_min_dimension_m', 3,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): plate viability floor. Default 3, bounds [1, 6]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_lot_min_sqm', 50,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): modelled lot band. Default 50, bounds [10, 500]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_lot_max_sqm', 2000,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): modelled lot band. Default 2000, bounds [500, 10000]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_existing_confidence_min', 0.6,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): "low confidence — enter your dimensions" threshold (P5.6). Default 0.6, bounds [0, 1]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_existing_shared_footprint_penalty', 0.5,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): confidence penalty for a footprint primary-linked to ≥ 2 parcels. Default 0.5, bounds [0, 1]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_batch_size', 500,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): executed batch (R-DE (i)). Default 500, bounds [50, 5000]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_not_evaluated_max_pct', 25,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): WARN bound. Default 25, bounds [0, 100]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_first_floor_elevation_m', 0.6,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): first floor above established grade (P5.2 item 4). Default 0.6, bounds [0, 1.2]. Bound note: capped by `entrance_height_m` where it applies. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_lane_buffer_m', 4,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): boundary-to-lane-centreline tolerance for `lane_abutting_length_m` (M-209; replaces the 5 m KFM-78-9 placeholder). Default 4, bounds [1.5, 6]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_triangle_simplify_tol_m', 0.75,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): ring simplification for the triangular-lot detector (M-212(2)). Default 0.75, bounds [0.1, 2]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_lot_viability_margin_m', 0.5,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): frontage band within which a lot-viability failure is disclosed, not failed (M-207). Default 0.5, bounds [0, 2]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_coxwell_generous_reading', 1,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): M-224 switch: 1 = the generous reading of 150.7.60.30(1)(C), 0 = the literal one. Default 1, bounds [0, 1]. Bound note: (integer). CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).'),
  ('compute_maxbld_scenarios_trust_high_min_pass_pct', 100,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); Spec 78 P5.9): share of a row''s applicable invariants that must pass for `row_trust_level = high` (P5.14). Default 100, bounds [90, 100]. CONSUMED by compute_maxbld_scenarios (the P5.2-P5.14 compute modules, via ctx.config).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key LIKE 'compute_maxbld_scenarios\_%';
