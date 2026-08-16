-- 243: Phase B B3 -- partial index on wsib_registry(linked_entity_id) for the UNLINKED half.
--
-- WHY THIS EXISTS
-- Migration 044 indexed the OPPOSITE predicate (WHERE linked_entity_id IS NOT NULL) for the
-- FK-lookup direction. The link-wsib.js matching cascade filters the other way on every tier
-- (WHERE w.linked_entity_id IS NULL, all three CTEs in scripts/link-wsib.js) plus its own
-- unlinked-count probe (SELECT COUNT(*) ... WHERE linked_entity_id IS NULL) -- none of that is
-- served by the existing index. Phase B B3 adds a run-ledger gate in front of link-wsib.js
-- (scripts/lib/source-version.js, runLedgerGateDecision) that can now SKIP the whole cascade when
-- nothing upstream changed, so the unlinked-count probe becomes the cheap steady-state path that
-- runs even MORE often than the full cascade used to -- worth indexing on its own.
--
-- SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_wsib step)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (link_wsib step)
--
-- CONCURRENTLY-EXEMPT: wsib_registry is in validate-migration.js LARGE_TABLES list (121K rows),
-- but scripts/migrate.js executes every migration file inside ONE transaction, where CREATE INDEX
-- CONCURRENTLY is illegal (same constraint documented in migration 240 partial-index comment).
-- Accepted here (not deferred to a CONCURRENTLY-capable one-off) because: (1) wsib_registry is
-- written ONLY by load-wsib.js (a manual-file, annual-cadence loader per Spec 43 row 18) and
-- link-wsib.js (itself gated behind an advisory lock, ADVISORY_LOCK_ID=94) -- no concurrent-write
-- workload exists to block; (2) this migration rides the same branch-only deploy window as
-- migrations 240/242 (B7/B8 cloud sequence), applied during a maintenance pass, not a live cutover.

-- ============================================================================
-- UP
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wsib_registry_unlinked
  ON wsib_registry (id)
  WHERE linked_entity_id IS NULL;

COMMENT ON INDEX idx_wsib_registry_unlinked IS
  'Phase B B3 (migration 243): serves link-wsib.js WHERE linked_entity_id IS NULL predicate (all three matching tiers + the unlinked-count probe) -- the complement of migration 044 idx_wsib_linked_entity.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP INDEX IF EXISTS idx_wsib_registry_unlinked;
