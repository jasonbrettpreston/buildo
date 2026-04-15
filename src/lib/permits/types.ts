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
  location: unknown | null;
  photo_url: string | null;
  // Lifecycle phase classification (migration 085, WF2 2026-04-11).
  // See docs/reports/lifecycle_phase_implementation.md §1 for the
  // 24-value enum domain. NULL = dead state or out of scope.
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  lifecycle_classified_at: Date | null;
  // Immutable anchor: when the permit entered its current lifecycle_phase.
  // Only updated by the classifier when lifecycle_phase actually changes
  // (not every run). NULL = not yet classified or pre-backfill.
  // Migration 086, Phase 1 of predictive timing.
  phase_started_at: Date | null;
}

// ---------------------------------------------------------------------------
// Lead Views (migration 070 — corrected shape per spec 70)
// ---------------------------------------------------------------------------
export type LeadType = 'permit' | 'builder';

export interface LeadView {
  id: number;
  user_id: string;
  lead_key: string;
  lead_type: LeadType;
  permit_num: string | null;
  revision_num: string | null;
  entity_id: number | null;
  trade_slug: string;
  viewed_at: Date;
  saved: boolean;
}

// ---------------------------------------------------------------------------
// Cost estimates (migration 071 — spec 72)
// ---------------------------------------------------------------------------
export type CostSource = 'permit' | 'model' | 'none'; // 'none' = zero-total surgical bypass (spec 83 §3 Step D)
export type CostTier = 'small' | 'medium' | 'large' | 'major' | 'mega';

export interface CostEstimate {
  permit_num: string;
  revision_num: string;
  estimated_cost: number | null;
  cost_source: CostSource;
  cost_tier: CostTier | null;
  cost_range_low: number | null;
  cost_range_high: number | null;
  premium_factor: number | null;
  complexity_score: number | null;
  model_version: number;
  computed_at: Date;
  // WF3-06: Geometric Truth fields required for Spec 83 frontend
  // (Trade Slicer + Geometric Override badge). Columns added in
  // migrations 089 (trade_contract_values) and 091 (is_geometric_override,
  // modeled_gfa_sqm). All three are NOT NULL in DB except modeled_gfa_sqm
  // (DECIMAL, nullable when no geometric data available).
  is_geometric_override: boolean;
  modeled_gfa_sqm: number | null;
  trade_contract_values: Record<string, number>;
  // Spec 83 §2 — surgical effective work area (Step B result). Added in migration 096.
  effective_area_sqm?: number | null;
}

// ---------------------------------------------------------------------------
// Inspection stage map + timing calibration (migrations 072/073 — spec 71)
// ---------------------------------------------------------------------------
export type StageRelationship = 'follows' | 'concurrent';

export interface InspectionStageMapRow {
  id: number;
  stage_name: string;
  stage_sequence: number;
  trade_slug: string;
  relationship: StageRelationship;
  min_lag_days: number;
  max_lag_days: number;
  precedence: number;
}

export interface TimingCalibrationRow {
  id: number;
  permit_type: string;
  median_days_to_first_inspection: number;
  p25_days: number;
  p75_days: number;
  sample_size: number;
  computed_at: Date;
}

// ---------------------------------------------------------------------------
// User profile (migration 075)
// ---------------------------------------------------------------------------
export interface UserProfile {
  user_id: string; // Firebase UID
  trade_slug: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
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
// Entity (Corporate Identity Hub — replaces builders table)
// ---------------------------------------------------------------------------
export type EntityType = 'Corporation' | 'Individual';
export type ProjectRole = 'Builder' | 'Architect' | 'Applicant' | 'Owner' | 'Agent' | 'Engineer';

export interface Entity {
  id: number;
  legal_name: string;
  trade_name: string | null;
  name_normalized: string;
  entity_type: EntityType | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  linkedin_url: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  is_wsib_registered: boolean;
  permit_count: number;
  first_seen_at: Date;
  last_seen_at: Date;
  last_enriched_at: Date | null;
  photo_url: string | null;
  photo_validated_at: Date | null;
}

export interface EntityProject {
  id: number;
  entity_id: number;
  permit_num: string | null;
  revision_num: string | null;
  coa_file_num: string | null;
  role: ProjectRole;
  observed_at: Date;
}

/** @deprecated Use Entity instead. Kept for backward compatibility. */
export type Builder = Entity;

// ---------------------------------------------------------------------------
// Product classification
// ---------------------------------------------------------------------------
export interface ProductGroup {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface ProductMatch {
  permit_num: string;
  revision_num: string;
  product_id: number;
  product_slug: string;
  product_name: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Inspection stages (scraped from AIC portal)
// ---------------------------------------------------------------------------
export interface Inspection {
  id?: number;
  permit_num: string;
  stage_name: string;
  status: 'Outstanding' | 'Passed' | 'Not Passed' | 'Partial';
  inspection_date: string | null;
  scraped_at: string;
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
  project_type?: string;
  scope_tags?: string[];
  min_cost?: number;
  max_cost?: number;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
