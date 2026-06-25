-- Migration 197: pocket-storey + neighbourhood-premium propagation on permits + coa_applications (Spec 65 §4/§8 / WF3-C2).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§4/§8 — propagation)
--
-- scripts/enrich-permits.js propagates the 4 WF3-C2 cols from the DOMINANT parcel via the existing
-- LOT_MAXBUILD propagation. NB: permits already have their OWN neighbourhood_id (mig 014); this is the
-- DOMINANT-PARCEL neighbourhood_id riding the max-build feed (envelope context). All nullable except the
-- NOT-NULL bool (DEFAULT false). Metadata-only. Rollback comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS max_build_stories_aggressive INTEGER,
      ADD COLUMN IF NOT EXISTS market_exceeds_bylaw         BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS neighbourhood_cost_premium   NUMERIC(4,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS max_build_stories_aggressive INTEGER,
      ADD COLUMN IF NOT EXISTS market_exceeds_bylaw         BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS neighbourhood_cost_premium   NUMERIC(4,2);
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6).
-- ALTER TABLE permits DROP COLUMN IF EXISTS max_build_stories_aggressive, DROP COLUMN IF EXISTS market_exceeds_bylaw, DROP COLUMN IF EXISTS neighbourhood_cost_premium;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS max_build_stories_aggressive, ... (same list);
