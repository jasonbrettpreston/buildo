-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('los_decay_divisor', 25, 'Scales the asymptotic decay curve for competition penalties (rawPenalty / this = decayFactor; higher = gentler decay)')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DELETE FROM logic_variables WHERE variable_key = 'los_decay_divisor';
