import { NextRequest, NextResponse } from 'next/server';
import { query, pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { unauthorized, sessionRequired } from '@/lib/admin/admin-responses';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { writeAdminAudit } from '@/lib/admin/admin-audit';

/**
 * GET /api/admin/sync - Return the last 20 sync runs ordered by most recent.
 */
export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();

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
    logError('[admin/sync]', err, { handler: 'GET' });
    return NextResponse.json(
      { error: 'Failed to fetch sync runs' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/sync - Trigger a new sync run.
 *
 * Body: { file_path: string }
 */
export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorized();
  if (adminCtx.authMethod !== 'session') return sessionRequired(adminCtx, '/api/admin/sync');

  try {
    const body = await request.json();
    const filePath = body.file_path;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { error: 'file_path is required and must be a string' },
        { status: 400 }
      );
    }

    // Audit BEFORE the side effect: `runSync` owns its own transactions and
    // ingests a whole snapshot file, so there is no single transaction to
    // enclose the audit row in. Recorded intent with no run is the safe
    // failure direction; a run with no record is the compliance hole.
    await writeAdminAudit(
      {
        adminUid: adminCtx.uid,
        action: 'sync_run_trigger',
        targetUid: null,
        newValue: { file_path: filePath },
        reason: 'Admin triggered a snapshot sync run',
      },
      pool,
    );

    const { runSync } = await import('@/lib/sync/process');
    const result = await runSync(filePath);

    return NextResponse.json({ sync_run: result });
  } catch (err) {
    logError('[admin/sync]', err, { handler: 'POST' });
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
});
