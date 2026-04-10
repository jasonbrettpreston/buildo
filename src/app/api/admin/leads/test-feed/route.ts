// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §3.2
//
// GET /api/admin/leads/test-feed — admin test feed endpoint.
// Bypasses user profile auth — constructs a synthetic LeadFeedInput.
// Returns the same data envelope as /api/leads/feed plus a _debug block.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { getLeadFeed } from '@/features/leads/lib/get-lead-feed';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '@/features/leads/lib/distance';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/features/leads/lib/get-lead-feed';
import { computeTestFeedDebug } from '@/lib/admin/lead-feed-health';

const TAG = '[api/admin/leads/test-feed]';

const testFeedSchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  trade_slug: z.string().min(1).max(50),
  radius_km: z.coerce.number().finite().positive().max(MAX_RADIUS_KM).default(DEFAULT_RADIUS_KM),
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = testFeedSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid parameters', details: parsed.error.flatten().fieldErrors }, meta: null },
        { status: 400 },
      );
    }
    const params = parsed.data;

    const start = Date.now();
    const result = await getLeadFeed(
      {
        user_id: 'admin-test',
        trade_slug: params.trade_slug,
        lat: params.lat,
        lng: params.lng,
        radius_km: params.radius_km,
        limit: params.limit,
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
    logError(TAG, err instanceof Error ? err : new Error(String(err)), { phase: 'handler' });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Feed query failed' }, meta: null },
      { status: 500 },
    );
  }
}
