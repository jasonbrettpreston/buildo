-- 285: coa_plan_facts -- values read off plans, surveys and zoning notices, one row per CoA application
-- (load_coa_notices, Spec 129 §2c; operator CHAT-74.IN4, scope expansion by ruling per CHAT-68.scope).
--
-- WHY THIS EXISTS
-- The C-6 intake routine brings, beside the decision / hearing notices, the plan facts a notice's variances are
-- measured against (lot dimensions, proposed floor areas, heights, setbacks, landscaping shares). They serve consumers
-- beyond the scorer's calculation field. They arrive inside the same pinned values batch as the notices
-- (batch.plan_facts) and are written by load_coa_notices as a DERIVED second write target (Spec 124 R-DY; RE-FREEZE #40).
--
-- VALUES ONLY (Spec 129 §3 / §2c): numbers, one boolean, the application number, the batch id and the batch file's
-- sha256. No drawing, no file title, no address, no note text, no name. A field a plan does not state is NULL. Free-form
-- extras of the intake store (ancillary-building detail, landscaping area lists) are not columns here.
--
-- DESIGN NOTES
-- * application_number is the key and a SOFT reference to coa_applications (no FK; same reason as migration 252).
-- * No retired_at: plan facts are upserted, never retired (Spec 129 §9 "No oracle row is ever deleted"); a later batch
--   that restates an application replaces the row (the compute keeps the latest manifest-order batch).
-- * RLS: ENABLE with zero policies (Spec 114 §4 Class B); the pipeline role bypasses RLS, declared by guards.requires.
--
-- IMPACT: a NEW, EMPTY table. No ALTER of any existing table.
--
-- SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2c
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B)

-- UP
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TABLE IF NOT EXISTS coa_plan_facts (
  application_number VARCHAR(50) PRIMARY KEY,
  lot_area_m2 NUMERIC NULL,
  lot_depth_m NUMERIC NULL,
  lot_frontage_m NUMERIC NULL,
  established_grade NUMERIC NULL,
  existing_coverage_m2 NUMERIC NULL,
  existing_gfa_m2 NUMERIC NULL,
  existing_height_m NUMERIC NULL,
  existing_storeys NUMERIC NULL,
  front_landscaped_pct NUMERIC NULL,
  front_soft_pct NUMERIC NULL,
  rear_soft_pct NUMERIC NULL,
  proposed_bedrooms NUMERIC NULL,
  proposed_coverage_m2 NUMERIC NULL,
  proposed_coverage_pct NUMERIC NULL,
  proposed_depth_m NUMERIC NULL,
  proposed_fsi NUMERIC NULL,
  proposed_gfa_basement_m2 NUMERIC NULL,
  proposed_gfa_first_m2 NUMERIC NULL,
  proposed_gfa_second_m2 NUMERIC NULL,
  proposed_gfa_third_m2 NUMERIC NULL,
  proposed_gfa_total_m2 NUMERIC NULL,
  proposed_height_m NUMERIC NULL,
  proposed_length_m NUMERIC NULL,
  proposed_main_wall_height_m NUMERIC NULL,
  proposed_storeys NUMERIC NULL,
  proposed_units NUMERIC NULL,
  proposed_setback_front_m NUMERIC NULL,
  proposed_setback_rear_m NUMERIC NULL,
  proposed_setback_side_flank_m NUMERIC NULL,
  proposed_setback_side_left_m NUMERIC NULL,
  proposed_setback_side_right_m NUMERIC NULL,
  corner_lot BOOLEAN NULL,
  source_batch TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_cpf_lot_area_m2 CHECK (lot_area_m2 IS NULL OR lot_area_m2 >= 0),
  CONSTRAINT chk_cpf_lot_depth_m CHECK (lot_depth_m IS NULL OR lot_depth_m >= 0),
  CONSTRAINT chk_cpf_lot_frontage_m CHECK (lot_frontage_m IS NULL OR lot_frontage_m >= 0),
  CONSTRAINT chk_cpf_established_grade CHECK (established_grade IS NULL OR established_grade >= 0),
  CONSTRAINT chk_cpf_existing_coverage_m2 CHECK (existing_coverage_m2 IS NULL OR existing_coverage_m2 >= 0),
  CONSTRAINT chk_cpf_existing_gfa_m2 CHECK (existing_gfa_m2 IS NULL OR existing_gfa_m2 >= 0),
  CONSTRAINT chk_cpf_existing_height_m CHECK (existing_height_m IS NULL OR existing_height_m >= 0),
  CONSTRAINT chk_cpf_existing_storeys CHECK (existing_storeys IS NULL OR existing_storeys >= 0),
  CONSTRAINT chk_cpf_front_landscaped_pct CHECK (front_landscaped_pct IS NULL OR front_landscaped_pct >= 0),
  CONSTRAINT chk_cpf_front_soft_pct CHECK (front_soft_pct IS NULL OR front_soft_pct >= 0),
  CONSTRAINT chk_cpf_rear_soft_pct CHECK (rear_soft_pct IS NULL OR rear_soft_pct >= 0),
  CONSTRAINT chk_cpf_proposed_bedrooms CHECK (proposed_bedrooms IS NULL OR proposed_bedrooms >= 0),
  CONSTRAINT chk_cpf_proposed_coverage_m2 CHECK (proposed_coverage_m2 IS NULL OR proposed_coverage_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_coverage_pct CHECK (proposed_coverage_pct IS NULL OR proposed_coverage_pct >= 0),
  CONSTRAINT chk_cpf_proposed_depth_m CHECK (proposed_depth_m IS NULL OR proposed_depth_m >= 0),
  CONSTRAINT chk_cpf_proposed_fsi CHECK (proposed_fsi IS NULL OR proposed_fsi >= 0),
  CONSTRAINT chk_cpf_proposed_gfa_basement_m2 CHECK (proposed_gfa_basement_m2 IS NULL OR proposed_gfa_basement_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_gfa_first_m2 CHECK (proposed_gfa_first_m2 IS NULL OR proposed_gfa_first_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_gfa_second_m2 CHECK (proposed_gfa_second_m2 IS NULL OR proposed_gfa_second_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_gfa_third_m2 CHECK (proposed_gfa_third_m2 IS NULL OR proposed_gfa_third_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_gfa_total_m2 CHECK (proposed_gfa_total_m2 IS NULL OR proposed_gfa_total_m2 >= 0),
  CONSTRAINT chk_cpf_proposed_height_m CHECK (proposed_height_m IS NULL OR proposed_height_m >= 0),
  CONSTRAINT chk_cpf_proposed_length_m CHECK (proposed_length_m IS NULL OR proposed_length_m >= 0),
  CONSTRAINT chk_cpf_proposed_main_wall_height_m CHECK (proposed_main_wall_height_m IS NULL OR proposed_main_wall_height_m >= 0),
  CONSTRAINT chk_cpf_proposed_storeys CHECK (proposed_storeys IS NULL OR proposed_storeys >= 0),
  CONSTRAINT chk_cpf_proposed_units CHECK (proposed_units IS NULL OR proposed_units >= 0),
  CONSTRAINT chk_cpf_proposed_setback_front_m CHECK (proposed_setback_front_m IS NULL OR proposed_setback_front_m >= 0),
  CONSTRAINT chk_cpf_proposed_setback_rear_m CHECK (proposed_setback_rear_m IS NULL OR proposed_setback_rear_m >= 0),
  CONSTRAINT chk_cpf_proposed_setback_side_flank_m CHECK (proposed_setback_side_flank_m IS NULL OR proposed_setback_side_flank_m >= 0),
  CONSTRAINT chk_cpf_proposed_setback_side_left_m CHECK (proposed_setback_side_left_m IS NULL OR proposed_setback_side_left_m >= 0),
  CONSTRAINT chk_cpf_proposed_setback_side_right_m CHECK (proposed_setback_side_right_m IS NULL OR proposed_setback_side_right_m >= 0),
  CONSTRAINT chk_cpf_source_batch CHECK (source_batch ~ '^coa-[0-9]{4}-[a-z]$'),
  CONSTRAINT chk_cpf_source_sha256 CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE coa_plan_facts IS
'Values read off plans, surveys and zoning notices, one row per CoA application (load_coa_notices, Spec 129 §2c). Values only: no drawings, names, addresses or text. NULL = the plan does not state it.';

ALTER TABLE coa_plan_facts ENABLE ROW LEVEL SECURITY;

-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one transaction and does NOT
-- honour -- UP / -- DOWN markers; see tasks/lessons.md). Rows are re-derivable from the committed batch files
-- (re-run load_coa_notices): 
-- DROP TABLE IF EXISTS coa_plan_facts;  -- ALLOW-DESTRUCTIVE
