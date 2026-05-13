-- 126: lifecycle_transitions — unified phase-level lifecycle ledger.
--
-- Replaces permit_phase_transitions (Phase H drop). Captures phase-level
-- transitions for both permit-side and CoA-side leads. Carries BOTH the
-- legacy P-codes (from_phase / to_phase, kept for backward compat during
-- the Phase C-G consumer migration) AND the new granular Universal Stream
-- seq references (from_seq / to_seq, populated by Phase E classifier).
--
-- Cohort denormalization columns (permit_type, project_type, coa_type_class,
-- neighbourhood_id) support the Phase E cohort-key extension on
-- phase_stay_calibration.
--
-- Spec 42 §6.6.A.1 Option C: lead_id format CHECK enforced.
--
-- NO backward-compat view in Phase B. The existing permit_phase_transitions
-- table stays as the live writer for classify-lifecycle-phase.js through
-- Phase D. Phase E migrates the classifier to write lifecycle_transitions.
-- Phase H drops permit_phase_transitions. (R2.v3 Item C1 fix — views are
-- SELECT-only and would break the live INSERT/DELETE writers.)

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle_transitions (
    id                  SERIAL          PRIMARY KEY,
    lead_id             TEXT            NOT NULL CHECK (lead_id ~ '^(permit|coa):.+$'),
    from_phase          VARCHAR(20),
    to_phase            VARCHAR(20)     NOT NULL,
    from_seq            INTEGER,
    to_seq              INTEGER,
    transitioned_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    permit_type         VARCHAR(50),
    project_type        VARCHAR(50),
    coa_type_class      VARCHAR(30),
    neighbourhood_id    BIGINT
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_lead  ON lifecycle_transitions (lead_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_phase ON lifecycle_transitions (from_phase, to_phase);
CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_seq   ON lifecycle_transitions (from_seq, to_seq) WHERE from_seq IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration removes the unified phase-transition ledger.
-- The legacy permit_phase_transitions table remains intact (this phase
-- does not touch it). classify-lifecycle-phase.js continues writing there;
-- the Phase E migration that would have rerouted it is reverted alongside.
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS idx_lifecycle_transitions_seq;
--   DROP INDEX IF EXISTS idx_lifecycle_transitions_phase;
--   DROP INDEX IF EXISTS idx_lifecycle_transitions_lead;
--   DROP TABLE IF EXISTS lifecycle_transitions;
