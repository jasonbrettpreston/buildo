-- 300: media_assets + the private surface-media bucket (MF-37, the admin media library).
-- The admin uploads report images and ad creatives; each object lives in the PRIVATE Supabase Storage bucket `surface-media`
-- at `<kind>/<asset_id>.<ext>` and each row here describes one object. Contract: scripts/surfaces/_schema/media-contract.json;
-- CONTRACT descriptor contract_admin_media_upload.descriptor.json (its `database` and `rls` blocks declare this table).
-- RLS: the ONE ruled admin-read pattern (Wave 1 decision batch item 1; Spec 114 section 2 dated note 2026-11-09): RLS on, one
-- `media_assets_select_admin` policy, no write policy; the routes write through the owner connection. Bucket policies: the
-- `admin` scope (Spec 114 section 6 dated note 2026-11-09), three policies, no UPDATE policy.
-- `rule jsonb NULL` (batch item 6): MF-38's rule set for a report image; NULL is the default set; MF-37 never writes it.
-- One ordered list per (scenario_key, rule): the partial unique index uses NULLS NOT DISTINCT (PG 15+; db target 17).
-- Storage statements self-guard on the storage tables (the migration-234 namespace-guard pattern): an instance without the
-- Storage tables (plain local Postgres, or an image whose storage.buckets predates the Storage API's `public` column) skips
-- them with a NOTICE; where they exist, the bucket is asserted private.
-- WRITTEN, NOT APPLIED here: the operator applies it (DB job). Numbering (batch C-5, D-22 2026-11-09): 298 is reserved for MB-86
-- (298_mb86_scenario_cost_lines.sql, staged); MF-37: 300, 301; MF-40 next free after that.
--
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md sections 2, 3.2, 6 (dated notes 2026-11-09)
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md sections 6.1, 6.2, 6.5 (dated notes 2026-11-09)

-- UP
CREATE TABLE IF NOT EXISTS media_assets (
  asset_id     uuid PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('report_image', 'ad_creative')),
  path         text NOT NULL UNIQUE,
  mime         text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        integer NOT NULL CHECK (bytes > 0),
  alt          text NOT NULL CHECK (length(alt) > 0),
  scenario_key text NULL,
  position     integer NULL CHECK (position >= 0),
  rule         jsonb NULL CHECK (rule IS NULL OR jsonb_typeof(rule) = 'object'),
  uploaded_by  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_report_image_placed CHECK (kind <> 'report_image' OR (scenario_key IS NOT NULL AND position IS NOT NULL)),
  CONSTRAINT media_assets_rule_report_only CHECK (kind = 'report_image' OR rule IS NULL)
);

-- Justified read: MF-38's ordered fetch of one scenario key's images for one rule set (Spec 126 section 6.6).
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_report_order
  ON media_assets (scenario_key, rule, position) NULLS NOT DISTINCT
  WHERE kind = 'report_image';

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_assets_select_admin ON media_assets
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

DO $migration$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public') THEN
    RAISE NOTICE '300: the Storage tables (storage.buckets with its public column, storage.objects) are not present on this instance — skipping the surface-media bucket and its policies';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public) VALUES ('surface-media', 'surface-media', false)
    ON CONFLICT (id) DO UPDATE SET public = false;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'surface-media' AND public = false) THEN
    RAISE EXCEPTION '300: bucket surface-media is missing or public after creation';
  END IF;

  EXECUTE $sql$
    CREATE POLICY surface_media_select_admin ON storage.objects FOR SELECT USING (
      bucket_id = 'surface-media' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY surface_media_insert_admin ON storage.objects FOR INSERT WITH CHECK (
      bucket_id = 'surface-media' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  $sql$;
  EXECUTE $sql$
    CREATE POLICY surface_media_delete_admin ON storage.objects FOR DELETE USING (
      bucket_id = 'surface-media' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  $sql$;
END
$migration$;

-- DOWN — manual rollback only (ALLOW-DESTRUCTIVE: dropping media_assets loses the media index; the objects stay in the bucket).
-- DROP POLICY IF EXISTS surface_media_delete_admin ON storage.objects;
-- DROP POLICY IF EXISTS surface_media_insert_admin ON storage.objects;
-- DROP POLICY IF EXISTS surface_media_select_admin ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'surface-media';  -- only once the bucket is empty
-- DROP TABLE IF EXISTS media_assets;
