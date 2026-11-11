-- 307: the "choose your lot" map page's two neighbour tunables (MF-53; DECISIONS-v3 item 2, operator 2026-11-11 "b": admin-editable).
-- Mirrors scripts/seeds/logic_variables.json entry for entry (group "Parcel Lookup"; the seed is the test truth). Idempotent:
-- ON CONFLICT (variable_key) DO NOTHING keeps any operator-set value.
-- WRITTEN, NOT APPLIED here: the operator applies it (DB job). Until it is applied, a search for an address that is found with no
-- linked lot fails closed (500) on the consumer lookup (src/lib/parcels/lot-map.ts readLotMapLimits); every other search is unaffected.
--
-- SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md section 3.2 (dated note 2026-11-11, MF-53)
-- SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md rule 3

-- UP
INSERT INTO logic_variables (variable_key, variable_value, variable_value_json, description) VALUES
  ('parcel_map_neighbour_radius_m', 25, NULL, 'MF-53: on the choose-your-lot map, neighbour lots within this many metres of the pin of an address with no linked lot. CONSUMED by readLotMapLimits (lot-map.ts, the consumer lookup map read).'),
  ('parcel_map_neighbour_limit', 30, NULL, 'MF-53: the most neighbour lots drawn around an address with no linked lot, nearest first (at most 50). CONSUMED by readLotMapLimits (lot-map.ts, the consumer lookup map read).')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches migrations 301 and 303).
-- DELETE FROM logic_variables WHERE variable_key = 'parcel_map_neighbour_radius_m';
-- DELETE FROM logic_variables WHERE variable_key = 'parcel_map_neighbour_limit';
