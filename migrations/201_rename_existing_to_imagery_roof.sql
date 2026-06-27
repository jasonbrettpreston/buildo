-- 201: rename existing_footprint_sqm/existing_gfa_sqm → imagery_roof_* — Spec 78 Phase 3B (honesty relabel).
--
-- These two columns are MASSING/IMAGERY-derived (roof-footprint from building_footprints, GFA = footprint
-- × stories) and per the massing-footprint-reliability investigation are unreliable per-parcel (±20–38%,
-- tree-contaminated). They were named `existing_*` which falsely presents them as authoritative
-- existing-structure measurements. Rename to `imagery_roof_*` so the column NAME tells the truth (the
-- transparency initiative: "if we can't see it, it's a false representation"). LOCKSTEP rename across
-- parcels + permits + coa_applications (mig 187/188 created them on all three; the EXISTING_COLS array in
-- max-build.js drives propagation + orphan-nullify, so its entries rename in the same change).
--
-- NB: the cost-model geom_basis no longer reads these (WF3-A remapped ADD/BAS→cur_floor, INT→cur_pot_2story;
-- archetypes.ts does not reference them). The max-build heritage fallback uses a query-LOCAL CTE alias
-- recomputed from massing (NOT the persisted column), so it is unaffected.
--
-- RENAME COLUMN is metadata-only (no table rewrite). Guarded so re-runs are no-ops. Rollback comments-only
-- per Rule 6 (single-txn runner — tasks/lessons.md).

-- UP
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['parcels','permits','coa_applications'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'existing_footprint_sqm') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN existing_footprint_sqm TO imagery_roof_footprint_sqm', t);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'existing_gfa_sqm') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN existing_gfa_sqm TO imagery_roof_gfa_sqm', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN parcels.imagery_roof_footprint_sqm IS 'Spec 78 §F/§L: MASSING/IMAGERY roof footprint (Σ primary building_footprints area). Unreliable per-parcel (±20–38%, tree-contaminated) — a flagged FALLBACK, NOT an authoritative existing-structure size. Renamed from existing_footprint_sqm (mig 201).';
COMMENT ON COLUMN parcels.imagery_roof_gfa_sqm IS 'Spec 78 §F/§L: IMAGERY roof footprint × stories. Unreliable; no live cost-model consumer (GFA computed from building_footprints). Renamed from existing_gfa_sqm (mig 201).';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['parcels','permits','coa_applications'] LOOP
--   EXECUTE format('ALTER TABLE %I RENAME COLUMN imagery_roof_footprint_sqm TO existing_footprint_sqm', t);
--   EXECUTE format('ALTER TABLE %I RENAME COLUMN imagery_roof_gfa_sqm TO existing_gfa_sqm', t);
-- END LOOP; END $$;
