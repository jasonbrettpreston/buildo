-- Migration 172: add heritage-enrichment columns to permits + coa_applications (Spec 61 §8e / M-3).
-- Written by scripts/enrich-permits.js (lock 66) — propagates the §8d parcel heritage feed onto
-- leads via permit_parcels (permits) / lead_parcels (coa), L12 Part-IV-wins precedence.
-- SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
-- SEPARATE from the zoning (166) + ravine (169) lead migrations per L11.
-- Additive, constant DEFAULT → PG 11+ metadata-only add (no rewrite on ~250K permits / ~33K coa).
-- lock_timeout: the metadata-only add still needs a brief ACCESS EXCLUSIVE; bound the wait so a
-- long-running query can't block the deploy. SET LOCAL → scoped to migrate.js's per-file txn.

-- UP
SET LOCAL lock_timeout = '5s';
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits') THEN
    ALTER TABLE permits
      ADD COLUMN IF NOT EXISTS is_heritage_designated   BOOLEAN NOT NULL DEFAULT false,                 -- L1: Ontario Heritage Act Part IV/V applies?
      ADD COLUMN IF NOT EXISTS heritage_designation_type TEXT
        CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')), -- L12: Part IV wins over Part V HCD (bool_or across linked parcels)
      ADD COLUMN IF NOT EXISTS heritage_designation_date DATE;                                          -- L2: from the winning type's parcel (MIN date)
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coa_applications') THEN
    ALTER TABLE coa_applications
      ADD COLUMN IF NOT EXISTS is_heritage_designated   BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS heritage_designation_type TEXT
        CHECK (heritage_designation_type IS NULL OR heritage_designation_type IN ('part_iv_individual', 'part_v_hcd')),
      ADD COLUMN IF NOT EXISTS heritage_designation_date DATE;
  END IF;
END
$mig$;

-- DOWN
-- ALTER TABLE permits DROP COLUMN IF EXISTS heritage_designation_date;
-- ALTER TABLE permits DROP COLUMN IF EXISTS heritage_designation_type;
-- ALTER TABLE permits DROP COLUMN IF EXISTS is_heritage_designated;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS heritage_designation_date;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS heritage_designation_type;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS is_heritage_designated;
