# Deferred WF3: Auth-state reset placement leaks data on forced sign-out
**Status:** Deferred — awaiting pickup
**Workflow:** WF3 — Fix
**Domain Mode:** Admin (mobile/ Expo source)
**Filed:** 2026-05-15
**Rollback Anchor:** 4605a6e0f7032d06a20c09cd82f58426c1cd3a91
**Source:** docs/reports/review_followups.md → "WF2 Spec 93 RNFirebase migration — Round 2 review" → WF3 candidates table

## Bug
`mobile/src/store/authStore.ts` — per the original Round-2 review finding, `signOut()` held all peer-store resets (`usePaywallStore`, `useFilterStore`, `useNotificationStore`, `useOnboardingStore`, `useUserProfileStore`, `clearUserProfileCache()`, `resetIdentity()`). Per Spec 93 §3.1 ("Forced sign-out (Firebase-initiated)"), forced sign-outs from password change on another device, admin disable in Firebase console, or project-wide token revocation fire `auth().onAuthStateChanged(null)` directly — bypassing `signOut()` entirely. The listener's null branch was originally only calling `clearAuth()` in the null branch; peer stores remained populated. On a shared device, the next user signing in would see the previous user's filter/notification/profile state until server hydration completed — a real data leak. **Note:** State Verification is the critical first step — the current `authStore.ts` already contains a `clearLocalSessionState()` function called from the null branch as of the current HEAD. Verify whether this specific bug still reproduces before proceeding with the fix.

## Reproduction Test
In `mobile/__tests__/useAuth.test.ts`, hydrate every peer store (filter, notification, onboarding, userProfile) with non-default values, call `initFirebaseAuthListener()`, then invoke the auth state handler with `null` to simulate a forced sign-out. Assert each peer store is at its initial defaults. If the current implementation already passes these assertions, mark this WF3 as RESOLVED at State Verification and close with a chore commit updating this file's status.

## Fix Sketch
- Move all peer-store resets and `resetIdentity()` from `signOut()` into the listener's `else` branch (the null-user path) behind a shared `clearLocalSessionState()` helper
- `signOut()` becomes a thin wrapper: emit `signout_initiated` telemetry, clear paywallStore (in-memory only — explicit pre-call protects same-session shared-device handoffs per Spec 96 §9), then `await auth().signOut()` — listener handles all downstream cleanup
- Single source of truth for null-user state

## WF3 Execution Checklist
- [ ] Rollback Anchor (this file's SHA above)
- [ ] State Verification: confirm the bug still reproduces against current main — **check whether `clearLocalSessionState()` already runs from the listener's null branch before writing any code**
- [ ] Spec Review: re-read the cited spec sections (93 §3.1 forced sign-out, 96 §9 paywall reset note)
- [ ] Reproduction: write the failing test
- [ ] Red Light: run the test, confirm it fails
- [ ] Fix: apply the change per Fix Sketch
- [ ] Pre-Review Self-Checklist: 3-5 sibling bugs that could share the same root cause (e.g., `flightBoardSeenStore` missing from the cleanup; `queryClient.clear()` not called; Sentry user attribution not cleared on forced sign-out; `mmkvPersister.removeClient()` not called)
- [ ] Independent Review: one code-reviewer agent (isolation: worktree)
- [ ] Green Light: `cd mobile && npx jest && npx tsc --noEmit && npm run lint -- --fix`
- [ ] WF6 commit per Spec 05 §5 footer schema

## Cross-references
- Original migration commits: 77cbf18, 42fa9e0, 1bc42c2
- Round-2 review surface: docs/reports/review_followups.md
- Spec: 93_mobile_auth §3.1 forced sign-out + 96_mobile_subscription §9 paywall reset note
