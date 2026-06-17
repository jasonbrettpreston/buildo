-- 182: Seed the `archetype_bundle_confidence` logic_variable (Spec 80 §5.B.5 bundle prior).
--
-- The classifier's archetype bundle prior emits implied trades at a bundle-tier confidence
-- that sits BELOW direct tag/rule hits but at/above the 0.50 lead-feed gate (so the implied
-- trades are real leads, not coverage-only). classify-permits.js defaults to 0.55 when this
-- key is absent; seeding it makes the knob operator-tunable via the control panel. ON CONFLICT
-- DO NOTHING so an operator's tuned value survives re-runs.
-- SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.5

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('archetype_bundle_confidence', 0.55,
   'Spec 80 §5.B.5 — confidence for archetype-implied (bundle-prior) trade emissions; below direct tag/rule hits, at/above the 0.50 lead-feed gate so implied trades are real leads')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- DELETE FROM logic_variables WHERE variable_key = 'archetype_bundle_confidence';
