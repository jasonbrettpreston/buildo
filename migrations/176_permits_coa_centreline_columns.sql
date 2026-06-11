-- Migration 176: add centreline-enrichment columns to permits + coa_applications (Spec 62 §8e / M-3).
-- Written by scripts/enrich-permits.js (lock 66) — propagates the §8d parcel centreline feed onto
-- leads via permit_parcels (permits) / lead_parcels (coa): is_corner_lot/is_through_lot bool_or'd
-- across linked parcels (L12), primary_frontage_street_name = smallest-par.id non-NULL (§11.1).
-- SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md
-- SEPARATE from the zoning (166) + ravine (169) + heritage (172) lead migrations per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on ~250K permits / ~33K coa).
-- No CHECK constraint (free-text street name; booleans are NOT NULL DEFAULT false). No lineage
-- column on the targets — the §L24 precondition reads parcels.centreline_dataset_version_when_enriched.
-- lock_timeout: bound the brief ACCESS EXCLUSIVE so a long-running query can't block the deploy.
--
-- Manual rollback (DOWN is commented per validate-migration Rule 6). DATA-LOSS: dropping these
-- columns discards the propagated centreline feed on permits/coa; re-deriving requires a full
-- enrich-permits.js re-run (ENRICH_TARGET=permits + =coa) after re-adding the columns.
--   ALTER TABLE permits           DROP COLUMN IF EXISTS primary_frontage_street_name, DROP COLUMN IF EXISTS is_through_lot, DROP COLUMN IF EXISTS is_corner_lot;
--   ALTER TABLE coa_applications  DROP COLUMN IF EXISTS primary_frontage_street_name, DROP COLUMN IF EXISTS is_through_lot, DROP COLUMN IF EXISTS is_corner_lot;

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS is_corner_lot                BOOLEAN NOT NULL DEFAULT false,  -- L12: any linked parcel a corner lot? (bool_or)
      ADD COLUMN IF NOT EXISTS is_through_lot               BOOLEAN NOT NULL DEFAULT false,  -- L12: any linked parcel a through lot? (bool_or)
      ADD COLUMN IF NOT EXISTS primary_frontage_street_name TEXT;                            -- §11.1: smallest-par.id non-NULL frontage name across linked parcels
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS is_corner_lot                BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_through_lot               BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS primary_frontage_street_name TEXT;
  END IF;
END
$mig$;

-- DOWN
-- ALTER TABLE permits DROP COLUMN IF EXISTS primary_frontage_street_name;
-- ALTER TABLE permits DROP COLUMN IF EXISTS is_through_lot;
-- ALTER TABLE permits DROP COLUMN IF EXISTS is_corner_lot;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS primary_frontage_street_name;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS is_through_lot;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS is_corner_lot;
