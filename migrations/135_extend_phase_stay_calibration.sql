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
-- The new shape is claimed via UNIQUE (default NULLS DISTINCT) on
-- (permit_type, project_type, coa_type_class, from_seq, to_seq). During
-- Phase B→E every row has NULL cohort dims; with default NULL semantics
-- each NULL is considered unique, so legacy fixtures with multiple
-- (permit_type, phase) rows continue to insert cleanly. The pre-existing
-- PK on (permit_type, phase) enforces uniqueness during the transition.
-- Phase E backfills the cohort dims and the constraint then enforces
-- uniqueness on the new shape.
--
-- R6 CI hotfix: the prior revision used NULLS NOT DISTINCT, which
-- collapsed every NULL-cohort row into the same key and broke
-- lead-inspect-query.db.test.ts (it inserts multiple per-phase rows
-- for the same permit_type with NULL cohort dims). Switched to the
-- default NULLS DISTINCT semantics — see active task R6 hotfix log.
--
-- Transactional apply is provided by the migrate.js runner outer
-- transaction (scripts/migrate.js lines 210-221). Per R8 review, the
-- prior revision had an explicit BEGIN/COMMIT here, which committed the
-- runner's outer transaction prematurely and decoupled the DDL from the
-- schema_migrations record. Removed — the runner's wrapping is sufficient.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE phase_stay_calibration
  ADD COLUMN IF NOT EXISTS from_seq INTEGER,
  ADD COLUMN IF NOT EXISTS to_seq INTEGER,
  ADD COLUMN IF NOT EXISTS project_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS coa_type_class VARCHAR(30);

-- Claim the new cohort-key shape ahead of Phase E recalibration with
-- the DEFAULT NULLS DISTINCT semantics. During Phase B→E, every row
-- has NULL cohort dims (project_type, coa_type_class, from_seq, to_seq);
-- NULLS DISTINCT treats each NULL as unique so legacy fixtures with
-- multiple (permit_type, phase) rows continue to insert cleanly. The
-- pre-existing PK on (permit_type, phase) enforces uniqueness during
-- the transition window. Once Phase E backfills cohort dims, this
-- constraint enforces uniqueness on the new shape.
--
-- R6 CI hotfix: the prior revision used NULLS NOT DISTINCT, which
-- collapsed all NULL-cohort rows into the same key and broke
-- lead-inspect-query.db.test.ts (it inserts multiple per-phase
-- calibration rows for the same permit_type with NULL cohort dims).
DO $$
BEGIN
    ALTER TABLE phase_stay_calibration
      ADD CONSTRAINT phase_stay_calibration_new_unique
        UNIQUE (permit_type, project_type, coa_type_class, from_seq, to_seq);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

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
--   ALTER TABLE phase_stay_calibration DROP CONSTRAINT IF EXISTS phase_stay_calibration_new_unique;
--   ALTER TABLE phase_stay_calibration
--     DROP COLUMN IF EXISTS coa_type_class,
--     DROP COLUMN IF EXISTS project_type,
--     DROP COLUMN IF EXISTS to_seq,
--     DROP COLUMN IF EXISTS from_seq;
