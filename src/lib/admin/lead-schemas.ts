// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §2.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1 + §3.3.1
//             docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//
// Web-admin-owned Zod copies of the four schemas Cycle 4 inspects. The
// canonical source-of-truth lives at `mobile/src/lib/schemas.ts`; this
// file mirrors it byte-for-byte for the four shapes used by the admin
// Lead Detail / Flight Job Detail Inspectors + Flight Center search.
//
// Why a copy and not an import? The web tsconfig at the project root
// excludes `mobile/` (`"exclude": ["mobile"]`) so the two app surfaces
// don't pull each other's bundles. Spec 76 §2.4 deferred this mechanism
// to plan-lock; Cycle 4 chose the wrapper-module route to preserve
// bundle isolation and added a contract drift test (Spec 76 Phase 0)
// that imports BOTH schemas at vitest runtime and asserts equivalent
// accept/reject on a shared fixture set — schema divergence fails the
// drift test, never silently ships.
//
// Field-by-field diff vs. mobile schema (last verified 2026-05-06):
//   FlightBoardItem    : permit_num, revision_num, address, lifecycle_phase
//                        (nullable), lifecycle_stalled, predicted_start
//                        (nullable ISO date), p25_days, p75_days
//                        (nullable), temporal_group (3-enum), updated_at
//   FlightBoardDetail  : alias of FlightBoardItem (mobile schemas:144)
//   LeadDetail         : 18 fields per Spec 91 §4.3.1 — see schema below
//   SearchResultItem   : permit_num, revision_num, address,
//                        lifecycle_phase (nullable), status (nullable)

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Flight Board (Spec 77 §3.2 list, §3.3.1 detail)
// ---------------------------------------------------------------------------

export const FlightBoardItemSchema = z.object({
  permit_num: z.string(),
  revision_num: z.string(),
  address: z.string(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  predicted_start: z.string().nullable(),
  p25_days: z.number().nullable(),
  p75_days: z.number().nullable(),
  temporal_group: z.enum(['action_required', 'departing_soon', 'on_the_horizon']),
  updated_at: z.string(),
});

export type FlightBoardItem = z.infer<typeof FlightBoardItemSchema>;

export const FlightBoardResultSchema = z.object({
  data: z.array(FlightBoardItemSchema),
});

export type FlightBoardResult = z.infer<typeof FlightBoardResultSchema>;

// FlightBoardDetail is identical-shape to FlightBoardItem per the mobile
// schema alias (mobile schemas.ts:144). Reasserted here so callsites can
// import the *Detail name without indirecting through the alias chain.
export const FlightBoardDetailSchema = FlightBoardItemSchema;

export type FlightBoardDetail = z.infer<typeof FlightBoardDetailSchema>;

// ---------------------------------------------------------------------------
// Lead Detail (Spec 91 §4.3.1 — single-lead detail screen contract)
// ---------------------------------------------------------------------------

export const LeadDetailLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const LeadDetailCostSchema = z.object({
  estimated: z.number().nullable(),
  tier: z.string().nullable(),
  range_low: z.number().nullable(),
  range_high: z.number().nullable(),
  modeled_gfa_sqm: z.number().nullable(),
});

export const LeadDetailNeighbourhoodSchema = z.object({
  name: z.string().nullable(),
  avg_household_income: z.number().nullable(),
  median_household_income: z.number().nullable(),
  period_of_construction: z.string().nullable(),
});

export const LeadDetailSchema = z.object({
  lead_id: z.string(),
  lead_type: z.enum(['permit', 'coa']),
  permit_num: z.string().nullable(),
  revision_num: z.string().nullable(),
  address: z.string(),
  location: LeadDetailLocationSchema.nullable(),
  work_description: z.string().nullable(),
  applicant: z.string().nullable(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  target_window: z.enum(['bid', 'work']).nullable(),
  opportunity_score: z.number().nullable(),
  competition_count: z.number().int().nonnegative(),
  predicted_start: z.string().nullable(),
  p25_days: z.number().nullable(),
  p75_days: z.number().nullable(),
  cost: LeadDetailCostSchema.nullable(),
  neighbourhood: LeadDetailNeighbourhoodSchema.nullable(),
  updated_at: z.string(),
  is_saved: z.boolean(),
});

export type LeadDetailLocation = z.infer<typeof LeadDetailLocationSchema>;
export type LeadDetailCost = z.infer<typeof LeadDetailCostSchema>;
export type LeadDetailNeighbourhood = z.infer<typeof LeadDetailNeighbourhoodSchema>;
export type LeadDetail = z.infer<typeof LeadDetailSchema>;

// ---------------------------------------------------------------------------
// Global permit search (Spec 77 §3.1 FAB search-and-claim)
// ---------------------------------------------------------------------------

export const SearchResultItemSchema = z.object({
  permit_num: z.string(),
  revision_num: z.string(),
  address: z.string(),
  lifecycle_phase: z.string().nullable(),
  status: z.string().nullable(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResultSchema = z.object({
  data: z.array(SearchResultItemSchema),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

// ---------------------------------------------------------------------------
// Admin Lead Inspect — diagnostic surface (Spec 76 §3.5 Cycle 7 amendment)
// ---------------------------------------------------------------------------
//
// The admin-only diagnostic shape returned by GET /api/admin/leads/inspect/:id.
// Mirrors the field-coverage matrix in scripts/quality/assert-global-coverage.js
// (step 27 of permits chain) so an operator can audit every input that
// produced any output for a given permit. Does NOT replace LeadDetailSchema —
// the public /api/leads/detail/:id contract (mobile-shared) stays unchanged
// per Cross-Domain Scenario B.
//
// 8 panels, organized by chain step group:
//   1. Identity — lead_id / type
//   2. Source (step 2/4) — permit + enriched_status + city-reported cost
//   3. Scope (step 5) — project_type + scope_tags
//   4. Trades (step 13) — every permit_trades row + confidence + fallback flag
//   5. Entity (steps 6-7) — matched entity + WSIB
//   6. Spatial (steps 8-11) — parcel + massing + neighbourhood
//   7. Cost (step 14) — Surgical Triangle inputs + Liar's Gate decision
//   8. Lifecycle (step 21) — phase / stalled / classified_at
//   9. Forecast (steps 23-24) — per-trade target_window/urgency/score/slice
//  10. Engagement — competition_count + saved_by_admin

export const LeadInspectSourceSchema = z.object({
  permit_num: z.string().nullable(),
  revision_num: z.string().nullable(),
  permit_type: z.string().nullable(),
  structure_type: z.string().nullable(),
  status: z.string().nullable(),
  enriched_status: z.string().nullable(),
  address: z.object({
    street_num: z.string().nullable(),
    street_name: z.string().nullable(),
    street_type: z.string().nullable(),
    full: z.string(),
  }),
  location: LeadDetailLocationSchema.nullable(),
  application_date: z.string().nullable(),
  issued_date: z.string().nullable(),
  completed_date: z.string().nullable(),
  work: z.string().nullable(),
  description: z.string().nullable(),
  builder_name: z.string().nullable(),
  owner: z.string().nullable(),
  est_const_cost: z.number().nullable(),
  last_seen_at: z.string(),
  first_seen_at: z.string(),
});

export const LeadInspectScopeSchema = z.object({
  project_type: z.string().nullable(),
  scope_tags: z.array(z.string()),
});

export const LeadInspectTradeRowSchema = z.object({
  trade_id: z.number(),
  trade_slug: z.string(),
  confidence: z.number(),
  /** True when confidence === 0.55 (default tag-trade-matrix fallback signaling no permit-specific signal — the DST/ZARA over-classification pattern). */
  is_default_fallback: z.boolean(),
});

export const LeadInspectEntitySchema = z.object({
  matched: z.boolean(),
  legal_name: z.string().nullable(),
  name_normalized: z.string().nullable(),
  wsib_registered: z.boolean().nullable(),
});

export const LeadInspectSpatialSchema = z.object({
  parcel: z
    .object({
      id: z.number().nullable(),
      area_sqm: z.number().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    })
    .nullable(),
  massing: z
    .object({
      area_sqm: z.number().nullable(),
      height_m: z.number().nullable(),
      stories: z.number().nullable(),
    })
    .nullable(),
  neighbourhood: z
    .object({
      id: z.number().nullable(),
      name: z.string().nullable(),
      avg_household_income: z.number().nullable(),
      period_of_construction: z.string().nullable(),
    })
    .nullable(),
});

export const LeadInspectCostInputsSchema = z.object({
  lot_size_sqm: z.number().nullable(),
  footprint_area_sqm: z.number().nullable(),
  height_m: z.number().nullable(),
  stories: z.number().nullable(),
  permit_type_allocation_pct: z.number().nullable(),
  structure_complexity_factor: z.number().nullable(),
  neighbourhood_premium_tier: z.string().nullable(),
});

export const LeadInspectLiarGateSchema = z.object({
  modeled_total: z.number().nullable(),
  reported_total: z.number().nullable(),
  ratio: z.number().nullable(),
  /** Which Liar's Gate path triggered (Spec 83 §3D). null when no cost_estimates row exists. */
  path: z.enum(['surgical_only', 'proportional_slicing', 'none']).nullable(),
});

export const LeadInspectCostSchema = z.object({
  cost_source: z.enum(['permit', 'model', 'none']).nullable(),
  is_geometric_override: z.boolean().nullable(),
  /** TOTAL project cost — clearly distinguished from per-trade slice. */
  estimated_cost_total: z.number().nullable(),
  modeled_gfa_sqm: z.number().nullable(),
  /** Per-trade JSONB from cost_estimates.trade_contract_values. */
  trade_contract_values: z.record(z.string(), z.number()).nullable(),
  inputs: LeadInspectCostInputsSchema,
  liar_gate: LeadInspectLiarGateSchema,
});

// WF1 #B 2026-05-09 — lifecycle.timeline[] entry schema. Same shape for
// past/present/future entries; status field discriminates them.
export const LeadInspectTimelineEntrySchema = z.object({
  phase: z.string(),
  phase_name: z.string().nullable(),
  status: z.enum(['completed', 'current', 'upcoming']),
  entered_at: z.string().nullable(),
  exited_at: z.string().nullable(),
  days_in_phase: z.number().nullable(),
  cohort_median_days: z.number().nullable(),
  cohort_p25_days: z.number().nullable(),
  cohort_p75_days: z.number().nullable(),
  cohort_sample_size: z.number(),
});

export const LeadInspectLifecycleSchema = z.object({
  phase: z.string().nullable(),
  // WF1 #B 2026-05-09 — friendly name for the current phase from the
  // PHASE_NAMES map (Spec 84 §3); null if phase code unknown.
  phase_name: z.string().nullable(),
  stalled: z.boolean(),
  classified_at: z.string().nullable(),
  phase_started_at: z.string().nullable(),
  // WF1 #B 2026-05-09 — sugar fields derived from the timeline.
  current_phase_days_in: z.number().nullable(),
  predicted_remaining_days: z.number().nullable(),
  predicted_completion_at: z.string().nullable(),
  timeline: z.array(LeadInspectTimelineEntrySchema),
});

export const LeadInspectForecastRowSchema = z.object({
  trade_slug: z.string(),
  target_window: z.enum(['bid', 'work']).nullable(),
  urgency: z.string().nullable(),
  predicted_start: z.string().nullable(),
  p25_days: z.number().nullable(),
  p75_days: z.number().nullable(),
  opportunity_score: z.number().nullable(),
  /** Per-trade dollar slice from cost_estimates.trade_contract_values[trade_slug]. */
  trade_slice_dollar: z.number().nullable(),
});

export const LeadInspectEngagementSchema = z.object({
  competition_count: z.number().int().nonnegative(),
  saved_by_admin: z.boolean(),
});

export const LeadInspectSchema = z.object({
  lead_id: z.string(),
  lead_type: z.enum(['permit', 'coa']),
  source: LeadInspectSourceSchema,
  scope: LeadInspectScopeSchema,
  trades: z.array(LeadInspectTradeRowSchema),
  entity: LeadInspectEntitySchema.nullable(),
  spatial: LeadInspectSpatialSchema,
  cost: LeadInspectCostSchema.nullable(),
  lifecycle: LeadInspectLifecycleSchema,
  forecast: z.array(LeadInspectForecastRowSchema),
  engagement: LeadInspectEngagementSchema,
  updated_at: z.string(),
});

export type LeadInspectSource = z.infer<typeof LeadInspectSourceSchema>;
export type LeadInspectScope = z.infer<typeof LeadInspectScopeSchema>;
export type LeadInspectTradeRow = z.infer<typeof LeadInspectTradeRowSchema>;
export type LeadInspectEntity = z.infer<typeof LeadInspectEntitySchema>;
export type LeadInspectSpatial = z.infer<typeof LeadInspectSpatialSchema>;
export type LeadInspectCost = z.infer<typeof LeadInspectCostSchema>;
export type LeadInspectLifecycle = z.infer<typeof LeadInspectLifecycleSchema>;
export type LeadInspectForecastRow = z.infer<typeof LeadInspectForecastRowSchema>;
export type LeadInspectEngagement = z.infer<typeof LeadInspectEngagementSchema>;
export type LeadInspect = z.infer<typeof LeadInspectSchema>;
