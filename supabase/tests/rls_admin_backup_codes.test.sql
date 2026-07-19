-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B
--   default deny) + §10 (positive/negative per policy posture) +
--   .cursor/phase1_plan.md Item 6 / P1-F4.3 (migration 231 admin_backup_codes:
--   RLS deny-all — backup-code hashes are server-only; possession of a session
--   is exactly what a backup code substitutes for, so not even the owning
--   admin may read their own rows through a client-facing role).
-- Run via: supabase test db  (see docs/runbook/README.md "pgTAP RLS suite").
-- Single transaction, rolls back — no state persists.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ── Seed (as table owner, RLS-exempt) ─────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000dd', 'rls-bc-admin-d@test.local'),
  ('00000000-0000-0000-0000-0000000000ee', 'rls-bc-user-e@test.local');
update profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000dd';

insert into admin_backup_codes (user_id, code_hash, code_salt) values
  ('00000000-0000-0000-0000-0000000000dd', 'deadbeef', 'salt-d'),
  ('00000000-0000-0000-0000-0000000000ee', 'cafebabe', 'salt-e');

-- Structural: RLS is enabled and there are ZERO policies (deny-all posture).
select results_eq(
  $$select relrowsecurity from pg_class where relname = 'admin_backup_codes'
     and relnamespace = 'public'::regnamespace$$,
  ARRAY[true],
  'admin_backup_codes has RLS enabled (migration 231)');
select is_empty(
  $$select polname::text from pg_policy
     where polrelid = 'public.admin_backup_codes'::regclass$$,
  'admin_backup_codes has ZERO policies — Class B deny-all, server-only access');

-- TRANSIENT grant (live posture: zero standing grants, Spec 114 §1) so the
-- denial below is produced by RLS, not the GRANT layer.
grant select, insert, update, delete on admin_backup_codes to authenticated;

-- ── As admin D (authenticated, is_admin=true, OWNS a row) ─────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000dd', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000dd', 'role', 'authenticated')::text, true);

select results_eq(
  $$select count(*) from admin_backup_codes$$,
  ARRAY[0::bigint],
  'deny-all negative: even the owning ADMIN sees zero backup-code rows');
select throws_ok(
  $$insert into admin_backup_codes (user_id, code_hash, code_salt)
    values ('00000000-0000-0000-0000-0000000000dd', 'feedf00d', 'salt-x')$$,
  '42501', NULL,
  'deny-all negative: admin INSERT rejected even for own uid');
-- Bare-DML negatives (pgTAP cursors cannot wrap DML) — sentinels asserted
-- absent in the owner-side verification block below.
update admin_backup_codes set used_at = now() where user_id = '00000000-0000-0000-0000-0000000000dd';
delete from admin_backup_codes where user_id = '00000000-0000-0000-0000-0000000000dd';

-- ── Owner-side verification ───────────────────────────────────────────────
reset role;

select results_eq(
  $$select count(*) from admin_backup_codes$$,
  ARRAY[2::bigint],
  'positive: table-owner (D1 pool posture) sees both seeded rows');
select is_empty(
  $$select 1 from admin_backup_codes where used_at is not null$$,
  'deny-all UPDATE negative held: the admin-issued used_at update affected 0 rows');
select results_eq(
  $$select count(*) from admin_backup_codes where user_id = '00000000-0000-0000-0000-0000000000dd'$$,
  ARRAY[1::bigint],
  'deny-all DELETE negative held: the D row survives its own delete attempt');
-- Owner-side consume-path smoke: the single-use race guard predicate.
select results_eq(
  $$with consumed as (
      update admin_backup_codes set used_at = now()
       where user_id = '00000000-0000-0000-0000-0000000000dd' and used_at is null
       returning id)
    select count(*) from consumed$$,
  ARRAY[1::bigint],
  'owner consume path: used_at IS NULL predicate consumes exactly the one unused row');

select * from finish();
rollback;
