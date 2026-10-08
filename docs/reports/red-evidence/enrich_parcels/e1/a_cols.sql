-- E1 (zoning parameters from the dominant label, Spec 69 R-ZV / M-42) — stored vs own dominant row.
-- Read-only. Per column: parcels whose stored value differs from the value on their own dominant
-- base row (parcels.zoning_base_source_id). Geom parcels only (pass-1 scope under --full).
BEGIN READ ONLY;
WITH j AS (
  SELECT p.id, p.zoning_class,
         p.bylaw_max_units, z.units_max, p.bylaw_max_density, z.density_max,
         p.bylaw_pct_commercial_max, z.pct_commercial_max, p.bylaw_pct_residential_max, z.pct_residential_max,
         p.bylaw_pct_employment_max, z.pct_employment_max, p.bylaw_pct_office_max, z.pct_office_max,
         p.bylaw_min_frontage_m, z.frontage_min_m, p.bylaw_min_area_sqm, z.area_min_sqm,
         p.bylaw_standard_setback_m, z.standard_setback
  FROM parcels p
  LEFT JOIN zoning_bylaw_areas z ON z.source_id = p.zoning_base_source_id
  WHERE p.geom IS NOT NULL AND p.zoning_base_source_id IS NOT NULL
)
SELECT
  count(*) FILTER (WHERE bylaw_max_units IS DISTINCT FROM units_max) AS units,
  count(*) FILTER (WHERE bylaw_max_density IS DISTINCT FROM density_max) AS density,
  count(*) FILTER (WHERE bylaw_pct_commercial_max IS DISTINCT FROM pct_commercial_max) AS pct_com,
  count(*) FILTER (WHERE bylaw_pct_residential_max IS DISTINCT FROM pct_residential_max) AS pct_res,
  count(*) FILTER (WHERE bylaw_pct_employment_max IS DISTINCT FROM pct_employment_max) AS pct_emp,
  count(*) FILTER (WHERE bylaw_pct_office_max IS DISTINCT FROM pct_office_max) AS pct_off,
  count(*) FILTER (WHERE bylaw_min_frontage_m IS DISTINCT FROM frontage_min_m) AS frontage,
  count(*) FILTER (WHERE bylaw_min_area_sqm IS DISTINCT FROM area_min_sqm) AS area,
  count(*) FILTER (WHERE bylaw_standard_setback_m IS DISTINCT FROM standard_setback) AS stand_set,
  count(*) FILTER (WHERE bylaw_max_units IS DISTINCT FROM units_max OR bylaw_max_density IS DISTINCT FROM density_max
      OR bylaw_pct_commercial_max IS DISTINCT FROM pct_commercial_max OR bylaw_pct_residential_max IS DISTINCT FROM pct_residential_max
      OR bylaw_pct_employment_max IS DISTINCT FROM pct_employment_max OR bylaw_pct_office_max IS DISTINCT FROM pct_office_max
      OR bylaw_min_frontage_m IS DISTINCT FROM frontage_min_m OR bylaw_min_area_sqm IS DISTINCT FROM area_min_sqm
      OR bylaw_standard_setback_m IS DISTINCT FROM standard_setback) AS any_diff,
  count(*) FILTER (WHERE upper(zoning_class) IN ('R','RD','RS','RT','RM') AND (bylaw_max_units IS DISTINCT FROM units_max OR bylaw_max_density IS DISTINCT FROM density_max
      OR bylaw_pct_commercial_max IS DISTINCT FROM pct_commercial_max OR bylaw_pct_residential_max IS DISTINCT FROM pct_residential_max
      OR bylaw_pct_employment_max IS DISTINCT FROM pct_employment_max OR bylaw_pct_office_max IS DISTINCT FROM pct_office_max
      OR bylaw_min_frontage_m IS DISTINCT FROM frontage_min_m OR bylaw_min_area_sqm IS DISTINCT FROM area_min_sqm
      OR bylaw_standard_setback_m IS DISTINCT FROM standard_setback)) AS any_diff_residential,
  count(*) AS zoned_geom_parcels
FROM j;
ROLLBACK;
