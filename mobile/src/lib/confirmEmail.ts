// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Step 5 (P2-D4 amendment —
//             email confirmations ON + deep-link catch)
//
// Email-confirmation deep-link helpers (P2-D4, operator ruling 2026-07-19).
// `signUp()` runs with `emailRedirectTo: 'maxbld://auth/confirm'`; with the
// client factory's explicit `flowType: 'pkce'` (supabase.ts), GoTrue emits a
// one-time `?code=` param on the confirmation redirect. The catch calls
// `exchangeCodeForSession(code)`.
//
// P2-F3.4 RESOLUTION (verified against expo-router ~6.0.23's own
// `fork/extractPathFromURL.js`): for custom-scheme URLs the extracted path is
// `host + pathname`, so `maxbld://auth/confirm` maps to route path
// `/auth/confirm` — which a file inside the `(auth)` ROUTE GROUP (groups are
// stripped from URLs) can never match. The catch is therefore a root-layout
// `Linking` listener (app/_layout.tsx `EmailConfirmLinkCatcher`) that parses
// the URL with `parseConfirmDeepLink` below and forwards into the
// `app/(auth)/confirm.tsx` route (route path `/confirm`), which owns the
// exchange + error-state UI. Logic lives here so it is unit-testable in
// jest-node without a React renderer.
//
// Token-never-in-logs (P2 plan, Standards Compliance): nothing in this module
// passes a session/token object to Sentry or analytics — only AuthError
// code/message flow into telemetry.
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import { mapSupabaseError } from '@/lib/supabaseErrors';

export type ConfirmFailureReason = 'same-device' | 'invalid';

export type ConfirmExchangeResult =
  | { ok: true }
  | { ok: false; reason: ConfirmFailureReason };

/**
 * Distinguish the PKCE same-device failure from a generic expired/invalid
 * link ([verify-pass fold]): the code verifier lives only in the initiating
 * device's AsyncStorage. auth-js 2.110.7 surfaces the missing-verifier case
 * as `AuthPKCECodeVerifierMissingError` (code `pkce_code_verifier_not_found`,
 * message "...initiated in a different browser or device, or if the storage
 * was cleared..."); GoTrue rejects a mismatched verifier with
 * `bad_code_verifier`. Both mean "wrong device/install", NOT "expired link",
 * and must render the distinct same-device copy in confirm.tsx.
 */
export function classifyConfirmError(err: unknown): ConfirmFailureReason {
  if (err === null || err === undefined) return 'invalid';
  const code = (err as { code?: string }).code;
  if (code === 'pkce_code_verifier_not_found' || code === 'bad_code_verifier') {
    return 'same-device';
  }
  const message = (err as { message?: string }).message ?? '';
  if (/code verifier/i.test(message)) return 'same-device';
  return 'invalid';
}

/**
 * Complete the email-confirmation session from the deep link's PKCE code.
 * On success the session is established and `onAuthStateChange` fires — the
 * AuthGate's existing 5-branch routing takes over unchanged (no AuthGate
 * changes, per the plan's confirm.tsx row).
 */
export async function exchangeConfirmationCode(
  code: string,
): Promise<ConfirmExchangeResult> {
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const reason = classifyConfirmError(err);
    // AuthError only (code/message/status) — never the session/token object.
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { layer: 'auth', op: 'exchangeCodeForSession' },
      extra: { context: `email-confirm exchange failed (${reason})` },
    });
    return { ok: false, reason };
  }
}

export interface ConfirmDeepLink {
  /** The PKCE code, or null when the link arrived without one (treated as invalid downstream). */
  code: string | null;
}

/**
 * Pure URL matcher for the confirmation deep link. Matches any
 * `<scheme>://auth/confirm` URL (scheme-agnostic so the P2-F5 rename wave
 * cannot silently break the catch) and extracts the `code` query param.
 * Returns null for every non-confirmation URL (push-notification links,
 * OAuth redirects, etc. must not be swallowed).
 */
export function parseConfirmDeepLink(url: string): ConfirmDeepLink | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/auth\/confirm(?:[/?#]|$)/i.exec(url);
  if (!match) return null;
  const codeMatch = /[?&]code=([^&#]+)/.exec(url);
  return { code: codeMatch ? decodeURIComponent(codeMatch[1]) : null };
}

export interface ResendResult {
  ok: boolean;
  /** User-facing copy for the sign-up "check your email" state. */
  message: string;
}

/**
 * "Resend confirmation email" action for the sign-up post-submit state
 * ([verify-pass fold]: mitigates mail-provider security scanners prefetching
 * and consuming the one-time PKCE code before the user's real tap).
 */
export async function resendSignupConfirmation(email: string): Promise<ResendResult> {
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    return { ok: true, message: 'Confirmation email sent — check your inbox.' };
  } catch (err) {
    // Code/message only — never a session/token object (none exists here).
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { layer: 'auth', op: 'resendSignupConfirmation' },
    });
    return { ok: false, message: mapSupabaseError((err as { code?: string }).code) };
  }
}
