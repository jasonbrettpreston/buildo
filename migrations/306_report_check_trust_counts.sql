-- 306_report_check_trust_counts.sql
-- MF-62: the report loading state "What we checked" (operator 2026-11-11: "Mf-62 - yes"; "x-1 a of course, x-2 a x-3 a x-4 a - build this
-- into McFront-end specs and rulings and handbook").
--   1. X-1 (a): the report's citywide trust counts are ONE stored, dated row written by the existing refresh_snapshot step (its optional read
--      reportTrust, Spec 60 Refresh Snapshot dated note 2026-11-11). Six nullable columns on data_quality_snapshots, no default: NULL means not
--      captured yet, and the report then omits the citywide lines (never a zero, never a literal). Buildings and CoA applications reuse the
--      existing building_footprints_total and coa_total. No backfill: the next refresh_snapshot run writes them.
--   2. D-2 (a): the screen's minimum duration (6 s) and the "Show report" delay (2 s) as logic variables, edited in the existing Admin Control
--      Panel (group "MaxBLD Report"). Mirrors scripts/seeds/logic_variables.json entry for entry (the seed is the test truth). Idempotent:
--      ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
-- WRITTEN, NOT APPLIED here: the operator's DB job applies it (local), then regenerates src/lib/db/generated/schema.ts and runs
-- refresh_snapshot once.
--
-- SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11a.7 (dated note 2026-11-11, MF-62)
-- SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md Refresh Snapshot (dated note 2026-11-11)
-- SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35

-- UP
BEGIN;

ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS parcels_total INTEGER,
  ADD COLUMN IF NOT EXISTS permits_active_distinct INTEGER,
  ADD COLUMN IF NOT EXISTS map_areas_total INTEGER,
  ADD COLUMN IF NOT EXISTS zoning_layer_version TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permits_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coa_last_seen_at TIMESTAMPTZ;

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('report_check_min_ms', 6000, NULL, 'MF-62: the minimum time in milliseconds the report loading state "What we checked" stays before the report opens; operator ruling 2026-11-11 D-2 a (6 s). Bounds 1000-20000; outside them, or below report_check_skip_after_ms, the screen is skipped. Read by the report producer through readReportCheckPace (src/lib/parcels/report-check-pace.ts).'),
  ('report_check_skip_after_ms', 2000, NULL, 'MF-62: the delay in milliseconds before the "Show report" link appears on the report loading state; operator ruling 2026-11-11 D-2 a (2 s). Bounds 0-10000, never above report_check_min_ms; otherwise the screen is skipped. Read by the report producer through readReportCheckPace (src/lib/parcels/report-check-pace.ts).')
ON CONFLICT (variable_key) DO NOTHING;

COMMIT;

-- DOWN — comment-only (lessons.md: migrate.js executes every uncommented line). Forward-fix is the normal path.
-- BEGIN;
--   DELETE FROM logic_variables WHERE variable_key IN ('report_check_min_ms', 'report_check_skip_after_ms');
--   ALTER TABLE data_quality_snapshots
--     DROP COLUMN IF EXISTS parcels_total, DROP COLUMN IF EXISTS permits_active_distinct, DROP COLUMN IF EXISTS map_areas_total,
--     DROP COLUMN IF EXISTS zoning_layer_version, DROP COLUMN IF EXISTS permits_last_seen_at, DROP COLUMN IF EXISTS coa_last_seen_at;
-- COMMIT;
