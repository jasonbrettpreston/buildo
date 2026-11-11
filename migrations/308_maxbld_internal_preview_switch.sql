-- 308: the on/off switch of the internal admin preview (MB-93; operator 2026-11-11 "D-1 b and D-2 to D-8 a", D-3 a).
-- Mirrors scripts/seeds/logic_variables.json entry maxbld_internal_preview_enabled (group "MaxBLD Internal Preview"; the seed is the test truth).
-- Seeded OFF (0). Read strictly: only 1 is on; a missing row, a read error or any other value is off (src/lib/admin/report-preview-live/stored-page.ts).
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
-- WRITTEN, NOT APPLIED here: the orchestrator applies it (DB job); the Rule 13 scorecard refresh for the migration count rides that job.
--
-- SPEC LINK: docs/specs/02-web-admin/86_control_panel.md (the Control Panel edits logic variables, audited)
-- SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (admin pages)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('maxbld_internal_preview_enabled', 0, NULL, 'MB-93: the on/off switch of the internal admin preview of the v21 report on real lots; 1 = on, anything else off; default off. CONSUMED by src/lib/admin/report-preview-live/stored-page.ts (readPreviewSwitch).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 159, 283, 294, 296 and 301).
-- DELETE FROM logic_variables WHERE variable_key = 'maxbld_internal_preview_enabled';
