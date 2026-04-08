// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md + 71/72/73 + 75 §11
//
// Single import surface for src/features/leads/ consumers.
//
// Re-exports the DB-adjacent shapes from @/lib/permits/types (added in Phase
// 1a) and defines the lib-local interfaces the 5 Phase 1b sub-WFs will
// produce. Defining all interfaces up front (even for sub-WFs not yet shipped)
// prevents type-surface churn between commits.

// ---------------------------------------------------------------------------
// Re-exports from Phase 1a schema types
// ---------------------------------------------------------------------------
export type {
  CostEstimate,
  CostSource,
  CostTier,
  InspectionStageMapRow,
  LeadType,
  LeadView,
  StageRelationship,
  TimingCalibrationRow,
} from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Timing engine (Phase 1b-ii) — from spec 71 §4 Outputs
// ---------------------------------------------------------------------------
export interface TradeTimingEstimate {
  confidence: 'high' | 'medium' | 'low';
  tier: 1 | 2 | 3;
  min_days: number;
  max_days: number;
  display: string;
}

// ---------------------------------------------------------------------------
// Builder leads (Phase 1b-iii) — from spec 73 §Implementation
// ---------------------------------------------------------------------------
export interface BuilderLeadCandidate {
  entity_id: number;
  legal_name: string;
  trade_name: string | null;
  business_size: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  photo_url: string | null;
  is_wsib_registered: boolean;
  active_permits_nearby: number;
  closest_permit_m: number;
  avg_project_cost: number | null;
  proximity_score: number;
  activity_score: number;
  contact_score: number;
  fit_score: number;
  relevance_score: number;
}

// ---------------------------------------------------------------------------
// Unified feed (Phase 1b-iii) — from spec 70 §Implementation
// ---------------------------------------------------------------------------
export interface LeadFeedCursor {
  score: number;
  lead_type: 'permit' | 'builder';
  lead_id: string;
}

export interface LeadFeedInput {
  user_id: string;
  trade_slug: string;
  lat: number;
  lng: number;
  radius_km: number;
  cursor?: LeadFeedCursor;
  limit: number;
}

export interface LeadFeedItem {
  lead_type: 'permit' | 'builder';
  lead_id: string;
  // Permit-specific (null for builder)
  permit_num: string | null;
  revision_num: string | null;
  status: string | null;
  permit_type: string | null;
  description: string | null;
  street_num: string | null;
  street_name: string | null;
  // Builder-specific (null for permit)
  entity_id: number | null;
  legal_name: string | null;
  business_size: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  photo_url: string | null;
  // Shared
  latitude: number | null;
  longitude: number | null;
  distance_m: number;
  proximity_score: number;
  timing_score: number;
  value_score: number;
  opportunity_score: number;
  relevance_score: number;
}

export interface LeadFeedResult {
  data: LeadFeedItem[];
  meta: {
    next_cursor: LeadFeedCursor | null;
    count: number;
    radius_km: number;
  };
}
