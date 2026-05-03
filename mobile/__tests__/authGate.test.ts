/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §5.3 (9 routing arms)
//             + §5.2 (stale-profile guard) + §8.2 (branch test mandate) + §9.6
//             docs/specs/03-mobile/93_mobile_auth.md §5 Step 6 (AuthGate matrix)
//
// Pure-function tests for decideAuthGateRoute — the lifted routing decision
// extracted from AuthGate's useEffect in WF2 §9.6. Per Spec 99 §8.2:
// "Each branch in §5.3 (5 + 4.5 manufacturer = 6 branches with 4 sub-cases =
// 9 distinct arms) MUST have a Jest test verifying its specific (segments +
// profile + error) input combination produces the correct routing decision."
//
// Plus: the §9.11 stale-profile guard test that was deferred from WF2-A.

// decideAuthGateRoute imports apiClient (for AccountDeletedError + ApiError)
// which transitively pulls in @react-native-firebase/auth + react-native-mmkv
// native modules. Mock the shims to keep the import graph resolvable in
// Node Jest (the actual functionality is unused — only the error class
// constructors are exercised).
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(() => false),
    clearAll: jest.fn(),
  }),
}));
jest.mock('@/lib/firebase', () => ({
  auth: jest.fn(() => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signOut: jest.fn(() => Promise.resolve()),
  })),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signOut: jest.fn(() => Promise.resolve()),
  })),
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));
jest.mock('@/lib/migrations/userProfileCacheCleanup', () => ({
  cleanupLegacyUserProfileCache: jest.fn(),
}));
jest.mock('@/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn(() => Promise.resolve()),
    clear: jest.fn(),
  },
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  identifyUser: jest.fn(),
  resetIdentity: jest.fn(),
}));

import {
  decideAuthGateRoute,
  type AuthGateInput,
  type AuthGateDecision,
} from '@/lib/auth/decideAuthGateRoute';
import { AccountDeletedError, ApiError } from '@/lib/apiClient';
import type { UserProfileType } from '@/lib/userProfile.schema';

const UID_A = 'user-A-firebase-uid';
const UID_B = 'user-B-firebase-uid';

const mkUser = (uid: string = UID_A) => ({
  uid,
  email: 'tradesperson@buildo.app',
  displayName: 'Tradesperson',
});

const mkProfile = (overrides: Partial<UserProfileType> = {}): UserProfileType => ({
  user_id: UID_A,
  trade_slug: 'framing',
  display_name: 'Tradesperson',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-03T00:00:00Z',
  full_name: 'Test User',
  phone_number: null,
  company_name: null,
  email: null,
  backup_email: null,
  default_tab: 'feed',
  location_mode: 'home_base_fixed',
  home_base_lat: 43.6532,
  home_base_lng: -79.3832,
  radius_km: 10,
  supplier_selection: null,
  lead_views_count: 0,
  subscription_status: 'trial',
  trial_started_at: '2026-05-01T00:00:00Z',
  stripe_customer_id: null,
  onboarding_complete: true,
  tos_accepted_at: '2026-05-01T00:00:00Z',
  account_deleted_at: null,
  account_preset: 'tradesperson',
  trade_slugs_override: null,
  radius_cap_km: null,
  notification_prefs: null,
  ...overrides,
});

const baseInput: AuthGateInput = {
  isNavigationReady: true,
  hasHydrated: true,
  user: null,
  profile: undefined,
  profileError: null,
  profileLoading: false,
  segments: [],
  currentStep: null,
};

describe('decideAuthGateRoute — pre-conditions', () => {
  it('returns wait when navigation not ready', () => {
    const out = decideAuthGateRoute({ ...baseInput, isNavigationReady: false });
    expect(out).toEqual({ kind: 'wait' });
  });

  it('returns wait when auth store not hydrated', () => {
    const out = decideAuthGateRoute({ ...baseInput, hasHydrated: false });
    expect(out).toEqual({ kind: 'wait' });
  });
});

describe('decideAuthGateRoute — Branch 1 (unauthenticated)', () => {
  it('navigates to /(auth)/sign-in when !user and not in (auth) group', () => {
    const out = decideAuthGateRoute({ ...baseInput, segments: ['(app)'], user: null });
    expect(out).toEqual({ kind: 'navigate', to: '/(auth)/sign-in' });
  });

  it('waits when !user and ALREADY in (auth) group (no double-replace)', () => {
    const out = decideAuthGateRoute({ ...baseInput, segments: ['(auth)', 'sign-in'], user: null });
    expect(out).toEqual({ kind: 'wait' });
  });
});

describe('decideAuthGateRoute — Branch 2 (AccountDeletedError)', () => {
  it('returns reactivation-modal with deletion data', () => {
    const err = new AccountDeletedError('2026-04-15T00:00:00Z', 14);
    const out = decideAuthGateRoute({ ...baseInput, user: mkUser(), profileError: err });
    expect(out).toEqual({
      kind: 'reactivation-modal',
      account_deleted_at: '2026-04-15T00:00:00Z',
      days_remaining: 14,
    });
  });
});

describe('decideAuthGateRoute — Branch 3 (404 ApiError)', () => {
  it('navigates to /(onboarding)/profession on 404 when not in (onboarding)', () => {
    const err = new ApiError(404, 'Not Found');
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profileError: err,
      segments: ['(app)'],
    });
    expect(out).toEqual({ kind: 'navigate', to: '/(onboarding)/profession' });
  });

  it('waits on 404 when ALREADY in (onboarding) (no double-replace)', () => {
    const err = new ApiError(404, 'Not Found');
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profileError: err,
      segments: ['(onboarding)', 'profession'],
    });
    expect(out).toEqual({ kind: 'wait' });
  });
});

describe('decideAuthGateRoute — Branch 4 (other profileError)', () => {
  it('waits on a generic ApiError (retry UI rendered separately)', () => {
    const err = new ApiError(500, 'Internal Server Error');
    const out = decideAuthGateRoute({ ...baseInput, user: mkUser(), profileError: err });
    expect(out).toEqual({ kind: 'wait' });
  });

  it('waits on a network error', () => {
    const err = new Error('Network request failed');
    const out = decideAuthGateRoute({ ...baseInput, user: mkUser(), profileError: err });
    expect(out).toEqual({ kind: 'wait' });
  });
});

describe('decideAuthGateRoute — loading + stale-profile guard', () => {
  it('waits when query is loading and no cached profile', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profileLoading: true,
      profile: undefined,
    });
    expect(out).toEqual({ kind: 'wait' });
  });

  // §9.11 stale-profile guard (deferred from WF2-A)
  it('§9.11 waits when profile.user_id !== user.uid (UID change in flight)', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(UID_B), // logged in as UserB
      profile: mkProfile({ user_id: UID_A }), // but cache still holds UserA's profile
      segments: ['(app)'],
    });
    expect(out).toEqual({ kind: 'wait' });
  });

  it('§9.11 ROUTES when profile.user_id has falsy value (corrupt) — does NOT wedge', () => {
    // The pure function treats falsy user_id as "trust comparison failed"
    // and proceeds. The Sentry log fires inside AuthGate (not here).
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(UID_A),
      profile: mkProfile({ user_id: '', onboarding_complete: true }),
      segments: ['(auth)', 'sign-in'],
    });
    // With falsy user_id passed through: it's a complete profile in (auth).
    // Branch 5b should fire.
    expect(out).toEqual({ kind: 'navigate', to: '/(app)/', sideEffect: 'registerPushToken' });
  });
});

describe('decideAuthGateRoute — Branch 4.5 (manufacturer hold)', () => {
  it('navigates a manufacturer with !complete to /(onboarding)/manufacturer-hold', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ account_preset: 'manufacturer', onboarding_complete: false }),
      segments: ['(app)'],
    });
    expect(out).toEqual({ kind: 'navigate', to: '/(onboarding)/manufacturer-hold' });
  });

  it('waits when manufacturer + !complete is ALREADY at /(onboarding)/manufacturer-hold', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ account_preset: 'manufacturer', onboarding_complete: false }),
      segments: ['(onboarding)', 'manufacturer-hold'],
    });
    expect(out).toEqual({ kind: 'wait' });
  });

  it('manufacturer with complete=true falls through to standard /(app)/ routing', () => {
    // Already-completed manufacturers don't get the hold screen.
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ account_preset: 'manufacturer', onboarding_complete: true }),
      segments: ['(auth)', 'sign-in'],
    });
    expect(out).toEqual({ kind: 'navigate', to: '/(app)/', sideEffect: 'registerPushToken' });
  });
});

describe('decideAuthGateRoute — Branch 5 (profile loaded)', () => {
  // Branch 5a
  it('5a: navigates via getResumePath when in (auth) and !complete', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: false, trade_slug: 'framing' }),
      segments: ['(auth)', 'sign-in'],
      currentStep: 'path',
    }) as Extract<AuthGateDecision, { kind: 'navigate' }>;
    expect(out.kind).toBe('navigate');
    expect(out.to).toBe('/(onboarding)/path');
    expect(out.sideEffect).toBeUndefined();
  });

  // Branch 5b
  it('5b: navigates to /(app)/ + registerPushToken when in (auth) and complete', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: true }),
      segments: ['(auth)', 'sign-in'],
    });
    expect(out).toEqual({ kind: 'navigate', to: '/(app)/', sideEffect: 'registerPushToken' });
  });

  // Branch 5c
  it('5c: navigates to /(app)/ when in (onboarding) and complete', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: true }),
      segments: ['(onboarding)', 'complete'],
    });
    expect(out).toEqual({ kind: 'navigate', to: '/(app)/' });
  });

  // Branch 5d
  it('5d: navigates via getResumePath when !inAuth && !inOnboarding && !complete', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: false, trade_slug: 'framing' }),
      segments: ['(app)'],
      currentStep: 'supplier',
    }) as Extract<AuthGateDecision, { kind: 'navigate' }>;
    expect(out.kind).toBe('navigate');
    expect(out.to).toBe('/(onboarding)/supplier');
  });
});

describe('decideAuthGateRoute — idempotency (Spec 99 §8.1)', () => {
  it('returns identical decision for identical input on consecutive calls', () => {
    const input: AuthGateInput = {
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: true }),
      segments: ['(onboarding)', 'complete'],
    };
    const a = decideAuthGateRoute(input);
    const b = decideAuthGateRoute(input);
    expect(a).toEqual(b);
  });
});
