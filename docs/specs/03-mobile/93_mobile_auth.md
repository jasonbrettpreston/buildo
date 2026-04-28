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

Sessions persist indefinitely until explicit sign-out. Firebase tokens refresh automatically in the background — no re-authentication prompts. The only **user-initiated** sign-out events are:

- User taps "Sign Out" in Settings
- User completes account deletion

**Forced sign-out (Firebase-initiated):** The following events cause Firebase to invalidate the refresh token, firing `onAuthStateChanged(null)`. The app must handle these identically to a user-initiated sign-out — redirect to `/(auth)/sign-in`:
- User changes their password on another device
- Admin disables the account in Firebase console
- Project-wide token revocation (security incident)

In all forced sign-out cases the user sees the sign-in screen with no error message (same experience as a voluntary sign-out). The app does not distinguish the reason.

**Multiple devices:** The same Firebase account may be active on multiple devices simultaneously. No single-session enforcement.

**New device / reinstall:** User preferences (`trade_slug`, `radius_km`, `location_mode`, `home_base_lat/lng`, `default_tab`, `notification_prefs`) are stored server-side in `user_profiles`. On first launch after sign-in on a new device, the app fetches `user_profiles` and hydrates the Zustand `filterStore` — the user never notices they changed devices.

### 3.2 Account Linking

Firebase does **not** automatically link accounts when a user attempts to sign in with a different method using an email already associated with another method. Firebase throws `auth/account-exists-with-different-credential`.

**Required error handling flow:**
```
User taps "Sign in with Google" with email that already has password account
  → Firebase throws auth/account-exists-with-different-credential
  → App catches error, shows modal:
      "An account with this email already exists.
       Sign in with [original method] to link your Google account."
  → User signs in with original method (email/password)
  → App calls linkWithCredential(googleCredential)
  → Accounts merged — both methods now work
```

For Apple Sign-In, the same pattern applies. The modal copy adapts to the conflicting method name. If the user cancels the linking flow, they remain authenticated with their original method.

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

**Initiated from:** Settings → Account Actions → Delete Account (Spec 97 §3)

**Flow:**
1. CSV export offer (Spec 97 §3.1 Step 1).
2. Confirmation modal (Spec 97 §3.1 Step 2).
3. On confirm:
   - PATCH `/api/user-profile` with `{ account_deleted_at: now(), subscription_status: 'cancelled_pending_deletion' }` — **must succeed before proceeding**. If PATCH fails: show error toast, do NOT sign out.
   - On PATCH success: `firebase.auth().signOut()` → redirect to `/(auth)/sign-in?deleted=true`.
4. **30-day recovery window:** On sign-in, the app checks the profile response. If `account_deleted_at IS NOT NULL` and within 30 days, show a reactivation modal before proceeding:
   ```
   "Welcome back. Your account is scheduled for deletion on [date].
    Reactivate to keep your account?"
    [ Reactivate ] [ Sign Out ]
   ```
   On reactivate: PATCH `{ account_deleted_at: null, subscription_status: [restored] }`. The `?deleted=true` param is not relied on — server state is authoritative.
5. After 30 days: hard delete — Firebase Auth record removed, `user_profiles` row deleted (Spec 97 §3.3).

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
- Use `expo-secure-store` as the persistence adapter — **not** `AsyncStorage`. `AsyncStorage` stores tokens in plain text; `expo-secure-store` uses Keychain (iOS) and Keystore (Android).
- Implementation: `initializeAuth(app, { persistence: getReactNativePersistence(ExpoSecureStoreAdapter) })` where `ExpoSecureStoreAdapter` wraps `expo-secure-store` to conform to the Firebase storage interface. No `firebase/compat` package.

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
- Four buttons in Apple HIG order: Apple Sign-In → Google → Phone → Email. `<Pressable>` not `<button>` (Spec 90 §5). Touch targets `min-h-[44px]` (Spec 90 §9).
- **Apple:** `expo-apple-authentication` (`AppleAuthentication.signInAsync`); exchange credential via `OAuthProvider.credential` for Firebase sign-in.
- **Google:** `expo-auth-session` with `ResponseType.Code`; configure URL scheme in `app.json`; exchange via Firebase credential.
- **Phone/SMS:** `signInWithPhoneNumber` + `FirebaseRecaptchaVerifierModal` (or invisible reCAPTCHA). Presents two-step: phone input → OTP code entry. Handle `auth/too-many-requests` with user-visible back-off message.
- **Account linking:** catch `auth/account-exists-with-different-credential` on all four paths. Show modal per §3.2 — prompt user to sign in with the original method, then call `linkWithCredential`.

**Step 5 — Sign-up screen**
- File: `mobile/app/(auth)/sign-up.tsx`
- Email/password and SMS registration. SMS path: require backup email field (§3.3). Backup email is not verified at registration (async verification email sent later).
- Auth captures UID only — profile data written in Onboarding (Spec 94), not here.

**Step 6 — AuthGate extension**
- File: `mobile/app/_layout.tsx` (extend existing two-step `useRootNavigationState` guard)
- After auth check: fetch `/api/user-profile`. Three outcomes:
  - 200 + `onboarding_complete = true` → proceed to app
  - 200 + `onboarding_complete = false` → redirect `/(onboarding)/profession`
  - 404 (no profile yet) → redirect `/(onboarding)/profession` (new user)
  - 403 (`account_deleted_at` set, within 30 days) → show reactivation modal (§3.6)
  - Network failure (after 3 retries) → show full-screen error with "Try again" button; do not default to onboarding or full access

**Step 7 — Account deletion (Firebase side)**
- File: `mobile/app/(app)/settings.tsx` triggers deletion (Spec 97 §3.1 Steps 8–9); this spec owns the Firebase cleanup.
- Order is critical: PATCH `/api/user-profile` must succeed first → then `firebase.auth().signOut()`. If PATCH fails, show error toast and abort — do NOT sign out.
- After sign-out: navigate `/(auth)/sign-in`. Server state is authoritative; no `?deleted=true` URL param needed.

### Testing Gates

- **Unit:** `mobile/__tests__/useAuth.test.ts` — auth state machine: sign-in sets uid; sign-out clears store + does not clear MMKV; `onAuthStateChanged(null)` fires sign-out path (covers forced sign-out); `auth/account-exists-with-different-credential` triggers linking modal; AuthGate 404 redirects to onboarding; AuthGate fetch failure shows error screen.
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
