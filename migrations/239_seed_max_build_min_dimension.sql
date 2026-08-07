-- 239: seed max_build_min_dimension_m — the D-C viability floor for max-build dimensions.
--
-- WF3 Phase 1 D-C (Spec 65 §4 MB-3 amendment): a max-build width/length below this floor is not a
-- geometry we believe — it is evidence the zone-default setbacks do not describe the lot. The
-- enrich-parcels max-build pass NULLs the sub-floor dimension(s); non-ravine envelopes fall back to
-- the coverage cap ONLY (basis 'coverage_only' — the degenerate box AND buffer are excluded, nothing
-- models depth loss); ravine sub-floor parcels become 'ravine_constrained' with the WHOLE envelope
-- withheld (a coverage×lot fallback is ravine-blind and would re-price deleted protection).
--
-- INSERT ... ON CONFLICT DO NOTHING (mig 211 precedent): never reverts an operator override; on a
-- fresh database this row also arrives via scripts/seeds/logic_variables.json (migrate.js runs the
-- seed loader AFTER migrations), and the two sources carry BYTE-IDENTICAL description strings —
-- scripts/generate-logic-vars-docs.mjs renders the SEED string for any key present in the seed, so a
-- divergence would silently document text the database does not hold. The default (3) is also pinned
-- by docs/specs/_contracts.json (max_build.min_dimension_m) + contracts.infra.test.ts CONSUMER_RULES
-- and by src/tests/logic-var-parity.logic.test.ts against scripts/lib/max-build.js
-- MAX_BUILD_MIN_DIMENSION_M_DEFAULT (the missing-variable-window fallback).
--
-- SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 MB-3

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('max_build_min_dimension_m', 3,
   'Spec 65 §4 MB-3 (WF3 Phase 1 D-C): minimum viable build dimension (m). A max-build width/length below this floor is NULLed — the setback box is excluded as degenerate; non-ravine envelopes fall back to the coverage cap only (max_buildable_gfa_basis=''coverage_only''); ravine sub-floor parcels are ''ravine_constrained'' with the whole envelope withheld (no coverage fallback). CONSUMED by enrich-parcels.js. Operator-tunable.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only (lessons.md: migrate.js executes every uncommented line).
-- To revert:
--   DELETE FROM logic_variables WHERE variable_key = 'max_build_min_dimension_m';
-- Reverting also requires removing the scripts/seeds/logic_variables.json entry (and the
-- EXPECTED_LOGIC_VAR_KEYS row in src/tests/control-panel.logic.test.ts), or a fresh database
-- will disagree with the reverted one. The enrich SQL then falls back to the code default (3.0).
