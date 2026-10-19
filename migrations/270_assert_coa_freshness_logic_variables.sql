-- 270: assert_coa_freshness — the two portal-rot bounds are copied to step-owned names (phase-4 wave 4, lane A, commit ②).
--
-- McDonald's Airtight V3 (Spec 124 R-DE (v), R-DF EXTERNALIZED; defect ACF-D2; draft ruling W4A-R1):
-- step-owned logic variables are `<slug>_<name>`. The converted step (scripts/quality/assert-coa-freshness.
-- descriptor.json) reads:
--   assert_coa_freshness_warn_max_days  (was coa_freshness_warn_days, default 45)
--   assert_coa_freshness_fail_max_days  (was coa_freshness_fail_days, default 135)
-- Each new row carries the OLD row's live value (an operator-set value survives), falling back to the seed
-- default when the old row is absent. The OLD rows STAY: commit ② lands at stage compute_ported (W4A-R6,
-- operator y 2026-10-18; Spec 124 R-EF), so the legacy shell is still the live step and reads them until the
-- ③ cutover, whose migration deletes them and moves the names into config.retired (Spec 124 R-A). This is the
-- same copy form as migration 273 (enrich_permits / enrich_coa_zoning ②) and the lane-C drafts 274 / 275.
--
-- Both bounds are inclusive ceilings in the converted check (value_max, the R-DC precedent; ACF-D7): the
-- largest rounded day count that still reads PASS (warn) / WARN (fail).
--
-- ORDERING (trap 7): the legacy script reads the OLD names, which this migration leaves in place, so the PRE
-- captured on the ① tree (replay night N1) stays valid after it is applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves an already-present new row.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-DE (v), R-DF EXTERNALIZED)
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'assert_coa_freshness_warn_max_days',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_freshness_warn_days'), 45),
       'assert_coa_freshness (Spec 42 chain step 3): the largest number of whole days since the coa root last touched any coa_applications row (MAX(last_seen_at), rounded) that still reads PASS; above it the ingestion_days_ago check WARNs (CKAN data may be frozen). Inclusive ceiling (value_max). Copied from coa_freshness_warn_days by migration 270 (R-DE (v)), value carried; the legacy name retires at ③. CONSUMED by assert_coa_freshness via checks[].limit_from_config.'
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT 'assert_coa_freshness_fail_max_days',
       COALESCE((SELECT variable_value FROM logic_variables WHERE variable_key = 'coa_freshness_fail_days'), 135),
       'assert_coa_freshness (Spec 42 chain step 3): the largest number of whole days since the newest coa_applications touch that still reads WARN; above it ingestion_days_ago FAILs (portal likely dead, not just slow). Inclusive ceiling (value_max). Copied from coa_freshness_fail_days by migration 270 (R-DE (v)), value carried; the legacy name retires at ③. CONSUMED by assert_coa_freshness via checks[].warn_limit_from_config.'
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159). The legacy rows were never removed.
-- DELETE FROM logic_variables WHERE variable_key IN ('assert_coa_freshness_warn_max_days', 'assert_coa_freshness_fail_max_days');
