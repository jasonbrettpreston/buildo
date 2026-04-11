// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// GET /api/leads/feed — personalized lead feed for the authenticated user.
// Returns permits + builders interleaved by relevance score, paginated via
// the unified cursor from spec 70. Thin route handler — every behavior
// delegates to a Phase 1 lib function or Phase 2-i foundation helper.
//
// Status code matrix (spec 70 §API Endpoints):
//   200 — success
//   400 — Zod validation failure
//   401 — no session, no profile, or auth helper failure
//   403 — trade_slug parameter doesn't match user's profile trade
//   429 — rate limit exceeded (30 req/min per user)
//   500 — unexpected error (logged via logError + returned as generic envelope)

import type { NextRequest } from 'next/server';
import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { pool } from '@/lib/db/client';
import { isPostgisAvailable } from '@/lib/admin/lead-feed-health';
import { ok } from '@/features/leads/api/envelope';
import {
  badRequestZod,
  devEnvMissingPostgis,
  forbiddenTradeMismatch,
  internalError,
  rateLimited,
  unauthorized,
} from '@/features/leads/api/error-mapping';
import { logRequestComplete } from '@/features/leads/api/request-logging';
import { leadFeedQuerySchema } from '@/features/leads/api/schemas';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { createPerfMarks } from '@/features/leads/lib/perf-marks';

const RATE_LIMIT_PER_MIN = 30;
const RATE_LIMIT_WINDOW_SEC = 60;

export async function GET(request: NextRequest) {
  const start = Date.now();
  // Phase 7 2026-04-11 — named phase-level perf instrumentation.
  // Monotonic-clock-backed measurements via Node perf_hooks, logged
  // alongside the existing duration_ms. Phase names are stable so
  // downstream log dashboards can chart them over time.
  const perf = createPerfMarks('leads-feed');
  perf.mark('start');
  try {
    // 1. Auth — get the Firebase UID + user's trade from user_profiles.
    perf.mark('auth_start');
    const ctx = await getCurrentUserContext(request, pool);
    perf.mark('auth_end');
    perf.measure('auth', 'auth_start', 'auth_end');
    if (!ctx) return unauthorized();

    // 2. Validate query params via Zod (returns 400 with field-level details
    //    on failure — NOT 500, per spec 70).
    perf.mark('zod_start');
    const parsed = leadFeedQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    perf.mark('zod_end');
    perf.measure('zod', 'zod_start', 'zod_end');
    if (!parsed.success) return badRequestZod(parsed.error);
    const params = parsed.data;

    // 3. Trade slug authorization — server compares the requested trade to
    //    the user's profile trade. Mismatch returns 403 per spec 70.
    if (params.trade_slug !== ctx.trade_slug) {
      return forbiddenTradeMismatch(params.trade_slug, ctx.trade_slug);
    }

    // 3b. PostGIS pre-flight (WF3 2026-04-11 — spec 70 §API Endpoints
    //     extension). LEAD_FEED_SQL uses `::geography` casts for radius
    //     filtering; local dev without the postgis extension throws
    //     `type "geography" does not exist` (pg code 42704) which
    //     surfaces as an opaque 500 in the UI. Return a structured 503
    //     with install instructions instead. Production Cloud SQL has
    //     PostGIS installed; `isPostgisAvailable` caches `true` on the
    //     first request so prod cost is ~0 after process start.
    //
    //     Ordered AFTER auth (401 still fires for unauth'd), AFTER Zod
    //     (400 still fires for garbage params so we don't leak the
    //     dev-env message to bots fuzzing the endpoint), AFTER trade
    //     authz (403 on mismatch), and BEFORE rate limit (so a dev
    //     user hitting a stuck feed doesn't exhaust their 30/min
    //     window on a 503).
    perf.mark('postgis_start');
    const postgisReady = await isPostgisAvailable(pool);
    perf.mark('postgis_end');
    perf.measure('postgis_preflight', 'postgis_start', 'postgis_end');
    if (!postgisReady) {
      return devEnvMissingPostgis();
    }

    // 4. Rate limit — 30 req/min per user, scoped to this endpoint via
    //    the `leads-feed:` key prefix so other future leads endpoints
    //    have their own buckets.
    perf.mark('ratelimit_start');
    const rateLimit = await withRateLimit(request, {
      key: `leads-feed:${ctx.uid}`,
      limit: RATE_LIMIT_PER_MIN,
      windowSec: RATE_LIMIT_WINDOW_SEC,
    });
    perf.mark('ratelimit_end');
    perf.measure('rate_limit', 'ratelimit_start', 'ratelimit_end');
    if (!rateLimit.allowed) return rateLimited(rateLimit.remaining);

    // 5. Build the cursor from the validated optional triple. Conditional
    //    spread satisfies exactOptionalPropertyTypes — `cursor: undefined`
    //    would fail strict mode.
    const cursor =
      params.cursor_score !== undefined &&
      params.cursor_lead_type !== undefined &&
      params.cursor_lead_id !== undefined
        ? {
            score: params.cursor_score,
            lead_type: params.cursor_lead_type,
            lead_id: params.cursor_lead_id,
          }
        : undefined;

    // 6. Call the Phase 1 lib function. This THROWS on DB/pool error
    //    (post Phase-2 holistic review — earlier drafts swallowed errors
    //    and returned empty). The outer try/catch below converts thrown
    //    errors to a 500 envelope via `internalError()`.
    perf.mark('query_start');
    const result = await getLeadFeed(
      {
        user_id: ctx.uid,
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: params.radius_km,
        limit: params.limit,
        ...(cursor !== undefined && { cursor }),
      },
      pool,
    );
    perf.mark('query_end');
    perf.measure('query', 'query_start', 'query_end');

    // 7. Structured logging — spec 70 §API Endpoints "Observability".
    //    Phase 7 2026-04-11 adds `perf_marks` nested field with phase-level
    //    durations. Non-empty only when the request reached the logging
    //    step (not an early-return auth/zod/403/503/429).
    perf.mark('end');
    perf.measure('total', 'start', 'end');
    logRequestComplete(
      '[api/leads/feed]',
      {
        user_id: ctx.uid,
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: result.meta.radius_km,
        result_count: result.meta.count,
      },
      start,
      perf.toLog(),
    );

    // 8. Return the envelope.
    return ok(result.data, result.meta);
  } catch (cause) {
    // Defensive — none of the above should throw because every helper is
    // documented as never-throws, but if a regression slips through, this
    // catches it and surfaces a 500 envelope with the cause logged.
    return internalError(cause, { route: 'GET /api/leads/feed' });
  }
}
