-- 224_enable_pg_cron_pg_net.sql
-- Spec 113 §6/§8.4 (Supabase migration program, Phase 0.4): enable pg_cron +
-- pg_net for in-DB SQL maintenance scheduling and DB→HTTP webhooks.
--
-- Availability-guarded: the Docker postgis dev image and CI containers do not
-- ship these extension binaries, and Decision D13 requires every migration to
-- replay green on BOTH instances during the coexistence window. Where the
-- extension is unavailable this migration logs a NOTICE and skips — it is NOT
-- an error; the extensions are only functionally required on Supabase hosts
-- (local `supabase start` stack + cloud project), where they are available.

-- UP
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    ELSE
        RAISE NOTICE 'pg_cron unavailable on this host — skipped (expected on Docker/CI dev images; required on Supabase, Spec 113 §8.4)';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
        CREATE EXTENSION IF NOT EXISTS pg_net;
    ELSE
        RAISE NOTICE 'pg_net unavailable on this host — skipped (expected on Docker/CI dev images; required on Supabase, Spec 113 §8.4)';
    END IF;
END $$;

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- DROP EXTENSION IF EXISTS pg_net;
-- DROP EXTENSION IF EXISTS pg_cron;
