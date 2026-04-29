// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract, §6 Route Logic
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { UserProfileUpdateSchema } from '@/lib/userProfile.schema';

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }

    const profile = rows[0]!;

    if (profile.account_deleted_at) {
      const deletedAt = new Date(profile.account_deleted_at as string);
      const daysElapsed = (Date.now() - deletedAt.getTime()) / 86_400_000;
      // Clamp to 0 for accounts past the 30-day window still hitting GET
      const daysRemaining = Math.max(0, Math.ceil(30 - daysElapsed));
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'ACCOUNT_DELETED',
            message: 'Account is scheduled for deletion',
            account_deleted_at: profile.account_deleted_at as string,
            days_remaining: daysRemaining,
          },
          meta: null,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ data: profile, error: null, meta: null });
  } catch (err) {
    logError('[user-profile/GET]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});

export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT account_deleted_at, account_preset, trade_slug, radius_cap_km, location_mode, home_base_lat, home_base_lng, tos_accepted_at, subscription_status
       FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    let existing: Record<string, unknown>;
    if (rows.length === 0) {
      // New user — auto-create skeleton row (trade_slug nullable after migration 114)
      await query(`INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [uid]);
      const created = await query<Record<string, unknown>>(
        `SELECT account_deleted_at, account_preset, trade_slug, radius_cap_km, location_mode, home_base_lat, home_base_lng, tos_accepted_at, subscription_status
         FROM user_profiles WHERE user_id = $1`,
        [uid],
      );
      if (created.length === 0) {
        return NextResponse.json(
          { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
          { status: 404 },
        );
      }
      existing = created[0]!;
    } else {
      existing = rows[0]!;
    }

    if (existing.account_deleted_at) {
      return NextResponse.json(
        { data: null, error: { code: 'ACCOUNT_DELETED', message: 'Account is scheduled for deletion' }, meta: null },
        { status: 403 },
      );
    }

    let rawBody: Record<string, unknown>;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { data: null, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' }, meta: null },
        { status: 400 },
      );
    }

    // trade_slug first write allowed when NULL (onboarding profession step).
    // Once set, it is immutable — any attempt to change it returns 400.
    // Idempotency: same value as existing returns 200 immediately.
    let tradeSlugFirstWrite: string | null = null;
    if ('trade_slug' in rawBody) {
      if (existing.trade_slug !== null) {
        // Already set — enforce immutability
        if (rawBody.trade_slug === existing.trade_slug) {
          const full = await query<Record<string, unknown>>(
            `SELECT * FROM user_profiles WHERE user_id = $1`,
            [uid],
          );
          return NextResponse.json({ data: full[0], error: null, meta: null });
        }
        return NextResponse.json(
          { data: null, error: { code: 'TRADE_IMMUTABLE', message: 'trade_slug cannot be changed after onboarding' }, meta: null },
          { status: 400 },
        );
      }
      // existing.trade_slug IS NULL — first write during onboarding
      if (typeof rawBody.trade_slug === 'string' && rawBody.trade_slug.trim().length > 0) {
        tradeSlugFirstWrite = rawBody.trade_slug;
      }
    }

    const parsed = UserProfileUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' }, meta: null },
        { status: 400 },
      );
    }

    const fields = parsed.data;

    // onboarding_complete=true guard: requires trade+location+tos in combined state
    if (fields.onboarding_complete === true) {
      const effectiveLocation = fields.location_mode ?? existing.location_mode;
      const effectiveTos = fields.tos_accepted_at ?? existing.tos_accepted_at;
      // trade_slug may be set in this same PATCH (first write) — account for that
      const effectiveTrade = tradeSlugFirstWrite ?? existing.trade_slug;
      if (!effectiveTrade || !effectiveLocation || !effectiveTos) {
        return NextResponse.json(
          {
            data: null,
            error: {
              code: 'ONBOARDING_INCOMPLETE',
              message: 'trade_slug, location_mode, and tos_accepted_at must be set before marking onboarding complete',
            },
            meta: null,
          },
          { status: 400 },
        );
      }
    }

    // Location coherence — Spec 95 §7 / chk_location_mode_coords.
    // Validates the resulting effective state before hitting the DB CHECK constraint
    // so clients receive a descriptive 400 instead of a constraint-violation 500.
    const effectiveLocationMode = fields.location_mode ?? (existing.location_mode as string | null);
    if (effectiveLocationMode === 'home_base_fixed') {
      const effectiveLat = fields.home_base_lat !== undefined
        ? fields.home_base_lat
        : (existing.home_base_lat as number | null);
      const effectiveLng = fields.home_base_lng !== undefined
        ? fields.home_base_lng
        : (existing.home_base_lng as number | null);
      if (effectiveLat === null || effectiveLng === null) {
        return NextResponse.json(
          {
            data: null,
            error: {
              code: 'LOCATION_COORDS_REQUIRED',
              message: 'home_base_lat and home_base_lng are required when location_mode is home_base_fixed',
            },
            meta: null,
          },
          { status: 400 },
        );
      }
    }

    // Build dynamic SET clause — only include fields present in body
    const setClauses: string[] = [];
    const params: unknown[] = [uid];

    const addField = (col: string, value: unknown) => {
      params.push(value);
      setClauses.push(`${col} = $${params.length}`);
    };

    if (tradeSlugFirstWrite !== null) addField('trade_slug', tradeSlugFirstWrite);
    if (fields.full_name !== undefined) addField('full_name', fields.full_name);
    if (fields.phone_number !== undefined) addField('phone_number', fields.phone_number);
    if (fields.company_name !== undefined) addField('company_name', fields.company_name);
    if (fields.backup_email !== undefined) addField('backup_email', fields.backup_email);
    if (fields.default_tab !== undefined) addField('default_tab', fields.default_tab);
    if (fields.location_mode !== undefined) addField('location_mode', fields.location_mode);
    if (fields.home_base_lat !== undefined) addField('home_base_lat', fields.home_base_lat);
    if (fields.home_base_lng !== undefined) addField('home_base_lng', fields.home_base_lng);
    // gps_live requires NULL coords (chk_location_mode_coords). Auto-clear any coords
    // the client did not explicitly send so the constraint is satisfied without requiring
    // the client to redundantly pass null for both fields on every mode switch.
    if (fields.location_mode === 'gps_live') {
      if (fields.home_base_lat === undefined) addField('home_base_lat', null);
      if (fields.home_base_lng === undefined) addField('home_base_lng', null);
    }
    if (fields.supplier_selection !== undefined) addField('supplier_selection', fields.supplier_selection);
    if (fields.onboarding_complete !== undefined) addField('onboarding_complete', fields.onboarding_complete);
    if (fields.tos_accepted_at !== undefined) addField('tos_accepted_at', fields.tos_accepted_at);

    // radius_km: apply admin cap if set
    if (fields.radius_km !== undefined) {
      const cap = existing.radius_cap_km as number | null;
      const capped = cap !== null && fields.radius_km !== null
        ? Math.min(fields.radius_km, cap)
        : fields.radius_km;
      addField('radius_km', capped);
    }

    // notification_prefs: atomic server-side JSONB merge
    if (fields.notification_prefs !== undefined) {
      params.push(JSON.stringify(fields.notification_prefs));
      setClauses.push(`notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $${params.length}::jsonb`);
    }

    // onboarding_complete=true + non-manufacturer + not already subscribed → start trial
    if (
      fields.onboarding_complete === true &&
      existing.account_preset !== 'manufacturer' &&
      !existing.subscription_status
    ) {
      setClauses.push(`trial_started_at = NOW()`);
      setClauses.push(`subscription_status = 'trial'`);
    }

    // No writable fields in body — return current profile without a phantom write
    if (setClauses.length === 0) {
      const full = await query<Record<string, unknown>>(
        `SELECT * FROM user_profiles WHERE user_id = $1`,
        [uid],
      );
      return NextResponse.json({ data: full[0], error: null, meta: null });
    }

    setClauses.push('updated_at = NOW()');
    const updated = await query<Record<string, unknown>>(
      `UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = $1 RETURNING *`,
      params,
    );

    return NextResponse.json({ data: updated[0], error: null, meta: null });
  } catch (err) {
    logError('[user-profile/PATCH]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
