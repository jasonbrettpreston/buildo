// ---------------------------------------------------------------------------
// Raw record shape coming straight from the Toronto Open Data JSON feed
// ---------------------------------------------------------------------------
export interface RawPermitRecord {
  PERMIT_NUM: string;
  REVISION_NUM: string;
  PERMIT_TYPE: string;
  STRUCTURE_TYPE: string;
  WORK: string;
  STREET_NUM: string;
  STREET_NAME: string;
  STREET_TYPE: string;
  STREET_DIRECTION: string;
  CITY: string;
  POSTAL: string;
  GEO_ID: string;
  BUILDING_TYPE: string;
  CATEGORY: string;
  APPLICATION_DATE: string;
  ISSUED_DATE: string;
  COMPLETED_DATE: string;
  STATUS: string;
  DESCRIPTION: string;
  EST_CONST_COST: string;
  BUILDER_NAME: string;
  OWNER: string;
  DWELLING_UNITS_CREATED: string;
  DWELLING_UNITS_LOST: string;
  WARD: string;
  COUNCIL_DISTRICT: string;
  CURRENT_USE: string;
  PROPOSED_USE: string;
  HOUSING_UNITS: string;
  STOREYS: string;
}

// ---------------------------------------------------------------------------
// Database model (snake_case, cleaned types)
// ---------------------------------------------------------------------------
export interface Permit {
  permit_num: string;
  revision_num: string;
  permit_type: string;
  structure_type: string;
  work: string;
  street_num: string;
  street_name: string;
  street_type: string;
  street_direction: string | null;
  city: string;
  postal: string;
  geo_id: string;
  building_type: string;
  category: string;
  application_date: Date | null;
  issued_date: Date | null;
  completed_date: Date | null;
  status: string;
  description: string;
  est_const_cost: number | null;
  builder_name: string;
  owner: string;
  dwelling_units_created: number;
  dwelling_units_lost: number;
  ward: string;
  council_district: string;
  current_use: string;
  proposed_use: string;
  housing_units: number;
  storeys: number;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: Date | null;
  data_hash: string;
  first_seen_at: Date;
  last_seen_at: Date;
  neighbourhood_id: number | null;
  raw_json: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Change tracking
// ---------------------------------------------------------------------------
export interface PermitChange {
  permit_num: string;
  revision_num: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------
export interface SyncRun {
  id: number;
  started_at: Date;
  completed_at: Date | null;
  status: string;
  records_total: number;
  records_new: number;
  records_updated: number;
  records_unchanged: number;
  records_errors: number;
  error_message: string | null;
  snapshot_path: string | null;
  duration_ms: number | null;
}

export interface SyncStats {
  total: number;
  new_count: number;
  updated: number;
  unchanged: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Trade classification
// ---------------------------------------------------------------------------
export interface Trade {
  id: number;
  slug: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface TradeMatch {
  permit_num: string;
  revision_num: string;
  trade_id: number;
  trade_slug: string;
  trade_name: string;
  tier: number;
  confidence: number;
  is_active: boolean;
  phase: string;
  lead_score: number;
}

export interface TradeMappingRule {
  id: number;
  trade_id: number;
  tier: number;
  match_field: string;
  match_pattern: string;
  confidence: number;
  phase_start: number | null;
  phase_end: number | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export interface Builder {
  id: number;
  name: string;
  name_normalized: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  obr_business_number: string | null;
  wsib_status: string | null;
  permit_count: number;
  first_seen_at: Date;
  last_seen_at: Date;
  enriched_at: Date | null;
}

// ---------------------------------------------------------------------------
// Filter / query params
// ---------------------------------------------------------------------------
export interface PermitFilter {
  status?: string;
  permit_type?: string;
  structure_type?: string;
  work?: string;
  ward?: string;
  trade_slug?: string;
  min_cost?: number;
  max_cost?: number;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
