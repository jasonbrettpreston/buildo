-- 232_pg_cron_pg_net_schema_determinism.sql
-- SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5a
-- SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §6, §8.4
--
-- NOT a relocation migration. Live-verified facts (2026-07-20, Schema-Fidelity):
--   * pg_cron is control-file-fixed to schema pg_catalog (extrelocatable=false);
--     its callable surface lives in the hardcoded `cron` schema regardless.
--     It CANNOT be moved — CREATE EXTENSION ... SCHEMA errors, ALTER EXTENSION
--     ... SET SCHEMA is rejected for non-relocatable extensions.
--   * pg_net is likewise non-relocatable; its functions live in the hardcoded
--     `net` schema regardless of which schema the extension row is booked in.
-- The durable invariant is therefore NOT "which schema the extension row is
-- in" but "every call site schema-qualifies cron.* / net.*" (233 complies).
-- This migration only (a) makes pg_net's extension-row placement deterministic
-- on FRESH installs (SCHEMA extensions, matching Supabase's baseline) and
-- (b) NOTICEs the live layout for the migration log.
-- Mirrors 224's availability-guard pattern: NOTICE-skip on Docker/CI images
-- where the extensions are not available (postgis image ships neither).

-- UP
DO $$
DECLARE
  v_ns text;
BEGIN
  -- (a) Fresh-install determinism for pg_net: only when available, not yet
  -- installed, AND the `extensions` schema exists (absent on plain postgis
  -- images — Supabase images create it).
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
     AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION pg_net SCHEMA extensions;
    RAISE NOTICE '232: pg_net installed into schema extensions (fresh install)';
  END IF;

  -- (b) Layout assertions — NOTICE only, never fail: the callable schemas are
  -- fixed by the extensions themselves; this is a migration-log breadcrumb.
  SELECT n.nspname INTO v_ns
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_cron';
  IF v_ns IS NOT NULL THEN
    RAISE NOTICE '232: pg_cron extension row in schema % (callable surface fixed at cron.*)', v_ns;
  ELSE
    RAISE NOTICE '232: pg_cron not installed on this instance (Docker/CI image) — cron.* call sites are guarded downstream';
  END IF;

  SELECT n.nspname INTO v_ns
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_net';
  IF v_ns IS NOT NULL THEN
    RAISE NOTICE '232: pg_net extension row in schema % (callable surface fixed at net.*)', v_ns;
  ELSE
    RAISE NOTICE '232: pg_net not installed on this instance (Docker/CI image)';
  END IF;
END $$;

-- DOWN
-- No-op by design (mirrors 224): extension installation is environment
-- infrastructure; dropping pg_net on DOWN could strand cloud-side consumers.
-- Nothing this migration created needs reversal — the fresh-install CREATE
-- only fires where pg_net had never been installed.
