-- 147: phase_stay_calibration — drop legacy PRIMARY KEY (permit_type, phase);
-- make permit_type + phase nullable; add partial unique index for permit-side
-- 2-tuple uniqueness; add partial composite index on lifecycle_transitions
-- for the CoA aggregate's LAG window.
--
-- Background: mig 123 created `phase_stay_calibration` with PK (permit_type, phase).
-- Mig 135 added 4 granular cohort-dim columns (project_type, coa_type_class,
-- from_seq, to_seq) + UNIQUE INDEX `phase_stay_calibration_new_unique` on the
-- 5-tuple with DEFAULT NULLS DISTINCT but did NOT drop the legacy PK. Mig 135's
-- own comment foreshadowed this: "The pre-existing PK on (permit_type, phase)
-- enforces uniqueness during the transition" — implying Phase E was expected
-- to handle the PK drop.
--
-- Phase E.3 (this migration) drops the legacy PK so CoA-side rows can insert:
--   - CoA leads have permit_type = NULL (no permit_type — they're pre-permit).
--   - CoA cohorts with all-null from_phase partitions have phase = NULL via
--     `MIN(from_phase)` aggregate over the all-null partition.
--
-- Replacement constraints (no integrity regression):
--   1. Mig 135's `phase_stay_calibration_new_unique` on
--      (permit_type, project_type, coa_type_class, from_seq, to_seq)
--      with NULLS DISTINCT enforces row uniqueness on the new 5-tuple shape.
--   2. NEW partial unique index `phase_stay_calibration_permit_legacy_unique`
--      on (permit_type, phase) WHERE permit_type IS NOT NULL — restores the
--      structural 2-tuple uniqueness for permit-side rows while excluding
--      CoA-side rows (permit_type NULL) from the constraint.
--
-- Plan v5 — fold trail:
--   - v3 fold v2-G (Independent CRITICAL): legacy PK blocks CoA-side INSERTs
--     with permit_type=NULL.
--   - v3 fold v2-E (Independent HIGH): MIN(from_phase) over all-NULL partition
--     returns NULL; phase NOT NULL would reject.
--   - v4 fold v3-DS-1 (DeepSeek CRIT): permit-side 2-tuple uniqueness lost
--     after PK drop — fixed via partial unique index above.
--   - v4 fold v3-G-HIGH-2 (Gemini HIGH): LAG composite index on
--     lifecycle_transitions for CoA aggregate performance.
--   - v4 fold v3-IF (Independent CRITICAL): NO explicit BEGIN/COMMIT here.
--     Mig 135's R8 CI hotfix documented the recurring failure mode — the
--     migrate.js runner wraps each non-CONCURRENTLY migration in an outer
--     transaction; an explicit BEGIN/COMMIT inside commits the outer
--     transaction prematurely, decoupling the DDL from the schema_migrations
--     recordApplied INSERT.
--   - v5 fold v4-M1 (Gemini MED): DOWN block adds DELETE step for NULL phase
--     rows before re-adding SET NOT NULL constraint.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6 + §6.11 Phase E.3
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
-- SPEC LINK: docs/specs/00-architecture/01_database_schema.md §3.A

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- Drop the legacy PRIMARY KEY. Mig 135's UNIQUE INDEX on
-- (permit_type, project_type, coa_type_class, from_seq, to_seq) with
-- DEFAULT NULLS DISTINCT enforces row uniqueness on the new shape.
ALTER TABLE phase_stay_calibration
  DROP CONSTRAINT IF EXISTS phase_stay_calibration_pkey;

-- Make permit_type nullable so CoA-side rows (permit_type=NULL) can insert.
ALTER TABLE phase_stay_calibration
  ALTER COLUMN permit_type DROP NOT NULL;

-- Make phase nullable so cohorts with MIN(from_phase)=NULL (all-null
-- partition: first-classification rows where E.2 wrote from_phase=NULL)
-- can insert.
ALTER TABLE phase_stay_calibration
  ALTER COLUMN phase DROP NOT NULL;

-- v5 fold v3-DS-1 + v3-Indep-A: partial unique index restores structural
-- 2-tuple uniqueness for permit-side rows (where permit_type IS NOT NULL).
-- CoA-side rows have permit_type NULL → excluded by the partial filter →
-- can coexist with permit-side rows under mig 135's 5-tuple UNIQUE INDEX
-- (NULLS DISTINCT). External writers or future bugs cannot create duplicate
-- (permit_type, phase) rows for legacy permit-side cohorts.
CREATE UNIQUE INDEX IF NOT EXISTS phase_stay_calibration_permit_legacy_unique
  ON phase_stay_calibration (permit_type, phase)
  WHERE permit_type IS NOT NULL;

-- v5 fold v3-G-HIGH-2: partial composite index on lifecycle_transitions
-- to support the CoA aggregate's LAG window (PARTITION BY lead_id ORDER BY
-- transitioned_at, id). Partial filter keeps the index small (CoA rows only).
-- Critical for performance scaling beyond ~30K rows.
CREATE INDEX IF NOT EXISTS lifecycle_transitions_coa_lag_idx
  ON lifecycle_transitions (lead_id, transitioned_at, id)
  WHERE lead_id LIKE 'coa:%';

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration restores the legacy PK on (permit_type, phase).
-- Post-E.3 the table contains CoA-side rows (permit_type=NULL) and possibly
-- rows with phase=NULL; both classes violate the constraints that DOWN
-- re-adds, so they must be DELETEd first.
--
-- v5 fold v4-M1 (Gemini MED): DELETE step #2 added to catch any NULL-phase
-- row that would otherwise block restoring the NOT NULL constraint on phase.
--
-- To roll back manually, run in this order:
--
--   -- 1a. Remove CoA-side rows (permit_type=NULL):
--   DELETE FROM phase_stay_calibration WHERE permit_type IS NULL;
--
--   -- 1b. Defensive: catch any remaining NULL-phase row (v5 fold v4-M1):
--   DELETE FROM phase_stay_calibration WHERE phase IS NULL;
--
--   -- 2. Drop the LAG performance index:
--   DROP INDEX IF EXISTS lifecycle_transitions_coa_lag_idx;
--
--   -- 3. Drop the permit-side 2-tuple partial unique index:
--   DROP INDEX IF EXISTS phase_stay_calibration_permit_legacy_unique;
--
--   -- 4. Re-add NOT NULL constraints:
--   ALTER TABLE phase_stay_calibration ALTER COLUMN phase SET NOT NULL;
--   ALTER TABLE phase_stay_calibration ALTER COLUMN permit_type SET NOT NULL;
--
--   -- 5. Re-add legacy PRIMARY KEY:
--   ALTER TABLE phase_stay_calibration ADD PRIMARY KEY (permit_type, phase);
