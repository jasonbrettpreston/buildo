# Active Task: WF3 — PostHog Auth Funnel Telemetry (Spec 90 §11 gap)
**Status:** Implementation
**Workflow:** WF3 — Fix
**Domain Mode:** Admin (mobile/ Expo source — non-Maestro)

## Context
* **Goal:** Wire PostHog runtime initialization and emit a complete funnel of auth events (screen views, method attempts, success/failure, account-linking, sign-out) from the four sign-in flows. The package `posthog-react-native@4.42.4` is installed but never initialized — every funnel event spec'd by Spec 90 §11 is currently a no-op gap surfaced by the WF5 audit.
* **Target Spec:** `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §11 — *"Product Telemetry: `posthog-react-native`. Track funnel events. Strip all PII."*
* **Source:** `docs/reports/audit_spec93_2026-04-29.md` — Observability vector flagged PostHog as the highest-priority non-blocking gap.
* **Key Files:**
  - `mobile/src/lib/analytics.ts` — NEW: PostHog singleton + typed helpers (`track`, `identifyUser`, `resetIdentity`)
  - `mobile/app/_layout.tsx` — MODIFY: import analytics so the singleton initializes early
  - `mobile/app/(auth)/sign-in.tsx` — MODIFY: emit auth funnel events
  - `mobile/app/(auth)/sign-up.tsx` — MODIFY: emit signup funnel events
  - `mobile/src/store/authStore.ts` — MODIFY: `identifyUser` on listener fire, `resetIdentity` on sign-out
  - `mobile/.env.local.example` — MODIFY: add `EXPO_PUBLIC_POSTHOG_API_KEY` + `EXPO_PUBLIC_POSTHOG_HOST`
  - `mobile/__tests__/analytics.test.ts` — NEW: PII-strip + null-client safety tests
  - `mobile/__tests__/useAuth.test.ts` — MODIFY: assert `resetIdentity` called from `signOut()`

## Technical Implementation
* **New/Modified Components:** `analytics.ts` singleton, instrumentation in 2 screens + 1 store, 1 new test file, 1 test extension
* **Data Hooks/Libs:** `posthog-react-native` v4 class API (`new PostHog(apiKey, options)`, `.capture()`, `.identify()`, `.reset()`)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes. PostHog `capture()` calls wrapped in try/catch in the helper so a telemetry failure never breaks an auth flow.
* **Unhappy Path Tests:** `analytics.test.ts` covers (a) PII-strip from event payloads, (b) helpers no-op safely when `EXPO_PUBLIC_POSTHOG_API_KEY` is absent, (c) capture failures swallowed without throwing.
* **logError Mandate:** N/A — mobile uses Sentry. PostHog telemetry failures swallowed because best-effort.
* **UI Layout:** N/A — no UI changes.

---

## Bug Reproduction & Root Cause

**Reproduction:**
1. Open the mobile app → sign-in screen renders.
2. Tap any auth method, complete sign-in.
3. Inspect PostHog dashboard / proxy tap.
4. **Expected:** funnel events `auth_screen_viewed`, `auth_method_attempted`, `auth_method_succeeded` etc.
5. **Actual:** zero events emitted. Spec 90 §11 funnel telemetry not satisfied.

**Root cause:**
- `posthog-react-native` is in `mobile/package.json` (`^4.42.4`) but never imported in any source file.
- Confirmed via `grep -r "posthog-react-native" mobile/src mobile/app` → no matches; `npx knip` flags as unused dependency.
- No call to `new PostHog(apiKey)` anywhere in the codebase — the SDK is dormant.

---

## Funnel Event Catalogue (PII-stripped)

| Event | Properties (PII-stripped) | Fired from |
|-------|---------------------------|-----------|
| `auth_screen_viewed` | `{ screen: 'sign-in' \| 'sign-up' }` | screen mount `useEffect` |
| `auth_method_attempted` | `{ method: 'apple' \| 'google' \| 'phone' \| 'email' }` | each handler before Firebase call |
| `auth_method_succeeded` | `{ method }` | each handler after Firebase resolves |
| `auth_method_failed` | `{ method, code }` (`code` = Firebase error code, NOT message) | each handler `catch` |
| `auth_account_link_shown` | `{ existing_method, new_method }` (provider names) | when `AccountLinkingSheet` expands |
| `auth_account_link_completed` | `{ existing_method, new_method }` | after `linkWithCredential` resolves |
| `auth_account_link_failed` | `{ existing_method, new_method, code }` | `linkPendingCredential` Sentry-captured fail |
| `auth_otp_verified` | `{}` | OTP verification success |
| `auth_otp_resend_requested` | `{}` | Resend tap (cooldown=0) |
| `signup_screen_viewed` | `{ method: 'email' \| 'phone' }` | sign-up screen mount |
| `signup_completed` | `{ method }` | after `createUserWithEmailAndPassword` or SMS verification |
| `signout_initiated` | `{}` | `useAuthStore.signOut()` entry |

**PII strip rule:** event property objects pass through a `stripPii(props)` whitelist that only allows the keys named in this catalogue. Any unexpected key is dropped (with a dev-only `console.warn` so a developer attempting to log PII gets immediate feedback). Email, phone number, displayName, idToken, IP, device IDs are never sent.

**Identity:** Firebase `uid` is used as PostHog `distinctId` via `identifyUser(uid)`. The `uid` is an opaque server-generated token (not personally identifying on its own). User properties on `identify` are limited to `{ first_seen_at }` — no email, displayName, or phone.

---

## Execution Plan

### Step 1 — `mobile/src/lib/analytics.ts` (NEW)

PostHog singleton + helpers:
- `getClient()` — lazy init; returns `null` if `EXPO_PUBLIC_POSTHOG_API_KEY` is unset (so local dev/tests don't fail)
- `track(eventName, props)` — strips PII via `ALLOWED_KEYS` whitelist, swallows SDK errors
- `identifyUser(uid)` — sets PostHog distinctId, only sends `{ first_seen_at }`
- `resetIdentity()` — calls PostHog `reset()` (clear distinctId on sign-out)

### Step 2 — Wire init + identify lifecycle

`mobile/app/_layout.tsx`: import `analytics` so the lazy singleton has a chance to construct on first event call.

`mobile/src/store/authStore.ts`:
- `initFirebaseAuthListener` callback: after `setAuth(user, idToken)` → `identifyUser(user.uid)`
- `signOut()`: emit `signout_initiated` first, then `firebaseSignOut`, then store resets, then `resetIdentity()` last (after sign-out completes so the reset is associated with the right session boundary)

### Step 3 — Sign-in screen instrumentation (`mobile/app/(auth)/sign-in.tsx`)

- Mount: `useEffect(() => { track('auth_screen_viewed', { screen: 'sign-in' }); }, [])`
- Each handler emits `attempted` before Firebase, `succeeded` after, `failed` in catch (with error code, not message)
- `handleAuthError` linking branch → `track('auth_account_link_shown', { existing_method, new_method })`
- `linkPendingCredential` success → `track('auth_account_link_completed', { ... })`; failure (currently Sentry-captured) → also `track('auth_account_link_failed', { ..., code })`
- `handleVerifyOtp` success → `track('auth_otp_verified')`
- Resend tap → `track('auth_otp_resend_requested')`

### Step 4 — Sign-up screen instrumentation (`mobile/app/(auth)/sign-up.tsx`)

- `useEffect(() => { track('signup_screen_viewed', { method }); }, [method])`
- After `createUserWithEmailAndPassword` resolves → `track('signup_completed', { method: 'email' })`
- After SMS OTP verification + backup-email step submitted → `track('signup_completed', { method: 'phone' })`

### Step 5 — Env example update

```
# PostHog — product telemetry per Spec 90 §11. Leave unset for local dev.
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### Step 6 — Tests

**`mobile/__tests__/analytics.test.ts`** (NEW):
1. `track()` is a no-op when `EXPO_PUBLIC_POSTHOG_API_KEY` is unset (no throw, no SDK constructor call).
2. `track('event', { method: 'google', email: 'a@b.com' })` only sends `{ method: 'google' }` — email is stripped.
3. Unknown keys are dropped (`stripPii` whitelist enforcement).
4. `track()` swallows PostHog SDK errors (mocked `capture` throws → no exception bubbles).
5. `identifyUser('uid')` calls SDK's `identify` with `{ first_seen_at: <ISO> }` — no email/displayName.
6. `resetIdentity()` calls SDK's `reset()`.

**`mobile/__tests__/useAuth.test.ts`** (MODIFY): mock `@/lib/analytics`, assert `signOut()` calls `resetIdentity` and emits `signout_initiated`.

---

## Pre-Review Self-Checklist

1. Does the `ALLOWED_KEYS` whitelist match exactly the catalogue above? Any catalogue key NOT in `ALLOWED_KEYS` silently drops on emission.
2. Does `EXPO_PUBLIC_POSTHOG_API_KEY` appear in `.env.local.example` AND is the gate verified (`if (!apiKey) return null`)?
3. Is Firebase `uid` the only user identifier passed to PostHog (no email, displayName, idToken)?
4. Does each sign-in handler emit `attempted` BEFORE the Firebase call and `succeeded`/`failed` AFTER, so a hung Firebase call still leaves a trail?
5. Does `signOut()` call `resetIdentity()` AFTER `firebaseSignOut` completes (not before — otherwise the next event after reset could be misattributed to the prior user)?

## Multi-Agent Review

Per WF3 protocol: independent code reviewer only — adversarial agents skipped unless requested. Spawn `feature-dev:code-reviewer` agent (`isolation: "worktree"`). Inputs: spec path + modified files list. Summary: "WF3 — wire PostHog funnel telemetry for mobile auth flows; PII-stripped via whitelist; no-op when env unset." Fix any FAIL items before Green Light. DEFER → `docs/reports/review_followups.md`.

## Green Light

`cd mobile && npx jest --no-watchman && npx tsc --noEmit` — both must pass with zero new failures. Then commit with `fix(90_mobile_engineering_protocol): wire PostHog auth funnel telemetry`.

---

> **PLAN LOCKED. Do you authorize this WF3 fix? (y/n)**
