// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §5.3 (9 routing arms)
//             + §5.2 (stale-profile guard) + §9.6 (this extraction)
//             docs/specs/03-mobile/93_mobile_auth.md §5 Step 6 (AuthGate routing matrix)
//             docs/specs/03-mobile/94_mobile_onboarding.md §7 (manufacturer hold)
//
// Pure routing-decision function for AuthGate. Lifts the 9-arm routing matrix
// out of the AuthGate component's useEffect into a side-effect-free function
// so the matrix can be unit-tested per Spec 99 §8.2 mandate (every router
// branch MUST have a Jest test for its specific input combination).
//
// AuthGate's useEffect now calls this function and switches on the
// discriminated-union return to perform side effects (router.replace,
// setReactivationState, registerPushToken). Side effects that AREN'T routing
// decisions (e.g., the Sentry `stale_profile_missing_user_id` log on a
// corrupt profile) stay inside AuthGate.

// Imports MUST be from leaf modules ONLY — pure function = zero side-effect
// imports. `@/lib/errors` is the leaf re-export of the error classes (was
// `@/lib/apiClient` which transitively pulls in firebase + MMKV; see §9.6
// adversarial review Gemini F4 + DeepSeek #7).
import { AccountDeletedError, ApiError } from '@/lib/errors';
import { getResumePath } from '@/lib/onboarding/getResumePath';
import type { UserProfileType } from '@/lib/userProfile.schema';
import type { OnboardingStep } from '@/lib/onboarding/getResumePath';

/** Inputs collected from AuthGate's hooks at the moment routing is evaluated. */
export interface AuthGateInput {
  isNavigationReady: boolean;
  hasHydrated: boolean;
  user: { uid: string; email: string | null; displayName: string | null } | null;
  profile: UserProfileType | undefined;
  profileError: Error | null | undefined;
  profileLoading: boolean;
  segments: readonly string[];
  /** Lazy-read at call time (Spec 99 §6.4). */
  currentStep: OnboardingStep;
}

/** Discriminated-union routing decision. AuthGate handles each kind. */
export type AuthGateDecision =
  /** No-op for this evaluation (waiting on hydration / loading / generic). */
  | { kind: 'wait' }
  /**
   * Stale-profile wait: cached `profile.user_id` does not match live `user.uid`
   * (UID change in flight) OR `profile.user_id` is falsy (corrupted cache).
   * AuthGate MUST render an opaque loading guard until the new fetch resolves
   * — otherwise the previous user's UI stays visible for several frames
   * (PIPEDA visual leak per WF3 M1+M2+M3 #12 / DeepSeek finding).
   */
  | { kind: 'wait-stale-profile' }
  /** Imperative navigation. `sideEffect` is invoked after `router.replace(to)`. */
  | { kind: 'navigate'; to: string; sideEffect?: 'registerPushToken' }
  /** Show the reactivation modal (account in 30-day deletion window per Spec 93 §3.6). */
  | { kind: 'reactivation-modal'; account_deleted_at: string; days_remaining: number };

/**
 * Pure routing decision per Spec 99 §5.3 routing matrix. Returns ONE of the
 * three decision kinds; AuthGate's useEffect performs the corresponding side
 * effect. Calling this twice with identical input MUST produce identical
 * output (idempotent).
 */
export function decideAuthGateRoute(input: AuthGateInput): AuthGateDecision {
  // Wait until Expo Router and the auth store have finished initial setup.
  if (!input.isNavigationReady) return { kind: 'wait' };
  if (!input.hasHydrated) return { kind: 'wait' };

  const inAuthGroup = input.segments[0] === '(auth)';
  const inOnboardingGroup = input.segments[0] === '(onboarding)';

  // Branch 1: unauthenticated.
  if (!input.user) {
    if (inAuthGroup) return { kind: 'wait' };
    return { kind: 'navigate', to: '/(auth)/sign-in' };
  }

  // Branch 2: account in deletion window (caller surfaces the reactivation modal).
  if (input.profileError instanceof AccountDeletedError) {
    return {
      kind: 'reactivation-modal',
      account_deleted_at: input.profileError.account_deleted_at,
      days_remaining: input.profileError.days_remaining,
    };
  }

  // Branch 3: 404 → no profile row → start onboarding at profession.
  if (input.profileError instanceof ApiError && input.profileError.status === 404) {
    if (inOnboardingGroup) return { kind: 'wait' };
    return { kind: 'navigate', to: '/(onboarding)/profession' };
  }

  // Branch 4: other server error — caller renders retry UI; do not navigate.
  if (input.profileError) return { kind: 'wait' };

  // Still loading and no cached data — wait for the query to resolve.
  if (input.profileLoading && !input.profile) return { kind: 'wait' };

  // Spec 99 §5.2 stale-profile guard: when UID changes, TanStack returns the
  // PREVIOUS user's profile.data until the new fetch resolves. Routing on it
  // would evaluate Branch 5 against the OLD user's onboarding_complete /
  // account_preset. Skip until profile.user_id matches the live Firebase uid.
  //
  // Falsy `user_id` is also treated as `wait` (security: Gemini WF2 §9.6 F1
  // + DeepSeek #2 consensus). A corrupted/poisoned cache attesting to
  // completion would otherwise bypass the guard entirely — User-A's empty-uid
  // profile would route User-B based on User-A's onboarding_complete. AuthGate
  // emits a Sentry message in the corrupt-profile case (caller-side side
  // effect) so the cache corruption is observable without routing on it.
  if (input.profile && (!input.profile.user_id || input.profile.user_id !== input.user.uid)) {
    // WF3 M1+M2+M3 #12 (DeepSeek): distinguish stale-profile wait from
    // generic wait so AuthGate can render an opaque loading guard (the
    // previous user's UI would otherwise stay visible until the new
    // fetch resolves — PIPEDA visual leak).
    return { kind: 'wait-stale-profile' };
  }

  if (input.profile) {
    // Branch 4.5: manufacturer hold (Spec 94 §7). Manufacturers wait for
    // admin enablement; they do NOT see the standard onboarding flow.
    if (input.profile.account_preset === 'manufacturer' && !input.profile.onboarding_complete) {
      if (inOnboardingGroup && input.segments[1] === 'manufacturer-hold') return { kind: 'wait' };
      return { kind: 'navigate', to: '/(onboarding)/manufacturer-hold' };
    }
    if (inAuthGroup) {
      // Branch 5a: in (auth) but onboarding incomplete → resume at furthest step.
      if (!input.profile.onboarding_complete) {
        return { kind: 'navigate', to: getResumePath(input.profile, input.currentStep) };
      }
      // Branch 5b: in (auth) and onboarding complete → main app + push token registration.
      return { kind: 'navigate', to: '/(app)/', sideEffect: 'registerPushToken' };
    }
    // Branch 5c: in (onboarding) and onboarding complete → main app.
    if (inOnboardingGroup && input.profile.onboarding_complete) {
      return { kind: 'navigate', to: '/(app)/' };
    }
    // Branch 5d: in (onboarding) BUT onboarding incomplete OR in any other
    // group (e.g. (app) deep-link) with !complete → resume at the furthest
    // step. Pre-amend, this branch only fired for `!inAuth && !inOnboarding`,
    // leaving `(inOnboarding && !complete && non-manufacturer)` to fall
    // through to a silent `wait` — a deep-link-into-onboarding-without-
    // currentStep wedge (code-reviewer WF2 §9.6 H1 + Gemini F2 consensus).
    // The `!inAuthGroup` is dead-code hygiene: control already returned
    // above for inAuthGroup, but the predicate is kept for legibility.
    if (!inAuthGroup && !input.profile.onboarding_complete) {
      return { kind: 'navigate', to: getResumePath(input.profile, input.currentStep) };
    }
  }

  // Default: no routing change required.
  return { kind: 'wait' };
}
