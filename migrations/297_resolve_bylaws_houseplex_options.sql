-- 297: the option view reads the listed classes (M-465 (6) as amended by DL-7 a, M-494 D5: the detached houseplex joins the roof-form option).
--
-- Form b (DL-3 b, the M-472 storage half held): the width stays 61 (54 base pairs + 7 option slots of migration 295; M-60: no position moves).
-- Only the view bylaw_resolution_option_results changes: it lists the classes of layer2-scope.json options.roof_form.classes
-- (detached_house, detached_houseplex), and for a class other than the first listed it reads that class's own override at a slot
-- (class_results -> class -> (slot - 1), the form the base view bylaw_resolution_results already reads) where one is stored, else the shared
-- representative cell (Q-STOR a F: an override is stored only where the class's tuple differs from the representative's).
--
-- No table, column, constraint or row changes. CREATE OR REPLACE VIEW only: the column list and order are those of 295.
-- WRITTEN, NOT APPLIED here: lane D applies it on the Layer 2 night (--only=297 --dry-run first).
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md section 3; docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-494

-- UP
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
 CROSS JOIN (VALUES ('detached_house'), ('detached_houseplex')) AS c (class)
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
 WHERE cardinality(l.codes) = 61;

COMMENT ON VIEW bylaw_resolution_option_results IS 'Spec 134 resolve_bylaws (M-465, M-400; 297): the design-option slots decoded, one row per lot x listed class x option slot (detached_house, detached_houseplex): the roof form (flat_or_shallow_roof | pitched) for height_m, main_wall_height_m and upper_storey_setback_m, and the threshold pitched_roof_slope_min with option NULL. A class other than the first listed reads its own stored override at a slot where one exists, else the shared representative cell. shared_with_base: the slot holds the closed code shared and reads its base pair. Listed classes only (RC-1, DL-7 a).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT honour
-- -- UP / -- DOWN markers; see tasks/lessons.md). The down-step is to re-create the view as written in migration 295.
-- ============================================================================
