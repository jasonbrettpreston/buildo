-- 272: link_coa_to_parcels — step-owned logic variables (phase-4 wave 4, compressed form commit ②).
--
-- McDonald's Airtight V3 (Spec 124 Rule 3; R-DE (v) step-owned names; R-DF EXTERNALIZED; R-CV form; defects
-- LCTP-D1, LCTP-D2; ruling W4A-R1, operator y 2026-10-18).
--
--   NEW (byte-identical to the former literals):
--     link_coa_to_parcels_neighbourhood_coverage_min_pct  95  (">= 95%" / 0.95, link-coa-to-parcels.js:637)
--     link_coa_to_parcels_centroid_outside_max_pct          1  ("<= 1% of matches", :639)
--   The third literal, GHOST_CLEANUP_BATCH_SIZE = 1000 (:59), is NOT seeded: the converted step sweeps vanished
--   leads with ONE statement after the loop (Spec 124 R-EG (5), 124:265 "ONE statement after the loop"), so no
--   batch size exists to tune — the outcome the assessment's literal ledger left to ② (§7: "or retired if
--   link_full_retraction runs set-based; decided at ②").
--
--   COPIED, value-preserving (the legacy key stays: commit ② lands at stage compute_ported (W4A-R6; Spec 124
--   R-EF), so the legacy shell is still the live step and reads it through the config loader until the ③
--   cutover, whose migration deletes the three legacy keys and moves them into config.retired, R-A):
--     coa_parcel_conf_tier1a      -> link_coa_to_parcels_conf_tier1a
--     coa_parcel_conf_tier1b      -> link_coa_to_parcels_conf_tier1b
--     coa_unmatched_threshold_pct -> link_coa_to_parcels_unmatched_threshold_pct
--   An operator-set value on the legacy key is carried over; when the legacy row is absent the seeded default
--   is used. The same copy form as migrations 270 / 271 / 273 / 274 / 275.
--
-- ORDERING (trap 7): the legacy script reads the OLD names, which this migration leaves in place, so the PRE
-- captured on the ① tree stays valid after it is applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any value already set on a new key.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-DE (v); R-DF; R-CV; R-EG (5))

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('link_coa_to_parcels_neighbourhood_coverage_min_pct', 95,
   'link_coa_to_parcels neighbourhood-coverage WARN floor (percent of parcel-linked CoAs whose parcel centroid falls inside a neighbourhood polygon). Formerly the literal >= 95%. CONSUMED by link_coa_to_parcels via checks[].limit_from_config (coa_neighbourhood_coverage_pct).'),
  ('link_coa_to_parcels_centroid_outside_max_pct', 1,
   'link_coa_to_parcels centroid-outside-polygon WARN ceiling (percent of parcel-linked CoAs whose parcel centroid lands outside its own polygon). Formerly the literal <= 1% of matches. CONSUMED by link_coa_to_parcels via checks[].limit_from_config (centroid_outside_polygon_count).')
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT n.new_key, COALESCE(lv.variable_value, n.seed_default), n.description
  FROM (VALUES
    ('link_coa_to_parcels_conf_tier1a', 'coa_parcel_conf_tier1a', 0.95,
     'Confidence stamped on a link_coa_to_parcels tier-1a parcel match (address-points bridge or parcels-table exact). Copied from coa_parcel_conf_tier1a by migration 272. CONSUMED by link_coa_to_parcels.'),
    ('link_coa_to_parcels_conf_tier1b', 'coa_parcel_conf_tier1b', 0.80,
     'Confidence stamped on a link_coa_to_parcels tier-1b name-only parcel match. Copied from coa_parcel_conf_tier1b by migration 272. CONSUMED by link_coa_to_parcels.'),
    ('link_coa_to_parcels_unmatched_threshold_pct', 'coa_unmatched_threshold_pct', 10,
     'link_coa_to_parcels unmatched-CoA ceiling (percent; WARN, never FAIL). Copied from coa_unmatched_threshold_pct by migration 272. CONSUMED by link_coa_to_parcels via checks[].limit_from_config.')
  ) AS n(new_key, old_key, seed_default, description)
  LEFT JOIN logic_variables lv ON lv.variable_key = n.old_key
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159 / 263). The legacy rows were never removed.
-- DELETE FROM logic_variables WHERE variable_key IN ('link_coa_to_parcels_neighbourhood_coverage_min_pct', 'link_coa_to_parcels_centroid_outside_max_pct', 'link_coa_to_parcels_conf_tier1a', 'link_coa_to_parcels_conf_tier1b', 'link_coa_to_parcels_unmatched_threshold_pct');
