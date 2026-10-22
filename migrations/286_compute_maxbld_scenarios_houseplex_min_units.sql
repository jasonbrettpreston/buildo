-- 286: compute_maxbld_scenarios -- the ruled minimum houseplex unit count, a pinned logic variable (EVE.P3-Q8, operator-ruled).
--
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED; Spec 132 core.8 (R-CV)). Migration 283 seeded the 22 Spec 78 P5.9 variables and is APPLIED
-- (an applied migration is never edited: migrate.js skips a changed checksum and --verify reports DRIFT), so this ONE row is a new migration.
-- Number assigned by the orchestrator: 286 = this variable; the parcel_maxbld_scenarios table migration (uncommitted draft) takes 287.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value. NOT APPLIED here (no DB writes).
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (P5.4, 800.50(181))
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DF EXTERNALIZED; R-DE (v))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('compute_maxbld_scenarios_houseplex_min_units', 2,
   'McDonald''s Airtight V3 (Spec 124 R-DE (v); EVE.P3-Q8, operator-ruled): the minimum dwelling-unit count of a houseplex (800.50(181): a detached houseplex is a building with multiple dwelling units, one above another per (181)(D)); below it the row is not_buildable:800.50(181). Default 2. Pinned min = max = 2: a definitional unit constant, not a tuning knob (R-CV). CONSUMED by compute_maxbld_scenarios (houseplex units, P5.4, via ctx.config).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_houseplex_min_units';
