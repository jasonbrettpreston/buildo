-- 225_pin_function_search_path.sql
-- SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §6
--   (search_path resolution contract for postgis/pg_trgm/fuzzystrmatch
--   installed into `public`, Decision D4)
--
-- Incident (Phase 0.5 restore blocker, 2026-07-18):
--   `node scripts/restore-db.js --target=local --mode=fresh` failed loading
--   `permits` — pg_restore forces `search_path=''` for the duration of a
--   data-only restore (upstream pg_dump/pg_restore CVE-2018-1058 hardening,
--   in effect since PG 11), and the `permits_set_lead_id()` trigger function
--   (mig 132, amended by 138_a) references `permit_type_classifications`
--   unqualified. With an empty search_path the trigger's
--   `SELECT class FROM permit_type_classifications` cannot resolve the
--   table, aborting the COPY into `permits` mid-restore.
--
--   This is also Supabase security-advisor lint `function_search_path_mutable`
--   — any function without a pinned `search_path` is vulnerable to a
--   search_path hijack (an attacker-created same-named object earlier in a
--   caller's search_path silently shadows the intended one). Pinning
--   `search_path = public` on every Buildo-authored function/procedure fixes
--   both the restore blocker and the lint in one pass.
--
-- Scope: the DO block below iterates every routine (function/procedure —
-- excludes aggregates 'a' and window functions 'w' via `prokind`) in schema
-- `public` that is NOT extension-owned (pg_depend deptype='e' — this
-- excludes the ~786 PostGIS/pg_trgm/fuzzystrmatch functions living in
-- `public` per Spec 113 §6 Decision D4; those are not Buildo's to alter,
-- and ALTER-ing an extension-owned function is unsupported / gets reverted
-- on the extension's next upgrade). Verified against the local Supabase DB
-- before authoring this migration: exactly 12 Buildo-authored functions
-- match (all trigger/helper functions, all owned by role `postgres`, none
-- previously carrying a `search_path` GUC override) — `address_match_status`,
-- `coa_set_lead_id`, `mirror_permit_parcels_to_lead_parcels`,
-- `mirror_permit_trades_to_lead_trades`, `normalize_address`,
-- `normalize_address_number`, `permits_set_lead_id`, `permits_set_location`,
-- `scrub_admin_audit_for_target`, `sync_permit_location`,
-- `trigger_set_permit_type_classifications_updated_at`,
-- `trigger_set_timestamp`. `st_area` (and every other PostGIS routine)
-- verified excluded by the pg_depend filter.
--
-- `ALTER FUNCTION ... SET search_path = public` is idempotent (re-applying
-- is a no-op) and changes nothing about normal runtime behavior: every one
-- of these functions already assumes its unqualified references resolve
-- against `public`, which is exactly what the default session search_path
-- (`"$user",public`) already provides. Pinning only removes the dependency
-- on that default being in effect — the dependency pg_restore's
-- `search_path=''` hardening breaks. Trigger functions specifically need no
-- behavior change: they already assume `public` at normal runtime; this
-- migration only makes that assumption explicit and restore-proof.
--
-- Availability: no guard needed (D13) — this is plain DDL against
-- `pg_proc`/`pg_depend`, present and behaving identically on every PG
-- instance in play (local Supabase PG17, cloud Supabase PG17, Docker dev
-- PG15/16, CI's postgis/postgis containers).

-- UP
DO $$
DECLARE
    rec RECORD;
    altered_count INTEGER := 0;
BEGIN
    FOR rec IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind NOT IN ('a', 'w')  -- exclude aggregates + window functions
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid
                AND d.classid = 'pg_proc'::regclass
                AND d.deptype = 'e'          -- exclude extension-owned (PostGIS etc.)
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public', rec.sig);
        altered_count := altered_count + 1;
    END LOOP;

    RAISE NOTICE 'Migration 225: pinned search_path=public on % Buildo-authored public-schema function(s).', altered_count;
END $$;

-- DOWN — Rule 6 comments-only (single-txn runner — tasks/lessons.md). Manual rollback only.
-- To revert, RESET search_path on each affected function individually, e.g.:
--   ALTER FUNCTION public.permits_set_lead_id() RESET search_path;
-- (repeat for the other 11 functions listed in this migration's header comment).
-- Reverting removes the restore-blocker fix and reopens the
-- function_search_path_mutable lint — do not revert without a replacement
-- fix for the Phase 0.5 restore path.
