// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md + 71/72/73 + 75 §11
//
// Single import surface for src/features/leads/ consumers.
//
// Re-exports the DB-adjacent shapes from @/lib/permits/types (added in Phase
// 1a) and defines the lib-local interfaces the 5 Phase 1b sub-WFs will
// produce. Defining all interfaces up front (even for sub-WFs not yet shipped)
// prevents type-surface churn between commits.

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
  // WF3 #3 (Spec 79 §7a Finding K, 2026-05-20): 'coa' added so cursor
  // tuples emitted by the 3-arm SQL parse cleanly on both server + mobile.
  // Mobile Zod schema parity required (mobile/src/lib/schemas.ts).
  lead_type: 'permit' | 'builder' | 'coa';
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
  // WF3 #3 — Spec 91 §3.1 filter param. 'all' = permit+builder+coa,
  // 'permit' = lead_id LIKE 'permit:%' only (excludes builders per
  // spec-literal lead-id-pattern read), 'coa' = lead_id LIKE 'coa:%' only.
  // Optional + defaulted at the Zod boundary to 'all'.
  lead_type?: 'permit' | 'coa' | 'all';
  // WF3 #3 killswitch — when true, omits the CoA UNION arm entirely from
  // the emitted SQL. Read from LEAD_FEED_DISABLE_COA env var at the route
  // boundary; default DISABLED (=true) until mobile CoA cards ship.
  disableCoa?: boolean;
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
  // P16 16E (Spec 80 §5.C, D5): attachment provenance of the trade match this feed row
  // rode in on. 'evidence' = direct tag/rule/narrow hit; 'inference' = the lean
  // scope-mapped complement (served BY BASIS at conf 0.50, ranked below equal-pillar
  // evidence via a relevance nudge). NULL on builder/coa rows + pre-P16 data.
  attachment_basis: 'evidence' | 'inference' | null;
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
  // Phase 3: target_window computed at mapRow from TRADE_TARGET_PHASE.
  // 'bid' = permit is before the trade's work_phase (go get on shortlists).
  // 'work' = permit has reached or passed the trade's work_phase (boots on the ground).
  target_window: 'bid' | 'work';
  // Phase 3: number of OTHER users who have saved this permit (competition signal).
  competition_count: number;
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

// WF3 #3 (Spec 79 §7a Finding K, 2026-05-20) — CoA lead branch per Spec 91
// §3 backend contract. Shape mirrors the proven COA_LEAD_DETAIL_SQL (lead-
// detail-query.ts:271-320 + Spec 42 §6.11 Phase C). is_saved + competition_
// count are read-path only: mig 070 CHECK constraint blocks lead_type='coa'
// writes, so both default to false/0 until the CoA-write WF lands.
export interface CoaLeadFeedItem extends LeadFeedItemBase {
  lead_type: 'coa';
  application_number: string;
  work_description: string | null;
  street_num: string | null;
  street_name: string | null;
  latitude: number | null;
  longitude: number | null;
  neighbourhood_name: string | null;
  estimated_cost: number | null;
  modeled_gfa_sqm: number | null;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  // CoA-specific signal — 0–1 probability sourced from trade_forecasts (Phase
  // F.1). Drives Spec 91 §3.5 5-bar render. Scoped to CoA-only in this WF
  // (Finding H — permit-branch bid_value is a follow-up).
  bid_value: number | null;
  target_window: 'bid' | 'work' | null;
  predicted_start: string | null;
}

export type LeadFeedItem = PermitLeadFeedItem | BuilderLeadFeedItem | CoaLeadFeedItem;

export interface LeadFeedResult {
  data: LeadFeedItem[];
  meta: {
    next_cursor: LeadFeedCursor | null;
    count: number;
    radius_km: number;
  };
}
