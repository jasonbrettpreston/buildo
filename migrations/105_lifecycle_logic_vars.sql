-- UP: seed lifecycle stall + phase-bucket thresholds into logic_variables
-- These replace hardcoded constants in lifecycle-phase.js / lifecycle-phase.ts.
-- ON CONFLICT DO NOTHING preserves any operator-tuned values already present.

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_issued_stall_days',     730, 'Days since Permit Issued (no inspection) before stall flag is set'),
  ('lifecycle_inspection_stall_days', 180, 'Days since last inspection before stall flag is set'),
  ('lifecycle_p7a_max_days',           30, 'Max days since issued for P7a (fresh) bucket'),
  ('lifecycle_p7b_max_days',           90, 'Max days since issued for P7b (active) bucket')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- DELETE FROM logic_variables
--   WHERE variable_key IN (
--     'lifecycle_issued_stall_days',
--     'lifecycle_inspection_stall_days',
--     'lifecycle_p7a_max_days',
--     'lifecycle_p7b_max_days'
--   );
