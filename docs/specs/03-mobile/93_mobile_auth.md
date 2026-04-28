# Spec 93 — Mobile Authentication

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol), Spec 94 (Onboarding), Spec 96 (Subscription)

## 1. Goal & User Story

**Goal:** Provide a secure, frictionless authentication layer that supports four sign-in methods, persists sessions indefinitely, and bridges the mobile app and web platform via a shared Firebase Auth identity.
**User Story:** As a tradesperson discovering the app from the App Store, I need to sign up in under 30 seconds using my phone number or Google account, stay signed in across sessions, and have my preferences restore automatically when I switch phones.

## 2. Technical Architecture (Expo / NativeWind)

**Stack:** Firebase Auth JS SDK + Expo secure storage adapter (per Spec 90 §4).

**Sign-in methods (all four required at launch):**

| Method | Primary Use Case | Notes |
|--------|-----------------|-------|
| Apple Sign-In | iOS users | Required by App Store if any social login offered. Must be equally prominent. |
| Google Sign-In | Android + web users | `expo-auth-session` + Firebase credential exchange |
| Phone / SMS OTP | Tradespeople without Google | `signInWithPhoneNumber` via Firebase |
| Email + Password | All users | Standard Firebase email auth |

**Screen location:** `mobile/app/(auth)/sign-in.tsx`, `mobile/app/(auth)/sign-up.tsx`

**Sign-in screen button order (Apple guideline compliance):**
```
[ Sign in with Apple    ]   ← required equal prominence
[ Sign in with Google   ]
─────────────────────────
[ Continue with Phone   ]
[ Continue with Email   ]
```

## 3. Behavioral Contract

### 3.1 Session Persistence

Sessions persist indefinitely until explicit sign-out. Firebase tokens refresh automatically in the background — no re-authentication prompts. The only forced sign-out events are:

- User taps "Sign Out" in Settings
- User completes account deletion

**Multiple devices:** The same Firebase account may be active on multiple devices simultaneously. No single-session enforcement.

**New device / reinstall:** User preferences (`trade_slug`, `radius_km`, `location_mode`, `home_base_lat/lng`, `default_tab`, `notification_prefs`) are stored server-side in `user_profiles`. On first launch after sign-in on a new device, the app fetches `user_profiles` and hydrates the Zustand `filterStore` — the user never notices they changed devices.

### 3.2 Account Linking

If a user signs up with email/password and later taps "Sign in with Google" using the same email address, Firebase silently links both methods to one account. One account, multiple sign-in methods. The user is never prompted to choose — it is seamless.

### 3.3 SMS Account Recovery

SMS users must provide a backup email address during onboarding (Spec 94 §3.3). This is the recovery path if they lose or change their phone number. Without a backup email, account recovery requires contacting Buildo support.

### 3.4 Sign-Out Behaviour

Tapping "Sign Out" in Settings:
- Calls `firebase.auth().signOut()`
- Clears Firebase session token
- Does **not** clear MMKV local state (trade preferences, cached feed data remain on device)
- Redirects to sign-in screen

On next sign-in (same or different account), `user_profiles` fetch overwrites local state cleanly.

### 3.5 Offline Behaviour

If the device has no internet connection:
- Already-authenticated users: app continues normally. Feed shows cached MMKV data with staleness banner: `"Offline — last updated [time]"` (per Spec 91 offline resilience pattern).
- Unauthenticated users attempting sign-in: show retry prompt. Firebase Auth cannot authenticate offline.

If Firebase Auth is unreachable at sign-in: show retry option. Already-authenticated users are unaffected (token cached locally).

### 3.6 Account Deletion

**Initiated from:** Settings → Account Actions → Delete Account

**Flow:**
1. Confirmation dialog: *"This will permanently delete your account and all data after 30 days."*
2. Offer CSV export of lead history and flight board before proceeding.
3. On confirm:
   - Access suspended immediately — `subscription_status` set to `cancelled_pending_deletion`
   - `account_deleted_at` timestamp written to `user_profiles`
   - User signed out and redirected to sign-in screen
4. **30-day recovery window:** User may sign back in and reactivate — clears `account_deleted_at`, restores status.
5. After 30 days: hard delete — Firebase Auth record removed, `user_profiles` row deleted, all associated data purged.

**PIPEDA compliance:** CSV export must include all personally identifiable fields stored in `user_profiles`. Data not retained beyond 30-day window.

## 4. Implementation

### Cross-Spec Build Order

This spec is step 2 of 5. **Spec 95 DB migration and `/api/user-profile` route must exist first** — the AuthGate reads `onboarding_complete` from `user_profiles`.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — Firebase client config**
- File: `mobile/src/lib/firebase.ts`
- `initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) })`. Firebase Auth JS SDK + Expo secure storage adapter (Spec 90 §4). No `firebase/compat` package.

**Step 2 — User session store**
- File: `mobile/src/store/userStore.ts`
- Zustand v5 store: `{ uid, email, isLoading }` + `signOut()` action.
- `onAuthStateChanged` listener writes uid/email into store.
- `signOut()` calls `firebase.auth().signOut()` and resets store. Does **not** clear MMKV — §3.4.

**Step 3 — Auth route group layout**
- File: `mobile/app/(auth)/_layout.tsx`
- Stack navigator wrapping sign-in and sign-up screens.

**Step 4 — Sign-in screen**
- File: `mobile/app/(auth)/sign-in.tsx`
- Four buttons in Apple HIG order: Apple Sign-In → Google → Phone → Email.
- Use `<Pressable>` not `<button>` (Spec 90 §5 anti-pattern). `expo-auth-session` for Google credential exchange.
- Touch targets `min-h-[44px]` (Spec 90 §9).

**Step 5 — Sign-up screen**
- File: `mobile/app/(auth)/sign-up.tsx`
- Email/password and SMS registration. SMS path: require backup email field (§3.3).
- Auth captures UID only — profile data written in Onboarding (Spec 94), not here.

**Step 6 — AuthGate extension**
- File: `mobile/app/_layout.tsx` (extend existing two-step `useRootNavigationState` guard)
- After auth check: fetch `user_profiles.onboarding_complete`. If `false` → redirect `/(onboarding)/profession`. Existing guard structure preserved.

**Step 7 — Account deletion (Firebase side)**
- File: `mobile/app/(app)/settings.tsx` triggers deletion (Spec 97 §3.1); this spec owns the Firebase cleanup.
- After PATCH to `/api/user-profile` with `account_deleted_at`: call `firebase.auth().signOut()` → navigate `/(auth)/sign-in` with param `?deleted=true`.
- Sign-in screen reads param and shows: *"Your account has been scheduled for deletion. Sign back in within 30 days to reactivate."*

### Testing Gates

- **Unit:** `mobile/__tests__/useAuth.test.ts` — auth state machine: sign-in sets uid, sign-out clears store, `onAuthStateChanged(null)` fires sign-out path, MMKV not cleared on sign-out.
- **Maestro:** `mobile/maestro/auth.yaml` — launch → sign in with email → verify feed visible → sign out → verify sign-in screen renders.

---

## 5. Operating Boundaries

**Target files:**
- `mobile/app/(auth)/sign-in.tsx`
- `mobile/app/(auth)/sign-up.tsx`
- `mobile/app/_layout.tsx` (AuthGate — existing two-step `isNavigationReady` guard)
- `mobile/src/store/` (user session state)

**Out of scope:**
- Admin panel auth (`src/middleware.ts`, `src/lib/auth/route-guard.ts`) — governed by `docs/specs/00_engineering_standards.md` §4
- Firebase Admin SDK `verifyIdToken` wiring — backend concern
- Biometric re-authentication — not required

**Cross-spec dependencies:**
- Spec 94 (Onboarding) — auth captures credential only; all profile data captured in onboarding immediately after first sign-in
- Spec 96 (Subscription) — `subscription_status` checked on every launch post-auth
- Spec 90 §4 — Firebase Auth JS SDK + Expo secure storage adapter required
