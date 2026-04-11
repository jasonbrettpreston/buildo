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
//
// WF3 2026-04-11 (dev profile switcher): accepts `?trade_slug=<slug>`
// searchParam in dev mode. When present AND valid against the TRADES
// allowlist AND uid === 'dev-user', UPSERTs the dev profile with the
// new slug via `ON CONFLICT DO UPDATE`. Lets developers test different
// trade feeds without manual psql UPDATEs. Production path is
// unreachable via the isDevMode() + uid gate.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pool } from '@/lib/db/client';
import { verifyIdTokenCookie } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { TRADES } from '@/lib/classification/trades';
import { logError, logWarn } from '@/lib/logger';
import { LeadsClientShell } from './LeadsClientShell';

export const metadata: Metadata = {
  title: 'Leads — Buildo',
  description: 'Nearby permits and builders matched to your trade.',
};

interface LeadsPageProps {
  // Next.js 15 changed searchParams to Promise<...> on Server Components.
  // Must be awaited before reading.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
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

  // Read the dev trade_slug switcher query param (if any). Null it
  // out for non-string values so the allowlist check can trust the type.
  const params = await searchParams;
  const rawTradeParam = params.trade_slug;
  const requestedTradeSlug =
    typeof rawTradeParam === 'string' && rawTradeParam.length > 0
      ? rawTradeParam
      : null;

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

  // WF3 2026-04-11 — dev profile trade switcher. If the query param
  // requested a different valid slug, UPSERT the dev profile with the
  // new value. Must happen BEFORE the `!tradeSlug` seed branch below
  // so the switcher also handles the first-time-seed case (user hits
  // `/leads?trade_slug=electrical` on a fresh DB).
  //
  // Validation: the slug must be a member of the canonical 32-slug
  // allowlist from `src/lib/classification/trades.ts`. Unknown slugs
  // are silently ignored and the existing profile (or default seed)
  // wins — fail-closed behavior.
  //
  // Gated on `isDevMode() && uid === 'dev-user'` — production path is
  // unreachable. The `isValidSlug` computation happens here (not in a
  // helper) to keep the allowlist membership check colocated with the
  // SQL it guards, per the adversarial review feedback on WF3 Bug #3
  // that demanded the allowlist be verifiable BEFORE the UPDATE.
  if (
    isDevMode()
    && uid === 'dev-user'
    && requestedTradeSlug !== null
  ) {
    const isValidSlug = TRADES.some((t) => t.slug === requestedTradeSlug);
    if (isValidSlug) {
      try {
        await pool.query(
          `INSERT INTO user_profiles (user_id, trade_slug, display_name)
           VALUES ('dev-user', $1, 'Dev User')
           ON CONFLICT (user_id) DO UPDATE
             SET trade_slug = EXCLUDED.trade_slug,
                 updated_at = NOW()`,
          [requestedTradeSlug],
        );
      } catch (err) {
        logError('[leads/page]', err, {
          stage: 'dev-user-trade-switcher',
          requestedTradeSlug,
        });
        throw err;
      }
      tradeSlug = requestedTradeSlug;
    } else {
      // Invalid slug → fail-closed: existing profile wins, but surface a
      // dev-server warning so the developer notices the typo immediately
      // instead of silently seeing stale results. Adversarial review
      // 2026-04-11 near-miss N2.
      logWarn('[leads/page]', 'dev trade switcher — invalid slug rejected', {
        stage: 'dev-user-trade-switcher',
        requestedTradeSlug,
        stage_hint: 'slug must be one of the 32 allowlisted trades in src/lib/classification/trades.ts',
      });
    }
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
    // Default trade_slug is arbitrary — the user can change it via
    // the `?trade_slug=` query param above.
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
