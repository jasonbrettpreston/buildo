-- Migration 188: existing-structure propagation columns on permits + coa_applications (Spec 65 Phase 1).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§ Existing structure — propagation)
--
-- Written by scripts/enrich-permits.js (lock 66) — propagates the parcels existing-structure feed
-- (mig 187) onto leads from the DOMINANT parcel via permit_parcels / lead_parcels, §8e pattern.
-- SEPARATE from the zoning (166) / ravine (169) / heritage (172) / centreline (176) / max-build (186)
-- lead migrations. All nullable, no default (no NOT-NULL bools → orphan-nullify uses the generic
-- = NULL path). Metadata-only adds. lock_timeout bounds the ACCESS EXCLUSIVE. DOWN comments-only.

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS existing_footprint_sqm          NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_stories                INTEGER,
      ADD COLUMN IF NOT EXISTS existing_height_m               NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_gfa_sqm                NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_width_m                NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_length_m               NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_structure_confidence   TEXT,
      ADD COLUMN IF NOT EXISTS existing_other_structures_count INTEGER,
      ADD COLUMN IF NOT EXISTS existing_other_structures_sqm   NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_greenspace_sqm         NUMERIC(12,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS existing_footprint_sqm          NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_stories                INTEGER,
      ADD COLUMN IF NOT EXISTS existing_height_m               NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_gfa_sqm                NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_width_m                NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_length_m               NUMERIC(8,2),
      ADD COLUMN IF NOT EXISTS existing_structure_confidence   TEXT,
      ADD COLUMN IF NOT EXISTS existing_other_structures_count INTEGER,
      ADD COLUMN IF NOT EXISTS existing_other_structures_sqm   NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS existing_greenspace_sqm         NUMERIC(12,2);
  END IF;
END
$mig$;

-- DOWN — comments-only (Rule 6). DATA-LOSS: re-derive via a full enrich-permits.js re-run.
-- ALTER TABLE permits DROP COLUMN IF EXISTS existing_footprint_sqm, DROP COLUMN IF EXISTS existing_stories,
--   DROP COLUMN IF EXISTS existing_height_m, DROP COLUMN IF EXISTS existing_gfa_sqm, DROP COLUMN IF EXISTS existing_width_m,
--   DROP COLUMN IF EXISTS existing_length_m, DROP COLUMN IF EXISTS existing_structure_confidence,
--   DROP COLUMN IF EXISTS existing_other_structures_count, DROP COLUMN IF EXISTS existing_other_structures_sqm,
--   DROP COLUMN IF EXISTS existing_greenspace_sqm;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS existing_footprint_sqm, ... (same column list);
