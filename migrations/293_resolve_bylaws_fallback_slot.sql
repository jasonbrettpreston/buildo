-- 293: resolve_bylaws gains one (structure, target) slot: principal front_setback_fallback_m (MB-18 item j, Spec 134 section 3 and 6).
--
-- The zone x.40.70(1) front yard setback is stored with its clause on every lot, so the front-yard chain's last step reads a stored value
-- (queue MB-18 (j); Spec 69a M-245: "If regulation 10.5.40.70(1) does not apply" the zone value is the fallback; MB54-Q: neighbour data stays
-- undecided in Layer 2). layer2-scope.json principal goes from 25 to 26 targets, so the positional arrays go from 53 to 54 slots: the new
-- target sorts at position 12 and the old positions 12..53 move up by one.
--
-- WHAT THIS CHANGES: the two width CHECKs of bylaw_resolution_lots (53 to 54) and the view's pair list (CREATE OR REPLACE VIEW).
--   The CHECKs are re-added NOT VALID: they are enforced on every row written from now on, and the 53-wide rows already stored are not
--   scanned. Those old rows are positionally misaligned for the view until the Layer 2 night rewrites every lot row (TRUNCATE-RELOAD,
--   MB-18 plan 8.1; MB-26 runbook S5). After the reload the night runs the two VALIDATE statements at the foot of this file.
--   The view returns only rows that are 54 wide (WHERE cardinality(l.codes) = 54): until the reload a stale 53-wide row is invisible to it
--   instead of being decoded against the wrong positions (fail closed). The step's producer emits 54 slots from the j commit on.
--   No data is moved by this migration. Idempotent: DROP ... IF EXISTS, then ADD; the view is replaced.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3, section 6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-245

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 54 AND codes <@ ARRAY[0, 1, 2, 3, 4]::smallint[]) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 54) AND (reason_ids IS NULL OR cardinality(reason_ids) = 54)
    AND (winner_ids IS NULL OR cardinality(winner_ids) = 54) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 54)
    AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 54)) NOT VALID;

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
 CROSS JOIN (VALUES (1, 'principal', 'attic_counted_clearance_m'), (2, 'principal', 'attic_qualifying_area_m2'), (3, 'principal', 'attic_qualifying_clearance_m'), (4, 'principal', 'attic_qualifying_share_pct'), (5, 'principal', 'averaging_distance_m'), (6, 'principal', 'bedrooms'), (7, 'principal', 'building_depth_m'), (8, 'principal', 'building_length_m'), (9, 'principal', 'dwelling_units_max'), (10, 'principal', 'element_width_pct'), (11, 'principal', 'entrance_height_m'), (12, 'principal', 'front_setback_fallback_m'), (13, 'principal', 'front_setback_m'), (14, 'principal', 'fsi'), (15, 'principal', 'height_m'), (16, 'principal', 'height_storeys'), (17, 'principal', 'lane_centreline_setback_m'), (18, 'principal', 'lot_coverage_pct'), (19, 'principal', 'main_wall_front_rear_share_pct'), (20, 'principal', 'main_wall_height_m'), (21, 'principal', 'main_wall_side_share_pct'), (22, 'principal', 'rear_setback_m'), (23, 'principal', 'roof_slope_max'), (24, 'principal', 'side_setback_m'), (25, 'principal', 'side_setback_street_m'), (26, 'principal', 'upper_storey_setback_m'), (27, 'garden_suite', 'ancillary_coverage_pct'), (28, 'garden_suite', 'building_length_m'), (29, 'garden_suite', 'building_width_m'), (30, 'garden_suite', 'gfa_m2'), (31, 'garden_suite', 'height_m'), (32, 'garden_suite', 'interior_floor_area_m2'), (33, 'garden_suite', 'lane_centreline_setback_m'), (34, 'garden_suite', 'lot_coverage_pct'), (35, 'garden_suite', 'rear_setback_m'), (36, 'garden_suite', 'rear_soft_landscaping_pct'), (37, 'garden_suite', 'separation_m'), (38, 'garden_suite', 'side_setback_m'), (39, 'garden_suite', 'side_setback_street_m'), (40, 'garden_suite', 'upper_side_setback_m'), (41, 'laneway_suite', 'ancillary_coverage_pct'), (42, 'laneway_suite', 'building_length_m'), (43, 'laneway_suite', 'building_width_m'), (44, 'laneway_suite', 'gfa_m2'), (45, 'laneway_suite', 'height_m'), (46, 'laneway_suite', 'interior_floor_area_m2'), (47, 'laneway_suite', 'lane_centreline_setback_m'), (48, 'laneway_suite', 'lot_coverage_pct'), (49, 'laneway_suite', 'rear_setback_m'), (50, 'laneway_suite', 'rear_soft_landscaping_pct'), (51, 'laneway_suite', 'separation_m'), (52, 'laneway_suite', 'side_setback_m'), (53, 'laneway_suite', 'side_setback_street_m'), (54, 'laneway_suite', 'upper_side_setback_m')) AS p (i, structure, target)
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
 WHERE cardinality(l.codes) = 54;

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md). The night's down-step is the whole-database restore from
-- the pre-293 dump (MB-18 plan 8.1b G1), not this text.
-- ============================================================================
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 53 AND codes <@ ARRAY[0, 1, 2, 3, 4]::smallint[]) NOT VALID;
-- ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 53) AND (reason_ids IS NULL OR cardinality(reason_ids) = 53)
--     AND (winner_ids IS NULL OR cardinality(winner_ids) = 53) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 53)
--     AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 53)) NOT VALID;
-- then re-create the view with the 53-pair list of migration 282.
--
-- AFTER THE LAYER 2 RELOAD (run by the night, not by this file):
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_codes_closed;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_array_width;
