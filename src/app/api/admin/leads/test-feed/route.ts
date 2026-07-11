// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
//
// GET /api/admin/leads/test-feed — admin test/browse feed endpoint.
// Bypasses user profile auth — constructs a synthetic LeadFeedInput — but
// still sits behind the per-route admin guard (Spec 33 §8: middleware is
// bypassable, so verifyAdminAuth runs as the FIRST line). It now powers the
// admin Feed Browser (Spec 76 §3.2), so the CoA UNION arm is enabled
// (`disableCoa: false`) and a `lead_type` axis lets the operator scope to
// permit / coa / all. Returns the same data envelope as /api/leads/feed plus
// a _debug block. radius_km + limit are Zod-clamped to MAX_RADIUS_KM /
// MAX_FEED_LIMIT (DoS bound).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '@/features/leads/lib/distance';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/features/leads/lib/get-lead-feed';
import {
  computeTestFeedDebug,
  isPostgisAvailable,
  sanitizePgErrorMessage,
} from '@/lib/admin/test-feed-utils';

const TAG = '[api/admin/leads/test-feed]';

const testFeedSchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  trade_slug: z.string().min(1).max(50),
  radius_km: z.coerce.number().finite().positive().max(MAX_RADIUS_KM).default(DEFAULT_RADIUS_KM),
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
  // Spec 91 §3.1 filter axis — 'all' (permit+builder+coa), 'permit', or 'coa'.
  // Defaulted to 'all' at the boundary; forwarded to getLeadFeed.
  lead_type: z.enum(['all', 'permit', 'coa']).default('all'),
});

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 admin auth boundary — FIRST line, before params/DB. This
  // endpoint powers a real admin browsing surface, so the guard is explicit
  // (route classification alone is not defense-in-depth).
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const parsed = testFeedSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_FAILED', message: 'Invalid parameters', details: parsed.error.flatten().fieldErrors }, meta: null },
        { status: 400 },
      );
    }
    const params = parsed.data;

    // WF3 2026-04-11: Pre-flight check for PostGIS. The main query in
    // getLeadFeed uses `geography` casts for radius filtering, which
    // require the postgis extension. Production Cloud SQL has it; local
    // dev may not. Without this check, dev hits an opaque 500 "Feed query
    // failed" at pool.query(LEAD_FEED_SQL) (pg code 42704). Return a
    // 503 + DEV_ENV_MISSING_POSTGIS instead so the operator sees an
    // actionable message. In production this check is a cache hit (~0ms)
    // after the first request of the process lifetime.
    const postgisReady = await isPostgisAvailable(pool);
    if (!postgisReady) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'DEV_ENV_MISSING_POSTGIS',
            message:
              'PostGIS extension is not installed in this database. The lead feed query requires PostGIS for geography-based radius filtering. Install the postgis package at the OS level (e.g. scoop install postgresql-postgis on Windows, apt install postgresql-16-postgis-3 on Linux, brew install postgis on Mac) and then run `CREATE EXTENSION postgis;` against the buildo database. Cloud SQL has PostGIS by default.',
          },
          meta: null,
        },
        { status: 503 },
      );
    }

    const start = Date.now();
    const result = await getLeadFeed(
      {
        user_id: 'admin-test',
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: params.radius_km,
        limit: params.limit,
        lead_type: params.lead_type,
        // Spec 76 §3.2 Feed Browser — the CoA UNION arm is written, tested,
        // and data-live; enable it here (the killswitch default-OFF is a
        // mobile-renderability gate, not a data gate) so admins can browse
        // CoA leads. The lead_type axis still scopes which arms appear.
        disableCoa: false,
      },
      pool,
    );
    const durationMs = Date.now() - start;

    const _debug = computeTestFeedDebug(
      result.data.map(item => ({
        lead_type: item.lead_type,
        relevance_score: item.relevance_score,
        proximity_score: item.proximity_score,
        timing_score: item.timing_score,
        value_score: item.value_score,
        opportunity_score: item.opportunity_score,
      })),
      durationMs,
    );

    return NextResponse.json({
      data: result.data,
      error: null,
      meta: result.meta,
      _debug,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(TAG, error, { phase: 'handler' });
    // WF3 2026-04-11: surface the real error message in non-production so
    // operators can diagnose the test-feed without digging through server
    // logs. Production keeps the canned message to avoid leaking internals.
    // Dev-mode messages are passed through `sanitizePgErrorMessage` to
    // strip any pg connection-string credentials (node-postgres#3145).
    // (Phase 18: the prior reference to /api/admin/leads/health/route.ts was
    // stale — that health route was never built; see Spec 76 §3.1 DEFERRED.)
    const message = process.env.NODE_ENV === 'production'
      ? 'Feed query failed'
      : sanitizePgErrorMessage(error.message);
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message }, meta: null },
      { status: 500 },
    );
  }
});
