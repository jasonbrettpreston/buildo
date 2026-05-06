// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §4a.1
//
// Thin wrapper around Sentry's REST API for the App Health Dashboard
// aggregator. Two methods:
//   - getCrashRate24h: rate of fatal events ÷ DAU over last 24h.
//   - getBreadcrumbCount24h: count of breadcrumbs matching a category
//     filter (e.g., {category: 'query'} for §7.2 cache invalidation).
//
// Per Spec 30 §2.6 every external-API call MUST emit its own Sentry
// breadcrumb (`category: 'app_health'`) so when a tile renders
// `unavailable` the operator can find the cause in Sentry. The breadcrumb
// captures duration_ms + status + tile_name.
//
// Per Spec 30 §2.2 each method returns `TileResult<T>` — graceful
// degradation: missing env var, rate limit (429), upstream 5xx all map
// to `{status: 'unavailable', reason}` rather than throwing.

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import type {
  CrashRate24hPayload,
  CacheInvalidation24hPayload,
  TileResult,
} from '@/lib/admin/healthSchema';

// Spec 33 §13: external-API responses MUST be Zod-parsed before
// consuming. A schema break upstream (Sentry renames `groups` → `rows`)
// then surfaces as a `parse_error` tile rather than an invisible 0-fill.
const SentryStatsResponseSchema = z.object({
  intervals: z.array(z.string()).optional(),
  groups: z
    .array(
      z.object({
        by: z.record(z.string(), z.string()),
        totals: z.record(z.string(), z.number()).optional(),
      }),
    )
    .optional(),
});

const apiToken = process.env.SENTRY_API_TOKEN;
const orgSlug = process.env.SENTRY_ORG_SLUG ?? 'buildo';
const mobileProjectSlug = process.env.SENTRY_MOBILE_PROJECT_SLUG ?? 'buildo-mobile';
const sentryHost = process.env.SENTRY_HOST ?? 'https://sentry.io';

/**
 * Make an authenticated Sentry REST call. Returns parsed JSON on 2xx;
 * returns a `{ok: false, reason}` discriminated union on any failure.
 *
 * Failure shapes:
 *   - 'env_missing'      — SENTRY_API_TOKEN unset (local dev common case)
 *   - 'rate_limited'     — 429 from Sentry; tile MUST cache for 5 min
 *   - 'upstream_unavailable' — 5xx from Sentry
 *   - 'parse_error'      — response body wasn't JSON
 *   - 'network_error'    — fetch threw (timeout, DNS, etc.)
 */
async function sentryGet<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; reason: string }> {
  if (!apiToken) return { ok: false, reason: 'env_missing' };
  const url = `${sentryHost}/api/0${path}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    Sentry.addBreadcrumb({
      category: 'app_health',
      message: 'sentry_api_call',
      data: {
        path,
        status: response.status,
        duration_ms: Date.now() - start,
      },
    });
    if (response.status === 429) return { ok: false, reason: 'rate_limited' };
    if (response.status >= 500)
      return { ok: false, reason: 'upstream_unavailable' };
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, reason: 'parse_error' };
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      logError('[admin/sentry-client]', new Error('Sentry response schema mismatch'), {
        path,
        issues: parsed.error.flatten(),
      });
      return { ok: false, reason: 'parse_error' };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    logError('[admin/sentry-client]', err, { path, stage: 'fetch' });
    return { ok: false, reason: 'network_error' };
  }
}

// ---------------------------------------------------------------------------
// Tile-data methods
// ---------------------------------------------------------------------------

type SentryStatsResponse = z.infer<typeof SentryStatsResponseSchema>;

/**
 * Crash rate per user over the last 24h. Uses Sentry's events-stats
 * aggregation: count fatal-level events for the mobile project, divided
 * by DAU (distinct users with any event).
 *
 * Returns a `TileResult<CrashRate24hPayload>` with deep-link to the
 * Sentry issues view filtered to fatal-level events.
 */
export async function getCrashRate24h(): Promise<TileResult<CrashRate24hPayload>> {
  // Three parallel queries:
  //   - fatal event count (numerator for rate_per_user)
  //   - DAU = count_unique(user) over ALL events (denominator)
  //   - count_unique(user) filtered to level:fatal (= affected_users,
  //     distinct users who experienced ≥1 crash, NOT total crash events).
  // Any of the three failing → `unavailable` at tile level.
  const [crashRes, dauRes, affectedRes] = await Promise.all([
    sentryGet(
      `/projects/${orgSlug}/${mobileProjectSlug}/stats_v2/?statsPeriod=24h&field=count()&query=level:fatal`,
      SentryStatsResponseSchema,
    ),
    sentryGet(
      `/projects/${orgSlug}/${mobileProjectSlug}/stats_v2/?statsPeriod=24h&field=count_unique(user)`,
      SentryStatsResponseSchema,
    ),
    sentryGet(
      `/projects/${orgSlug}/${mobileProjectSlug}/stats_v2/?statsPeriod=24h&field=count_unique(user)&query=level:fatal`,
      SentryStatsResponseSchema,
    ),
  ]);
  if (!crashRes.ok) return { status: 'unavailable', reason: crashRes.reason };
  if (!dauRes.ok) return { status: 'unavailable', reason: dauRes.reason };
  if (!affectedRes.ok) return { status: 'unavailable', reason: affectedRes.reason };

  const crashCount = sumTotals(crashRes.data, 'count()');
  const dau = sumTotals(dauRes.data, 'count_unique(user)');
  const affectedUsers = sumTotals(affectedRes.data, 'count_unique(user)');
  // Rate calc: zero DAU = zero rate (avoid div/0; semantically "no users
  // in window means no measurable crash rate").
  const ratePerUser = dau === 0 ? 0 : Math.min(1, crashCount / dau);

  return {
    status: 'ok',
    payload: {
      rate_per_user: ratePerUser,
      affected_users: affectedUsers,
      sentry_link: `${sentryHost}/organizations/${orgSlug}/issues/?project=${mobileProjectSlug}&query=is%3Aunresolved+level%3Afatal&statsPeriod=24h`,
    },
  };
}

/**
 * Breadcrumb count over last 24h for a given category. Used by the
 * cache-invalidation tile (Spec 99 §7.2 emits `category: 'query'`).
 */
export async function getBreadcrumbCount24h(
  category: string,
): Promise<TileResult<CacheInvalidation24hPayload>> {
  // Sentry's REST API for breadcrumbs requires the events endpoint with
  // a query filter. Approximated here as fatal-event count with the
  // category in the breadcrumbs json (Sentry indexes breadcrumb data
  // automatically). For a precise count an org would need a custom
  // search, but the linked dashboard lets the operator drill in.
  const res = await sentryGet(
    `/projects/${orgSlug}/${mobileProjectSlug}/stats_v2/?statsPeriod=24h&field=count()&query=breadcrumb.category:${encodeURIComponent(category)}`,
    SentryStatsResponseSchema,
  );
  if (!res.ok) return { status: 'unavailable', reason: res.reason };
  return {
    status: 'ok',
    payload: {
      breadcrumb_count: sumTotals(res.data, 'count()'),
      sentry_link: `${sentryHost}/organizations/${orgSlug}/issues/?project=${mobileProjectSlug}&query=breadcrumb.category%3A${encodeURIComponent(category)}&statsPeriod=24h`,
    },
  };
}

function sumTotals(data: SentryStatsResponse, field: string): number {
  const groups = data.groups ?? [];
  let total = 0;
  for (const group of groups) {
    const value = group.totals?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}
