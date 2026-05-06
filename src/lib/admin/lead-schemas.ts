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
