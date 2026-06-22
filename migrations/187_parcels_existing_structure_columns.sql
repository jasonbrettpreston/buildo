-- Migration 187: existing-structure columns on parcels (Spec 65 Phase 1).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§ Existing structure)
--
-- Written by scripts/enrich-parcels.js (lock 65) in a THIRD set-based UPDATE pass
-- (buildExistingStructureSql) that reads the PRIMARY linked building
-- (parcel_buildings is_primary → building_footprints) + lot, computing the current
-- dwelling's dimensions. SEPARATE from the zoning feed (165) and max-build (185) — its
-- own EXISTING_COLS array + UPDATE; the max-build/heritage code is untouched. All nullable,
-- no default → metadata-only ADD on PG11+ (instant on 486K rows). No CHECK (script-validated).
-- No index here (validate-migration Rule 2). DOWN comments-only (Rule 6). lock_timeout bounds
-- the brief ACCESS EXCLUSIVE.

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS existing_footprint_sqm          NUMERIC(12,2),  -- primary building footprint
  ADD COLUMN IF NOT EXISTS existing_stories                INTEGER,        -- primary estimated_stories (height-derived)
  ADD COLUMN IF NOT EXISTS existing_height_m               NUMERIC(8,2),   -- primary max_height_m
  ADD COLUMN IF NOT EXISTS existing_gfa_sqm                NUMERIC(12,2),  -- footprint × GREATEST(1, stories)
  ADD COLUMN IF NOT EXISTS existing_width_m                NUMERIC(8,2),   -- oriented-envelope shorter side (m)
  ADD COLUMN IF NOT EXISTS existing_length_m               NUMERIC(8,2),   -- oriented-envelope longer side (m)
  ADD COLUMN IF NOT EXISTS existing_structure_confidence   TEXT,           -- high/low from primary link confidence
  ADD COLUMN IF NOT EXISTS existing_other_structures_count INTEGER,        -- # non-primary buildings (garage/shed/other)
  ADD COLUMN IF NOT EXISTS existing_other_structures_sqm   NUMERIC(12,2),  -- Σ non-primary footprint
  ADD COLUMN IF NOT EXISTS existing_greenspace_sqm         NUMERIC(12,2);  -- lot − primary − other (unbuilt open area)

COMMENT ON COLUMN parcels.existing_footprint_sqm IS 'Spec 65 Phase 1: PRIMARY linked building footprint (parcel_buildings is_primary → building_footprints). Data source = Spec 56 massing.';
COMMENT ON COLUMN parcels.existing_gfa_sqm IS 'Spec 65 Phase 1: footprint × GREATEST(1, estimated_stories). Cost-model Step A geometric truth for the EXISTING structure.';
COMMENT ON COLUMN parcels.existing_structure_confidence IS 'Spec 65 Phase 1: high (primary link confidence >= 0.90, centroid-in-parcel) / low (nearest 0.60). Consumers should treat low as a possible neighbour-building link.';
COMMENT ON COLUMN parcels.existing_greenspace_sqm IS 'Spec 65 Phase 1: GREATEST(0, lot_size − footprint − other-structures). Unbuilt open area (assumes non-overlapping footprints; not vegetation-verified).';

-- DOWN — Rule 6 comments-only (migrate.js runs the whole file in one transaction; an uncommented
-- statement would execute right after UP and undo it — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS existing_footprint_sqm,
--   DROP COLUMN IF EXISTS existing_stories,
--   DROP COLUMN IF EXISTS existing_height_m,
--   DROP COLUMN IF EXISTS existing_gfa_sqm,
--   DROP COLUMN IF EXISTS existing_width_m,
--   DROP COLUMN IF EXISTS existing_length_m,
--   DROP COLUMN IF EXISTS existing_structure_confidence,
--   DROP COLUMN IF EXISTS existing_other_structures_count,
--   DROP COLUMN IF EXISTS existing_other_structures_sqm,
--   DROP COLUMN IF EXISTS existing_greenspace_sqm;
