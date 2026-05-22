-- 161: lifecycle_status_history — CHECK constraint locking classifier-derived
-- rows to event_date IS NULL.
--
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2
-- WF3 Pass-2.5 Finding C Phase 4 of 5 (2026-05-22).
--
-- Phase 1 (mig 160) added the nullable event_date column. Phase 2 (load-permits)
-- and Phase 3 (load-coa) populate it for permit/CoA-side milestone status
-- transitions. Phase 4 (this migration) locks the design invariant at the DB
-- level: classifier-derived rows (`detected_by = 'classify-lifecycle-phase.js'`)
-- represent transitions DERIVED from current data state, not OBSERVED source
-- events — they have no source event date by definition. The classifier
-- writer already omits event_date from its INSERT column lists, so rows
-- default to NULL. This constraint enforces that future writer refactors
-- cannot silently break the invariant by populating event_date for
-- classifier rows.
--
-- Resolution of review_followups row 153 (Phase 1 Gemini MEDIUM
-- adversarial-review fold).
--
-- NOT VALID + VALIDATE pattern (Spec 47 §18.4) for safe deploy on 250K-row
-- table: ADD CONSTRAINT ... NOT VALID adds the constraint with no row scan
-- (catalog-only metadata change). VALIDATE CONSTRAINT then scans existing
-- rows under a less restrictive ShareUpdateExclusive lock that allows
-- concurrent reads + writes. Validation will pass trivially because all
-- existing classifier-derived rows have event_date IS NULL (column was
-- just added in Phase 1 mig 160; no writer populates it for classifier rows).

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: instant — marks new rows but defers the row scan. Takes
-- SHARE ROW EXCLUSIVE (NOT ACCESS EXCLUSIVE — concurrent reads proceed).
-- DO $$...$$ idempotency guard per Spec 47 §18.4: if the migration runner
-- crashes after ADD CONSTRAINT but before VALIDATE, the next run skips
-- the ADD (constraint already exists) and goes directly to VALIDATE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lifecycle_status_history_classifier_event_date_null'
  ) THEN
    ALTER TABLE lifecycle_status_history
      ADD CONSTRAINT lifecycle_status_history_classifier_event_date_null
      CHECK (detected_by != 'classify-lifecycle-phase.js' OR event_date IS NULL)
      NOT VALID;
  END IF;
END $$;

-- Step 2: scans under ACCESS SHARE only — reads + writes proceed.
ALTER TABLE lifecycle_status_history
  VALIDATE CONSTRAINT lifecycle_status_history_classifier_event_date_null;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 — comments only; scripts/migrate.js runs every executable line)
-- ═══════════════════════════════════════════════════════════════════
-- ALLOW-DESTRUCTIVE
-- Dropping this constraint relaxes the invariant — future writer drift could
-- populate event_date for classifier-derived rows without rejection. The
-- application code in classify-lifecycle-phase.js already omits event_date
-- from its INSERT column lists, so DROP CONSTRAINT alone doesn't introduce
-- bad data; it just removes the defense-in-depth gate.
--
-- To roll back manually:
--
--   ALTER TABLE lifecycle_status_history DROP CONSTRAINT IF EXISTS lifecycle_status_history_classifier_event_date_null;
