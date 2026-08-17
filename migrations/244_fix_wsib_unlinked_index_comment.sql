-- 244: F4 (B3 output-panel remediation) -- correct migration 243's COMMENT ON INDEX.
--
-- WHY THIS EXISTS
-- Migration 243's comment claims idx_wsib_registry_unlinked "serves link-wsib.js
-- WHERE linked_entity_id IS NULL predicate (all three matching tiers + the
-- unlinked-count probe)". EXPLAIN against the live schema shows that is only
-- half true: the three matching-tier CTEs (scripts/link-wsib.js's trade_matches/
-- legal_matches/the Tier 1/2 exact-match UPDATEs) still SEQ SCAN wsib_registry
-- unchanged by this index. Two reasons: (1) linked_entity_id IS NULL matches
-- ~88.5% of wsib_registry -- far too unselective for the planner to prefer an
-- index scan over a seq scan; (2) even where the planner might otherwise
-- consider it, the tier CTEs also filter/join on trade_name_normalized /
-- legal_name_normalized / entities.name_normalized / similarity() -- columns
-- this index does not cover, so it cannot serve those predicates anyway.
--
-- Only the cheap steady-state "unlinked-count probe" (a bare
-- SELECT COUNT(*) ... WHERE linked_entity_id IS NULL, which needs no other
-- column) is actually served by this index -- and per migration 243's own
-- rationale, that probe now runs MORE often than the full cascade (the B3
-- run-ledger gate skips the cascade on most evaluations), which is the real
-- reason the index earns its keep. Do NOT edit migration 243 in place --
-- it is already applied to dev; this migration corrects the comment only.
--
-- SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_wsib step)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (link_wsib step)

-- ============================================================================
-- UP
-- ============================================================================

COMMENT ON INDEX idx_wsib_registry_unlinked IS
  'Phase B B3 (migration 243, comment corrected by 244): serves ONLY link-wsib.js''s unlinked-count probe (SELECT COUNT(*) ... WHERE linked_entity_id IS NULL) -- the complement of migration 044 idx_wsib_linked_entity. Does NOT serve the three matching-tier CTEs: linked_entity_id IS NULL matches ~88.5% of wsib_registry (too unselective for an index scan) and those CTEs also filter/join on trade_name_normalized/legal_name_normalized/entities.name_normalized/similarity(), columns this index does not cover -- they still seq-scan (verified via EXPLAIN against the live schema).';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- COMMENT ON INDEX idx_wsib_registry_unlinked IS
--   'Phase B B3 (migration 243): serves link-wsib.js WHERE linked_entity_id IS NULL predicate (all three matching tiers + the unlinked-count probe) -- the complement of migration 044 idx_wsib_linked_entity.';
