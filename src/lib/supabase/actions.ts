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

export interface AuthActionResult {
  error: string | null;
}

export async function signInAction(email: string, password: string): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
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
