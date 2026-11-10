-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md §6 (the `admin` Storage scope, dated note
--   2026-11-09) + §10 (positive AND negative row per policy) + migration 300_media_assets_surface_media.sql
--   (the private surface-media bucket and its three admin policies, no UPDATE policy).
-- MF-37 T5 Storage half (plan v3 §4 T5 fallback, D-16): the vitest DB harness image has no Storage tables, so the
--   bucket + storage.objects policy arm is locked here, on a DB that has them (the local Supabase stack).
-- Run via: supabase test db, or this one file with psql against the local stack. Single transaction, rolls back:
--   the test users, the objects and the GUC below exist only inside it.
-- Impersonation: on this image auth.uid() reads request.jwt.claim.sub (falling back to request.jwt.claims): set both.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── Structure ─────────────────────────────────────────────────────────────
select results_eq(
  $$select public from storage.buckets where id = 'surface-media'$$,
  ARRAY[false],
  'bucket surface-media exists and is private (public = false)');

-- Every storage.objects policy that names surface-media (or carries the surface_media_ prefix): exactly the three admin ones.
select is(
  (select string_agg(policyname::text || ':' || cmd::text, ',' order by policyname::text) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (policyname like 'surface\_media\_%' or coalesce(qual, '') like '%surface-media%'
            or coalesce(with_check, '') like '%surface-media%')),
  'surface_media_delete_admin:DELETE,surface_media_insert_admin:INSERT,surface_media_select_admin:SELECT',
  'surface-media policy set is exactly select/insert/delete admin');

select is_empty(
  $$select policyname::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'ALL')
       and (coalesce(qual, '') like '%surface-media%' or coalesce(with_check, '') like '%surface-media%'
            or (coalesce(qual, '') not like '%bucket_id%' and coalesce(with_check, '') not like '%bucket_id%'))$$,
  'no UPDATE (or ALL) policy reaches surface-media');

-- A policy that never names bucket_id would reach every bucket, surface-media included.
select is_empty(
  $$select policyname::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and coalesce(qual, '') not like '%bucket_id%' and coalesce(with_check, '') not like '%bucket_id%'$$,
  'no storage.objects policy is bucket-agnostic');

select results_eq(
  $$select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('surface_media_select_admin', 'surface_media_insert_admin', 'surface_media_delete_admin')
       and roles = '{authenticated}'
       and coalesce(qual, with_check) like '%bucket_id = ''surface-media''%'
       and coalesce(qual, with_check) like '%profiles%'
       and coalesce(qual, with_check) like '%is_admin = true%'
       and coalesce(qual, with_check) like '%auth.uid()%'$$,
  ARRAY[3::bigint],
  'each of the three is TO authenticated and gates on bucket surface-media + profiles.is_admin of auth.uid()');

-- ── Seed (as postgres: BYPASSRLS on this stack) ───────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a0a1', 'rls-media-admin@test.local'),
  ('00000000-0000-0000-0000-00000000a0b2', 'rls-media-user@test.local');
-- No auth.users -> profiles trigger on this stack: write both profile rows (upsert, in case an image has one).
insert into profiles (id, is_admin) values
  ('00000000-0000-0000-0000-00000000a0a1', true),
  ('00000000-0000-0000-0000-00000000a0b2', false)
  on conflict (id) do update set is_admin = excluded.is_admin;
insert into storage.objects (bucket_id, name) values ('surface-media', 'report_image/pgtap-seed.png');
-- storage.protect_delete (BEFORE DELETE statement trigger) refuses every direct DELETE unless this GUC is set; set it for
-- this transaction so the DELETE results below are produced by RLS, not by that trigger.
select set_config('storage.allow_delete_query', 'true', true);

-- ── INSERT policy ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a0b2', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a0b2', 'role', 'authenticated')::text, true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('surface-media', 'ad_creative/pgtap-user.png')$$,
  '42501', NULL,
  'insert negative: non-admin authenticated user cannot upload to surface-media');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('surface-media', 'ad_creative/pgtap-anon.png')$$,
  '42501', NULL,
  'insert negative: anon cannot upload to surface-media');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a0a1', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a0a1', 'role', 'authenticated')::text, true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('surface-media', 'ad_creative/pgtap-admin.png')$$,
  'insert positive: admin uploads to surface-media');

-- ── SELECT policy ─────────────────────────────────────────────────────────
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'surface-media' and name like '%/pgtap-%'$$,
  ARRAY[2::bigint],
  'select positive: admin sees both surface-media objects');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a0b2', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a0b2', 'role', 'authenticated')::text, true);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'surface-media'$$,
  ARRAY[0::bigint],
  'select negative: non-admin authenticated user sees zero surface-media objects');
-- Bare DML (pgTAP cannot wrap it); its effect is asserted owner-side below.
delete from storage.objects where bucket_id = 'surface-media';
reset role;
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'surface-media' and name like '%/pgtap-%'$$,
  ARRAY[2::bigint],
  'delete negative: the non-admin user''s delete removed nothing');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'surface-media'$$,
  ARRAY[0::bigint],
  'select negative: anon sees zero surface-media objects');
delete from storage.objects where bucket_id = 'surface-media';
reset role;
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'surface-media' and name like '%/pgtap-%'$$,
  ARRAY[2::bigint],
  'delete negative: anon''s delete removed nothing');

-- ── No UPDATE policy: even the admin's update touches nothing ─────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a0a1', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a0a1', 'role', 'authenticated')::text, true);
update storage.objects set name = 'ad_creative/pgtap-renamed.png' where bucket_id = 'surface-media';
-- ── DELETE policy positive ────────────────────────────────────────────────
delete from storage.objects where bucket_id = 'surface-media' and name = 'ad_creative/pgtap-admin.png';
reset role;

select is_empty(
  $$select name from storage.objects where bucket_id = 'surface-media' and name = 'ad_creative/pgtap-renamed.png'$$,
  'no-UPDATE negative: the admin''s update changed no surface-media object');
select results_eq(
  $$select name from storage.objects where bucket_id = 'surface-media' and name like '%/pgtap-%' order by 1$$,
  ARRAY['report_image/pgtap-seed.png'::text],
  'delete positive: the admin removed exactly the targeted object');

select * from finish();
rollback;
