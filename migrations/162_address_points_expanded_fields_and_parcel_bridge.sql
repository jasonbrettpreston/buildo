-- 162: Address Points expanded fields (12 new columns) + parcel_address_points
-- spatial bridge table.
--
-- SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
--
-- Toronto Open Data stripped 3 address columns (ADDRESS_NUMBER,
-- LINEAR_NAME_FULL, DATE_EFFECTIVE) from the Property Boundaries CSV
-- between 2026-05-19 and 2026-05-20 (verified via direct fetch 2026-05-23).
-- Address data now lives canonically in the separate Address Points dataset.
-- This migration extends address_points with the 12 fields Buildo needs
-- (10 source + 2 derived-normalized per WF1 plan PI-6 option b) + adds the
-- spatial bridge table populated by link-parcel-addresses.js.
--
-- PER PLAN v4 fold C3: the 600K-row geom backfill is NOT in this migration
-- (it runs as a separate one-time script `scripts/one-time/backfill-address-points-geom.js`
-- to avoid blocking VACUUM + table bloat from a long-running transaction).
-- The geom column starts NULL on existing rows; link-parcel-addresses skips
-- NULL-geom rows + surfaces count in audit_table. After backfill completes,
-- the audit metric drops to 0.

-- ============================================================================
-- UP
-- ============================================================================

-- Step 1: Add 12 new columns to address_points (10 source + 2 derived-normalized).
-- All nullable; populated by load-address-points.js (going forward) + by the
-- one-time backfill script (existing 600K rows).
--
-- v3 fold C1: geom is GEOMETRY(Point, 4326) NOT geography — parcels.geom is
-- GEOMETRY per mig 039/083, and ST_Within requires both args to be the same
-- type family. SRID 4326 matches existing lat/lng.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='address_points' AND column_name='address_number') THEN
    ALTER TABLE address_points
      ADD COLUMN address_number          TEXT,
      ADD COLUMN linear_name_full        TEXT,
      ADD COLUMN address_full            TEXT,
      ADD COLUMN lo_num                  INTEGER,
      ADD COLUMN hi_num                  INTEGER,
      ADD COLUMN maint_stage             TEXT,
      ADD COLUMN address_status          TEXT,
      ADD COLUMN address_class_desc      TEXT,
      ADD COLUMN class_family_desc       TEXT,
      ADD COLUMN place_name              TEXT,
      ADD COLUMN addr_num_normalized     TEXT,
      ADD COLUMN linear_name_normalized  TEXT;
  END IF;
END $$;

-- Step 2: Add geom column. Type GEOMETRY(Point, 4326) per v3 fold C1.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='address_points' AND column_name='geom') THEN
    ALTER TABLE address_points
      ADD COLUMN geom GEOMETRY(Point, 4326);
  END IF;
END $$;

-- Step 3: GIST spatial index on the new geom column. Matches parcels.geom
-- index family (both GEOMETRY); the spatial join planner can use both.
-- Partial index keeps the index small while the backfill is in progress.
CREATE INDEX IF NOT EXISTS idx_address_points_geom_gist
  ON address_points USING GIST (geom)
  WHERE geom IS NOT NULL;

-- Step 4: Btree indexes on the two normalized columns to support fast
-- text JOINs from link-parcels Strategies 1+2 + link-coa-to-parcels Tier 1a/1b.
CREATE INDEX IF NOT EXISTS idx_address_points_addr_num_normalized
  ON address_points (addr_num_normalized)
  WHERE addr_num_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_address_points_linear_name_normalized
  ON address_points (linear_name_normalized)
  WHERE linear_name_normalized IS NOT NULL;

-- Step 5: Create parcel_address_points spatial bridge table.
-- Populated by `scripts/link-parcel-addresses.js` via batched ST_Within join.
-- PK on (parcel_id, address_point_id) covers parcel_id prefix lookups by
-- itself (per DeepSeek v1 HIGH fold — no redundant idx_parcel_id needed).
-- Single reverse index on address_point_id for the link-parcels rewrite path.
CREATE TABLE IF NOT EXISTS parcel_address_points (
  parcel_id        INTEGER     NOT NULL,
  address_point_id INTEGER     NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parcel_id, address_point_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_address_points_address_point_id
  ON parcel_address_points (address_point_id);

-- Step 6: FKs via NOT VALID + VALIDATE pattern per Spec 47 §18.4
-- (parcels=486K, address_points=525K — both >100K threshold).
--
-- v3 fold M1: ON DELETE CASCADE chosen because parcel_address_points is
-- a derived spatial-intersect cache with no historical audit value.
-- When source parcels/address_points are removed, linkages MUST be
-- invalidated (downstream link-parcels would otherwise resolve to a
-- non-existent parcel and crash). Alternative SET NULL would orphan
-- the FK (PK has NOT NULL on both columns). RESTRICT would block
-- legitimate source-table cleanups.
-- Gemini IMPL CRIT fold: VALIDATE inside DO $$ guarded on pg_constraint.convalidated
-- so re-running the migration does not re-acquire SHARE UPDATE EXCLUSIVE lock on
-- an already-VALID constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'fk_parcel_address_points_parcel') THEN
    ALTER TABLE parcel_address_points
      ADD CONSTRAINT fk_parcel_address_points_parcel
      FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'fk_parcel_address_points_parcel'
                AND convalidated = false) THEN
    ALTER TABLE parcel_address_points
      VALIDATE CONSTRAINT fk_parcel_address_points_parcel;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'fk_parcel_address_points_address_point') THEN
    ALTER TABLE parcel_address_points
      ADD CONSTRAINT fk_parcel_address_points_address_point
      FOREIGN KEY (address_point_id) REFERENCES address_points(address_point_id) ON DELETE CASCADE
      NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'fk_parcel_address_points_address_point'
                AND convalidated = false) THEN
    ALTER TABLE parcel_address_points
      VALIDATE CONSTRAINT fk_parcel_address_points_address_point;
  END IF;
END $$;

-- Comments document the column semantics for operators/future migrations
COMMENT ON COLUMN address_points.address_number IS 'WF1 2026-05-23: raw ADDRESS_NUMBER from Address Points CSV. Replaces parcels.address_number after Toronto removed it from Property Boundaries on 2026-05-20.';
COMMENT ON COLUMN address_points.linear_name_full IS 'WF1 2026-05-23: raw LINEAR_NAME_FULL (e.g., "Davenport Rd") from Address Points CSV.';
COMMENT ON COLUMN address_points.address_full IS 'WF1 2026-05-23: pre-formatted full address from Address Points CSV.';
COMMENT ON COLUMN address_points.address_class_desc IS 'WF1 2026-05-23: Land/Structure/Structure Entrance. Used by link-parcels disambiguation hierarchy (Structure > Structure Entrance > Land).';
COMMENT ON COLUMN address_points.maint_stage IS 'WF1 2026-05-23: REGULAR/PRELIMINARY/RETIRED. Filter to REGULAR in matching queries.';
COMMENT ON COLUMN address_points.address_status IS 'WF1 2026-05-23: CURRENT/RETIRED/PENDING. Filter to CURRENT in matching queries.';
COMMENT ON COLUMN address_points.geom IS 'WF1 2026-05-23: GEOMETRY(Point, 4326) derived from lat/lng. Same SRID + type as parcels.geom for ST_Within spatial join. Backfilled by scripts/one-time/backfill-address-points-geom.js for existing 525K rows.';
COMMENT ON COLUMN address_points.addr_num_normalized IS 'WF1 2026-05-23: leading-zero-stripped lowercase address_number for cross-table JOINs with parcels.addr_num_normalized + coa_applications normalization.';
COMMENT ON COLUMN address_points.linear_name_normalized IS 'WF1 2026-05-23: normalized street name for cross-table JOINs.';
COMMENT ON TABLE parcel_address_points IS 'WF1 2026-05-23: spatial bridge between parcels (polygons) and address_points (points). Populated by scripts/link-parcel-addresses.js via batched ST_Within. Cache; ON DELETE CASCADE from both sides; idempotent on re-run.';

-- ============================================================================
-- DOWN — Rule 6 comments-only per project convention (see migrations
-- 132/145/160/161 precedent). Manual rollback only.
-- ============================================================================
-- ALLOW-DESTRUCTIVE
-- ALTER TABLE parcel_address_points DROP CONSTRAINT IF EXISTS fk_parcel_address_points_address_point;
-- ALTER TABLE parcel_address_points DROP CONSTRAINT IF EXISTS fk_parcel_address_points_parcel;
-- DROP INDEX IF EXISTS idx_parcel_address_points_address_point_id;
-- DROP TABLE IF EXISTS parcel_address_points;
-- DROP INDEX IF EXISTS idx_address_points_linear_name_normalized;
-- DROP INDEX IF EXISTS idx_address_points_addr_num_normalized;
-- DROP INDEX IF EXISTS idx_address_points_geom_gist;
-- ALTER TABLE address_points
--   DROP COLUMN IF EXISTS linear_name_normalized,
--   DROP COLUMN IF EXISTS addr_num_normalized,
--   DROP COLUMN IF EXISTS geom,
--   DROP COLUMN IF EXISTS place_name,
--   DROP COLUMN IF EXISTS class_family_desc,
--   DROP COLUMN IF EXISTS address_class_desc,
--   DROP COLUMN IF EXISTS address_status,
--   DROP COLUMN IF EXISTS maint_stage,
--   DROP COLUMN IF EXISTS hi_num,
--   DROP COLUMN IF EXISTS lo_num,
--   DROP COLUMN IF EXISTS address_full,
--   DROP COLUMN IF EXISTS linear_name_full,
--   DROP COLUMN IF EXISTS address_number;
