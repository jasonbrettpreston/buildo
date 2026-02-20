import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

/**
 * GET /api/admin/builders - Return builder enrichment queue statistics.
 */
export async function GET() {
  try {
    const [stats] = await query<{
      total: string;
      enriched: string;
      unenriched: string;
      failed_count: string;
    }>(
      `SELECT
        COUNT(*)::text                                    AS total,
        COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)::text AS enriched,
        COUNT(*) FILTER (WHERE enriched_at IS NULL)::text     AS unenriched,
        COUNT(*) FILTER (
          WHERE enriched_at IS NOT NULL
            AND google_place_id IS NULL
        )::text AS failed_count
      FROM builders`
    );

    return NextResponse.json({
      total: parseInt(stats.total, 10),
      enriched: parseInt(stats.enriched, 10),
      unenriched: parseInt(stats.unenriched, 10),
      failed_count: parseInt(stats.failed_count, 10),
    });
  } catch (err) {
    console.error('[admin/builders] Error fetching enrichment stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch builder enrichment stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/builders - Trigger a builder enrichment batch.
 *
 * Body (optional): { limit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' && body.limit > 0
      ? Math.min(body.limit, 200)
      : 50;

    const { enrichUnenrichedBuilders } = await import('@/lib/builders/enrichment');
    const result = await enrichUnenrichedBuilders(limit);

    return NextResponse.json({
      message: 'Enrichment batch completed',
      enriched: result.enriched,
      failed: result.failed,
    });
  } catch (err) {
    console.error('[admin/builders] Error running enrichment batch:', err);
    return NextResponse.json(
      {
        error: 'Enrichment batch failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
