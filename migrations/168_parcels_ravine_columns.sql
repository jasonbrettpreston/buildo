-- Migration 168: add ravine-enrichment columns to parcels (Spec 59 §8d / M-2).
-- Written by scripts/enrich-ravines.js (advisory lock 60) via the §11.1 spatial join.
-- SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md
-- SEPARATE from Spec 58's parcels-zoning migration (165) per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on the ~486K parcels).

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    RAISE NOTICE 'parcels table absent — skipping ravine columns';
    RETURN;
  END IF;

  ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS is_in_ravine_protection_area   BOOLEAN NOT NULL DEFAULT false, -- L1: Chapter 658 applies?
    ADD COLUMN IF NOT EXISTS ravine_distance_m              DOUBLE PRECISION,                -- L2: signed metres (0 inside, <0 intersecting, >0 outside)
    ADD COLUMN IF NOT EXISTS ravine_dataset_version_when_enriched TEXT;                       -- L3: lineage = ravine_load.source_dataset_version
END
$mig$;

-- DOWN
-- ALTER TABLE parcels DROP COLUMN IF EXISTS ravine_dataset_version_when_enriched;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS ravine_distance_m;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS is_in_ravine_protection_area;
