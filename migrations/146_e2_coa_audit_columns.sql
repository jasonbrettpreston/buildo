-- migrations/146_e2_coa_audit_columns.sql
-- Phase E.2 — persist matchedStatus / matchedRule / unmappedStatus / unmappedDecision
-- on coa_applications. Improves diagnosability vs audit-log archaeology.
-- Also adds UNIQUE INDEX on lifecycle_transitions for ON CONFLICT idempotency
-- of the new CoA-side transitions INSERT in classify-lifecycle-phase.js.
--
-- Spec 47 §6.5: all INSERTs ON CONFLICT or upsert; the new lifecycle_transitions
-- INSERT in classify-lifecycle-phase.js uses ON CONFLICT (lead_id, transitioned_at)
-- DO NOTHING — this migration provides the natural-key UNIQUE INDEX that ON CONFLICT
-- requires.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 + §6.9 (Phase E.2)
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3 (CoA-side rules)

-- UP

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- coa_applications audit columns
-- ─────────────────────────────────────────────────────────────────────────
-- PG 11+ optimizes ADD COLUMN with constant default to no table rewrite
-- (default stored in pg_attrdef; rows materialize lazily). Expected <100ms
-- on the 33,052-row coa_applications table.
ALTER TABLE coa_applications
  ADD COLUMN IF NOT EXISTS matched_status     TEXT,
  ADD COLUMN IF NOT EXISTS matched_rule       SMALLINT,
  ADD COLUMN IF NOT EXISTS unmapped_status    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unmapped_decision  BOOLEAN NOT NULL DEFAULT false;

-- Domain CHECK with NOT VALID + VALIDATE pattern.
-- NOT VALID skips the full-table validation pass on ADD; VALIDATE CONSTRAINT
-- (separate statement) does the scan with a SHARE UPDATE EXCLUSIVE lock that
-- does NOT block concurrent reads/writes. Practically the scan is trivially
-- fast (all 33K rows have NULL matched_rule on first run), but the pattern
-- future-proofs against rollback-and-rerun on a partially-populated table.
--
-- Range 0..99 allows ~10x rule expansion in Spec 42 §6.7 without a follow-up
-- migration. Current spec defines rules 1-9 (1-based; 0 reserved for defensive
-- sentinel return on null/non-object classifier input per E.1 substrate).
ALTER TABLE coa_applications
  DROP CONSTRAINT IF EXISTS chk_coa_matched_rule_range;
ALTER TABLE coa_applications
  ADD CONSTRAINT chk_coa_matched_rule_range
       CHECK (matched_rule IS NULL OR (matched_rule >= 0 AND matched_rule <= 99))
       NOT VALID;
ALTER TABLE coa_applications
  VALIDATE CONSTRAINT chk_coa_matched_rule_range;

-- Partial indices on the unmapped flags (predominantly false in steady state).
-- Partial index keeps the index small while making "where unmapped" queries
-- O(log n) instead of full-scan.
CREATE INDEX IF NOT EXISTS idx_coa_unmapped_status
  ON coa_applications (unmapped_status)
  WHERE unmapped_status = true;
CREATE INDEX IF NOT EXISTS idx_coa_unmapped_decision
  ON coa_applications (unmapped_decision)
  WHERE unmapped_decision = true;

-- ─────────────────────────────────────────────────────────────────────────
-- lifecycle_transitions idempotency index (v3 plan-review Gemini+DeepSeek CRIT)
-- ─────────────────────────────────────────────────────────────────────────
-- classify-lifecycle-phase.js's new CoA-side INSERT uses ON CONFLICT
-- (lead_id, transitioned_at) DO NOTHING for idempotency under crash-and-retry
-- scenarios. (lead_id, transitioned_at) is a sufficient natural key —
-- within a single classify run, transitioned_at = RUN_AT (constant), so
-- a row can only land once per (lead_id, run). Across runs, transitioned_at
-- advances monotonically, so legitimate re-classifications still produce
-- new rows. This is defense-in-depth: the JS phaseChangedBatch filter is
-- the primary idempotency mechanism (only inserts on phase/seq change vs
-- DB snapshot); the DB-level UNIQUE INDEX prevents duplicate rows even if
-- the JS filter is bypassed (e.g., by manual operator query).
CREATE UNIQUE INDEX IF NOT EXISTS uix_lifecycle_transitions_idempotency
  ON lifecycle_transitions (lead_id, transitioned_at);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b — established convention across migrations 128/132/133).
-- The migration runner only processes the UP block above; this DOWN is
-- documentation for operators executing a manual rollback.
-- ─────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uix_lifecycle_transitions_idempotency;
-- DROP INDEX IF EXISTS idx_coa_unmapped_status;
-- DROP INDEX IF EXISTS idx_coa_unmapped_decision;
-- ALTER TABLE coa_applications DROP CONSTRAINT IF EXISTS chk_coa_matched_rule_range;
-- ALTER TABLE coa_applications
--   DROP COLUMN IF EXISTS matched_status,
--   DROP COLUMN IF EXISTS matched_rule,
--   DROP COLUMN IF EXISTS unmapped_status,
--   DROP COLUMN IF EXISTS unmapped_decision;
