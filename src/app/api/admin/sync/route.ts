import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

/**
 * GET /api/admin/sync - Return the last 20 sync runs ordered by most recent.
 */
export async function GET() {
  try {
    const runs = await query(
      `SELECT
        id, started_at, completed_at, status,
        records_total, records_new, records_updated,
        records_unchanged, records_errors, error_message,
        snapshot_path, duration_ms
      FROM sync_runs
      ORDER BY started_at DESC
      LIMIT 20`
    );

    return NextResponse.json({ runs });
  } catch (err) {
    console.error('[admin/sync] Error fetching sync runs:', err);
    return NextResponse.json(
      { error: 'Failed to fetch sync runs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sync - Trigger a new sync run.
 *
 * Body: { file_path: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const filePath = body.file_path;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { error: 'file_path is required and must be a string' },
        { status: 400 }
      );
    }

    const { runSync } = await import('@/lib/sync/process');
    const result = await runSync(filePath);

    return NextResponse.json({ sync_run: result });
  } catch (err) {
    console.error('[admin/sync] Error triggering sync:', err);
    return NextResponse.json(
      {
        error: 'Sync failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
