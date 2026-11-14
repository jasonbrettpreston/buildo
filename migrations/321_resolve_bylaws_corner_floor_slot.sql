-- 321: resolve_bylaws gains two garden suite floor targets (MB-27 increment 5 Part B, lanes B5B-4 / B5B-5, P1 (b) and P2 (a)).
--
-- WIDTH 70 -> 72 (operator 2026-11-13 evening, "approved as long as they are compliant ... The corner-floor keying question:
--     recommended (i), the by-law table stores the 1.5 m floor", and ~19:50 P1 (b), P2 (a): each floor is a NEW Layer 2 target in a NEW
--     migration; migration 315 is not edited). Layer 2 stores each clause floor as its own cell; Layer 3 takes the larger-of with the value it
--     alone can compute (M-198; no law number in Layer 3, R3-02). Two garden_suite targets join layer2-scope.json in their sorted places:
--     (1) rear_setback_through_floor_m, after rear_setback_m (150.7.60.20(3)(B), 1.5 m, stored by the generated unit
--         150.7.60.20(3)#floor(3)(B); on a through lot Layer 3 takes max(the lot's own front setback, this floor), the (3)(A) cell staying
--         not_evaluated for the missing abutting front setback; P2 a);
--     (2) side_setback_street_floor_m, after side_setback_m (150.7.60.20(6)(C), 1.5 m; on a corner lot Layer 3 takes the larger of the
--         house's street-side yard and this floor; P1 b).
--     The base pairs after each move by one: base pairs 55 -> 57 (principal 1-27, garden_suite 28-43, laneway_suite 44-57), the option slots
--     58-72 (roof_form 58-64 with its threshold at 64, then suite_height 65-72). The night rewrites every lot row (TRUNCATE-RELOAD), so no
--     stored row is decoded against the old positions; both views are re-created here with the new positions and each reads only 72-wide
--     rows (a stale 70-wide row is hidden, never decoded; fail closed, the 295 / 315 form). The width CHECKs are re-added NOT VALID at 72;
--     the shared code 5 stays refused at the base slots 1-57 and the threshold slot 64.
--
-- No row is inserted, deleted or updated by this file. WRITTEN, NOT APPLIED: the increment-5 Layer 2 night applies it with 315 (in order,
-- --only=315,321 --dry-run first), then the reload, then the VALIDATE statements at the foot of this file. The G-STOR dry run
-- (docs/reports/storage-gates/MB-27L2-G-STOR.json) is re-bound to the final tree's table_version by the D-81 re-run (one more slot).
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3; docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-494, M-483, M-498

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_shared_option_slots;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 72 AND codes <@ ARRAY[0, 1, 2, 3, 4, 5]::smallint[]) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 72) AND (reason_ids IS NULL OR cardinality(reason_ids) = 72) AND (winner_ids IS NULL OR cardinality(winner_ids) = 72) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 72) AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 72)) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_shared_option_slots CHECK (NOT (codes[1:57] @> ARRAY[5]::smallint[]) AND codes[64] <> 5) NOT VALID;

CREATE OR REPLACE VIEW bylaw_resolution_results AS
SELECT l.parcel_id, l.lot_gate, c.class, p.structure, p.target,
       CASE r.code WHEN 0 THEN 'applies' WHEN 1 THEN 'applies' WHEN 2 THEN 'applies' WHEN 3 THEN 'not_applicable' WHEN 4 THEN 'not_evaluated' END AS status,
       CASE r.code WHEN 0 THEN 'number' WHEN 1 THEN 'unlimited' WHEN 2 THEN 'unregulated' END AS value_kind,
       r.num AS value,
       tr.text AS reason,
       u.unit_id AS winner_unit_id,
       u.layer AS winner_layer,
       CASE r.ek WHEN 0 THEN 'clause' WHEN 1 THEN 'absence' WHEN 2 THEN 'provincial' WHEN 3 THEN 'disapply' WHEN 4 THEN 'label_absent' END AS evidence_kind,
       tf.text AS evidence_ref
  FROM bylaw_resolution_lots l
 CROSS JOIN (VALUES (1, 'principal', 'attic_counted_clearance_m'), (2, 'principal', 'attic_qualifying_area_m2'), (3, 'principal', 'attic_qualifying_clearance_m'), (4, 'principal', 'attic_qualifying_share_pct'), (5, 'principal', 'averaging_distance_m'), (6, 'principal', 'bedrooms'), (7, 'principal', 'building_depth_m'), (8, 'principal', 'building_length_m'), (9, 'principal', 'dwelling_units_max'), (10, 'principal', 'element_width_pct'), (11, 'principal', 'entrance_height_m'), (12, 'principal', 'front_setback_fallback_m'), (13, 'principal', 'front_setback_m'), (14, 'principal', 'fsi'), (15, 'principal', 'height_m'), (16, 'principal', 'height_storeys'), (17, 'principal', 'lane_centreline_setback_m'), (18, 'principal', 'lot_coverage_pct'), (19, 'principal', 'main_wall_front_rear_share_pct'), (20, 'principal', 'main_wall_height_m'), (21, 'principal', 'main_wall_side_share_pct'), (22, 'principal', 'principal_coverage_path_b_pct'), (23, 'principal', 'rear_setback_m'), (24, 'principal', 'roof_slope_max'), (25, 'principal', 'side_setback_m'), (26, 'principal', 'side_setback_street_m'), (27, 'principal', 'upper_storey_setback_m'), (28, 'garden_suite', 'ancillary_coverage_pct'), (29, 'garden_suite', 'building_length_m'), (30, 'garden_suite', 'building_width_m'), (31, 'garden_suite', 'gfa_m2'), (32, 'garden_suite', 'height_m'), (33, 'garden_suite', 'interior_floor_area_m2'), (34, 'garden_suite', 'lane_centreline_setback_m'), (35, 'garden_suite', 'lot_coverage_pct'), (36, 'garden_suite', 'rear_setback_m'), (37, 'garden_suite', 'rear_setback_through_floor_m'), (38, 'garden_suite', 'rear_soft_landscaping_pct'), (39, 'garden_suite', 'separation_m'), (40, 'garden_suite', 'side_setback_m'), (41, 'garden_suite', 'side_setback_street_floor_m'), (42, 'garden_suite', 'side_setback_street_m'), (43, 'garden_suite', 'upper_side_setback_m'), (44, 'laneway_suite', 'ancillary_coverage_pct'), (45, 'laneway_suite', 'building_length_m'), (46, 'laneway_suite', 'building_width_m'), (47, 'laneway_suite', 'gfa_m2'), (48, 'laneway_suite', 'height_m'), (49, 'laneway_suite', 'interior_floor_area_m2'), (50, 'laneway_suite', 'lane_centreline_setback_m'), (51, 'laneway_suite', 'lot_coverage_pct'), (52, 'laneway_suite', 'rear_setback_m'), (53, 'laneway_suite', 'rear_soft_landscaping_pct'), (54, 'laneway_suite', 'separation_m'), (55, 'laneway_suite', 'side_setback_m'), (56, 'laneway_suite', 'side_setback_street_m'), (57, 'laneway_suite', 'upper_side_setback_m')) AS p (i, structure, target)
 CROSS JOIN (VALUES ('detached_house'), ('detached_houseplex'), ('semi_detached_houseplex'), ('semi_detached_house'), ('house_with_secondary_suite')) AS c (class)
 CROSS JOIN LATERAL (SELECT l.class_results -> c.class -> (p.i - 1)::text AS o) ov
 CROSS JOIN LATERAL (SELECT
         CASE WHEN ov.o IS NULL THEN l.codes[p.i] ELSE (ov.o ->> 0)::smallint END AS code,
         CASE WHEN ov.o IS NULL THEN l.numbers[p.i] ELSE (ov.o ->> 1)::double precision END AS num,
         CASE WHEN ov.o IS NULL THEN l.reason_ids[p.i] ELSE (ov.o ->> 2)::integer END AS rid,
         CASE WHEN ov.o IS NULL THEN l.winner_ids[p.i] ELSE (ov.o ->> 3)::integer END AS wid,
         CASE WHEN ov.o IS NULL THEN l.evidence_kinds[p.i] ELSE (ov.o ->> 4)::smallint END AS ek,
         CASE WHEN ov.o IS NULL THEN l.evidence_ref_ids[p.i] ELSE (ov.o ->> 5)::integer END AS ref) r
  LEFT JOIN bylaw_resolution_units u ON u.unit_key = r.wid
  LEFT JOIN bylaw_resolution_texts tr ON tr.text_key = r.rid
  LEFT JOIN bylaw_resolution_texts tf ON tf.text_key = r.ref
 WHERE cardinality(l.codes) = 72;

CREATE OR REPLACE VIEW bylaw_resolution_option_results AS
SELECT l.parcel_id, l.lot_gate, c.class, p.structure, p.target, p.option,
       CASE r.code WHEN 0 THEN 'applies' WHEN 1 THEN 'applies' WHEN 2 THEN 'applies' WHEN 3 THEN 'not_applicable' WHEN 4 THEN 'not_evaluated' END AS status,
       CASE r.code WHEN 0 THEN 'number' WHEN 1 THEN 'unlimited' WHEN 2 THEN 'unregulated' END AS value_kind,
       r.num AS value,
       tr.text AS reason,
       u.unit_id AS winner_unit_id,
       u.layer AS winner_layer,
       CASE r.ek WHEN 0 THEN 'clause' WHEN 1 THEN 'absence' WHEN 2 THEN 'provincial' WHEN 3 THEN 'disapply' WHEN 4 THEN 'label_absent' END AS evidence_kind,
       tf.text AS evidence_ref,
       r.shared AS shared_with_base
  FROM bylaw_resolution_lots l
 CROSS JOIN (VALUES (58, 'principal', 'height_m', 'flat_or_shallow_roof', 15), (59, 'principal', 'height_m', 'pitched', 15), (60, 'principal', 'main_wall_height_m', 'flat_or_shallow_roof', 20), (61, 'principal', 'main_wall_height_m', 'pitched', 20), (62, 'principal', 'upper_storey_setback_m', 'flat_or_shallow_roof', 27), (63, 'principal', 'upper_storey_setback_m', 'pitched', 27), (64, 'principal', 'pitched_roof_slope_min', NULL, NULL), (65, 'garden_suite', 'gfa_m2', 'suite_low', 31), (66, 'garden_suite', 'gfa_m2', 'suite_tall', 31), (67, 'garden_suite', 'height_m', 'suite_low', 32), (68, 'garden_suite', 'height_m', 'suite_tall', 32), (69, 'garden_suite', 'rear_setback_m', 'suite_low', 36), (70, 'garden_suite', 'rear_setback_m', 'suite_tall', 36), (71, 'garden_suite', 'separation_m', 'suite_low', 39), (72, 'garden_suite', 'separation_m', 'suite_tall', 39)) AS p (i, structure, target, option, base_i)
 CROSS JOIN (VALUES ('detached_house'), ('detached_houseplex'), ('house_with_secondary_suite')) AS c (class)
 CROSS JOIN LATERAL (SELECT l.class_results -> c.class -> (p.i - 1)::text AS o) ov
 CROSS JOIN LATERAL (SELECT ov.o IS NULL AND l.codes[p.i] = 5 AS shared) s
 CROSS JOIN LATERAL (SELECT
         s.shared,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 0)::smallint WHEN s.shared THEN l.codes[p.base_i] ELSE l.codes[p.i] END AS code,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 1)::double precision WHEN s.shared THEN l.numbers[p.base_i] ELSE l.numbers[p.i] END AS num,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 2)::integer WHEN s.shared THEN l.reason_ids[p.base_i] ELSE l.reason_ids[p.i] END AS rid,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 3)::integer WHEN s.shared THEN l.winner_ids[p.base_i] ELSE l.winner_ids[p.i] END AS wid,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 4)::smallint WHEN s.shared THEN l.evidence_kinds[p.base_i] ELSE l.evidence_kinds[p.i] END AS ek,
         CASE WHEN ov.o IS NOT NULL THEN (ov.o ->> 5)::integer WHEN s.shared THEN l.evidence_ref_ids[p.base_i] ELSE l.evidence_ref_ids[p.i] END AS ref) r
  LEFT JOIN bylaw_resolution_units u ON u.unit_key = r.wid
  LEFT JOIN bylaw_resolution_texts tr ON tr.text_key = r.rid
  LEFT JOIN bylaw_resolution_texts tf ON tf.text_key = r.ref
 WHERE cardinality(l.codes) = 72;

COMMENT ON VIEW bylaw_resolution_results IS 'Spec 134 resolve_bylaws: the 57 base (structure, target) pairs decoded, one row per lot x class x pair, in layer2-scope.json order (321: the garden_suite rear_setback_through_floor_m, the 150.7.60.20(3)(B) through-lot floor, joins after rear_setback_m, and side_setback_street_floor_m, the 150.7.60.20(6)(C) corner floor, after side_setback_m; MB-27 increment 5 P2 a / P1 b). A class other than the representative reads its own stored override where one exists. 72-wide rows only.';
COMMENT ON VIEW bylaw_resolution_option_results IS 'Spec 134 resolve_bylaws (M-465, M-400; 297, 304, 315, 321): the design-option slots decoded, one row per lot x listed class x option slot (detached_house, detached_houseplex, house_with_secondary_suite): the roof form (flat_or_shallow_roof | pitched) for height_m, main_wall_height_m and upper_storey_setback_m with the threshold pitched_roof_slope_min (option NULL), and the garden suite height (suite_low | suite_tall) for the garden_suite gfa_m2, height_m, rear_setback_m and separation_m (315, MB-27 increment 5 item 1). A class other than the first listed reads its own stored override at a slot where one exists, else the shared representative cell. shared_with_base: the slot holds the closed code shared and reads its base pair. Listed classes only (RC-1, DL-7 a).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT honour
-- -- UP / -- DOWN markers; see tasks/lessons.md). The night's down-step is the whole-database restore from its pre-315 dump (315 and 321 are applied together), not this text.
-- ============================================================================
-- then re-create the three CHECKs at 61 (migration 295) and the two views as written in migrations 295 and 304.
--
-- AFTER THE LAYER 2 RELOAD (run by the night, not by this file):
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_codes_closed;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_array_width;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_shared_option_slots;
