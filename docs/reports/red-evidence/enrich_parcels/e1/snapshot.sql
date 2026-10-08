-- E1 / B1 bound 3 (restated) — per-parcel snapshot of the 35 written zoning columns, taken right
-- BEFORE and right AFTER the heal --full capture. Read-only. Output TSV:
--   id, the 9 E1 columns as text (NULL = \N), md5 of the 26 other written zoning columns.
-- zoning_enriched_at is excluded (run-clock stamp, declared_drift).
BEGIN READ ONLY;
COPY (
  SELECT id,
    bylaw_max_units::text, bylaw_max_density::text, bylaw_pct_commercial_max::text, bylaw_pct_residential_max::text,
    bylaw_pct_employment_max::text, bylaw_pct_office_max::text, bylaw_min_frontage_m::text, bylaw_min_area_sqm::text,
    bylaw_standard_setback_m::text,
    md5(concat_ws('|', zoning_class, zoning_zn_string, zoning_gen_zone, zoning_holding, zone_status, exception_number,
      exception_text, bylaw_chapter, bylaw_section, bylaw_exception_ref, bylaw_max_fsi::text, bylaw_max_coverage_pct::text,
      bylaw_max_height_m::text, bylaw_max_stories::text, in_policy_area::text, on_policy_road::text,
      in_rooming_house_overlay::text, in_parking_zone_overlay::text, in_building_setback_overlay::text,
      on_priority_retail::text, in_queenstw_eat_overlay::text, zoning_overlays::text, zoning_base_source_id::text,
      zoning_dominant_area_share::text, zoning_is_ambiguous::text, zoning_base_source_dataset_version::text,
      -- concat_ws drops NULLs; tag each slot so NULL vs '' cannot collide
      (zoning_class IS NULL)::text || (exception_number IS NULL)::text || (bylaw_max_fsi IS NULL)::text))
  FROM parcels WHERE geom IS NOT NULL ORDER BY id
) TO STDOUT;
ROLLBACK;
