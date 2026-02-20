import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  const unreadOnly = searchParams.get('unread_only') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

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
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { notification_id, user_id, action } = body;

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  if (action === 'mark_all_read') {
    const result = await query<{ id: number }>(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [user_id]
    );
    return NextResponse.json({ updated: result.length });
  }

  if (action === 'mark_read' && notification_id) {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [notification_id, user_id]
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
