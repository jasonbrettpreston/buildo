-- 233_pg_cron_maintenance_catalog.sql
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (catalog), §5a (qualification rule)
-- SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.4 (scope boundary)
--
-- The three in-DB SQL maintenance jobs (NEVER a must-succeed job — pg_cron
-- gives no retry/alert and silently skips when the DB is unhealthy):
--   1. mv_monthly_permit_stats_refresh — nightly 14:30 UTC (after the 11:00
--      UTC coa→permits window + headroom). CONCURRENTLY is legal: unique
--      index idx_mv_monthly_month_type (month, permit_type), live-verified.
--   2. lead_views_retention_purge — daily 09:00 UTC. Replaces the retention
--      half of scripts/purge-lead-views.js (deleted at P3-F6, ADR-007).
--      logic_variables.variable_value is NUMERIC → make_interval cast.
--   3. offboarding_sweep_30day — daily 10:00 UTC. Spec 97 §3.2's never-built
--      sweep. PER-USER loop with exception handling: admin_audit_log's
--      ON DELETE RESTRICT (mig 229 deliberate fence — audit trails survive
--      account deletion) makes a batch DELETE abort entirely on one
--      audit-authoring user; per-user + RAISE WARNING skips-and-surfaces
--      those for manual RTBF scrub (visible in cron.job_run_details).
--
-- The sweep FUNCTION is created UNGUARDED (plain SQL — testable on CI images
-- without pg_cron); only the cron.schedule() calls are availability-guarded.
-- All scheduler call sites schema-qualified cron.* per §5a.

-- UP

-- Partial index supporting the sweep predicate (cheap insurance — Gemini MED
-- fold; the table is small today but the index makes the daily scan O(deleted)).
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_deleted
  ON user_profiles (account_deleted_at)
  WHERE account_deleted_at IS NOT NULL;

-- The sweep function: per-user, RESTRICT-fence-aware.
CREATE OR REPLACE FUNCTION public.offboarding_sweep_30day()
RETURNS TABLE (deleted_count int, skipped_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user record;
  v_deleted int := 0;
  v_skipped int := 0;
BEGIN
  FOR v_user IN
    SELECT up.user_id
      FROM user_profiles up
     WHERE up.account_deleted_at IS NOT NULL
       AND up.account_deleted_at < NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      -- D6/mig-229 CASCADE topology removes every user-owned row in one
      -- statement; admin_watchlist SET-NULLs; admin_audit_log RESTRICTs.
      DELETE FROM auth.users WHERE id = v_user.user_id;
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      -- The mig-229 audit fence: this user authored admin_audit_log rows.
      -- Deleting them requires the manual RTBF scrub (P24 pattern: scrub
      -- PII, keep the row) BEFORE the account can be removed. Surface, skip,
      -- continue with the rest of the batch.
      RAISE WARNING 'offboarding_sweep_30day: user % skipped — admin_audit_log RESTRICT fence (manual RTBF scrub required)', v_user.user_id;
      v_skipped := v_skipped + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT v_deleted, v_skipped;
END;
$$;

-- Function is service-plumbing: no client-role execution path.
REVOKE ALL ON FUNCTION public.offboarding_sweep_30day() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_sweep_30day() FROM anon, authenticated;

-- Schedule the catalog — guarded: NOTICE-skip where pg_cron is absent
-- (Docker/CI postgis images). Idempotent: unschedule-if-exists first.
DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '233: pg_cron not installed — catalog jobs not scheduled on this instance (Docker/CI). Cloud/local-Supabase instances schedule on replay.';
    RETURN;
  END IF;

  FOR v_job IN SELECT jobid, jobname FROM cron.job
    WHERE jobname IN ('mv_monthly_permit_stats_refresh', 'lead_views_retention_purge', 'offboarding_sweep_30day')
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'mv_monthly_permit_stats_refresh',
    '30 14 * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_permit_stats'
  );

  PERFORM cron.schedule(
    'lead_views_retention_purge',
    '0 9 * * *',
    $job$DELETE FROM public.lead_views
      WHERE viewed_at < NOW() - make_interval(days =>
        (SELECT COALESCE(variable_value::int, 90) FROM public.logic_variables
          WHERE variable_key = 'lead_view_retention_days'))$job$
  );

  PERFORM cron.schedule(
    'offboarding_sweep_30day',
    '0 10 * * *',
    'SELECT * FROM public.offboarding_sweep_30day()'
  );

  RAISE NOTICE '233: 3 pg_cron maintenance jobs scheduled';
END $$;

-- DOWN (documentation only — Rule 6: migrate.js executes every line, DOWN
-- blocks must not contain executable SQL. Manual reversal procedure:)
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN
--     ('mv_monthly_permit_stats_refresh','lead_views_retention_purge','offboarding_sweep_30day');
--   DROP FUNCTION IF EXISTS public.offboarding_sweep_30day();
--   DROP INDEX IF EXISTS idx_user_profiles_account_deleted;
