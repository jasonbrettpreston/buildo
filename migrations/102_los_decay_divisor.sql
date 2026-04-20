-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('los_decay_divisor', 25, 'Scales the asymptotic decay curve for competition penalties (rawPenalty / this = decayFactor; higher = gentler decay)')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
DELETE FROM logic_variables WHERE variable_key = 'los_decay_divisor';
