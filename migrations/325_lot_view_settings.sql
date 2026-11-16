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
  ('lotview_require_convex', 1, NULL, 'MF-83 group 3: 1 = a lot must be convex to be drawn with its edges, 0 = convexity is not tested. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts).'),
  ('lotview_convex_tol', 0.995, NULL, 'MF-83 group 3: the least convexity (lot area / convex hull area) for a lot to count as convex; provisional. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts).'),
  ('lotview_min_rectangularity', 0.8, NULL, 'MF-83 group 3: the least rectangularity (lot area / oriented envelope area) for a lot to be drawn with its edges; provisional. CONSUMED by lotViewState (src/lib/parcels/lot-view-rule.ts).'),
  ('lotview_front_max_angle_deg', 30, NULL, 'MF-83 group 3: the widest angle, in degrees, between an edge and the street for the edge to be the front. CONSUMED by the parcel_lot_view job (pipeline task MB-109).'),
  ('lotview_front_dist_tol_m', 2, NULL, 'MF-83 group 3: the furthest distance, in metres, from the street centreline for an edge to be the front. CONSUMED by the parcel_lot_view job (pipeline task MB-109).'),
  ('lotview_rear_max_angle_deg', 45, NULL, 'MF-83 group 3: the widest angle, in degrees, between an edge and the line opposite the front for the edge to be the rear. CONSUMED by the parcel_lot_view job (pipeline task MB-109).'),
  ('lotview_run_max_turn_deg', 10, NULL, 'MF-83 group 3: the largest turn, in degrees, between two neighbouring edges for them to join one run. CONSUMED by the parcel_lot_view job (pipeline task MB-109).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 307 and 320).
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_require_convex';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_convex_tol';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_min_rectangularity';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_front_max_angle_deg';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_front_dist_tol_m';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_rear_max_angle_deg';
-- DELETE FROM logic_variables WHERE variable_key = 'lotview_run_max_turn_deg';
