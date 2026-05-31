export interface Parcel {
  id: number;
  parcel_id: string;
  feature_type: string | null;
  address_number: string | null;
  linear_name_full: string | null;
  addr_num_normalized: string | null;
  street_name_normalized: string | null;
  street_type_normalized: string | null;
  stated_area_raw: string | null;
  lot_size_sqm: number | null;
  lot_size_sqft: number | null;
  frontage_m: number | null;
  frontage_ft: number | null;
  depth_m: number | null;
  depth_ft: number | null;
  geometry: Record<string, unknown> | null;
  date_effective: Date | null;
  date_expiry: Date | null;
  is_irregular: boolean | null;
  created_at: Date;
  // Spec 65 (enrich-parcels.js) zoning by-law feed — all nullable (migration 165).
  zoning_class: string | null;
  zoning_zn_string: string | null;
  zoning_gen_zone: number | null;
  zoning_holding: string | null;
  zone_status: number | null;
  bylaw_max_fsi: number | null;
  bylaw_max_coverage_pct: number | null;
  bylaw_max_height_m: number | null;
  bylaw_max_stories: number | null;
  bylaw_max_units: number | null;
  bylaw_max_density: number | null;
  bylaw_min_frontage_m: number | null;
  bylaw_min_area_sqm: number | null;
  bylaw_standard_setback_m: number | null;
  bylaw_pct_commercial_max: number | null;
  bylaw_pct_residential_max: number | null;
  bylaw_pct_employment_max: number | null;
  bylaw_pct_office_max: number | null;
  exception_number: number | null;
  exception_text: string | null;
  bylaw_chapter: string | null;
  bylaw_section: string | null;
  bylaw_exception_ref: string | null;
  in_policy_area: boolean | null;
  on_policy_road: boolean | null;
  in_rooming_house_overlay: boolean | null;
  in_parking_zone_overlay: boolean | null;
  in_building_setback_overlay: boolean | null;
  on_priority_retail: boolean | null;
  in_queenstw_eat_overlay: boolean | null;
  zoning_overlays: Record<string, unknown> | null;
  zoning_base_source_id: number | null;
  zoning_dominant_area_share: number | null;
  zoning_is_ambiguous: boolean | null;
  zoning_base_source_dataset_version: Date | null;
  zoning_enriched_at: Date | null;
}


export interface LotDimensions {
  frontage_m: number;
  depth_m: number;
  polygon_area_sqm: number | null;
  is_irregular: boolean;
}

export interface ParsedAddress {
  num: string;
  street_name: string;
  street_type: string;
}
