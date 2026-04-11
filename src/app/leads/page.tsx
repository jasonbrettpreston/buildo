// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5
//
// /leads route — Server Component shell. Reads the Firebase session
// cookie via next/headers, verifies it server-side, looks up the
// user's trade_slug from user_profiles, then renders a Client wrapper
// that handles geolocation acquisition + the LeadFeed container.
//
// Auth defense in depth:
//   1. Middleware (src/middleware.ts) does a fast cookie shape check
//      and redirects unauthenticated users to /login. This catches
//      99% of cases at the edge.
//   2. THIS Server Component re-verifies the cookie via
//      verifyIdTokenCookie() (the same firebase-admin call the API
//      routes use under the hood). If middleware was bypassed
//      somehow, the page still redirects.
//   3. The actual /api/leads/feed call from inside the Client
//      wrapper is independently auth-checked at the route handler
//      via getCurrentUserContext().
// Three layers, each independent.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pool } from '@/lib/db/client';
import { verifyIdTokenCookie } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { logError } from '@/lib/logger';
import { LeadsClientShell } from './LeadsClientShell';

export const metadata: Metadata = {
  title: 'Leads — Buildo',
  description: 'Nearby permits and builders matched to your trade.',
};

export default async function LeadsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session')?.value;

  // Layer 2 auth check — verify the cookie. Middleware should have
  // already caught a missing cookie, but defense in depth means we
  // re-verify here. A missing/invalid cookie → redirect to /login
  // with a return URL so the user lands back on /leads after auth.
  const uid = await verifyIdTokenCookie(sessionCookie);
  if (!uid) {
    redirect('/login?redirect=/leads');
  }

  // Look up the user's trade_slug from user_profiles. If the user is
  // authenticated but has no profile row, redirect to /onboarding.
  // The trade_slug is required by every card's SaveButton mutation
  // payload, so it MUST be resolved before rendering the feed.
  let tradeSlug: string | null = null;
  try {
    const res = await pool.query<{ trade_slug: string }>(
      `SELECT trade_slug FROM user_profiles WHERE user_id = $1`,
      [uid],
    );
    const row = res.rows[0];
    if (row && typeof row.trade_slug === 'string' && row.trade_slug.length > 0) {
      tradeSlug = row.trade_slug;
    }
  } catch (err) {
    // DB outage during the page render is unrecoverable here — log
    // and let the route-level error.tsx boundary catch the throw on
    // re-throw. We DON'T swallow because the boundary's job is to
    // surface this state, not the page's.
    logError('[leads/page]', err, { stage: 'user-profile-lookup', uid });
    throw err;
  }
  if (!tradeSlug) {
    // WF3 2026-04-11 Bug #3 fix: dev-mode convenience seed. On a fresh
    // local DB, user_profiles is empty, and without this branch /leads
    // redirects to /onboarding — which is a client-only mockup that
    // doesn't persist anything, creating a dead-end. UPSERT a default
    // dev-user profile so /leads is usable out of the box. Gated on
    // BOTH isDevMode() (server-only DEV_MODE env var, prod-guarded via
    // NODE_ENV check) AND uid matches the dev bypass value from
    // verifyIdTokenCookie, so the production path is unreachable.
    // Default trade_slug is arbitrary — the user can change it later
    // via direct psql or a future onboarding flow that actually
    // persists.
    if (isDevMode() && uid === 'dev-user') {
      try {
        await pool.query(
          `INSERT INTO user_profiles (user_id, trade_slug, display_name)
           VALUES ('dev-user', 'plumbing', 'Dev User')
           ON CONFLICT (user_id) DO NOTHING`,
        );
      } catch (err) {
        // Per engineering standards §Backend Rules: every DB call must
        // route errors through logError. This branch is dev-only but
        // the mandate is universal. Re-throw to the error boundary so
        // the operator sees a clear stack trace.
        logError('[leads/page]', err, { stage: 'dev-user-seed' });
        throw err;
      }
      tradeSlug = 'plumbing';
    } else {
      redirect('/onboarding');
    }
  }

  return <LeadsClientShell tradeSlug={tradeSlug} />;
}
