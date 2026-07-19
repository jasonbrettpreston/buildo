// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2 + §3
//
// POST /api/admin/notifications/test-send — sends ONE real Expo push (the
// TestFeedTool pattern: real engine path, ticket returned in `_debug`).
//
// Auth: verifyAdminAuth FIRST LINE, and additionally authMethod === 'session'
// (Spec 33 §8.1 — a side-effecting send needs per-admin identity; the shared
// admin_key / dev_bypass sentinels get 403).
//
// Deliberately OUT-OF-BAND: no notification_dispatches ledger row and no
// notifications queue row — a test push must not consume the target's
// once-per-day dedup tuple or count against their daily throttle.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { track } from '@/lib/admin/analytics';
import { maskPushToken } from '@/lib/admin/mask-push-token';

const TAG = '[api/admin/notifications/test-send]';

/** Spec 35 §7.3 — PostHog gets a HASHED uid, never the raw one. */
function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

const bodySchema = z.object({
  // Either an explicit token, or a user_id whose most-recent device we target.
  push_token: z.string().regex(/^ExponentPushToken\[.+\]$/).optional(),
  // uuid ([P1-F6 fold]): user ids are Supabase auth uuids post-Phase-1.
  user_id: z.string().uuid().optional(),
  title: z.string().min(1).max(120).default('Buildo test notification'),
  body: z.string().min(1).max(300).default('Test push from the admin Notifications tool. Tap to open the flight board.'),
}).refine((b) => b.push_token || b.user_id, {
  message: 'Provide push_token or user_id',
});

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }
  // Side-effecting send → per-admin identity required (Spec 33 §8.1).
  if (adminCtx.authMethod !== 'session') {
    return NextResponse.json(
      { data: null, error: { code: 'SESSION_REQUIRED', message: 'Test-send requires a per-admin session (admin_key/dev_bypass are shared identities)' }, meta: null },
      { status: 403 },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_FAILED', message: 'Invalid body', details: parsed.error.flatten().fieldErrors }, meta: null },
        { status: 400 },
      );
    }
    const { push_token, user_id, title, body } = parsed.data;

    let targetToken = push_token ?? null;
    if (!targetToken && user_id) {
      const { rows } = await pool.query<{ push_token: string }>(
        'SELECT push_token FROM device_tokens WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
        [user_id],
      );
      targetToken = rows[0]?.push_token ?? null;
      if (!targetToken) {
        return NextResponse.json(
          { data: null, error: { code: 'NO_DEVICE', message: 'User has no registered device token' }, meta: null },
          { status: 404 },
        );
      }
    }

    // The REAL transport — the same hardened module the chain dispatcher uses
    // (scripts/lib/push-dispatch.js; allowJs import). A canonical
    // LIFECYCLE_PHASE_CHANGED-shaped payload so the runbook smoke test
    // (test-send → device tap → board detail) exercises the true routing path.
    const { sendPushChunk } = (await import(
      '../../../../../../scripts/lib/push-dispatch.js'
    )) as { sendPushChunk: (msgs: unknown[], opts?: unknown) => Promise<{ tickets: Array<{ status?: string; id?: string | null; error?: string | null; message?: string | null }> }> };

    const start = Date.now();
    const { tickets } = await sendPushChunk([
      {
        to: targetToken,
        title,
        body,
        data: {
          notification_type: 'LIFECYCLE_PHASE_CHANGED',
          route_domain: 'flight_board',
          entity_id: null, // test push — routes to the board, no specific job
          urgency: 'normal',
          _test_send: true,
        },
      },
    ]);
    const durationMs = Date.now() - start;
    const ticket = tickets[0] ?? null;

    void track(hashAdminUid(adminCtx.uid), 'admin_action_performed', {
      action: 'notification_test_send',
      result: ticket?.status === 'ok' ? 'ok' : 'error',
      duration_ms: durationMs,
    });

    return NextResponse.json({
      data: { sent: ticket?.status === 'ok', token: maskPushToken(targetToken) },
      error: null,
      meta: null,
      _debug: {
        ticket_id: ticket?.id ?? null,
        ticket_status: ticket?.status ?? null,
        error_message: ticket?.error ? `${ticket.error}: ${ticket.message ?? ''}` : null,
        duration_ms: durationMs,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(TAG, error, { phase: 'handler' });
    // Expo transport failures land here (non-2xx / top-level errors) — show the
    // message; it contains no secrets (the token is in the REQUEST, not the error).
    return NextResponse.json(
      { data: null, error: { code: 'SEND_FAILED', message: error.message.slice(0, 300) }, meta: null },
      { status: 502 },
    );
  }
});
