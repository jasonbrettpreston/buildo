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
  created_at: Date;
}

export interface PermitParcel {
  id: number;
  permit_num: string;
  revision_num: string;
  parcel_id: number;
  match_type: string;
  confidence: number;
  linked_at: Date;
}

export interface ParcelMatchResult {
  parcel_id: number;
  match_type: 'exact_address' | 'name_only';
  confidence: number;
}

export interface LotDimensions {
  frontage_m: number;
  depth_m: number;
}

export interface ParsedAddress {
  num: string;
  street_name: string;
  street_type: string;
}
