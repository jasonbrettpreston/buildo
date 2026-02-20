// ---------------------------------------------------------------------------
// Notification persistence layer (PostgreSQL)
// ---------------------------------------------------------------------------

import { query } from '@/lib/db/client';
import type {
  Notification,
  NotificationPayload,
  NotificationChannel,
} from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/** Map a raw database row to the public Notification interface. */
function toNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as number,
    user_id: row.user_id as string,
    type: row.type as Notification['type'],
    title: row.title as string,
    body: row.body as string,
    permit_num: (row.permit_num as string) ?? null,
    trade_slug: (row.trade_slug as string) ?? null,
    channel: (row.channel as NotificationChannel) ?? 'in_app',
    read: row.is_read as boolean,
    sent: row.is_sent as boolean,
    sent_at: row.sent_at ? new Date(row.sent_at as string) : null,
    created_at: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Insert a new notification row and return the full record.
 */
export async function createNotification(
  payload: NotificationPayload
): Promise<Notification> {
  const rows = await query(
    `INSERT INTO notifications (user_id, type, title, body, permit_num, trade_slug, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      payload.user_id,
      payload.type,
      payload.title,
      payload.body,
      payload.permit_num ?? null,
      payload.trade_slug ?? null,
      payload.channel ?? 'in_app',
    ]
  );

  return toNotification(rows[0] as Record<string, unknown>);
}

/**
 * Retrieve notifications for a user, optionally filtering to unread only.
 *
 * Results are ordered by `created_at DESC` (newest first).
 */
export async function getUserNotifications(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<Notification[]> {
  const { unreadOnly = false, limit = 50, offset = 0 } = options ?? {};

  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (unreadOnly) {
    conditions.push('is_read = false');
  }

  const where = conditions.join(' AND ');

  const rows = await query(
    `SELECT * FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return rows.map((r) => toNotification(r as Record<string, unknown>));
}

/**
 * Mark a single notification as read.
 *
 * The `userId` parameter is included in the WHERE clause so that users
 * cannot mark other users' notifications.
 */
export async function markAsRead(
  notificationId: number,
  userId: string
): Promise<void> {
  await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

/**
 * Mark every unread notification for a user as read.
 *
 * @returns The number of rows that were updated.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const rows = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false
     RETURNING id`,
    [userId]
  );

  return rows.length;
}

/**
 * Fetch notifications that have not yet been dispatched via their external
 * channel (email or push). These are rows where `is_sent = false` and
 * `channel != 'in_app'` (in-app notifications are "sent" immediately on
 * creation).
 */
export async function getUnsentNotifications(
  limit = 100
): Promise<Notification[]> {
  const rows = await query(
    `SELECT * FROM notifications
     WHERE is_sent = false AND channel != 'in_app'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  return rows.map((r) => toNotification(r as Record<string, unknown>));
}

/**
 * Mark a notification as successfully sent and record the timestamp.
 */
export async function markAsSent(notificationId: number): Promise<void> {
  await query(
    `UPDATE notifications
     SET is_sent = true, sent_at = NOW()
     WHERE id = $1`,
    [notificationId]
  );
}
