import { NextResponse } from 'next/server';
import { getQualityData } from '@/lib/quality/metrics';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import {
  detectVolumeAnomalies,
  detectSchemaDrift,
  detectDurationAnomalies,
  computeSystemHealth,
  PipelineFailure,
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

    // Compute duration anomalies from pipeline_runs (last 8 runs per pipeline)
    let durationAnomalies: import('@/lib/quality/types').DurationAnomaly[] = [];
    try {
      const durationRows = await query<{ pipeline: string; duration_ms: number }>(
        `SELECT pipeline, duration_ms
         FROM (
           SELECT pipeline, duration_ms,
                  ROW_NUMBER() OVER (PARTITION BY pipeline ORDER BY started_at DESC) AS rn
           FROM pipeline_runs
           WHERE status = 'completed' AND duration_ms IS NOT NULL
         ) sub
         WHERE rn <= 8
         ORDER BY pipeline, rn`
      );
      const runsByPipeline: Record<string, number[]> = {};
      for (const row of durationRows) {
        if (!runsByPipeline[row.pipeline]) runsByPipeline[row.pipeline] = [];
        runsByPipeline[row.pipeline].push(row.duration_ms);
      }
      durationAnomalies = detectDurationAnomalies(runsByPipeline);
    } catch {
      // pipeline_runs table may not exist yet — skip duration anomalies
    }

    // Query pipeline failures — only pipelines whose LATEST run is 'failed'
    // (not historical 24h failures that may have been successfully rerun since)
    let pipelineFailures: PipelineFailure[] = [];
    try {
      const failureRows = await query<{ pipeline: string; error_message: string; failed_at: string }>(
        `SELECT pipeline, error_message, started_at AS failed_at
         FROM (
           SELECT DISTINCT ON (pipeline) pipeline, status, error_message, started_at
           FROM pipeline_runs
           ORDER BY pipeline, started_at DESC
         ) latest
         WHERE status = 'failed'`
      );
      pipelineFailures = failureRows.map((r) => ({
        pipeline: r.pipeline,
        error_message: r.error_message || 'Unknown error',
        failed_at: r.failed_at,
      }));
    } catch (err) {
      logError('[api/quality]', err, { phase: 'pipeline_failures' });
    }

    // Compute system health
    const health = data.current
      ? computeSystemHealth(data.current, anomalies, schemaDrift, durationAnomalies, pipelineFailures)
      : { level: 'red' as const, issues: ['No snapshot data'], warnings: [] };

    return NextResponse.json({
      ...data,
      anomalies,
      schemaDrift,
      health,
    });
  } catch (err) {
    logError('[api/quality]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch data quality metrics' },
      { status: 500 }
    );
  }
}
