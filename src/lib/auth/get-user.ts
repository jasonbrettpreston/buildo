// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 + docs/specs/00-architecture/00_engineering_standards.md §4
//
// Server-side Firebase token verification for API route handlers.
// NEVER import this from a 'use client' component — uses firebase-admin (Node runtime only).
// Middleware stays edge-runtime fast and only does cookie shape pre-checks; full token
// verification happens here, in the route handler's Node runtime.

import type { NextRequest } from 'next/server';
import { logError, logWarn } from '@/lib/logger';
import { isDevMode, DEV_SESSION_COOKIE, extractBearerToken } from '@/lib/auth/route-guard';

// Lazy-import firebase-admin so dev without admin keys doesn't crash on import.
/**
 * Verify a raw `__session` cookie value via Firebase Admin. Returns the
 * uid on success, null on any failure (missing, malformed, expired,
 * revoked, admin SDK uninitialized). Extracted from getUserIdFromSession
 * in Phase 3-iv so Server Components can call it directly with
 * `cookies().get('__session')?.value` from `next/headers` — they don't
 * have access to the NextRequest object that the API-route variant takes.
 *
 * NAMING NOTE: this function calls `admin.auth().verifyIdToken(cookie)`,
 * NOT `admin.auth().verifySessionCookie(cookie)`. Firebase Admin has two
 * distinct token verification methods: `verifyIdToken` for short-lived
 * Firebase ID tokens (~1hr), and `verifySessionCookie` for long-lived
 * session cookies created via `createSessionCookie()` (~2 weeks). This
 * project sets the `__session` cookie to a Firebase ID token (verified
 * by the existing API route flow + middleware shape check), so
 * `verifyIdToken` is the correct call. The function is named
 * `verifyIdTokenCookie` to disambiguate — an earlier draft was named
 * `verifySessionCookie` which mirrored the cookie NAME but suggested the
 * wrong Admin SDK method, creating confusion that the holistic Phase 3
 * review (independent reviewer C8/CRITICAL 2) flagged.
 */
export async function verifyIdTokenCookie(
  cookie: string | undefined,
): Promise<string | null> {
  if (!cookie) return null;
  // Quick shape check: must look like a JWT (3 segments)
  if (cookie.split('.').length !== 3) return null;

  // WF3 2026-04-11 Bug #2 fix: dev-mode bypass. The middleware injects
  // DEV_SESSION_COOKIE when DEV_MODE=true so the browser (and now,
  // after Bug #1 fix, the current-request Server Component) see a
  // session. Skip Firebase verification for this exact fake cookie and
  // return a stable dev uid — the real flow would reject it because
  // it's not a Google-signed JWT.
  //
  // Security: scoped to isDevMode() (reads server-only DEV_MODE env
  // var, NEVER NEXT_PUBLIC_*) AND exact-match DEV_SESSION_COOKIE. A
  // production build with DEV_MODE unset takes the normal Firebase
  // path. A dev build receiving a REAL Firebase token (e.g., dev testing
  // with their own account) ALSO takes the normal path because the
  // cookie value doesn't match DEV_SESSION_COOKIE exactly. Regression
  // tests in src/tests/auth-get-user.logic.test.ts lock these
  // properties in place.
  if (isDevMode() && cookie === DEV_SESSION_COOKIE) {
    return 'dev-user';
  }

  try {
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      // Not initialized. In production this is a misconfiguration and every auth
      // check will fail silently — escalate to logError so alerting fires. In dev,
      // logWarn is fine (running without a service account is common).
      // We still return null rather than throw: a single misconfig should not
      // crash every route handler. logError is the alert mechanism.
      if (process.env.NODE_ENV === 'production') {
        logError(
          '[auth/get-user]',
          new Error('firebase-admin not initialized in production — auth bypass risk'),
          { stage: 'init' },
        );
      } else {
        logWarn('[auth/get-user]', 'firebase-admin not initialized');
      }
      return null;
    }
    const decoded = await admin.auth().verifyIdToken(cookie);
    return decoded.uid;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/id-token-revoked') {
      logWarn('[auth/get-user]', 'token expired/revoked', { code });
      return null;
    }
    logError('[auth/get-user]', err, { stage: 'verifyIdToken' });
    return null;
  }
}

export async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
  // Prefer Bearer header when present. Mobile clients (Expo) send
  // `Authorization: Bearer <Firebase idToken>` and DO NOT send browser cookies.
  // Critically, when DEV_MODE=true, the middleware injects __session=dev.buildo.local
  // on EVERY incoming request (including mobile requests that already carry a
  // valid Bearer). If we checked cookie first, the dev-mode bypass at
  // verifyIdTokenCookie would short-circuit to 'dev-user' and the real Firebase
  // UID would be silently discarded — every mobile session in dev would share
  // dev-user's profile. WF3 2026-05-02: caught when mobile onboarding PATCH
  // returned TRADE_IMMUTABLE because dev-user already had a trade_slug.
  //
  // Authorization header present → commit to the Bearer flow regardless of
  // whether extractBearerToken returns a valid token. Even a malformed,
  // non-Bearer, or whitespace-only Authorization header is an explicit auth
  // attempt and must NOT fall through to the cookie path. Falling through
  // would let an attacker send `Authorization: Bearer ` (empty) or
  // `Authorization: garbage` alongside a valid (or middleware-injected dev)
  // cookie to authenticate via the cookie while looking like a Bearer client
  // — closing that vector by fail-closed on any Authorization header.
  //
  // No Authorization header → fall back to cookie (web admin browser /
  // Next.js SSR Server Components don't send Bearer; the cookie path is
  // correct for them). Both absent → null.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== null) {
    // extractBearerToken returns undefined for missing/malformed/non-Bearer
    // values; verifyIdTokenCookie handles undefined input as null.
    const bearerToken = extractBearerToken(authHeader);
    return verifyIdTokenCookie(bearerToken);
  }

  const cookie = request.cookies.get('__session')?.value;
  if (cookie) return verifyIdTokenCookie(cookie);

  return null;
}
