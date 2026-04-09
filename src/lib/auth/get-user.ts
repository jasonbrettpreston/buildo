// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 + docs/specs/00_engineering_standards.md §4
//
// Server-side Firebase token verification for API route handlers.
// NEVER import this from a 'use client' component — uses firebase-admin (Node runtime only).
// Middleware stays edge-runtime fast and only does cookie shape pre-checks; full token
// verification happens here, in the route handler's Node runtime.

import type { NextRequest } from 'next/server';
import { logError, logWarn } from '@/lib/logger';

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
  return verifyIdTokenCookie(request.cookies.get('__session')?.value);
}
