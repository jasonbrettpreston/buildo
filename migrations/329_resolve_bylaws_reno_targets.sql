-- 329: resolve_bylaws gains one renovation principal target (MB-27 increment 6, claimed ids/mig-329, renumbered from 318 per REVIEW-OPTIMIZED-RUN-20261116 F-2; operator 2026-11-13 "9 y", item 7 ".85"; operator 2026-11-16 "1 y drop" on PANEL-N2-M158-20261116: N2, the 12.2 m relief frontage, is NOT a Layer 2 cell).
--
-- WIDTH 72 -> 73. One NEW principal Layer 2 target, stored as its own cell (R3-02, no law number in Layer 3):
--     suite_interior_share_pct, after side_setback_street_m (150.10.40.40(1), 45 percent: the share of the dwelling interior floor area that all
--     secondary suites together may take; read by renovation_interior as the suite maximum).
--     The base pairs after it move by one: base pairs 57 -> 58 (principal 1-28, garden_suite 29-44, laneway_suite 45-58), the option slots 59-73 (roof_form
--     59-65 with its threshold at 65, then suite_height 66-73). The night rewrites every lot row (TRUNCATE-RELOAD), so no stored row is decoded against the old
--     positions; both views are re-created with the new positions and each reads only 73-wide rows (a stale 72-wide row is hidden, never decoded; fail closed,
--     the 295 / 315 / 321 form). The three width CHECKs are re-added NOT VALID at 73; the shared code 5 stays refused at base slots 1-58 and the threshold slot 65.
--
-- No row is inserted, deleted or updated by this file. WRITTEN, NOT APPLIED: the increment-6 Layer 2 night (INC6-NIGHT) applies it alone, then the reload, then the
-- VALIDATE statements at the foot. Generated from migration 321 and layer2-scope.json by ~/Buildo-scratch/mcbylaws/inc6/build/seedgen/mk-329.mjs.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3; docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-494, M-483, M-498

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_shared_option_slots;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 73 AND codes <@ ARRAY[0, 1, 2, 3, 4, 5]::smallint[]) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 73) AND (reason_ids IS NULL OR cardinality(reason_ids) = 73) AND (winner_ids IS NULL OR cardinality(winner_ids) = 73) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 73) AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 73)) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_shared_option_slots CHECK (NOT (codes[1:58] @> ARRAY[5]::smallint[]) AND codes[65] <> 5) NOT VALID;

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
 CROSS JOIN (VALUES (1, 'principal', 'attic_counted_clearance_m'), (2, 'principal', 'attic_qualifying_area_m2'), (3, 'principal', 'attic_qualifying_clearance_m'), (4, 'principal', 'attic_qualifying_share_pct'), (5, 'principal', 'averaging_distance_m'), (6, 'principal', 'bedrooms'), (7, 'principal', 'building_depth_m'), (8, 'principal', 'building_length_m'), (9, 'principal', 'dwelling_units_max'), (10, 'principal', 'element_width_pct'), (11, 'principal', 'entrance_height_m'), (12, 'principal', 'front_setback_fallback_m'), (13, 'principal', 'front_setback_m'), (14, 'principal', 'fsi'), (15, 'principal', 'height_m'), (16, 'principal', 'height_storeys'), (17, 'principal', 'lane_centreline_setback_m'), (18, 'principal', 'lot_coverage_pct'), (19, 'principal', 'main_wall_front_rear_share_pct'), (20, 'principal', 'main_wall_height_m'), (21, 'principal', 'main_wall_side_share_pct'), (22, 'principal', 'principal_coverage_path_b_pct'), (23, 'principal', 'rear_setback_m'), (24, 'principal', 'roof_slope_max'), (25, 'principal', 'side_setback_m'), (26, 'principal', 'side_setback_street_m'), (27, 'principal', 'suite_interior_share_pct'), (28, 'principal', 'upper_storey_setback_m'), (29, 'garden_suite', 'ancillary_coverage_pct'), (30, 'garden_suite', 'building_length_m'), (31, 'garden_suite', 'building_width_m'), (32, 'garden_suite', 'gfa_m2'), (33, 'garden_suite', 'height_m'), (34, 'garden_suite', 'interior_floor_area_m2'), (35, 'garden_suite', 'lane_centreline_setback_m'), (36, 'garden_suite', 'lot_coverage_pct'), (37, 'garden_suite', 'rear_setback_m'), (38, 'garden_suite', 'rear_setback_through_floor_m'), (39, 'garden_suite', 'rear_soft_landscaping_pct'), (40, 'garden_suite', 'separation_m'), (41, 'garden_suite', 'side_setback_m'), (42, 'garden_suite', 'side_setback_street_floor_m'), (43, 'garden_suite', 'side_setback_street_m'), (44, 'garden_suite', 'upper_side_setback_m'), (45, 'laneway_suite', 'ancillary_coverage_pct'), (46, 'laneway_suite', 'building_length_m'), (47, 'laneway_suite', 'building_width_m'), (48, 'laneway_suite', 'gfa_m2'), (49, 'laneway_suite', 'height_m'), (50, 'laneway_suite', 'interior_floor_area_m2'), (51, 'laneway_suite', 'lane_centreline_setback_m'), (52, 'laneway_suite', 'lot_coverage_pct'), (53, 'laneway_suite', 'rear_setback_m'), (54, 'laneway_suite', 'rear_soft_landscaping_pct'), (55, 'laneway_suite', 'separation_m'), (56, 'laneway_suite', 'side_setback_m'), (57, 'laneway_suite', 'side_setback_street_m'), (58, 'laneway_suite', 'upper_side_setback_m')) AS p (i, structure, target)
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
 WHERE cardinality(l.codes) = 73;

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
 CROSS JOIN (VALUES (59, 'principal', 'height_m', 'flat_or_shallow_roof', 15), (60, 'principal', 'height_m', 'pitched', 15), (61, 'principal', 'main_wall_height_m', 'flat_or_shallow_roof', 20), (62, 'principal', 'main_wall_height_m', 'pitched', 20), (63, 'principal', 'upper_storey_setback_m', 'flat_or_shallow_roof', 28), (64, 'principal', 'upper_storey_setback_m', 'pitched', 28), (65, 'principal', 'pitched_roof_slope_min', NULL, NULL), (66, 'garden_suite', 'gfa_m2', 'suite_low', 32), (67, 'garden_suite', 'gfa_m2', 'suite_tall', 32), (68, 'garden_suite', 'height_m', 'suite_low', 33), (69, 'garden_suite', 'height_m', 'suite_tall', 33), (70, 'garden_suite', 'rear_setback_m', 'suite_low', 37), (71, 'garden_suite', 'rear_setback_m', 'suite_tall', 37), (72, 'garden_suite', 'separation_m', 'suite_low', 40), (73, 'garden_suite', 'separation_m', 'suite_tall', 40)) AS p (i, structure, target, option, base_i)
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
 WHERE cardinality(l.codes) = 73;

COMMENT ON VIEW bylaw_resolution_results IS 'Spec 134 resolve_bylaws: the 58 base (structure, target) pairs decoded, one row per lot x class x pair, in layer2-scope.json order (329: one principal target, suite_interior_share_pct after side_setback_street_m, MB-27 increment 6)(B) through-lot floor, joins after rear_setback_m, and side_setback_street_floor_m, the 150.7.60.20(6)(C) corner floor, after side_setback_m; MB-27 increment 5 P2 a / P1 b). A class other than the representative reads its own stored override where one exists. 72-wide rows only.';
COMMENT ON VIEW bylaw_resolution_option_results IS 'Spec 134 resolve_bylaws (M-465, M-400; 297, 304, 315, 321, 329): the design-option slots decoded, one row per lot x listed class x option slot (detached_house, detached_houseplex, house_with_secondary_suite): the roof form (flat_or_shallow_roof | pitched) for height_m, main_wall_height_m and upper_storey_setback_m with the threshold pitched_roof_slope_min (option NULL), and the garden suite height (suite_low | suite_tall) for the garden_suite gfa_m2, height_m, rear_setback_m and separation_m (315, MB-27 increment 5 item 1). A class other than the first listed reads its own stored override at a slot where one exists, else the shared representative cell. shared_with_base: the slot holds the closed code shared and reads its base pair. Listed classes only (RC-1, DL-7 a).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT honour
-- -- UP / -- DOWN markers; see tasks/lessons.md). The night's down-step is the whole-database restore from its pre-329 dump (329 is applied alone), not this text.
-- ============================================================================
-- then re-create the three CHECKs at 72 (migration 321) and the two views as written in migration 321.
--
-- AFTER THE LAYER 2 RELOAD (run by the night, not by this file):
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_codes_closed;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_array_width;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_shared_option_slots;
