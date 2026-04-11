// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §3.1
//
// GET /api/admin/leads/health — aggregated lead feed health metrics.
// Admin-only (middleware classifies /api/admin/** as 'admin').

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import {
  getLeadFeedReadiness,
  getCostCoverage,
  getEngagement,
  sanitizePgErrorMessage,
  type LeadFeedHealthResponse,
} from '@/lib/admin/lead-feed-health';

const TAG = '[api/admin/leads/health]';

export async function GET() {
  try {
    const [readiness, costCoverage, engagement] = await Promise.all([
      getLeadFeedReadiness(pool),
      getCostCoverage(pool),
      getEngagement(pool),
    ]);

    // WF3 2026-04-10 Phase 1: derive the permit-scoped coverage metric from
    // values already fetched by getLeadFeedReadiness. Keeps the extra metric
    // free of any new DB round-trips. Guards against division-by-zero on a
    // fresh DB (active_permits === 0).
    //
    // Predicate mismatch note: `permits_with_cost` counts cost_estimates
    // rows with `estimated_cost IS NOT NULL` (any permit status); while
    // `active_permits` counts permits in the ADMIN_ACTIVE status inclusion
    // list. If cost_estimates lags behind permit cancellations, the numerator
    // can include rows for permits that are now Cancelled/Revoked/Closed,
    // producing a value > 100%. The display is NOT capped — showing > 100%
    // is an honest signal that the cost cache has drifted from the permit
    // state, which is actionable information. Capping would hide the drift.
    // (Flagged by adversarial + independent reviews; scope-limited per
    // review_followups.md.)
    const coveragePctVsActivePermits = readiness.active_permits > 0
      ? Math.round((readiness.permits_with_cost / readiness.active_permits) * 1000) / 10
      : 0;

    const response: LeadFeedHealthResponse = {
      readiness,
      cost_coverage: {
        ...costCoverage,
        coverage_pct_vs_active_permits: coveragePctVsActivePermits,
      },
      engagement,
      performance: {
        avg_latency_ms: null,
        p95_latency_ms: null,
        error_rate_pct: null,
        avg_results_per_query: null,
      },
    };

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
