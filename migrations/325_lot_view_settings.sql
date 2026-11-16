-- 325: the seven lot-view settings (MF-83 group 3, plan-group3.md D-G3-3; operator "Accepted" and "All reco's accepted 1- 4", 2026-11-15).
-- Mirrors scripts/seeds/logic_variables.json entry for entry (group "Parcel Lookup"; the seed is the test truth). Idempotent:
-- ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value. Settings only: the table parcel_lot_view and its job are the pipeline task MB-109's.
-- WRITTEN, NOT APPLIED here: the operator applies it (DB job). Until it is applied the lot-view read (src/lib/parcels/lot-view.ts) finds the table absent
-- (SQLSTATE 42P01) or the settings missing and answers "no lot view" (the panel is left out); nothing else is affected.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (FE-42)
-- SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md rule 3

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('lotview_require_convex', 1, NULL, 'MF-83 group 3 (plan-group3.md D-G3-3, operator "Accepted" 2026-11-15; LOT-VIEWS-RULE.md eligibility): 1 = a lot must be convex (convexity at or above lotview_convex_tol) to be drawn with its edges, 0 = convexity is not tested. Whole number 0 or 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts), read through readLotViewSettings (src/lib/parcels/lot-view.ts); a missing or out-of-bounds value leaves the lot view out.'),
  ('lotview_convex_tol', 0.995, NULL, 'MF-83 group 3 (D-G3-3; D-7 provisional, locked only after data-check items 3 to 5 and the RA look): the least convexity (lot area divided by convex hull area, stored in parcel_lot_view) for a lot to count as convex. Starting value 0.995. Bounds 0.5 to 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts) when lotview_require_convex is 1.'),
  ('lotview_min_rectangularity', 0.8, NULL, 'MF-83 group 3 (D-G3-3; D-7 provisional, locked only after data-check items 3 to 5 and the RA look): the least rectangularity (lot area divided by the oriented envelope area, stored in parcel_lot_view) for a lot to be drawn with its edges. Starting value 0.80. is_irregular for images keeps its own 0.95. Bounds 0.5 to 1. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts).'),
  ('lotview_front_max_angle_deg', 30, NULL, 'MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the widest angle, in degrees, between an edge and the street for the edge to be the front. Starting value 30. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109), which classifies the edges and stores them; changing it needs a re-run of that job.'),
  ('lotview_front_dist_tol_m', 2, NULL, 'MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the furthest distance, in metres, from the street centreline for an edge to be the front. Starting value 2. Bounds 0 to 10. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.'),
  ('lotview_rear_max_angle_deg', 45, NULL, 'MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the widest angle, in degrees, between an edge and the line opposite the front for the edge to be the rear. Starting value 45. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.'),
  ('lotview_run_max_turn_deg', 10, NULL, 'MF-83 group 3 (D-G3-3; LOT-VIEWS-RULE.md edge classes): the largest turn, in degrees, between two neighbouring edges for them to join one run. Starting value 10. Bounds 0 to 90. CONSUMED by the parcel_lot_view job (the pipeline task MB-109); changing it needs a re-run of that job.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 307 and 320).
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_require_convex';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_convex_tol';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_min_rectangularity';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_front_max_angle_deg';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_front_dist_tol_m';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_rear_max_angle_deg';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_run_max_turn_deg';
