-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('profiling_coverage_pass_pct', 90, 'assert-global-coverage: coverage >= this integer pct -> PASS (spec 49)'),
  ('profiling_coverage_warn_pct', 70, 'assert-global-coverage: coverage >= this integer pct -> WARN; below -> FAIL (spec 49)')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DELETE FROM logic_variables
--  WHERE variable_key IN ('profiling_coverage_pass_pct', 'profiling_coverage_warn_pct');
