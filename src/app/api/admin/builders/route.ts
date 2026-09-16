import { NextRequest, NextResponse } from 'next/server';
import { query, pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';

/**
 * GET /api/admin/builders - Return builder enrichment queue statistics.
 */
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  try {
    const [stats] = await query<{
      total: string;
      enriched: string;
      unenriched: string;
      failed_count: string;
    }>(
      `SELECT
        COUNT(*)::text                                    AS total,
        COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL)::text AS enriched,
        COUNT(*) FILTER (WHERE last_enriched_at IS NULL)::text     AS unenriched,
        COUNT(*) FILTER (
          WHERE last_enriched_at IS NOT NULL
            AND google_place_id IS NULL
        )::text AS failed_count
      FROM entities`
    );

    return NextResponse.json({
      total: parseInt(stats?.total ?? '0', 10),
      enriched: parseInt(stats?.enriched ?? '0', 10),
      unenriched: parseInt(stats?.unenriched ?? '0', 10),
      failed_count: parseInt(stats?.failed_count ?? '0', 10),
    });
  } catch (err) {
    logError('[admin/builders]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch builder enrichment stats' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/builders - Trigger a builder enrichment batch.
 *
 * Body (optional): { limit?: number }
 */
export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/builders');

  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === 'number' && body.limit > 0
      ? Math.min(body.limit, 200)
      : 50;

    // Audit BEFORE the side effect. `enrichUnenrichedBuilders` owns its own
    // transactions and calls an external enrichment API, so there is no
    // single transaction to enclose the audit row in. Writing the row first
    // means the failure direction is a recorded intent with no mutation —
    // never a mutation with no record (admin-audit.ts:56-58).
    await writeAdminAudit(
      {
        adminUid: adminCtx.uid,
        action: 'builder_enrichment_batch',
        targetUid: null,
        newValue: { limit },
        reason: 'Admin triggered a builder enrichment batch',
      },
      pool,
    );

    const { enrichUnenrichedBuilders } = await import('@/lib/builders/enrichment');
    const result = await enrichUnenrichedBuilders(limit);

    return NextResponse.json({
      message: 'Enrichment batch completed',
      enriched: result.enriched,
      failed: result.failed,
    });
  } catch (err) {
    logError('[admin/builders]', err, { handler: 'POST' });
    return NextResponse.json(
      { error: 'Enrichment batch failed' },
      { status: 500 }
    );
  }
});
