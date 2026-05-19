-- migrations/157_retire_pre_permits.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G" (PRE-permit retirement)
-- SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md (Step 19 CRIT-2 trigger)
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md (Phase I.1.1b lifecycle_status_history)
--
-- Surfaced by Spec 79 permits chain Step 19 (2026-05-19):
-- assert-data-bounds.js reported permits_pre_permit_count=147 (threshold == 0) -> FAIL.
--
-- ROOT CAUSE: Phase G's one-shot DELETE shim (scripts/create-pre-permits.js, commit 3944f88)
-- was git-rm'd in commit 0de4cab before this DB's CoA chain ran it. The shim is gone, so
-- there is no automated path to remove the 1,546 zombie rows (147 parents + 913 + 45 + 294
-- + 147 children verified 2026-05-19 via complete FK + lead_id child-table audit).
--
-- Phase G's original shim couldn't have included lifecycle_status_history because that
-- table was introduced later (Phase I.1.1b, commit 73b257b). This migration adds it.
--
-- This migration performs an extended multi-table DELETE, in one transaction, children
-- before parent. CASCADE-protected children (cost_estimates, lead_views, permit_history,
-- permit_products, permit_phase_transitions) are explicitly DELETEd despite the CASCADE
-- because the original Phase G v2-Q1 design ("no reliance on CASCADE") required per-table
-- row counts in audit_table; preserving that here via RAISE NOTICE.
--
-- IDEMPOTENT: Re-running on a clean DB deletes 0 rows. No-op safe.
-- IRREVERSIBLE: PRE-% data is speculative substrate and Phase G design treats deletion as
-- terminal per Spec 42 §6.11. DOWN section is comment-only.

-- ============================================================================
-- UP
-- ============================================================================
DO $$
DECLARE
  v_parent_count               int;
  v_lead_trades                int;
  v_lead_parcels               int;
  v_tracked_projects           int;
  v_lifecycle_transitions      int;
  v_lifecycle_status_history   int;
  v_permit_history             int;
  v_permit_products            int;
  v_permit_phase_transitions   int;
  v_cost_estimates             int;
  v_lead_views                 int;
  v_permit_trades              int;
  v_permit_parcels             int;
  v_permits_deleted            int;
BEGIN
  SELECT COUNT(*) INTO v_parent_count FROM permits WHERE permit_type = 'Pre-Permit';
  RAISE NOTICE 'mig 157: % Pre-Permit parent rows present before DELETE', v_parent_count;

  -- lead_id-keyed children (Phase C dual-write targets + Phase I.1.1b history)
  WITH d AS (DELETE FROM lead_trades              WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_trades              FROM d;
  WITH d AS (DELETE FROM lead_parcels             WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_parcels             FROM d;
  WITH d AS (DELETE FROM tracked_projects         WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_tracked_projects         FROM d;
  WITH d AS (DELETE FROM lifecycle_transitions    WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lifecycle_transitions    FROM d;
  WITH d AS (DELETE FROM lifecycle_status_history WHERE lead_id LIKE 'permit:PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lifecycle_status_history FROM d;

  -- permit_num-keyed children (FK CASCADE-protected per FK survey 2026-05-19, but
  -- explicit DELETE preserves Phase G v2-Q1 observability precedent)
  WITH d AS (DELETE FROM permit_history           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_history           FROM d;
  WITH d AS (DELETE FROM permit_products          WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_products          FROM d;
  WITH d AS (DELETE FROM permit_phase_transitions WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_phase_transitions FROM d;
  WITH d AS (DELETE FROM cost_estimates           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_cost_estimates           FROM d;
  WITH d AS (DELETE FROM lead_views               WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_lead_views               FROM d;

  -- permit_num-keyed children (NO FK, must precede parent)
  WITH d AS (DELETE FROM permit_trades            WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_trades            FROM d;
  WITH d AS (DELETE FROM permit_parcels           WHERE permit_num LIKE 'PRE-%' RETURNING 1) SELECT COUNT(*) INTO v_permit_parcels           FROM d;

  -- Parent
  WITH d AS (DELETE FROM permits                  WHERE permit_type = 'Pre-Permit' RETURNING 1) SELECT COUNT(*) INTO v_permits_deleted          FROM d;

  RAISE NOTICE 'mig 157 deletions: permits=% permit_trades=% permit_parcels=% permit_history=% permit_products=% permit_phase_transitions=% cost_estimates=% lead_views=% lead_trades=% lead_parcels=% tracked_projects=% lifecycle_transitions=% lifecycle_status_history=%',
    v_permits_deleted, v_permit_trades, v_permit_parcels, v_permit_history, v_permit_products, v_permit_phase_transitions,
    v_cost_estimates, v_lead_views, v_lead_trades, v_lead_parcels, v_tracked_projects, v_lifecycle_transitions, v_lifecycle_status_history;

  IF v_permits_deleted != v_parent_count THEN
    RAISE EXCEPTION 'mig 157 sanity: deleted % parents but expected %', v_permits_deleted, v_parent_count;
  END IF;
END$$;

-- ============================================================================
-- DOWN -- comment-only per Rule 6
-- ============================================================================
-- IRREVERSIBLE: PRE-permit retirement is one-way per Spec 42 §6.11.
-- DOWN is intentionally empty.
