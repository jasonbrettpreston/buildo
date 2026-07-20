'use client';

// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.3, §3.6, §4, §4a
//            .cursor/phase1_plan.md Item 1 + Item 2 (LoginForm.tsx row)
//
// Email/password: posts to the Server Actions in `src/lib/supabase/
// actions.ts` (`signInAction`/`signUpAction`/`mfaChallengeAction`/
// `mfaVerifyAction`), which run server-side against the httpOnly-
// cookieOptions server client — the credentials themselves never produce a
// client-writable cookie at any point.
// Google: calls `signInWithOAuth` directly from the BROWSER client
// (`src/lib/supabase/browser.ts`) — a client-side redirect only, writes no
// session cookie itself (the callback route's server-side exchange does,
// `src/app/auth/callback/route.ts`).
//
// Admin TOTP step-up (WF3 2026-07-20 fix): `signInAction` only ever reaches
// aal1 (GoTrue does not block the password grant for MFA-enrolled accounts).
// Before this fix, LoginForm called `onSuccess?.()` unconditionally the
// moment the password check passed — an admin's session silently stayed at
// aal1 forever, every subsequent `/api/admin/*` call 401'd
// (`verify-admin.ts`'s aal2 gate), and NOTHING in the UI ever told the
// operator a code was needed, which read as the sign-in button hanging.
// When `signInAction` reports `mfaRequired`, this component now opens a
// TOTP challenge (`mfaChallengeAction` + `mfaVerifyAction`) instead of
// finishing sign-in. Per Spec 13 §4a, backup codes in this codebase are a
// PER-REQUEST header bypass consumed inside individual `/api/admin/*` calls
// (`verify-admin.ts`, `x-admin-backup-code`) — there is no GoTrue primitive
// to mint an aal2 session from a backup code, so a login-time backup-code
// *session* fallback isn't a real Spec 13 path; a lost-authenticator admin
// is pointed at that recovery mechanism instead of a fabricated code field.
import { useState } from 'react';
import { signInAction, signUpAction, mfaChallengeAction, mfaVerifyAction } from '@/lib/supabase/actions';
import { createClient } from '@/lib/supabase/browser';
import type { AccountType } from '@/lib/auth/types';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA step-up state. `mfaFactorId` non-null is what switches the form into
  // the code-entry view. `mfaChallengeId` is re-fetched on every attempt
  // (see `handleMfaSubmit`) rather than reused, so a stale/expired challenge
  // can never strand the operator on a code that will never verify.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result =
        mode === 'login'
          ? await signInAction(email, password)
          : await signUpAction(email, password, name, accountType);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.mfaRequired && result.factorId) {
        setMfaFactorId(result.factorId);
        return;
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setMfaError('');
    setMfaLoading(true);

    try {
      // Fresh challenge per attempt (see state comment above) — a wrong code
      // must not also risk failing on an expired challenge.
      const challenge = await mfaChallengeAction(mfaFactorId);
      if (challenge.error || !challenge.challengeId) {
        setMfaError(challenge.error ?? 'Could not start a verification challenge');
        return;
      }
      const result = await mfaVerifyAction(mfaFactorId, challenge.challengeId, mfaCode);
      if (result.error) {
        setMfaError(result.error);
        setMfaCode('');
        return;
      }
      onSuccess?.();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setMfaLoading(false);
    }
  }

  function cancelMfa() {
    setMfaFactorId(null);
    setMfaCode('');
    setMfaError('');
  }

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) throw oauthError;
      // signInWithOAuth navigates the browser away to Google — no
      // onSuccess() call here; the callback route drives the post-auth
      // redirect once the code exchange completes.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  if (mfaFactorId) {
    return (
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            Verification code
          </h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter the 6-digit code from your authenticator app.
          </p>

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">
                Code
              </label>
              <input
                id="mfa-code"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {mfaError && <p className="text-sm text-red-600">{mfaError}</p>}

            <button
              type="submit"
              disabled={mfaLoading || mfaCode.length !== 6}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {mfaLoading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancelMfa}
              disabled={mfaLoading}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Back to sign in
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-4">
            Lost your authenticator? Ask another admin for a backup-code recovery, or use the
            break-glass admin path — backup codes are not entered here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 text-center mb-6">
          {mode === 'login' ? 'Sign In to MaxBLD' : 'Create Account'}
        </h2>

        {/* Google Sign In */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">Or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  I am a...
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="individual">Individual Tradesperson</option>
                  <option value="company">Construction Company</option>
                  <option value="supplier">Material Supplier</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setMode('signup')}
                className="text-blue-600 hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-blue-600 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
