-- 149: Phase E.4 — partial indices on permits.lifecycle_seq +
-- coa_applications.lifecycle_seq for assert-lifecycle-phase-distribution.js's
-- UNION ALL aggregate query.
--
-- v4 fold v2-conv-HIGH (Gemini + DeepSeek convergent): added per Engineering
-- Standards §3.1 "CREATE INDEX on tables >100K rows should use CONCURRENTLY".
-- Without these indices, the per-seq GROUP BY query risks full-table scans
-- (~247K + 33K rows) and could time out under write load.
--
-- Partial filter on `WHERE lifecycle_seq IS NOT NULL` keeps the index small.
-- For permits (~247K rows), only the post-E.2-classified subset is indexed
-- (grows as Phase D+E.2 ramps up). For coa_applications (~33K rows), classifier
-- coverage is higher (~99%+ post-E.1 Rule 0 removal).
--
-- migrate.js detects CONCURRENTLY (line 195 of scripts/migrate.js) and routes
-- this file through the non-transactional path: each statement runs in its
-- own implicit transaction via separate pool.query calls.
--
-- v4 fold v3-Indep-MED-A: failure-mode clarification. The runner's
-- non-transactional path issues recordApplied() as a SEPARATE pool.query
-- AFTER all CONCURRENTLY statements complete (line 200 of migrate.js). If
-- the second CREATE INDEX succeeds but recordApplied fails (pool exhaustion,
-- network drop, schema_migrations row contention), the migration is NOT
-- recorded in schema_migrations and WILL re-run on the next deploy. Both
-- index statements use IF NOT EXISTS so re-runs are idempotent (no-ops).
-- This failure mode is well-defined and benign — automatic recovery via
-- next-run idempotency.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
-- SPEC LINK: docs/specs/00_engineering_standards.md §3.1
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R5

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_seq
  ON permits (lifecycle_seq)
  WHERE lifecycle_seq IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_applications_lifecycle_seq
  ON coa_applications (lifecycle_seq)
  WHERE lifecycle_seq IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
--
-- To roll back manually:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_coa_applications_lifecycle_seq;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_permits_lifecycle_seq;
--
-- DROP INDEX CONCURRENTLY is required to avoid blocking the table during
-- a rollback under write load (matches the CREATE CONCURRENTLY pattern).
