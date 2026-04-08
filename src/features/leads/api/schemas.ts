// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// Shared Zod schemas for the leads API routes. Both schemas import the
// authoritative bound constants from Phase 1 lib files so the validation
// boundaries stay in sync with the underlying SQL behavior.
//
// Validation failures are mapped to HTTP 400 (NOT 500) via
// `badRequestZod` in `./error-mapping.ts`.

import { z } from 'zod';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '@/features/leads/lib/distance';
import {
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
} from '@/features/leads/lib/get-lead-feed';

// ---------------------------------------------------------------------------
// GET /api/leads/feed query parameters
// ---------------------------------------------------------------------------
//
// All numeric inputs are `z.coerce.number()` because URL query strings
// arrive as strings. The cursor triple is all-or-nothing: either all three
// fields are present (subsequent page) or all three are omitted (first page).

// `.finite()` is critical on every z.coerce.number() because Number("abc")
// returns NaN, and `NaN > -90` evaluates to false (not throws), so .min/.max
// would silently let NaN through. .finite() rejects NaN/Infinity.

export const leadFeedQuerySchema = z
  .object({
    lat: z.coerce.number().finite().min(-90).max(90),
    lng: z.coerce.number().finite().min(-180).max(180),
    trade_slug: z.string().min(1).max(50),
    radius_km: z.coerce
      .number()
      .finite()
      .positive()
      .max(MAX_RADIUS_KM)
      .default(DEFAULT_RADIUS_KM),
    limit: z.coerce
      .number()
      .finite()
      .int()
      .positive()
      .max(MAX_FEED_LIMIT)
      .default(DEFAULT_FEED_LIMIT),
    // cursor_score is .int() because the SQL relevance_score is currently a
    // sum of integer pillar CASE expressions (always whole numbers). If the
    // scoring engine ever returns fractional scores, this coercion will
    // truncate cursor precision and cause pagination skips at boundaries —
    // promote to .number().finite() at that time and update the SQL cast
    // in get-lead-feed.ts to match.
    cursor_score: z.coerce.number().finite().int().nonnegative().optional(),
    cursor_lead_type: z.enum(['permit', 'builder']).optional(),
    cursor_lead_id: z.string().min(1).optional(),
  })
  .refine(
    (data) => {
      const present =
        Number(data.cursor_score !== undefined) +
        Number(data.cursor_lead_type !== undefined) +
        Number(data.cursor_lead_id !== undefined);
      return present === 0 || present === 3;
    },
    {
      message:
        'cursor_score, cursor_lead_type, and cursor_lead_id must all be provided together or all omitted',
    },
  );

export type LeadFeedQuery = z.infer<typeof leadFeedQuerySchema>;

// ---------------------------------------------------------------------------
// POST /api/leads/view body
// ---------------------------------------------------------------------------
//
// `lead_type` is the discriminator. Permit leads require permit_num + revision_num
// AND must NOT have entity_id. Builder leads require entity_id AND must NOT have
// permit_num/revision_num. Both branches use `.strict()` so foreign-branch keys
// are REJECTED, not silently stripped — this gives the strict XOR semantics the
// spec asks for. Without `.strict()`, Zod's default `z.object` silently strips
// unknown keys, which would let `{lead_type:'permit', permit_num:..., entity_id: 5}`
// pass while quietly dropping the entity_id (caught by independent review of
// commit fcbe04a — the prior comment was misleading about Zod's default behavior).
//
// The shape mirrors the `RecordLeadViewInput` discriminated union in
// `src/features/leads/lib/record-lead-view.ts` so the parsed body can be passed
// straight through with only the user_id added.

export const leadViewBodySchema = z.discriminatedUnion('lead_type', [
  z
    .object({
      trade_slug: z.string().min(1).max(50),
      action: z.enum(['view', 'save', 'unsave']),
      lead_type: z.literal('permit'),
      permit_num: z.string().min(1).max(30),
      revision_num: z.string().min(1).max(10),
    })
    .strict(),
  z
    .object({
      trade_slug: z.string().min(1).max(50),
      action: z.enum(['view', 'save', 'unsave']),
      lead_type: z.literal('builder'),
      // Bound to PostgreSQL INT max (2^31-1) so we never pass an out-of-range
      // entity_id to the lead_views FK constraint.
      entity_id: z.number().int().positive().max(2147483647),
    })
    .strict(),
]);

export type LeadViewBody = z.infer<typeof leadViewBodySchema>;
