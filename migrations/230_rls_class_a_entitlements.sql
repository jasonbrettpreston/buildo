-- 230_rls_class_a_entitlements.sql
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §3.1/§3.2
--   (Class A owner-scoped templates), §7 (sequenced strictly AFTER the 229
--   uuid conversion — auth.uid() is uuid, the predicate now type-checks
--   as a plain uuid comparison), §8 (naming + mechanics), §10 (every
--   CREATE POLICY below gets a positive and a negative pgTAP case in
--   supabase/tests/rls_class_a.test.sql). Authored per the panel-locked
--   `.cursor/phase1_plan.md` Item 3 (P1-F3f); entitlements is the 11th
--   Class A table (owner-read-only, Spec 114 §3.1 amendment cited in the
--   program plan Phase 1.4).
--
-- Defense-in-depth only (Spec 114 §1): Data API is disabled (D10) and the
-- pipeline + Next.js API connect as table owner (RLS-exempt, D1) — these
-- policies gate a FUTURE Data API re-enable and any leaked
-- anon/authenticated key, not any live request path today.
--
-- Per-table operation sets follow each table's REAL write pattern
-- (Spec 114 §3.1 — checked against the route handlers this session):
--   user_profiles            select/insert/update  (self-provision INSERT in
--                            user-profile route + get-user-context; PATCH
--                            updates; account delete is a soft-delete UPDATE,
--                            never a row DELETE)
--   lead_views               select/insert/update  (record-lead-view upsert)
--   lead_view_events         select/insert         (append-only view log)
--   subscribe_nonces         select/insert/delete  (session mints, exchange
--                            consumes via DELETE)
--   device_tokens            select/insert/update  (register route upsert)
--   tracked_projects         select                (NO live write path exists
--                            today — widen only when a write route ships)
--   notifications            select/update         (mark-read; rows are
--                            server-created)
--   notification_dispatches  select                (server-written ledger —
--                            the Spec 114 §3.1 named example)
--   admin_watchlist          select/insert/update/delete, own_admin
--                            (Spec 114 §3.2: mutations mirror the same shape)
--   admin_audit_log          select, admin, read-only (Spec 114 §3.2:
--                            absence of a policy per operation IS the deny)
--   entitlements             select only (server-written by webhook/admin/
--                            trial-init paths — same reasoning Spec 114 §3.1
--                            gives for notification_dispatches)

-- UP
BEGIN;

-- Enable RLS on the 11 tables migration 227 deliberately excluded
-- (they were pending the 229 conversion; entitlements was excluded by name
-- as a forward-guard).
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribe_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

-- ── Subtype 1: user-owned rows, owner-only (Spec 114 §3.1 template) ──

CREATE POLICY user_profiles_select_own ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_profiles_insert_own ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_profiles_update_own ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY lead_views_select_own ON lead_views
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY lead_views_insert_own ON lead_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY lead_views_update_own ON lead_views
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY lead_view_events_select_own ON lead_view_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY lead_view_events_insert_own ON lead_view_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY subscribe_nonces_select_own ON subscribe_nonces
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY subscribe_nonces_insert_own ON subscribe_nonces
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY subscribe_nonces_delete_own ON subscribe_nonces
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY device_tokens_select_own ON device_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY device_tokens_insert_own ON device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY device_tokens_update_own ON device_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY tracked_projects_select_own ON tracked_projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY notification_dispatches_select_own ON notification_dispatches
  FOR SELECT USING (auth.uid() = user_id);

-- ── Subtype 2: admin-identity tables (Spec 114 §3.2 templates verbatim) ──

-- admin_watchlist: an admin sees/manages only their own saved list, and only
-- while currently an admin (is_admin can be revoked; a revoked admin has a
-- stale watchlist that stays private).
CREATE POLICY admin_watchlist_select_own_admin ON admin_watchlist
  FOR SELECT USING (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY admin_watchlist_insert_own_admin ON admin_watchlist
  FOR INSERT WITH CHECK (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY admin_watchlist_update_own_admin ON admin_watchlist
  FOR UPDATE USING (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY admin_watchlist_delete_own_admin ON admin_watchlist
  FOR DELETE USING (
    auth.uid() = admin_uid
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- admin_audit_log: read-only for admins; NO INSERT/UPDATE/DELETE policy —
-- absence of a policy for an operation is itself the deny (Spec 114 §4
-- default-deny mechanic applies per-operation). Every row is written via the
-- raw-pg route-handler path (owner, RLS-exempt), never a policy-bound role.
CREATE POLICY admin_audit_log_select_admin ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── The 11th Class A table: entitlements (owner-read-only) ──
-- No INSERT/UPDATE/DELETE policy — entitlements is server-written only
-- (webhook, admin routes, trial-init helper), never client-writable, per
-- the same reasoning Spec 114 §3.1 gives for notification_dispatches.
CREATE POLICY entitlements_select_own ON entitlements
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;

-- DOWN — comment-only per Rule 6 + the Spec 114 §8 convention: DROP POLICY /
-- DISABLE ROW LEVEL SECURITY are destructive to the security posture even
-- though not to data, so they get the same human-gated rollback treatment
-- as a DROP TABLE.
-- BEGIN;
--   DROP POLICY IF EXISTS entitlements_select_own ON entitlements;
--   DROP POLICY IF EXISTS admin_audit_log_select_admin ON admin_audit_log;
--   DROP POLICY IF EXISTS admin_watchlist_delete_own_admin ON admin_watchlist;
--   DROP POLICY IF EXISTS admin_watchlist_update_own_admin ON admin_watchlist;
--   DROP POLICY IF EXISTS admin_watchlist_insert_own_admin ON admin_watchlist;
--   DROP POLICY IF EXISTS admin_watchlist_select_own_admin ON admin_watchlist;
--   DROP POLICY IF EXISTS notification_dispatches_select_own ON notification_dispatches;
--   DROP POLICY IF EXISTS notifications_update_own ON notifications;
--   DROP POLICY IF EXISTS notifications_select_own ON notifications;
--   DROP POLICY IF EXISTS tracked_projects_select_own ON tracked_projects;
--   DROP POLICY IF EXISTS device_tokens_update_own ON device_tokens;
--   DROP POLICY IF EXISTS device_tokens_insert_own ON device_tokens;
--   DROP POLICY IF EXISTS device_tokens_select_own ON device_tokens;
--   DROP POLICY IF EXISTS subscribe_nonces_delete_own ON subscribe_nonces;
--   DROP POLICY IF EXISTS subscribe_nonces_insert_own ON subscribe_nonces;
--   DROP POLICY IF EXISTS subscribe_nonces_select_own ON subscribe_nonces;
--   DROP POLICY IF EXISTS lead_view_events_insert_own ON lead_view_events;
--   DROP POLICY IF EXISTS lead_view_events_select_own ON lead_view_events;
--   DROP POLICY IF EXISTS lead_views_update_own ON lead_views;
--   DROP POLICY IF EXISTS lead_views_insert_own ON lead_views;
--   DROP POLICY IF EXISTS lead_views_select_own ON lead_views;
--   DROP POLICY IF EXISTS user_profiles_update_own ON user_profiles;
--   DROP POLICY IF EXISTS user_profiles_insert_own ON user_profiles;
--   DROP POLICY IF EXISTS user_profiles_select_own ON user_profiles;
--   ALTER TABLE entitlements DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE admin_audit_log DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE admin_watchlist DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE notification_dispatches DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE tracked_projects DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE device_tokens DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE subscribe_nonces DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_view_events DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE lead_views DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
-- COMMIT;
