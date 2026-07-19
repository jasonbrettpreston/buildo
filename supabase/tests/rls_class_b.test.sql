-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B
--   default deny, migration 227) + §11 ("a table added without a default-deny
--   policy" guard — the schema-introspection test below is that guard) + §10
--   (Class B positive/negative rows).
-- Run via: supabase test db  (see docs/runbook/README.md "pgTAP RLS suite").

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- ── §11 guard: every public table has RLS enabled ─────────────────────────
-- Definitional, not enumerated: any future table that lands without
-- ENABLE ROW LEVEL SECURITY appears in this result and fails the suite.
-- Documented exclusion list (keep in sync with Spec 114 §2):
--   * spatial_ref_sys — PostGIS extension-owned system table, out of the
--     catalog scope entirely ("Flagged, not classified").
select is_empty(
  $$select relname::text from pg_class
     where relrowsecurity = false
       and relkind = 'r'
       and relnamespace = 'public'::regnamespace
       and relname not in ('spatial_ref_sys')$$,
  'every public table has RLS enabled (documented exclusions: spatial_ref_sys)'
);

-- ── Positive: owner connection is unaffected (pipeline sanity probe) ──────
select lives_ok(
  $$select count(*) from permits$$,
  'positive: table-owner connection still reads permits normally (D1)'
);

-- ── Negative: authenticated is fully denied on Class B tables ─────────────
-- TRANSIENT grant, rolled back with this transaction (live posture: zero
-- standing grants for anon/authenticated, Spec 114 §1). Without it every
-- statement fails at the GRANT layer; WITH it, the default-deny RLS (zero
-- policies) is what produces the zero-rows/rejected-INSERT results below —
-- which is the §4 property this suite locks.
grant select on permits to authenticated;
grant insert on logic_variables to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

select results_eq(
  $$select count(*) from permits$$,
  ARRAY[0::bigint],
  'negative: authenticated gets zero rows from a populated Class B table'
);
select throws_ok(
  $$insert into logic_variables (variable_key, variable_value) values ('rls_test_key', 0)$$,
  '42501',
  NULL,
  'negative: authenticated INSERT into a Class B table is rejected'
);
reset role;

select * from finish();
rollback;
