-- 266: admin_range_badge_borderline_margin_ratio — the admin range-badge margin becomes a logic variable.
--
-- Spec 124 R-DW (McDonald's Airtight V3, operator y 2026-10-18; R-DF EXTERNALIZED, R-DL): getRangeStatus
-- (src/lib/admin/funnel.ts) classified a value outside an expected range as borderline within a bare 20%
-- of the range's span, anomaly beyond it. That margin is now this registered variable, served to the
-- admin by /api/quality. The default 0.2 is the former literal, so every badge is unchanged at it.
-- Admin-owned (the data-quality surface), not a step's variable; it applies only to UNCONVERTED steps'
-- STEP_EXPECTED_RANGES. A converted step's badge is its own audit_table check row.
--
-- Numbered 266: 264 (permits) and 265 (coa) are held by the in-flight wave-1 lanes.
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-DW; R-DF EXTERNALIZED; Rule 3)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('admin_range_badge_borderline_margin_ratio', 0.2,
   'Admin data-quality surface (Spec 124 R-DW, McDonald''s Airtight V3, operator y 2026-10-18): how far outside an UNCONVERTED step''s STEP_EXPECTED_RANGES range a value may sit, as a fraction of the range''s span, before its badge turns from borderline to anomaly (getRangeStatus, src/lib/admin/funnel.ts). 0.2 = the former bare 20% literal. A converted step''s badge is its own audit_table check row. CONSUMED by src/app/api/quality/route.ts.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- DELETE FROM logic_variables WHERE variable_key = 'admin_range_badge_borderline_margin_ratio';
