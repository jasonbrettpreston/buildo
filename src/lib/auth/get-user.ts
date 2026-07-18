// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.2 (getClaims vs getUser),
//            §3.3 (chokepoint), §3.5 (shape-check reconciliation), §4a (JWKS fetch failure)
//            .cursor/phase1_plan.md Item 1 + Item 2 (get-user.ts row)
//
// Server-side Supabase session verification for API route handlers and
// Server Components. Replaces the Firebase-era `verifyIdTokenCookie`/
// `getUserIdFromSession` pair. Never throws — returns null on any failure so
// the route can return 401 cleanly (unchanged contract).
//
// Two verifiers, not one (Spec 13 §3.2's per-route cost/freshness table):
//   - `getClaimsUid`   — local JWKS signature check, no network round-trip.
//                        DEFAULT. Read paths, including admin reads.
//   - `getVerifiedUid` — round-trips to GoTrue, catches just-revoked
//                        sessions immediately. Money movement, account
//                        mutation, admin writes. Returns a branded
//                        `VerifiedUid`, not a bare `string` — downstream
//                        mutation helpers should type their `uid` param as
//                        `VerifiedUid` so passing a `getClaimsUid` result in
//                        is a compile-time error, not a runtime trust bug.
//
// `getUserIdFromSession` is kept as a back-compat alias (see its own
// docstring below) so the ~32 pre-existing consuming routes outside this
// WF's file scope keep compiling and keep their EXISTING revocation-checked
// security posture unchanged.
//
// Preserved verbatim from the Firebase era (Item 2 table):
//   - 8KB `MAX_TOKEN_BYTES` length guard, applied before any verification work.
//   - 3-segment JWT shape check — Bearer path ONLY (Item 1 shape-check
//     reconciliation: `sb-*` cookies are @supabase/ssr's own chunked
//     encoding, never manually shape-checked here; a Supabase Bearer JWT is
//     still a plain 3-segment JWT).
//   - Bearer-vs-cookie precedence: an Authorization header present commits
//     to the Bearer flow regardless of whether it parses — no fallthrough
//     to the cookie path on a malformed/empty Bearer value.
//   - Timing-safe DEV_MODE bypass, gated on BOTH `isDevMode()` AND
//     `NODE_ENV !== 'production'`, present on BOTH the Bearer and cookie
//     paths (either could be the first call on a fresh dev session).
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { logError } from '@/lib/logger';
import {
  isDevMode,
  DEV_SESSION_COOKIE,
  SESSION_COOKIE_NAME,
  extractBearerToken,
} from '@/lib/auth/route-guard';
import { createClient } from '@/lib/supabase/server';

// Supabase asymmetric JWTs (ES256/RS256) typically run 800B-1.2KB — larger
// than Firebase's ~1.5KB ID tokens' neighborhood but still well under this
// ceiling (~6x headroom). Guard PLACEMENT (before any verification work) is
// what matters — it bounds CPU/memory on a pathological oversized input,
// independent of which provider issued the real tokens (Item 2).
const MAX_TOKEN_BYTES = 8 * 1024;

/** Branded uid returned only by `getVerifiedUid` — see file header. */
export type VerifiedUid = string & { readonly __brand: 'VerifiedUid' };

/**
 * Constant-time equality for the dev-bypass comparison. Returns false on
 * length mismatch without invoking timingSafeEqual (which throws on length
 * mismatch — we want a silent false, not an exception).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Shared DEV_MODE short-circuit, called from both the Bearer and cookie
 * paths (Item 2: "it can't live in only one, since either could be the
 * first call on a fresh dev session"). Two-flag defense: `isDevMode()`
 * already requires `DEV_MODE==='true'`; this ALSO requires
 * `NODE_ENV !== 'production'` independently so a single misconfigured var
 * cannot silently disable auth (Spec 13 §4a dev-bypass failure mode).
 */
function devBypassUid(raw: string): string | null {
  if (
    isDevMode() &&
    process.env.NODE_ENV !== 'production' &&
    timingSafeStringEqual(raw, DEV_SESSION_COOKIE)
  ) {
    return 'dev-user';
  }
  return null;
}

type VerifyMethod = 'claims' | 'user';

/** Verify an explicit raw token (Bearer path) against Supabase. */
async function verifyRawToken(token: string, method: VerifyMethod): Promise<string | null> {
  try {
    const supabase = await createClient();
    if (method === 'claims') {
      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data) return null;
      return data.claims.sub ?? null;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    // Spec 13 §4a — distinguishable JWKS/network-failure signal, separate
    // from an ordinary "token invalid/expired" outcome (which the SDK
    // returns as a typed `{ error }` result above, not a throw).
    logError('[auth/get-user]', err, { stage: 'jwks_or_network', method });
    return null;
  }
}

/**
 * Verify the request's own Supabase session cookie jar — no explicit token
 * passed. `@supabase/ssr`'s server client reads whichever chunked `sb-*`
 * cookie set it wrote (Item 1: the cookie name is NOT `__session` anymore;
 * Buildo does not choose or read it directly).
 */
async function verifySessionCookie(method: VerifyMethod): Promise<string | null> {
  try {
    const supabase = await createClient();
    if (method === 'claims') {
      const { data, error } = await supabase.auth.getClaims();
      if (error || !data) return null;
      return data.claims.sub ?? null;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    logError('[auth/get-user]', err, { stage: 'jwks_or_network', method });
    return null;
  }
}

async function resolveUid(request: NextRequest, method: VerifyMethod): Promise<string | null> {
  // Authorization header present -> commit to the Bearer flow regardless of
  // whether extractBearerToken returns a valid token. A malformed,
  // non-Bearer, or whitespace-only Authorization header is an explicit auth
  // attempt and must NOT fall through to the cookie path (closes the vector
  // where a garbage Bearer + a valid/dev cookie authenticates via cookie).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== null) {
    const bearerToken = extractBearerToken(authHeader);
    if (!bearerToken) return null;
    // Length guard BEFORE any other work.
    if (bearerToken.length > MAX_TOKEN_BYTES) return null;
    // Dev-mode bypass — mirrors the pre-swap behavior where
    // verifyIdTokenCookie ran the SAME check on a bearer-sourced value.
    const devUid = devBypassUid(bearerToken);
    if (devUid) return devUid;
    // Shape check — Bearer path ONLY (Item 1 shape-check reconciliation).
    if (bearerToken.split('.').length !== 3) return null;
    return verifyRawToken(bearerToken, method);
  }

  // No Authorization header -> cookie path (web admin / SSR Server Components
  // don't send Bearer). DEV_MODE synthetic cookie check FIRST: middleware
  // only ever injects the fake session under the repurposed
  // SESSION_COOKIE_NAME ('__session') — a real Supabase session never uses
  // that cookie name (Item 1), so a match here is unambiguously the dev
  // bypass. A NON-matching (or absent) value under this legacy cookie name
  // is NOT treated as "no real session possible" — it falls through to
  // `verifySessionCookie`, which defers entirely to the SDK's own `sb-*`
  // cookie jar (a stray/legacy `__session` cookie coexisting with a real
  // Supabase session is not a contradiction; Item 1's whole point is that
  // Buildo no longer reads a manually-named cookie for the real path).
  const devCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (devCookie !== undefined && devCookie.length <= MAX_TOKEN_BYTES) {
    const devUid = devBypassUid(devCookie);
    if (devUid) return devUid;
  }

  return verifySessionCookie(method);
}

/**
 * Default READ-path verifier (Spec 13 §3.2): local JWKS signature check, no
 * network round-trip once the JWKS is cached. A revoked/banned user's
 * still-live token verifies successfully until natural expiry — acceptable
 * for "an already-authenticated user reads slightly-stale data".
 */
export async function getClaimsUid(request: NextRequest): Promise<string | null> {
  return resolveUid(request, 'claims');
}

/**
 * Money-movement / account-mutation / admin-write verifier (Spec 13 §3.2):
 * round-trips to GoTrue so a just-revoked session cannot complete a
 * state-changing action before the revocation takes effect.
 */
export async function getVerifiedUid(request: NextRequest): Promise<VerifiedUid | null> {
  const uid = await resolveUid(request, 'user');
  return uid as VerifiedUid | null;
}

/**
 * @deprecated Back-compat alias. This Phase-1 auth swap's file scope
 * (`.cursor/phase1_plan.md` P1-F2) touches `verify-admin.ts` and
 * `get-user-context.ts` directly (both call `getClaimsUid`/`getVerifiedUid`
 * explicitly per Spec 13 §3.2) but does NOT touch the other ~29 routes that
 * import this helper — that per-route migration is out of this WF's
 * authorized scope. The Firebase-era implementation ran EVERY call through
 * `verifyIdToken(cookie, true)` — i.e. revocation-checked (`getUser()`-
 * grade) verification uniformly, regardless of whether the route was a read
 * or a mutation. Aliasing to `getVerifiedUid` (NOT the cheaper
 * `getClaimsUid`) preserves that existing security posture exactly for
 * every untouched call site — switching them to the read-path check here
 * would be a silent revocation-checking downgrade introduced as a side
 * effect of an unrelated refactor. New call sites should import
 * `getClaimsUid`/`getVerifiedUid` directly per the Spec 13 §3.2 criteria
 * table instead of this alias.
 */
export async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
  return getVerifiedUid(request);
}
