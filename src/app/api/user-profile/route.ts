// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract, §6 Route Logic
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4 (GET fallback init + trial expiration)
//
// WF3 2026-05-04 hardening (review_followups.md /api/user-profile bundle):
//  (a) `SELECT *` / `RETURNING *` replaced with `CLIENT_SAFE_SELECT_LIST` —
//      pre-WF3 the route leaked `stripe_customer_id` (PII), `radius_cap_km`
//      (admin-internal), and `trade_slugs_override` (admin-internal) on
//      every response, AND any new internal column added to the table
//      would be leaked automatically.
//  (b) `trade_slug` first-write race — pre-WF3 the SELECT-then-UPDATE
//      pattern allowed two concurrent PATCHes to both see `trade_slug
//      IS NULL` and both succeed, with the second winner overwriting
//      the first. Now the trade_slug write is an atomic precondition
//      (`UPDATE ... WHERE user_id = $1 AND trade_slug IS NULL`) and
//      `rowCount === 0` returns 409.
//  (c) Trade-slug validation bypass — pre-WF3 `rawBody.trade_slug` was
//      read directly BEFORE `safeParse`. Now `trade_slug` is in the
//      Zod schema and the route uses `parsed.data.trade_slug`.
//  (d) `Cache-Control: no-store` on GET — the trial-state helpers
//      (`applyFallbackTrialInitIfNeeded`, `applyTrialExpirationIfNeeded`)
//      issue writes on GET, so cached/proxied GETs would silently
//      trigger duplicate writes.
import { NextRequest, NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { query } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import { CLIENT_SAFE_SELECT_LIST, UserProfileUpdateSchema } from '@/lib/userProfile.schema';
import {
  applyFallbackTrialInitIfNeeded,
  applyTrialExpirationIfNeeded,
} from '@/lib/subscription/expiration';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const GET = withApiEnvelope(async function GET(request: NextRequest) {
  const uid = await getUserIdFromSession(request);
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, meta: null },
      { status: 401 },
    );
  }

  try {
    // Spec 96 §10 Step 4: run the trial-state helpers BEFORE the SELECT so the
    // returned profile reflects any post-write state. Both helpers are
    // idempotent — they no-op when their predicate doesn't match — and they
    // RETURNING * so we could short-circuit, but reading the row again after
    // both helpers run is simpler and the cost is one indexed lookup.
    //
    // Order matters: fallback init first (might write status='trial'), then
    // expiration check (might immediately flip 'trial' → 'expired' if the
    // PATCH was missed and the trial window has already passed). This
    // matches the canonical flow that PATCH would have followed.
    await applyFallbackTrialInitIfNeeded(uid);
    await applyTrialExpirationIfNeeded(uid);

    const rows = await query<Record<string, unknown>>(
      `SELECT ${CLIENT_SAFE_SELECT_LIST} FROM user_profiles WHERE user_id = $1`,
      [uid],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404, headers: NO_STORE_HEADERS },
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
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    // Cache-Control: no-store — the trial-state helpers above issue
    // writes on GET, so any cached/proxied response would silently
    // trigger duplicate writes (and stale data).
    return NextResponse.json(
      { data: profile, error: null, meta: null },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    logError('[user-profile/GET]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500, headers: NO_STORE_HEADERS },
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

    // WF3 2026-05-04: validate the body BEFORE the trade_slug branch so
    // any future Zod constraints on trade_slug (length, charset regex)
    // are enforced. Pre-WF3 the handler read `rawBody.trade_slug`
    // directly, bypassing Zod entirely.
    const parsed = UserProfileUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' }, meta: null },
        { status: 400 },
      );
    }
    const fields = parsed.data;

    // trade_slug first write allowed when NULL (onboarding profession step).
    // Once set, it is immutable — any attempt to change it returns 400.
    // Idempotency: same value as existing returns 200 immediately.
    //
    // The actual write happens below as an atomic-precondition UPDATE
    // (`WHERE user_id = $1 AND trade_slug IS NULL`) — see the
    // `tradeSlugFirstWrite` branch in the SET-clause section. This
    // closes the race where two concurrent PATCHes both saw `trade_slug
    // IS NULL` here, both proceeded to the UPDATE, and the second
    // winner overwrote the first (violating immutability).
    let tradeSlugFirstWrite: string | null = null;
    if (fields.trade_slug !== undefined) {
      if (existing.trade_slug !== null) {
        // Already set — enforce immutability
        if (fields.trade_slug !== existing.trade_slug) {
          return NextResponse.json(
            { data: null, error: { code: 'TRADE_IMMUTABLE', message: 'trade_slug cannot be changed after onboarding' }, meta: null },
            { status: 400 },
          );
        }
        // WF3 Phase 7 fix (Gemini CRITICAL #2): when fields.trade_slug
        // matches existing.trade_slug, the previous early-return at this
        // branch silently DROPPED every other field in the body. A
        // common reconciliation flow (offline-replay re-sending the
        // already-set trade_slug alongside other settings) would 200
        // with the unchanged profile and the user's other writes lost
        // forever. Fall through instead — `tradeSlugFirstWrite` stays
        // null so trade_slug is omitted from the SET clause (correct,
        // since the value isn't changing), and the rest of the PATCH
        // proceeds normally.
      } else {
        // existing.trade_slug IS NULL — first write during onboarding.
        // Zod has already enforced min(1)+max(50); the trim guard remains
        // as defense-in-depth for whitespace-only strings (Zod min(1)
        // allows ' ' since string length > 0).
        if (fields.trade_slug.trim().length > 0) {
          tradeSlugFirstWrite = fields.trade_slug;
        }
      }
    }

    // WF3 Phase 7 amendment (DeepSeek + Gemini HIGH): tos_accepted_at
    // is the legal-record timestamp for ToS acceptance — once set,
    // arbitrary later overwrites would falsify the audit trail. Apply
    // the same immutability gate as trade_slug. First-write (when
    // existing is null) flows through normally; equal-value PATCH is a
    // no-op and skips the SET clause; differing value returns 400.
    if (
      fields.tos_accepted_at !== undefined &&
      existing.tos_accepted_at !== null &&
      fields.tos_accepted_at !== existing.tos_accepted_at
    ) {
      return NextResponse.json(
        {
          data: null,
          error: { code: 'TOS_IMMUTABLE', message: 'tos_accepted_at cannot be changed once set' },
          meta: null,
        },
        { status: 400 },
      );
    }

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

    // Spec 99 §9.14 — notification preferences are now 5 flat columns (was
    // one JSONB column with merge SQL pre-migration-117). Each field is an
    // ordinary partial PATCH: omit to leave unchanged, send a value to set.
    if (fields.new_lead_min_cost_tier !== undefined) addField('new_lead_min_cost_tier', fields.new_lead_min_cost_tier);
    if (fields.phase_changed !== undefined) addField('phase_changed', fields.phase_changed);
    if (fields.lifecycle_stalled_pref !== undefined) addField('lifecycle_stalled_pref', fields.lifecycle_stalled_pref);
    if (fields.start_date_urgent !== undefined) addField('start_date_urgent', fields.start_date_urgent);
    if (fields.notification_schedule !== undefined) addField('notification_schedule', fields.notification_schedule);

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
        `SELECT ${CLIENT_SAFE_SELECT_LIST} FROM user_profiles WHERE user_id = $1`,
        [uid],
      );
      return NextResponse.json({ data: full[0], error: null, meta: null });
    }

    setClauses.push('updated_at = NOW()');

    // WF3 2026-05-04: atomic-precondition write when this PATCH includes
    // a trade_slug first-write. The pre-WF3 SELECT-then-UPDATE pattern
    // allowed two concurrent PATCHes to both see `existing.trade_slug
    // IS NULL`, both proceed, and the second winner silently overwrite
    // the first. Adding `AND trade_slug IS NULL` to the WHERE clause
    // makes the UPDATE serializable: the loser sees `rowCount === 0`
    // and gets a 409 instead of overwriting.
    const whereClause = tradeSlugFirstWrite !== null
      ? 'WHERE user_id = $1 AND trade_slug IS NULL'
      : 'WHERE user_id = $1';
    const updated = await query<Record<string, unknown>>(
      `UPDATE user_profiles SET ${setClauses.join(', ')} ${whereClause} RETURNING ${CLIENT_SAFE_SELECT_LIST}`,
      params,
    );

    if (tradeSlugFirstWrite !== null && updated.length === 0) {
      // Race-loss: another concurrent PATCH won the trade_slug first-write
      // between our SELECT (line ~94) and our UPDATE here. Read back the
      // winning value so the client can reconcile and surface a friendly
      // error.
      const winning = await query<{ trade_slug: string | null }>(
        `SELECT trade_slug FROM user_profiles WHERE user_id = $1`,
        [uid],
      );
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'TRADE_RACE_LOST',
            message: 'Concurrent PATCH set trade_slug to a different value first',
            existing_trade_slug: winning[0]?.trade_slug ?? null,
          },
          meta: null,
        },
        { status: 409 },
      );
    }

    // WF3 Phase 7 amendment (DeepSeek HIGH): symmetric 0-row check on
    // the non-trade-slug UPDATE path. The trade-slug branch above
    // returns 409 on rowCount=0 (race-loss); the non-trade-slug path
    // previously fell through here and returned `data: undefined` to
    // the client when a concurrent DELETE (e.g., account_deleted_at
    // flow running in parallel) removed the row between our SELECT
    // and our UPDATE. Narrow race but a real footgun.
    if (updated.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' }, meta: null },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: updated[0], error: null, meta: null });
  } catch (err) {
    logError('[user-profile/PATCH]', err, { uid });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
