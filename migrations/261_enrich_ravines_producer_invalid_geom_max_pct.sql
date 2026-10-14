-- 261: enrich_ravines_producer_invalid_geom_max_pct — the producer-contract invalid-geometry bound.
--
-- Compute-purity seam S1-P (Spec 124 Rule 1/3, R-BZ G9; operator 2026-10-13 "proceed if it complies"):
-- enrich_ravines refused to join against a load_ravines run whose invalid-geometry share exceeded a bare
-- compute literal (MAX_INVALID_GEOM_RATIO = 0.05). The check becomes a declared staleness.pins bound the
-- runner evaluates before any phase, and the 5% becomes this operator-visible logic variable — byte-identical
-- behaviour at the default.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3 tunables externalized; R-BZ)
-- SPEC LINK: docs/specs/01-pipeline/59_ravine_protection.md (load_ravines → enrich_ravines contract)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('enrich_ravines_producer_invalid_geom_max_pct', 5,
   'Producer-contract bound: the most load_ravines may skip as invalid geometry, as a percent of feature_count, ' ||
   'before enrich_ravines refuses the load (formerly the 0.05 compute literal). CONSUMED by enrich_ravines.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key = 'enrich_ravines_producer_invalid_geom_max_pct';
