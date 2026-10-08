-- E1 pre-registered prediction: per column, the parcels.id set whose stored value differs from the
-- own dominant base row (zoning_base_source_id). Read-only. Output: col<TAB>id per line.
BEGIN READ ONLY;
SELECT c.col, p.id
FROM parcels p
JOIN zoning_bylaw_areas z ON z.source_id = p.zoning_base_source_id
CROSS JOIN LATERAL (VALUES
  ('bylaw_max_units', p.bylaw_max_units::numeric, z.units_max::numeric),
  ('bylaw_max_density', p.bylaw_max_density::numeric, z.density_max::numeric),
  ('bylaw_pct_commercial_max', p.bylaw_pct_commercial_max::numeric, z.pct_commercial_max::numeric),
  ('bylaw_pct_residential_max', p.bylaw_pct_residential_max::numeric, z.pct_residential_max::numeric),
  ('bylaw_pct_employment_max', p.bylaw_pct_employment_max::numeric, z.pct_employment_max::numeric),
  ('bylaw_pct_office_max', p.bylaw_pct_office_max::numeric, z.pct_office_max::numeric),
  ('bylaw_min_frontage_m', p.bylaw_min_frontage_m::numeric, z.frontage_min_m::numeric),
  ('bylaw_min_area_sqm', p.bylaw_min_area_sqm::numeric, z.area_min_sqm::numeric),
  ('bylaw_standard_setback_m', p.bylaw_standard_setback_m::numeric, z.standard_setback::numeric)
) AS c(col, stored, own)
WHERE p.geom IS NOT NULL AND c.stored IS DISTINCT FROM c.own
ORDER BY c.col, p.id;
ROLLBACK;
