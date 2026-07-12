// 🔗 SPEC LINK: docs/specs/02-web-admin/102_admin_notifications_tool.md §2
//
// GET /api/admin/notifications — the dispatch log (Spec 101 ledger LEFT JOIN
// the queue for title/body context), newest first, paginated. Optional
// `user_id` filter additionally returns that user's masked device tokens +
// notification prefs + last dispatch (powers the user-detail NotificationsCard).
//
// Tokens are ALWAYS masked (last 6 chars) — a full Expo push token lets anyone
// send pushes to the device; it never leaves the server.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { maskPushToken } from '@/lib/admin/mask-push-token';

const TAG = '[api/admin/notifications]';

const querySchema = z.object({
  user_id: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface DispatchRow {
  id: number;
  user_id: string;
  lead_id: string;
  type: string;
  toronto_date: string;
  push_token: string | null;
  expo_ticket_id: string | null;
  status: string;
  detail: string | null;
  dispatched_at: string;
  title: string | null;
  body: string | null;
}

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_FAILED', message: 'Invalid parameters', details: parsed.error.flatten().fieldErrors }, meta: null },
        { status: 400 },
      );
    }
    const { user_id, limit, offset } = parsed.data;

    const where = user_id ? 'WHERE d.user_id = $3' : '';
    const params: unknown[] = user_id ? [limit, offset, user_id] : [limit, offset];

    // The ledger is the spine; the queue row (matched on the dedup identity)
    // supplies human-readable context. DISTINCT ON keeps one queue match.
    const { rows } = await pool.query<DispatchRow>(
      `SELECT d.id, d.user_id, d.lead_id, d.type, d.toronto_date::text,
              d.push_token, d.expo_ticket_id, d.status, d.detail,
              d.dispatched_at::text,
              n.title, n.body
         FROM notification_dispatches d
         LEFT JOIN LATERAL (
           SELECT title, body FROM notifications n
            WHERE n.user_id = d.user_id AND n.type = d.type
              AND n.lead_id = d.lead_id
            ORDER BY n.created_at DESC LIMIT 1
         ) n ON true
         ${where}
        ORDER BY d.dispatched_at DESC
        LIMIT $1 OFFSET $2`,
      params,
    );

    const countRes = await pool.query<{ count: string }>(
      user_id
        ? 'SELECT COUNT(*)::text AS count FROM notification_dispatches WHERE user_id = $1'
        : 'SELECT COUNT(*)::text AS count FROM notification_dispatches',
      user_id ? [user_id] : [],
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const dispatches = rows.map((r) => ({ ...r, push_token: maskPushToken(r.push_token) }));

    // Per-user block for the detail card.
    let user: unknown = null;
    if (user_id) {
      const [tokensRes, prefsRes] = await Promise.all([
        pool.query<{ push_token: string; platform: string; updated_at: string }>(
          'SELECT push_token, platform, updated_at::text FROM device_tokens WHERE user_id = $1 ORDER BY updated_at DESC',
          [user_id],
        ),
        pool.query(
          `SELECT phase_changed, lifecycle_stalled_pref, start_date_urgent,
                  notification_schedule, new_lead_min_cost_tier
             FROM user_profiles WHERE user_id = $1`,
          [user_id],
        ),
      ]);
      user = {
        tokens: tokensRes.rows.map((t) => ({
          push_token: maskPushToken(t.push_token),
          platform: t.platform,
          updated_at: t.updated_at,
        })),
        prefs: prefsRes.rows[0] ?? null,
        last_dispatch: dispatches[0] ?? null,
      };
    }

    // READ-ONLY kill-switch/throttle status (Spec 102 §2 — the write path stays
    // the Spec 86 Control Panel; this tool only surfaces + deep-links).
    const gatesRes = await pool.query<{ variable_key: string; variable_value: string | number | null; variable_value_json: unknown }>(
      `SELECT variable_key, variable_value, variable_value_json
         FROM logic_variables
        WHERE variable_key IN ('notifications_dispatch_enabled', 'notifications_max_per_user_per_day', 'notifications_disabled_types')`,
    );
    const gates: Record<string, unknown> = {};
    for (const g of gatesRes.rows) {
      gates[g.variable_key] = g.variable_key === 'notifications_disabled_types'
        ? (g.variable_value_json ?? [])
        : g.variable_value;
    }

    return NextResponse.json({
      data: { dispatches, user },
      error: null,
      meta: { total, limit, offset, gates },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logError(TAG, error, { phase: 'handler' });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Dispatch log query failed' }, meta: null },
      { status: 500 },
    );
  }
});
