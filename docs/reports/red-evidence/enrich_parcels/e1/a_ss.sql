-- E1 — STAND_SET direction (feeds the max-build front setback). Read-only.
BEGIN READ ONLY;
SELECT CASE WHEN upper(p.zoning_class) IN ('R','RD','RS','RT','RM') THEN 'residential' ELSE 'other' END AS family,
  count(*) FILTER (WHERE p.bylaw_standard_setback_m IS NOT NULL AND z.standard_setback IS NULL) AS to_null,
  count(*) FILTER (WHERE p.bylaw_standard_setback_m > z.standard_setback) AS to_smaller,
  count(*) FILTER (WHERE p.bylaw_standard_setback_m < z.standard_setback) AS to_larger,
  min(p.zoning_dominant_area_share) FILTER (WHERE p.bylaw_standard_setback_m IS DISTINCT FROM z.standard_setback) AS min_share
FROM parcels p JOIN zoning_bylaw_areas z ON z.source_id = p.zoning_base_source_id
WHERE p.geom IS NOT NULL GROUP BY 1 ORDER BY 1;
ROLLBACK;
