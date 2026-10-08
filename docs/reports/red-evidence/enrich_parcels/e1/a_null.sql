-- E1 — new NULLs (stored non-NULL -> own dominant row NULL) and NULL -> value, per column. Read-only.
BEGIN READ ONLY;
SELECT c.col,
  count(*) FILTER (WHERE c.stored IS NOT NULL AND c.own IS NULL) AS to_null,
  count(*) FILTER (WHERE c.stored IS NULL AND c.own IS NOT NULL) AS from_null,
  count(*) FILTER (WHERE c.stored IS NOT NULL AND c.own IS NOT NULL AND c.stored <> c.own) AS value_change
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
WHERE p.geom IS NOT NULL
GROUP BY c.col ORDER BY c.col;
ROLLBACK;
