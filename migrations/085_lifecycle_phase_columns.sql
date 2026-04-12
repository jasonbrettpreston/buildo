-- Migration 085: Lifecycle Phase Columns (Strangler Fig V1)
--
-- Adds the new business-lifecycle phase column to both permits and
-- coa_applications. This is the Strangler Fig around the existing
-- enriched_status column: we do NOT touch enriched_status (it's
-- load-bearing for the AIC scraper's batch selection via
-- idx_permits_enriched_status_scrape). Instead, a new standalone
-- classifier runs downstream and writes a 24-phase taxonomy to this
-- new column.
--
-- Design reference: docs/reports/lifecycle_phase_implementation.md
-- Active task: .cursor/active_task.md (WF2 Lifecycle Phase V1)
--
-- Value domain (permits.lifecycle_phase):
--   P3, P4, P5, P6       — pre-issuance (Intake, Under Review, On Hold, Ready to Issue)
--   P7a, P7b, P7c, P7d   — issued, pre-construction time-bucketed
--   P8                   — Permit Revision Issued
--   P9..P18              — active construction sub-stages (P18 = stage unknown)
--   P19, P20             — wind-down, terminal
--   O1, O2, O3, O4       — orphan trade permits (simplified 4-phase)
--   NULL                 — dead state or out of scope
--
-- Value domain (coa_applications.lifecycle_phase):
--   P1                   — Variance Requested (pending/hearing scheduled)
--   P2                   — Variance Granted (approved, not yet linked to a permit)
--   NULL                 — linked CoA (phase lives on the permit) OR dead state
--
-- Safety:
--   - All ADD COLUMN operations are non-destructive
--   - Default NULL means existing rows are classified by the new
--     classifier on first run; nothing breaks if the classifier
--     hasn't run yet
--   - Partial indexes scope the index size to rows that actually
--     have a phase value, keeping them small
--   - Incremental re-classification trigger index enables the
--     classifier to find dirty rows in O(log n) instead of O(n)
--
-- Rollback: DOWN block (commented) drops the columns in reverse order.
-- Nothing upstream or downstream depends on these columns until the
-- feed consumer change ships, so rollback is safe.

-- UP

-- ─────────────────────────────────────────────────────────────────
-- permits: lifecycle_phase + lifecycle_stalled + lifecycle_classified_at
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE permits
  ADD COLUMN lifecycle_phase VARCHAR(10) DEFAULT NULL;

ALTER TABLE permits
  ADD COLUMN lifecycle_stalled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE permits
  ADD COLUMN lifecycle_classified_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index scoped to classified rows only. Enables fast
-- "find all permits in phase X" queries from the feed SQL.
--
-- Wrapped in DO/EXECUTE per the 067/078/083 pattern for large-table
-- index creation inside migrations. The in-migration command uses the
-- non-CONCURRENT form which is safe for dev/local but will lock the
-- permits table briefly. Operator runbook: for production, run
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_phase
--     ON permits (lifecycle_phase) WHERE lifecycle_phase IS NOT NULL;
-- before applying this migration so the in-migration command becomes
-- a no-op.
DO $phase_idx$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_phase
           ON permits (lifecycle_phase)
           WHERE lifecycle_phase IS NOT NULL';
END
$phase_idx$;

-- Incremental re-classification trigger index. The classifier's
-- WHERE clause is:
--   WHERE lifecycle_classified_at IS NULL
--      OR last_seen_at > lifecycle_classified_at
-- This partial index covers rows that have never been classified
-- (IS NULL branch) which is the expensive first-run lookup. The
-- second branch (last_seen_at > lifecycle_classified_at) falls back
-- to a scan filtered by last_seen_at which already has an index.
--
-- Operator runbook for production:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_dirty
--     ON permits (permit_num) WHERE lifecycle_classified_at IS NULL;
DO $dirty_idx$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_lifecycle_dirty
           ON permits (permit_num)
           WHERE lifecycle_classified_at IS NULL';
END
$dirty_idx$;

COMMENT ON COLUMN permits.lifecycle_phase IS
  'Business lifecycle phase (Strangler Fig V1, migration 085). See docs/reports/lifecycle_phase_implementation.md. Values: P3-P8, P7a-d, P9-P20, O1-O4. NULL = dead state or out of scope. Separate from enriched_status which remains load-bearing for AIC scraper batch selection.';

COMMENT ON COLUMN permits.lifecycle_stalled IS
  'Orthogonal stalled modifier. True if the permit is in a stalled state regardless of primary phase. Sources: enriched_status=Stalled, 2y+ Permit Issued with no inspections, latest inspection 180d+ old.';

COMMENT ON COLUMN permits.lifecycle_classified_at IS
  'Timestamp of last successful classification. Incremental re-run trigger: last_seen_at > lifecycle_classified_at. NULL = never classified.';

-- ─────────────────────────────────────────────────────────────────
-- coa_applications: lifecycle_phase + lifecycle_classified_at
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE coa_applications
  ADD COLUMN lifecycle_phase VARCHAR(10) DEFAULT NULL;

ALTER TABLE coa_applications
  ADD COLUMN lifecycle_classified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_coa_lifecycle_phase
  ON coa_applications (lifecycle_phase)
  WHERE lifecycle_phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coa_lifecycle_dirty
  ON coa_applications (id)
  WHERE lifecycle_classified_at IS NULL;

COMMENT ON COLUMN coa_applications.lifecycle_phase IS
  'Business lifecycle phase for CoA applications. Values: P1 (Variance Requested), P2 (Variance Granted). NULL for linked CoAs (phase lives on the linked permit) or dead states (refused/withdrawn/closed).';

COMMENT ON COLUMN coa_applications.lifecycle_classified_at IS
  'Timestamp of last successful classification. Incremental re-run trigger.';

-- DOWN
-- DROP INDEX IF EXISTS idx_coa_lifecycle_dirty;
-- DROP INDEX IF EXISTS idx_coa_lifecycle_phase;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lifecycle_classified_at;
-- ALTER TABLE coa_applications DROP COLUMN IF EXISTS lifecycle_phase;
-- DROP INDEX IF EXISTS idx_permits_lifecycle_dirty;
-- DROP INDEX IF EXISTS idx_permits_lifecycle_phase;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_classified_at;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_stalled;
-- ALTER TABLE permits DROP COLUMN IF EXISTS lifecycle_phase;
