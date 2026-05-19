# Code Review Report: Spec 94 (Mobile Onboarding)

**Target Spec:** `docs/specs/03-mobile/94_mobile_onboarding.md`
**Review Date:** April 29, 2026
**Status:** 🟢 **Pass (Exemplary Implementation)**

## 1. Executive Summary

The implementation of Spec 94 across the `mobile/app/(onboarding)` route group and associated store/API logic is outstanding. It is one of the most compliant implementations of a spec in the codebase to date. 

The flow correctly handles all three onboarding paths (Leads, Tracking, Realtor) with their divergent required screens. The complex state management (advancing local MMKV step state *only* after a successful `PATCH` request) is perfectly executed, eliminating the risk of client/server synchronization drift.

---

## 2. Component Compliance Breakdown

### ✅ 2.1 State Management & Drop-off Recovery (`src/store/onboardingStore.ts`)
*   **Spec Requirement:** Drop-off recovery via MMKV. The `onboarding_step` must only advance after the server confirms the PATCH. 
*   **Implementation:** **Pass.** The Zustand store uses `persist` with `createMMKV`. The screen components (`address.tsx`, `profession.tsx`, etc.) carefully await `fetchWithAuth('/api/user-profile', { method: 'PATCH' })` before calling `setStep()`, ensuring perfect synchronization.

### ✅ 2.2 Profession & Path Selection (`profession.tsx`, `path.tsx`)
*   **Spec Requirement:** `SectionList` with sticky headers. Trade lock confirmation via bottom sheet. React to idempotency from the server. Path selection skips "Continue" CTA.
*   **Implementation:** **Pass.** The `SectionList` is styled perfectly per the design system. The `@gorhom/bottom-sheet` implementation flawlessly handles the trade-lock warning. The error boundary explicitly traps `err.status === 400` with the `already` keyword to handle PATCH idempotency safely.

### ✅ 2.3 Toronto Bounds & Location (`address.tsx`)
*   **Spec Requirement:** Enforce Toronto bounds (`lat 43.58–43.86, lng -79.64 to -79.12`). Snap to 500m grid. Explicitly write `location_mode`.
*   **Implementation:** **Pass.** `expo-location` `geocodeAsync` is properly guarded against returning an empty array. The `isInsideToronto` bounds checking and `snapToGrid` fallback logic are correctly integrated. The `location_mode` is strictly passed in every coordinate PATCH payload.

### ✅ 2.4 Supplier Selection & API (`supplier.tsx`, `api/onboarding/suppliers/route.ts`)
*   **Spec Requirement:** Use `FlatList numColumns={2}`. Fetch via `GET /api/onboarding/suppliers?trade={slug}`. Auto-skip if the array is empty.
*   **Implementation:** **Pass.** The API route is securely wrapped in `withApiEnvelope` and returns the expected `{ data: { suppliers: string[] } }` array. The frontend uses TanStack Query (`useQuery`), avoiding anti-pattern `useEffects` for data fetching. The auto-skip logic correctly handles the `suppliers.length === 0` edge case, taking the user directly to the terms screen.

### ✅ 2.5 Terms & Completion (`terms.tsx`, `complete.tsx`, `first-permit.tsx`)
*   **Spec Requirement:** Custom checkboxes. Path T skips completion animation. Path L animates with a staggered 4-element Reanimated sequence.
*   **Implementation:** **Pass.** The `first-permit.tsx` screen is properly stubbed waiting for Spec 77. The terms screen enforces a strict dual-checkbox gate. The completion screen flawlessly implements `withDelay` and `withTiming` across 4 shared values (`sv0` through `sv3`) to recreate the staggered reveal.

---

## 3. Findings & Next Steps

There are **zero architectural flaws or compliance gaps** in the current code for Spec 94. 

The only remaining "TODOs" in the code are intentionally deferred, cross-spec dependencies that the developer explicitly documented inline:
1.  **AuthGate Rehydration:** The routing check in `_layout.tsx` relies on the MMKV `isComplete` flag because the `GET /api/user-profile` fetch is deferred to Spec 95. (This mirrors the same gap found in Spec 93).
2.  **Permit Search:** The "Search Now" button on the Tracking Path's `first-permit.tsx` screen is a stub, waiting for Spec 77 (`SearchPermitsSheet`) to be completed.

No further action is required on the onboarding module itself. It is ready for Spec 95 and Spec 77 integration.
