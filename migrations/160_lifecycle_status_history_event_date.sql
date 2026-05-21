-- 160: lifecycle_status_history — add nullable `event_date` DATE column.
--
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §2
-- WF3 Pass-2.5 Finding C Phase 1 of 5 (2026-05-21).
--
-- Adds a nullable `event_date` column to capture the real-world date a status
-- transition occurred (from CKAN source: `permits.issued_date` /
-- `permits.completed_date` / `permits.application_date` / `coa_applications.decision_date`
-- / `coa_applications.hearing_date`, depending on `to_status` per writer).
--
-- Existing column `transitioned_at TIMESTAMPTZ` continues to mean "when the
-- pipeline detected this status change" (matching the official Spec 84 §2
-- semantic — "Timestamp of the detected shift"). `event_date` is the new
-- "when the source's status actually changed" companion column. Inspector
-- (Spec 76 §3.5, Phase 5 of this WF3 sequence) will render
-- COALESCE(event_date, transitioned_at) with a 'detected' badge when
-- event_date IS NULL.
--
-- Phase 1 (this migration) is purely additive — no writers populate
-- event_date yet. Phases 2-4 of the WF3 sequence add the writer logic:
--   Phase 2: load-permits.js     (permits.issued_date / completed_date / application_date)
--   Phase 3: load-coa.js         (coa_applications.decision_date / hearing_date)
--   Phase 4: classify-lifecycle-phase.js (no source date — derived; event_date stays NULL)
-- Phase 5: Inspector reads COALESCE(event_date, transitioned_at) + renders badge.
--
-- No backfill — historical rows retain event_date = NULL. Inspector falls
-- back to transitioned_at with the 'detected' badge for those, honestly
-- representing "we don't know exactly when this transition happened, only
-- when we observed it."
--
-- Standards compliance:
-- - Engineering Standards §3.1 zero-downtime: additive nullable column on
--   PostgreSQL 11+ is a catalog-only metadata change. Brief ACCESS EXCLUSIVE
--   lock for the pg_attribute update; no table rewrite; no row-level lock
--   escalation. Safe to run on a 250K+ row table without service interruption.
-- - Spec 47 §3.6: bounded-array discipline — N/A (no array column).
-- - Migration numbering: 158 is absent from the migrations directory
--   (unknown provenance — possibly intentional reservation or accidental
--   skip). Using 160 to monotonically advance past the existing 159.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE lifecycle_status_history
  ADD COLUMN IF NOT EXISTS event_date DATE;

COMMENT ON COLUMN lifecycle_status_history.event_date IS
  'Real-world date the status change occurred (from CKAN source). NULL when source provides no date (most permit non-milestone transitions; all classifier-derived rows). Inspector renders COALESCE(event_date::timestamptz, transitioned_at) with a detected badge when event_date IS NULL — the explicit cast is required because event_date DATE and transitioned_at TIMESTAMPTZ are different types. WF3 Pass-2.5 Finding C Phase 1 (mig 160).';

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 — comments only; scripts/migrate.js runs every executable line)
-- ═══════════════════════════════════════════════════════════════════
-- ALLOW-DESTRUCTIVE
-- Reversible: the column has no data dependencies in Phase 1 (writers do
-- not populate it until Phases 2-4). After Phases 2-4 ship, reverting this
-- migration would lose real event dates on transitions written between
-- Phase 2-4 deploy and revert; consider that risk before running DOWN.
--
-- To roll back manually:
--
--   ALTER TABLE lifecycle_status_history DROP COLUMN IF EXISTS event_date;
--
-- (DROP COLUMN also removes the column comment per PostgreSQL behavior.)
