-- 246: WF3 EP-D14 -- partial index on enrich_parcels_pass3_scope(parcel_id) for the
-- D4' recovery scan's own predicate.
--
-- WHY THIS EXISTS
-- consumePendingScope (scripts/lib/compute/enrich-parcels.js) reads/updates prior runs'
-- unconsumed enrich_parcels_pass3_scope rows on parcel_id -- the existing indexes are the
-- PK (run_id, parcel_id) and idx_pass3_scope_unconsumed (run_id) WHERE consumed_at IS NULL
-- (migration 240) -- NEITHER leads on parcel_id alone. Measured locally 2026-09-09
-- (PG 17.6, enable_seqscan=off to force the planner off a bare Seq Scan on this 0-row
-- table): `UPDATE ... WHERE parcel_id = 1 AND consumed_at IS NULL` reaches
-- idx_pass3_scope_unconsumed only as a Filter, never an Index Cond -- the SAME plan shape
-- as a batched `parcel_id = ANY($1::int[])` form. Cloud-measured the same day (run
-- 34400284685, pipeline_runs 4560): 2,210,745 rows / 439,130 unconsumed, one backend
-- ACTIVE 23 minutes on a single per-parcel UPDATE. EP-D14's own code fix (WF3 C1) removes
-- the O(N) STATEMENT COUNT (one UPDATE per parcel -> one set-based UPDATE under --full, or
-- ceil(N/batch) batched UPDATEs under incremental); this index removes the O(N) SCAN COST
-- each remaining statement still pays without it -- the two fixes are independent and both
-- necessary (P3b in the WF3 plan: batching alone does not change the per-statement plan).
--
-- SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md P3A.1 (D4' recovery bound)
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md 3.0b (scope hand-off ledger)
-- SPEC LINK: migrations/240_phase_b_massing_watermark_and_pass3_scope.sql (table + its own
--   COMMENT ON TABLE stating the D4' crash-recovery guarantee this index serves)
--
-- NOT CONCURRENTLY -- on the merits, not migrate.js's transaction constraint (that citation
-- in migrations 240/243 is itself stale -- scripts/migrate.js DOES detect a CONCURRENTLY
-- statement, strip comments first, and route the whole file OUTSIDE any transaction;
-- verified live this session, filed as its own LOW followup rather than fixed here).
-- Declined on independent grounds: (1) enrich_parcels_pass3_scope is absent from
-- validate-migration.js's LARGE_TABLES list, so Rule 2 does not require it; (2) the cloud
-- one-off prune (scripts/one-time/wf3-prune-pass3-scope.js) runs BEFORE this migration in
-- the WF3 cloud remediation sequence, leaving ~0 rows to index -- a sub-second ACCESS
-- EXCLUSIVE window; (3) F8-corrected (output panel, 2026-09-09) -- the table's ONLY writer
-- is enrich_parcels itself, and this migration deploys during a scheduled maintenance
-- window (not a live cutover) with no enrich_parcels invocation running -- an OPERATIONAL
-- fact, not a locking guarantee: advisory lock 65 is purely cooperative and does not itself
-- exclude a real writer at the Postgres MVCC/lock level, so it is NOT what makes the
-- non-concurrent SHARE lock safe here. The fail-fast backstop if that operational
-- assumption is ever wrong is the SET LOCAL lock_timeout='5s' below, which aborts loudly
-- rather than blocking indefinitely; (4) CONCURRENTLY's own hazards (an
-- IF-NOT-EXISTS INVALID-index-forever failure mode, and migrate.js's per-statement
-- pool.query dispatch losing whole-file atomicity / making any SET LOCAL prologue a
-- documented no-op, tasks/lessons.md) are not worth taking for a near-empty table.

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE INDEX IF NOT EXISTS idx_pass3_scope_parcel_unconsumed
  ON enrich_parcels_pass3_scope (parcel_id)
  WHERE consumed_at IS NULL;

COMMENT ON INDEX idx_pass3_scope_parcel_unconsumed IS
  'WF3 EP-D14 (migration 246): serves consumePendingScope''s per-parcel-id predicate on the D4'' recovery scan (the set-based --full stamp''s parcel_id <> ALL(...) exclusion, and the batched incremental parcel_id = ANY(...) recovery/stamp pair) -- neither the PK (run_id, parcel_id) nor idx_pass3_scope_unconsumed (run_id) WHERE consumed_at IS NULL leads on parcel_id alone.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- DROP INDEX IF EXISTS idx_pass3_scope_parcel_unconsumed;
