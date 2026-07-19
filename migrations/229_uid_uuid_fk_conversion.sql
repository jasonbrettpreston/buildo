-- 229_uid_uuid_fk_conversion.sql
-- SPEC LINK: docs/adr/007-supabase-auth-uuid-fk.md (D6 — the binding per-table
--   ON DELETE split) + docs/specs/00-architecture/114_rls_policy_catalog.md §3/§7
--   (Class A tables; RLS lands in 230 strictly after this file) +
--   docs/specs/00-architecture/116_multi_product_architecture.md §4 (legacy
--   subscription-column retirement). Authored per the panel-locked
--   `.cursor/phase1_plan.md` Item 3 (P1-F3e), Schema-Fidelity corrections
--   BINDING: admin_audit_log = ON DELETE RESTRICT with admin_uid staying
--   NOT NULL (ADR-007); admin_watchlist = SET NULL; 8 user-owned tables CASCADE.
--
-- Converts the 10 Firebase-uid identity columns (ADR-007 G9 inventory:
-- 6x VARCHAR(128), 2x VARCHAR(100), 2x TEXT — verified live this session)
-- to uuid and adds real FKs to auth.users(id), superseding the ADR-006
-- "free-floating VARCHAR, no FK" model. Pre-launch, zero-user cutover:
-- the DO-block gate below HALTs on any nonzero row count (G10 pinned
-- 0-row baseline re-verified at execution time, never assumed).

-- UP
BEGIN;

-- HALT precondition (ADR-007 "Execution is gated, not assumed safe"; mirrors
-- the mig-217 rogue-value guard pattern). Any row count > 0 aborts the whole
-- transaction: dump the rows, human signs off on delete-or-keep, re-run.
-- NEVER --force past this gate.
DO $$
DECLARE tbl text; cnt integer;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'user_profiles','lead_views','lead_view_events','subscribe_nonces',
    'device_tokens','tracked_projects','notifications',
    'notification_dispatches','admin_watchlist','admin_audit_log'
  ] LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO cnt;
    IF cnt > 0 THEN
      RAISE EXCEPTION 'migration 229 HALT: table % has % rows (expected 0 pre-launch, G10 pinned) — dump the rows, get human sign-off on delete-or-keep, then re-run. NEVER --force.', tbl, cnt;
    END IF;
  END LOOP;
END $$;

-- Two pre-existing FKs (migration 114) point AT user_profiles.user_id from
-- lead_view_events/subscribe_nonces. They must be dropped BEFORE the type
-- conversion (Postgres re-validates FKs on ALTER TYPE; uuid vs text has no
-- equality operator, so converting either side while the FK exists fails)
-- and are RE-ADDED verbatim after all columns are uuid — the mig-114 fence
-- ("every event/nonce row belongs to a registered profile; profile deletion
-- cleans them up") is knowingly PRESERVED, not retired, alongside the new
-- direct auth.users FKs D6 mandates.
ALTER TABLE lead_view_events DROP CONSTRAINT fk_lve_user;
ALTER TABLE subscribe_nonces DROP CONSTRAINT subscribe_nonces_user_id_fkey;

-- Per-table ALTER ... TYPE uuid USING <col>::uuid. The 0-row gate above makes
-- the USING cast a formality (no legacy Firebase-shaped string can exist to
-- fail the cast), not a real data conversion.
-- CASCADE x8 — end-user-owned rows, meaningless once their owner is gone
-- (ADR-007 Decision).
ALTER TABLE user_profiles ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE user_profiles ADD CONSTRAINT fk_user_profiles_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE lead_views ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE lead_views ADD CONSTRAINT fk_lead_views_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE lead_view_events ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE lead_view_events ADD CONSTRAINT fk_lead_view_events_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE subscribe_nonces ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE subscribe_nonces ADD CONSTRAINT fk_subscribe_nonces_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE device_tokens ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE device_tokens ADD CONSTRAINT fk_device_tokens_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE tracked_projects ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE tracked_projects ADD CONSTRAINT fk_tracked_projects_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE notifications ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE notification_dispatches ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE notification_dispatches ADD CONSTRAINT fk_notification_dispatches_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SET NULL — admin_watchlist is a personal curation list (Spec 36), not a
-- fact-of-record audit trail; rows of a deleted admin become orphaned-but-
-- harmless rather than blocking the deletion (ADR-007).
ALTER TABLE admin_watchlist ALTER COLUMN admin_uid TYPE UUID USING admin_uid::uuid;
ALTER TABLE admin_watchlist ALTER COLUMN admin_uid DROP NOT NULL; -- SET NULL requires nullable
ALTER TABLE admin_watchlist ADD CONSTRAINT fk_admin_watchlist_admin
  FOREIGN KEY (admin_uid) REFERENCES auth.users(id) ON DELETE SET NULL;

-- RESTRICT — admin_audit_log IS the fact-of-record (mig 217 PII-FACT
-- convention). [Schema-Fidelity BINDING / ADR-007] admin_uid stays NOT NULL —
-- an audit-log row with no recorded actor is a broken audit trail, not a
-- valid state, so NOT NULL is NEVER dropped here — and the FK is ON DELETE
-- RESTRICT, not SET NULL: deleting an auth.users row that authored an
-- audit-log entry must fail loudly (the operator explicitly decides what
-- happens to that history first — scrub per the P24 RTBF pattern, then
-- delete), never silently null out who performed the audited action.
ALTER TABLE admin_audit_log ALTER COLUMN admin_uid TYPE UUID USING admin_uid::uuid;
ALTER TABLE admin_audit_log ADD CONSTRAINT fk_admin_audit_log_admin
  FOREIGN KEY (admin_uid) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Re-add the two mig-114 FKs dropped above, byte-same semantics, now uuid
-- on both sides (fence preserved — see comment at the DROP CONSTRAINT site).
ALTER TABLE lead_view_events ADD CONSTRAINT fk_lve_user
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;
ALTER TABLE subscribe_nonces ADD CONSTRAINT subscribe_nonces_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;

-- Legacy-column disposition (phase1_plan.md Item 4 decision: DROP, not
-- keep-and-mirror). Folded into THIS migration (the "D6 window") per the
-- task explicit instruction. SAFE ONLY because the Phase 1.3 code swap
-- (all 8 writers W1-W8 + readers R1-R5/R7-R8) landed and passed tests
-- BEFORE this migration runs (commit 76f36239; grep gate: zero code
-- references to user_profiles.subscription_status / trial_started_at /
-- last_stripe_event_at) — there is no live reader left on these columns
-- at the moment this DROP executes. Superseded by entitlements (Spec 116
-- N2, migration 228).
-- NOTE: dropping subscription_status also auto-drops its table-level CHECK
-- constraint chk_subscription_status (mig 114) — the constraint depends
-- only on the dropped column, so Postgres removes it with the column; no
-- separate DROP CONSTRAINT is needed and none must be attempted in DOWN.
-- ALLOW-DESTRUCTIVE
ALTER TABLE user_profiles DROP COLUMN subscription_status;
ALTER TABLE user_profiles DROP COLUMN trial_started_at;
ALTER TABLE user_profiles DROP COLUMN last_stripe_event_at;

COMMIT;

-- DOWN — comment-only per Rule 6 (migrate.js executes every uncommented
-- line). Reversing a uuid->varchar cast is lossy (original Firebase uids are
-- gone once auth.users itself has been cut over) and the dropped columns
-- cannot be un-dropped with their data. This DOWN is a schema-shape-only
-- reversal for emergency use, NOT a data recovery path — pairs with the
-- Phase 1 abort clause (phase1_plan.md Item 7).
-- BEGIN;
--   ALTER TABLE user_profiles ADD COLUMN subscription_status TEXT;
--   ALTER TABLE user_profiles ADD CONSTRAINT chk_subscription_status
--     CHECK (subscription_status IN ('trial','active','past_due','expired','cancelled_pending_deletion','admin_managed'));
--   ALTER TABLE user_profiles ADD COLUMN trial_started_at TIMESTAMPTZ;
--   ALTER TABLE user_profiles ADD COLUMN last_stripe_event_at TIMESTAMPTZ;
--   ALTER TABLE lead_view_events DROP CONSTRAINT IF EXISTS fk_lve_user;
--   ALTER TABLE subscribe_nonces DROP CONSTRAINT IF EXISTS subscribe_nonces_user_id_fkey;
--   ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS fk_admin_audit_log_admin;
--   ALTER TABLE admin_audit_log ALTER COLUMN admin_uid TYPE VARCHAR(128);
--   ALTER TABLE admin_watchlist DROP CONSTRAINT IF EXISTS fk_admin_watchlist_admin;
--   ALTER TABLE admin_watchlist ALTER COLUMN admin_uid SET NOT NULL;
--   ALTER TABLE admin_watchlist ALTER COLUMN admin_uid TYPE VARCHAR(128);
--   ALTER TABLE notification_dispatches DROP CONSTRAINT IF EXISTS fk_notification_dispatches_user;
--   ALTER TABLE notification_dispatches ALTER COLUMN user_id TYPE VARCHAR(100);
--   ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;
--   ALTER TABLE notifications ALTER COLUMN user_id TYPE VARCHAR(100);
--   ALTER TABLE tracked_projects DROP CONSTRAINT IF EXISTS fk_tracked_projects_user;
--   ALTER TABLE tracked_projects ALTER COLUMN user_id TYPE VARCHAR(128);
--   ALTER TABLE device_tokens DROP CONSTRAINT IF EXISTS fk_device_tokens_user;
--   ALTER TABLE device_tokens ALTER COLUMN user_id TYPE VARCHAR(128);
--   ALTER TABLE subscribe_nonces DROP CONSTRAINT IF EXISTS fk_subscribe_nonces_user;
--   ALTER TABLE subscribe_nonces ALTER COLUMN user_id TYPE TEXT;
--   ALTER TABLE lead_view_events DROP CONSTRAINT IF EXISTS fk_lead_view_events_user;
--   ALTER TABLE lead_view_events ALTER COLUMN user_id TYPE TEXT;
--   ALTER TABLE lead_views DROP CONSTRAINT IF EXISTS fk_lead_views_user;
--   ALTER TABLE lead_views ALTER COLUMN user_id TYPE VARCHAR(128);
--   ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS fk_user_profiles_user;
--   ALTER TABLE user_profiles ALTER COLUMN user_id TYPE VARCHAR(128);
--   -- (re-adding the mig-114 FKs against VARCHAR columns then requires
--   --  re-running the mig-114 ADD CONSTRAINT statements)
-- COMMIT;
