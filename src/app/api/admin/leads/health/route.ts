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

    const response: LeadFeedHealthResponse = {
      readiness,
      cost_coverage: costCoverage,
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
    logError(TAG, err instanceof Error ? err : new Error(String(err)), { phase: 'handler' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
