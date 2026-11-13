-- 315: resolve_bylaws gains the garden suite's height design option and the house's path-(B) coverage target (MB-27 increment 5), and
-- the table takes the TOAST setting of McStorage ST-1.
--
-- (1) WIDTH 61 -> 70 (operator 2026-11-12: item 1 D-1 a "a was for the fitted house 1a for the two heights"; build Q3 a as ruled "B5A-1 c").
--     Base pairs 54 -> 55: the principal target principal_coverage_path_b_pct (150.7.60.70(1)(B)(i)/(ii), the house's cap under coverage
--     path (B) beside a garden suite; AR-1 R1) joins layer2-scope.json in its sorted place (M-234 "join by a pin change"; CHAT-80.QP the array
--     order is the scope's file order), so the base pairs after it move by one: principal 1-27, garden_suite 28-41, laneway_suite 42-55. The
--     night rewrites every lot row (TRUNCATE-RELOAD), so no stored row is decoded against the old positions; both views are re-created here
--     with the new positions, and each reads only 70-wide rows (a stale 61-wide row is hidden, never decoded; fail closed, the 295 form).
--     Option slots 56-70: roof_form as in 295 (now 56-62), then suite_height (vocab.design_options.suite_height, token
--     suite_height_over_4m; suite_low then suite_tall) on the garden_suite gfa_m2, height_m, rear_setback_m and separation_m, with no threshold
--     pair; stored for the classes detached_house, detached_houseplex, house_with_secondary_suite (the 297 / 304 form: a class other than the first reads its own override where stored).
--     The width CHECKs are re-added NOT VALID at 70; the shared code 5 stays refused at the base slots 1-55 and the threshold slot 62.
-- (2) ST-1 / ST-2 (McStorage rulings 2026-11-12, "ST- all y"): toast_tuple_target = 1624 on bylaw_resolution_lots (a third zero-data-change
--     reserve on M-483; physical bytes only, no stored value, row_sha, stamp or view output moves). It acts on rows written after it.
--
-- No row is inserted, deleted or updated by this file. WRITTEN, NOT APPLIED: the increment-5 Layer 2 night (INC5-NIGHT) applies it alone
-- first (--only=315 --dry-run first), then the reload, then the VALIDATE statements at the foot of this file.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3; docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-494, M-483, M-498

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_shared_option_slots;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 70 AND codes <@ ARRAY[0, 1, 2, 3, 4, 5]::smallint[]) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 70) AND (reason_ids IS NULL OR cardinality(reason_ids) = 70) AND (winner_ids IS NULL OR cardinality(winner_ids) = 70) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 70) AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 70)) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_shared_option_slots CHECK (NOT (codes[1:55] @> ARRAY[5]::smallint[]) AND codes[62] <> 5) NOT VALID;
ALTER TABLE bylaw_resolution_lots SET (toast_tuple_target = 1624);

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
 CROSS JOIN (VALUES (1, 'principal', 'attic_counted_clearance_m'), (2, 'principal', 'attic_qualifying_area_m2'), (3, 'principal', 'attic_qualifying_clearance_m'), (4, 'principal', 'attic_qualifying_share_pct'), (5, 'principal', 'averaging_distance_m'), (6, 'principal', 'bedrooms'), (7, 'principal', 'building_depth_m'), (8, 'principal', 'building_length_m'), (9, 'principal', 'dwelling_units_max'), (10, 'principal', 'element_width_pct'), (11, 'principal', 'entrance_height_m'), (12, 'principal', 'front_setback_fallback_m'), (13, 'principal', 'front_setback_m'), (14, 'principal', 'fsi'), (15, 'principal', 'height_m'), (16, 'principal', 'height_storeys'), (17, 'principal', 'lane_centreline_setback_m'), (18, 'principal', 'lot_coverage_pct'), (19, 'principal', 'main_wall_front_rear_share_pct'), (20, 'principal', 'main_wall_height_m'), (21, 'principal', 'main_wall_side_share_pct'), (22, 'principal', 'principal_coverage_path_b_pct'), (23, 'principal', 'rear_setback_m'), (24, 'principal', 'roof_slope_max'), (25, 'principal', 'side_setback_m'), (26, 'principal', 'side_setback_street_m'), (27, 'principal', 'upper_storey_setback_m'), (28, 'garden_suite', 'ancillary_coverage_pct'), (29, 'garden_suite', 'building_length_m'), (30, 'garden_suite', 'building_width_m'), (31, 'garden_suite', 'gfa_m2'), (32, 'garden_suite', 'height_m'), (33, 'garden_suite', 'interior_floor_area_m2'), (34, 'garden_suite', 'lane_centreline_setback_m'), (35, 'garden_suite', 'lot_coverage_pct'), (36, 'garden_suite', 'rear_setback_m'), (37, 'garden_suite', 'rear_soft_landscaping_pct'), (38, 'garden_suite', 'separation_m'), (39, 'garden_suite', 'side_setback_m'), (40, 'garden_suite', 'side_setback_street_m'), (41, 'garden_suite', 'upper_side_setback_m'), (42, 'laneway_suite', 'ancillary_coverage_pct'), (43, 'laneway_suite', 'building_length_m'), (44, 'laneway_suite', 'building_width_m'), (45, 'laneway_suite', 'gfa_m2'), (46, 'laneway_suite', 'height_m'), (47, 'laneway_suite', 'interior_floor_area_m2'), (48, 'laneway_suite', 'lane_centreline_setback_m'), (49, 'laneway_suite', 'lot_coverage_pct'), (50, 'laneway_suite', 'rear_setback_m'), (51, 'laneway_suite', 'rear_soft_landscaping_pct'), (52, 'laneway_suite', 'separation_m'), (53, 'laneway_suite', 'side_setback_m'), (54, 'laneway_suite', 'side_setback_street_m'), (55, 'laneway_suite', 'upper_side_setback_m')) AS p (i, structure, target)
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
 WHERE cardinality(l.codes) = 70;

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
 CROSS JOIN (VALUES (56, 'principal', 'height_m', 'flat_or_shallow_roof', 15), (57, 'principal', 'height_m', 'pitched', 15), (58, 'principal', 'main_wall_height_m', 'flat_or_shallow_roof', 20), (59, 'principal', 'main_wall_height_m', 'pitched', 20), (60, 'principal', 'upper_storey_setback_m', 'flat_or_shallow_roof', 27), (61, 'principal', 'upper_storey_setback_m', 'pitched', 27), (62, 'principal', 'pitched_roof_slope_min', NULL, NULL), (63, 'garden_suite', 'gfa_m2', 'suite_low', 31), (64, 'garden_suite', 'gfa_m2', 'suite_tall', 31), (65, 'garden_suite', 'height_m', 'suite_low', 32), (66, 'garden_suite', 'height_m', 'suite_tall', 32), (67, 'garden_suite', 'rear_setback_m', 'suite_low', 36), (68, 'garden_suite', 'rear_setback_m', 'suite_tall', 36), (69, 'garden_suite', 'separation_m', 'suite_low', 38), (70, 'garden_suite', 'separation_m', 'suite_tall', 38)) AS p (i, structure, target, option, base_i)
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
 WHERE cardinality(l.codes) = 70;

COMMENT ON VIEW bylaw_resolution_results IS 'Spec 134 resolve_bylaws: the 55 base (structure, target) pairs decoded, one row per lot x class x pair, in layer2-scope.json order (315: principal_coverage_path_b_pct joins the principal pairs, MB-27 increment 5 Q3 a / B5A-1 c). A class other than the representative reads its own stored override where one exists. 70-wide rows only.';
COMMENT ON VIEW bylaw_resolution_option_results IS 'Spec 134 resolve_bylaws (M-465, M-400; 297, 304, 315): the design-option slots decoded, one row per lot x listed class x option slot (detached_house, detached_houseplex, house_with_secondary_suite): the roof form (flat_or_shallow_roof | pitched) for height_m, main_wall_height_m and upper_storey_setback_m with the threshold pitched_roof_slope_min (option NULL), and the garden suite height (suite_low | suite_tall) for the garden_suite gfa_m2, height_m, rear_setback_m and separation_m (315, MB-27 increment 5 item 1). A class other than the first listed reads its own stored override at a slot where one exists, else the shared representative cell. shared_with_base: the slot holds the closed code shared and reads its base pair. Listed classes only (RC-1, DL-7 a).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT honour
-- -- UP / -- DOWN markers; see tasks/lessons.md). The night's down-step is the whole-database restore from its pre-315 dump, not this text.
-- ============================================================================
-- ALTER TABLE bylaw_resolution_lots RESET (toast_tuple_target);
-- then re-create the three CHECKs at 61 (migration 295) and the two views as written in migrations 295 and 304.
--
-- AFTER THE LAYER 2 RELOAD (run by the night, not by this file):
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_codes_closed;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_array_width;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_shared_option_slots;
