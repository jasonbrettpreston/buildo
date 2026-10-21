-- 280: resolve_bylaws (Layer 2) — the in-scope zone list becomes a registered logic variable.
--
-- Operator Q-L2-4, 2026-10-21 (docs/reports/decisions/2026-10-21-chat-batch-k-layer2.json#CHAT-39.Q-L2-4):
-- "A logic variable (R-AY preference), changeable without code." Spec 124 R-AY asks for a declared predicate over
-- registered logic variables; Spec 134 §2 names this variable as the population's source.
--
--   resolve_bylaws_population_zone_classes  ["R","RD","RS","RT","RM"]  the zones whose parcels get a lot link row
--
-- The list is JSON (variable_value_json, migration 097); variable_value holds the sentinel 0. Every entry must be in
-- the evaluator zone vocabulary (scripts/seeds/bylaw/vocab.json `zone`); scripts/lib/bylaw-resolution.js
-- `inPopulation` rejects any other. The seed-file entry (scripts/seeds/logic_variables.json), the registry row and
-- the admin group land with commit ① of Spec 134 §9, with the loader's decision on a list-valued type.
--
-- NOT APPLIED, and kept OUT of migrations/ on purpose: a file in migrations/ changes the migration count every step
-- scorecard embeds, so 28 generated scorecards (and the logic-variables registry) would churn on every branch. At ①
-- this file moves to migrations/ (renumbered to the next free number) with the seed-file entry, and the scorecards
-- are regenerated once. Written by lane LAYER2-BUILD-3; the operator applies it with ①. Idempotent: ON CONFLICT DO NOTHING
-- preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (Population)
--            docs/specs/01-pipeline/124_step_standard_policy.md (R-AY)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('resolve_bylaws_population_zone_classes', 0, '["R","RD","RS","RT","RM"]'::jsonb,
   'resolve_bylaws (Spec 134 §2; operator Q-L2-4 2026-10-21): the zones whose parcels are in the Layer 2 population. ' ||
   'A JSON array of evaluator zone codes (vocab.json zone); variable_value is the sentinel 0. Lots whose zone is not ' ||
   'listed have their lot link row retracted (R-IU). CONSUMED by resolve_bylaws (inPopulation).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DELETE FROM logic_variables WHERE variable_key = 'resolve_bylaws_population_zone_classes';
