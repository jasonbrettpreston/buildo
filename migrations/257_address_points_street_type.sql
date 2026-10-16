-- 257 (numbered 2026-10-10; 253-255 are reserved for the Phase 2 inputs branch, 256 is the CoA notices
-- branch): address_points.street_type_normalized + view address_points_active re-created to expose it.
--
-- WHY THIS EXISTS
-- Spec 54: address points are the address of record since Toronto stripped the parcel address columns
-- (2026-05-20). The loader already parses LINEAR_NAME_FULL with the shared parseLinearName
-- (scripts/lib/address-normalizers.js) but stored only the type-stripped name, so the linkers could
-- disambiguate a street TYPE only through the frozen parcels.street_type_normalized (LP-D9), which is
-- NULL on ~51K parcels. Measured 2026-10-10: 37 CoA links sit on an address point of another street type
-- (4 of them on a NULL-type parcel). Operator ruling 2026-10-10 (Option A): store the parsed type on the
-- address point and disambiguate on it (Spec 54 §3 hierarchy level 0).
--
-- No SQL backfill: the parser has ONE implementation (JS, shared by both loaders, Spec 54 §3 step 3), so
-- the next load_address_points run fills every row. Until then the column is NULL and every reader treats
-- a NULL type as unconstrained.
--
-- address_points_active is SELECT * (mig 250); Postgres expands * at view creation, so the view is
-- re-created to carry the new column (appended last, which CREATE OR REPLACE VIEW allows).

-- UP
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE address_points ADD COLUMN IF NOT EXISTS street_type_normalized TEXT;

COMMENT ON COLUMN address_points.street_type_normalized IS
  'DERIVED: canonical short street type (AVE, CRES, ST, ...) of linear_name_full via parseLinearName (scripts/lib/address-normalizers.js, shared with load-parcels). NULL when the name carries no recognised type. Spec 54 §3 disambiguation level 0.';

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
-- ALTER TABLE address_points DROP COLUMN IF EXISTS street_type_normalized;  -- ALLOW-DESTRUCTIVE
-- CREATE VIEW address_points_active AS SELECT * FROM address_points WHERE retired_at IS NULL;
