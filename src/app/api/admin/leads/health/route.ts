// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.1
//
// GET /api/admin/leads/health — aggregated lead feed health metrics.
// Admin-only (middleware classifies /api/admin/** as 'admin').
//
// WF3 2026-04-10 Phase 2: the fetch path is wrapped by
// `getCachedLeadFeedHealth` which provides a 30s in-memory cache and
// single-flight guard. The handler is a thin shell — all the Phase 1 dual-
// coverage derivation logic now lives in the cached fetcher so cache hits
// serve the same shape as cache misses.

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import {
  getCachedLeadFeedHealth,
  sanitizePgErrorMessage,
} from '@/lib/admin/lead-feed-health';

const TAG = '[api/admin/leads/health]';

export async function GET() {
  try {
    const response = await getCachedLeadFeedHealth(pool);
    return NextResponse.json(response);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(TAG, error, { phase: 'handler' });
    // Return the actual error message in non-production environments so
    // operators can diagnose without digging through server logs. In
    // production, keep the generic message to avoid leaking internals.
    // WF3 2026-04-10: opaque 500s hid a pool exhaustion bug for 3+ commits.
    // Dev-mode messages are passed through `sanitizePgErrorMessage` so that
    // pg connection-string credentials never reach the client.
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : sanitizePgErrorMessage(error.message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
