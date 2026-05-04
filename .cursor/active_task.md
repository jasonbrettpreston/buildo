# Active Task: WF3 Forced-Signout Cleanup Unification + Dead-Code Sweep
**Status:** Implementation (authorized 2026-05-04)
**Workflow:** WF3 — bug fix (PROMOTED CRITICAL) + dead-code housekeeping
**Domain Mode:** Admin (mobile)
**Rollback Anchor:** `fbb52c3`

## Context

Two related items:

1. **PROMOTED CRITICAL** — `auth-state reset placement leaks data on forced sign-out`. Documented in `review_followups.md` (line ~744, the 🔥 PROMOTED entry from §9.14 Phase D). The asymmetry just widened in the previous WF3 follow-up: `signOut()` now calls `mmkvPersister.removeClient()` to purge the persister blob from disk, but the listener's null branch (`onAuthStateChanged(null)` for forced sign-outs — admin disable, password change on another device, project token revocation) still calls `clearAuth()` only. On a shared device, a forced sign-out leaves: every Zustand peer store unchanged, the TanStack in-memory cache unchanged, AND now a more visible asymmetry where the disk state and memory state are inconsistent across the two paths.

2. **Dead-code sweep** — after the cumulative §9 + WF3 changes (16+ commits across mobile state + auth + push dispatch + mobile schema + cursor backward-compat + PII strip), audit for truly-dead code that the changes left behind. Conservative: only remove items with NO consumers AND NO upgrade-path obligation. Persist `migrate` functions and one-time MMKV cleanup migrations STAY (existing users still need them).

## Technical Implementation

### Item 1 — Forced-signout cleanup unification

**Current shape** (`mobile/src/store/authStore.ts`):
- `signOut()` (lines 82–148): the "happy path" sign-out. Calls `track('signout_initiated')` → `usePaywallStore.reset()` → `auth().signOut()` → in `finally`: `queryClient.clear()` + `mmkvPersister.removeClient()` + 4 peer-store `.reset()` calls + `set({user:null, idToken:null, isLoading:false})` + `resetIdentity()`.
- `clearAuth` action (line 80): `set({ user: null, idToken: null, isLoading: false })` ONLY.
- Listener null branch (line 275): `useAuthStore.getState().clearAuth()`. Skips everything else.

**Fix**: extract everything that runs in the signOut() `finally` block into a private `clearLocalSessionState()` helper (or inline an action), then have BOTH the `signOut()` finally AND the listener null branch invoke it. Implementation choices:

A. **Extract to a module-scope function** in `authStore.ts`. Both `signOut()` and the listener call it. The `signOut()` action stays as the public API; `clearLocalSessionState` is internal.

B. **Add a new Zustand action** `forceSignOutCleanup` and have the listener call it. Pros: testable via `useAuthStore.getState().forceSignOutCleanup()`. Cons: makes the public store API wider for an internal concern.

**Going with A** — minimal API surface; `clearLocalSessionState` is a leaf helper that doesn't need to be a Zustand action. The new §9.12 `storeReset.coverage.test.ts` already enforces the wiring at the static layer; we'll add a direct test that the listener's null branch invokes the helper.

**Side effects to verify**:
- The listener fires multiple times during a single Firebase auth resolution (per the existing `lastKnownUid !== null` guard at line 213). On the null-fire path, `lastKnownUid` is intentionally NOT reset (Spec 93 §3.4 fast-path). Adding the cleanup must not break this — the cleanup runs on the listener's null branch only, and it's idempotent (each `.reset()` and `removeClient()` is a no-op on already-cleared state).
- `track('signout_initiated')` is currently inside `signOut()` only. For forced sign-outs, the original `signout_initiated` PostHog event would not fire (the user didn't initiate). Cleaner to add a NEW telemetry event `forced_signout` (or `auth_revoked`) on the listener path, which is also useful for product analytics.

### Item 2 — Dead-code sweep

**Method**: grep + read-and-decide. Target categories:

a) **Unreferenced exports** in mobile state / auth files. Specifically:
   - `cleanupLegacyUserProfileCache` is a one-time migration; STAY (existing users may not have run it).
   - Any export from removed-then-restored or restructured files.

b) **Dead comments** referring to removed code. Examples:
   - `mobile/src/store/authStore.ts:97` says "Firebase sign-out — onAuthStateChanged fires (null) which clears auth." — STAYS (still accurate).
   - `userProfileCacheCleanup.ts:13` says "Called from authStore module load so it runs exactly once per process" — verify this is still true (`grep cleanupLegacyUserProfileCache` to confirm).

c) **Persist migrate functions** in `userProfileStore` (v0→v1) and `onboardingStore` (v0→v2). KEEP — they handle existing-user upgrade. Removing them would silently corrupt v0 state on upgraders.

d) **Spec 99 §3.5 deprecated mirrors** — historical doc; KEEP as audit trail.

e) **Other helpers / hooks / test files** that grep returns zero callers for.

**Grep targets** (run as a pre-Phase-2 audit):
- `mobile/src/lib/` for files where `grep -l <export>` returns zero hits outside their own file
- `mobile/src/store/` for actions / fields no consumer reads
- `mobile/__tests__/` for test fixtures that were unconsolidated by removed schema fields

**Conservative posture**: when in doubt, KEEP. The cost of an accidental delete (regression in production) outweighs the cost of an extra unused export (lint warning at most). Phase 2 is a netting-out exercise, not an aggressive purge.

## Standards Compliance

* **Try-Catch Boundary:** N/A — no new error paths.
* **Unhappy Path Tests:** Item 1 — new test asserts the listener's null branch runs the same cleanup as `signOut()` (peer stores reset, queryClient cleared, persister blob removed). Item 2 — `npm run dead-code` (already in package.json per CLAUDE.md) before-and-after diff.
* **logError Mandate:** N/A.
* **UI Layout:** N/A.
* **§9.13 drift impact:** None.

## Execution Plan

**Phase 1 — Forced-signout cleanup unification (commit 1)**
- [ ] 1a. Extract a module-scope `clearLocalSessionState()` helper in `authStore.ts` containing:
      `usePaywallStore.getState().reset()` → `queryClient.clear()` → `mmkvPersister.removeClient()` → 4 peer-store `.reset()` calls → in-memory auth set-to-null → `resetIdentity()`. (NOTE: `auth().signOut()` is NOT in the helper — that's specific to the explicit-signout path.)
- [ ] 1b. Refactor `signOut()` to use the helper after `auth().signOut()` (or in finally). Keep `track('signout_initiated')` AT THE TOP of `signOut()` (telemetry attributed to the outgoing session).
- [ ] 1c. Update the listener's null branch to call `clearLocalSessionState()` instead of just `clearAuth()`. Add a new `track('forced_signout')` event before the cleanup so product analytics can distinguish user-initiated from server-initiated sign-outs.
- [ ] 1d. Adversarial probe: does the listener fire `null` on EVERY app cold-boot before Firebase resolves the cached session? If yes, every cold boot would trigger the cleanup — a regression. Verify by reading the existing fire-detection logic (`lastKnownUid` guard at line 213). The fast-path comment at line 241 says "do NOT reset lastKnownUid here" — implying the null-fire is real on certain transitions, not on every cold boot. Worth a `lastKnownUid !== null` guard around the new cleanup so first-fire doesn't trigger it (a user who never signed in shouldn't have signOut behavior fire).
- [ ] 1e. Update `mobile/__tests__/storeReset.coverage.test.ts` to also exercise the listener path (call the captured `authStateHandler(null)` and assert all peer stores reset).
- [ ] 1f. Update `mobile/__tests__/useAuth.test.ts` if it has a forced-signout test — assert the new cleanup behavior + the new `forced_signout` track call.
- [ ] 1g. Mobile suite + drift script.
- [ ] 1h. **Commit 1:** `fix(99_mobile_state_architecture): WF3 unify forced-signout cleanup with explicit-signout path`

**Phase 2 — Dead-code sweep (commit 2)**
- [ ] 2a. Run `npm run dead-code` (mobile) — capture baseline.
- [ ] 2b. For each flagged item, decide REMOVE vs KEEP per the conservative criteria above. Enumerate decisions in the commit message.
- [ ] 2c. Manual grep audit for:
      - `useAuthStore` exports — are all actions used?
      - `mmkvPersister` exports — `getLastPersistedAt` consumer (OfflineBanner per the file header)?
      - `userProfileCacheCleanup` — should call site move out of authStore module load if it's run for too long? (KEEP; flag for future deprecation when usage telemetry confirms zero hits.)
      - Spec 99 §3.5 deprecated mirrors entries — any whose deprecation target is now ✅ DONE in §9 backlog and could be moved to a "historical" subsection?
- [ ] 2d. Apply removals + comment cleanups. Avoid touching persist `migrate` functions and one-time MMKV cleanup helpers.
- [ ] 2e. Mobile suite + drift script.
- [ ] 2f. **Commit 2:** `chore(99_mobile_state_architecture): WF3 dead-code sweep across §9 + WF3 cumulative changes`

**Phase 3 — Adversarial review (single code-reviewer)**
- [ ] 3a. Spawn `feature-dev:code-reviewer` non-isolated on the range `fbb52c3..HEAD`. Focus: (i) forced-signout cleanup correctness across cold-boot and uid-change paths, (ii) dead-code removals don't break any latent consumer.
- [ ] 3b. Apply CRITICAL/HIGH inline.
- [ ] 3c. **Commit 3 (if amendments):** `fix(99_mobile_state_architecture): WF3 forced-signout + dead-code sweep — code-reviewer amendments`

**Phase 4 — Update `review_followups.md`**
- [ ] 4a. Mark the PROMOTED CRITICAL "Auth-state reset placement leaks data on forced sign-out" as ✅ RESOLVED with the commit hash.
- [ ] 4b. Add a brief summary of the dead-code sweep (kept items + removed items) for traceability.
- [ ] 4c. **Commit 4:** `docs(99_mobile_state_architecture): mark forced-signout PROMOTED item resolved + record dead-code sweep`

## Out of Scope
- The 6 lower-priority deferrals from the Phase 7 trio review (timing-safe length leak, catch-all narrowing, etc.) — already filed in `review_followups.md`.
- Encrypted-MMKV via `encryptionKey` — separate hardening WF.
- Aggressive removal of one-time migrations / persist migrate functions — KEEP for upgrader safety.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
>
> §10 note: ~30 LOC for Phase 1 (helper extraction + listener wiring + 2 test additions); Phase 2 size depends on what `npm run dead-code` reports — bounded by the conservative-keep posture. Single code-reviewer for Phase 3 (small surface).
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
