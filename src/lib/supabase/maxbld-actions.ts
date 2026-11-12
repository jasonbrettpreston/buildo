'use server';

// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3 (Server Actions are the only email/password path), §4;
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login`: the shared screen, MaxBLD strings from content),
//            11b.7 W2 (sign up, reset, same account as the app); plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md §3.2 and folds 5-7.
//
// MF-46 · the MaxBLD sign-up, reset, set-new-password and terms actions beside the shared sign-in (signInAction in actions.ts is reused
// as is). Rules carried from the plan folds:
//   - every email link is built from MAXBLD_ORIGIN, never from the Host header (fold 6);
//   - sign-up and reset return ONE outcome for every address (no account enumeration; fold 5), except a password GoTrue refuses as weak;
//   - set-new-password accepts only a session from the recovery link (`amr` method `recovery`; secure_password_change = false, fold 6);
//   - the terms write is server-stamped and writes only while empty, never `onboarding_complete` (D-2 b; fold 7);
//   - no `account_type` is written for MaxBLD (Spec 116 N4: left out, not faked; fold 5).
// Errors are logged with a stage only (never the email); the page shows a content string chosen by the returned code.
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { pool } from '@/lib/db/client';
import { MAXBLD_ORIGIN } from '@/lib/auth/host-policy';
import { acceptTerms } from '@/lib/auth/maxbld-terms';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

const TAG = '[auth/maxbld-actions]';

export type MaxbldCode = 'sent' | 'short' | 'expired' | 'required' | 'generic' | 'done';
export interface MaxbldActionResult {
  code: MaxbldCode;
  /** On `done`: the same-origin MaxBLD path the page moves to (router.push after the action). */
  next?: string;
}

const isWeak = (e: { code?: string | undefined; message?: string | undefined } | null): boolean =>
  e !== null && (e.code === 'weak_password' || /password/i.test(e.message ?? '') && /(short|least|weak)/i.test(e.message ?? ''));

/** Where an email link lands: the shared callback exchanges the code, then the MaxBLD guard keeps only a host-table path. */
const linkTo = (path: string): string => `${MAXBLD_ORIGIN}/auth/callback?redirect=${encodeURIComponent(path)}`;

export async function maxbldSignUpAction(email: string, password: string, displayName: string): Promise<MaxbldActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: linkTo('/terms-accept'), data: { display_name: displayName } },
    });
    if (isWeak(error)) return { code: 'short' };
    if (error) logError(TAG, error, { stage: 'sign-up' });
    return { code: 'sent' };
  } catch (err) {
    logError(TAG, err, { stage: 'sign-up' });
    return { code: 'sent' };
  }
}

export async function maxbldResetAction(email: string): Promise<MaxbldActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: linkTo('/set-password') });
    if (error) logError(TAG, error, { stage: 'reset' });
  } catch (err) {
    logError(TAG, err, { stage: 'reset' });
  }
  return { code: 'sent' };
}

/** True when the session came from a recovery link (the JWT `amr` carries method `recovery`). */
function fromRecovery(claims: Record<string, unknown> | undefined): boolean {
  const amr = claims?.amr;
  return Array.isArray(amr) && amr.some((m) => typeof m === 'object' && m !== null && (m as { method?: unknown }).method === 'recovery');
}

export async function maxbldSetPasswordAction(password: string): Promise<MaxbldActionResult> {
  try {
    const supabase = await createClient();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !data || !fromRecovery(data.claims as Record<string, unknown>)) return { code: 'expired' };
    const { error } = await supabase.auth.updateUser({ password });
    if (isWeak(error)) return { code: 'short' };
    if (error) {
      logError(TAG, error, { stage: 'set-password' });
      return { code: 'generic' };
    }
    return { code: 'done', next: '/parcel-tool' };
  } catch (err) {
    logError(TAG, err, { stage: 'set-password' });
    return { code: 'generic' };
  }
}

export async function maxbldAcceptTermsAction(agreed: boolean, redirect: string | null): Promise<MaxbldActionResult> {
  if (agreed !== true) return { code: 'required' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const uid = !error && data && typeof data.claims.sub === 'string' ? data.claims.sub : null;
    if (!uid) return { code: 'expired' };
    await acceptTerms(pool, uid);
    return { code: 'done', next: safeRedirectPath(redirect, { maxbld: true }) };
  } catch (err) {
    logError(TAG, err, { stage: 'terms' });
    return { code: 'generic' };
  }
}
