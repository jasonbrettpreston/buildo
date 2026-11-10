-- 301: the admin media library's five tunables (MF-37; Wave 1 decision batch items 2 and 4; plan D-8 values).
-- Mirrors scripts/seeds/logic_variables.json entry for entry (group "Admin Media"; the seed is the test truth). The upload cap
-- is at most 3 MB by ruling (max 3,000,000). Idempotent: ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
-- WRITTEN, NOT APPLIED here: the operator applies it with 300 (DB job). MF-37: 300, 301; MF-40 next free after that (batch C-5, D-22).
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 6.5 (dated note 2026-11-09)
-- SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 6 (dated note 2026-11-09)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('media_upload_max_bytes', 2000000, NULL, 'MF-37: the largest image the admin media library accepts, in decoded bytes; at most 3 MB by ruling. CONSUMED by src/lib/media/contract.ts.'),
  ('media_signed_url_ttl_seconds', 600, NULL, 'MF-37: lifetime of each preview signed URL the admin media list mints. CONSUMED by src/lib/media/contract.ts (readMediaLimits).'),
  ('media_list_page_max', 200, NULL, 'MF-37: the most media_assets rows the admin list returns (more rows show the partial state). CONSUMED by src/lib/media/contract.ts (readMediaLimits).'),
  ('media_list_cache_seconds', 60, NULL, 'MF-37: private cache lifetime of the admin media list response. CONSUMED by src/lib/media/contract.ts (readMediaLimits).'),
  ('media_storage_timeout_ms', 15000, NULL, 'MF-37: per-call timeout of a Storage upload, remove or sign call. CONSUMED by src/lib/media/contract.ts (readMediaLimits).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 159, 283, 294 and 296).
-- DELETE FROM logic_variables WHERE variable_key = 'media_upload_max_bytes';
-- DELETE FROM logic_variables WHERE variable_key = 'media_signed_url_ttl_seconds';
-- DELETE FROM logic_variables WHERE variable_key = 'media_list_page_max';
-- DELETE FROM logic_variables WHERE variable_key = 'media_list_cache_seconds';
-- DELETE FROM logic_variables WHERE variable_key = 'media_storage_timeout_ms';
