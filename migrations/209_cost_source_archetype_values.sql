-- 209_cost_source_archetype_values.sql
-- SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3 (WF2 archetype derivation)
--
-- WF2 (archetype-based project cost): the residential permit/CoA cost derivation moves from the
-- Spec-83 trade-buildup + Liar's Gate to the Spec-88 archetype ladder. Three new provenance values:
--   archetype_declared_area  — T1: line per-sqm × the permit's own plausibility-bounded area
--   archetype_parcel         — T2: the parcel's precomputed line total (propagated scalar)
--   archetype_rate           — T3: archetype_cost_rates × own area (unlinked/non-R-linked residential)
-- All prior values PRESERVED: 'permit'/'model'/'none' still written by the T4 (non-archetype +
-- non-residential) path, 'geometric' retained for existing CoA rows (mig 145 lesson: never drop a
-- value production rows still carry).
--
-- UP
-- Rogue-value pre-check (mig 145 pattern): fail loudly if unexpected values exist.
DO $$
DECLARE rogue_count integer;
BEGIN
  SELECT COUNT(*) INTO rogue_count FROM cost_estimates
  WHERE cost_source IS NOT NULL
    AND cost_source NOT IN ('permit', 'model', 'none', 'geometric');
  IF rogue_count > 0 THEN
    RAISE EXCEPTION 'migration 209: % cost_estimates rows carry a cost_source outside the current enum — investigate before extending the CHECK', rogue_count;
  END IF;
END $$;

-- Widen the column BEFORE the CHECK: the longest legacy value was 'geometric' (9),
-- so the column was varchar(20). 'archetype_declared_area' is 23 chars — it would
-- pass the CHECK but overflow varchar(20) at write time ("value too long for type
-- character varying(20)"), failing every batch that carries a T1 row. Widen both
-- the cost_estimates provenance and the coa_applications mirror to varchar(30).
ALTER TABLE cost_estimates   ALTER COLUMN cost_source TYPE varchar(30);
ALTER TABLE coa_applications ALTER COLUMN cost_source TYPE varchar(30);

ALTER TABLE cost_estimates DROP CONSTRAINT IF EXISTS cost_estimates_cost_source_check;
ALTER TABLE cost_estimates
    ADD CONSTRAINT cost_estimates_cost_source_check
    CHECK (cost_source IN ('permit', 'model', 'none', 'geometric',
                           'archetype_declared_area', 'archetype_parcel', 'archetype_rate'));

-- ── CoA coverage gate recalibration ──────────────────────────────────────────
-- The seed defaults changed (threshold 70→65, fail 0→5) but seeds never overwrite existing rows.
-- These gates were calibrated for the all-safe-skip era (CoA coverage structurally 0%); the WF2
-- archetype ladder activates CoA costing (~69% measured), so the live values are re-baselined here.
-- Idempotent; operators re-tune via the Spec 86 Control Panel afterward.
UPDATE logic_variables SET variable_value = '65', updated_at = NOW()
  WHERE variable_key = 'coa_cost_coverage_threshold_pct' AND variable_value = '70';
UPDATE logic_variables SET variable_value = '5', updated_at = NOW()
  WHERE variable_key = 'coa_cost_coverage_fail_pct' AND variable_value = '0';

-- DOWN (rollback runbook, Phase F): re-running the OLD derivation rewrites every row's cost_source
-- back into the 4-value set; THEN the constraint can be restored with:
--   ALTER TABLE cost_estimates DROP CONSTRAINT cost_estimates_cost_source_check;
--   ALTER TABLE cost_estimates ADD CONSTRAINT cost_estimates_cost_source_check
--       CHECK (cost_source IN ('permit', 'model', 'none', 'geometric'));
