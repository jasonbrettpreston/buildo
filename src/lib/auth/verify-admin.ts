// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §5.1
//
// Per-route admin auth helper. Spec 33 §5 calls out that middleware-only
// admin protection is insufficient ("middleware can be bypassed by
// misconfigured Next.js rewrites; the per-route guard is defense-in-depth").
// Every route handler under `src/app/api/admin/**/route.ts` MUST call
// `verifyAdminAuth(request)` as the first line, before reading params or
// touching the database.
//
// Three valid auth modes:
//   1. dev_bypass — `isDevMode()` short-circuits in local dev so admin
//      tools work without provisioning real admin uids.
//   2. admin_key — `X-Admin-Key` header equal to `ADMIN_API_KEY` env var.
//      Used by GitHub Actions / pipeline scripts / CI that hit admin
//      endpoints. Returns synthetic uid `'admin-key'` for telemetry.
//   3. session — Firebase `__session` cookie verifies a real uid via
//      `getUserIdFromSession`, then we check the uid against the
//      `ADMIN_USER_IDS` env-var allowlist (comma-separated). This is the
//      browser path used by human admins.
//
// Why allowlist, not `user_profiles.is_admin` column?
//   The `user_profiles` schema doesn't currently have an admin flag.
//   Adding one is a Spec 21 (User Management) dependency that requires a
//   migration + onboarding flow change. The env-var allowlist is the
//   pragmatic non-breaking interim. When Spec 21 lands its admin column,
//   this helper is a one-line swap (`adminUids.includes(uid)` →
//   `userProfile.is_admin === true`); call sites are unaffected.

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getUserIdFromSession } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { logError, logWarn } from '@/lib/logger';

// State-mutating HTTP methods. Spec 33 §13 mandates an Origin check on
// these — GET/HEAD/OPTIONS bypass the CSRF gate (read-only).
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** The auth method that produced the admin context. Surfaced for telemetry. */
export type AdminAuthMethod = 'session' | 'admin_key' | 'dev_bypass';

export interface AdminContext {
  /** Verified Firebase uid for `'session'` mode; `'admin-key'` sentinel for `'admin_key'`; `'dev-user'` for `'dev_bypass'`. */
  uid: string;
  authMethod: AdminAuthMethod;
}

/**
 * Verify admin auth on a route handler. Returns the admin context or null.
 * Caller MUST handle null by returning 401 with a sanitized envelope.
 *
 * Failures are silent at the contract level (return null) so the caller
 * can map to 401 cleanly. Failure REASONS are logged via `logError` /
 * `logWarn` for operator visibility — non-admin authenticated users
 * specifically log a `logWarn` so a privilege-escalation attempt is
 * attributable in production logs.
 */
export async function verifyAdminAuth(
  request: NextRequest,
): Promise<AdminContext | null> {
  // 0. Spec 33 §13 CSRF gate. State-mutating methods (POST/PATCH/PUT/DELETE)
  //    MUST present an Origin header that matches the allowed-origin
  //    allowlist. Failure short-circuits BEFORE any auth-mode check so a
  //    forged cross-site request with a valid cookie still bounces.
  if (MUTATING_METHODS.has(request.method)) {
    if (!isOriginAllowed(request)) {
      logWarn('[auth/verify-admin]', 'CSRF: origin not in allowlist', {
        method: request.method,
        origin: request.headers.get('origin') ?? null,
      });
      return null;
    }
  }

  // 1. Dev mode bypass. Mirrors `getCurrentUserContext` precedent — local
  //    dev shouldn't require real admin provisioning. `isDevMode()` is
  //    already defended by NODE_ENV !== 'production' AND DEV_MODE === 'true'
  //    (route-guard.ts); two independent flags must misconfigure to bypass.
  if (isDevMode()) {
    return { uid: 'dev-user', authMethod: 'dev_bypass' };
  }

  // 2. X-Admin-Key header check. Done BEFORE the firebase-admin verify so
  //    the common service path (CI / pipeline scripts) doesn't pay the
  //    network round-trip cost. Constant-time compare to defeat timing
  //    side-channel enumeration of the secret.
  const adminKey = request.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_API_KEY;
  if (expectedKey && adminKey && timingSafeStringEqual(adminKey, expectedKey)) {
    return { uid: 'admin-key', authMethod: 'admin_key' };
  }

  // 3. Session cookie + admin allowlist check.
  let uid: string | null;
  try {
    uid = await getUserIdFromSession(request);
  } catch (err) {
    logError('[auth/verify-admin]', err, { stage: 'session-verify' });
    return null;
  }
  if (!uid) return null;

  const adminUids = parseAdminAllowlist(process.env.ADMIN_USER_IDS);
  if (!adminUids.includes(uid)) {
    // Privilege-escalation attempt: an authenticated user hitting an
    // admin route. Logged at WARN with the uid so operators can audit.
    logWarn('[auth/verify-admin]', 'authenticated user is not an admin', {
      uid,
    });
    return null;
  }

  return { uid, authMethod: 'session' };
}

/**
 * Parse the `ADMIN_USER_IDS` env var into a uid array.
 * Comma-separated, whitespace-trimmed, empty entries dropped.
 * Exported for test injection.
 */
export function parseAdminAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the `ADMIN_ALLOWED_ORIGINS` env var into a host-only origin array.
 * Comma-separated, whitespace-trimmed, empty entries dropped, lowercased
 * for case-insensitive match. Exported for test injection.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Spec 33 §13 CSRF check. Compares the request's `Origin` header against
 * the `ADMIN_ALLOWED_ORIGINS` allowlist. Default-deny: missing Origin
 * header on a state-mutating request fails the check.
 *
 * Note: `Referer` is NOT a substitute — Origin is the spec-mandated header
 * for CSRF (Referer can be stripped by browser policy).
 */
function isOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = parseAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGINS);
  if (allowed.length === 0) return false; // Default-deny on misconfiguration.
  return allowed.includes(origin.toLowerCase());
}

/**
 * Constant-time string equality. `crypto.timingSafeEqual` requires equal
 * buffer lengths, so we length-check first (which leaks length, but the
 * admin key has a fixed length so this leaks no useful information).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
