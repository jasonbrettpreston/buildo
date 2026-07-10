// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//
// Zod boundary schemas for the Flight Center watchlist routes
// (`/api/admin/leads/watchlist**`) and their client hooks. Spec 33 §13:
// requests parsed BEFORE any DB access, responses parsed BEFORE returning;
// the TS types are `z.infer`, never hand-written interfaces.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Flight list (GET /api/admin/leads/watchlist)
// ---------------------------------------------------------------------------

export const WatchlistItemSchema = z.object({
  id: z.number().int(),
  lead_type: z.enum(['permit', 'coa']),
  lead_key: z.string(),
  permit_num: z.string().nullable(),
  revision_num: z.string().nullable(),
  coa_application_number: z.string().nullable(),
  /** address_snapshot captured at save time ([PF8]); live-address fallback. */
  address: z.string(),
  lifecycle_phase: z.string().nullable(),
  lifecycle_stalled: z.boolean(),
  /** Project-level aggregated expected start — MIN(predicted_start) across ACTIVE-trade forecasts ([ORC3]/[PF-G3]). */
  predicted_start: z.string().nullable(),
  p25_days: z.number().nullable(),
  p75_days: z.number().nullable(),
  /** MAX(opportunity_score) across the lead's active-trade forecasts, null-safe ([ORC4]). */
  opportunity_score: z.number().nullable(),
  temporal_group: z.enum(['action_required', 'departing_soon', 'on_the_horizon']),
  saved_at: z.string(),
});
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;

export const WatchlistMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type WatchlistMeta = z.infer<typeof WatchlistMetaSchema>;

/** Full `{data, meta}` envelope shape the useWatchlist hook parses. */
export const WatchlistResultSchema = z.object({
  data: z.array(WatchlistItemSchema),
  meta: WatchlistMetaSchema,
});
export type WatchlistResult = z.infer<typeof WatchlistResultSchema>;

/** Server-side pagination ([PF4]): LIMIT 50 + offset; total in meta. */
export const WATCHLIST_PAGE_SIZE = 50;

export const WatchlistQuerySchema = z
  .object({
    offset: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// Bulk save (POST /api/admin/leads/watchlist)
// ---------------------------------------------------------------------------

// Per-item schema — bulk-save validates ITEMS individually with safeParse
// ([PF5]): one bad item must not reject the batch. `.strict()` per item.
export const WatchlistSaveItemSchema = z.discriminatedUnion('lead_type', [
  z
    .object({
      lead_type: z.literal('permit'),
      permit_num: z.string().trim().min(1).max(30),
      revision_num: z.string().trim().min(1).max(10),
      /** Written to address_snapshot ([PF8]). */
      address: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      lead_type: z.literal('coa'),
      coa_application_number: z.string().trim().min(1).max(50),
      address: z.string().trim().max(500).optional(),
    })
    .strict(),
]);
export type WatchlistSaveItem = z.infer<typeof WatchlistSaveItemSchema>;

// The OUTER body schema deliberately keeps items as unknown[] — per-item
// validation happens element-by-element in the route so a single bad item
// lands in `failed[]` instead of 400-ing the whole batch ([PF5]).
export const BulkSaveBodySchema = z
  .object({
    items: z.array(z.unknown()).min(1).max(1000),
  })
  .strict();

export const BulkSaveResponseSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped_existing: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      reason: z.string(),
    }),
  ),
});
export type BulkSaveResponse = z.infer<typeof BulkSaveResponseSchema>;

// ---------------------------------------------------------------------------
// Bulk delete (DELETE /api/admin/leads/watchlist)
// ---------------------------------------------------------------------------

export const BulkDeleteBodySchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(1000),
  })
  .strict();

export const BulkDeleteResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
});
export type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;

// ---------------------------------------------------------------------------
// Address search (GET /api/admin/leads/watchlist/search?q=)
// ---------------------------------------------------------------------------

export const WatchlistSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
  })
  .strict();

export const WatchlistSearchItemSchema = z.object({
  lead_type: z.enum(['permit', 'coa']),
  /** Canonical key via buildLeadKey — byte-exact for the forecast join ([ORC5]). */
  lead_key: z.string(),
  permit_num: z.string().nullable(),
  revision_num: z.string().nullable(),
  coa_application_number: z.string().nullable(),
  address: z.string(),
  lifecycle_phase: z.string().nullable(),
});
export type WatchlistSearchItem = z.infer<typeof WatchlistSearchItemSchema>;

export const WatchlistSearchResultSchema = z.object({
  data: z.array(WatchlistSearchItemSchema),
});
export type WatchlistSearchResult = z.infer<typeof WatchlistSearchResultSchema>;
