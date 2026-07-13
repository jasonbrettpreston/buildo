// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §3 (Auth Matrix)
//
// GET  /api/notifications  — the authenticated user's notification history.
// PATCH /api/notifications — mark one / all of the caller's notifications read.
//
// SECURITY (P25 25A): the user identity is derived from the verified Firebase
// session, NOT from a client-supplied `user_id` query param. The pre-P25 handler
// trusted `searchParams.get('user_id')`, so any authenticated caller could read
// (or mark read) ANY user's notifications by passing a different id — a classic
// IDOR. The middleware already gates `/api/notifications` as `authenticated`
// (route-guard.ts:98); this handler now binds every query to the session uid.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const unreadOnly = searchParams.get('unread_only') === 'true';
  // Clamp + NaN-guard: a non-numeric ?limit/?offset (e.g. ?limit=abc) must not
  // reach the SQL as `LIMIT NaN` (P25 review — DeepSeek). offset is capped to
  // bound deep-pagination scans.
  const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(rawOffset) ? Math.min(Math.max(rawOffset, 0), 100_000) : 0;

  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];
  const paramIdx = 2;

  if (unreadOnly) {
    conditions.push('is_read = false');
  }

  const where = conditions.join(' AND ');

  const rows = await query(
    `SELECT * FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM notifications WHERE ${where}`,
    params
  );
  const total = parseInt(countResult[0]?.count || '0', 10);

  return NextResponse.json({
    notifications: rows,
    total,
    unread_count: unreadOnly
      ? total
      : parseInt(
          (
            await query<{ count: string }>(
              'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
              [userId]
            )
          )[0]?.count || '0',
          10
        ),
  });
});

export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  const userId = await getUserIdFromSession(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { notification_id, action } = body;

  if (action === 'mark_all_read') {
    const result = await query<{ id: number }>(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );
    return NextResponse.json({ updated: result.length });
  }

  if (action === 'mark_read' && notification_id) {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [notification_id, userId]
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
});
