-- 247: WF3 EP-D17 -- per-table autovacuum storage params on parcels, so the
-- post-COMMIT catch-up after a bulk-write step (enrich_parcels pass 4's comps
-- rewrite) reclaims dead tuples faster than the default schedule.
--
-- WHY THIS EXISTS
-- Cloud-measured 2026-09-10 (run 34506962436, pipeline_runs 4566/4588): passes 1-4
-- of enrich_parcels share ONE pipeline.withTransaction (txn_scope:"step", ~93 min
-- live) -- an open transaction's xmin pins the vacuum horizon, so NO autovacuum
-- setting can reclaim pass 4's ~1.35M dead tuples DURING the run. What matters is
-- how fast the POST-COMMIT catch-up runs: measured COMMIT ~19:35Z -> last_autovacuum
-- 20:24:26Z, ~49 minutes throttled at the DEFAULT autovacuum_vacuum_cost_delay=2ms.
-- The step's own 5 run-end invariants[]/plausibility[] post checks (EP-D17, this same
-- WF3's code fix, C1/C2/C2b) ran INSIDE that 49-minute window: one full Seq Scan alone
-- (opt_aor_gfa_gt_max_buildable_gfa_count) consumed ~35-40 min against dead_ratio 0.697
-- (measured, `pg_stat_user_tables`) vs 16-30s on a vacuumed heap -- a 150x cliff keyed
-- entirely on heap state, not query cost.
--
-- Spec 115 Section 5 pre-authorises exactly this: "VACUUM/ANALYZE tuning beyond
-- Postgres's own autovacuum is deliberately not itemized -- add an entry if and when
-- a specific table's autovacuum settings prove insufficient." That trigger condition
-- has now occurred for parcels (measured dead_ratio 0.697, 2.31x live by
-- assert-engine-health.js's own formula).
--
-- cost_delay = 0 is the load-bearing member of the three: the trigger POINT
-- (scale_factor) is irrelevant during the shared txn (nothing can vacuum until
-- COMMIT regardless of when the daemon would have fired), but the THROTTLE RATE
-- during the post-COMMIT catch-up is exactly what determines whether the next
-- reader (this step's own post checks, or the next chain step) pays the 150x cliff.
-- Default vacuum_cost_delay=2ms measured ~49 min for 1.35M dead tuples; unthrottled
-- (cost_delay=0) is estimated 3-10 min for the same volume (IO-bound on the 4,384 MB
-- heap, not CPU-bound), based on a manual VACUUM's own unthrottled-by-default posture.
-- scale_factor/analyze_scale_factor are lowered (0.2 -> 0.02, 0.1 -> 0.01) so the
-- trigger fires on a much smaller absolute dead-tuple count once the txn horizon
-- clears, rather than waiting for 20% of live rows (~117K) to go dead again before
-- the NEXT autovacuum even considers the table.
--
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md Section 5 (the itemisation
--   trigger this migration answers)
-- SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md Section 7.5
--   (migration numbering; 247 consumed here, the 4 state-table reservation now
--   starts at 248)
-- SPEC LINK: .cursor/wf3_ep_d17_pass5_fullscan_checks_active_task.md (C3; Idempotency
--   Lens table: "Migration 247 lands BEFORE the one-off VACUUM, so the reclaimed
--   state is the state the new params maintain")
--
-- NOT CONCURRENTLY -- inapplicable: this is a catalog-only reloptions write, not an
-- index build. Rule 2 (CREATE INDEX on a large table) does not apply -- there is no
-- CREATE INDEX statement in this file. `parcels` is measured ABSENT from
-- validate-migration.js's LARGE_TABLES list despite being the estate's largest table
-- (583K live / 1.93M tuples / 6,559 MB) -- filed MED in review_followups.md, not fixed
-- here (a one-line list change with no retroactive effect, out of this WF3's scope).
--
-- LOCK: ALTER TABLE ... SET (storage_param) takes SHARE UPDATE EXCLUSIVE (safe against
-- concurrent reads and DML; blocks only another SHARE UPDATE EXCLUSIVE-or-stronger lock,
-- e.g. VACUUM or another schema change) -- comfortably inside the 2-min cloud statement
-- cap; no SET LOCAL statement_timeout override needed for a catalog-only write this
-- cheap (sub-second), but lock_timeout is still declared defensively, matching every
-- prior migration's convention, in case a concurrent VACUUM/ANALYZE happens to be
-- mid-flight on parcels when this runs.
--
-- WHETHER SUPABASE HONOURS PER-TABLE autovacuum_vacuum_cost_delay: unverified on this
-- managed platform (some managed Postgres platforms clamp storage params) -- filed as
-- a low-confidence item in the WF3 plan; this migration's own DB test asserts
-- `reloptions` CONTAINS the three params, which proves the SQL landed, not that the
-- daemon obeys them. Verify from `last_autovacuum` timing on the next real run.

-- ============================================================================
-- UP
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE parcels SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 0
);

COMMENT ON TABLE parcels IS
  'WF3 EP-D17 (migration 247): autovacuum_vacuum_scale_factor=0.02 / autovacuum_analyze_scale_factor=0.01 / autovacuum_vacuum_cost_delay=0 -- tuned per Spec 115 Section 5''s pre-authorised trigger (a specific table''s default autovacuum settings proved insufficient, measured dead_ratio 0.697 on 2026-09-10 after enrich_parcels'' own pass-4 comps rewrite). cost_delay=0 unthrottles the post-COMMIT catch-up after enrich_parcels'' shared passes-1-4 transaction releases the vacuum horizon; the lowered scale factors trigger the daemon sooner on a much smaller absolute dead-tuple count. See scripts/lib/step/plausibility.js runMaintenance for the complementary in-step VACUUM (ANALYZE) executor this migration''s tuned params are designed to keep ahead of.';

-- ============================================================================
-- DOWN -- comments-only per project convention (migrate.js runs the whole file in one
-- transaction and does NOT honour -- UP / -- DOWN markers; see tasks/lessons.md).
-- ============================================================================
-- ALTER TABLE parcels RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_cost_delay);
-- COMMENT ON TABLE parcels IS NULL;
