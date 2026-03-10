import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

/**
 * GET /api/admin/pipelines/status — Lightweight pipeline status for polling.
 *
 * Returns only `pipeline_last_run` (latest status per pipeline slug).
 * This is the same DISTINCT ON query used by /api/admin/stats but without
 * the 30+ count queries, so it responds in ~5ms even under pipeline load.
 *
 * Used by DataQualityDashboard polling loop to update runningPipelines
 * without timing out during heavy pipeline execution.
 */
export async function GET() {
  try {
    const pipelineLastRun: Record<string, {
      last_run_at: string | null;
      status: string | null;
      duration_ms: number | null;
      error_message: string | null;
      records_total: number | null;
      records_new: number | null;
      records_updated: number | null;
      records_meta: Record<string, unknown> | null;
    }> = {};

    try {
      let pipelineRows: Array<{
        pipeline: string;
        started_at: Date;
        status: string;
        duration_ms: number | null;
        error_message: string | null;
        records_total: number | null;
        records_new: number | null;
        records_updated: number | null;
        records_meta: Record<string, unknown> | null;
      }>;
      try {
        pipelineRows = await query(
          `SELECT DISTINCT ON (pipeline) pipeline, started_at, status,
                  duration_ms, error_message, records_total, records_new, records_updated, records_meta
           FROM pipeline_runs
           ORDER BY pipeline, started_at DESC`
        );
      } catch {
        // Fallback: records_meta column may not exist yet (migration 041)
        pipelineRows = (await query<{
          pipeline: string;
          started_at: Date;
          status: string;
          duration_ms: number | null;
          error_message: string | null;
          records_total: number | null;
          records_new: number | null;
          records_updated: number | null;
        }>(
          `SELECT DISTINCT ON (pipeline) pipeline, started_at, status,
                  duration_ms, error_message, records_total, records_new, records_updated
           FROM pipeline_runs
           ORDER BY pipeline, started_at DESC`
        )).map(r => ({ ...r, records_meta: null }));
      }
      for (const row of pipelineRows) {
        pipelineLastRun[row.pipeline] = {
          last_run_at: row.started_at ? new Date(row.started_at).toISOString() : null,
          status: row.status,
          duration_ms: row.duration_ms,
          error_message: row.error_message,
          records_total: row.records_total,
          records_new: row.records_new,
          records_updated: row.records_updated,
          records_meta: row.records_meta ?? null,
        };
      }
    } catch {
      // pipeline_runs table may not exist yet — return empty object
    }

    return NextResponse.json({ pipeline_last_run: pipelineLastRun });
  } catch (err) {
    logError('[admin/pipelines/status]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch pipeline status' },
      { status: 500 }
    );
  }
}
