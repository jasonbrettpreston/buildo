-- 324_parcel_user_inputs_width_depth.sql
-- MF-19 plan v3: the lot-size entry becomes width (frontage) + depth with one ft/m switch, plus the link "My lot isn't a
-- rectangle - enter the area instead" (operator amendment "b" 2026-11-14; "R-1 thru R-6 recommendations approved" 2026-11-15).
-- R-1 (a): a FORWARD migration; migration 305 is applied locally and stays as it is.
--   1. Four columns beside value_sqm: width_m, depth_m (metres, as the server converted them), typed_width, typed_depth (the numbers as
--      the user typed them, in typed_unit; R-6 a). NUMERIC(8,2) like parcels.frontage_m / depth_m (migration 011). value_sqm stays the
--      canonical area: computed once by the server from the UNROUNDED sides, never recomputed from the stored 2-decimal sides.
--   2. typed_value (the area path's typed number) becomes nullable: a width entry has none.
--   3. typed_unit admits 'ft' and 'm' (the width path) beside 'sqft' and 'm2' (the area path).
--   4. One named shape CHECK, chk_parcel_user_inputs_shape: width path = width_m, depth_m, typed_width, typed_depth all > 0, typed_unit
--      ft or m, typed_value NULL; area path = those four NULL, typed_value > 0, typed_unit sqft or m2. Written with IS NOT NULL so a NULL
--      side is refused (a bare "x > 0" is NULL, and a CHECK passes on NULL). value_sqm > 0 already holds (migration 305).
--   5. Two logic variables (the side range, 2 m to 450 m, R-5 a), in the existing Admin Control Panel group "MaxBLD Lot Size",
--      mirroring scripts/seeds/logic_variables.json entry for entry (the seed is the test truth).
-- No row assertion and no backfill: every existing row is an area-path row and satisfies the new shape CHECK. One active row per lot is
-- unchanged (the partial unique index of 305; input_key stays 'lot_area', the compatibility key for the lot's area record).
-- Re-runnable: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS then re-add, SET/DROP NOT NULL are idempotent, the inserts are
-- ON CONFLICT DO NOTHING; the runner also skips an applied number. The entry switch stays 0 (OFF, D-6); the area range, the City ratio and
-- the entries a day are reused, not duplicated. No change to parcels.
-- WRITTEN, NOT APPLIED here: the separate DB job MF19-324 applies it (rehearsed on the test stack first, then the operator's typed GO),
-- then runs npm run db:generate so src/lib/db/generated/schema.ts follows.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11a.9 (dated note 2026-11-15)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (parcel_user_inputs Class B, unchanged: RLS on, no policy)

-- UP
BEGIN;

ALTER TABLE parcel_user_inputs
  ADD COLUMN IF NOT EXISTS width_m      NUMERIC(8,2) NULL,
  ADD COLUMN IF NOT EXISTS depth_m      NUMERIC(8,2) NULL,
  ADD COLUMN IF NOT EXISTS typed_width  NUMERIC(8,2) NULL,
  ADD COLUMN IF NOT EXISTS typed_depth  NUMERIC(8,2) NULL;

ALTER TABLE parcel_user_inputs ALTER COLUMN typed_value DROP NOT NULL;

ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_unit;
ALTER TABLE parcel_user_inputs
  ADD CONSTRAINT chk_parcel_user_inputs_unit CHECK (typed_unit IN ('sqft', 'm2', 'ft', 'm'));

-- typed_value is the area path's number only; the shape CHECK below says which path may leave it NULL.
ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_typed;
ALTER TABLE parcel_user_inputs
  ADD CONSTRAINT chk_parcel_user_inputs_typed CHECK (typed_value IS NULL OR typed_value > 0);

ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_shape;
ALTER TABLE parcel_user_inputs
  ADD CONSTRAINT chk_parcel_user_inputs_shape CHECK (
    (    width_m     IS NOT NULL AND width_m     > 0
     AND depth_m     IS NOT NULL AND depth_m     > 0
     AND typed_width IS NOT NULL AND typed_width > 0
     AND typed_depth IS NOT NULL AND typed_depth > 0
     AND typed_unit IN ('ft', 'm')
     AND typed_value IS NULL)
    OR
    (    width_m     IS NULL AND depth_m     IS NULL
     AND typed_width IS NULL AND typed_depth IS NULL
     AND typed_value IS NOT NULL AND typed_value > 0
     AND typed_unit IN ('sqft', 'm2'))
  );

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('user_lot_size_side_min_m', 2, NULL, 'MF-19 plan v3 R-5: the shortest lot width or depth a user may enter, in metres (2 m, 6.6 ft; City width p1 is 3.06 m). Checked in the typed unit against the shown bound. Edited in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: readLotSizeSettings, lotSizeSideProblem).'),
  ('user_lot_size_side_max_m', 450, NULL, 'MF-19 plan v3 R-5: the longest lot width or depth a user may enter, in metres (450 m, 1,476 ft; City depth p99.9 is 448 m). The area range and the City ratio do the real guarding. Edited in the Admin Control Panel. CONSUMED by the lot-size entry library (src/lib/parcels/lot-size-entry.ts: readLotSizeSettings, lotSizeSideProblem).')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- Runbook: do NOT run this if any width-path row exists (typed_unit ft or m): it cannot restore typed_value NOT NULL for them, and dropping
-- width_m / depth_m / typed_width / typed_depth deletes what the user typed. Export the table first.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key IN ('user_lot_size_side_min_m', 'user_lot_size_side_max_m');
--   ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_shape;
--   ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_typed;
--   ALTER TABLE parcel_user_inputs ADD CONSTRAINT chk_parcel_user_inputs_typed CHECK (typed_value > 0);
--   ALTER TABLE parcel_user_inputs DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_unit;
--   ALTER TABLE parcel_user_inputs ADD CONSTRAINT chk_parcel_user_inputs_unit CHECK (typed_unit IN ('sqft', 'm2'));
--   ALTER TABLE parcel_user_inputs ALTER COLUMN typed_value SET NOT NULL;
--   ALTER TABLE parcel_user_inputs DROP COLUMN IF EXISTS typed_depth, DROP COLUMN IF EXISTS typed_width, DROP COLUMN IF EXISTS depth_m, DROP COLUMN IF EXISTS width_m;
-- COMMIT;
