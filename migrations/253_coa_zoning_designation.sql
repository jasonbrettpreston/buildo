-- 253 (numbered 2026-10-08; 252 is reserved by load_coa_notices / coa_notice_variances in its own lane):
-- coa_applications.zoning_designation -- the zone string as filed (CKAN ZONING_DESIGNATION).
--
-- WHY THIS EXISTS
-- Both Spec 51 CKAN resources (active 51fd09cd, closed 9c97254e) carry ZONING_DESIGNATION, the
-- zone the applicant filed under at the hearing. load_coa did not ingest it (McBylaw Phase 2
-- inputs research 2026-10-07, part C). The loader now stores it raw (trimmed, no parsing) and it
-- joins data_hash; the pure parser scripts/lib/coa-zoning-designation.js reads it, and the
-- CoA->parcel zone-class check compares it with parcels.zoning_zn_string (class first; component
-- differences are dated evidence, because the filing is as-at-hearing and parcels hold the
-- current snapshot).
--
-- ADD COLUMN ... NULL with no DEFAULT is a catalog-only change (no table rewrite) and there is no
-- backfill UPDATE here: the ~33,400 rows are populated by one `load_coa --full` (incremental mode
-- reads only the last 90 days of the active resource), whose data_hash change re-upserts each row
-- once through the existing IS DISTINCT FROM guard.
--
-- SPEC LINK: docs/specs/01-pipeline/51_source_coa.md (Target Table: zoning_designation)
-- SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (C1)

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE coa_applications ADD COLUMN IF NOT EXISTS zoning_designation TEXT NULL;

COMMENT ON COLUMN coa_applications.zoning_designation IS
  'Zone string as filed (CKAN ZONING_DESIGNATION, both resources), trimmed, else NULL. Raw: parsed by scripts/lib/coa-zoning-designation.js, never at the loader. As at the hearing date, not the current zoning.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS zoning_designation;  -- ALLOW-DESTRUCTIVE
