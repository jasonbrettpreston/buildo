// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2.2 (D15 phone gating)
//
// Pure-constant leaf module (P2-D1) — no Zustand/Supabase/native imports, so
// any test or screen can read it without dragging the auth import graph in.
//
// D15 gates phone-OTP OFF at ALL THREE entry points [panel-fold: Ground
// truth + Integration, HIGH]:
//   (a) sign-in.tsx  — "Continue with Phone" button render
//   (b) sign-up.tsx  — the in-page `setMethod('phone')` Pressable render
//   (c) sign-up.tsx  — the `initialMethod` computation from `?method=phone`
//       (a stale deep link must never enter the phone flow even with the
//       buttons hidden — see `resolveSignUpMethod` below)
//
// The `signInWithOtp`/`verifyOtp` call sites, bottom-sheet UI,
// PhoneInputField/OtpInputField and the backup-email step all stay in the
// tree, fully wired — only these three entry points are hidden. Flipping to
// `true` re-enables the whole flow with zero code archaeology.
//
// CI override pattern for testing the gated code (documented per DeepSeek):
//   jest.mock('@/lib/featureFlags', () => ({
//     PHONE_AUTH_ENABLED: true,
//     resolveSignUpMethod: jest.requireActual('@/lib/featureFlags').resolveSignUpMethod,
//   }));
export const PHONE_AUTH_ENABLED: boolean = false;

export type SignUpMethod = 'email' | 'phone';

/**
 * Entry point (c): the sign-up screen's `initialMethod` computation.
 * A `?method=phone` deep link only lands in the phone flow when the flag is
 * ON — otherwise it degrades to email. Pure + parameterized on the flag so
 * both polarities are unit-testable without a module-mock dance.
 */
export function resolveSignUpMethod(
  methodParam: string | undefined,
  phoneAuthEnabled: boolean = PHONE_AUTH_ENABLED,
): SignUpMethod {
  return methodParam === 'phone' && phoneAuthEnabled ? 'phone' : 'email';
}
