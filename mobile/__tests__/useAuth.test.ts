/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Testing Gates
//
// Auth state machine tests (Supabase SDK swap, Spec 93 rewrite):
//  - onAuthStateChange with a session → store hydrated, isLoading=false
//  - onAuthStateChange(null session) → store cleared (forced sign-out path)
//  - signOut() → supabase.auth.signOut + store resets (filter, notification)
//  - email_exists → linking detected (was account-exists-with-different-credential)
//  - error-code mapping for the surface-level user messages
//  - Apple nonce round-trip (raw → Supabase, SHA-256 → Apple SDK), value-verified
//  - Google: NO nonce on either half (P2-F3.1 verification — free Original
//    API has no nonce support; a raw nonce sent to GoTrue against a
//    nonce-claim-less token would be rejected)
//  - phone OTP string-ref contract (signInWithOtp → verifyOtp, no
//    confirmation handle — P2-G6)
//
// Mock surface targets `@/lib/supabase`'s named `supabase` export. Do NOT
// mock `@react-native-firebase/auth` — it is no longer in package.json.

const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));
const mockUnsubscribe = jest.fn();
let authStateHandler:
  | ((event: string, session: Record<string, unknown> | null) => void)
  | null = null;
const mockOnAuthStateChange = jest.fn(
  (handler: (event: string, session: Record<string, unknown> | null) => void) => {
    authStateHandler = handler;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  },
);
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockLinkIdentity = jest.fn();
const mockRefreshSession = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockResend = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
      signUp: (...a: unknown[]) => mockSignUp(...a),
      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a),
      signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      linkIdentity: (...a: unknown[]) => mockLinkIdentity(...a),
      signOut: () => mockSignOut(),
      onAuthStateChange: (
        handler: (event: string, session: Record<string, unknown> | null) => void,
      ) => mockOnAuthStateChange(handler),
      refreshSession: (...a: unknown[]) => mockRefreshSession(...a),
      exchangeCodeForSession: (...a: unknown[]) => mockExchangeCodeForSession(...a),
      resend: (...a: unknown[]) => mockResend(...a),
    },
  },
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));
// expo-crypto is a native module unavailable in jest-node; mock with Node's
// crypto so prepareAppleNonce executes a REAL SHA-256 (same mock contract as
// appleAuth.test.ts — getRandomBytes returns Uint8Array, digestStringAsync
// returns lowercase hex).
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    getRandomBytes: (size: number) => new Uint8Array(nodeCrypto.randomBytes(size)),
    digestStringAsync: async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
  };
});
// Spec 99 §9.1 removed clearUserProfileCache; mock the cleanup migration
// helper that authStore imports at module load. Inline jest.fn (NOT a
// closure-captured const) because the cleanup is invoked at module load
// — Jest hoists imports above const declarations, so a closure reference
// would dereference undefined at the moment authStore's import fires.
jest.mock('@/lib/migrations/userProfileCacheCleanup', () => ({
  cleanupLegacyUserProfileCache: jest.fn(),
}));
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockClearQueries = jest.fn();
jest.mock('@/lib/queryClient', () => ({
  // The mock needs to satisfy TanStack's invalidateQueries return type
  // (Promise<void>). Internally we just record the filters arg for assertion.
  queryClient: {
    invalidateQueries: (filters: unknown): Promise<void> => {
      mockInvalidateQueries(filters);
      return Promise.resolve();
    },
    removeQueries: (filters: unknown): void => {
      mockRemoveQueries(filters);
    },
    clear: (): void => {
      mockClearQueries();
    },
  },
}));
const mockTrack = jest.fn();
const mockIdentifyUser = jest.fn();
const mockResetIdentity = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  identifyUser: (...args: unknown[]) => mockIdentifyUser(...args),
  resetIdentity: (...args: unknown[]) => mockResetIdentity(...args),
}));
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));
const mockPersisterRemoveClient = jest.fn();
jest.mock('@/lib/mmkvPersister', () => ({
  mmkvPersister: {
    persistClient: jest.fn(),
    restoreClient: jest.fn(() => undefined),
    removeClient: () => mockPersisterRemoveClient(),
  },
  getLastPersistedAt: jest.fn(() => null),
}));

import { useAuthStore, initSupabaseAuthListener, __resetLastKnownUidForTests } from '@/store/authStore';
import { useFilterStore } from '@/store/filterStore';
import { useNotificationStore } from '@/store/notificationStore';
import { mapSupabaseError, isAccountLinkingError } from '@/lib/supabaseErrors';
import { prepareAppleNonce } from '@/lib/appleAuth';
import * as Crypto from 'expo-crypto';

/** Supabase session factory — `access_token` arrives synchronously with the
 *  user in the SAME onAuthStateChange callback (the structural change that
 *  eliminated the old Firebase getIdToken() race — see the Regression
 *  Guardian note in authStore.ts). */
function makeSession(
  uid: string,
  email: string | null,
  accessToken: string,
  fullName?: string,
): Record<string, unknown> {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    user: {
      id: uid,
      email,
      user_metadata: fullName ? { full_name: fullName } : {},
    },
  };
}

describe('authStore.signOut', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockTrack.mockClear();
    mockResetIdentity.mockClear();
    mockIdentifyUser.mockClear();
    useAuthStore.setState({ user: { uid: 'u1', email: 'a@b.com', displayName: null }, accessToken: 'tok', isLoading: false });
    useFilterStore.setState({ tradeSlug: 'plumbing', radiusKm: 25, homeBaseLocation: { lat: 43, lng: -79 } });
    useNotificationStore.setState({ unreadFlightBoard: 5 });
  });

  it('calls supabase.auth.signOut()', async () => {
    await useAuthStore.getState().signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('resets filterStore to initial defaults', async () => {
    await useAuthStore.getState().signOut();
    const state = useFilterStore.getState();
    expect(state.tradeSlug).toBe('');
    expect(state.radiusKm).toBe(10);
    expect(state.homeBaseLocation).toBeNull();
  });

  it('resets notificationStore unread counter', async () => {
    await useAuthStore.getState().signOut();
    expect(useNotificationStore.getState().unreadFlightBoard).toBe(0);
  });

  it('clears the auth user and accessToken in-memory', async () => {
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  // Spec 99 §9.1 + adversarial review consensus (DeepSeek F6 + code-reviewer
  // MED + Gemini F5): assert the legacy MMKV cleanup migration ran exactly
  // once at authStore module load. Without this assertion, accidentally
  // removing the call from authStore.ts would silently regress the PIPEDA
  // cleanup of the orphaned legacy `user-profile-cache` blob.
  it('cleanupLegacyUserProfileCache ran at authStore module load', () => {
    // The mock factory at the top of this file replaced the export with
    // `jest.fn()`. Reading it back here returns the same mock instance.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cleanupLegacyUserProfileCache } = require('@/lib/migrations/userProfileCacheCleanup');
    expect(cleanupLegacyUserProfileCache).toHaveBeenCalledTimes(1);
  });

  // Spec 99 §B5 + §9.10: signOut MUST purge the ['user-profile'] cache so the
  // next sign-in (possibly a different user on a shared device) cannot read
  // the previous user's profile. The MMKV-persisted TanStack cache otherwise
  // rehydrates on next mount with stale data — PIPEDA leak.
  it('clears all TanStack Query cache after supabase signOut and BEFORE Zustand resets', async () => {
    mockSignOut.mockClear();
    mockClearQueries.mockClear();
    // Spy on filterStore.reset so we can assert ordering against it
    // (code-reviewer WF2-Phase-A review HIGH: the cache purge MUST fire before
    // peer-store resets; otherwise an in-flight fetch resolving during the
    // reset window could write previous-user data to cache after the purge.)
    const filterResetSpy = jest.spyOn(useFilterStore.getState(), 'reset');
    await useAuthStore.getState().signOut();
    expect(mockClearQueries).toHaveBeenCalledTimes(1);
    const signOutOrder = mockSignOut.mock.invocationCallOrder[0];
    const clearOrder = mockClearQueries.mock.invocationCallOrder.at(-1) ?? -1;
    const filterResetOrder = filterResetSpy.mock.invocationCallOrder.at(-1) ?? -1;
    // AFTER supabase signOut: prevents the listener's null-fire from racing.
    expect(clearOrder).toBeGreaterThan(signOutOrder);
    // BEFORE Zustand resets: prevents in-flight fetches from rewriting cache
    // during the reset window (Spec 99 §B5).
    expect(clearOrder).toBeLessThan(filterResetOrder);
    filterResetSpy.mockRestore();
  });

  it('emits signout_initiated telemetry before supabase signOut', async () => {
    await useAuthStore.getState().signOut();
    expect(mockTrack).toHaveBeenCalledWith('signout_initiated');
    // signout_initiated must precede the SDK call so the event is attributed
    // to the outgoing user, not the post-signout anonymous distinctId.
    const trackCallOrder = mockTrack.mock.invocationCallOrder[0];
    const signOutCallOrder = mockSignOut.mock.invocationCallOrder[0];
    expect(trackCallOrder).toBeLessThan(signOutCallOrder);
  });

  it('calls resetIdentity() after supabase signOut completes', async () => {
    await useAuthStore.getState().signOut();
    expect(mockResetIdentity).toHaveBeenCalledTimes(1);
    // resetIdentity must run AFTER the SDK signOut so the distinctId reset
    // happens at a clean session boundary.
    const signOutCallOrder = mockSignOut.mock.invocationCallOrder[0];
    const resetIdentityCallOrder = mockResetIdentity.mock.invocationCallOrder[0];
    expect(resetIdentityCallOrder).toBeGreaterThan(signOutCallOrder);
  });

  it('runs the full cleanup even when supabase.auth.signOut rejects (try/finally fence)', async () => {
    // WF2 P2 review #11 (DeepSeek), preserved across the SDK swap: an SDK
    // failure must NOT skip the PIPEDA-critical cleanup.
    mockSignOut.mockRejectedValueOnce(new Error('GoTrue unreachable'));
    mockClearQueries.mockClear();
    await useAuthStore.getState().signOut();
    expect(mockClearQueries).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('clears Sentry.setUser(null) inside clearLocalSessionState (Spec 99 §7.5 + §B5 PIPEDA)', async () => {
    const Sentry = jest.requireMock('@sentry/react-native') as {
      setUser: jest.Mock;
    };
    Sentry.setUser.mockClear();
    await useAuthStore.getState().signOut();
    // Sentry.setUser(null) MUST fire on the signout fan-out so subsequent
    // crash reports are not attributed to the previous user.
    expect(Sentry.setUser).toHaveBeenCalled();
    // Last call MUST be null — anything after a transient setUser({id})
    // would re-attribute, defeating the PIPEDA boundary. The current
    // signOut path doesn't write a non-null setUser, but defensively
    // assert the LAST call is null.
    const lastCall = Sentry.setUser.mock.calls[Sentry.setUser.mock.calls.length - 1];
    expect(lastCall).toEqual([null]);
  });
});

describe('initSupabaseAuthListener', () => {
  beforeEach(() => {
    mockOnAuthStateChange.mockClear();
    mockUnsubscribe.mockClear();
    mockIdentifyUser.mockClear();
    authStateHandler = null;
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    // Reset the module-scoped `lastKnownUid` so a previous test's user-fire
    // does NOT leak into the next test and silently flip a cold-boot null
    // fire into the forced-signout cleanup branch (code-reviewer Phase 3
    // HIGH — see also `cold-boot null-fire (lastKnownUid===null)` test
    // below which proves the guarded branch fires when uncontaminated).
    __resetLastKnownUidForTests();
  });

  it('subscribes to onAuthStateChange exactly once and returns a working unsubscribe', () => {
    const unsubscribe = initSupabaseAuthListener();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cold-boot null-fire (lastKnownUid===null) runs full cleanup but skips forced_signout telemetry (WF3 M1+M2+M3 #5)', () => {
    // WF3 M1+M2+M3 #5 (Gemini): cleanup is UNCONDITIONAL on null fires to
    // close the crash-recovery gap (stale persisted blob after a hard JS
    // crash). Telemetry stays gated — PostHog must NOT see forced_signout
    // on every unauthenticated cold boot. Behavior preserved byte-for-byte
    // across the Supabase swap.
    mockPersisterRemoveClient.mockClear();
    mockClearQueries.mockClear();
    mockTrack.mockClear();
    mockResetIdentity.mockClear();
    initSupabaseAuthListener();
    // No prior session-fire → `lastKnownUid` is still null (just reset by beforeEach).
    authStateHandler?.('INITIAL_SESSION', null);
    // Cleanup DID run (unconditional for crash-recovery).
    expect(mockPersisterRemoveClient).toHaveBeenCalled();
    expect(mockClearQueries).toHaveBeenCalled();
    expect(mockResetIdentity).toHaveBeenCalled();
    // Telemetry is STILL gated — must NOT fire forced_signout on cold-boot
    // first-fire (PostHog noise control).
    expect(mockTrack).not.toHaveBeenCalledWith('forced_signout');
    // Auth fields zeroed (clearLocalSessionState calls setState({user:null,...})).
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('clears the store when onAuthStateChange fires a null session (forced sign-out)', () => {
    initSupabaseAuthListener();
    useAuthStore.setState({ user: { uid: 'x', email: null, displayName: null }, accessToken: 'tok', isLoading: false });
    authStateHandler?.('SIGNED_OUT', null);
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('forced-signout (null fire AFTER a session-fire) runs the FULL cleanup — persister blob removed + telemetry fired (WF3 forced-signout unification)', () => {
    // PROMOTED CRITICAL fix preserved across the SDK swap: the listener's
    // null branch runs the same `clearLocalSessionState()` as explicit
    // signOut() WHEN lastKnownUid !== null (a real authenticated user was
    // seen, not the cold-boot first-fire).
    mockClearQueries.mockClear();
    mockPersisterRemoveClient.mockClear();
    mockTrack.mockClear();
    mockResetIdentity.mockClear();
    initSupabaseAuthListener();
    // Step 1: fire the listener with a session so the listener's own
    // bookkeeping sets `lastKnownUid` to a non-null value.
    authStateHandler?.('SIGNED_IN', makeSession('forced-signout-victim', 'a@b.com', 'tok'));
    // Reset mock counters AFTER the session-fire (which itself calls some
    // of these mocks via the hydration path) so we only assert on calls
    // that came from the null-fire cleanup.
    mockClearQueries.mockClear();
    mockPersisterRemoveClient.mockClear();
    mockTrack.mockClear();
    mockResetIdentity.mockClear();

    // Step 2: Supabase fires a null session — forced sign-out path.
    authStateHandler?.('SIGNED_OUT', null);

    // Auth zeroed (proves clearLocalSessionState ran past its setState).
    const auth = useAuthStore.getState();
    expect(auth.user).toBeNull();
    expect(auth.accessToken).toBeNull();
    // TanStack persister blob removed from disk (the bug this fix closed).
    expect(mockPersisterRemoveClient).toHaveBeenCalled();
    // queryClient.clear() called (peer-store cleanup proxy — every
    // store-reset call before this one ran in source order).
    expect(mockClearQueries).toHaveBeenCalled();
    // Telemetry: distinguishes forced from user-initiated signouts.
    expect(mockTrack).toHaveBeenCalledWith('forced_signout');
    // PostHog identity reset (last step of the helper — proves the
    // helper ran to completion, not a partial execution).
    expect(mockResetIdentity).toHaveBeenCalled();
  });

  it('hydrates the store SYNCHRONOUSLY when a session arrives (access_token in the same callback)', () => {
    // Structural change vs Firebase: no separate async getIdToken() step —
    // the token is on the session object in the same fire. The old
    // stale-resolution race guard is gone because the race is impossible
    // (see Regression Guardian note in authStore.ts).
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('abc123', 'tradesperson@buildo.app', 'access-xyz', 'Tradesperson'));
    const state = useAuthStore.getState();
    expect(state.user?.uid).toBe('abc123');
    expect(state.user?.email).toBe('tradesperson@buildo.app');
    expect(state.user?.displayName).toBe('Tradesperson');
    expect(state.accessToken).toBe('access-xyz');
    expect(state.isLoading).toBe(false);
  });

  it('displayName is null for email/phone sign-ups (no user_metadata.full_name)', () => {
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('no-name-uid', 'x@y.com', 'tok'));
    expect(useAuthStore.getState().user?.displayName).toBeNull();
  });

  it('calls identifyUser(uid) after the listener hydrates the store', () => {
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('11111111-2222-3333-4444-555555555555', 'a@b.com', 'tok'));
    expect(mockIdentifyUser).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
    // identifyUser must NOT be passed email or displayName (PII strip rule).
    expect(mockIdentifyUser).toHaveBeenCalledTimes(1);
    const args = mockIdentifyUser.mock.calls[0];
    expect(args).toEqual(['11111111-2222-3333-4444-555555555555']);
  });

  it('calls Sentry.setUser({id: uid}) with ONLY the Supabase uuid (Spec 99 §7.5)', () => {
    const Sentry = jest.requireMock('@sentry/react-native') as {
      setUser: jest.Mock;
    };
    Sentry.setUser.mockClear();
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('11111111-2222-3333-4444-555555555555', 'a@b.com', 'tok', 'Display Name'));
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: '11111111-2222-3333-4444-555555555555' });
    // PIPEDA: ONLY the opaque uuid — no email, no displayName, no IP. The
    // Sentry User type accepts {id, email, username, ip_address}; we send
    // {id} only. Anything else would leak PII into crash reports.
    const args = Sentry.setUser.mock.calls[0];
    expect(args).toEqual([{ id: '11111111-2222-3333-4444-555555555555' }]);
    expect(args[0]).not.toHaveProperty('email');
    expect(args[0]).not.toHaveProperty('username');
    expect(args[0]).not.toHaveProperty('ip_address');
  });

  // -----------------------------------------------------------------
  // UID-change cache invalidation. The lastKnownUid module-scoped guard
  // invalidates ['user-profile'] when the Supabase uuid differs from the
  // previously-seen value (also catches cold-boot first-fire when the
  // guard starts null). Same-uid re-fires (token refresh) MUST NOT
  // trigger cache wipe — Spec 93 §3.4 mandates fast-hydration for
  // returning users on the same device. Preserved as-is across the SDK
  // swap, re-keyed off session.user.id.
  // -----------------------------------------------------------------

  it('invalidates user-profile query on first listener fire (cold boot)', () => {
    mockInvalidateQueries.mockClear();
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('cold-boot-uid', 'a@b.com', 'tok'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['user-profile'] });
  });

  it('does NOT re-invalidate when same uid fires again (token refresh)', () => {
    mockInvalidateQueries.mockClear();
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('token-refresh-uid', 'a@b.com', 'tok-1'));
    // Second fire with the SAME uid — simulates the TOKEN_REFRESHED event.
    authStateHandler?.('TOKEN_REFRESHED', makeSession('token-refresh-uid', 'a@b.com', 'tok-2'));
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    // The refreshed access token still lands in the store.
    expect(useAuthStore.getState().accessToken).toBe('tok-2');
  });

  it('invalidates on UID change (shared-device handoff)', () => {
    mockInvalidateQueries.mockClear();
    initSupabaseAuthListener();
    authStateHandler?.('SIGNED_IN', makeSession('shared-device-user-A', 'a@b.com', 'tokA'));
    authStateHandler?.('SIGNED_IN', makeSession('shared-device-user-B', 'c@d.com', 'tokB'));
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
    // setAuth ran BEFORE the invalidation for user B — the refetch will use
    // the NEW bearer (Gemini WF3-§9.1 F7 ordering fence, preserved).
    expect(useAuthStore.getState().accessToken).toBe('tokB');
    expect(useAuthStore.getState().user?.uid).toBe('shared-device-user-B');
  });
});

describe('mapSupabaseError', () => {
  it('returns user-facing message for invalid credentials', () => {
    expect(mapSupabaseError('invalid_credentials')).toBe('Incorrect email or password.');
  });

  it('returns rate-limit message for all three GoTrue rate-limit codes', () => {
    expect(mapSupabaseError('over_request_rate_limit')).toBe('Too many attempts. Try again in a few minutes.');
    expect(mapSupabaseError('over_sms_send_rate_limit')).toBe('Too many attempts. Try again in a few minutes.');
    expect(mapSupabaseError('over_email_send_rate_limit')).toBe('Too many attempts. Try again in a few minutes.');
  });

  it('returns expired-code message for otp_expired (phone confirmation timeout)', () => {
    // The mapping must NOT fall through to the generic copy — users need to
    // know to request a new code.
    expect(mapSupabaseError('otp_expired')).toBe('That code has expired. Request a new one.');
    expect(mapSupabaseError('otp_expired')).not.toBe('Sign-in failed. Please try again.');
  });

  it('returns already-registered message for email_exists', () => {
    expect(mapSupabaseError('email_exists')).toBe('That email is already registered.');
  });

  it('returns generic message for unknown codes', () => {
    expect(mapSupabaseError('some_unknown_code')).toBe('Sign-in failed. Please try again.');
    expect(mapSupabaseError(undefined)).toBe('Sign-in failed. Please try again.');
  });
});

describe('isAccountLinkingError', () => {
  it('detects email_exists (replaces auth/account-exists-with-different-credential)', () => {
    expect(isAccountLinkingError('email_exists')).toBe(true);
  });

  it('rejects unrelated codes', () => {
    expect(isAccountLinkingError('invalid_credentials')).toBe(false);
    expect(isAccountLinkingError('auth/account-exists-with-different-credential')).toBe(false);
    expect(isAccountLinkingError(undefined)).toBe(false);
  });
});

// Spec 93 §5 Testing Gates — Supabase phone-auth contract (P2-G6).
// `signInWithOtp({ phone })` returns NO confirmation handle; the phone
// number itself is the session key and `verifyOtp({ phone, token, type })`
// completes it. The production entry points are gated OFF by
// PHONE_AUTH_ENABLED (D15/P2-D1 — see phoneGate.coverage.test.ts), so the
// underlying SDK contract is asserted directly here per the plan's Item 6
// instruction ("test the underlying logic directly ... not by simulating a
// button tap that no longer renders").
describe('phone-auth flow (Spec 93 §5, string-ref contract)', () => {
  beforeEach(() => {
    mockSignInWithOtp.mockReset();
    mockVerifyOtp.mockReset();
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    authStateHandler = null;
    __resetLastKnownUidForTests();
  });

  it('signInWithOtp takes the phone number and returns no confirmation handle', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    const result = await (
      jest.requireMock('@/lib/supabase') as {
        supabase: { auth: { signInWithOtp: (a: unknown) => Promise<{ data: unknown; error: null }> } };
      }
    ).supabase.auth.signInWithOtp({ phone: '+14165551234' });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+14165551234' });
    // P2-G6: unlike Firebase's ConfirmationResult, nothing here owns the SMS
    // session — the caller must hold the phone number itself (string ref).
    expect(result).not.toHaveProperty('confirm');
  });

  it('verifyOtp({ phone, token, type: "sms" }) resolves a session that hydrates the store via the listener', () => {
    const session = makeSession('phone-uid-2', null, 'phone-token-2');
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: session.user, session }, error: null });
    initSupabaseAuthListener();
    // Production: GoTrue fires onAuthStateChange with the new session after
    // a successful verifyOtp. The listener path is what hydrates the store.
    authStateHandler?.('SIGNED_IN', session);
    const state = useAuthStore.getState();
    expect(state.user?.uid).toBe('phone-uid-2');
    expect(state.accessToken).toBe('phone-token-2');
    expect(state.isLoading).toBe(false);
  });
});

describe('nonce contracts (Spec 93 §2.3 + P2-F3.1 verification)', () => {
  beforeEach(() => {
    mockSignInWithIdToken.mockReset();
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { id: 'u', email: 'a@b.com' }, session: makeSession('u', 'a@b.com', 't') },
      error: null,
    });
  });

  it('Apple: Supabase receives the RAW nonce; Apple receives the SHA-256 hash — value-verified round trip', async () => {
    // Mirrors the pre-swap Apple test's rigor: the SAME pair from
    // prepareAppleNonce must split raw→Supabase / hash→Apple, and the hash
    // must actually be SHA-256(rawNonce) (recomputed here), not just "some
    // nonce reached both calls".
    const { rawNonce, hashedNonce } = await prepareAppleNonce();
    const recomputed = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    expect(hashedNonce).toBe(recomputed);
    expect(hashedNonce).not.toBe(rawNonce);

    // The exchange call sends the RAW half to Supabase (GoTrue recomputes
    // the hash server-side and compares to the token's nonce claim).
    const supabaseMock = (
      jest.requireMock('@/lib/supabase') as {
        supabase: { auth: { signInWithIdToken: (a: unknown) => Promise<unknown> } };
      }
    ).supabase.auth;
    await supabaseMock.signInWithIdToken({
      provider: 'apple',
      token: 'apple-identity-token',
      nonce: rawNonce,
    });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-identity-token',
      nonce: rawNonce,
    });
    const sent = mockSignInWithIdToken.mock.calls[0][0] as { nonce: string };
    expect(sent.nonce).toBe(rawNonce);
    expect(sent.nonce).not.toBe(hashedNonce);
  });

  it('Google: NO nonce on either half — free Original API has no nonce support (P2-F3.1)', async () => {
    // DEVIATION LOCK (P2-F3.1 verification, 2026-07-19): custom nonce is a
    // PAID "Universal" feature of @react-native-google-signin; the pinned
    // FREE line (13.3.1) exposes `SignInParams = { loginHint?: string }`
    // only. The Google ID token therefore carries no nonce claim — passing
    // a nonce to signInWithIdToken would make GoTrue reject the token as a
    // claim mismatch. This test locks the "no nonce" shape so a future
    // half-wired nonce (raw nonce sent to GoTrue against a nonce-less
    // token) fails loudly. Supersedes the plan's Google nonce round-trip
    // test, whose premise failed live verification.
    const supabaseMock = (
      jest.requireMock('@/lib/supabase') as {
        supabase: { auth: { signInWithIdToken: (a: unknown) => Promise<unknown> } };
      }
    ).supabase.auth;
    await supabaseMock.signInWithIdToken({
      provider: 'google',
      token: 'google-native-id-token',
    });
    const sent = mockSignInWithIdToken.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.provider).toBe('google');
    expect(sent.token).toBe('google-native-id-token');
    expect(sent).not.toHaveProperty('nonce');
  });

  it('sign-in.tsx wires Apple WITH nonce and Google WITHOUT (source lock)', () => {
    // Static source-scan (repo pattern: storeReset.coverage.test.ts) pinning
    // the call-site shapes inside the screen, which has no RTL harness.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(auth)/sign-in.tsx'),
      'utf-8',
    );
    // Apple: fresh pair per attempt, hash to Apple, raw to Supabase.
    expect(src).toMatch(/prepareAppleNonce\(\)/);
    expect(src).toMatch(/nonce:\s*hashedNonce/);
    expect(src).toMatch(/provider:\s*'apple',\s*\n\s*token:\s*identityToken,\s*\n\s*nonce:\s*rawNonce/);
    // Google: exactly one signInWithIdToken with provider 'google', and its
    // credential object must NOT carry a nonce key.
    const googleCall = /signInWithIdToken\(\{\s*\n\s*provider:\s*'google',\s*\n\s*token:\s*googleIdToken,\s*\n\s*\}\)/;
    expect(src).toMatch(googleCall);
    // No `GoogleSignin.signIn({ nonce` anywhere — the free API has no such param.
    expect(src).not.toMatch(/GoogleSignin\.signIn\(\{[^)]*nonce/);
  });
});
