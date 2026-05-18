-- migrations/155_extend_permits_matched_status.sql
-- Phase I.1 — mirror mig 146 (coa_applications audit columns) for permits.
-- Closes the substrate gap that prevented Phase I.1's classifier from writing
-- permit-side `lifecycle_status_history` rows. Phase I.1 v2.3 Option B per
-- WF1 user authorization 2026-05-18 — irregardless of migration cost,
-- architectural correctness (symmetric classifier coverage of both lead
-- streams per Spec 42 §6.7) wins.
--
-- Columns added (mirror of mig 146 minus `unmapped_decision` — decisions are
-- CoA-only per Spec 42 §6.6.A):
--   matched_status     TEXT      — classifier-derived status (Phase I.1)
--   matched_rule       SMALLINT  — which Spec 42 §6.7 rule fired (0..99)
--   unmapped_status    BOOLEAN   — true when raw CKAN status didn't map
--
-- NO BACKFILL — classifier populates these on next run. First-run produces
-- a one-time spike in `lifecycle_status_history_inserted` (~280K rows estimated
-- via the pre-deploy query in docs/runbook/I1_first_deploy_spike.md).
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A + §6.7 + §6.11 Phase I
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9 (Tier framework)

-- UP

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- permits audit columns (mirror of mig 146 coa_applications, minus
-- unmapped_decision)
-- ─────────────────────────────────────────────────────────────────────────
-- PG 11+ optimizes ADD COLUMN with constant default to no table rewrite
-- (default stored in pg_attrdef; rows materialize lazily). Expected <500ms
-- on the ~247K-row permits table.
ALTER TABLE permits
  ADD COLUMN IF NOT EXISTS matched_status   TEXT,
  ADD COLUMN IF NOT EXISTS matched_rule     SMALLINT,
  ADD COLUMN IF NOT EXISTS unmapped_status  BOOLEAN NOT NULL DEFAULT false;

-- Domain CHECK with NOT VALID + VALIDATE pattern (mirrors mig 146).
-- Range 0..99 allows ~10x rule expansion in Spec 42 §6.7 without a follow-up
-- migration. Spec defines rules 1-9 (1-based; 0 reserved for defensive
-- sentinel on null/non-object classifier input per Phase E.1).
ALTER TABLE permits
  DROP CONSTRAINT IF EXISTS chk_permits_matched_rule_range;
ALTER TABLE permits
  ADD CONSTRAINT chk_permits_matched_rule_range
       CHECK (matched_rule IS NULL OR (matched_rule >= 0 AND matched_rule <= 99))
       NOT VALID;
ALTER TABLE permits
  VALIDATE CONSTRAINT chk_permits_matched_rule_range;

COMMENT ON COLUMN permits.matched_status IS
  'Classifier-derived status (Phase I.1 mig 155 + classify-lifecycle-phase.js). NULL until first classifier run after deploy. Mirror of coa_applications.matched_status (mig 146).';
COMMENT ON COLUMN permits.matched_rule IS
  'Spec 42 §6.7 rule index (0-99) that produced matched_status. 0 = defensive sentinel.';
COMMENT ON COLUMN permits.unmapped_status IS
  'True when CKAN raw status did not map to any spec rule. Operators investigate via idx_permits_unmapped_status partial index.';

COMMIT;

-- Partial index on unmapped_status flag (predominantly false in steady state).
-- CONCURRENTLY required because permits is a large table (~247K rows) per
-- tasks/lessons.md + Spec 75 §7a. CREATE INDEX CONCURRENTLY CANNOT run inside
-- a transaction block, so it goes here AFTER the COMMIT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_unmapped_status
  ON permits (unmapped_status)
  WHERE unmapped_status = true;

-- ─────────────────────────────────────────────────────────────────────────
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b — established convention across migrations
-- 128/132/133/146).
-- ─────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_permits_unmapped_status;
-- ALTER TABLE permits DROP CONSTRAINT IF EXISTS chk_permits_matched_rule_range;
-- ALTER TABLE permits
--   DROP COLUMN IF EXISTS matched_status,
--   DROP COLUMN IF EXISTS matched_rule,
--   DROP COLUMN IF EXISTS unmapped_status;
