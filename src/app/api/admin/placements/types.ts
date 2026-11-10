// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13 (Zod in and out)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10)
//
// MF-40 · response schemas for GET /api/admin/placements, PUT and PATCH /api/admin/placements/offers and PUT /api/admin/placements/advertisers.
// Request bodies are validated by the contract-built validators in src/lib/placements/contract.ts (one schema home).

import { z } from 'zod';
import type { AdvertiserOption, OfferRow, PlacementsRead } from '@/lib/placements/list';

const Flag = z.enum(['true', 'false']);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const OfferRowSchema = z.object({
  offer_id: z.string().uuid(),
  placement_key: z.string(),
  advertiser_id: z.string().uuid(),
  advertiser_name: z.string(),
  building_type: z.string().nullable(),
  design_option: z.string().nullable(),
  creative_text: z.string(),
  flight_start: Day.nullable(),
  flight_end: Day.nullable(),
  active: Flag,
  over_cap: Flag,
  resolvable: Flag,
  updated_at: z.string(),
}) satisfies z.ZodType<OfferRow>;

export const AdvertiserOptionSchema = z.object({ advertiser_id: z.string().uuid(), name: z.string() }) satisfies z.ZodType<AdvertiserOption>;

export const PlacementsReadSchema = z.object({
  offers: z.array(OfferRowSchema),
  advertisers: z.array(AdvertiserOptionSchema),
  defaults: z.object({ flight_start: Day, flight_end: Day }),
}) satisfies z.ZodType<PlacementsRead>;

/** PUT /offers: the saved offer's id, its new updated_at, whether it was created (always inactive on create) and, for an edit of an active offer, the over_cap warning. */
export const OfferUpsertResponseSchema = z.object({ offer_id: z.string().uuid(), updated_at: z.string(), created: z.boolean(), over_cap: z.boolean() });
export type OfferUpsertResponse = z.infer<typeof OfferUpsertResponseSchema>;

/** PATCH /offers: the new active value, its updated_at and the oversubscription warning (plan fold 8: returned, never silent). */
export const OfferToggleResponseSchema = z.object({ offer_id: z.string().uuid(), active: z.boolean(), updated_at: z.string(), over_cap: z.boolean() });
export type OfferToggleResponse = z.infer<typeof OfferToggleResponseSchema>;

export const AdvertiserUpsertResponseSchema = z.object({ advertiser_id: z.string().uuid(), created: z.boolean() });
export type AdvertiserUpsertResponse = z.infer<typeof AdvertiserUpsertResponseSchema>;

/** Error codes the placements routes return (the hooks show the surface's error text from content). */
export type PlacementsErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_JSON'
  | 'VALIDATION_FAILED'
  | 'TARGETING_NOT_ALLOWED'
  | 'SCENARIO_REQUIRED'
  | 'SCENARIO_UNKNOWN'
  | 'INVALID_DATE'
  | 'FLIGHT_ORDER'
  | 'FLIGHT_BEYOND_HORIZON'
  | 'ADVERTISER_UNKNOWN'
  | 'ADVERTISER_INACTIVE'
  | 'NOT_FOUND'
  | 'STALE_OFFER'
  | 'ADVERTISER_ID_TAKEN'
  | 'INTERNAL_ERROR';
