# Deferred WF3: Backup-email persistence bridge missing
**Status:** Deferred — awaiting pickup
**Workflow:** WF3 — Fix
**Domain Mode:** Admin (mobile/ Expo source)
**Filed:** 2026-05-15
**Rollback Anchor:** 4605a6e0f7032d06a20c09cd82f58426c1cd3a91
**Source:** docs/reports/review_followups.md → "WF2 Spec 93 RNFirebase migration — Round 2 review" → WF3 candidates table

## Bug
`mobile/app/(auth)/sign-up.tsx:156-172` — `handleSubmitBackupEmail` validates that the email contains `@`, fires `track('signup_completed', { method: 'phone' })`, and closes the bottom sheet — but never writes the value to any Zustand store, route param, or API. The local `backupEmail` component state is lost when the sheet unmounts. Spec 93 §3.3 ("SMS users must provide a backup email address during onboarding") and Spec 94 §3.3 (recovery flow) are non-functional as a result. The TODO comment at lines 166-168 acknowledges the gap ("Onboarding reads this from a temporary store / route param") but the bridge was never built.

## Reproduction Test
In `mobile/__tests__/`, mount `<SignUpScreen>` (or extract the handler), set `phoneStage='backup-email'`, set `backupEmail='recovery@example.com'`, call `handleSubmitBackupEmail`, then assert the value is readable from the destination store (`useUserProfileStore.getState().backupEmail` or `useOnboardingStore.getState().backupEmail` depending on which one Spec 94 should consume). The assertion will fail until the bridge is built.

## Fix Sketch
- Decide the destination store (recommend `useOnboardingStore.backupEmail` since onboarding owns the immediately-following profile-write per Spec 94/95)
- Add the `backupEmail` field to that store (with corresponding TypeScript interface update + reset() coverage)
- In `handleSubmitBackupEmail`, write `useOnboardingStore.getState().setBackupEmail(backupEmail)` before `phoneSheetRef.current?.close()`
- Update Spec 94 onboarding mount to read `backupEmail` from the store and persist to `user_profiles` via the standard `PATCH /api/user-profile` flow
- Confirm the field is cleared in the store's `reset()` action (PIPEDA — it's PII)

## WF3 Execution Checklist
- [ ] Rollback Anchor (this file's SHA above)
- [ ] State Verification: confirm the bug still reproduces against current main
- [ ] Spec Review: re-read the cited spec sections (93 §3.3, 94 §3.3, 95 user-profiles API)
- [ ] Reproduction: write the failing test
- [ ] Red Light: run the test, confirm it fails
- [ ] Fix: apply the change per Fix Sketch
- [ ] Pre-Review Self-Checklist: 3-5 sibling bugs that could share the same root cause (e.g., other `phoneStage` state lost on sheet unmount; `confirmationRef` leak; onboarding store missing the field in its TypeScript interface; `reset()` not clearing `backupEmail`)
- [ ] Independent Review: one code-reviewer agent (isolation: worktree)
- [ ] Green Light: `cd mobile && npx jest && npx tsc --noEmit && npm run lint -- --fix`
- [ ] WF6 commit per Spec 05 §5 footer schema

## Cross-references
- Original migration commits: 77cbf18, 42fa9e0, 1bc42c2
- Round-2 review surface: docs/reports/review_followups.md
- Spec: 93_mobile_auth §3.3 + 94_mobile_onboarding §3.3 + 95_user_profiles_api
