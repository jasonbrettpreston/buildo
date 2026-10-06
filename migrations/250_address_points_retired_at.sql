-- 250 (numbered 2026-10-04; 249 is the LDG-10 trigger migration, its own earlier commit): soft-retire departed
-- address points -- address_points.retired_at + view address_points_active.
--
-- WHY THIS EXISTS
-- CKAN retired 325 address points (e.g. 16487). load_address_points declared retract "none",
-- so departed source rows accumulated forever. On 2026-10-03 they were hard-deleted on the
-- local dev DB (325 address_points + 344 cascaded parcel_address_points; backups
-- address_points_retired_bak_20261003 / parcel_address_points_retired_bak_20261003). The
-- operator ruled SOFT-RETIRE instead (registry-truth plan fold 10, O1, 2026-10-03): the
-- loader declares outputs.writes[].retract "departed_mark", and the library's departure path
-- stamps retired_at = now() on a key the acquired source no longer carries (and clears it
-- when the key reappears), guarded so an already-retired row keeps its first stamp. Nothing
-- is deleted, so a retirement is reversible and parcel_address_points keeps its FK rows.
--
-- Readers that must see only live points read address_points_active (or filter
-- retired_at IS NULL): link_parcel_addresses, geocode_permits and any reader the P1-C6
-- consumer scan / P1-C-src finds (fold 10 item 4).
--
-- No backfill: every existing row is live (NULL). The 325 rows restored from the
-- 2026-10-03 backups are stamped retired_at = '2026-10-03' by the FLEET-2 data step
-- (fold 10 item 5), not here -- this migration is DDL only, so cloud (which still carries
-- the same rows un-deleted) gets them marked by its first post-FLEET-2 load (fold 10 item 7).
--
-- ADD COLUMN ... NULL with no DEFAULT is a catalog-only change (no table rewrite); the view
-- is a plain projection.
--
-- SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md (as-built text lands with FLEET-2)
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (outputs.writes[].retract)
-- SPEC LINK: .cursor/wf2_registry_truth_active_task.md fold 10 (operator ruling 2026-10-03)

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE address_points ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN address_points.retired_at IS
  'Soft-retire stamp (retract "departed_mark", registry-truth fold 10): set to now() by load_address_points when the key is absent from the acquired CKAN source, cleared to NULL when it reappears. NULL = live. Never deleted by the loader.';

CREATE OR REPLACE VIEW address_points_active AS
  SELECT *
  FROM address_points
  WHERE retired_at IS NULL;

COMMENT ON VIEW address_points_active IS
  'Live address points only (retired_at IS NULL). Readers that must not join a departed source row read this view (registry-truth fold 10 item 4).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP VIEW IF EXISTS address_points_active;
-- ALTER TABLE address_points DROP COLUMN IF EXISTS retired_at;  -- ALLOW-DESTRUCTIVE
