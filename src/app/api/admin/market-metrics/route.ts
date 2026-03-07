import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import {
  getReferenceMonth,
  fetchKpi,
  fetchActivity,
  fetchTrades,
  fetchResidentialVsCommercial,
  fetchScopeTagsSegmented,
  fetchNeighbourhoods,
} from '@/lib/market-metrics/queries';

export async function GET() {
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
}
