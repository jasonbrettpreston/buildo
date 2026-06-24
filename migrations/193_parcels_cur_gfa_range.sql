-- Migration 193: current-building GFA range + existing data-quality flag on parcels (Spec 65 Phase 1 / WF3-A).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§5 existing-structure honesty, §6 cur-GFA range)
--
-- WF3-A retires the tree-contaminated existing_height_m/existing_stories (their VALUES are NULLed on
-- re-enrich — the columns stay until a later cleanup DROP) and replaces the single contaminated
-- existing_gfa_sqm with a neighbourhood-bounded range: a high-confidence known floor + plausible
-- upper scenarios capped by what the pocket actually builds (max_build_stories). Plus a mislink
-- sentinel (existing_footprint > lot → wrong building attributed → whole existing structure NULLed).
-- All nullable, metadata-only adds. No CHECK (script-validated). DOWN comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS cur_floor_gfa_sqm       NUMERIC(12,2),  -- known single-floor area = existing_footprint (basement/single-storey/minimum)
  ADD COLUMN IF NOT EXISTS cur_pot_2story_gfa_sqm  NUMERIC(12,2),  -- plausible 2-storey scenario = footprint × 2 (always emitted)
  ADD COLUMN IF NOT EXISTS cur_pot_3story_gfa_sqm  NUMERIC(12,2),  -- 3-storey scenario = footprint × 3; NULL unless pocket supports 3 (max_build_stories >= 3)
  ADD COLUMN IF NOT EXISTS cur_gfa_range_basis     TEXT,           -- '1-2' | '1-3' | NULL (range flag; ASCII hyphen)
  ADD COLUMN IF NOT EXISTS existing_data_quality_flag TEXT;        -- 'footprint_exceeds_lot' mislink sentinel, else NULL

COMMENT ON COLUMN parcels.cur_floor_gfa_sqm IS 'Spec 65 WF3-A: known single-floor area (= existing_footprint). Serves basement / single-storey / minimum archetypes; cost RATE differentiates, not geometry. HIGH confidence.';
COMMENT ON COLUMN parcels.cur_pot_2story_gfa_sqm IS 'Spec 65 WF3-A: plausible 2-storey GFA = existing_footprint × 2 (always emitted when footprint known). Estimate, not a fact.';
COMMENT ON COLUMN parcels.cur_pot_3story_gfa_sqm IS 'Spec 65 WF3-A: 3-storey GFA = existing_footprint × 3. NULL unless the pocket supports 3 storeys (max_build_stories >= 3).';
COMMENT ON COLUMN parcels.cur_gfa_range_basis IS 'Spec 65 WF3-A: neighbourhood-bounded current-GFA range flag — ''1-2'' when max_build_stories <= 2, ''1-3'' when >= 3, NULL when max_build_stories or footprint unknown.';
COMMENT ON COLUMN parcels.existing_data_quality_flag IS 'Spec 65 WF3-A: ''footprint_exceeds_lot'' when existing_footprint > lot×(1+tol) (mislink — wrong building attributed; whole existing structure NULLed), else NULL.';
COMMENT ON COLUMN parcels.existing_stories IS 'DEPRECATED (Spec 65 WF3-A): tree-canopy contaminated (massing estimated_stories ≈ h/3 on canopy-inflated heights). NULLed on re-enrich; superseded by cur_gfa_range_basis + cur_pot_*. Raw value → records_meta forensics.';
COMMENT ON COLUMN parcels.existing_height_m IS 'DEPRECATED (Spec 65 WF3-A): tree-canopy contaminated (massing max_height_m catches overhanging canopy, not roof; bungalows to 85-95 m). NULLed on re-enrich. Raw value → records_meta forensics.';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS cur_floor_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_pot_2story_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_pot_3story_gfa_sqm,
--   DROP COLUMN IF EXISTS cur_gfa_range_basis,
--   DROP COLUMN IF EXISTS existing_data_quality_flag;
