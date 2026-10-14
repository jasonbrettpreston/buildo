-- 259: pipeline_timezone — the first SEEDED string-typed logic variable (closed enum).
--
-- Spec 124 R-CE (S2 F3-2, operator y 2026-10-13): a step needing a calendar date derives it from
-- ctx.clock in the zone this variable names — never a literal, never the DB session zone by accident.
-- Default 'UTC' = the measured dev DB session TimeZone (2026-10-12), so today's snapshot_date values
-- are unchanged. The closed set is UTC | America/Toronto (seed "enum"; descriptors declare it with
-- on_invalid "fail"; the admin PUT refuses any other value).
--
-- Stored like the JSONB-string precedent (mig 219 stripe_price_id_default, mig 211): variable_value
-- is the sentinel 0, the value lives in variable_value_json. Unlike 219, this one IS in
-- scripts/seeds/logic_variables.json ("type": "string"), which apply-logic-variables.js now seeds
-- the same way.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CE; Rule 3 tunables externalized)
-- SPEC LINK: docs/specs/02-web-admin/86_control_panel.md (admin editability)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('pipeline_timezone', 0, '"UTC"'::jsonb,
   'The IANA zone a step derives a calendar date in from ctx.clock (Spec 124 R-CE). JSONB string, closed set UTC | America/Toronto. UTC = the measured dev DB session zone. CONSUMED by assert_engine_health.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DELETE FROM logic_variables WHERE variable_key = 'pipeline_timezone';
