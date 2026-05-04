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

// Spec 99 §9.6 amendment (Gemini F4 + DeepSeek #7 consensus): the previous
// version of this file mocked 7 modules (mmkv, firebase x2, sentry, cleanup,
// queryClient, analytics) just to make the apiClient transitive import
// graph resolvable. The error classes were extracted to @/lib/errors (a
// leaf module with zero side-effect imports) — both the pure function and
// this test now import from the leaf, killing all 7 mocks.

import {
  decideAuthGateRoute,
  type AuthGateInput,
  type AuthGateDecision,
} from '@/lib/auth/decideAuthGateRoute';
import { AccountDeletedError, ApiError } from '@/lib/errors';
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
  // Spec 99 §9.14 — flat notification fields (post-flatten).
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
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

  it('§9.11 WAITS when profile.user_id is falsy (corrupt) — security guard', () => {
    // WF2 §9.6 amendment (Gemini F1 + DeepSeek #2 consensus): falsy user_id
    // is now treated as `wait`, NOT pass-through. A corrupted/poisoned cache
    // attesting to onboarding_complete=true would otherwise route the live
    // user (UID_A) based on the corrupt profile's claim — a trust-boundary
    // violation. AuthGate emits a Sentry message in the corrupt-profile case
    // (caller-side side effect, NOT exercised here) so the cache corruption
    // remains observable.
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(UID_A),
      profile: mkProfile({ user_id: '', onboarding_complete: true }),
      segments: ['(auth)', 'sign-in'],
    });
    expect(out).toEqual({ kind: 'wait' });
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

  // Branch 5d (in (app) deep-link)
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

  // Branch 5d (in (onboarding) but !complete + non-manufacturer)
  // WF2 §9.6 amendment (Gemini F2 + code-reviewer H1 consensus): pre-amend,
  // this case fell through to silent `wait` — a deep-link wedge. Now
  // routed to getResumePath so a deep-link to /(onboarding)/supplier
  // without the prerequisite trade selection bounces to the right step.
  it('5d-onboarding: navigates via getResumePath when in (onboarding) and !complete', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: false, trade_slug: 'framing' }),
      segments: ['(onboarding)', 'address'],
      currentStep: 'supplier',
    }) as Extract<AuthGateDecision, { kind: 'navigate' }>;
    expect(out.kind).toBe('navigate');
    expect(out.to).toBe('/(onboarding)/supplier');
  });

  // Branch 5d-onboarding: when currentStep matches the user's actual screen,
  // getResumePath returns the same path → router.replace becomes a no-op
  // in production. The pure function still emits a navigate decision (it
  // can't know whether segments and `to` match without parsing both).
  it('5d-onboarding: navigates to the same path when currentStep matches segments (no-op replace)', () => {
    const out = decideAuthGateRoute({
      ...baseInput,
      user: mkUser(),
      profile: mkProfile({ onboarding_complete: false, trade_slug: 'framing' }),
      segments: ['(onboarding)', 'address'],
      currentStep: 'address',
    }) as Extract<AuthGateDecision, { kind: 'navigate' }>;
    expect(out.kind).toBe('navigate');
    expect(out.to).toBe('/(onboarding)/address');
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
