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

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  body: AppHealthResponse;
}

/** Process-local cache. Single entry — the endpoint takes no params. */
let cache: CacheEntry | null = null;

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

  // Spec 30 §2.2 caching: serve from cache if within TTL.
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    Sentry.addBreadcrumb({
      category: 'app_health',
      message: 'aggregator_cache_hit',
      data: { ttl_remaining_ms: cache.expiresAt - now },
    });
    return NextResponse.json(cache.body);
  }

  // Cache miss: fan out to Sentry + PostHog in parallel. Each call
  // returns TileResult; settle() converts unexpected throws into
  // canonical unavailable shape.
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

  // Cache the validated envelope; future requests within TTL serve
  // from this snapshot without re-hitting Sentry/PostHog.
  cache = { expiresAt: now + CACHE_TTL_MS, body: parsed.data };

  // Spec 30 §2.6 self-observability — aggregator-level breadcrumb
  // captures which tiles were unavailable for the operator to debug.
  Sentry.addBreadcrumb({
    category: 'app_health',
    message: 'aggregator_evaluated',
    data: {
      duration_ms: Date.now() - start,
      auth_method: adminCtx.authMethod,
      tiles_unavailable: Object.entries(tiles)
        .filter(([, result]) => result.status === 'unavailable')
        .map(([key]) => key),
    },
  });

  return NextResponse.json(parsed.data);
});

/**
 * Test-only cache reset. Exported with `__` prefix to discourage
 * production import. Used by infra tests to start each test from a
 * clean cache without restarting the module graph.
 */
export function __resetAppHealthCacheForTests(): void {
  cache = null;
}
