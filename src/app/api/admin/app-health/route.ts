// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §2.6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.2 + §8.3
//
// GET /api/admin/app-health — App Health Dashboard aggregator.
//
// Spec 30 §2.2 contract: parallel fan-out to Sentry REST + PostHog Query
// API via Promise.allSettled (per-tile error isolation — one tile failing
// MUST NOT poison the others). Returns AppHealthResponse envelope with
// 5 tiles, each independently `{status: 'ok' | 'unavailable'}`.
//
// Spec 33 §5 admin auth boundary: verifyAdminAuth on FIRST line, before
// any cache lookup or external API call. 401 on failure with sanitized
// envelope.
//
// Spec 30 §2.2 caching: 60s in-memory TTL keyed on minute boundary.
// Sentry + PostHog have rate limits; the page polls at 60s intervals
// per Spec 26 admin dashboard cadence. Cache is process-local — fine
// for a single-instance Vercel deployment; multi-instance would shard
// by minute boundary so each instance pays the SaaS round-trip once
// per minute.
//
// Spec 30 §2.6 self-observability: aggregator emits its own Sentry
// breadcrumb on each tile evaluation. The per-client breadcrumbs
// (Phase 1) handle external-call observability; THIS breadcrumb tracks
// the aggregator-level orchestration (which tiles succeeded/failed in
// the parallel fan-out).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { logError } from '@/lib/logger';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import {
  getCrashRate24h,
  getBreadcrumbCount24h,
} from '@/lib/admin/sentry-client';
import {
  getLeadSaveFunnel7d,
  getPaywallConversion7d,
  getAuthMethodFunnel7d,
} from '@/lib/admin/posthog-client';
import {
  AppHealthResponseSchema,
  type AppHealthResponse,
  type AppHealthTiles,
  type TileResult,
} from '@/lib/admin/healthSchema';

const TAG = '[api/admin/app-health]';

// Cache state + helpers EXTRACTED to ./cache (WF3 2026-05-06): Next.js's
// App Router rejects non-handler named exports from route.ts at build
// time. The `__resetAppHealthCacheForTests` test seam was blocking
// production builds. The semantics — minute-boundary TTL + promise-based
// dog-pile defense — are preserved verbatim in the new module.
import {
  clearCache,
  getCachedBody,
  nextMinuteBoundary,
  setCachedBody,
} from '@/app/api/admin/app-health/cache';

/**
 * Promise.allSettled wrapper that converts a rejection into the canonical
 * `{status: 'unavailable', reason}` shape. Defensive — the per-client
 * methods (Phase 1) already return TileResult, but if any throws
 * unexpectedly the aggregator still produces a valid envelope.
 */
async function settle<T>(
  promise: Promise<TileResult<T>>,
): Promise<TileResult<T>> {
  try {
    return await promise;
  } catch (err) {
    logError(TAG, err, { stage: 'tile_settle' });
    return { status: 'unavailable', reason: 'aggregator_threw' };
  }
}

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §5 anti-pattern guard: per-route admin verification BEFORE
  // any external call. 401 on missing/non-admin auth.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      {
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Admin auth required' },
        meta: null,
      },
      { status: 401 },
    );
  }

  // Spec 30 §2.2 caching: serve from cache if within TTL. Concurrent
  // requests within the TTL share the SAME pending promise (dog-pile
  // defense). See ./cache.ts for the storage mechanism.
  const now = Date.now();
  const cachedPromise = getCachedBody(now);
  if (cachedPromise) {
    Sentry.addBreadcrumb({
      category: 'app_health',
      message: 'aggregator_cache_hit',
      data: {},
    });
    try {
      const body = await cachedPromise;
      return NextResponse.json(body);
    } catch (err) {
      // Pending promise rejected; fall through to a fresh fan-out below.
      logError(TAG, err, { stage: 'cached_promise_rejected' });
      clearCache();
    }
  }

  // Cache miss. Build the response promise FIRST and store it before
  // awaiting — racers landing during the fan-out share the same promise
  // and Sentry/PostHog see exactly one upstream request per minute.
  const expiresAt = nextMinuteBoundary(now);
  const bodyPromise = buildAppHealthBody(adminCtx.authMethod);
  setCachedBody(bodyPromise, expiresAt);

  let body: AppHealthResponse;
  try {
    body = await bodyPromise;
  } catch (err) {
    // Building the validated envelope threw (Zod failure, etc). Clear
    // the cache so the NEXT request retries instead of serving the
    // poisoned promise, then return 500 to this caller.
    clearCache();
    logError(TAG, err, { stage: 'envelope_build_threw' });
    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'App Health aggregator produced malformed response',
        },
        meta: null,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(body);
});

/**
 * Assemble the validated AppHealthResponse envelope. Pulled out of the
 * GET handler so the cache can store the Promise (not the resolved
 * body) for dog-pile defense — see CacheEntry doc.
 *
 * Throws if the assembled envelope fails Zod validation; the caller
 * catches and clears the cache. This is the only failure path that
 * propagates out of the function (per-tile errors are settled into
 * `{status: 'unavailable'}` and embedded in the envelope).
 */
async function buildAppHealthBody(
  authMethod: string,
): Promise<AppHealthResponse> {
  const start = Date.now();
  const [
    crashRate24h,
    cacheInvalidation24h,
    authConversion7d,
    leadSaveFunnel7d,
    paywallConversion7d,
  ] = await Promise.all([
    settle(getCrashRate24h()),
    settle(getBreadcrumbCount24h('query')),
    settle(getAuthMethodFunnel7d()),
    settle(getLeadSaveFunnel7d()),
    settle(getPaywallConversion7d()),
  ]);

  const tiles: AppHealthTiles = {
    crash_rate_24h: crashRate24h,
    auth_conversion_7d: authConversion7d,
    lead_save_funnel_7d: leadSaveFunnel7d,
    paywall_conversion_7d: paywallConversion7d,
    cache_invalidation_24h: cacheInvalidation24h,
  };

  const body: AppHealthResponse = {
    data: {
      snapshot_at: new Date().toISOString(),
      tiles,
    },
    error: null,
    meta: null,
  };

  // Spec 33 §13 Zod boundary: parse the response envelope BEFORE
  // returning. Catches developer errors where a tile field shape
  // diverges from the schema (e.g., a future PostHog client returns
  // ratio > 1 due to a data anomaly).
  const parsed = AppHealthResponseSchema.safeParse(body);
  if (!parsed.success) {
    logError(
      TAG,
      new Error('AppHealthResponse failed Zod validation'),
      { issues: parsed.error.flatten() },
    );
    throw new Error('AppHealthResponse failed Zod validation');
  }

  // Spec 30 §2.6 self-observability — aggregator-level breadcrumb
  // captures which tiles were unavailable for the operator to debug.
  Sentry.addBreadcrumb({
    category: 'app_health',
    message: 'aggregator_evaluated',
    data: {
      duration_ms: Date.now() - start,
      auth_method: authMethod,
      tiles_unavailable: Object.entries(tiles)
        .filter(([, result]) => result.status === 'unavailable')
        .map(([key]) => key),
    },
  });

  return parsed.data;
}

// Test-only cache reset moved to ./cache.ts as `clearCache()` (WF3
// 2026-05-06 — Next.js route files cannot export non-handler functions).
// Tests now import `clearCache` directly from `./cache`.
