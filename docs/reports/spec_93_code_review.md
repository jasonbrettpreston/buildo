# Code Review Report: Spec 93 (Mobile Authentication)

**Target Spec:** `docs/specs/03-mobile/93_mobile_auth.md`
**Review Date:** April 29, 2026
**Status:** 🟡 **Partial Pass (High Quality, Pending Cross-Spec Integrations)**

## 1. Executive Summary

The implementation of Spec 93 across the `mobile/` directory is of exceptionally high quality. The UI layout, Firebase Auth SDK abstraction, secure storage implementation, and complex state management (like the account linking flow and phone OTP bottom sheets) adhere strictly to the engineering standards and the spec's behavioral contracts. 

However, because Spec 93 sits at the intersection of Onboarding (Spec 95) and Subscriptions (Spec 96), there are two critical **stubbed/TODO implementations** in the `AuthGate` and `authStore` that must be completed before this feature can be considered fully compliant.

---

## 2. Component Compliance Breakdown

### ✅ 2.1 Firebase & Persistence (`src/lib/firebase.ts`)
*   **Spec Requirement:** Use `expo-secure-store` wrapper for Firebase persistence instead of `AsyncStorage` (to avoid plain text token storage).
*   **Implementation:** **Pass.** The `ExpoSecureStoreAdapter` is correctly hand-implemented and wired into `getReactNativePersistence`. Error boundaries and Sentry telemetry (`Sentry.captureException`) are perfectly integrated for persistence failures. Environment variables are strictly guarded.

### ✅ 2.2 Sign-In Screen (`app/(auth)/sign-in.tsx`)
*   **Spec Requirement:** 4-button stack (Apple, Google, Phone, Email) with Apple conditional on iOS. Handle `auth/account-exists-with-different-credential` with a linking sheet.
*   **Implementation:** **Pass.** Flawless execution. The Apple button uses the strict HIG-compliant `WHITE` style. The `isAccountLinkingError` is caught, and the `AccountLinkingSheet` is triggered properly. The `linkPendingCredential` effect securely ensures credentials are only merged for the expected email. Haptics and `isAuthenticating` mutexes are correctly implemented.

### ✅ 2.3 Sign-Up Screen (`app/(auth)/sign-up.tsx`)
*   **Spec Requirement:** Email/Password form and a Phone form that progresses through Input → OTP → Backup Email.
*   **Implementation:** **Pass.** The phone bottom sheet transitions between `phoneStage` states cleanly. The backup email is captured, validated for `@`, and closes the sheet to allow AuthGate to proceed. Resend cooldowns (30s) are fully enforced.

### 🟡 2.4 User Session Store (`src/store/authStore.ts`)
*   **Spec Requirement:** `signOut` must clear Firebase, clear peer Zustand stores (`filterStore`, `userProfileStore`, `paywallStore`), but explicitly **not** clear MMKV local state.
*   **Implementation:** **Partial Pass.** The store correctly clears `useFilterStore`, `useNotificationStore`, `useOnboardingStore`, and `useUserProfileStore`. It also correctly preserves MMKV data. 
*   **Missing (TODO):** The store fails to clear the `paywallStore`. There is an explicit `// TODO Spec 96: usePaywallStore.getState().clear()` comment. Until this is fixed, a user who dismisses the paywall and signs out on a shared device will leak the `dismissed: true` state to the next user, bypassing the paywall blur.

### 🟡 2.5 AuthGate Routing (`app/_layout.tsx`)
*   **Spec Requirement:** AuthGate must fetch `/api/user-profile` and branch based on 5 outcomes (200+complete, 200+incomplete, 404, 403 deleted, network error).
*   **Implementation:** **Partial Pass.** The 5-branch routing matrix is logically structured in the `useEffect`, but the actual server fetch is entirely stubbed. 
*   **Missing (TODO):** The code uses a local MMKV gate (`useOnboardingStore((s) => s.isComplete)`) instead of the required `GET /api/user-profile` fetch. There is a `// TODO Spec 95: replace with server response...` comment. As a result, the 30-day Account Deletion reactivation flow (403 status) and new-user 404 flows cannot trigger.

### 🟢 2.6 Observability & Telemetry (Sentry + PostHog)
*   **Spec Requirement:** Telemetry per Spec 90 §11 (PostHog funnel events and distinct IDs) and Sentry exception tracking.
*   **Implementation:** **Pass.** 
    *   **PostHog:** The `audit_spec93_2026-04-29.md` report incorrectly stated that PostHog was not wired. A deep dive confirms that **PostHog is fully and correctly wired**. `sign-in.tsx` and `sign-up.tsx` fire funnel events (`auth_screen_viewed`, `auth_method_attempted`, `auth_method_succeeded`, `auth_method_failed` with explicit error codes, and `auth_account_link_completed`). `authStore.ts` correctly manages the session identity, calling `identifyUser(firebaseUser.uid)` exclusively on success, and calling `resetIdentity()` upon sign-out to ensure anonymous boundaries.
    *   **Sentry:** `_layout.tsx` calls `Sentry.init()` properly gated behind the DSN env var. `firebase.ts` tags SecureStore errors with `{ layer: 'auth-persistence' }`, and `sign-in.tsx` captures non-fatal `linkWithCredential` failures.

---

## 3. Action Items & Remediation

To achieve 100% compliance with Spec 93, the following tasks must be completed (likely in tandem with Specs 95 and 96):

1.  **Replace AuthGate Stub (Spec 95 Dependency):**
    *   In `mobile/app/_layout.tsx`, replace the `useOnboardingStore` local check with a React Query fetch to `GET /api/user-profile`.
    *   Implement the 403 `account_deleted_at` Reactivation Modal UI within the AuthGate.
    *   Implement the full-screen network failure retry UI.
2.  **Clear Paywall Store (Spec 96 Dependency):**
    *   In `mobile/src/store/authStore.ts`, uncomment or implement `usePaywallStore.getState().clear()` inside the `signOut()` function to prevent session leakage.

## 4. Conclusion
The current code represents an excellent, highly secure, and polished foundation. The deviations from the spec are explicitly marked with `TODO` comments indicating that the developer was aware of the missing Spec 95/96 dependencies. No structural rewrites are necessary; only the final API integration and state clear wiring.
