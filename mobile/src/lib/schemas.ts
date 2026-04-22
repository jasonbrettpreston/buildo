// Zod schemas mirroring Next.js API response types
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Zod Boundary
//
// Every fetch through apiClient.ts must parse the response through the
// relevant schema. A ZodError is caught by the ErrorBoundary and reported
// to observability (Phase 8: Sentry). This file is the single source of
// truth for what shape the mobile app will accept from the backend.
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
// Discriminated union: permit | builder
// ---------------------------------------------------------------------------

export const LeadFeedItemSchema = z.discriminatedUnion('lead_type', [
  PermitLeadFeedItemSchema,
  BuilderLeadFeedItemSchema,
]);

export type LeadFeedItem = z.infer<typeof LeadFeedItemSchema>;

// ---------------------------------------------------------------------------
// Feed cursor
// ---------------------------------------------------------------------------

export const LeadFeedCursorSchema = z.object({
  score: z.number(),
  lead_type: z.enum(['permit', 'builder']),
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
});

export type FlightBoardItem = z.infer<typeof FlightBoardItemSchema>;

export const FlightBoardResultSchema = z.object({
  data: z.array(FlightBoardItemSchema),
});

export type FlightBoardResult = z.infer<typeof FlightBoardResultSchema>;

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
