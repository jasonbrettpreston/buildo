-- 127: lifecycle_status_history — unified status-level lifecycle ledger.
--
-- Captures EVERY source-status change, including same-phase transitions
-- (e.g., Tentatively Scheduled → Hearing Scheduled within P2) that
-- lifecycle_transitions (migration 126) deliberately collapses. Snapshots
-- CoA decision + decision_date at each transition so the full evolution of
-- a decision (Approved with Conditions → Approved → Final and Binding)
-- is preserved as ordered history rather than lost to overwrite-in-place
-- on coa_applications.decision.
--
-- Three writers (enforced by CHECK on detected_by):
--   * load-permits.js          — permit-side CKAN status changes at ingest
--   * load-coa.js              — CoA-side CKAN status+decision changes at ingest
--   * classify-lifecycle-phase.js — derived phase transitions on dirty rows
--
-- Idempotency: UNIQUE INDEX (lead_id, to_status, date_trunc('second', transitioned_at))
-- defends against re-runs of the ingest scripts over the same time window.
-- Two genuinely-distinct status changes for the same lead at the same
-- second are not expected. R8 Gemini #11 caught the original gap.
--
-- Spec 42 §6.6.A.1 Option C: lead_id format CHECK enforced.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle_status_history (
    id                  BIGSERIAL       PRIMARY KEY,
    lead_id             TEXT            NOT NULL CHECK (lead_id ~ '^(permit|coa):.+$'),
    from_status         VARCHAR(60),
    to_status           VARCHAR(60)     NOT NULL,
    from_seq            INTEGER,
    to_seq              INTEGER,
    from_phase          VARCHAR(20),
    to_phase            VARCHAR(20),
    decision            VARCHAR(60),
    decision_date       DATE,
    transitioned_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    detected_by         VARCHAR(60)     NOT NULL CHECK (detected_by IN ('load-permits.js', 'load-coa.js', 'classify-lifecycle-phase.js')),
    permit_type         VARCHAR(50),
    project_type        VARCHAR(50),
    coa_type_class      VARCHAR(30),
    neighbourhood_id    BIGINT
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_status_history_lead         ON lifecycle_status_history (lead_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_status_history_seq          ON lifecycle_status_history (from_seq, to_seq) WHERE from_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_status_history_decision     ON lifecycle_status_history (decision) WHERE decision IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_status_history_transitioned ON lifecycle_status_history (transitioned_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lifecycle_status_history_natural_key ON lifecycle_status_history (lead_id, to_status, date_trunc('second', transitioned_at));

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops the unified status-level ledger. CoA
-- decision-evolution history is then lost on every subsequent CKAN ingest
-- (current behavior overwrites coa_applications.decision in place).
-- Permit-side P-code transitions continue to land in permit_phase_transitions
-- (migration 126 left it intact).
--
-- To roll back manually:
--
--   DROP INDEX IF EXISTS uniq_lifecycle_status_history_natural_key;
--   DROP INDEX IF EXISTS idx_lifecycle_status_history_transitioned;
--   DROP INDEX IF EXISTS idx_lifecycle_status_history_decision;
--   DROP INDEX IF EXISTS idx_lifecycle_status_history_seq;
--   DROP INDEX IF EXISTS idx_lifecycle_status_history_lead;
--   DROP TABLE IF EXISTS lifecycle_status_history;
--
-- Revert any Phase D/E writers (load-permits.js, load-coa.js,
-- classify-lifecycle-phase.js) that emit rows here.
