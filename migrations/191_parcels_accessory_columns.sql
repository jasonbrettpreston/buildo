-- Migration 191: garage + rear-suite (laneway/garden) accessory-fit columns + abuts_laneway on parcels (Spec 65 Phase 3).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (§7 Accessory fit)
--
-- abuts_laneway is written by scripts/enrich-centreline.js (bool_or of the centreline seg_is_lane
-- flag; closes Spec 62 #431-FU2) — NOT NULL DEFAULT false (joins CENTRELINE_COLS for §8e propagation,
-- so orphan-nullify resets it to false, like is_corner_lot). The 8 garage/rear-suite columns are
-- written by the max-build pass (buildMaxBuildSql) — all nullable, metadata-only. *_permission is a
-- tri-state TEXT (as_of_right/coa_required/not_permitted) driven by post-accessory soft-landscaping.
-- No CHECK (script-validated). DOWN comments-only (Rule 6).

-- UP
SET LOCAL lock_timeout = '5s';
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS abuts_laneway             BOOLEAN NOT NULL DEFAULT false,  -- centreline seg_is_lane (Spec 62 #431-FU2)
  ADD COLUMN IF NOT EXISTS max_garage_gfa_sqm        NUMERIC(12,2),  -- by-law-capped garage footprint that fits the rear yard
  ADD COLUMN IF NOT EXISTS garage_capacity_cars      INTEGER,        -- floor(max_garage_gfa / car_footprint)
  ADD COLUMN IF NOT EXISTS garage_constraint_reason  TEXT,           -- heritage/ravine/lot_too_small/no_rear_yard/low_lot_confidence
  ADD COLUMN IF NOT EXISTS garage_permission         TEXT,           -- as_of_right/coa_required/not_permitted (greenspace-driven)
  ADD COLUMN IF NOT EXISTS max_laneway_suite_gfa_sqm NUMERIC(12,2),  -- lane-gated 2-storey suite GFA
  ADD COLUMN IF NOT EXISTS max_rear_suite_gfa_sqm    NUMERIC(12,2),  -- chosen suite GFA (laneway XOR garden) — LANE archetype geom_basis
  ADD COLUMN IF NOT EXISTS rear_suite_type           TEXT,           -- 'laneway'|'garden'|NULL (mutually exclusive by abuts_laneway)
  ADD COLUMN IF NOT EXISTS rear_suite_permission     TEXT;           -- as_of_right/coa_required/not_permitted (greenspace-driven)

COMMENT ON COLUMN parcels.abuts_laneway IS 'Spec 65 Phase 3 (Spec 62 #431-FU2): parcel abuts a Toronto laneway (bool_or of centreline seg_is_lane within the §8d 20m proximity model). Gates laneway-suite eligibility.';
COMMENT ON COLUMN parcels.garage_permission IS 'Spec 65 Phase 3: as_of_right (greenspace ≥ min_soft_landscaping_pct after the garage) / coa_required (fits but breaches soft-landscaping → minor variance) / not_permitted. Scope: greenspace standard only — setback/height/FSI variances not evaluated.';
COMMENT ON COLUMN parcels.rear_suite_type IS 'Spec 65 Phase 3: laneway (abuts_laneway) XOR garden (no lane) — mutually exclusive per by-law; NULL = neither fits. max_rear_suite_gfa_sqm carries the chosen GFA.';
COMMENT ON COLUMN parcels.rear_suite_permission IS 'Spec 65 Phase 3: as_of_right/coa_required/not_permitted for the chosen rear suite (greenspace-driven; same scope caveat as garage_permission).';

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- ALTER TABLE parcels
--   DROP COLUMN IF EXISTS abuts_laneway,
--   DROP COLUMN IF EXISTS max_garage_gfa_sqm,
--   DROP COLUMN IF EXISTS garage_capacity_cars,
--   DROP COLUMN IF EXISTS garage_constraint_reason,
--   DROP COLUMN IF EXISTS garage_permission,
--   DROP COLUMN IF EXISTS max_laneway_suite_gfa_sqm,
--   DROP COLUMN IF EXISTS max_rear_suite_gfa_sqm,
--   DROP COLUMN IF EXISTS rear_suite_type,
--   DROP COLUMN IF EXISTS rear_suite_permission;
