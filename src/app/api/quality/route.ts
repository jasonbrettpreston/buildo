import { NextResponse } from 'next/server';
import { getQualityData } from '@/lib/quality/metrics';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import {
  detectVolumeAnomalies,
  detectSchemaDrift,
  detectDurationAnomalies,
  detectEngineHealthIssues,
  computeSystemHealth,
  PipelineFailure,
} from '@/lib/quality/types';
import type { EngineHealthEntry, EngineHealthAnomaly } from '@/lib/quality/types';

/**
 * GET /api/quality - Return the latest snapshot + last 30 days of trend data,
 * plus computed anomalies and system health summary.
 */
export const GET = withApiEnvelope(async function GET() {
  try {
    const data = await getQualityData();

    // Compute anomalies from trends
    const anomalies = data.trends.length > 0
      ? detectVolumeAnomalies(data.trends)
      : [];

    // Compute schema drift from last two snapshots
    const schemaDrift = data.trends.length >= 2 && data.trends[0] && data.trends[1]
      ? detectSchemaDrift(
          data.trends[0].schema_column_counts,
          data.trends[1].schema_column_counts
        )
      : [];

    // Compute duration anomalies from pipeline_runs (last 8 runs per pipeline)
    let durationAnomalies: import('@/lib/quality/types').DurationAnomaly[] = [];
    try {
      const durationRows = await query<{ pipeline: string; duration_ms: number }>(
        `SELECT base_pipeline AS pipeline, duration_ms
         FROM (
           SELECT CASE WHEN pipeline LIKE '%:%'
                       THEN SPLIT_PART(pipeline, ':', 2)
                       ELSE pipeline END AS base_pipeline,
                  duration_ms,
                  ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN pipeline LIKE '%:%'
                                      THEN SPLIT_PART(pipeline, ':', 2)
                                      ELSE pipeline END
                    ORDER BY started_at DESC
                  ) AS rn
           FROM pipeline_runs
           WHERE status = 'completed' AND duration_ms IS NOT NULL
             AND pipeline NOT LIKE '%classify_scope_class%'
             AND pipeline NOT LIKE '%classify_scope_tags%'
         ) sub
         WHERE rn <= 8
         ORDER BY base_pipeline, rn`
      );
      const runsByPipeline: Record<string, number[]> = {};
      for (const row of durationRows) {
        const arr = runsByPipeline[row.pipeline] ?? [];
        arr.push(row.duration_ms);
        runsByPipeline[row.pipeline] = arr;
      }
      durationAnomalies = detectDurationAnomalies(runsByPipeline);
    } catch {
      // pipeline_runs table may not exist yet — skip duration anomalies
    }

    // Query pipeline failures — only pipelines whose LATEST run is 'failed'
    // (not historical 24h failures that may have been successfully rerun since)
    // Normalize chain-prefixed names (e.g. "permits:assert_schema" → "assert_schema")
    // so a successful chain run supersedes a stale standalone failure.
    let pipelineFailures: PipelineFailure[] = [];
    try {
      const failureRows = await query<{ pipeline: string; error_message: string; failed_at: string }>(
        `SELECT base_pipeline AS pipeline, error_message, failed_at
         FROM (
           SELECT DISTINCT ON (base_pipeline)
                  CASE WHEN pipeline LIKE '%:%'
                       THEN SPLIT_PART(pipeline, ':', 2)
                       ELSE pipeline END AS base_pipeline,
                  status, error_message, started_at AS failed_at
           FROM pipeline_runs
           ORDER BY base_pipeline, started_at DESC
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

    // Query engine health from pg_stat_user_tables
    let engineHealthEntries: EngineHealthEntry[] = [];
    let engineHealthAnomalies: EngineHealthAnomaly[] = [];
    try {
      const engineRows = await query<{
        table_name: string;
        n_live_tup: string;
        n_dead_tup: string;
        seq_scan: string;
        idx_scan: string;
      }>(
        `SELECT relname AS table_name,
                n_live_tup::bigint::text AS n_live_tup,
                n_dead_tup::bigint::text AS n_dead_tup,
                seq_scan::bigint::text AS seq_scan,
                idx_scan::bigint::text AS idx_scan
         FROM pg_stat_user_tables
         WHERE relname = ANY($1)
         ORDER BY relname`,
        [['permits', 'entities', 'coa_applications', 'parcels', 'address_points',
          'building_footprints', 'neighbourhoods', 'permit_trades', 'permit_parcels',
          'parcel_buildings', 'wsib_registry']]
      );
      engineHealthEntries = engineRows.map((r) => {
        const live = parseInt(r.n_live_tup, 10) || 0;
        const dead = parseInt(r.n_dead_tup, 10) || 0;
        const seq = parseInt(r.seq_scan, 10) || 0;
        const idx = parseInt(r.idx_scan, 10) || 0;
        return {
          table_name: r.table_name,
          n_live_tup: live,
          n_dead_tup: dead,
          dead_ratio: live > 0 ? Math.round((dead / live) * 10000) / 10000 : 0,
          seq_scan: seq,
          idx_scan: idx,
          seq_ratio: (seq + idx) > 0 ? Math.round((seq / (seq + idx)) * 10000) / 10000 : 0,
        };
      });
      engineHealthAnomalies = detectEngineHealthIssues(engineHealthEntries);
    } catch {
      // pg_stat_user_tables query may fail — skip engine health
    }

    // Compute system health
    const health = data.current
      ? computeSystemHealth(data.current, anomalies, schemaDrift, durationAnomalies, pipelineFailures, engineHealthAnomalies)
      : { level: 'red' as const, issues: ['No snapshot data'], warnings: [] };

    return NextResponse.json({
      ...data,
      anomalies,
      schemaDrift,
      health,
      engineHealth: engineHealthEntries,
      engineHealthAnomalies,
    });
  } catch (err) {
    logError('[api/quality]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch data quality metrics' },
      { status: 500 }
    );
  }
});
