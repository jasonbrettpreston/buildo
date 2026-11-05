-- 295: resolve_bylaws gains the roof-form design option (M-465, M-400's first option) and stores its three lineage stamps as bytes (Q-STOR a).
--
-- (1) WIDTH 54 -> 61 (M-465 (1)-(4), layer2-scope.json options, RC-1). Seven slots are appended after the 54 base pairs, which keep their positions
--     (M-60; the increment-1 readers are unchanged): principal height_m, main_wall_height_m and upper_storey_setback_m, each for a flat or shallow
--     roof and for a pitched roof (slots 55-60), then the threshold pitched_roof_slope_min (slot 61, option NULL). They are stored for the
--     detached_house class only (the representative arrays; no class_results override is written at 55-61).
--     The closed storage code 5 `shared` (layer2-map.json storage_code; M-465 (2), "share the cell") marks an option slot whose result equals its
--     own base pair's; it is refused at the base slots 1-54 and decoded to the base cell by the option view.
--     The two width CHECKs are re-added NOT VALID at 61: enforced on every row written from now on, the 54-wide rows already stored are not
--     scanned; the night rewrites every lot row (TRUNCATE-RELOAD) and then runs the VALIDATE statements at the foot of this file.
--     bylaw_resolution_results keeps its key, its columns and its 54 pairs; it returns only 61-wide rows (a stale 54-wide row is hidden, not
--     decoded against the wrong positions; fail closed). The new view bylaw_resolution_option_results names the option slots.
-- (2) Q-STOR a (storage-headroom.md option B): row_sha, table_version and evaluator_version go from 64-character hex text to bytea, values unchanged
--     (USING decode(x, 'hex')). The regex CHECKs of migration 282 are dropped (282 is not edited) and replaced by octet_length(x) = 32 CHECKs, added
--     NOT VALID and validated by the night after the reload (the 293 pattern). No view references the three columns (pg_depend, read-only), so the
--     ALTER TYPE is allowed; it rewrites the table. Layer 3 reads the stamps as hex through the new view bylaw_resolution_lot_stamps.
--
-- No row is inserted, deleted or updated by this file (the ALTER TYPE rewrites values in place, unchanged). Idempotent where the statement allows it:
-- DROP CONSTRAINT IF EXISTS, then ADD; the views are CREATE OR REPLACE. The ALTER TYPE is run once, by the night (D-MIG: 295 alone, dry-run first).
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3, section 6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-465

-- UP
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_codes_closed;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_array_width;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_shared_option_slots;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 61 AND codes <@ ARRAY[0, 1, 2, 3, 4, 5]::smallint[]) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 61) AND (reason_ids IS NULL OR cardinality(reason_ids) = 61) AND (winner_ids IS NULL OR cardinality(winner_ids) = 61) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 61) AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 61)) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_shared_option_slots CHECK (NOT (codes[1:54] @> ARRAY[5]::smallint[]) AND codes[61] <> 5) NOT VALID;

ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_row_sha_check;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_table_version_check;
ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_evaluator_version_check;
ALTER TABLE bylaw_resolution_lots
  ALTER COLUMN row_sha TYPE bytea USING decode(row_sha, 'hex'),
  ALTER COLUMN table_version TYPE bytea USING decode(table_version, 'hex'),
  ALTER COLUMN evaluator_version TYPE bytea USING decode(evaluator_version, 'hex');
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_row_sha_check CHECK (octet_length(row_sha) = 32) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_table_version_check CHECK (octet_length(table_version) = 32) NOT VALID;
ALTER TABLE bylaw_resolution_lots ADD CONSTRAINT bylaw_resolution_lots_evaluator_version_check CHECK (octet_length(evaluator_version) = 32) NOT VALID;

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
 WHERE cardinality(l.codes) = 61;

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
 CROSS JOIN (VALUES (55, 'principal', 'height_m', 'flat_or_shallow_roof', 15), (56, 'principal', 'height_m', 'pitched', 15), (57, 'principal', 'main_wall_height_m', 'flat_or_shallow_roof', 20), (58, 'principal', 'main_wall_height_m', 'pitched', 20), (59, 'principal', 'upper_storey_setback_m', 'flat_or_shallow_roof', 26), (60, 'principal', 'upper_storey_setback_m', 'pitched', 26), (61, 'principal', 'pitched_roof_slope_min', NULL, NULL)) AS p (i, structure, target, option, base_i)
 CROSS JOIN (VALUES ('detached_house')) AS c (class)
 CROSS JOIN LATERAL (SELECT l.codes[p.i] = 5 AS shared) s
 CROSS JOIN LATERAL (SELECT
         s.shared,
         CASE WHEN s.shared THEN l.codes[p.base_i] ELSE l.codes[p.i] END AS code,
         CASE WHEN s.shared THEN l.numbers[p.base_i] ELSE l.numbers[p.i] END AS num,
         CASE WHEN s.shared THEN l.reason_ids[p.base_i] ELSE l.reason_ids[p.i] END AS rid,
         CASE WHEN s.shared THEN l.winner_ids[p.base_i] ELSE l.winner_ids[p.i] END AS wid,
         CASE WHEN s.shared THEN l.evidence_kinds[p.base_i] ELSE l.evidence_kinds[p.i] END AS ek,
         CASE WHEN s.shared THEN l.evidence_ref_ids[p.base_i] ELSE l.evidence_ref_ids[p.i] END AS ref) r
  LEFT JOIN bylaw_resolution_units u ON u.unit_key = r.wid
  LEFT JOIN bylaw_resolution_texts tr ON tr.text_key = r.rid
  LEFT JOIN bylaw_resolution_texts tf ON tf.text_key = r.ref
 WHERE cardinality(l.codes) = 61;

CREATE OR REPLACE VIEW bylaw_resolution_lot_stamps AS
SELECT l.parcel_id, l.lot_gate, l.permitted, l.permitted_text_ids,
       encode(l.table_version, 'hex') AS table_version,
       encode(l.evaluator_version, 'hex') AS evaluator_version,
       encode(l.row_sha, 'hex') AS row_sha
  FROM bylaw_resolution_lots l;

COMMENT ON VIEW bylaw_resolution_option_results IS 'Spec 134 resolve_bylaws (M-465, M-400): the design-option slots decoded, one row per lot x listed class x option slot: the roof form (flat_or_shallow_roof | pitched) for height_m, main_wall_height_m and upper_storey_setback_m, and the threshold pitched_roof_slope_min with option NULL (a pair without an option, stored beside them). shared_with_base: the slot holds the closed code shared and reads its base pair. Listed classes only (detached_house, RC-1).';
COMMENT ON VIEW bylaw_resolution_lot_stamps IS 'Spec 134 resolve_bylaws (Q-STOR a): the lot row stamps as hex text (row_sha, table_version, evaluator_version are stored as bytea(32)), with the lot gate and permitted() words. Layer 3 reads the stamps here.';
COMMENT ON COLUMN bylaw_resolution_lots.row_sha IS 'bytea(32): sha256 of the canonical result columns (Spec 134 I14): columns in order joined by U+001F, NULL empty, arrays joined by U+001E (NULL elements empty), jsonb as its ::text; recomputed by SQL every run (compared as bytes). Read as hex through bylaw_resolution_lot_stamps (Q-STOR a).';
COMMENT ON COLUMN bylaw_resolution_lots.table_version IS 'bytea(32): the Layer 1 input table_version (docs/reference/bylaw-layer2-input.json, hex there). Read as hex through bylaw_resolution_lot_stamps (Q-STOR a).';
COMMENT ON COLUMN bylaw_resolution_lots.evaluator_version IS 'bytea(32): the evaluator_version (docs/reference/bylaw-layer2-input.json, hex there). Read as hex through bylaw_resolution_lot_stamps (Q-STOR a).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md). The night's down-step is the whole-database restore from
-- the pre-295 dump (O-n2 extended to a 295 failure), not this text.
-- ============================================================================
-- DROP VIEW IF EXISTS bylaw_resolution_lot_stamps;  -- ALLOW-DESTRUCTIVE
-- DROP VIEW IF EXISTS bylaw_resolution_option_results;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_shared_option_slots;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_row_sha_check;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_table_version_check;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots DROP CONSTRAINT IF EXISTS bylaw_resolution_lots_evaluator_version_check;  -- ALLOW-DESTRUCTIVE
-- ALTER TABLE bylaw_resolution_lots ALTER COLUMN row_sha TYPE text USING encode(row_sha, 'hex'), ALTER COLUMN table_version TYPE text USING encode(table_version, 'hex'),
--   ALTER COLUMN evaluator_version TYPE text USING encode(evaluator_version, 'hex');
-- then re-add the three regex CHECKs of migration 282, the two width CHECKs at 54 with codes <@ ARRAY[0, 1, 2, 3, 4] (migration 293), and the
-- 54-wide bylaw_resolution_results view of migration 293.
--
-- AFTER THE LAYER 2 RELOAD (run by the night, not by this file):
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_codes_closed;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_array_width;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_shared_option_slots;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_row_sha_check;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_table_version_check;
--   ALTER TABLE bylaw_resolution_lots VALIDATE CONSTRAINT bylaw_resolution_lots_evaluator_version_check;
