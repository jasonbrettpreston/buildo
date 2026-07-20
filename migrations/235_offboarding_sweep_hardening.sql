-- 235_offboarding_sweep_hardening.sql
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (offboarding_sweep_30day)
-- SPEC LINK: migrations/233_pg_cron_maintenance_catalog.sql (233 is APPLIED — this is a
--   fix-forward CREATE OR REPLACE, not an edit to 233 itself)
--
-- F8 fold (2026-07-20) — Phase 3 output-panel hardening for the two
-- pg_cron-scheduled maintenance jobs 233 introduced:
--
--   1. offboarding_sweep_30day() v2 (Observability HIGH + DeepSeek HIGH):
--      - A second exception arm, `WHEN OTHERS`, alongside the existing
--        `WHEN foreign_key_violation` arm — a non-FK error for one user
--        (a lock conflict, a constraint this migration's author didn't
--        anticipate, anything) must not abort the whole batch the way an
--        unguarded exception would; it is now caught, RAISE WARNING'd, and
--        counted as skipped, same as the RESTRICT-fence case.
--      - `SET search_path = pg_catalog` (was `public, pg_catalog`), with
--        every non-pg_catalog reference fully schema-qualified
--        (`public.user_profiles`, `auth.users`, `public.pipeline_runs`) —
--        the search_path itself no longer resolves `public` objects, so an
--        unqualified reference is a hard error at CREATE time, not a
--        silent hijack risk at call time.
--      - At function end, a durable summary row is INSERTed into
--        `public.pipeline_runs` (pipeline='offboarding_sweep',
--        status='completed', started_at/completed_at, records_meta with
--        deleted_count/skipped_count/skipped_user_ids) — pg_cron's
--        `cron.job_run_details.return_message` does NOT capture
--        `RAISE WARNING` output under default config, so `pipeline_runs`
--        (the house observability surface every other pipeline writes to)
--        is the only place this sweep's outcome is durably visible.
--      - RETURNS TABLE (deleted_count int, skipped_count int) is UNCHANGED
--        (still the 233 signature) — the pipeline_runs row is an ADDITION,
--        not a replacement for the return value.
--      - REVOKE surface identical to 233's (service-plumbing only).
--   2. lead_views_retention_purge re-scheduled with `LIMIT 1` added to the
--      logic_variables subquery (DeepSeek HIGH, defensive — the subquery
--      is expected to match at most one row today, but an accidental
--      second `lead_view_retention_days` row would make the bare subquery
--      throw "more than one row returned by a subquery used as an
--      expression" and silently break the nightly purge; LIMIT 1 makes the
--      job resilient to that instead of dependent on it never happening).
--
-- UP

CREATE OR REPLACE FUNCTION public.offboarding_sweep_30day()
RETURNS TABLE (deleted_count int, skipped_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user record;
  v_deleted int := 0;
  v_skipped int := 0;
  v_skipped_ids uuid[] := '{}'::uuid[];
  v_started_at timestamptz := clock_timestamp();
BEGIN
  FOR v_user IN
    SELECT up.user_id
      FROM public.user_profiles up
     WHERE up.account_deleted_at IS NOT NULL
       AND up.account_deleted_at < NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      -- D6/mig-229 CASCADE topology removes every user-owned row in one
      -- statement; admin_watchlist SET-NULLs; admin_audit_log RESTRICTs.
      DELETE FROM auth.users WHERE id = v_user.user_id;
      v_deleted := v_deleted + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        -- The mig-229 audit fence: this user authored admin_audit_log rows.
        -- Deleting them requires the manual RTBF scrub (P24 pattern: scrub
        -- PII, keep the row) BEFORE the account can be removed. Surface,
        -- skip, continue with the rest of the batch.
        RAISE WARNING 'offboarding_sweep_30day: user % skipped — admin_audit_log RESTRICT fence (manual RTBF scrub required)', v_user.user_id;
        v_skipped := v_skipped + 1;
        v_skipped_ids := v_skipped_ids || v_user.user_id;
      WHEN OTHERS THEN
        -- F8 fold (Observability HIGH): any OTHER error for this one user
        -- (not the FK-RESTRICT fence above) must not roll back the whole
        -- batch — surface, skip, continue.
        RAISE WARNING 'offboarding_sweep_30day: unexpected error for user %: %', v_user.user_id, SQLERRM;
        v_skipped := v_skipped + 1;
        v_skipped_ids := v_skipped_ids || v_user.user_id;
    END;
  END LOOP;

  -- F8 fold (Observability HIGH): durable summary row — pg_cron's
  -- cron.job_run_details.return_message does not capture RAISE WARNING
  -- output under default config, so this INSERT is the only durable record
  -- of this run's outcome, mirroring every other pipeline's pipeline_runs
  -- convention.
  INSERT INTO public.pipeline_runs (pipeline, started_at, completed_at, status, records_meta)
  VALUES (
    'offboarding_sweep',
    v_started_at,
    clock_timestamp(),
    'completed',
    jsonb_build_object(
      'deleted_count', v_deleted,
      'skipped_count', v_skipped,
      'skipped_user_ids', to_jsonb(v_skipped_ids)
    )
  );

  RETURN QUERY SELECT v_deleted, v_skipped;
END;
$$;

-- Function is service-plumbing: no client-role execution path. Restated
-- (not merely inherited from 233) because CREATE OR REPLACE FUNCTION does
-- not reset existing grants, but explicit is cheaper than assumed here.
REVOKE ALL ON FUNCTION public.offboarding_sweep_30day() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.offboarding_sweep_30day() FROM anon, authenticated;

-- Re-schedule lead_views_retention_purge with the LIMIT 1 defensive guard
-- (DeepSeek HIGH). Guarded exactly like 233: NOTICE-skip where pg_cron is
-- absent (Docker/CI postgis images); idempotent unschedule-by-name first.
DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '235: pg_cron not installed — lead_views_retention_purge re-schedule skipped on this instance (Docker/CI).';
    RETURN;
  END IF;

  FOR v_job IN SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'lead_views_retention_purge'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'lead_views_retention_purge',
    '0 9 * * *',
    $job$DELETE FROM public.lead_views
      WHERE viewed_at < NOW() - make_interval(days =>
        (SELECT COALESCE(variable_value::int, 90) FROM public.logic_variables
          WHERE variable_key = 'lead_view_retention_days' LIMIT 1))$job$
  );

  RAISE NOTICE '235: lead_views_retention_purge re-scheduled with LIMIT 1 defensive guard';
END $$;

-- DOWN (documentation only — Rule 6: migrate.js executes every line, DOWN
-- blocks must not contain executable SQL. Manual reversal procedure:)
--   -- Reverts to 233's function body (search_path = public, pg_catalog;
--   -- no OTHERS arm; no pipeline_runs summary row) by re-running 233's
--   -- CREATE OR REPLACE FUNCTION block, then re-scheduling
--   -- lead_views_retention_purge without LIMIT 1 the same way.
--   DELETE FROM cron.job WHERE jobname = 'lead_views_retention_purge';
--   -- (then re-apply 233's version of both the function and the schedule)
