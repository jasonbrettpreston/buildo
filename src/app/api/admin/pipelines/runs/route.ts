import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

interface PipelineRunRow {
  id: number;
  pipeline: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  records_total: number;
  records_new: number;
  records_updated: number;
}

/**
 * GET /api/admin/pipelines/runs — Paginated pipeline run history.
 *
 * Query params:
 *   pipeline  — filter by pipeline slug (optional)
 *   status    — filter by status: running|completed|failed (optional)
 *   limit     — page size, default 25, max 100
 *   offset    — pagination offset, default 0
 */
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pipeline = searchParams.get('pipeline');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10) || 25, 100);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  const validStatus = status && ['running', 'completed', 'failed'].includes(status) ? status : null;

  const [rows, countRows] = await Promise.all([
    query<PipelineRunRow>(
      `SELECT id, pipeline, started_at, completed_at, status, duration_ms,
              error_message, records_total, records_new, records_updated
       FROM pipeline_runs
       WHERE ($1::text IS NULL OR pipeline = $1)
         AND ($2::text IS NULL OR status = $2)
       ORDER BY started_at DESC
       LIMIT $3 OFFSET $4`,
      [pipeline ?? null, validStatus, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM pipeline_runs
       WHERE ($1::text IS NULL OR pipeline = $1)
         AND ($2::text IS NULL OR status = $2)`,
      [pipeline ?? null, validStatus]
    ),
  ]);

  return NextResponse.json({
    runs: rows,
    total: parseInt(countRows[0]?.count ?? '0', 10),
    limit,
    offset,
  });
});
