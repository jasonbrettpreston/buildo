-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §3.1/§3.2
--   (Class A owner-scoped + admin-subtype policies, migration 230) + §10
--   (testing mandate: every CREATE POLICY gets a positive and a negative case;
--   Class A negative = a different auth.uid() gets zero rows / a rejected
--   mutation; admin subtype negative = a non-admin is denied even on rows it
--   owns).
-- Run via: supabase test db  (see docs/runbook/README.md "pgTAP RLS suite").
-- Everything runs inside one transaction and rolls back — no state persists.
-- Pattern notes:
--   * pgTAP cursors cannot wrap DML, so "0 rows affected" negatives run the
--     DML as a bare statement with a sentinel value; the sentinel is asserted
--     absent in the owner-side verification block at the end.
--   * TRANSIENT grants only (live posture: zero standing grants for
--     anon/authenticated, Spec 114 §1) — rolled back with the transaction.
-- Users: A (regular, seeded rows) / B (regular, no user_profiles row — used
-- for the INSERT-own positive) / C (admin; also the "other user" for
-- negative-select cases).

begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- ── Seed (as table owner, RLS-exempt) ─────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'rls-a-user-a@test.local'),
  ('00000000-0000-0000-0000-0000000000bb', 'rls-a-user-b@test.local'),
  ('00000000-0000-0000-0000-0000000000cc', 'rls-a-admin-c@test.local');
update profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000cc';

insert into user_profiles (user_id) values
  ('00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-0000000000cc');
insert into lead_views (user_id, lead_key, lead_type, trade_slug) values
  ('00000000-0000-0000-0000-0000000000aa', 'coa:LV-A', 'coa', 'plumbing'),
  ('00000000-0000-0000-0000-0000000000cc', 'coa:LV-C', 'coa', 'plumbing');
insert into lead_view_events (user_id, permit_num, revision_num) values
  ('00000000-0000-0000-0000-0000000000aa', 'P1', '00'),
  ('00000000-0000-0000-0000-0000000000cc', 'P1', '00');
insert into subscribe_nonces (nonce, user_id) values
  ('nonce-a', '00000000-0000-0000-0000-0000000000aa'),
  ('nonce-c', '00000000-0000-0000-0000-0000000000cc');
insert into device_tokens (user_id, push_token, platform) values
  ('00000000-0000-0000-0000-0000000000aa', 'tok-a', 'ios'),
  ('00000000-0000-0000-0000-0000000000cc', 'tok-c', 'ios');
insert into tracked_projects (user_id, trade_slug) values
  ('00000000-0000-0000-0000-0000000000aa', 'plumbing'),
  ('00000000-0000-0000-0000-0000000000cc', 'plumbing');
insert into notifications (user_id, type) values
  ('00000000-0000-0000-0000-0000000000aa', 'new_lead'),
  ('00000000-0000-0000-0000-0000000000cc', 'new_lead');
insert into notification_dispatches (user_id, lead_id, type, toronto_date) values
  ('00000000-0000-0000-0000-0000000000aa', 'permit:P1', 'new_lead', current_date),
  ('00000000-0000-0000-0000-0000000000cc', 'permit:P1', 'new_lead', current_date);
insert into entitlements (user_id, product, status) values
  ('00000000-0000-0000-0000-0000000000aa', 'lead_gen', 'trial'),
  ('00000000-0000-0000-0000-0000000000cc', 'lead_gen', 'trial');
insert into admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num) values
  ('00000000-0000-0000-0000-0000000000cc', 'permit', 'permit:P1', 'P1', '00'),
  ('00000000-0000-0000-0000-0000000000aa', 'permit', 'permit:P1', 'P1', '00');
insert into admin_audit_log (admin_uid, action) values
  ('00000000-0000-0000-0000-0000000000cc', 'test_action'),
  ('00000000-0000-0000-0000-0000000000aa', 'test_action');

grant select, insert, update, delete on
  user_profiles, lead_views, lead_view_events, subscribe_nonces, device_tokens,
  tracked_projects, notifications, notification_dispatches, admin_watchlist,
  admin_audit_log, entitlements
to authenticated;
-- The §3.2 admin-subtype policies embed EXISTS (SELECT 1 FROM profiles ...);
-- evaluating that subquery as the policy-bound role requires SELECT on
-- profiles (transient, same as above — profiles RLS still applies to it).
grant select on profiles to authenticated;

-- ── As user A (authenticated, regular) ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

-- user_profiles (select/insert/update own; NO delete policy)
select results_eq($$select count(*) from user_profiles$$, ARRAY[1::bigint],
  'user_profiles_select_own positive: A sees exactly own row');
select is_empty($$select 1 from user_profiles where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'user_profiles_select_own negative: the C row is invisible to A');
select lives_ok($$update user_profiles set display_name = 'rls-test' where user_id = '00000000-0000-0000-0000-0000000000aa'$$,
  'user_profiles_update_own positive: A updates own row');
select throws_ok($$insert into user_profiles (user_id) values ('00000000-0000-0000-0000-0000000000cc')$$,
  '42501', NULL, 'user_profiles_insert_own negative: A cannot insert a row for C');
update user_profiles set display_name = 'HACKED' where user_id = '00000000-0000-0000-0000-0000000000cc';
delete from user_profiles where user_id = '00000000-0000-0000-0000-0000000000aa';

-- lead_views (select/insert/update own; NO delete policy)
select results_eq($$select count(*) from lead_views$$, ARRAY[1::bigint],
  'lead_views_select_own positive: A sees exactly own row');
select is_empty($$select 1 from lead_views where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'lead_views_select_own negative: the C row is invisible to A');
select lives_ok($$insert into lead_views (user_id, lead_key, lead_type, trade_slug) values ('00000000-0000-0000-0000-0000000000aa', 'coa:LV-A2', 'coa', 'plumbing')$$,
  'lead_views_insert_own positive: A inserts an own-uid row');
select throws_ok($$insert into lead_views (user_id, lead_key, lead_type, trade_slug) values ('00000000-0000-0000-0000-0000000000cc', 'coa:LV-CX', 'coa', 'plumbing')$$,
  '42501', NULL, 'lead_views_insert_own negative: A cannot insert a row for C');
select lives_ok($$update lead_views set trade_slug = 'plumbing' where lead_key = 'coa:LV-A'$$,
  'lead_views_update_own positive: A updates own row');
update lead_views set trade_slug = 'hacked-slug' where user_id = '00000000-0000-0000-0000-0000000000cc';
delete from lead_views where user_id = '00000000-0000-0000-0000-0000000000aa';

-- lead_view_events (select/insert own; NO update/delete policy)
select results_eq($$select count(*) from lead_view_events$$, ARRAY[1::bigint],
  'lead_view_events_select_own positive: A sees exactly own row');
select is_empty($$select 1 from lead_view_events where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'lead_view_events_select_own negative: the C row is invisible to A');
select lives_ok($$insert into lead_view_events (user_id, permit_num, revision_num) values ('00000000-0000-0000-0000-0000000000aa', 'P2', '00')$$,
  'lead_view_events_insert_own positive: A inserts an own-uid row');
select throws_ok($$insert into lead_view_events (user_id, permit_num, revision_num) values ('00000000-0000-0000-0000-0000000000cc', 'P2', '00')$$,
  '42501', NULL, 'lead_view_events_insert_own negative: A cannot insert a row for C');
update lead_view_events set permit_num = 'NOPOL' where user_id = '00000000-0000-0000-0000-0000000000aa';
delete from lead_view_events where user_id = '00000000-0000-0000-0000-0000000000aa';

-- subscribe_nonces (select/insert/delete own; NO update policy)
select results_eq($$select count(*) from subscribe_nonces$$, ARRAY[1::bigint],
  'subscribe_nonces_select_own positive: A sees exactly own row');
select is_empty($$select 1 from subscribe_nonces where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'subscribe_nonces_select_own negative: the C row is invisible to A');
select lives_ok($$insert into subscribe_nonces (nonce, user_id) values ('nonce-a2', '00000000-0000-0000-0000-0000000000aa')$$,
  'subscribe_nonces_insert_own positive: A inserts an own-uid nonce');
select throws_ok($$insert into subscribe_nonces (nonce, user_id) values ('nonce-cx', '00000000-0000-0000-0000-0000000000cc')$$,
  '42501', NULL, 'subscribe_nonces_insert_own negative: A cannot insert a nonce for C');
select lives_ok($$delete from subscribe_nonces where nonce = 'nonce-a2'$$,
  'subscribe_nonces_delete_own positive: A deletes own nonce');
delete from subscribe_nonces where nonce = 'nonce-c';
update subscribe_nonces set nonce = 'NOPOL-n' where user_id = '00000000-0000-0000-0000-0000000000aa';

-- device_tokens (select/insert/update own; NO delete policy)
select results_eq($$select count(*) from device_tokens$$, ARRAY[1::bigint],
  'device_tokens_select_own positive: A sees exactly own row');
select is_empty($$select 1 from device_tokens where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'device_tokens_select_own negative: the C row is invisible to A');
select lives_ok($$insert into device_tokens (user_id, push_token, platform) values ('00000000-0000-0000-0000-0000000000aa', 'tok-a2', 'ios')$$,
  'device_tokens_insert_own positive: A registers an own-uid token');
select throws_ok($$insert into device_tokens (user_id, push_token, platform) values ('00000000-0000-0000-0000-0000000000cc', 'tok-cx', 'ios')$$,
  '42501', NULL, 'device_tokens_insert_own negative: A cannot register a token for C');
select lives_ok($$update device_tokens set push_token = 'tok-a-upd' where push_token = 'tok-a'$$,
  'device_tokens_update_own positive: A updates own token');
update device_tokens set push_token = 'HACKED-c' where user_id = '00000000-0000-0000-0000-0000000000cc';
delete from device_tokens where user_id = '00000000-0000-0000-0000-0000000000aa';

-- tracked_projects (select own ONLY — no live write path today)
select results_eq($$select count(*) from tracked_projects$$, ARRAY[1::bigint],
  'tracked_projects_select_own positive: A sees exactly own row');
select is_empty($$select 1 from tracked_projects where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'tracked_projects_select_own negative: the C row is invisible to A');
select throws_ok($$insert into tracked_projects (user_id, trade_slug) values ('00000000-0000-0000-0000-0000000000aa', 'plumbing')$$,
  '42501', NULL, 'tracked_projects no-INSERT-policy negative: rejected even for own uid');
update tracked_projects set trade_slug = 'NOPOL' where user_id = '00000000-0000-0000-0000-0000000000aa';
delete from tracked_projects where user_id = '00000000-0000-0000-0000-0000000000aa';

-- notifications (select/update own; NO insert/delete policy)
select results_eq($$select count(*) from notifications$$, ARRAY[1::bigint],
  'notifications_select_own positive: A sees exactly own row');
select is_empty($$select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'notifications_select_own negative: the C row is invisible to A');
select lives_ok($$update notifications set is_read = true where user_id = '00000000-0000-0000-0000-0000000000aa'$$,
  'notifications_update_own positive: A marks own notification read');
select throws_ok($$insert into notifications (user_id, type) values ('00000000-0000-0000-0000-0000000000aa', 'new_lead')$$,
  '42501', NULL, 'notifications no-INSERT-policy negative: rejected even for own uid');
update notifications set is_read = true where user_id = '00000000-0000-0000-0000-0000000000cc';
delete from notifications where user_id = '00000000-0000-0000-0000-0000000000aa';

-- notification_dispatches (select own ONLY — server-written ledger)
select results_eq($$select count(*) from notification_dispatches$$, ARRAY[1::bigint],
  'notification_dispatches_select_own positive: A sees exactly own row');
select is_empty($$select 1 from notification_dispatches where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'notification_dispatches_select_own negative: the C row is invisible to A');
select throws_ok($$insert into notification_dispatches (user_id, lead_id, type, toronto_date) values ('00000000-0000-0000-0000-0000000000aa', 'permit:PX', 'new_lead', current_date)$$,
  '42501', NULL, 'notification_dispatches no-INSERT-policy negative: rejected even for own uid');
update notification_dispatches set type = 'NOPOL' where user_id = '00000000-0000-0000-0000-0000000000aa';
delete from notification_dispatches where user_id = '00000000-0000-0000-0000-0000000000aa';

-- entitlements (select own ONLY — server-written, the 11th Class A table)
select results_eq($$select count(*) from entitlements$$, ARRAY[1::bigint],
  'entitlements_select_own positive: A sees exactly own row');
select is_empty($$select 1 from entitlements where user_id = '00000000-0000-0000-0000-0000000000cc'$$,
  'entitlements_select_own negative: the C row is invisible to A');
select throws_ok($$insert into entitlements (user_id, product, status) values ('00000000-0000-0000-0000-0000000000aa', 'flight_center', 'active')$$,
  '42501', NULL, 'entitlements no-INSERT-policy negative: rejected even for own uid');
update entitlements set status = 'active' where user_id = '00000000-0000-0000-0000-0000000000aa';
delete from entitlements where user_id = '00000000-0000-0000-0000-0000000000aa';

-- admin tables, still as A (NON-admin — the §10 "denied even if it owns the
-- row" negative: A owns an admin_watchlist row and authored an audit row)
select is_empty($$select 1 from admin_watchlist$$,
  'admin_watchlist negative: non-admin A denied even on the row it owns');
select throws_ok($$insert into admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num) values ('00000000-0000-0000-0000-0000000000aa', 'permit', 'permit:PX', 'PX', '00')$$,
  '42501', NULL, 'admin_watchlist_insert_own_admin negative: non-admin A rejected for own uid');
select is_empty($$select 1 from admin_audit_log$$,
  'admin_audit_log_select_admin negative: non-admin A denied even on rows it authored');
update admin_watchlist set lead_key = 'HACKED' where admin_uid = '00000000-0000-0000-0000-0000000000aa';
delete from admin_watchlist where admin_uid = '00000000-0000-0000-0000-0000000000aa';
update admin_audit_log set action = 'HACKED' where admin_uid = '00000000-0000-0000-0000-0000000000aa';
delete from admin_audit_log where admin_uid = '00000000-0000-0000-0000-0000000000aa';

-- ── As user B (authenticated, regular, no user_profiles row yet) ──────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);

select lives_ok($$insert into user_profiles (user_id) values ('00000000-0000-0000-0000-0000000000bb')$$,
  'user_profiles_insert_own positive: B self-provisions own row');
select results_eq($$select count(*) from user_profiles$$, ARRAY[1::bigint],
  'user_profiles_select_own: B sees only the row it just created');

-- ── As admin C (authenticated, is_admin = true) ───────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000cc', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000cc', 'role', 'authenticated')::text, true);

select results_eq($$select count(*) from admin_watchlist$$, ARRAY[1::bigint],
  'admin_watchlist_select_own_admin positive: admin C sees own row only (own_admin scope — the A row stays invisible)');
select lives_ok($$insert into admin_watchlist (admin_uid, lead_type, lead_key, permit_num, revision_num) values ('00000000-0000-0000-0000-0000000000cc', 'permit', 'permit:P2', 'P2', '00')$$,
  'admin_watchlist_insert_own_admin positive: admin C inserts own row');
select lives_ok($$update admin_watchlist set lead_key = 'permit:P2b' where lead_key = 'permit:P2'$$,
  'admin_watchlist_update_own_admin positive: admin C updates own row');
select lives_ok($$delete from admin_watchlist where lead_key = 'permit:P2b'$$,
  'admin_watchlist_delete_own_admin positive: admin C deletes own row');
select results_eq($$select count(*) from admin_audit_log$$, ARRAY[2::bigint],
  'admin_audit_log_select_admin positive: admin C sees ALL rows (admin scope, not owner scope)');
select throws_ok($$insert into admin_audit_log (admin_uid, action) values ('00000000-0000-0000-0000-0000000000cc', 'admin_insert')$$,
  '42501', NULL, 'admin_audit_log read-only negative: INSERT rejected even for an admin');
update admin_audit_log set action = 'ADMINHACK' where admin_uid = '00000000-0000-0000-0000-0000000000aa';
delete from admin_audit_log where admin_uid = '00000000-0000-0000-0000-0000000000aa';

-- ── Owner-side verification of every bare-DML negative above ──────────────
reset role;

select is_empty($$select 1 from user_profiles where display_name = 'HACKED'$$,
  'user_profiles_update_own negative held: the A-issued update of the C row affected 0 rows');
select results_eq($$select count(*) from user_profiles where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'user_profiles no-DELETE-policy negative held: the A row survives its own delete attempt');
select is_empty($$select 1 from lead_views where trade_slug = 'hacked-slug'$$,
  'lead_views_update_own negative held: the C row was not updated by A');
select results_eq($$select count(*) from lead_views where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[2::bigint],
  'lead_views no-DELETE-policy negative held: both A rows survive (seed + inserted)');
select is_empty($$select 1 from lead_view_events where permit_num = 'NOPOL'$$,
  'lead_view_events no-UPDATE-policy negative held: even own rows unaffected');
select results_eq($$select count(*) from lead_view_events where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[2::bigint],
  'lead_view_events no-DELETE-policy negative held: both A rows survive');
select is_empty($$select 1 from subscribe_nonces where nonce = 'nonce-a2'$$,
  'subscribe_nonces_delete_own positive verified: the A-deleted nonce is gone');
select results_eq($$select count(*) from subscribe_nonces where nonce = 'nonce-c'$$, ARRAY[1::bigint],
  'subscribe_nonces_delete_own negative held: the C nonce survives the A delete attempt');
select is_empty($$select 1 from subscribe_nonces where nonce = 'NOPOL-n'$$,
  'subscribe_nonces no-UPDATE-policy negative held: even own rows unaffected');
select is_empty($$select 1 from device_tokens where push_token = 'HACKED-c'$$,
  'device_tokens_update_own negative held: the C row was not updated by A');
select results_eq($$select count(*) from device_tokens where push_token = 'tok-a-upd'$$, ARRAY[1::bigint],
  'device_tokens_update_own positive verified: the A update actually landed');
select results_eq($$select count(*) from device_tokens where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[2::bigint],
  'device_tokens no-DELETE-policy negative held: both A rows survive');
select is_empty($$select 1 from tracked_projects where trade_slug = 'NOPOL'$$,
  'tracked_projects no-UPDATE-policy negative held: even own rows unaffected');
select results_eq($$select count(*) from tracked_projects where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'tracked_projects no-DELETE-policy negative held: the A row survives');
select results_eq($$select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000cc' and is_read = false$$, ARRAY[1::bigint],
  'notifications_update_own negative held: the C row stays unread after the A attempt');
select results_eq($$select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000aa' and is_read = true$$, ARRAY[1::bigint],
  'notifications_update_own positive verified: the A mark-read actually landed');
select results_eq($$select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'notifications no-DELETE-policy negative held: the A row survives');
select is_empty($$select 1 from notification_dispatches where type = 'NOPOL'$$,
  'notification_dispatches no-UPDATE-policy negative held: even own rows unaffected');
select results_eq($$select count(*) from notification_dispatches where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'notification_dispatches no-DELETE-policy negative held: the A row survives');
select results_eq($$select count(*) from entitlements where user_id = '00000000-0000-0000-0000-0000000000aa' and status = 'trial'$$, ARRAY[1::bigint],
  'entitlements no-UPDATE-policy negative held: A could not self-upgrade trial to active');
select results_eq($$select count(*) from entitlements where user_id = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'entitlements no-DELETE-policy negative held: the A row survives');
select is_empty($$select 1 from admin_watchlist where lead_key = 'HACKED'$$,
  'admin_watchlist_update_own_admin negative held: the non-admin A update affected 0 rows');
select results_eq($$select count(*) from admin_watchlist where admin_uid = '00000000-0000-0000-0000-0000000000aa'$$, ARRAY[1::bigint],
  'admin_watchlist_delete_own_admin negative held: the A-owned row survives the non-admin delete');
select is_empty($$select 1 from admin_audit_log where action in ('HACKED', 'ADMINHACK')$$,
  'admin_audit_log no-UPDATE-policy negative held: neither A nor admin C mutated audit rows');
select results_eq($$select count(*) from admin_audit_log$$, ARRAY[2::bigint],
  'admin_audit_log no-DELETE-policy negative held: both audit rows survive all delete attempts');

select * from finish();
rollback;
