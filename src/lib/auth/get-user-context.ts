// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
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
import { logError } from '@/lib/logger';

export interface UserContext {
  uid: string;
  trade_slug: string;
  display_name: string | null;
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
    const res = await pool.query<{ trade_slug: string; display_name: string | null }>(
      `SELECT trade_slug, display_name FROM user_profiles WHERE user_id = $1`,
      [uid],
    );
    const row = res.rows[0];
    if (!row) return null;
    return { uid, trade_slug: row.trade_slug, display_name: row.display_name };
  } catch (err) {
    logError('[auth/get-user-context]', err, { uid, stage: 'profile-lookup' });
    return null;
  }
}
