// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §2.6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//
// Zod boundary schema for the App Health Dashboard aggregator response.
// Spec 33 §13 mandates Zod parse on every admin endpoint's request +
// response. Spec 30 §2.2 specifies the `AppHealthResponse` discriminated
// union shape with per-tile error isolation (one tile failing does not
// poison the others).
//
// The `TileResult` discriminated union is the canonical shape every
// tile follows. Adding a new tile means adding a payload schema + a
// `TileResult<PayloadType>` field to `AppHealthTilesSchema`.

import { z } from 'zod';

/**
 * Generic per-tile result. Each tile fails independently to
 * `{ status: 'unavailable', reason }` so the page renders a partial
 * result rather than a 500. Spec 30 §2.6.
 */
export function tileResultSchema<T extends z.ZodTypeAny>(payload: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), payload }),
    z.object({ status: z.literal('unavailable'), reason: z.string() }),
  ]);
}

// ---------------------------------------------------------------------------
// Per-tile payload schemas (Spec 30 §2.2)
// ---------------------------------------------------------------------------

export const CrashRate24hPayloadSchema = z.object({
  /** crashes ÷ DAU (0..1). */
  rate_per_user: z.number().min(0).max(1),
  affected_users: z.number().int().nonnegative(),
  /** Deep-link into Sentry SaaS. */
  sentry_link: z.string().url(),
});

export const AuthMethodConversionSchema = z.object({
  method: z.enum(['apple', 'google', 'email', 'phone']),
  attempted: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  /** succeeded ÷ attempted (0..1; 0 when attempted=0). */
  ratio: z.number().min(0).max(1),
});

export const AuthConversion7dPayloadSchema = z.object({
  per_method: z.array(AuthMethodConversionSchema),
  posthog_link: z.string().url(),
});

export const LeadSaveFunnel7dPayloadSchema = z.object({
  /** lead_detail_viewed event count. */
  viewed: z.number().int().nonnegative(),
  /** lead_saved event count. */
  saved: z.number().int().nonnegative(),
  /** saved ÷ viewed (0..1; 0 when viewed=0). */
  ratio: z.number().min(0).max(1),
  posthog_link: z.string().url(),
});

export const PaywallConversion7dPayloadSchema = z.object({
  /** paywall_shown event count. */
  shown: z.number().int().nonnegative(),
  /** subscribe_button_clicked event count. */
  clicked: z.number().int().nonnegative(),
  /** clicked ÷ shown (0..1; 0 when shown=0). */
  ratio: z.number().min(0).max(1),
  posthog_link: z.string().url(),
});

export const CacheInvalidation24hPayloadSchema = z.object({
  /** Sentry breadcrumb count where category='query', message='invalidate'. */
  breadcrumb_count: z.number().int().nonnegative(),
  sentry_link: z.string().url(),
});

// ---------------------------------------------------------------------------
// Aggregated response (Spec 30 §2.2)
// ---------------------------------------------------------------------------

export const AppHealthTilesSchema = z.object({
  crash_rate_24h: tileResultSchema(CrashRate24hPayloadSchema),
  auth_conversion_7d: tileResultSchema(AuthConversion7dPayloadSchema),
  lead_save_funnel_7d: tileResultSchema(LeadSaveFunnel7dPayloadSchema),
  paywall_conversion_7d: tileResultSchema(PaywallConversion7dPayloadSchema),
  cache_invalidation_24h: tileResultSchema(CacheInvalidation24hPayloadSchema),
});

export const AppHealthResponseSchema = z.object({
  data: z.object({
    /** ISO 8601 of when this snapshot was assembled. */
    snapshot_at: z.string(),
    tiles: AppHealthTilesSchema,
  }),
  error: z.null(),
  meta: z.null(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types — Spec 33 §13: types derived from Zod, NEVER
// hand-written interfaces. Used by both server (route handler) + client
// (page polling component).
// ---------------------------------------------------------------------------

export type TileResult<T> =
  | { status: 'ok'; payload: T }
  | { status: 'unavailable'; reason: string };

export type CrashRate24hPayload = z.infer<typeof CrashRate24hPayloadSchema>;
export type AuthConversion7dPayload = z.infer<typeof AuthConversion7dPayloadSchema>;
export type LeadSaveFunnel7dPayload = z.infer<typeof LeadSaveFunnel7dPayloadSchema>;
export type PaywallConversion7dPayload = z.infer<typeof PaywallConversion7dPayloadSchema>;
export type CacheInvalidation24hPayload = z.infer<typeof CacheInvalidation24hPayloadSchema>;
export type AppHealthTiles = z.infer<typeof AppHealthTilesSchema>;
export type AppHealthResponse = z.infer<typeof AppHealthResponseSchema>;
