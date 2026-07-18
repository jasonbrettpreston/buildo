-- 226_profiles_admin_bootstrap.sql
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §5 (Class C —
--   profiles) + docs/specs/00-architecture/13_authentication.md (Decision D7 —
--   admin authorization moves to profiles.is_admin). Authored per the
--   panel-locked `.cursor/phase1_plan.md` Item 3 (P1-F3a), SQL BINDING as
--   written there (RESTRICT/ALLOW-DESTRUCTIVE/search_path fixes already
--   folded in during plan review).
--
-- `profiles` is a new table, distinct from the existing `user_profiles`
-- (Class A, converted in place by D6/migration 229) — this is the standard
-- Supabase convention of a lightweight `public.profiles` row per
-- `auth.users` row, carrying auth-adjacent flags only (today: `is_admin`).
--
-- Bootstrap seed mechanism note: this migration creates the TABLE + trigger
-- machinery only. The operator's own account is NOT seeded here — it is
-- provisioned by `scripts/bootstrap-first-admin.js` (run as part of P1-F3a,
-- AFTER this migration lands), which creates the operator's `auth.users` row
-- directly via the service-role Admin API and promotes it, rather than
-- racing a public sign-up (see that script's header for the account-
-- squatting rationale this closes).

-- UP
BEGIN;

CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard Supabase convention: every new auth.users row gets a profiles row
-- automatically, so verify-admin.ts's SELECT never has to special-case a
-- missing row for a freshly-signed-up (non-admin) user.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Spec 114 §5 — self-read/self-update-minus-is_admin, Class C.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- INERT BY DESIGN under D1/raw-pg [panel-fold: Security BLOCKING] — request.jwt.claims
-- is a PostgREST/Data-API setting; Buildo's app connects directly via pg (D1),
-- which never sets it, so current_setting(...) returns NULL and the IS DISTINCT
-- FROM check never raises for ANY caller, service-role or not. This trigger is
-- defense-in-depth for a FUTURE Data-API re-enable, not today's real control.
-- TODAY's real control is app-layer: any future admin-promotion route MUST
-- re-verify caller privilege itself (a service-role connection, or an explicit
-- is_admin check on the acting user) before writing is_admin — this migration
-- does not and cannot enforce that from the DB side while the app connects as
-- table owner. The proper DB-side fix (a dedicated non-owner elevated role with
-- `REVOKE UPDATE(is_admin) FROM app_role`) is recorded as the post-launch D5
-- hardening item — adding it today would be meaningless, since the app
-- connects as owner and bypasses column-level GRANT/REVOKE trivially.
CREATE OR REPLACE FUNCTION prevent_is_admin_self_escalation()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND current_setting('request.jwt.claims', true)::json ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'is_admin may only be changed via the service-role admin path';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- search_path pinned per Spec 114 §5's template [panel-fold: SF] (already
-- corrected this session — see migration 225 precedent for the same fix).

CREATE TRIGGER trg_prevent_is_admin_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_is_admin_self_escalation();

COMMIT;

-- DOWN — comment-only per Rule 6 (matches mig 212/213/215/217 convention).
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_prevent_is_admin_self_escalation ON profiles;
--   DROP FUNCTION IF EXISTS prevent_is_admin_self_escalation();
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP FUNCTION IF EXISTS handle_new_user();
--   DROP TABLE IF EXISTS profiles;
-- COMMIT;
