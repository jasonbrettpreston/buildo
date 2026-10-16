-- 262: parcels unit constants — load_parcels' physical and unit-definition constants as logic variables.
--
-- Operator 2026-10-14 (H-Q1): Spec 124 R-BC(b) strict zero admits no ledger row of any disposition
-- (physical_constant / unit_conversion / coordinate_reference included), and R-AW promotes a constant
-- to a registered logic variable using the EXISTING value as its default. scripts/lib/compute/load-parcels.js
-- carried three such consts, now read through the resolved config — byte-identical at these defaults:
--   parcels_metres_per_degree_lat 111320  (was `const mPerDegLat = 111320` ×2) — bounds [110574, 111694],
--                                          the WGS84 meridian degree length equator..pole.
--   parcels_sqm_to_sqft           10.7639 (was SQM_TO_SQFT) — bounds pinned min = max = the definition.
--   parcels_m_to_ft               3.28084 (was M_TO_FT)     — bounds pinned min = max = the definition.
-- The pinned pair is visible in admin but not tunable: any other value refuses the step (on_invalid fail).
-- (The dead SOURCE_CRS const was deleted, not promoted: the srid is declared in the descriptor.)
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 3; R-AW; R-BC(b); R-BZ)
-- SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (load_parcels frontage/depth/lot size columns)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('parcels_metres_per_degree_lat', 111320,
   'Metres per degree of latitude: the equirectangular factor load_parcels projects a parcel ring with ' ||
   'before the MBR frontage/depth and shoelace area (formerly the 111320 compute literal). Physical constant; ' ||
   'bounds [110574, 111694] = WGS84 equator..pole. CONSUMED by load_parcels.'),
  ('parcels_sqm_to_sqft', 10.7639,
   'Square feet per square metre: a unit definition, not a tunable (formerly SQM_TO_SQFT). Bounds pinned ' ||
   'min = max = 10.7639. CONSUMED by load_parcels.'),
  ('parcels_m_to_ft', 3.28084,
   'Feet per metre: a unit definition, not a tunable (formerly M_TO_FT). Bounds pinned min = max = 3.28084. ' ||
   'CONSUMED by load_parcels.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('parcels_metres_per_degree_lat', 'parcels_sqm_to_sqft', 'parcels_m_to_ft');
