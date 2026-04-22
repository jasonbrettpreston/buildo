// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md + 71/72/73 + 75 §11
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
  // Phase 3-iii synthetic timing display string. Computed at the mapRow
  // boundary in get-lead-feed.ts from `timing_confidence`. The full
  // spec-71 3-tier engine output is deferred to the detail-view phase
  // and overlaid via the useLeadView mutation response — no schema
  // change needed when that lands.
  timing_display: string;
  // Phase 3-vi: saved-state for the current user. Pre-fix, the
  // SaveButton.initialSaved prop defaulted to false because this
  // field didn't exist — every refetch / page reload reset every
  // heart in the feed regardless of what lead_views.saved said
  // server-side. Sourced via LEFT JOIN to lead_views in
  // get-lead-feed.ts (COALESCE/bool_or to false for unviewed leads).
  is_saved: boolean;
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
  // Phase 3-iii widened columns. neighbourhood_name comes from a LEFT JOIN
  // (NULL when the geocoder didn't bucket the permit). cost_tier and
  // estimated_cost come from cost_estimates (NULL when no cached estimate).
  neighbourhood_name: string | null;
  cost_tier: 'small' | 'medium' | 'large' | 'major' | 'mega' | null;
  estimated_cost: number | null;
  // Lifecycle phase classification (migration 085, WF2 2026-04-11).
  // Drives the timing_display label on the card via
  // displayLifecyclePhase(). NULL = dead state or not yet classified.
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
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
  // Phase 3-iii widened columns. active_permits_nearby is the COUNT from
  // the builder CTE (the WHERE filters to status IN
  // ('Permit Issued','Inspection') so the count IS already of active
  // permits — name is accurate). avg_project_cost is the FILTER'd AVG
  // (NULL when the builder has zero costed permits in radius).
  // wsib_registered intentionally absent: the current builder CTE WHERE
  // requires a WSIB row, so every builder in the feed is registered —
  // a column would always be `true`. Add when the feed widens to
  // include non-WSIB builders.
  active_permits_nearby: number;
  avg_project_cost: number | null;
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
