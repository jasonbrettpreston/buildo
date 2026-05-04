// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 + docs/specs/00-architecture/00_engineering_standards.md §4
//
// Server-side Firebase token verification for API route handlers.
// NEVER import this from a 'use client' component — uses firebase-admin (Node runtime only).
// Middleware stays edge-runtime fast and only does cookie shape pre-checks; full token
// verification happens here, in the route handler's Node runtime.
//
// WF3 2026-05-04 (review_followups.md auth-hardening bundle): five hardenings:
//   (a) Timing-safe equality on the dev-bypass cookie comparison —
//       `===` short-circuits at first mismatched character; gives a
//       distinguishable timing channel that an adversary could combine
//       with a guess-and-measure attack to extract DEV_SESSION_COOKIE
//       byte-by-byte. Replaced with `crypto.timingSafeEqual` + length
//       pre-check.
//   (b) `verifyIdToken(cookie, true)` — the second positional arg is
//       `checkRevoked`. Without it, Firebase Admin does NOT throw
//       `auth/id-token-revoked` and revoked tokens (post-password-change,
//       admin-disable, etc.) authenticate indefinitely. Spec 93 §3.1
//       requires server-side enforcement for forced sign-out.
//   (c) Throw on production firebase-admin uninitialized instead of
//       silently returning null — pre-fix, every auth check returned a
//       null uid and downstream routes returned 401 with no signal that
//       the cause was a misconfiguration. Boot-time init throws via
//       commit 403adcc; this is defense-in-depth for the exotic case
//       where boot init succeeded but the apps array got cleared.
//   (d) Defense-in-depth on the dev-bypass: require `NODE_ENV !==
//       'production'` AS WELL AS `isDevMode()`. A misconfigured prod
//       deployment with `DEV_MODE=true` would otherwise bypass auth
//       for any client that knows the well-known `dev.buildo.local`
//       cookie value.
//   (e) 8 KB length guard before any cryptographic work — an attacker
//       sending a 1 MB JWT would otherwise tie up CPU/memory in
//       verifyIdToken before Firebase rejects.

import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { logError, logWarn } from '@/lib/logger';
import { isDevMode, DEV_SESSION_COOKIE, extractBearerToken } from '@/lib/auth/route-guard';

const MAX_TOKEN_BYTES = 8 * 1024; // 8 KB — Firebase ID tokens are ~1.5 KB

/**
 * Constant-time equality for the dev-bypass cookie compare. Returns
 * false on length mismatch without invoking timingSafeEqual (which
 * throws on length mismatch — we want a silent false, not an exception).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify a raw `__session` cookie value via Firebase Admin. Returns the
 * uid on success, null on any failure (missing, malformed, expired,
 * revoked, admin SDK uninitialized in dev). Extracted from
 * getUserIdFromSession in Phase 3-iv so Server Components can call it
 * directly with `cookies().get('__session')?.value` from `next/headers`
 * — they don't have access to the NextRequest object that the API-route
 * variant takes.
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
  // (e) Length guard BEFORE any other work — reject pathological inputs
  // before we burn CPU on shape checks or Firebase parsing.
  if (cookie.length > MAX_TOKEN_BYTES) return null;
  // Quick shape check: must look like a JWT (3 segments)
  if (cookie.split('.').length !== 3) return null;

  // WF3 2026-04-11 Bug #2 fix: dev-mode bypass. The middleware injects
  // DEV_SESSION_COOKIE when DEV_MODE=true so the browser (and now,
  // after Bug #1 fix, the current-request Server Component) see a
  // session. Skip Firebase verification for this exact fake cookie and
  // return a stable dev uid — the real flow would reject it because
  // it's not a Google-signed JWT.
  //
  // (d) Defense-in-depth: require BOTH `isDevMode()` (DEV_MODE env var)
  // AND `NODE_ENV !== 'production'`. A misconfigured prod build with
  // `DEV_MODE=true` would otherwise bypass auth for any client that
  // knows the well-known DEV_SESSION_COOKIE value.
  //
  // (a) Timing-safe equality: `cookie === DEV_SESSION_COOKIE` with
  // standard `===` short-circuits at the first mismatched character,
  // creating a measurable timing channel an adversary could combine with
  // a guess-and-measure attack to extract DEV_SESSION_COOKIE byte-by-byte.
  // Even though this is dev-only, the comparison runs on every request,
  // and the same code path could be ported to a production-secret check
  // by a future refactor without anyone noticing.
  if (
    isDevMode() &&
    process.env.NODE_ENV !== 'production' &&
    timingSafeStringEqual(cookie, DEV_SESSION_COOKIE)
  ) {
    return 'dev-user';
  }

  try {
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      // Not initialized. In production this is a misconfiguration and every auth
      // check would otherwise fail silently (silent 401 storm) — escalate to a
      // throw that the route's top-level try/catch surfaces as 500. Boot-time
      // init already throws (commit 403adcc); this is defense-in-depth for the
      // exotic case where boot init succeeded but the apps array got cleared.
      // In dev, logWarn is fine (running without a service account is common).
      if (process.env.NODE_ENV === 'production') {
        const err = new Error(
          'firebase-admin not initialized in production — auth bypass risk',
        );
        logError('[auth/get-user]', err, { stage: 'init' });
        // (c) WF3 2026-05-04: throw instead of return null. A silent 401
        // storm gives no diagnostic; a 500 trips alerting and surfaces
        // the real cause (missing service account, GCS perms, etc).
        throw err;
      }
      logWarn('[auth/get-user]', 'firebase-admin not initialized');
      return null;
    }
    // (b) WF3 2026-05-04: pass `checkRevoked: true` so revoked tokens
    // (post-password-change, admin-disabled, project-token-revoked) are
    // rejected with `auth/id-token-revoked`. Pre-fix this would silently
    // accept revoked tokens until expiry (~1hr). Spec 93 §3.1 requires
    // server-side enforcement for forced sign-out.
    const decoded = await admin.auth().verifyIdToken(cookie, true);
    return decoded.uid;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/id-token-expired' || code === 'auth/id-token-revoked') {
      logWarn('[auth/get-user]', 'token expired/revoked', { code });
      return null;
    }
    // (c) Re-throw the production-uninitialized error so the route handler
    // returns 500. This branch is only reached when the inner block threw
    // an Error WITHOUT a `code` field — Firebase verification errors
    // always have `code`, so any code-less Error is the production-init
    // throw. Letting it bubble up turns silent 401s into actionable 500s.
    if (
      process.env.NODE_ENV === 'production' &&
      err instanceof Error &&
      err.message.includes('firebase-admin not initialized')
    ) {
      throw err;
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
