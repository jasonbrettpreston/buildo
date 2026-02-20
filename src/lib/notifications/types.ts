// ---------------------------------------------------------------------------
// Notification types and interfaces
// ---------------------------------------------------------------------------

/**
 * The four categories of notification the system can produce.
 *
 * - `new_lead`       A newly-classified permit matches the user's preferences.
 * - `status_change`  A saved permit's status changed since the last sync.
 * - `weekly_digest`  Aggregated summary of leads over the past week.
 * - `system`         Platform announcements, billing, etc.
 */
export type NotificationType =
  | 'new_lead'
  | 'status_change'
  | 'weekly_digest'
  | 'system';

/**
 * Delivery channel for a notification row.
 */
export type NotificationChannel = 'in_app' | 'email' | 'push';

/**
 * Database row shape for the `notifications` table.
 *
 * Column mapping mirrors migration 010_notifications.sql exactly:
 *   is_read  -> read
 *   is_sent  -> sent
 */
export interface Notification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  permit_num: string | null;
  trade_slug: string | null;
  channel: NotificationChannel;
  read: boolean;
  sent: boolean;
  sent_at: Date | null;
  created_at: Date;
}

/**
 * Payload accepted by `createNotification`. Fields that have database
 * defaults (id, read, sent, sent_at, created_at) are omitted.
 */
export interface NotificationPayload {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  permit_num?: string;
  trade_slug?: string;
  channel?: NotificationChannel;
}
