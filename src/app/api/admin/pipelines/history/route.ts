import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

/**
 * GET /api/admin/pipelines/history?slug=load_permits&limit=10
 *
 * Returns the last N runs for a pipeline slug, used for T5 sparklines.
 * Includes duration, record counts, status, and telemetry for each run.
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */

export interface PipelineHistoryRun {
  started_at: string;
  completed_at: string | null;
  status: string;
  duration_ms: number | null;
  records_total: number | null;
  records_new: number | null;
  records_updated: number | null;
  records_meta: Record<string, unknown> | null;
}

export interface PipelineHistoryResponse {
  slug: string;
  runs: PipelineHistoryRun[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { error: 'Missing required parameter: slug' },
        { status: 400 }
      );
    }

    const limitParam = parseInt(searchParams.get('limit') ?? '10', 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 10 : limitParam), 50);

    const rows = await query<{
      started_at: string;
      completed_at: string | null;
      status: string;
      duration_ms: number | null;
      records_total: number | null;
      records_new: number | null;
      records_updated: number | null;
      records_meta: Record<string, unknown> | null;
    }>(
      `SELECT started_at, completed_at, status, duration_ms,
              records_total, records_new, records_updated, records_meta
       FROM pipeline_runs
       WHERE pipeline = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [slug, limit]
    );

    const response: PipelineHistoryResponse = {
      slug,
      runs: rows.map((r) => ({
        started_at: r.started_at,
        completed_at: r.completed_at,
        status: r.status,
        duration_ms: r.duration_ms,
        records_total: r.records_total,
        records_new: r.records_new,
        records_updated: r.records_updated,
        records_meta: r.records_meta,
      })),
    };

    return NextResponse.json(response);
  } catch (err) {
    logError('[admin/pipelines/history]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch pipeline history' },
      { status: 500 }
    );
  }
}
