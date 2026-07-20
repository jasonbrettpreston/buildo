/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Step 5 (P2-D4 amendment —
//             email confirmations ON + deep-link catch)
//
// Unit tests for the email-confirmation deep-link catch (P2-D4, operator
// ruling 2026-07-19): the PKCE code exchange with BOTH distinct error states
// ([verify-pass fold] expired/invalid vs PKCE same-device), the resend
// affordance, the pure URL parser the root-layout catcher uses, and a
// source-scan locking sign-up.tsx's "check your email" state wiring.

const mockExchangeCodeForSession = jest.fn();
const mockResend = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
      resend: (...a: unknown[]) => mockResend(...a),
    },
  },
}));
const mockCaptureException = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));

import {
  exchangeConfirmationCode,
  classifyConfirmError,
  parseConfirmDeepLink,
  resendSignupConfirmation,
} from '@/lib/confirmEmail';

beforeEach(() => {
  mockExchangeCodeForSession.mockReset();
  mockResend.mockReset();
  mockCaptureException.mockClear();
});

describe('exchangeConfirmationCode — deep-link catch (P2-D4)', () => {
  it('resolves ok:true when the exchange succeeds (session established, AuthGate takes over)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: {
        session: { access_token: 'tok', user: { id: 'u1' } },
        user: { id: 'u1' },
      },
      error: null,
    });
    const result = await exchangeConfirmationCode('one-time-code');
    expect(result).toEqual({ ok: true });
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('expired/invalid link → reason "invalid" (generic back-to-sign-in copy)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: Object.assign(new Error('Email link is invalid or has expired'), {
        name: 'AuthApiError',
        code: 'otp_expired',
        status: 403,
      }),
    });
    const result = await exchangeConfirmationCode('stale-code');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('PKCE same-device case → reason "same-device" (verifier missing: different device/install or cleared storage)', async () => {
    // auth-js 2.110.7's AuthPKCECodeVerifierMissingError shape (verified
    // against the installed SDK): code `pkce_code_verifier_not_found`.
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: Object.assign(
        new Error(
          'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.',
        ),
        { name: 'AuthPKCECodeVerifierMissingError', code: 'pkce_code_verifier_not_found', status: 400 },
      ),
    });
    const result = await exchangeConfirmationCode('foreign-device-code');
    expect(result).toEqual({ ok: false, reason: 'same-device' });
  });

  it('failure telemetry carries the AuthError only — no session/token material (token-never-in-logs)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: Object.assign(new Error('boom'), { code: 'otp_expired' }),
    });
    await exchangeConfirmationCode('c');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [captured, hint] = mockCaptureException.mock.calls[0] as [
      Error,
      { extra?: Record<string, unknown> } | undefined,
    ];
    expect(captured).toBeInstanceOf(Error);
    expect(hint?.extra ?? {}).not.toHaveProperty('session');
    expect(JSON.stringify(hint ?? {})).not.toContain('access_token');
  });
});

describe('classifyConfirmError — [verify-pass fold] two distinct error states', () => {
  it('pkce_code_verifier_not_found → same-device', () => {
    expect(classifyConfirmError({ code: 'pkce_code_verifier_not_found' })).toBe('same-device');
  });
  it('bad_code_verifier (GoTrue mismatch) → same-device', () => {
    expect(classifyConfirmError({ code: 'bad_code_verifier' })).toBe('same-device');
  });
  it('message mentioning "code verifier" without a code → same-device (defensive)', () => {
    expect(classifyConfirmError(new Error('both auth code and code verifier should be non-empty'))).toBe('same-device');
  });
  it('anything else → invalid (expired/consumed/malformed link)', () => {
    expect(classifyConfirmError({ code: 'otp_expired' })).toBe('invalid');
    expect(classifyConfirmError(new Error('flow_state_not_found'))).toBe('invalid');
    expect(classifyConfirmError(undefined)).toBe('invalid');
  });
});

describe('parseConfirmDeepLink — root-layout catcher URL matcher (P2-F3.4)', () => {
  it('matches the confirmation URL and extracts the PKCE code', () => {
    expect(parseConfirmDeepLink('maxbld://auth/confirm?code=abc-123')).toEqual({ code: 'abc-123' });
  });

  it('is scheme-agnostic so the P2-F5 rename cannot silently break the catch', () => {
    expect(parseConfirmDeepLink('com.buildo://auth/confirm?code=x')).toEqual({ code: 'x' });
    expect(parseConfirmDeepLink('buildo://auth/confirm?code=x')).toEqual({ code: 'x' });
  });

  it('URL-decodes the code param', () => {
    expect(parseConfirmDeepLink('maxbld://auth/confirm?code=a%2Bb')).toEqual({ code: 'a+b' });
  });

  it('returns code:null when the link arrives without a code (prefetch-stripped/malformed)', () => {
    expect(parseConfirmDeepLink('maxbld://auth/confirm')).toEqual({ code: null });
    expect(parseConfirmDeepLink('maxbld://auth/confirm?error_code=otp_expired')).toEqual({ code: null });
  });

  it('malformed percent-encoding degrades to code:null instead of throwing (P2 output-panel MED — attacker-controllable URL must never crash the Linking listener)', () => {
    expect(parseConfirmDeepLink('maxbld://auth/confirm?code=%E0%A4%A')).toEqual({ code: null });
    expect(parseConfirmDeepLink('maxbld://auth/confirm?code=%')).toEqual({ code: null });
    expect(parseConfirmDeepLink('maxbld://auth/confirm?code=%ZZ')).toEqual({ code: null });
  });

  it('returns null for every non-confirmation URL (push deep links, OAuth redirects must not be swallowed)', () => {
    expect(parseConfirmDeepLink('maxbld://')).toBeNull();
    expect(parseConfirmDeepLink('maxbld://auth/confirmation?code=x')).toBeNull();
    expect(parseConfirmDeepLink('maxbld://lead?id=24-101234--01')).toBeNull();
    // Verified HTTPS App Links are the tracked POST-launch hardening item
    // (plan Item 3) — the current catch is custom-scheme only by design.
    expect(parseConfirmDeepLink('https://buildo.app/auth/confirm?code=x')).toBeNull();
    expect(parseConfirmDeepLink('not a url')).toBeNull();
  });
});

describe('resendSignupConfirmation — [verify-pass fold] resend affordance', () => {
  it('calls supabase.auth.resend({ type: "signup", email }) and reports success', async () => {
    mockResend.mockResolvedValueOnce({ data: {}, error: null });
    const result = await resendSignupConfirmation('new-user@example.com');
    expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'new-user@example.com' });
    expect(result.ok).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('maps a rate-limit failure through mapSupabaseError copy', async () => {
    mockResend.mockResolvedValueOnce({
      data: {},
      error: Object.assign(new Error('rate limit'), { code: 'over_email_send_rate_limit' }),
    });
    const result = await resendSignupConfirmation('new-user@example.com');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Too many attempts. Try again in a few minutes.');
  });
});

describe('sign-up.tsx confirmations-ON wiring (source lock — P2-D4)', () => {
  // Static source-scan (repo pattern: storeReset.coverage.test.ts) — the
  // screen has no RTL harness; these lock the P2-D4 contract shapes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../app/(auth)/sign-up.tsx'), 'utf-8');

  it('signUp() is called with emailRedirectTo maxbld://auth/confirm (post-rename scheme, day one)', () => {
    expect(src).toMatch(/emailRedirectTo:\s*EMAIL_CONFIRM_REDIRECT/);
    expect(src).toMatch(/EMAIL_CONFIRM_REDIRECT\s*=\s*'maxbld:\/\/auth\/confirm'/);
  });

  it('renders the "check your email" state when signUp resolves with session: null (UX HIGH — no stranding)', () => {
    expect(src).toMatch(/if\s*\(!data\.session\)\s*\{[\s\S]*?setAwaitingConfirmation\(true\)/);
    expect(src).toMatch(/testID="signup-check-email"/);
  });

  it('wires the resend affordance through resendSignupConfirmation', () => {
    expect(src).toMatch(/resendSignupConfirmation\(email\)/);
    expect(src).toMatch(/testID="signup-resend"/);
  });
});
