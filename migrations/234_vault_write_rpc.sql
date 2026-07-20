-- 234_vault_write_rpc.sql
-- SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §11 (Vault, as amended)
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md §8.1 (CRON_SECRET)
--
-- Creates a SECURITY DEFINER RPC (public.vault_upsert_secret) wrapping
-- vault.create_secret / vault.update_secret, so application/operator code
-- never issues a raw INSERT/UPDATE against a Vault-backed table directly
-- (Spec 113 §11: "never a raw INSERT/UPDATE against a Vault-backed table
-- from application or pipeline code"). EXECUTE is REVOKEd from PUBLIC/anon/
-- authenticated and GRANTed to service_role only, enforced at the grant
-- level per §11's amended access-scope rule, not left as a convention the
-- SECURITY DEFINER body alone is trusted to honor.
--
-- Live-verified 2026-07-20 (read-only queries against the cloud project
-- gcnatfpacuhsytcbaszi, P3-F7 satellite):
--   * vault.create_secret(new_secret text, new_name text, new_description
--     text, new_key_id uuid) RETURNS uuid — SECURITY DEFINER, already
--     EXECUTE-granted to postgres + service_role only (not anon/authenticated).
--   * vault.update_secret(secret_id uuid, new_secret text, new_name text,
--     new_description text, new_key_id uuid) RETURNS void — same grant shape.
--   * vault.secrets has a UNIQUE partial index secrets_name_idx ON (name)
--     WHERE name IS NOT NULL — safe to upsert-by-name via a
--     SELECT id FROM vault.secrets WHERE name = $1 lookup before choosing
--     create_secret vs update_secret.
--   * `SET LOCAL log_statement = 'none'` inside a transaction SUCCEEDS for
--     the `postgres` role (this function's owner/SECURITY DEFINER identity)
--     on this Supabase project — confirmed via a BEGIN / SET LOCAL / ROLLBACK
--     probe, not assumed. `postgres` is NOT superuser here
--     (pg_roles.rolsuper = false), so this is Supabase granting SET on this
--     specific parameter to the role rather than full superuser — the
--     documented Supabase fallback (https://supabase.com/docs/guides/
--     database/vault — "ALTER SYSTEM SET log_statement = 'none'", a
--     server-wide, operator-applied, non-transactional change requiring
--     real superuser) is NOT needed here because the narrower per-call
--     SET LOCAL already works for this RPC's actual caller. If a future
--     Supabase policy change revokes that grant, this statement starts
--     raising "permission denied to set parameter" on every call — a loud,
--     visible failure, not a silent logging gap.
--
-- Guard: on Docker/CI/plain-local Postgres images the `vault` schema does
-- not exist (only Supabase-flavored Postgres installs it) — this migration
-- NOTICE-skips the entire RPC creation rather than failing, mirroring 232's
-- extension-availability guard. The GoTrue roles (anon/authenticated/
-- service_role) ship together with vault on any Supabase-flavored install
-- (local `supabase start` stack or the cloud project), so gating the whole
-- block on vault's presence also protects the REVOKE/GRANT statements below
-- from a "role does not exist" error on vault-less images — each REVOKE/
-- GRANT additionally checks its target role's existence individually, in
-- case a future image ships vault without the full GoTrue role set.
--
-- CREATE FUNCTION is issued via EXECUTE (dynamic SQL) rather than as a
-- top-level statement specifically so it can be skipped by the guard above —
-- PL/pgSQL bodies are not semantically validated against referenced schema
-- objects at CREATE time, so an unconditional CREATE FUNCTION would have
-- "worked" even without vault present, but would have left a non-functional
-- function on every vault-less environment instead of the requested
-- NOTICE-skip.

-- UP
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE '234: vault schema not present on this instance (Docker/CI/plain-local) — skipping vault_upsert_secret RPC creation entirely';
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.vault_upsert_secret(p_name text, p_secret text)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public, vault
    AS $func$
    DECLARE
      v_id uuid;
    BEGIN
      -- Statement-logging off for this call (Spec 113 §11 "Statement
      -- logging" requirement) — live-verified to succeed for this
      -- function's owner role on this project (see migration header).
      -- SET LOCAL scopes to the current transaction only; restored
      -- automatically on COMMIT/ROLLBACK, never leaks into the caller's
      -- session-wide logging posture.
      SET LOCAL log_statement = 'none';

      SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
      IF v_id IS NULL THEN
        v_id := vault.create_secret(p_secret, p_name);
      ELSE
        PERFORM vault.update_secret(v_id, p_secret);
      END IF;
      RETURN v_id;
    END;
    $func$;
  $sql$;

  -- Every new function grants EXECUTE to PUBLIC by default — revoke first,
  -- then narrow individually. PUBLIC is a pseudo-role (always "exists"),
  -- so this REVOKE needs no existence guard.
  EXECUTE 'REVOKE ALL ON FUNCTION public.vault_upsert_secret(text, text) FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.vault_upsert_secret(text, text) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.vault_upsert_secret(text, text) FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.vault_upsert_secret(text, text) TO service_role';
    RAISE NOTICE '234: vault_upsert_secret RPC created — EXECUTE granted to service_role only';
  ELSE
    RAISE NOTICE '234: vault schema present but service_role role is absent — vault_upsert_secret created with EXECUTE granted to nobody until service_role exists (safe: the RPC is unusable, not insecurely open)';
  END IF;
END;
$migration$;

-- DOWN — comment-only per the ALLOW-DESTRUCTIVE/DOWN convention (Rule 6;
-- scripts/migrate.js executes the entire file as one batch and does not
-- respect `-- DOWN` as a section boundary — see migration 041's header for
-- the full explanation). Manual rollback only:
--
-- DROP FUNCTION IF EXISTS public.vault_upsert_secret(text, text);
