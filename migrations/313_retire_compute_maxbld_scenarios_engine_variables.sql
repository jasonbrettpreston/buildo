-- 313: retire the 22 logic variables of the superseded compute_maxbld_scenarios engine (MB-31 ledger L31-10, MB-31 plan section 12:
-- "deleted by MB-35 with a dump"). Migrations 283 (21 keys) and 286 (1 key) inserted them for the old engine (Spec 78 P5.9); the Layer 3
-- rebuild reads none of them, and the step's descriptor lists exactly these 22 names in config.retired (R-A). While a row lives, every
-- run reports retired_var_row_present (a WARN), and an operator can edit a knob that changes nothing (MB-35 attempt 4 b5 STOP,
-- 2026-11-12). The operator's principle: retired values must not linger.
--
-- Guarded by name: exactly the 22 keys of config.retired, listed here (no LIKE): compute_maxbld_scenarios_batch_size (also from 283) is
-- live and is NOT deleted. No seed entry exists for any of them (scripts/seeds/logic_variables.json), so nothing re-inserts them.
-- WRITTEN, NOT APPLIED: the MB-35 night applies it after 311 (--only=313 --dry-run first), after its dump of logic_variables.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (MB-31 L31-10)
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-A: a retired variable's row is deleted, then the retirement reads INFO)

-- UP
-- ALLOW-DESTRUCTIVE: deletes the 22 retired logic_variables rows named below (rows only; values restorable from the night's dump)
DELETE FROM logic_variables WHERE variable_key IN (
  'compute_maxbld_scenarios_basement_livable_share',
  'compute_maxbld_scenarios_circulation_share',
  'compute_maxbld_scenarios_coxwell_generous_reading',
  'compute_maxbld_scenarios_depth_search_step_m',
  'compute_maxbld_scenarios_existing_confidence_min',
  'compute_maxbld_scenarios_existing_shared_footprint_penalty',
  'compute_maxbld_scenarios_first_floor_elevation_m',
  'compute_maxbld_scenarios_houseplex_min_units',
  'compute_maxbld_scenarios_lane_buffer_m',
  'compute_maxbld_scenarios_lot_max_sqm',
  'compute_maxbld_scenarios_lot_min_sqm',
  'compute_maxbld_scenarios_lot_viability_margin_m',
  'compute_maxbld_scenarios_min_dimension_m',
  'compute_maxbld_scenarios_not_evaluated_max_pct',
  'compute_maxbld_scenarios_roof_assembly_depth_m',
  'compute_maxbld_scenarios_roof_pitch',
  'compute_maxbld_scenarios_storey_height_m',
  'compute_maxbld_scenarios_suite_gfa_strict_margin_sqm',
  'compute_maxbld_scenarios_suite_weight',
  'compute_maxbld_scenarios_triangle_simplify_tol_m',
  'compute_maxbld_scenarios_trust_high_min_pass_pct',
  'compute_maxbld_scenarios_unit_min_interior_sqm'
);

-- DOWN -- manual rollback only (lessons.md: migrate.js executes every uncommented line): restore the 22 rows from the night's
-- pg_dump of logic_variables (MB-35 b1), or re-apply 283 and 286 (both ON CONFLICT DO NOTHING).
