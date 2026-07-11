// Zod schemas mirroring Next.js API response types
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Zod Boundary
//
// Every fetch through apiClient.ts must parse the response through the
// relevant schema. A ZodError re-throws via the hook's `throwOnError: (err)
// => err instanceof ZodError` option — reaches the ErrorBoundary during
// render (schema drift is a contract bug, not a UX state). Network errors
// (ApiError/RateLimitError/NetworkError) stay in TanStack Query's `isError`
// state for inline handling (retry CTA / offline banner). This file is the
// single source of truth for what shape the mobile app will accept.
import { z } from 'zod';
import { CONTRACTS } from '@/constants/contracts';

// ---------------------------------------------------------------------------
// Shared score base (both lead types carry these fields)
// ---------------------------------------------------------------------------

const LeadScoreBaseSchema = z.object({
  lead_id: z.string(),
  distance_m: z.number(),
  proximity_score: z.number().nonnegative(),
  timing_score: z.number().nonnegative(),
  value_score: z.number().nonnegative(),
  opportunity_score: z.number().nonnegative(),
  relevance_score: z.number().nonnegative(),
  timing_confidence: z.enum(['high', 'medium', 'low']),
  opportunity_type: z.enum(['homeowner', 'newbuild', 'builder-led', 'unknown']),
  timing_display: z.string(),
  is_saved: z.boolean(),
});

// ---------------------------------------------------------------------------
// Permit lead
// ---------------------------------------------------------------------------

export const PermitLeadFeedItemSchema = LeadScoreBaseSchema.extend({
  lead_type: z.literal('permit'),
  permit_num: z.string().max(CONTRACTS.schema.permit_num_max),
  revision_num: z.string().max(CONTRACTS.schema.revision_num_max),
  status: z.string().nullable(),
  permit_type: z.string().nullable(),
  description: z.string().nullable(),
  street_num: z.string().nullable(),
  street_name: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  neighbourhood_name: z.string().nullable(),
  cost_tier: z.enum(['small', 'medium', 'large', 'major', 'mega']).nullable(),
  estimated_cost: z.number().nullable(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  target_window: z.enum(['bid', 'work']),
  competition_count: z.number().int().nonnegative(),
});

export type PermitLeadFeedItem = z.infer<typeof PermitLeadFeedItemSchema>;

// ---------------------------------------------------------------------------
// Builder lead
// ---------------------------------------------------------------------------

export const BuilderLeadFeedItemSchema = LeadScoreBaseSchema.extend({
  lead_type: z.literal('builder'),
  entity_id: z.number().int(),
  legal_name: z.string(),
  business_size: z.string().nullable(),
  primary_phone: z.string().nullable(),
  primary_email: z.string().nullable(),
  website: z.string().nullable(),
  photo_url: z.string().nullable(),
  active_permits_nearby: z.number().int().nonnegative(),
  avg_project_cost: z.number().nullable(),
});

export type BuilderLeadFeedItem = z.infer<typeof BuilderLeadFeedItemSchema>;

// ---------------------------------------------------------------------------
// CoA lead (WF3 #3, Spec 79 §7a Finding K, 2026-05-20 — Spec 91 §3 contract)
//
// Mirrors server CoaLeadFeedItem in src/features/leads/types.ts. is_saved +
// competition_count surface the read-path values from lead_views.lead_type='coa'
// (always false / 0 until the CoA-write WF lands because mig 070 CHECK blocks
// writes). bid_value is CoA-only in this WF (§10 fold #4); the permit-branch
// bid_value addition is queued as Finding H.
// ---------------------------------------------------------------------------

export const CoaLeadFeedItemSchema = LeadScoreBaseSchema.extend({
  lead_type: z.literal('coa'),
  application_number: z.string(),
  work_description: z.string().nullable(),
  street_num: z.string().nullable(),
  street_name: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  neighbourhood_name: z.string().nullable(),
  estimated_cost: z.number().nullable(),
  modeled_gfa_sqm: z.number().nullable(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  bid_value: z.number().nullable(),
  target_window: z.enum(['bid', 'work']).nullable(),
  predicted_start: z.string().nullable(),
});

export type CoaLeadFeedItem = z.infer<typeof CoaLeadFeedItemSchema>;

// ---------------------------------------------------------------------------
// Discriminated union: permit | builder | coa
// ---------------------------------------------------------------------------

export const LeadFeedItemSchema = z.discriminatedUnion('lead_type', [
  PermitLeadFeedItemSchema,
  BuilderLeadFeedItemSchema,
  CoaLeadFeedItemSchema,
]);

export type LeadFeedItem = z.infer<typeof LeadFeedItemSchema>;

// ---------------------------------------------------------------------------
// Feed cursor
//
// WF3 #3 Indep CRIT-1 fold: 'coa' added to the enum or any page where a CoA
// row is the last raw row would emit a next_cursor that fails this parse and
// crashes the feed via ErrorBoundary. Server `LeadFeedCursor.lead_type` and
// `cursor_lead_type` query-param enum mirror this change.
// ---------------------------------------------------------------------------

export const LeadFeedCursorSchema = z.object({
  score: z.number(),
  lead_type: z.enum(['permit', 'builder', 'coa']),
  lead_id: z.string(),
});

export type LeadFeedCursor = z.infer<typeof LeadFeedCursorSchema>;

// ---------------------------------------------------------------------------
// Full feed API response
// ---------------------------------------------------------------------------

export const LeadFeedResultSchema = z.object({
  data: z.array(LeadFeedItemSchema),
  meta: z.object({
    next_cursor: LeadFeedCursorSchema.nullable(),
    count: z.number().int().nonnegative().max(CONTRACTS.feed.max_limit),
    radius_km: z.number().nonnegative().max(CONTRACTS.geo.max_radius_km),
  }),
});

export type LeadFeedResult = z.infer<typeof LeadFeedResultSchema>;

// ---------------------------------------------------------------------------
// Flight Board item (Phase 5 — temporal CRM view per Spec 77)
// ---------------------------------------------------------------------------

export const FlightBoardItemSchema = z.object({
  permit_num: z.string(),
  revision_num: z.string(),
  address: z.string(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  predicted_start: z.string().nullable(), // ISO-8601 date string
  p25_days: z.number().nullable(),
  p75_days: z.number().nullable(),
  temporal_group: z.enum(['action_required', 'departing_soon', 'on_the_horizon']),
  // Spec 77 §3.2 + §3.3.1 — ISO 8601 timestamp from `permits.updated_at`,
  // drives the amber update flash via the `flightBoardSeenStore` MMKV map.
  updated_at: z.string(),
});

export type FlightBoardItem = z.infer<typeof FlightBoardItemSchema>;

export const FlightBoardResultSchema = z.object({
  data: z.array(FlightBoardItemSchema),
});

export type FlightBoardResult = z.infer<typeof FlightBoardResultSchema>;

// Flight Board Detail (Spec 77 §3.3.1 — single-permit cold-boot fallback).
// Identical shape to FlightBoardItem; aliased for callsite clarity.
export const FlightBoardDetailSchema = FlightBoardItemSchema;

export type FlightBoardDetail = z.infer<typeof FlightBoardDetailSchema>;

// ---------------------------------------------------------------------------
// Lead detail (Spec 91 §4.3.1 — single-lead detail screen contract)
// ---------------------------------------------------------------------------
// Mirrors `src/app/api/leads/detail/[id]/types.ts` LeadDetail interface
// byte-for-byte. is_saved was added by WF1-A Phase 1 (commit 657faf8) so
// the mobile SaveButton can render the optimistic-fill heart on cold-boot
// deep-link without depending on the feed cache.

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
// Global search result (Phase 5 — FAB permit search per Spec 77 §3.1)
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
// Consumer Parcel Cost Tool (Spec 100 §3 — mobile mirror of the server whitelist)
//
// Mirrors src/app/api/parcels/lookup/types.ts ConsumerParcelLookupResponse. The hook parses
// `raw.data` through ConsumerParcelLookupResultSchema. Tier-3 diagnostic `groups` are NOT part
// of the contract (Spec 100 §2.2); the server strips them and this schema never expects them.
// ---------------------------------------------------------------------------

export const ParcelCostLineSchema = z
  .object({
    total: z.number().nullable().optional(),
    per_sqm: z.number().nullable().optional(),
    area: z.number().nullable().optional(),
    area_confidence: z.string().nullable().optional(),
    norm_basis: z.string().nullable().optional(),
    fits: z.boolean().optional(),
  })
  .passthrough();
export type ParcelCostLine = z.infer<typeof ParcelCostLineSchema>;

// The menu is a record: `_schema_version` (number) + per-line objects. Values may also be a raw
// number/string (defensive — matches the server CostMenuSchema union).
export const ParcelCostMenuSchema = z.record(
  z.string(),
  z.union([ParcelCostLineSchema, z.number(), z.string()]),
);
export type ParcelCostMenu = z.infer<typeof ParcelCostMenuSchema>;

export const ParcelCostScalarsSchema = z.record(z.string(), z.number().nullable());
export const ParcelAreaHeadlinesSchema = z.record(
  z.string(),
  z.union([z.number(), z.string()]).nullable(),
);

export const ParcelNearbySummarySchema = z
  .object({
    headline: z.string(),
    basis: z.string(),
    coa_approval_rate: z.union([z.number(), z.string()]).nullable().optional(),
    typical_fsi: z.number().nullable().optional(),
    comp_fsi_basis: z.string().nullable().optional(),
  })
  .passthrough();

export const ParcelCoaProjectSchema = z.object({
  applicationNumber: z.string().nullable(),
  address: z.string().nullable(),
  status: z.string().nullable(),
  decision: z.string().nullable(),
  decisionDate: z.string().nullable(),
  hearingDate: z.string().nullable(),
  description: z.string().nullable(),
  projectType: z.string().nullable(),
  modeledGfaSqm: z.number().nullable(),
  estimatedCost: z.number().nullable(),
});
export type ParcelCoaProject = z.infer<typeof ParcelCoaProjectSchema>;

export const ParcelComparableBuildSchema = z.object({
  address: z.string().nullable(),
  lot_sqm: z.number().nullable(),
  frontage_m: z.number().nullable(),
  distance_m: z.number().nullable(),
  work_type: z.string().nullable(),
  permit_gfa_sqm: z.number().nullable(),
  permit_fsi: z.number().nullable(),
  storeys: z.number().nullable(),
  coa_decision: z.string().nullable(),
  build_ratio: z.number().nullable(),
  structure_family: z.string().nullable(),
});
export type ParcelComparableBuild = z.infer<typeof ParcelComparableBuildSchema>;

export const ParcelCompStatsSchema = z.object({
  compCount: z.number().nullable(),
  compDominantBuild: z.string().nullable(),
  compBuildRatioP50: z.number().nullable(),
  compFsiP50: z.number().nullable(),
  neighbourhoodId: z.number().nullable(),
  neighbourhoodCostPremium: z.number().nullable(),
});

export const ConsumerParcelSchema = z.object({
  costMenu: z.object({
    menu: ParcelCostMenuSchema.nullable(),
    scalars: ParcelCostScalarsSchema.nullable(),
  }),
  areas: ParcelAreaHeadlinesSchema,
  neighbourhood: z.object({
    summary: ParcelNearbySummarySchema.nullable(),
    compStats: ParcelCompStatsSchema,
    coaProjects: z.array(ParcelCoaProjectSchema),
    comparableBuilds: z.array(ParcelComparableBuildSchema).nullable(),
  }),
});
export type ConsumerParcel = z.infer<typeof ConsumerParcelSchema>;

export const ParcelMatchSchema = z.object({
  parcelId: z.string(),
  matchType: z.enum(['exact', 'typeahead', 'direct']),
  address: z.string(),
});
export const ParcelCandidateSchema = z.object({
  parcelId: z.string(),
  address: z.string(),
});

export const ConsumerParcelLookupResultSchema = z.object({
  match: ParcelMatchSchema.nullable(),
  candidates: z.array(ParcelCandidateSchema),
  warnings: z.array(z.string()),
  parcel: ConsumerParcelSchema.nullable(),
});
export type ConsumerParcelLookupResult = z.infer<typeof ConsumerParcelLookupResultSchema>;
export type ParcelMatch = z.infer<typeof ParcelMatchSchema>;
export type ParcelCandidate = z.infer<typeof ParcelCandidateSchema>;
