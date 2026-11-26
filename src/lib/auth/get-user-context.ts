// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
//             docs/specs/00-architecture/13_authentication.md §3.2, §3.3
//
// Server-side helper combining Supabase auth + user_profiles lookup.
// Phase 2 leads routes call this once at the top of the handler to get
// {uid, trade_slug, display_name} or null. Never throws — returns null
// on any failure so the route can return 401 cleanly.
//
// The four "null" cases the caller treats identically (return 401):
//   1. No session cookie
//   2. Cookie shape invalid (not 3-segment JWT) — Bearer path only, Item 1
//   3. Supabase JWT verification failed (expired / revoked / malformed)
//   4. Profile lookup failed (authenticated but no profile row yet)
//
// Future onboarding flow may need to disambiguate "user has no profile"
// from "user not authenticated" to redirect to onboarding instead of
// login. That's a Phase 2+ concern; the contract here is "any failure
// means anonymous, can't access leads".
//
// Auth-provider swap only (`.cursor/phase1_plan.md` P1-F2.4): this is a
// READ-only helper (every consumer is a GET-shaped feed/detail route), so it
// uses `getClaimsUid` (Spec 13 §3.2's read-path default) rather than the
// revocation-checked `getVerifiedUid`.
//
// Entitlements swap (`.cursor/phase1_plan.md` Item 4 R1, P1-F3d wave): the
// `subscription_status` FIELD NAME is KEPT on UserContext (its consumers —
// leads/view R2's trial counter and parcels/lookup R4's subscription gate —
// depend on it), but the VALUE is now the per-product `entitlements` row's
// status for 'lead_gen' (OD5: every Phase-1 gate folds into lead_gen; since
// MF-45 the parcel lookup reads its own 'parcel_tool' row first and uses this
// lead_gen status only on its transitional path until MF-50), sourced via a LEFT JOIN. A zero-entitlement user
// reads null — exactly what the legacy nullable column yielded, so both
// consumers' gating semantics are unchanged (null → not trial / not active).
//
// task-313 (McApp card 1, the front door; plan PLAN-313-v1 S1; RR-0499 "1a", MORNING-DECISIONS.md:2598): the parcel routes
// (lookup, entitlement, lot-size) serve the MaxBLD product, whose users have no lead-app trade and may have no
// user_profiles row at all (a web buyer's row has no trade; entitlements, usage_events and parcel_user_inputs key on
// auth.users). They pass `{ needsTrade: false }`: this path reads no user_profiles row and returns only
// {uid, subscription_status}, the status read from the lead_gen entitlements row (getEntitlementStatus). A 'trial' status
// runs the existing idempotent 14-day expiry (applyTrialExpirationIfNeeded, the update GET /api/user-profile runs), because
// the MaxBLD phone no longer calls that route. Both reads sit inside the try, so a thrown read is logged and returns null
// (401), as a thrown profile read does. Without the option nothing changes for the lead routes; the overloads stop a lead
// route from taking the trade-less shape silently.

import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { getClaimsUid } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { LEAD_GEN_ENTITLEMENT_JOIN, getEntitlementStatus } from '@/lib/entitlements';
import { applyTrialExpirationIfNeeded } from '@/lib/subscription/expiration';
import { logError } from '@/lib/logger';

interface UserContext {
  uid: string;
  // `trade_slug` is retained for backward compatibility and always equals
  // `primary_trade_slug` — every existing consumer that reads `ctx.trade_slug`
  // keeps working unchanged (single-trade accounts see zero difference).
  trade_slug: string;
  // P24-24A — the SELECTED-TRADE model. An account HOLDS a set of trades
  // (`[trade_slug] ∪ trade_slugs_override`, deduped, NULL-safe); the app
  // OPERATES on one selected trade at a time, validated ∈ this set. For a
  // single-trade account the set is `[primary]`. Legacy manufacturer rows
  // (trade_slug NULL, override populated) ride the override: set = override,
  // primary = first element.
  trade_slugs: string[];
  primary_trade_slug: string;
  display_name: string | null;
  subscription_status: string | null;
}

/** The trade-less context of the parcel routes (task-313): the uid and the lead_gen entitlement status only. */
export interface ParcelUserContext {
  uid: string;
  subscription_status: string | null;
}

/** The option the parcel routes pass: no user_profiles read, no trade required. */
export interface ParcelContextOptions {
  needsTrade: false;
}

// The parcel overload is first and the lead one last, so a mocked helper (vi.mocked) keeps the lead return type.
export async function getCurrentUserContext(
  request: NextRequest,
  pool: Pool,
  options: ParcelContextOptions,
): Promise<ParcelUserContext | null>;
export async function getCurrentUserContext(request: NextRequest, pool: Pool): Promise<UserContext | null>;
export async function getCurrentUserContext(
  request: NextRequest,
  pool: Pool,
  options?: ParcelContextOptions,
): Promise<UserContext | ParcelUserContext | null> {
  // Defense in depth: getClaimsUid is documented as never-throws,
  // but its contract isn't enforced at the type level. Wrap the call so
  // a future regression in the auth helper can't escape this function.
  let uid: string | null;
  try {
    uid = await getClaimsUid(request);
  } catch (err) {
    logError('[auth/get-user-context]', err, { stage: 'session-verify' });
    return null;
  }
  if (!uid) return null;

  if (options?.needsTrade === false) {
    try {
      const row = await getEntitlementStatus(pool, uid, 'lead_gen');
      let status: string | null = row?.status ?? null;
      if (status === 'trial') {
        const expired = await applyTrialExpirationIfNeeded(uid, 'lead_gen');
        if (expired) status = 'expired';
      }
      return { uid, subscription_status: status };
    } catch (err) {
      logError('[auth/get-user-context]', err, { uid, stage: 'entitlement-lookup' });
      return null;
    }
  }

  try {
    // WF3 2026-04-11 dev-env symmetry: if the dev bypass returned
    // 'dev-user' but user_profiles is empty (fresh local DB and the
    // operator hit an API route before visiting /leads to trigger the
    // page-level seed), UPSERT a default profile here so API routes
    // return 200 instead of a confusing 401. Gated on the same
    // (isDevMode() && uid === 'dev-user') as the leads page seed so
    // production is unreachable. Idempotent via ON CONFLICT DO NOTHING.
    if (isDevMode() && uid === 'dev-user') {
      await pool.query(
        `INSERT INTO user_profiles (user_id, trade_slug, display_name)
         VALUES ('dev-user', 'plumbing', 'Dev User')
         ON CONFLICT (user_id) DO NOTHING`,
      );
    }

    // R1: subscription_status is the lead_gen ENTITLEMENT status (LEFT JOIN —
    // no row means null, matching the legacy nullable-column contract).
    const res = await pool.query<{
      trade_slug: string | null;
      trade_slugs_override: string[] | null;
      display_name: string | null;
      subscription_status: string | null;
    }>(
      `SELECT up.trade_slug, up.trade_slugs_override, up.display_name, e.status AS subscription_status
       FROM user_profiles up ${LEAD_GEN_ENTITLEMENT_JOIN}
       WHERE up.user_id = $1`,
      [uid],
    );
    const row = res.rows[0];
    if (!row) return null;

    // P24-24A — build the trade SET, NULL-safe. Primary is `trade_slug` when
    // present; a legacy manufacturer row (trade_slug NULL) falls back to the
    // first override element. The override members are unioned in, deduped,
    // preserving primary-first order. Whitespace-only / empty entries dropped.
    const primaryCandidate =
      typeof row.trade_slug === 'string' && row.trade_slug.trim().length > 0
        ? row.trade_slug
        : null;
    // Build the set primary-first, unioning in override slugs (deduped). A plain
    // loop (rather than a type-guard .filter) also keeps this out of the
    // silent-row-drop footgun heuristic — the "drop" here is only empty /
    // non-string override entries (data hygiene on ONE row's array column), not
    // a SQL-result row disappearing. A genuinely trade-less account is caught
    // below (set.length === 0 -> logError + null), so nothing vanishes silently.
    const set: string[] = [];
    if (primaryCandidate) set.push(primaryCandidate);
    if (Array.isArray(row.trade_slugs_override)) {
      for (const s of row.trade_slugs_override) {
        if (typeof s === 'string' && s.trim().length > 0 && !set.includes(s)) set.push(s);
      }
    }

    // Defense in depth: an account with neither a single trade nor an override
    // list cannot be served a feed (the algorithm is trade_slug-keyed). Return
    // null (401). Previously this fired for ALL manufacturer rows (trade_slug
    // NULL); now a manufacturer with a populated override is served — the
    // desired implicit un-401 (P24 v2). Only a genuinely trade-less row 401s.
    if (set.length === 0) {
      logError(
        '[auth/get-user-context]',
        new Error('user_profiles has no trade_slug and no trade_slugs_override — cannot serve a feed'),
        { uid, stage: 'profile-validate' },
      );
      return null;
    }
    const primary = set[0]!;
    return {
      uid,
      trade_slug: primary,
      primary_trade_slug: primary,
      trade_slugs: set,
      display_name: row.display_name,
      subscription_status: row.subscription_status ?? null,
    };
  } catch (err) {
    logError('[auth/get-user-context]', err, { uid, stage: 'profile-lookup' });
    return null;
  }
}
