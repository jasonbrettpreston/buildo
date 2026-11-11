-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §2 amendment (b) (Class E — publicly
--   readable reference data) + dated note 2026-11-10 (MF-40: placements is the first member) + §10
--   (a positive and a negative row per class).
-- Run via: supabase test db  (see docs/runbook/README.md "pgTAP RLS suite").
-- Class E members today: placements (migration 302). A new member adds its rows here.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- ── Shape: RLS on and exactly one policy, a SELECT for anon and authenticated ──
select ok(
  (select relrowsecurity from pg_class where oid = 'public.placements'::regclass),
  'placements has RLS enabled'
);
-- is() over string_agg (the rls_admin_media.test.sql form): results_eq over pg_policies' name columns against a
-- VALUES literal fails with "could not determine which collation to use" (MF-40 DB job 2026-11-10, D-32).
select is(
  (select string_agg(policyname::text || ':' || cmd::text || ':' || array_to_string(roles::text[], '+'), ',' order by policyname::text)
     from pg_policies where schemaname = 'public' and tablename = 'placements'),
  'placements_select_public:SELECT:anon+authenticated',
  'placements carries exactly one policy: placements_select_public, SELECT, anon and authenticated'
);

-- TRANSIENT grants, rolled back with this transaction (live posture: zero standing
-- grants for anon/authenticated, Spec 114 §1). With them, RLS is what decides.
grant select, insert on placements to anon, authenticated;

-- ── Positive: anon reads the whole closed vocabulary ─────────────────────────
set local role anon;
select ok(
  (select count(*) from placements) > 0,
  'positive: anon reads the seeded placements'
);

-- ── Negative: no write policy, so INSERT is rejected ─────────────────────────
select throws_ok(
  $$insert into placements (placement_key, surface_archetype, max_slots, disclosure_required)
    values ('rls_test_slot', 'REPORT', 1, true)$$,
  '42501',
  NULL,
  'negative: anon INSERT into a Class E table is rejected'
);
reset role;

select * from finish();
rollback;
