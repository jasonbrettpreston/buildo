import { NextResponse } from 'next/server';
import { getQualityData } from '@/lib/quality/metrics';
import {
  detectVolumeAnomalies,
  detectSchemaDrift,
  computeSystemHealth,
} from '@/lib/quality/types';

/**
 * GET /api/quality - Return the latest snapshot + last 30 days of trend data,
 * plus computed anomalies and system health summary.
 */
export async function GET() {
  try {
    const data = await getQualityData();

    // Compute anomalies from trends
    const anomalies = data.trends.length > 0
      ? detectVolumeAnomalies(data.trends)
      : [];

    // Compute schema drift from last two snapshots
    const schemaDrift = data.trends.length >= 2
      ? detectSchemaDrift(
          data.trends[0].schema_column_counts,
          data.trends[1].schema_column_counts
        )
      : [];

    // Compute system health
    const health = data.current
      ? computeSystemHealth(data.current, anomalies, schemaDrift)
      : { level: 'red' as const, issues: ['No snapshot data'], warnings: [] };

    return NextResponse.json({
      ...data,
      anomalies,
      schemaDrift,
      health,
    });
  } catch (err) {
    console.error('[api/quality] Error fetching quality data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch data quality metrics' },
      { status: 500 }
    );
  }
}
