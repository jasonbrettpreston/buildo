-- 237_scrape_outcome_prune.sql
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (permit_scrape_outcomes_prune)
-- SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3 (retention/rollup)
-- SPEC LINK: migrations/236_permit_scrape_outcomes.sql (the tables this prunes)
--
-- Retention for the scrape-outcome ledger (operator ruling D1, WF2
-- 2026-07-31): 90-day raw horizon, prune-time rollup. Follows the
-- migration-235-hardened pg_cron shape: SECURITY DEFINER with
-- search_path = pg_catalog, fully schema-qualified references, a durable
-- pipeline_runs summary row (pg_cron job_run_details does not capture
-- RAISE WARNING output under default config), REVOKE from client roles,
-- function UNGUARDED (CI-testable on images without pg_cron) and only the
-- cron.schedule call pg_extension-guarded with NOTICE-skip +
-- unschedule-by-name idempotency (233 structure).
--
-- Prune semantics (Gemini CRITICAL + DeepSeek folds):
--   * ATOMIC: one data-modifying CTE - DELETE ... RETURNING feeding the
--     rollup upsert. A mid-failure rolls back BOTH halves; there is no
--     window where rows are deleted but not folded.
--   * IDEMPOTENT: re-running prunes nothing new and cannot double-count -
--     occurrences accumulate only from rows actually deleted in THIS call.
--   * Window arithmetic: first_at = LEAST, last_at = GREATEST across runs.
--   * permit_num-NULL raw rows (the zero-resolution fallback of mig 236)
--     fold under COALESCE(permit_num, year_seq) so the anomalies this
--     feature exists for never vanish at the horizon.
--   * Concurrency-safe vs live inserts: the cutoff predicate
--     (observed_at < now() - 90 days) can never select a row the running
--     scrape just wrote.
--   * 235 adaptation, stated: 235 uses a per-row WHEN OTHERS arm inside its
--     user loop; a single-statement atomic prune has no row loop, so the
--     OTHERS arm here wraps the one statement and records a durable
--     status=failed pipeline_runs row instead - per-row swallowing would
--     contradict the ruled atomicity.

-- UP

CREATE OR REPLACE FUNCTION public.prune_permit_scrape_outcomes()
RETURNS TABLE (pruned_count bigint, rollup_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_pruned bigint := 0;
  v_rollup bigint := 0;
  v_started_at timestamptz := clock_timestamp();
BEGIN
  BEGIN
    WITH doomed AS (
      DELETE FROM public.permit_scrape_outcomes
      WHERE observed_at < now() - INTERVAL '90 days'
      RETURNING permit_num, year_seq, outcome, transport, observed_at
    ),

    folded AS (
      INSERT INTO public.permit_scrape_outcome_rollup AS r
        (permit_num, outcome, transport, occurrences, first_at, last_at)
      SELECT
        COALESCE(d.permit_num, d.year_seq),
        d.outcome,
        d.transport,
        count(*),
        min(d.observed_at),
        max(d.observed_at)
      FROM doomed AS d
      GROUP BY COALESCE(d.permit_num, d.year_seq), d.outcome, d.transport
      ON CONFLICT (permit_num, outcome, transport) DO UPDATE
      SET
        occurrences = r.occurrences + excluded.occurrences,
        first_at = LEAST(r.first_at, excluded.first_at),
        last_at = GREATEST(r.last_at, excluded.last_at)
      RETURNING 1
    )

    SELECT
      (SELECT count(*) FROM doomed),
      (SELECT count(*) FROM folded)
    INTO v_pruned, v_rollup;
  EXCEPTION WHEN OTHERS THEN
    -- The atomic statement rolled back whole; leave a durable failure row
    -- so a silently-dead prune is visible in the house observability
    -- surface, then surface the warning for job_run_details.
    RAISE WARNING 'prune_permit_scrape_outcomes failed: %', SQLERRM;
    INSERT INTO public.pipeline_runs
      (pipeline, started_at, completed_at, status, records_meta)
    VALUES (
      'scrape_outcome_prune',
      v_started_at,
      clock_timestamp(),
      'failed',
      jsonb_build_object('error', left(SQLERRM, 500))
    );
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END;

  INSERT INTO public.pipeline_runs
    (pipeline, started_at, completed_at, status, records_meta)
  VALUES (
    'scrape_outcome_prune',
    v_started_at,
    clock_timestamp(),
    'completed',
    jsonb_build_object(
      'pruned_count', v_pruned,
      'rollup_rows', v_rollup,
      'retention_days', 90
    )
  );

  RETURN QUERY SELECT v_pruned, v_rollup;
END;
$$;

-- Service plumbing only: no client-role execution path.
REVOKE ALL ON FUNCTION public.prune_permit_scrape_outcomes() FROM PUBLIC; -- noqa: CP02
REVOKE ALL ON FUNCTION public.prune_permit_scrape_outcomes() FROM anon, authenticated;

-- Schedule - guarded exactly like 233/235: NOTICE-skip where pg_cron is
-- absent (Docker/CI postgis images); idempotent unschedule-by-name first.
-- 08:00 UTC daily: clear of the 09:00/10:00/14:30 maintenance jobs and the
-- 15/18/21 UTC deep-scrapes chain windows.
DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '237: pg_cron not installed - permit_scrape_outcomes_prune not scheduled on this instance (Docker/CI). Cloud/local-Supabase instances schedule on replay.';
    RETURN;
  END IF;

  FOR v_job IN SELECT jobid, jobname FROM cron.job
    WHERE jobname = 'permit_scrape_outcomes_prune'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'permit_scrape_outcomes_prune',
    '0 8 * * *',
    'SELECT * FROM public.prune_permit_scrape_outcomes()'
  );

  RAISE NOTICE '237: permit_scrape_outcomes_prune scheduled daily 08:00 UTC';
END $$;

-- DOWN (documentation only - Rule 6: migrate.js executes every uncommented
-- line, DOWN blocks must not contain executable SQL. Manual reversal:)
--   SELECT cron.unschedule(jobid) FROM cron.job
--     WHERE jobname = 'permit_scrape_outcomes_prune';
--   DROP FUNCTION IF EXISTS public.prune_permit_scrape_outcomes();
