// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
//
// Server-side helper combining Firebase auth + user_profiles lookup.
// Phase 2 leads routes call this once at the top of the handler to get
// {uid, trade_slug, display_name} or null. Never throws — returns null
// on any failure so the route can return 401 cleanly.
//
// The four "null" cases the caller treats identically (return 401):
//   1. No session cookie
//   2. Cookie shape invalid (not 3-segment JWT)
//   3. Firebase JWT verification failed (expired / revoked / malformed)
//   4. Profile lookup failed (authenticated but no profile row yet)
//
// Future onboarding flow may need to disambiguate "user has no profile"
// from "user not authenticated" to redirect to onboarding instead of
// login. That's a Phase 2+ concern; the contract here is "any failure
// means anonymous, can't access leads".

import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
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

export async function getCurrentUserContext(
  request: NextRequest,
  pool: Pool,
): Promise<UserContext | null> {
  // Defense in depth: getUserIdFromSession is documented as never-throws,
  // but its contract isn't enforced at the type level. Wrap the call so
  // a future regression in the auth helper can't escape this function.
  let uid: string | null;
  try {
    uid = await getUserIdFromSession(request);
  } catch (err) {
    logError('[auth/get-user-context]', err, { stage: 'session-verify' });
    return null;
  }
  if (!uid) return null;

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

    const res = await pool.query<{
      trade_slug: string | null;
      trade_slugs_override: string[] | null;
      display_name: string | null;
      subscription_status: string | null;
    }>(
      `SELECT trade_slug, trade_slugs_override, display_name, subscription_status FROM user_profiles WHERE user_id = $1`,
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
