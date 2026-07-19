// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §5.1
//             docs/specs/00-architecture/13_authentication.md §3.6, §3.7, §4a
//             .cursor/phase1_plan.md Item 6
//
// Per-route admin auth helper. Spec 33 §5 calls out that middleware-only
// admin protection is insufficient ("middleware can be bypassed by
// misconfigured Next.js rewrites; the per-route guard is defense-in-depth").
// Every route handler under `src/app/api/admin/**/route.ts` MUST call
// `verifyAdminAuth(request)` as the first line, before reading params or
// touching the database.
//
// Three valid auth modes (Firebase -> Supabase swap, Spec 13 §3.6):
//   1. dev_bypass — unchanged. `isDevMode()` short-circuits in local dev.
//   2. admin_key — CI/pipeline credential, re-evaluated per Spec 13 §3.7 /
//      phase1_plan.md Item 6: `CI_ADMIN_TOKEN` (successor to `ADMIN_API_KEY`,
//      NEVER the Supabase `service_role` key) + `CI_ADMIN_ALLOWED_IPS`.
//      Constant-time compared exactly as `ADMIN_API_KEY` was — only the
//      credential's SCOPE changes.
//   3. session — a verified Supabase session, checked against
//      `profiles.is_admin` (Spec 13 §3.6's "one-line swap" seam the
//      original `ADMIN_USER_IDS` comment anticipated). Uses `getVerifiedUid`
//      (getUser()-grade, revocation-checked) — admin auth is high-stakes
//      regardless of whether the specific route is a read or a write.
//
// MFA gate (Item 6): code path LANDED here, but INERT until
// `ADMIN_MFA_ENFORCED=true` — Phase 1.3(b)/(c) sequencing is load-bearing
// (profiles+bootstrap -> MFA+break-glass verified end-to-end -> only then
// flip enforcement on). Flipping it on before break-glass is proven is the
// MFA-lockout failure mode Spec 13 §4a names explicitly; this file does not
// flip it — that is Phase 1.3(b)'s job (P1-F4, out of this WF's scope).

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { consumeBackupCode } from '@/lib/admin/backup-codes';
import { getVerifiedUid } from '@/lib/auth/get-user';
import { isDevMode } from '@/lib/auth/route-guard';
import { pool } from '@/lib/db/client';
import { logError, logWarn } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

// State-mutating HTTP methods. Spec 33 §13 mandates an Origin check on
// these — GET/HEAD/OPTIONS bypass the CSRF gate (read-only).
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** The auth method that produced the admin context. Surfaced for telemetry. */
export type AdminAuthMethod = 'session' | 'admin_key' | 'dev_bypass';

export interface AdminContext {
  /** Verified Supabase uid for `'session'` mode; `'admin-key'` sentinel for `'admin_key'`; `'dev-user'` for `'dev_bypass'`. */
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
  // 0. Spec 33 §13 CSRF gate — unchanged, unrelated to the auth provider.
  if (MUTATING_METHODS.has(request.method)) {
    if (!isOriginAllowed(request)) {
      logWarn('[auth/verify-admin]', 'CSRF: origin not in allowlist', {
        method: request.method,
        origin: request.headers.get('origin') ?? null,
      });
      return null;
    }
  }

  // 1. Dev mode bypass — unchanged.
  if (isDevMode()) {
    return { uid: 'dev-user', authMethod: 'dev_bypass' };
  }

  // 2. CI credential + IP allowlist (Spec 13 §3.7 successor to X-Admin-Key).
  //    Done BEFORE the session verify so the common service path (CI /
  //    pipeline scripts) doesn't pay that cost. Constant-time compare to
  //    defeat timing side-channel enumeration of the secret.
  const ciToken = request.headers.get('x-admin-key');
  const expectedToken = process.env.CI_ADMIN_TOKEN;
  if (expectedToken && ciToken && timingSafeStringEqual(ciToken, expectedToken)) {
    const allowedIps = parseCiAllowedIps(process.env.CI_ADMIN_ALLOWED_IPS);
    const callerIp = getClientIp(request);
    if (allowedIps.length > 0 && callerIp && allowedIps.includes(callerIp)) {
      return { uid: 'admin-key', authMethod: 'admin_key' };
    }
    logWarn('[auth/verify-admin]', 'CI_ADMIN_TOKEN matched but caller IP not in CI_ADMIN_ALLOWED_IPS', {
      callerIp,
    });
    // Fall through to session check (mirrors the pre-swap "wrong admin-key
    // value falls through to session" shape) rather than an immediate 401 —
    // harmless for a real CI caller (no session cookie to fall back to).
  }

  // 3. Session + profiles.is_admin check.
  let uid: string | null;
  try {
    uid = await getVerifiedUid(request);
  } catch (err) {
    logError('[auth/verify-admin]', err, { stage: 'session-verify' });
    return null;
  }
  if (!uid) return null;

  let isAdmin = false;
  try {
    const res = await pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM profiles WHERE id = $1`,
      [uid],
    );
    isAdmin = res.rows[0]?.is_admin === true;
  } catch (err) {
    // `profiles` may not exist yet this early in the migration sequence
    // (226_profiles_admin_bootstrap.sql, sibling-scope migration) — fail
    // closed (not-admin), but log distinguishably (Spec 13 §4a
    // diagnosability rule) so a genuine DB outage isn't silently confused
    // with "no admins provisioned yet".
    logError('[auth/verify-admin]', err, { stage: 'profiles-lookup', uid });
    return null;
  }

  if (!isAdmin) {
    // Privilege-escalation attempt: an authenticated user hitting an
    // admin route. Logged at WARN with the uid so operators can audit.
    logWarn('[auth/verify-admin]', 'authenticated user is not an admin', {
      uid,
    });
    return null;
  }

  // MFA gate — landed, INERT until ADMIN_MFA_ENFORCED=true (see file header
  // + phase1_plan.md Item 6 sequencing).
  if (process.env.ADMIN_MFA_ENFORCED === 'true') {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel !== 'aal2') {
        // Backup-code alternative (P1-F4.3 / fold 22): an admin below aal2
        // (lost/replaced authenticator) may present ONE unused backup code
        // via the `x-admin-backup-code` header. Consumption is single-use
        // and race-guarded (see backup-codes.ts) — a replayed code fails.
        // This is a per-request pass, NOT an aal2 upgrade: the session stays
        // aal1, so every subsequent admin request burns another code until
        // the admin re-enrolls — by design, backup codes are a recovery
        // ramp, not a standing second factor.
        const backupCode = request.headers.get('x-admin-backup-code');
        if (backupCode) {
          const consumed = await consumeBackupCode(uid, backupCode);
          if (consumed) {
            logWarn('[auth/verify-admin]', 'MFA backup code consumed as challenge alternative', { uid });
            return { uid, authMethod: 'session' };
          }
          logWarn('[auth/verify-admin]', 'invalid or already-used MFA backup code presented', { uid });
          return null;
        }
        logWarn('[auth/verify-admin]', 'admin session below aal2 — MFA challenge required', { uid });
        return null;
      }
    } catch (err) {
      logError('[auth/verify-admin]', err, { stage: 'mfa-check', uid });
      return null;
    }
  }

  return { uid, authMethod: 'session' };
}

/**
 * Parse the `ADMIN_USER_IDS` env var into a uid array.
 *
 * Retained as a standalone utility (NOT used by `verifyAdminAuth`'s mode 3
 * anymore — that now queries `profiles.is_admin`, Spec 13 §3.6) because
 * `src/app/api/admin/users/[uid]/route.ts`'s Guard 1 ("never mutate an
 * admin allowlist member") still reads it directly. Migrating that guard to
 * `profiles.is_admin` is out of this WF's file scope (`.cursor/
 * phase1_plan.md` P1-F2/P1-F5.1) — flagged as a follow-up, not silently
 * dropped: removing this export would break that route's compile.
 */
export function parseAdminAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the `CI_ADMIN_ALLOWED_IPS` env var (successor to the old
 * `ADMIN_ALLOWED_ORIGINS`-adjacent shape) into an IP allowlist.
 * Comma-separated, whitespace-trimmed, empty entries dropped.
 */
export function parseCiAllowedIps(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract the caller's IP for the CI-credential IP allowlist.
 *
 * [panel-fold: DS+Gm, phase1_plan.md Item 6] specified `request.ip` — "the
 * Vercel-set request property... never `x-forwarded-for` directly" — to
 * avoid trusting a client-settable header. CORRECTION found at
 * implementation time (Context7 + this repo's installed `next@15.1` types):
 * `NextRequest` no longer exposes an `.ip` property — Next.js removed it
 * after 13.4.13 (confirmed: no `ip` getter in
 * `node_modules/next/dist/server/web/spec-extension/request.d.ts`).
 * Vercel's own current guidance is to read `x-forwarded-for` from headers —
 * Vercel's edge network overwrites this header before the request reaches
 * the function, so on a Vercel deployment it is not client-settable despite
 * the header name. This is a Vercel-platform trust assumption this codebase
 * cannot verify from within `next`'s types alone; flagged for Security/
 * Integration re-confirmation against the actual Vercel deployment before
 * `CI_ADMIN_ALLOWED_IPS` is relied on in production.
 */
export function getClientIp(request: NextRequest): string | null {
  // Preference order (security review 2026-07-18 — spoofable-XFF finding):
  // 1. `x-vercel-forwarded-for` / `x-real-ip` — set by Vercel's proxy layer
  //    and NOT forwardable from the client (Vercel strips/overwrites them).
  // 2. Fallback: the RIGHTMOST `x-forwarded-for` entry — appended by the
  //    nearest proxy hop, unlike the client-controllable leftmost entry.
  // If none present, return null → the allowlist check FAILS CLOSED (mode 2
  // then falls through to the session path). The IP allowlist is a SECONDARY
  // factor on top of the constant-time CI_ADMIN_TOKEN compare — never the
  // primary gate.
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    const first = vercelIp.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) return null;
  const entries = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
  return entries[entries.length - 1] ?? null;
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
