-- Migration 196: pocket-storey + neighbourhood-premium columns on parcels (Spec 65 §4/§8 / WF3-C2).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§4 MB-3 stories, §8 C2 consumer)
--
-- Written by scripts/enrich-parcels.js max-build pass via a parcels→neighbourhoods spatial join:
--   max_build_stories_aggressive = pocket p90 (market-realized ceiling, uncapped)
--   market_exceeds_bylaw         = pocket p90 > by-law height-implied storeys (CoA/variance hotspot)
--   neighbourhood_id             = neighbourhoods.id (the reusable link; demographic fields stay joinable)
--   neighbourhood_cost_premium   = income-tier multiplier 1.00-1.85 (SAME model the permit cost model applies)
-- All nullable except the NOT-NULL bool (DEFAULT false, matching garden_suite_fits). Metadata-only adds.
-- Rollback comments-only per Rule 6 (single-txn runner); see trailer.

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS max_build_stories_aggressive INTEGER,
  ADD COLUMN IF NOT EXISTS market_exceeds_bylaw         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS neighbourhood_id             INTEGER,
  ADD COLUMN IF NOT EXISTS neighbourhood_cost_premium   NUMERIC(4,2);

COMMENT ON COLUMN parcels.max_build_stories_aggressive IS 'Spec 65 WF3-C2: pocket p90 — the market-realized storey ceiling (often via variance); UNCAPPED. NULL where no pocket norm.';
COMMENT ON COLUMN parcels.market_exceeds_bylaw IS 'Spec 65 WF3-C2: true = pocket p90 exceeds by-law height-implied storeys (CoA/variance hotspot lead signal); false = within by-law OR no pocket data.';
COMMENT ON COLUMN parcels.neighbourhood_id IS 'Spec 65 WF3-C2: neighbourhoods.id from the parcel-centroid spatial join (the reusable link). NULL for parcels outside all neighbourhood polygons.';
COMMENT ON COLUMN parcels.neighbourhood_cost_premium IS 'Spec 65 WF3-C2: income-tier cost premium (1.00-1.85), SAME model the permit cost model applies (DEFAULT_PREMIUM_TIERS). 1.00 when income unknown.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS max_build_stories_aggressive,
--   DROP COLUMN IF EXISTS market_exceeds_bylaw,
--   DROP COLUMN IF EXISTS neighbourhood_id,
--   DROP COLUMN IF EXISTS neighbourhood_cost_premium;
