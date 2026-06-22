-- Migration 189: reno/build scenario GFA columns + max_build_stories_basis on parcels (Spec 65 Phase 2).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§6 Reno/build scenarios)
--
-- Written by scripts/enrich-parcels.js: the 6 scenario GFAs by a sibling UPDATE in the existing-
-- structure pass (pure arithmetic off existing_* + max-build); max_build_stories_basis by the
-- max-build pass (storey-height refinement — 'bylaw' when the by-law gives a storey count, else
-- 'derived'). All nullable, metadata-only adds. No CHECK (script-validated). DOWN comments-only.

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS max_newbuild_coa_gfa_sqm  NUMERIC(12,2),  -- FB+COA = max_buildable_gfa × (1+coa_uplift)
  ADD COLUMN IF NOT EXISTS cur_basement_gfa_sqm      NUMERIC(12,2),  -- BAS = existing_footprint
  ADD COLUMN IF NOT EXISTS cur_storey_gfa_sqm        NUMERIC(12,2),  -- ADD = footprint × storey-headroom
  ADD COLUMN IF NOT EXISTS cur_interior_reno_gfa_sqm NUMERIC(12,2),  -- INT = existing_gfa (full gut)
  ADD COLUMN IF NOT EXISTS cur_est_kitchen_gfa_sqm   NUMERIC(12,2),  -- KIT = existing_footprint × kitchen_pct
  ADD COLUMN IF NOT EXISTS cur_est_bath_gfa_sqm      NUMERIC(12,2),  -- BTH = existing_footprint × bath_pct
  ADD COLUMN IF NOT EXISTS max_build_stories_basis   TEXT;           -- bylaw / derived (storey-height provenance)

COMMENT ON COLUMN parcels.cur_storey_gfa_sqm IS 'Spec 65 Phase 2: ADD archetype — vertical headroom GFA = existing_footprint × (max_build_stories − existing_stories). NULL when storeys unknown (not 0).';
COMMENT ON COLUMN parcels.max_newbuild_coa_gfa_sqm IS 'Spec 65 Phase 2: FB+COA — max_buildable_gfa × (1 + reno_coa_uplift_pct logic-var).';
COMMENT ON COLUMN parcels.max_build_stories_basis IS 'Spec 65 Phase 2: bylaw (from bylaw_max_stories) vs derived (height ÷ use-class storey-height).';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS max_newbuild_coa_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_basement_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_storey_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_interior_reno_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_est_kitchen_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_est_bath_gfa_sqm,
--   DROP COLUMN IF EXISTS max_build_stories_basis;
