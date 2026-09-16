import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import {
  getReferenceMonth,
  fetchKpi,
  fetchActivity,
  fetchTrades,
  fetchResidentialVsCommercial,
  fetchScopeTagsSegmented,
  fetchNeighbourhoods,
} from '@/lib/market-metrics/queries';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  // Spec 33 §8 — per-route admin guard, FIRST statement. Middleware only
  // presence-checks a credential; it authorizes nothing.
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

  try {
    const refMonth = await getReferenceMonth();

    const [kpi, activity, trades, residential_vs_commercial, scope_tags, neighbourhoods] =
      await Promise.all([
        fetchKpi(refMonth),
        fetchActivity(),
        fetchTrades(refMonth),
        fetchResidentialVsCommercial(),
        fetchScopeTagsSegmented(refMonth),
        fetchNeighbourhoods(),
      ]);

    return NextResponse.json({
      kpi,
      activity,
      trades,
      residential_vs_commercial,
      scope_tags,
      neighbourhoods,
    });
  } catch (err) {
    logError('[admin/market-metrics]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch market metrics' },
      { status: 500 }
    );
  }
});
