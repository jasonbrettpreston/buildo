// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 11 (drop-off recovery)
//             docs/specs/03-mobile/95_mobile_user_profiles.md §6 (trade_slug immutability)
//             docs/specs/03-mobile/93_mobile_auth.md §5 Step 6 (AuthGate routing matrix)
//
// Pure function used by the AuthGate (mobile/app/_layout.tsx) to determine
// the correct onboarding screen to resume at when `profile.onboarding_complete`
// is false. Replaces the previous hardcoded `/(onboarding)/profession` route
// which would 400 TRADE_IMMUTABLE on resume for users who already set their
// trade in a prior session.
//
// Routing strategy (Spec 94 §10 Step 11):
//   1. PRIMARY: trust `currentStep` from the persisted onboardingStore
//      (MMKV-backed). Each onboarding screen calls setStep(...) after a
//      successful PATCH, so currentStep always names the FURTHEST step the
//      user has reached (or is about to enter).
//   2. FALLBACK: when currentStep is null or unrecognized (fresh install
//      with no MMKV state, or pre-migration data), derive the resume step
//      from the server profile fields. trade_slug is the most reliable
//      signal because Spec 95 §6 makes it immutable once set.
//
// Returns ONLY onboarding paths. The caller (AuthGate) decides between
// onboarding and /(app)/ based on `profile.onboarding_complete` BEFORE
// calling this function.

export type OnboardingStep =
  | 'profession'
  | 'path'
  | 'address'
  | 'supplier'
  | 'terms'
  | 'complete'
  | null;

export interface ResumeProfile {
  trade_slug: string | null;
  location_mode: string | null;
  tos_accepted_at: string | null;
  onboarding_complete: boolean;
}

// NOTE: 'complete' is INTENTIONALLY excluded from setStep calls in onboarding
// screens. The terminal store action is markComplete() (onboardingStore.ts:93),
// which sets `{ isComplete: true, currentStep: null }` atomically — there is
// no screen that calls setStep('complete'). This entry exists ONLY as a
// defensive no-op if a stale MMKV write or future regression somehow stores
// 'complete' as currentStep, so getResumePath returns a sensible navigable
// path instead of cascading to the fallback (which would route to /path,
// potentially looping a user who is genuinely at the end of onboarding).
// WF2 reviewer flagged the OnboardingStep union member as a future-bug trap
// (a developer might call setStep('complete') instead of markComplete() and
// produce a persistent /(onboarding)/complete loop). The defense is here;
// the convention is enforced by code review, NOT the type system.
const STEP_TO_SCREEN: Readonly<Record<NonNullable<OnboardingStep>, string>> = {
  profession: '/(onboarding)/profession',
  path: '/(onboarding)/path',
  address: '/(onboarding)/address',
  supplier: '/(onboarding)/supplier',
  terms: '/(onboarding)/terms',
  complete: '/(onboarding)/complete',
};

export function getResumePath(
  profile: ResumeProfile | null,
  currentStep: OnboardingStep | string | null,
): string {
  // PRIMARY: trust the persisted step when it's a known value.
  if (currentStep && currentStep in STEP_TO_SCREEN) {
    return STEP_TO_SCREEN[currentStep as NonNullable<OnboardingStep>];
  }

  // FALLBACK 1: profile not loaded yet → defensive default.
  if (!profile || !profile.trade_slug) {
    return '/(onboarding)/profession';
  }

  // FALLBACK 2: realtor flow skips the path-selection step.
  // Order: profession → address → terms (no path, no supplier).
  if (profile.trade_slug === 'realtor') {
    if (!profile.location_mode) return '/(onboarding)/address';
    if (!profile.tos_accepted_at) return '/(onboarding)/terms';
    return '/(onboarding)/complete';
  }

  // FALLBACK 3: non-realtor with trade set but no client-side step record
  // (MMKV cleared / fresh install). Resume at the path-selection screen;
  // the user re-picks their path and proceeds. The previous trade selection
  // remains locked in (Spec 95 §6) — they don't re-enter trade.
  return '/(onboarding)/path';
}
