-- Migration 171: add heritage-enrichment columns to parcels (Spec 61 §8d / M-2).
-- Written by scripts/enrich-heritage.js (advisory lock 62) via the §11.1 spatial join.
-- SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
-- SEPARATE from Spec 58 zoning (165) + Spec 59 ravine (168) parcels migrations per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on the ~486K parcels).
-- The 4th column (heritage_dataset_version_when_enriched) mirrors mig 168's
-- ravine_dataset_version_when_enriched — lineage + the §8e enrich precondition (spec §2 omits it; DEC-B).

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels') THEN
    RAISE NOTICE 'parcels table absent — skipping heritage columns';
    RETURN;
  END IF;

  ALTER TABLE parcels
    ADD COLUMN IF NOT EXISTS is_heritage_designated   BOOLEAN NOT NULL DEFAULT false,                 -- L1: Ontario Heritage Act Part IV/V applies?
    ADD COLUMN IF NOT EXISTS heritage_designation_type TEXT
      CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')), -- L12: Part IV wins over Part V HCD
    ADD COLUMN IF NOT EXISTS heritage_designation_date DATE,                                          -- L2: from heritage_properties/heritage_districts.designated_date (nullable; sentinel→NULL)
    ADD COLUMN IF NOT EXISTS heritage_dataset_version_when_enriched TEXT;                             -- lineage = '<register_version>|<districts_version>'
END
$mig$;

-- DOWN
-- ALTER TABLE parcels DROP COLUMN IF EXISTS heritage_dataset_version_when_enriched;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS heritage_designation_date;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS heritage_designation_type;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS is_heritage_designated;
