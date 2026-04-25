// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
//
// GET  /api/notifications/preferences — returns the user's notification_prefs JSONB.
// PATCH /api/notifications/preferences — updates it (partial merge via jsonb ||).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

const NotificationPrefsSchema = z.object({
  new_lead_min_cost_tier: z.enum(['small', 'medium', 'large', 'major', 'mega']).optional(),
  phase_changed: z.boolean().optional(),
  lifecycle_stalled: z.boolean().optional(),
  start_date_urgent: z.boolean().optional(),
  notification_schedule: z.enum(['morning', 'anytime', 'evening']).optional(),
});

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query<{ notification_prefs: unknown }>(
      'SELECT notification_prefs FROM user_profiles WHERE user_id = $1',
      [userId],
    );

    const prefs = result.rows[0]?.notification_prefs ?? {
      new_lead_min_cost_tier: 'medium',
      phase_changed: true,
      lifecycle_stalled: true,
      start_date_urgent: true,
      notification_schedule: 'anytime',
    };

    return NextResponse.json({ prefs }, { status: 200 });
  } catch (cause) {
    logError('[notifications/preferences]', cause, { route: 'GET /api/notifications/preferences' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = NotificationPrefsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid preferences', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Merge patch: jsonb || merges top-level keys. COALESCE guards against a
    // NULL existing column (NULL || anything = NULL would silently drop the patch).
    const result = await pool.query(
      `UPDATE user_profiles
          SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId, JSON.stringify(parsed.data)],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (cause) {
    logError('[notifications/preferences]', cause, { route: 'PATCH /api/notifications/preferences' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
