-- 311: the MB-35 cohort of compute_maxbld_scenarios (operator "a yes" 2026-11-11, cohort (A)): every lot of the City neighbourhood
-- Fenside-Parkwoods (City neighbourhood id 150) that carries a Layer 2 stamp, as data in parcel_maxbld_population (migration 309). The
-- golden 25 stay in the step's setting compute_maxbld_scenarios_population_parcel_ids (D-3 a); one golden lot lies in this
-- neighbourhood, so the population is about 1,921 lots (measured read-only 2026-11-11: 1,897 stamped lots + 24 golden lots outside).
-- Only stamped lots are inserted, so no cohort id can halt the run for a missing stamp. Idempotent (ON CONFLICT DO NOTHING).
-- WRITTEN, NOT APPLIED: the MB-35 night applies it after 309 (--only=311 --dry-run first), after the increment-4 Layer 2 night.
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md (Phase-5 step identity)

-- UP
INSERT INTO parcel_maxbld_population (parcel_id, cohort)
SELECT l.parcel_id, 'mb35_preview_fenside_parkwoods'
  FROM bylaw_resolution_lot_stamps l
  JOIN parcels p ON p.id = l.parcel_id
  JOIN neighbourhoods n ON n.id = p.neighbourhood_id
 WHERE n.neighbourhood_id = 150
ON CONFLICT (parcel_id) DO NOTHING;

-- DOWN — manual rollback only.
-- DELETE FROM parcel_maxbld_population WHERE cohort = 'mb35_preview_fenside_parkwoods';
