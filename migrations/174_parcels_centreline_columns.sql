-- Migration 174: add centreline-enrichment columns to parcels (Spec 62 §8d / M-2).
-- Written by scripts/enrich-centreline.js (advisory lock 64) via the §11 spatial join.
-- SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md
-- SEPARATE from Spec 58 zoning (165) + Spec 59 ravine (168) + Spec 61 heritage (171) per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on the ~486K parcels).
-- The 4th column (centreline_dataset_version_when_enriched) mirrors mig 168/171 — lineage
-- propagation per §9 step-5 (spec §2 M-2 omits it; plan F1 fold) + future version-skip readiness.

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    RAISE NOTICE 'parcels table absent — skipping centreline columns';
    RETURN;
  END IF;

  ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS is_corner_lot                BOOLEAN NOT NULL DEFAULT false,  -- ≥2 different streets sharing an intersection node (§11)
    ADD COLUMN IF NOT EXISTS is_through_lot               BOOLEAN NOT NULL DEFAULT false,  -- ≥2 different parallel streets, no shared node (§11)
    ADD COLUMN IF NOT EXISTS primary_frontage_street_name TEXT,                            -- address-side street name (P1 name / P2 range / P3 longest)
    ADD COLUMN IF NOT EXISTS centreline_dataset_version_when_enriched TEXT;                 -- lineage = toronto_centreline.source_dataset_version (§9 step-5)
END
$mig$;

-- DOWN
-- ALTER TABLE parcels DROP COLUMN IF EXISTS centreline_dataset_version_when_enriched;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS primary_frontage_street_name;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS is_through_lot;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS is_corner_lot;
