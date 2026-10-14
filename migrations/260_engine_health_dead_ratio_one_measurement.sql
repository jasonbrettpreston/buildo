-- 260: engine_health_snapshots.dead_ratio — restate history in the ONE fleet measurement.
--
-- Spec 124 R-CG (S2 F3-3, operator ruling 2026-10-13, "a standardized approach"): every dead-tuple
-- ratio in the fleet is dead / (live + dead), the form scripts/lib/step/plausibility.js runMaintenance
-- already used (Spec 122a:391-396 "one measurement, one threshold name"). assert_engine_health wrote
-- dead / live until this change; the raw n_live_tup / n_dead_tup are stored on every row, so the
-- history is restated exactly from them and the series has no break.
--
-- Idempotent: the IS DISTINCT FROM guard makes a re-run a no-op. Small table (one row per table per day).
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CG)
-- SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (chain-tail engine health)

-- UP
UPDATE engine_health_snapshots
   SET dead_ratio = CASE WHEN (n_live_tup + n_dead_tup) > 0
                         THEN ROUND(n_dead_tup::numeric / (n_live_tup + n_dead_tup), 4)
                         ELSE 0 END
 WHERE dead_ratio IS DISTINCT FROM CASE WHEN (n_live_tup + n_dead_tup) > 0
                                        THEN ROUND(n_dead_tup::numeric / (n_live_tup + n_dead_tup), 4)
                                        ELSE 0 END;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert to the old dead/live form:
--   UPDATE engine_health_snapshots SET dead_ratio = CASE WHEN n_live_tup > 0
--     THEN LEAST(ROUND(n_dead_tup::numeric / n_live_tup, 4), 99.9999) ELSE 0 END;
