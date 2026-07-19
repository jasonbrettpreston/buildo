-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §5 (Class C
--   — profiles self-read/self-update minus is_admin, migration 226) + §10
--   (testing mandate: every CREATE POLICY gets a positive and a negative case).
-- Run via: supabase test db  (see docs/runbook/README.md "pgTAP RLS suite").
-- Everything runs inside one transaction and rolls back — no state persists.
-- NOTE: pgTAP result assertions (results_eq/is_empty) open cursors, which
-- cannot wrap DML — so "0 rows affected" cases run the DML as a bare
-- statement with a sentinel value and assert the sentinel did NOT land.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- ── Seed (as table owner, RLS-exempt) ─────────────────────────────────────
-- Two throwaway auth users; migration 226's handle_new_user trigger creates
-- their profiles rows automatically.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'rls-c-user-a@test.local'),
  ('00000000-0000-0000-0000-0000000000bb', 'rls-c-user-b@test.local');

select results_eq(
  $$select count(*) from profiles where id in ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000bb')$$,
  ARRAY[2::bigint],
  'handle_new_user trigger created a profiles row for both seeded users'
);

-- TRANSIENT grant, rolled back with this transaction: the live posture keeps
-- ZERO standing grants for anon/authenticated (Spec 114 §1 — "no table
-- outside auth/storage grants either role anything"), which would fail every
-- statement below at the GRANT layer before RLS is ever consulted. The tests
-- exist to lock the RLS policies (the control that matters on a future Data
-- API re-enable), so the grant is applied inside the test transaction only.
grant select, update on profiles to authenticated;

-- ── As user A (authenticated) ─────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

-- profiles_select_own: positive (own row visible) + negative (other row not).
select results_eq(
  $$select id from profiles$$,
  ARRAY['00000000-0000-0000-0000-0000000000aa'::uuid],
  'positive: A sees exactly their own profiles row'
);
select is_empty(
  $$select 1 from profiles where id = '00000000-0000-0000-0000-0000000000bb'$$,
  'negative: A cannot see the B profiles row'
);

-- profiles_update_own: positive (own row, non-is_admin column).
select lives_ok(
  $$update profiles set updated_at = now() where id = '00000000-0000-0000-0000-0000000000aa'$$,
  'positive: A can update a non-is_admin column on their own row'
);

-- negative (the B row: policy filters it — bare DML with a sentinel, no error
-- expected, 0 rows affected; the sentinel is asserted absent below as owner).
update profiles set updated_at = '2000-01-01T00:00:00Z'
  where id = '00000000-0000-0000-0000-0000000000bb';

-- is_admin self-escalation guard (Spec 114 §11 failure mode 3): the row-level
-- policy alone would permit this (it IS their own row) — the BEFORE UPDATE
-- trigger is the column-level control.
select throws_ok(
  $$update profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000aa'$$,
  'P0001',
  'is_admin may only be changed via the service-role admin path',
  'negative: self is_admin escalation raises the trigger exception'
);

-- Positive counterpart: a service_role-attributed session may change is_admin.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'service_role')::text, true);
select lives_ok(
  $$update profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000aa'$$,
  'positive: service-role-attributed session may change is_admin'
);

-- Owner-side verification of the bare negative UPDATE above: the sentinel
-- never landed on the B row (0 rows were affected).
select is_empty(
  $$select 1 from profiles where id = '00000000-0000-0000-0000-0000000000bb' and updated_at = '2000-01-01T00:00:00Z'$$,
  'negative: the A-issued update of the B row affected 0 rows'
);

select * from finish();
rollback;
