// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
//             docs/specs/03-mobile/99_mobile_state_architecture.md §9.14
//
// GET   /api/notifications/preferences — returns the user's 5 notification fields.
// PATCH /api/notifications/preferences — updates any subset of them.
//
// Spec 99 §9.14: the 5 fields were flattened from JSONB to sibling columns
// in migration 117. Pre-flatten this route used a JSONB merge clause;
// post-flatten each field is a plain column UPDATE.
//
// Cost-tier enum: this route previously accepted a 5-value enum that
// diverged from userProfile.schema.ts and matched no other consumer.
// Aligned to the canonical Spec 95 set `['low','medium','high']` as part
// of the Spec 99 §9.14 batch.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

const NotificationPrefsSchema = z.object({
  new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']).optional(),
  phase_changed: z.boolean().optional(),
  lifecycle_stalled_pref: z.boolean().optional(),
  start_date_urgent: z.boolean().optional(),
  notification_schedule: z.enum(['morning', 'anytime', 'evening']).optional(),
});

const SELECT_COLS =
  'new_lead_min_cost_tier, phase_changed, lifecycle_stalled_pref, start_date_urgent, notification_schedule';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query<{
      new_lead_min_cost_tier: string;
      phase_changed: boolean;
      lifecycle_stalled_pref: boolean;
      start_date_urgent: boolean;
      notification_schedule: string;
    }>(`SELECT ${SELECT_COLS} FROM user_profiles WHERE user_id = $1`, [userId]);

    // Migration 117 sets NOT NULL DEFAULT for all 5 columns. If the user has
    // no row at all (account hasn't completed first-PATCH yet) we still
    // return the canonical defaults so the mobile client renders the
    // settings screen without a null-guard fork.
    const row = result.rows[0];
    const prefs = row ?? {
      new_lead_min_cost_tier: 'medium' as const,
      phase_changed: true,
      lifecycle_stalled_pref: true,
      start_date_urgent: true,
      notification_schedule: 'anytime' as const,
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

    // Build a partial UPDATE: only the fields the client explicitly sent.
    // Empty payload (`{}`) is a no-op — return success without writing.
    const setClauses: string[] = [];
    const params: unknown[] = [userId];
    const addField = (col: keyof typeof parsed.data, value: unknown) => {
      params.push(value);
      setClauses.push(`${col} = $${params.length}`);
    };
    if (parsed.data.new_lead_min_cost_tier !== undefined) addField('new_lead_min_cost_tier', parsed.data.new_lead_min_cost_tier);
    if (parsed.data.phase_changed !== undefined) addField('phase_changed', parsed.data.phase_changed);
    if (parsed.data.lifecycle_stalled_pref !== undefined) addField('lifecycle_stalled_pref', parsed.data.lifecycle_stalled_pref);
    if (parsed.data.start_date_urgent !== undefined) addField('start_date_urgent', parsed.data.start_date_urgent);
    if (parsed.data.notification_schedule !== undefined) addField('notification_schedule', parsed.data.notification_schedule);

    if (setClauses.length === 0) {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    setClauses.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
      params,
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
