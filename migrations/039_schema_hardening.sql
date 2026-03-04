-- Migration 039: Schema Hardening
-- PostGIS extension, native geometry columns, FK constraints, partial indexes,
-- and CQA pipeline schedule seeds.

-- ---------------------------------------------------------------------------
-- 1A: PostGIS + Native Geometry Columns
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

-- Parallel geom column on parcels (keeps existing geometry JSONB intact)
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);

-- Backfill parcels geom from JSONB
UPDATE parcels
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
WHERE geometry IS NOT NULL AND geom IS NULL;

CREATE INDEX IF NOT EXISTS idx_parcels_geom_gist ON parcels USING GiST (geom);

-- Parallel geom column on neighbourhoods
ALTER TABLE neighbourhoods ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);

-- Backfill neighbourhoods geom from JSONB
UPDATE neighbourhoods
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
WHERE geometry IS NOT NULL AND geom IS NULL;

CREATE INDEX IF NOT EXISTS idx_neighbourhoods_geom_gist ON neighbourhoods USING GiST (geom);

-- ---------------------------------------------------------------------------
-- 1B: Foreign Key Constraints
-- ---------------------------------------------------------------------------

-- Clean orphaned permit_trades rows before adding FK
DELETE FROM permit_trades
WHERE NOT EXISTS (
  SELECT 1 FROM permits p
  WHERE p.permit_num = permit_trades.permit_num
    AND p.revision_num = permit_trades.revision_num
);

-- Clean orphaned permit_parcels rows
DELETE FROM permit_parcels
WHERE NOT EXISTS (
  SELECT 1 FROM permits p
  WHERE p.permit_num = permit_parcels.permit_num
    AND p.revision_num = permit_parcels.revision_num
);

-- Null out orphaned coa_applications linked_permit_num
UPDATE coa_applications
SET linked_permit_num = NULL
WHERE linked_permit_num IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM permits p
    WHERE p.permit_num = coa_applications.linked_permit_num
  );

-- Add FK on permit_trades (NOT VALID for fast add, then validate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_permit_trades_permits'
  ) THEN
    ALTER TABLE permit_trades
      ADD CONSTRAINT fk_permit_trades_permits
      FOREIGN KEY (permit_num, revision_num)
      REFERENCES permits(permit_num, revision_num)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE permit_trades VALIDATE CONSTRAINT fk_permit_trades_permits;

-- Add FK on permit_parcels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_permit_parcels_permits'
  ) THEN
    ALTER TABLE permit_parcels
      ADD CONSTRAINT fk_permit_parcels_permits
      FOREIGN KEY (permit_num, revision_num)
      REFERENCES permits(permit_num, revision_num)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE permit_parcels VALIDATE CONSTRAINT fk_permit_parcels_permits;

-- NOTE: CoA FK skipped — permits PK is composite (permit_num, revision_num)
-- and there's no unique index on permit_num alone. CQA Tier 2 referential
-- audit handles orphan detection instead.

-- ---------------------------------------------------------------------------
-- 1C: Partial Indexes for Workers
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_permits_needs_geocode
  ON permits(permit_num, revision_num)
  WHERE geocoded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_builders_needs_enrich
  ON builders(id)
  WHERE enriched_at IS NULL OR enriched_at < NOW() - INTERVAL '30 days';

-- ---------------------------------------------------------------------------
-- 1E: CQA Pipeline Schedule Seeds
-- ---------------------------------------------------------------------------

INSERT INTO pipeline_schedules (pipeline, cadence) VALUES
  ('assert_schema',      'Daily'),
  ('assert_data_bounds', 'Daily')
ON CONFLICT (pipeline) DO NOTHING;
