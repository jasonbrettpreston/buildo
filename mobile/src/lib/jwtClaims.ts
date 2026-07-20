// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2 (Account Linking)
//
// P2 output-panel fold (2026-07-20): Apple's `signInAsync` credential carries
// `email` ONLY on the first authorization for an Apple ID — every subsequent
// sign-in returns `credential.email = null`. The account-linking email guard
// (sign-in.tsx `linkPendingIdentity`) was silently unguarded in that case: a
// user who dismissed the linking sheet and signed into a DIFFERENT account
// could have the pending Apple identity attached to the wrong uuid. The
// identity token JWT itself still carries the `email` claim — decode it
// locally (display/guard use only; GoTrue re-verifies the token's signature
// server-side, this is NOT a trust decision).
//
// Token-never-in-logs: this module never logs, throws, or stores the token.

/** Best-effort read of the `email` claim from a JWT's payload. Returns
 * undefined on any malformed input — callers must treat that as "unknown",
 * never as "verified absent". */
export function emailFromIdToken(token: string | null | undefined): string | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    // base64url → base64, pad to a multiple of 4 for atob.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { email?: unknown };
    return typeof payload.email === 'string' && payload.email.length > 0
      ? payload.email
      : undefined;
  } catch {
    return undefined;
  }
}
