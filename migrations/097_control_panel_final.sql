-- UP
-- Adds the 3 final "Gravity" variables for Spec 86 Control Panel:
--   commercial_shell_multiplier  — interior-trade penalty on Shell builds (Spec 83)
--   placeholder_cost_threshold   — min city cost before model override takes control
--   income_premium_tiers         — neighbourhood-income JSON multiplier map
--
-- Since the existing variable_value column is DECIMAL, JSON data cannot be stored
-- there. We add a nullable variable_value_json JSONB column for the tier map.
-- Convention: each row uses EITHER variable_value (numeric, NOT NULL) OR
-- variable_value_json (json, nullable) but not both.
-- logic_variables.variable_value retains its NOT NULL DEFAULT constraint;
-- rows that use the json column must store a sentinel (0) in variable_value.

ALTER TABLE logic_variables
  ADD COLUMN IF NOT EXISTS variable_value_json JSONB NULL;

COMMENT ON COLUMN logic_variables.variable_value_json
  IS 'JSON config for non-numeric logic variables (e.g. income_premium_tiers). '
     'Exactly one of variable_value (numeric) or variable_value_json must be set. '
     'When variable_value_json IS NOT NULL, variable_value holds sentinel 0.';

INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description)
VALUES
  ('commercial_shell_multiplier', 0.60, NULL,
   'Penalty multiplier for interior trades on Shell builds (e.g. 0.60 = 40% reduction). Spec 83.'),
  ('placeholder_cost_threshold',  1000, NULL,
   'Min city-reported cost (CAD) before the model assumes total override control. Below this threshold the city value is treated as a placeholder.'),
  ('income_premium_tiers',        0,    '{"100000": 1.2, "150000": 1.5}'::jsonb,
   'JSON map of neighbourhood median income (CAD) bracket → cost multiplier. Keys are income thresholds (lowest → highest), values are multipliers. E.g. {"100000": 1.2, "150000": 1.5}')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DELETE FROM logic_variables
--   WHERE variable_key IN ('commercial_shell_multiplier', 'placeholder_cost_threshold', 'income_premium_tiers');
-- ALTER TABLE logic_variables DROP COLUMN IF EXISTS variable_value_json;
