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
