-- 163: scope_intensity_matrix re-key to production vocabulary (Spec 83 §3.A).
-- Idempotent: re-running is safe (ON CONFLICT DO UPDATE on existing PRIMARY KEY).
--
-- Background: the 18-row matrix was seeded with normalized lowercase vocabulary
-- ('sfd', 'townhouse', 'commercial', 'new building', 'alteration', 'addition',
-- 'interior alteration') while production permits carry Toronto's CKAN Title
-- Case values ('SFD - Detached', 'Building Additions/Alterations', etc.). This
-- vocabulary mismatch caused 100% of permits to safe-skip the matrix lookup
-- and produce cost_source='none' for ~14 days before the regression was caught.
-- This migration deletes the old keys and seeds production-vocabulary rows.
--
-- See: docs/specs/01-pipeline/83_lead_cost_model.md §3.A (vocabulary contract — owner)
--      docs/reports/wf1-cost-matrix-rekey-pis.md (PI outputs)
--      docs/reports/wf1-cost-matrix-rekey-allocation-mapping.md (PI-3 mapping)

-- ============================================================================
-- UP
-- ============================================================================

BEGIN;

-- PRIMARY KEY (permit_type, structure_type) already exists per migration 096
-- line 44 — no new UNIQUE constraint needed. ON CONFLICT below targets the PK.

-- Spec 83 §3.A(c) allocation CHECK constraint (was missing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scope_intensity_matrix_alloc_chk'
  ) THEN
    ALTER TABLE scope_intensity_matrix
      ADD CONSTRAINT scope_intensity_matrix_alloc_chk
      CHECK (gfa_allocation_percentage > 0 AND gfa_allocation_percentage <= 1);
  END IF;
END $$;

-- Delete the 18 old lowercase-vocabulary rows by EXACT (permit_type, structure_type)
-- pair (not by permit_type alone — that would nuke any future-expansion row
-- sharing a permit_type with a different structure_type).
DELETE FROM scope_intensity_matrix WHERE (permit_type, structure_type) IN (
  ('addition', 'commercial'),
  ('addition', 'multi-residential'),
  ('addition', 'semi-detached'),
  ('addition', 'sfd'),
  ('addition', 'townhouse'),
  ('alteration', 'commercial'),
  ('alteration', 'multi-residential'),
  ('alteration', 'semi-detached'),
  ('alteration', 'sfd'),
  ('alteration', 'townhouse'),
  ('interior alteration', 'commercial'),
  ('interior alteration', 'sfd'),
  ('new building', 'commercial'),
  ('new building', 'garden suite'),
  ('new building', 'multi-residential'),
  ('new building', 'semi-detached'),
  ('new building', 'sfd'),
  ('new building', 'townhouse')
);

-- Insert production-vocabulary Tier 1 rows from PI-3 mapping doc.
INSERT INTO scope_intensity_matrix (permit_type, structure_type, gfa_allocation_percentage) VALUES
  ('Small Residential Projects',     'SFD - Detached',                    0.25),
  ('Small Residential Projects',     'SFD - Semi-Detached',               0.25),
  ('New Houses',                     'SFD - Detached',                    1.00),
  ('Building Additions/Alterations', 'Office',                            0.20),
  ('Building Additions/Alterations', 'Apartment Building',                0.15),
  ('Building Additions/Alterations', 'Retail Store',                      0.20),
  ('Building Additions/Alterations', 'Multiple Unit Building',            0.15),
  ('New Houses',                     'SFD - Townhouse',                   1.00),
  ('Small Residential Projects',     '2 Unit - Detached',                 0.15),
  ('Small Residential Projects',     'SFD - Townhouse',                   0.25),
  ('Building Additions/Alterations', 'Multiple Use/Non Residential',      0.20),
  ('Small Residential Projects',     'Laneway / Rear Yard Suite',         1.00),
  ('Building Additions/Alterations', 'Other',                             0.20),
  ('Building Additions/Alterations', 'Restaurant 30 Seats or Less',       0.20),
  ('Building Additions/Alterations', 'Industrial',                        0.20),
  ('New Houses',                     'Stacked Townhouses',                1.00),
  ('Residential Building Permit',    'SFD - Detached',                    1.00),
  ('Building Additions/Alterations', 'Restaurant Greater Than 30 Seats',  0.20),
  ('Small Residential Projects',     'Unknown',                           0.25),
  ('Small Residential Projects',     '2 Unit - Semi-detached',            0.15),
  ('Small Residential Projects',     'Converted House',                   0.25),
  ('Building Additions/Alterations', 'Medical/Dental Office',             0.20),
  ('Small Residential Projects',     '3+ Unit - Detached',                0.15),
  ('Building Additions/Alterations', 'Hospital',                          0.20),
  ('New Building',                   'Apartment Building',                1.00),
  ('New Building',                   'Mixed Use/Res w Non Res',           1.00),
  ('Residential Building Permit',    'SFD - Townhouse',                   1.00),
  ('Building Additions/Alterations', 'Place of Worship',                  0.20),
  ('New Houses',                     'SFD - Semi-Detached',               1.00),
  ('Building Additions/Alterations', 'Elementary School',                 0.20),
  ('New Houses',                     '3+ Unit - Detached',                1.00),
  ('Building Additions/Alterations', 'University',                        0.20)
ON CONFLICT (permit_type, structure_type) DO UPDATE
  SET gfa_allocation_percentage = EXCLUDED.gfa_allocation_percentage;

COMMIT;

-- ============================================================================
-- DOWN — Rule 6 comments-only per project convention (migrations
-- 132/145/160/161/162/164 precedent). Manual rollback only; migrate.js runs the
-- whole file in one transaction and does NOT honour -- UP / -- DOWN markers, so
-- any executable SQL below would run on every apply.
-- ============================================================================
-- Rollback re-keys the matrix to the pre-163 lowercase vocabulary (itself the
-- broken state §3.A fixed) and drops the allocation CHECK. Manual only:
-- ALLOW-DESTRUCTIVE
--   DELETE FROM scope_intensity_matrix
--     WHERE (permit_type, structure_type) IN ( <the 32 production pairs seeded above> );
--   ALTER TABLE scope_intensity_matrix DROP CONSTRAINT IF EXISTS scope_intensity_matrix_alloc_chk;
--   -- then re-INSERT the original 18 lowercase rows from migration 096_surgical_valuation.sql.
