import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';

/**
 * GET /api/sync - Fetch recent sync run history
 */
export async function GET() {
  try {
    const runs = await query(
      `SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20`
    );

    return NextResponse.json({ runs });
  } catch (err) {
    logError('[api/sync]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync - Trigger a new sync run
 * Body: { file_path: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const filePath = body.file_path;

    if (!filePath) {
      return NextResponse.json(
        { error: 'file_path is required' },
        { status: 400 }
      );
    }

    // Import dynamically to avoid loading sync machinery on every API request
    const { runSync } = await import('@/lib/sync/process');
    const result = await runSync(filePath);

    return NextResponse.json({ sync_run: result });
  } catch (err) {
    logError('[api/sync]', err, { handler: 'POST' });
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
