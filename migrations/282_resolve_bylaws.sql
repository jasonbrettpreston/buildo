-- 282: resolve_bylaws (Layer 2, Spec 134) -- the three result tables and one view, empty, plus the step's logic variables.
-- (280 was reserved for the population variable; this migration folds it in and takes the next free number, 282, as the pending file said.)
--
-- OPTION 4 (operator CHAT-80.QP): ONE row per lot holds all of its results as positional arrays in layer2-scope.json pair order; two closed
-- dictionaries hold the words once. Nothing is stored per distinct profile, cell, signature or set.
--
-- WHAT THIS CREATES (all empty; DOWN drops them; the orchestrator adds the large table to LARGE_TABLES at landing, P2:61)
--   bylaw_resolution_units    the closed dictionary of unit ids: unit_key = the first four bytes of sha256(unit_id) as a signed int4, so SQL can
--                             recompute it; carries the unit's regulation_id and layer
--   bylaw_resolution_texts    the closed dictionary of reason, evidence-ref and permission texts: text_key = the same hash of the text
--   bylaw_resolution_lots     one row per in-population parcel (R-IU): lot_gate (R-IQ), codes (status x value_kind, int2[]), numbers (float8[]),
--                             reason_ids, winner_ids, evidence_ref_ids (int4[], dictionary keys), evidence_kinds (int2[]), class_results (jsonb,
--                             sparse: only the class positions that differ from the first class), permitted (R-IT, per class) and inputs_defaulted
--   bylaw_resolution_results  a VIEW naming every array position by its (structure, target) and class, decoded: one row per lot x class x pair
-- Position i of every array is the i-th (structure, target) pair of layer2-scope.json (generated into the view and into the CHECKs below).
-- losers, inputs_used and disclosures are NOT stored: Layer 3 and the admin trace recompute them on read through the uncached evaluator
-- (scripts/lib/bylaw-materialize.js logicalRowsOf), so the logical row stays the 11 frozen fields (CHAT-77.freeze).
-- The lot table carries row_sha (sha256 of the canonical result columns, I14), table_version, evaluator_version, a nullable chain_run_id
-- (Spec 124 R-U; the runner stamps the run row, so the column stays NULL, Q-L) and resolved_at. The dictionaries carry no row_sha: their key IS
-- the content hash, recomputed by the POST check. The write guard covers the result columns only.
--
-- CLOSED-COLUMN CHECKs are generated from scripts/seeds/bylaw/layer2-map.json (status, value_kind, evidence_kind, lot_gate, reason_code) and
-- layer2-scope.json (structure); src/tests/steps/resolve_bylaws/migration.logic.test.ts locks them both ways.
--
-- RLS: ENABLE with zero policies on each table (Spec 114 §4 Class B, default deny); the pipeline role bypasses RLS (mig 252 precedent).
--
-- NOT APPLIED. Written by lane L2-SLICES (2026-10-22) for the single commit ① (Spec 124 R-IX); the operator applies it on the next DB night.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3, §4, §6
-- SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA, R-IN, R-IO, R-IP, R-IQ, R-IT, R-IU

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS bylaw_resolution_units (
  unit_key           INTEGER PRIMARY KEY,
  unit_id            TEXT NOT NULL UNIQUE,
  regulation_id      TEXT NOT NULL,
  layer              TEXT NOT NULL CHECK (layer IN ('base', 'overlay', 'exception', 'provincial')),
  chain_run_id       TEXT NULL,
  resolved_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bylaw_resolution_texts (
  text_key           INTEGER PRIMARY KEY,
  text               TEXT NOT NULL,  -- no UNIQUE: the key is the content hash (recomputed by the POST check), and a btree entry caps near 2.7 kB while a clause list can be long
  chain_run_id       TEXT NULL,
  resolved_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bylaw_resolution_lots (
  parcel_id          INTEGER PRIMARY KEY REFERENCES parcels (id) ON DELETE CASCADE,
  lot_gate           TEXT NULL CHECK (lot_gate IN ('no_569_2013_zone', 'ambiguous_zone', 'label_unparsed', 'label_exception_mismatch', 'exception_not_authored', 'lot_metric_missing')),
  codes              SMALLINT[] NOT NULL,
  numbers            DOUBLE PRECISION[] NULL,
  reason_ids         INTEGER[] NULL,
  winner_ids         INTEGER[] NULL,
  evidence_kinds     SMALLINT[] NULL,
  evidence_ref_ids   INTEGER[] NULL,
  class_results      JSONB NULL CHECK (jsonb_typeof(class_results) = 'object'),
  permitted          SMALLINT[] NOT NULL,
  permitted_text_ids INTEGER[] NULL,
  inputs_defaulted   INTEGER NOT NULL DEFAULT 0 CHECK (inputs_defaulted >= 0),
  row_sha            TEXT NOT NULL CHECK (row_sha ~ '^[0-9a-f]{64}$'),
  table_version      TEXT NOT NULL CHECK (table_version ~ '^[0-9a-f]{64}$'),
  evaluator_version  TEXT NOT NULL CHECK (evaluator_version ~ '^[0-9a-f]{64}$'),
  chain_run_id       TEXT NULL,
  resolved_at        TIMESTAMPTZ NOT NULL,
  -- Position i of every array is the i-th (structure, target) pair of layer2-scope.json (53 pairs); permitted is one slot per class.
  -- codes index layer2-map.json status x value_kind (0=applies:number, 1=applies:unlimited, 2=applies:unregulated, 3=not_applicable, 4=not_evaluated); evidence_kinds index layer2-map.json evidence_kind.
  CONSTRAINT bylaw_resolution_lots_codes_closed CHECK (cardinality(codes) = 53 AND codes <@ ARRAY[0, 1, 2, 3, 4]::smallint[]),
  CONSTRAINT bylaw_resolution_lots_array_width CHECK ((numbers IS NULL OR cardinality(numbers) = 53) AND (reason_ids IS NULL OR cardinality(reason_ids) = 53)
    AND (winner_ids IS NULL OR cardinality(winner_ids) = 53) AND (evidence_kinds IS NULL OR cardinality(evidence_kinds) = 53)
    AND (evidence_ref_ids IS NULL OR cardinality(evidence_ref_ids) = 53)),
  CONSTRAINT bylaw_resolution_lots_evidence_kinds_closed CHECK (evidence_kinds IS NULL OR evidence_kinds <@ ARRAY[0, 1, 2, 3, 4]::smallint[]),
  CONSTRAINT bylaw_resolution_lots_permitted_closed CHECK (cardinality(permitted) = 5 AND permitted <@ ARRAY[0, 1, 2]::smallint[]
    AND (permitted_text_ids IS NULL OR cardinality(permitted_text_ids) = 5)),
  -- Spec 134 I4: a lot with a lot gate has only not_evaluated results (code 4) and no winner.
  CONSTRAINT bylaw_resolution_lots_gated_all_not_evaluated CHECK (lot_gate IS NULL OR (codes <@ ARRAY[4]::smallint[] AND winner_ids IS NULL))
);

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
 CROSS JOIN (VALUES (1, 'principal', 'attic_counted_clearance_m'), (2, 'principal', 'attic_qualifying_area_m2'), (3, 'principal', 'attic_qualifying_clearance_m'), (4, 'principal', 'attic_qualifying_share_pct'), (5, 'principal', 'averaging_distance_m'), (6, 'principal', 'bedrooms'), (7, 'principal', 'building_depth_m'), (8, 'principal', 'building_length_m'), (9, 'principal', 'dwelling_units_max'), (10, 'principal', 'element_width_pct'), (11, 'principal', 'entrance_height_m'), (12, 'principal', 'front_setback_m'), (13, 'principal', 'fsi'), (14, 'principal', 'height_m'), (15, 'principal', 'height_storeys'), (16, 'principal', 'lane_centreline_setback_m'), (17, 'principal', 'lot_coverage_pct'), (18, 'principal', 'main_wall_front_rear_share_pct'), (19, 'principal', 'main_wall_height_m'), (20, 'principal', 'main_wall_side_share_pct'), (21, 'principal', 'rear_setback_m'), (22, 'principal', 'roof_slope_max'), (23, 'principal', 'side_setback_m'), (24, 'principal', 'side_setback_street_m'), (25, 'principal', 'upper_storey_setback_m'), (26, 'garden_suite', 'ancillary_coverage_pct'), (27, 'garden_suite', 'building_length_m'), (28, 'garden_suite', 'building_width_m'), (29, 'garden_suite', 'gfa_m2'), (30, 'garden_suite', 'height_m'), (31, 'garden_suite', 'interior_floor_area_m2'), (32, 'garden_suite', 'lane_centreline_setback_m'), (33, 'garden_suite', 'lot_coverage_pct'), (34, 'garden_suite', 'rear_setback_m'), (35, 'garden_suite', 'rear_soft_landscaping_pct'), (36, 'garden_suite', 'separation_m'), (37, 'garden_suite', 'side_setback_m'), (38, 'garden_suite', 'side_setback_street_m'), (39, 'garden_suite', 'upper_side_setback_m'), (40, 'laneway_suite', 'ancillary_coverage_pct'), (41, 'laneway_suite', 'building_length_m'), (42, 'laneway_suite', 'building_width_m'), (43, 'laneway_suite', 'gfa_m2'), (44, 'laneway_suite', 'height_m'), (45, 'laneway_suite', 'interior_floor_area_m2'), (46, 'laneway_suite', 'lane_centreline_setback_m'), (47, 'laneway_suite', 'lot_coverage_pct'), (48, 'laneway_suite', 'rear_setback_m'), (49, 'laneway_suite', 'rear_soft_landscaping_pct'), (50, 'laneway_suite', 'separation_m'), (51, 'laneway_suite', 'side_setback_m'), (52, 'laneway_suite', 'side_setback_street_m'), (53, 'laneway_suite', 'upper_side_setback_m')) AS p (i, structure, target)
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
  LEFT JOIN bylaw_resolution_texts tf ON tf.text_key = r.ref;

ALTER TABLE bylaw_resolution_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE bylaw_resolution_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bylaw_resolution_lots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE bylaw_resolution_units IS 'Spec 134 resolve_bylaws (CHAT-80.QP): the closed dictionary of unit ids. unit_key = first four bytes of sha256(unit_id) as a signed int4 (SQL: (''x'' || encode(substring(sha256(convert_to(unit_id, ''UTF8'')) FROM 1 FOR 4), ''hex''))::bit(32)::int).';
COMMENT ON TABLE bylaw_resolution_texts IS 'Spec 134 resolve_bylaws (CHAT-80.QP): the closed dictionary of reason, evidence-ref and permission-clause texts, keyed by the same hash of the text.';
COMMENT ON TABLE bylaw_resolution_lots IS 'Spec 134 resolve_bylaws (CHAT-80.QP option 4): one row per in-population parcel (R-IU). Results are positional arrays in layer2-scope.json pair order (the view bylaw_resolution_results names each position); lot_gate is the first fired lot gate (R-IQ); permitted is permitted() per class in scope classes order (R-IT); inputs_defaulted must be 0 (I10). losers, inputs_used and disclosures are recomputed on read.';
COMMENT ON COLUMN bylaw_resolution_lots.codes IS 'int2[], one per pair: index into layer2-map.json status x value_kind (0=applies:number, 1=applies:unlimited, 2=applies:unregulated, 3=not_applicable, 4=not_evaluated).';
COMMENT ON COLUMN bylaw_resolution_lots.numbers IS 'float8[], one per pair: the value when the code is applies:number; NULL elsewhere. The whole column is NULL when no pair has a number.';
COMMENT ON COLUMN bylaw_resolution_lots.reason_ids IS 'int4[], one per pair: bylaw_resolution_texts.text_key of the row reason (not_evaluated:<code>... or the not_applicable clause); NULL elements where there is none.';
COMMENT ON COLUMN bylaw_resolution_lots.winner_ids IS 'int4[], one per pair: bylaw_resolution_units.unit_key of the winner; NULL elements where there is none.';
COMMENT ON COLUMN bylaw_resolution_lots.evidence_kinds IS 'int2[], one per pair: index into layer2-map.json evidence_kind (0=clause, 1=absence, 2=provincial, 3=disapply, 4=label_absent).';
COMMENT ON COLUMN bylaw_resolution_lots.evidence_ref_ids IS 'int4[], one per pair: bylaw_resolution_texts.text_key of the evidence reference.';
COMMENT ON COLUMN bylaw_resolution_lots.class_results IS 'Sparse per-class overrides: {class: {pair index (0-based): [code, number, reason_id, winner_id, evidence_kind, evidence_ref_id]}} for the classes whose result differs from the first class of layer2-scope.json classes at that pair. NULL when every class agrees.';
COMMENT ON COLUMN bylaw_resolution_lots.permitted IS 'int2[], one per class in layer2-scope.json classes order: index into layer2-map.json permission_image keys (0=permitted, 1=prohibited, 2=not_evaluated).';
COMMENT ON COLUMN bylaw_resolution_lots.permitted_text_ids IS 'int4[], one per class: texts key of the prohibiting clause list or of the not_evaluated reason; NULL elements for permitted.';
COMMENT ON COLUMN bylaw_resolution_lots.row_sha IS 'sha256 of the canonical result columns (Spec 134 I14): columns in order joined by U+001F, NULL empty, arrays joined by U+001E (NULL elements empty), jsonb as its ::text; recomputed by SQL every run.';
COMMENT ON VIEW bylaw_resolution_results IS 'Spec 134 resolve_bylaws (CHAT-80.QP): the lot rows decoded, one row per lot x class x (structure, target): status, value_kind, value, reason, winner_unit_id, winner_layer, evidence_kind, evidence_ref. losers, inputs_used and disclosures are not here (recomputed on read).';

-- Logic variables (Spec 132 core.8 / R-CV: step variables are <slug>_<name>; every number is a registered variable). ON CONFLICT keeps an operator-set value.
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('resolve_bylaws_population_zone_classes', 0, '["R","RD","RS","RT","RM"]'::jsonb, 'The zones whose parcels are in the Layer 2 population (Spec 134 §2; operator Q-L2-4, R-AY, R-IU): a JSON array of evaluator zone codes (vocab.json zone), stored in variable_value_json with the sentinel 0 in variable_value (seed type list, Q-J). Parcels whose zone is not listed have their lot link row retracted. Folded in from the pending migration 280.'),
  ('resolve_bylaws_batch_size', 250, NULL, 'Source rows (lots) per batch transaction. The dictionary rows and the lot rows of a batch are written together; 250 lots keep the widest upsert (14 columns per lot row) far under the 65,535-parameter bound.'),
  ('resolve_bylaws_conflict_max', 0, NULL, 'Spec 134 I3: the number of not_evaluated:conflict results above which the run FAILs. A conflict is a defect, never an answer; the default is 0.'),
  ('resolve_bylaws_equivalence_every_nth', 2000, NULL, 'Spec 134 I12 and I15 (Q-N): the equivalence and candidate-order checks re-evaluate, uncached, every Nth lot (parcels.id modulo N equal to a per-run offset that cycles with the run date), so the whole population is covered in N runs. Replaces the time budget the spec names: pure compute holds no clock (R-DET), so the sample size is the budget. Interim until P2-0 (b) sizes it (R-AJ).'),
  ('resolve_bylaws_storage_budget_mb', 1300, NULL, 'Spec 134 §6, R-JA (CHAT-69.Q1): the budget in MB for the Layer 2 tables, checked at POST against their measured size. Interim 1,300 MB = the Spec 78 §6.8 kill line (10 % of the 16.4 GB DB, 1,638 MB) less Layer 3-a (282 MB); re-seeded from the first POST capture (Q-K). Option 4 (CHAT-80.QP) models at about 1.0 GB.'),
  ('resolve_bylaws_class_cap', 8, NULL, 'Spec 134 I13: the most classes one lot row may carry (the representative plus its class_results overrides; FAIL above); the v1 catalogue has 5.'),
  ('resolve_bylaws_scenario_axis_warn_max', 0, NULL, 'Spec 134 I13 (Q-F, recommended reading): results whose reason is needs_user_input on a scenario axis. WARN above this ceiling until the axes are enumerated; retighten to FAIL at 0 when they are.'),
  ('resolve_bylaws_not_evaluated_warn_pct', 100, NULL, 'Spec 134 §7 WARN: the share (percent) of results that are not_evaluated. Interim 100 (never warns) until the first POST capture measures it; retighten to the measured share plus margin (Spec 124 R-H).')
ON CONFLICT (variable_key) DO NOTHING;

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP VIEW IF EXISTS bylaw_resolution_results;  -- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS bylaw_resolution_lots;  -- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS bylaw_resolution_texts;  -- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS bylaw_resolution_units;  -- ALLOW-DESTRUCTIVE
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_population_zone_classes';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_batch_size';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_conflict_max';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_equivalence_every_nth';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_storage_budget_mb';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_class_cap';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_scenario_axis_warn_max';
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_not_evaluated_warn_pct';
