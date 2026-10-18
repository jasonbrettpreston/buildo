-- 273: enrich_permits + enrich_coa_zoning (phase-4 wave 4 lane B, commit ②) — step-owned logic variables.
--
-- McDonald's Airtight V3 (Spec 124 R-DF EXTERNALIZED; R-DE (v) step-owned names; R-CV form). The two
-- converted lead-zoning ENRICHERs read every bound through their own declared config:
--
--   NEW (byte-identical to the former literals):
--     enrich_permits_zoning_coverage_fail_pct       80   (PERMITS_COVERAGE_FAIL, enrich-permits.js:20)
--     enrich_permits_zoning_coverage_pass_min_pct   83   (the "g.fail + 3" PASS margin, :637)
--     enrich_coa_zoning_zoning_coverage_fail_pct    80   (COA_COVERAGE_FAIL, :21)
--     enrich_coa_zoning_zoning_coverage_pass_min_pct 83  (the "g.fail + 3" PASS margin, :637)
--
--   COPIED, value-preserving (the legacy key stays: the legacy shell still reads it by SQL until the ③
--   cutover retires that shell; the ③ migration deletes the five legacy keys):
--     centreline_propagation_coverage_min      -> enrich_permits_centreline_coverage_min
--                                              -> enrich_coa_zoning_centreline_coverage_min
--     permits_bylaw_max_fsi_null_warn_pct      -> enrich_permits_bylaw_max_fsi_null_warn_pct
--     permits_bylaw_max_coverage_null_warn_pct -> enrich_permits_bylaw_max_coverage_null_warn_pct
--     coa_bylaw_max_fsi_null_warn_pct          -> enrich_coa_zoning_bylaw_max_fsi_null_warn_pct
--     coa_bylaw_max_coverage_null_warn_pct     -> enrich_coa_zoning_bylaw_max_coverage_null_warn_pct
--   An operator-set value on the legacy key is carried over (the INSERT ... SELECT reads the live row);
--   when the legacy row is absent the seeded default is used.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any value already set on a new key.
--
-- SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (DEC-5 F-H12 gate)
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-DE (v); R-DF; R-CV)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('enrich_permits_zoning_coverage_fail_pct', 80,
   'enrich_permits F-H12 FAIL floor (Spec 66 DEC-5): construction-permit zoning_class coverage below this percent FAILs the run. Formerly the literal PERMITS_COVERAGE_FAIL = 80. CONSUMED by enrich_permits via checks[].warn_limit_from_config (permits_zoning_class_coverage_pct).'),
  ('enrich_permits_zoning_coverage_pass_min_pct', 83,
   'enrich_permits F-H12 PASS floor (Spec 66 DEC-5): coverage at or above this percent PASSes; between the FAIL floor and this one WARNs. Formerly the literal margin g.fail + 3. CONSUMED by enrich_permits via checks[].limit_from_config (permits_zoning_class_coverage_pct).'),
  ('enrich_coa_zoning_zoning_coverage_fail_pct', 80,
   'enrich_coa_zoning F-H12 FAIL floor (Spec 66 DEC-5): coa_applications zoning_class coverage below this percent FAILs the run. Formerly the literal COA_COVERAGE_FAIL = 80. CONSUMED by enrich_coa_zoning via checks[].warn_limit_from_config (coa_zoning_class_coverage_pct).'),
  ('enrich_coa_zoning_zoning_coverage_pass_min_pct', 83,
   'enrich_coa_zoning F-H12 PASS floor (Spec 66 DEC-5): coverage at or above this percent PASSes; between the FAIL floor and this one WARNs. Formerly the literal margin g.fail + 3. CONSUMED by enrich_coa_zoning via checks[].limit_from_config (coa_zoning_class_coverage_pct).')
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT n.new_key, COALESCE(lv.variable_value, n.seed_default), n.description
  FROM (VALUES
    ('enrich_permits_centreline_coverage_min', 'centreline_propagation_coverage_min', 0.9,
     '§8e L24c (Spec 62): minimum centreline-enriched share of valid-geom parcels before enrich_permits propagates onto permits; below it the step HALTs. Copied from centreline_propagation_coverage_min by migration 273. CONSUMED by enrich_permits.'),
    ('enrich_coa_zoning_centreline_coverage_min', 'centreline_propagation_coverage_min', 0.9,
     '§8e L24c (Spec 62): minimum centreline-enriched share of valid-geom parcels before enrich_coa_zoning propagates onto coa_applications; below it the step HALTs. Copied from centreline_propagation_coverage_min by migration 273. CONSUMED by enrich_coa_zoning.'),
    ('enrich_permits_bylaw_max_fsi_null_warn_pct', 'permits_bylaw_max_fsi_null_warn_pct', 88,
     'WF2 P6.5: enrich_permits bylaw_max_fsi NULL-rate WARN floor (structural nulls; WARN above the floor, never FAIL). Copied from permits_bylaw_max_fsi_null_warn_pct by migration 273. CONSUMED by enrich_permits via checks[].limit_from_config.'),
    ('enrich_permits_bylaw_max_coverage_null_warn_pct', 'permits_bylaw_max_coverage_null_warn_pct', 72,
     'WF2 P6.5: enrich_permits bylaw_max_coverage NULL-rate WARN floor (structural nulls; WARN above the floor, never FAIL). Copied from permits_bylaw_max_coverage_null_warn_pct by migration 273. CONSUMED by enrich_permits via checks[].limit_from_config.'),
    ('enrich_coa_zoning_bylaw_max_fsi_null_warn_pct', 'coa_bylaw_max_fsi_null_warn_pct', 97,
     'WF2 P6.5: enrich_coa_zoning bylaw_max_fsi NULL-rate WARN floor (structural nulls; WARN above the floor, never FAIL). Copied from coa_bylaw_max_fsi_null_warn_pct by migration 273. CONSUMED by enrich_coa_zoning via checks[].limit_from_config.'),
    ('enrich_coa_zoning_bylaw_max_coverage_null_warn_pct', 'coa_bylaw_max_coverage_null_warn_pct', 66,
     'WF2 P6.5: enrich_coa_zoning bylaw_max_coverage NULL-rate WARN floor (structural nulls; WARN above the floor, never FAIL). Copied from coa_bylaw_max_coverage_null_warn_pct by migration 273. CONSUMED by enrich_coa_zoning via checks[].limit_from_config.')
  ) AS n(new_key, old_key, seed_default, description)
  LEFT JOIN logic_variables lv ON lv.variable_key = n.old_key
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159 / 263).
-- DELETE FROM logic_variables WHERE variable_key IN ('enrich_permits_zoning_coverage_fail_pct', 'enrich_permits_zoning_coverage_pass_min_pct', 'enrich_coa_zoning_zoning_coverage_fail_pct', 'enrich_coa_zoning_zoning_coverage_pass_min_pct', 'enrich_permits_centreline_coverage_min', 'enrich_coa_zoning_centreline_coverage_min', 'enrich_permits_bylaw_max_fsi_null_warn_pct', 'enrich_permits_bylaw_max_coverage_null_warn_pct', 'enrich_coa_zoning_bylaw_max_fsi_null_warn_pct', 'enrich_coa_zoning_bylaw_max_coverage_null_warn_pct');
