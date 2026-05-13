-- 135: phase_stay_calibration — add 4 cohort-dim columns for the
-- extended cohort key landed in Phase E.
--
-- Existing PK on (permit_type, from_phase) per migration 123 is
-- preserved through Phase E. R2.v3 fix: the prior revision attempted to
-- ADD PRIMARY KEY on (permit_type, project_type, coa_type_class,
-- from_seq, to_seq) which would have failed at the ADD step because
-- the new cohort-dim columns contain NULL for every existing row, and
-- PRIMARY KEY rejects NULLs by default.
--
-- The new shape is claimed via UNIQUE NULLS NOT DISTINCT (PostgreSQL 15+
-- syntax; deployed PG is 16 per Spec 34) which allows multiple rows
-- with NULL cohort dims during the Phase B–E transition. Phase E
-- backfills the cohort dims and then swaps the PK over.
--
-- Bundled in BEGIN/COMMIT because no CONCURRENTLY indexes are involved —
-- this is a small reference table, transactional apply is safe.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE phase_stay_calibration
  ADD COLUMN IF NOT EXISTS from_seq INTEGER,
  ADD COLUMN IF NOT EXISTS to_seq INTEGER,
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS coa_type_class VARCHAR(30);

-- Claim the new cohort-key shape ahead of Phase E recalibration. The
-- NULLS NOT DISTINCT clause requires PG15+; verified deployed on PG16.
-- Multiple existing rows can share NULL cohort dims during the Phase B–E
-- window without violating uniqueness.
DO $$
BEGIN
    ALTER TABLE phase_stay_calibration
      ADD CONSTRAINT phase_stay_calibration_new_unique
        UNIQUE NULLS NOT DISTINCT (permit_type, project_type, coa_type_class, from_seq, to_seq);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration removes the extended cohort key. The existing
-- PK on (permit_type, from_phase) stays intact, so Phase B–D calibration
-- writes continue to function.
--
-- To roll back manually:
--
--   BEGIN;
--   ALTER TABLE phase_stay_calibration DROP CONSTRAINT IF EXISTS phase_stay_calibration_new_unique;
--   ALTER TABLE phase_stay_calibration
--     DROP COLUMN IF EXISTS coa_type_class,
--     DROP COLUMN IF EXISTS project_type,
--     DROP COLUMN IF EXISTS to_seq,
--     DROP COLUMN IF EXISTS from_seq;
--   COMMIT;
