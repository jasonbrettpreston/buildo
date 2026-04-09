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
//
// Discriminated union keyed on `tier`. Each tier has a fixed confidence level
// per spec 71, so making them independent fields was a footgun (impossible
// states like `{tier:1, confidence:'low'}` were representable). The DU
// guarantees consumers handle each tier explicitly via narrowing.
//
// Mapping per spec 71:
//   tier 1 (stage-based)        → 'high'   confidence
//   tier 2 (issued heuristic)   → 'medium' confidence
//   tier 3 (pre-permit)         → 'low'    confidence
//
// Exception: Tier 1 staleness fallback (>180d since latest passed inspection)
// downgrades to 'low' confidence per spec — represented as `tier: 1` with
// `confidence: 'low'`. To accommodate this, tier 1 allows both 'high' and
// 'low' confidence.

interface TradeTimingEstimateBase {
  min_days: number;
  max_days: number;
  display: string;
}

interface TradeTimingEstimateTier1 extends TradeTimingEstimateBase {
  tier: 1;
  confidence: 'high' | 'low'; // 'low' is the staleness fallback
}

interface TradeTimingEstimateTier2 extends TradeTimingEstimateBase {
  tier: 2;
  confidence: 'medium';
}

interface TradeTimingEstimateTier3 extends TradeTimingEstimateBase {
  tier: 3;
  confidence: 'low';
}

export type TradeTimingEstimate =
  | TradeTimingEstimateTier1
  | TradeTimingEstimateTier2
  | TradeTimingEstimateTier3;

// ---------------------------------------------------------------------------
// Unified feed (Phase 1b-iii) — from spec 70 §Implementation
// ---------------------------------------------------------------------------
//
// NOTE on legacy `BuilderLeadCandidate` type (removed 2026-04-09):
// The standalone builder-query.ts was deleted as dead code — no route
// called it, and its fit_score math diverged from get-lead-feed.ts's
// builder_candidates CTE per the Gemini deep-dive review. When the
// standalone builder page ships (Phase 5+), it should consume the
// unified feed path or build a fresh spec-70-aligned query; it should
// NOT revive the legacy divergent code.

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

// LeadFeedItem is a discriminated union on `lead_type`. The flat-with-nullable
// shape that the SQL UNION ALL produces is normalized into one of two
// branches at the mapRow boundary in get-lead-feed.ts. Phase 2 consumers and
// the UI narrow on `lead_type` and get type-safe access to the relevant
// fields without defensive null checks.

interface LeadFeedItemBase {
  lead_id: string;
  distance_m: number;
  proximity_score: number;
  timing_score: number;
  value_score: number;
  opportunity_score: number;
  relevance_score: number;
  // Semantic UI-display columns added in the Phase 0-3 comprehensive
  // review (Sonnet overall HIGH H1/H2). The Phase 1 feed SQL computes
  // these alongside the numeric pillars so Phase 3 cards can wire
  // TimingBadge + OpportunityBadge without a JS-side reclassification.
  timing_confidence: 'high' | 'medium' | 'low';
  opportunity_type: 'homeowner' | 'newbuild' | 'builder-led' | 'unknown';
}

export interface PermitLeadFeedItem extends LeadFeedItemBase {
  lead_type: 'permit';
  permit_num: string;
  revision_num: string;
  status: string | null;
  permit_type: string | null;
  description: string | null;
  street_num: string | null;
  street_name: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface BuilderLeadFeedItem extends LeadFeedItemBase {
  lead_type: 'builder';
  entity_id: number;
  legal_name: string;
  business_size: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  website: string | null;
  photo_url: string | null;
}

export type LeadFeedItem = PermitLeadFeedItem | BuilderLeadFeedItem;

export interface LeadFeedResult {
  data: LeadFeedItem[];
  meta: {
    next_cursor: LeadFeedCursor | null;
    count: number;
    radius_km: number;
  };
}
