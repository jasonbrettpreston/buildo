// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §3 Payload Schema
//
// POST /api/notifications/register — upserts a device push token for the
// authenticated user. Duplicate (user_id, push_token) pairs are silently
// updated (not 409) so re-registration after app reinstall is safe.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

const RegisterTokenSchema = z.object({
  push_token: z.string().min(1).regex(/^ExponentPushToken\[.+\]$/, {
    message: 'push_token must be a valid Expo push token',
  }),
  platform: z.enum(['ios', 'android']),
});

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = RegisterTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { push_token, platform } = parsed.data;

    await pool.query(
      `INSERT INTO device_tokens (user_id, push_token, platform, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, push_token)
       DO UPDATE SET updated_at = NOW(), platform = EXCLUDED.platform`,
      [userId, push_token, platform],
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (cause) {
    logError('[notifications/register]', cause, { route: 'POST /api/notifications/register' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
