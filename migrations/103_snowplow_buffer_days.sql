-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('snowplow_buffer_days', 7, 'Days added to today when the Historic Snowplow snaps a fallback-anchor forecast out of the deep past (spec 85 §3). Higher = more lead time before the window opens.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DELETE FROM logic_variables WHERE variable_key = 'snowplow_buffer_days';
