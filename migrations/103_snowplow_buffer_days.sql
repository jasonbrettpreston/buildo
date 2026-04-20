-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('snowplow_buffer_days', 7, 'Days added to today when the Historic Snowplow snaps a fallback-anchor forecast out of the deep past (spec 85 §3). Higher = more lead time before the window opens.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
DELETE FROM logic_variables WHERE variable_key = 'snowplow_buffer_days';
