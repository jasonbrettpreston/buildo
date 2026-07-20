'use server';

// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3, §4
//
// Sign-in/sign-up Server Actions — Phase 1 Item 1 [panel-fold: GT+Security
// BLOCKING]. These are the ONLY path for email/password authentication.
// Both call `createClient()` from `server.ts` — the SAME httpOnly-
// cookieOptions server client `updateSession`/route handlers use — so the
// resulting `Set-Cookie` on the action's response is genuinely httpOnly.
// `LoginForm.tsx` posts credentials here instead of calling a browser
// client directly; the browser client (`browser.ts`) is reserved for the
// Google-OAuth redirect only, which never carries credentials and writes no
// cookie itself.
//
// Return shape: `{ error: string | null }` rather than throwing. Next.js
// redacts thrown Server Action errors to a generic message in production
// builds (digest-only) — returning the message explicitly preserves the
// user-facing error text `LoginForm.tsx` displays, matching the Firebase-era
// `session.ts` behavior of surfacing `err.message` to the caller.
import { createClient } from '@/lib/supabase/server';
import type { AccountType } from '@/lib/auth/types';
import { logError } from '@/lib/logger';

export interface AuthActionResult {
  error: string | null;
  /**
   * True when the just-established session is aal1 but the account carries a
   * verified TOTP factor (Spec 13 §3.6/§4a admin MFA) — `LoginForm.tsx` must
   * render the code-entry step instead of treating sign-in as complete.
   * `factorId` is the verified factor to challenge. WF3 2026-07-20: prior to
   * this fix `signInAction` never checked AAL at all, so an MFA-enrolled
   * admin's session silently stayed at aal1 forever with no UI ever telling
   * them a code was needed (every `/api/admin/*` call then 401'd with no
   * explanation traceable from the login screen).
   */
  mfaRequired?: boolean;
  factorId?: string;
}

export interface MfaChallengeResult {
  challengeId: string | null;
  error: string | null;
}

export async function signInAction(email: string, password: string): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Spec 13 §3.6: admin accounts require TOTP MFA; signInWithPassword only
  // ever reaches aal1 — GoTrue does not block the password grant itself.
  // Reuse the SAME client instance (not a fresh createClient() call) so this
  // reads the session that was JUST established in this request, with no
  // extra cookie round-trip.
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    // Fail OPEN to "no MFA step" rather than hard-blocking login over an
    // AAL-check glitch — a non-admin account (no factors enrolled) hitting
    // this branch would otherwise be locked out by an unrelated error.
    logError('[auth/actions]', aalError, { stage: 'aal-check' });
    return { error: null };
  }
  if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      logError('[auth/actions]', factorsError, { stage: 'list-factors' });
      return { error: null };
    }
    const factorId = factors?.totp.find((f) => f.status === 'verified')?.id;
    if (factorId) {
      return { error: null, mfaRequired: true, factorId };
    }
  }
  return { error: null };
}

/**
 * Start a TOTP challenge for the given factor. Called AFTER `signInAction`
 * reports `mfaRequired` — the session at this point is aal1 (password
 * verified, second factor not yet). Server Action, not the browser client:
 * `browser.ts`'s scope is deliberately narrowed to Google OAuth only (the
 * session cookie is httpOnly and unreadable from client JS — see that
 * file's header), so every credentialed/MFA operation must run server-side
 * against the same httpOnly-cookie session `signInAction` established.
 */
export async function mfaChallengeAction(factorId: string): Promise<MfaChallengeResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error) {
    logError('[auth/actions]', error, { stage: 'mfa-challenge' });
    return { challengeId: null, error: error.message };
  }
  return { challengeId: data.id, error: null };
}

/**
 * Verify a TOTP code against an open challenge. On success GoTrue mints a
 * new aal2 session and this request's `setAll` callback (see `server.ts`)
 * writes the upgraded httpOnly session cookie — same mechanism as every
 * other auth mutation in this file, no separate cookie-write path needed.
 */
export async function mfaVerifyAction(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  return { error: error?.message ?? null };
}

export async function signUpAction(
  email: string,
  password: string,
  displayName: string,
  accountType: AccountType,
): Promise<AuthActionResult> {
  const supabase = await createClient();
  // display_name/account_type ride the GoTrue `user_metadata` (raw_user_meta_data)
  // rather than a Firestore write (session.ts's `createUserProfile` — deleted,
  // Firestore has no successor, Spec 13 §3.3). Postgres `user_profiles`
  // provisioning for these fields is a Phase-2+/onboarding-flow concern, out
  // of this Phase-1 auth-swap's scope — the metadata here is preserved so it
  // is not silently lost, not because a consumer reads it yet.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, account_type: accountType } },
  });
  return { error: error?.message ?? null };
}
