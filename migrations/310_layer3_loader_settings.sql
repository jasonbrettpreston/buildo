-- 310: compute_maxbld_scenarios (Layer 3, MB-31 (e) / MB-35) — the settings the runtime loader needs that no migration inserts yet
-- (operator "a yes" 2026-11-11, D-5 and D-4): the two houseplex settings (seed-only since MB-27 increment 3, M-496) and the zone-pool
-- bounding-box divisor `compute_maxbld_scenarios_bbox_degree_divisor` (the link_massing_bbox_degree_divisor precedent, migration 263;
-- max 80000 because a degree of longitude at Toronto's north edge is about 80,400 m, so the prefilter over-covers only at or below it).
-- Mirrors scripts/seeds/logic_variables.json entry for entry. The 294 / 296 form.
-- WRITTEN, NOT APPLIED: the MB-35 night applies it after 276, 292, 294 and 296 (each --only, --dry-run first). Idempotent: ON CONFLICT
-- (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-496
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-CV; R-DE (v))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('houseplex_circulation_share', 0.1, NULL, 'Spec 69a M-496 (operator "Q9-1 a", 2026-11-04; CHAT-230.Q9-1): the share of a houseplex floor''s floor area that is circulation, so a floor''s livable area is 0.9 of its floor area. Operator value, not a cited OBC figure. Pinned (min = max). CONSUMED by the Layer 3 compute_maxbld_scenarios catalogue.'),
  ('houseplex_unit_min_net_m2', 30, NULL, 'Spec 69a M-496 (operator "Q9-2 a", 2026-11-04; CHAT-230.Q9-2): the minimum livable (net) area of one dwelling unit in a houseplex, in m2. Pinned (min = max). CONSUMED by the Layer 3 compute_maxbld_scenarios catalogue.'),
  ('compute_maxbld_scenarios_bbox_degree_divisor', 78000, NULL, 'MB-35 D-4 (operator "a yes", 2026-11-11; the link_massing_bbox_degree_divisor precedent, migration 263): the metres-to-degrees divisor that widens the zone-pool bounding-box prefilter of compute_maxbld_scenarios read 5 into degree space; the exact cut is the geography ST_DWithin that follows. Must stay at or below about 80,400 (a degree of longitude at Toronto''s north edge), so the prefilter over-covers; bounds 1000..80000. Changes what the read costs, never what is accepted. CONSUMED by compute_maxbld_scenarios (buildSourceSql, read from ctx.config and written into the batch statement as a checked literal).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 294 and 296).
-- DELETE FROM logic_variables WHERE variable_key = 'houseplex_circulation_share';
-- DELETE FROM logic_variables WHERE variable_key = 'houseplex_unit_min_net_m2';
-- DELETE FROM logic_variables WHERE variable_key = 'compute_maxbld_scenarios_bbox_degree_divisor';
