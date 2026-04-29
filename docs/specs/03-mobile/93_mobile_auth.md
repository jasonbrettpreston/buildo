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
- **Resets** in-memory Zustand stores (`filterStore.reset()`, `userProfileStore.reset()`) so no stale data is visible if a different user signs in on the same device
- Does **not** clear MMKV local state — MMKV is preserved so the same user returning on the same device gets instant UI on next sign-in (server data overwrites MMKV during the profile hydration)
- Redirects to sign-in screen

On next sign-in, `user_profiles` fetch overwrites local state cleanly. The Zustand reset + server hydration ensures stale data is never presented to a different user.

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
   - `POST /api/user-profile/delete` — **must succeed before proceeding** (Spec 95 Step 3a). This dedicated endpoint atomically sets `account_deleted_at`, `subscription_status: 'cancelled_pending_deletion'`, cancels Stripe subscription if applicable, and calls `admin.auth().revokeRefreshTokens(uid)` server-side. **Do NOT use the general `PATCH /api/user-profile`** — `subscription_status` and `account_deleted_at` are server-only fields blocked by the PATCH whitelist.
   - If POST fails: show error toast, do NOT sign out.
   - On POST success: `firebase.auth().signOut()` → redirect to `/(auth)/sign-in`.
4. **30-day recovery window:** On sign-in, the AuthGate fetches `/api/user-profile`. If the account is in the deletion window, the server returns `403` with `{ error: "Account scheduled for deletion.", account_deleted_at: "<ISO>", days_remaining: <N> }` (Spec 95 §9 Step 2). The AuthGate shows a reactivation modal before proceeding:
   ```
   "Welcome back. Your account is scheduled for deletion on [date].
    Reactivate to keep your account?"
    [ Reactivate ] [ Sign Out ]
   ```
   On reactivate: `POST /api/user-profile/reactivate` (Spec 95 Step 3b) — sets `account_deleted_at = null` and `subscription_status` to restored value. The `?deleted=true` param is not relied on — server state is authoritative.
5. **`days_remaining = 0` edge case:** CEIL(30 - 30) = 0. The reactivation modal shows "Your account is scheduled for deletion today." (not "0 days left"). The POST /api/user-profile/reactivate returns 400 if `account_deleted_at > NOW() - INTERVAL '30 days'` is false (hard-delete window passed). If `days_remaining = 0`, the modal still offers reactivation — hard delete runs via the daily Cloud Function, not in real-time, so the window is still open until the sweep runs.
6. After 30 days: hard delete — Firebase Auth record removed, `user_profiles` row deleted (Spec 97 §3.3).

**PIPEDA compliance:** CSV export must include all personally identifiable fields stored in `user_profiles`. Data not retained beyond 30-day window.

## 4. Design & Interface

### Design Language

The auth screens are the first branded experience. They must feel premium and trustworthy — dark, minimal, and confident. No decoration, no gradients, no marketing copy. The screen communicates: "This is a professional tool." The design follows the industrial-utilitarian dark mode language: `bg-zinc-950` background, `text-zinc-100` primary text, `amber-500` logo accent. The 4-button auth stack is the centrepiece — laid out with deliberate spacing and appropriate visual weight per each method's provenance.

---

### Sign-In Screen Layout

File: `mobile/app/(auth)/sign-in.tsx`

**Screen container:** `bg-zinc-950 flex-1 items-center justify-center px-6`

**Wordmark / logo area:**
- `mb-12` below the logo before the button stack
- Logo: SVG or image asset `w-10 h-10 rounded-xl` in `amber-500`; wordmark "Buildo" in `text-zinc-100 text-2xl font-bold` beside it
- Tagline below wordmark: `text-zinc-500 text-sm text-center mt-1` — "Leads for the trades."

**Button stack layout:**
```
[ Sign in with Apple    ]   ← bg-white text-black (Apple HIG)
[ Sign in with Google   ]   ← bg-zinc-900 border border-zinc-700 with Google logo
─────── or ───────────────  ← divider: text-zinc-700 text-xs font-mono tracking-widest
[ Continue with Phone   ]   ← bg-zinc-900 border border-zinc-700
[ Continue with Email   ]   ← bg-zinc-900 border border-zinc-700
```

**Button spacing:** `gap-3` between all buttons. Divider row: `flex-row items-center gap-3 my-1` with `flex-1 h-px bg-zinc-800` lines flanking `text-zinc-600 text-xs` "or".

**All buttons:** `rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px]`.

---

### Apple Sign-In Button (HIG Compliance — iOS only)

**Platform guard:** `expo-apple-authentication` is iOS-only. The Apple button must be conditionally rendered: `{Platform.OS === 'ios' && <AppleAuthenticationButton ... />}`. On Android, the button stack shows only 3 options: Google → Phone → Email (no divider needed; spacing stays `gap-3`).

Apple mandates specific visual treatment. Use `expo-apple-authentication`'s `<AppleAuthenticationButton>` component directly — do NOT build a custom button:

```tsx
<AppleAuthenticationButton
  buttonType={AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthenticationButtonStyle.WHITE}
  cornerRadius={16}
  style={{ width: '100%', height: 52 }}
  onPress={handleAppleSignIn}
/>
```

`buttonStyle={WHITE}` is correct on dark backgrounds: `WHITE` renders a **white background with black text/logo**, which stands out clearly against `bg-zinc-950`. `BLACK` renders a black background with white text — nearly invisible on a dark screen. Do not apply NativeWind classes to this component — it renders a native view. The `cornerRadius={16}` matches `rounded-2xl` on the sibling buttons.

---

### Google Sign-In Button

Custom `<Pressable>` styled to match the design system while displaying the Google logo:

- Container: `bg-zinc-900 border border-zinc-700 rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px] active:bg-zinc-800`
- Google `G` logo: SVG inline (coloured, 20px) — left of label text, `mr-3`
- Label: `text-zinc-100 text-sm font-semibold`

---

### Phone Input (react-native-international-phone-number)

The Phone button opens a bottom sheet (`@gorhom/bottom-sheet` at `snapPoints={['55%']}`, `keyboardBehavior="interactive"` so the sheet rises with the keyboard, `<BottomSheetView>` as direct child). Inside:

- Component: `<PhoneInput>` from `react-native-international-phone-number`
- Container: `bg-zinc-800 rounded-xl overflow-hidden mx-4` — wraps the component
- Props: `defaultCountry="CA"` · `phoneInputStyles={{ container: { backgroundColor: '#27272a', borderRadius: 12 }, flagContainer: { backgroundColor: '#3f3f46', borderRadius: 0 }, divider: { backgroundColor: '#52525b' }, input: { color: '#f4f4f5', fontFamily: 'DMSans-Regular', fontSize: 16 } }}` — the `divider` key is required by `react-native-international-phone-number` to style the separator between the flag/dial-code area and the input field; omitting it leaves a default-styled separator that clashes with the dark theme.
- CTA button below: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 mx-4 mt-4 w-full items-center` — "Send code"
- Error state (`auth/too-many-requests`): `text-red-400 text-xs text-center mt-2` "Too many attempts. Try again in a few minutes."

---

### OTP Entry (input-otp-native)

After phone number submitted, sheet transitions to OTP entry screen.

- Component: `<OTPInput>` from `input-otp-native`
- 6 cells via `pinCount={6}` prop. **Cell styling uses the library's own `cellStyle` / `focusedCellStyle` props — NOT NativeWind className on cell elements.** The library renders its own native cell views that do not accept className:
  ```tsx
  <OTPInput
    pinCount={6}
    autoFocus
    cellStyle={{ width: 48, height: 56, borderRadius: 12, backgroundColor: '#27272a', borderWidth: 2, borderColor: '#3f3f46', color: '#f4f4f5', fontSize: 24, fontFamily: 'SpaceMono', textAlign: 'center' }}
    focusedCellStyle={{ borderColor: '#f59e0b' }}
  />
  ```
- Row layout: `flex-row gap-2 justify-center mx-4` on the container wrapping `<OTPInput>`
- `autoFocus` — keyboard appears immediately on sheet open; keyboard auto-dismissed when all 6 digits are entered (the library fires `onCodeFilled` callback — call `Keyboard.dismiss()` in that callback)
- Explainer below: `text-zinc-500 text-sm text-center mt-4` "Enter the 6-digit code sent to {phoneNumber}"
- "Didn't receive it?" row: `text-zinc-600 text-xs text-center mt-6` with `text-amber-500` "Resend" tap target. Resend disabled for 30s after initial send (countdown: `"Resend in {N}s"`).
- **Wrong-code error state:** When OTP verification fails (incorrect code), render `text-red-400 text-xs text-center mt-2` "Incorrect code — try again." Apply a `borderColor: '#f87171'` (red-400) override to all cells via `cellStyle` until the user starts re-entering digits.

---

### Email Sign-In / Sign-Up Fields

Shared `TextInput` style: `bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3` with `placeholderTextColor="#71717a"`.

Email field: `keyboardType="email-address"` · `autoCapitalize="none"` · `autoComplete="email"` · `textContentType="emailAddress"` (iOS AutoFill).
Password field: `secureTextEntry` · `autoComplete="current-password"` (sign-in) / `"new-password"` (sign-up) · `textContentType="password"` (sign-in) / `textContentType="newPassword"` (sign-up, triggers iOS strong password suggestion).

**Sign-up only — backup email field (SMS users):**
- Shown only when arriving from the phone path
- Label above: `text-zinc-500 text-xs mb-1` "Recovery email — in case you lose phone access"
- Same `TextInput` style, `keyboardType="email-address"`

---

### In-Button Spinner Pattern

All auth action buttons follow this pattern to prevent double-taps and communicate progress:

```
idle:   [ icon? ]  "Sign in with Google"  (full label)
loading: [ ActivityIndicator size="small" color="#71717a" ]  (spinner only, button disabled)
error:   [ icon? ]  "Sign in with Google"  (reverts to label, button re-enabled, error shown below)
```

Local `isSubmitting` boolean per button. `<Pressable disabled={isSubmitting} opacity={isSubmitting ? 0.7 : 1.0}`. All custom `<Pressable>` auth buttons: `accessibilityRole="button"` (the Google, Phone, and Email `<Pressable>` buttons — not the Apple button, which is a native component with its own accessibility).

**Haptic feedback:**
- Sign-in / sign-up **success**: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` from `expo-haptics` — fires immediately after Firebase auth resolves and before navigation.
- Sign-in / sign-up **failure**: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)` — fires on any auth error (wrong password, too many requests, etc.) before showing the error message.

---

### Account Linking Bottom Sheet

When `auth/account-exists-with-different-credential` is caught:

- `@gorhom/bottom-sheet` at `snapPoints={['50%']}` · `keyboardBehavior="interactive"` (sheet moves with keyboard if the user needs to re-enter credentials) · `<BottomSheetView>` as direct child (v5 requirement)
- `<Link2 size={24} color="#f59e0b" />` from `lucide-react-native` — centred, `mb-3`
- Headline: `text-zinc-100 text-base font-bold text-center mb-2` "Email already registered"
- Body: `text-zinc-400 text-sm text-center mb-6` — "An account with this email already exists. Sign in with {existingMethod} to link your {newMethod} account."
- Primary: `bg-amber-500 active:bg-amber-600 rounded-2xl py-3.5 mx-4 w-full items-center` + `text-zinc-950 font-semibold text-sm` "Sign in with {existingMethod}"
- Secondary: `text-zinc-500 text-sm text-center mt-3` "Cancel" — closes sheet, leaves user authenticated with original method

The `{existingMethod}` and `{newMethod}` strings are derived from the Firebase error's `customData.email` lookup (call `fetchSignInMethodsForEmail`) to show the correct provider name.

---

## 5. Implementation

### Cross-Spec Build Order

This spec is step 2 of 5. **Spec 95 DB migration and `/api/user-profile` route must exist first** — the AuthGate reads `onboarding_complete` from `user_profiles`.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 0 — Install dependencies**
All packages below are required by specs 93–97 but are **not yet present in `mobile/package.json`**. Install before any other implementation work:

```bash
cd mobile
npx expo install expo-secure-store expo-apple-authentication expo-web-browser expo-sharing expo-blur
npm install input-otp-native react-native-international-phone-number tailwindcss-safe-area @react-navigation/bottom-tabs
npx expo install @sentry/react-native
```

**`app.json` plugin additions** — add alongside the existing `expo-router`, `expo-font`, `expo-notifications`, `expo-location` entries:
```json
["expo-apple-authentication"],
["@sentry/react-native/app-plugin", { "organization": "buildo", "project": "buildo-mobile" }]
```

**Google OAuth URL scheme** — add an Android `intentFilters` entry in `app.json` using your Google OAuth client's reverse client ID (from Google Cloud Console → Credentials → OAuth 2.0 Android client). Required for `expo-auth-session` Google sign-in on Android.

**`tailwind.config.js`** — add to the `plugins` array: `require('tailwindcss-safe-area')`. Required for the `pb-safe` class used in the onboarding sticky footer (Spec 94 §10 Step 3).

---

**Step 1 — Firebase client config**
- File: `mobile/src/lib/firebase.ts`
- Use `expo-secure-store` as the persistence adapter — **not** `AsyncStorage`. `AsyncStorage` stores tokens in plain text; `expo-secure-store` uses Keychain (iOS) and Keystore (Android).
- **`ExpoSecureStoreAdapter` is NOT exported by `expo-secure-store`** — it must be implemented as a custom wrapper in `mobile/src/lib/firebase.ts`:
  ```typescript
  import * as SecureStore from 'expo-secure-store';
  import { initializeAuth, getReactNativePersistence } from 'firebase/auth';

  // Firebase's getReactNativePersistence requires an AsyncStorage-compatible interface.
  // expo-secure-store uses different method names — this adapter bridges the gap.
  const ExpoSecureStoreAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };

  export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ExpoSecureStoreAdapter),
  });
  ```
  No `firebase/compat` package.
- **Firebase config env vars:** Source all Firebase config values from environment variables — never hardcode in source. Use the `EXPO_PUBLIC_` prefix so Expo includes them in the client bundle:
  ```typescript
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  ```
  Set via EAS Secrets: `eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value <value>`. Commit a `mobile/.env.local.example` file with placeholder keys (no real values) for local dev reference. Do NOT commit real Firebase credentials.

**Step 2 — User session store**
- File: `mobile/src/store/userStore.ts`
- Zustand v5 store: `{ uid, email, isLoading }` + `signOut()` action.
- `onAuthStateChanged` listener writes uid/email into store.
- `signOut()`: (1) calls `firebase.auth().signOut()`; (2) calls `filterStore.reset()`, `userProfileStore.reset()`, and `paywallStore.clear()` to clear all in-memory state; (3) resets this store. Does **not** clear MMKV — MMKV is preserved per §3.4 so the same user returning on the same device gets fast hydration. A different user signing in gets their own server data on the profile hydration.
- **`paywallStore.clear()` is required in sign-out** — without it, a user who dismissed the paywall and then signed out on a shared device would leave `dismissed: true` in memory, causing the next user to start in inline blur mode (Spec 96 `paywallStore` note).

**Step 3 — Auth route group layout**
- File: `mobile/app/(auth)/_layout.tsx`
- Stack navigator wrapping sign-in and sign-up screens.

**Step 4 — Sign-in screen**
- File: `mobile/app/(auth)/sign-in.tsx`
- **Layout per §4:** wordmark area (`mb-12`), then 4-button stack with `gap-3`, divider row between Google and Phone. Screen container `bg-zinc-950 flex-1 items-center justify-center px-6`.
- Touch targets `min-h-[52px]` (§4 spec — exceeds Spec 90 §9 44pt minimum).
- **Apple (iOS only):** `{Platform.OS === 'ios' && <AppleAuthenticationButton>}` — use the native component directly with `buttonStyle={WHITE}` and `cornerRadius={16}`. Do NOT wrap in a custom `<Pressable>`. In-button spinner not applicable (native component handles its own loading state). Android shows no Apple button — 3-item stack only.
- **Google:** Custom `<Pressable>` with Google `G` SVG logo per §4. `expo-auth-session` with `ResponseType.Code`; configure URL scheme in `app.json`; exchange via Firebase credential. In-button spinner per §4 spinner pattern.
- **Phone/SMS:** Tapping "Continue with Phone" opens a bottom sheet (`snapPoints={['55%']}`). Phone input: `react-native-international-phone-number` with `defaultCountry="CA"` per §4 Phone Input spec. On "Send code" tap: `signInWithPhoneNumber` → sheet transitions to OTP entry using `input-otp-native` 6-cell spec per §4 OTP Entry. Handle `auth/too-many-requests` with `text-red-400 text-xs` message + 30s resend lockout timer.
- **Email:** Tapping "Continue with Email" navigates to `/(auth)/sign-in?method=email` or opens an inline form below the button stack. Fields per §4 email field spec.
- **Account linking:** catch `auth/account-exists-with-different-credential` on all four paths. Show bottom sheet per §4 Account Linking Bottom Sheet spec — call `fetchSignInMethodsForEmail` to determine existing provider name for the copy. On link success: close sheet, proceed to AuthGate.

**Step 5 — Sign-up screen**
- File: `mobile/app/(auth)/sign-up.tsx`
- Same container and visual language as sign-in screen (`bg-zinc-950 flex-1 px-6`). Wordmark at top (same as sign-in, `mb-10`). No 4-button stack — sign-up is always method-specific (user selected their method on sign-in screen).
- **Email/password path:** Email field + password field per §4 email field spec. Password confirmation field: same styling, `autoComplete="new-password"`. Submit button: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center mt-4`. In-button spinner per §4 pattern.
- **SMS path:** Phone input bottom sheet flow identical to sign-in (reuse component). After OTP verified: show backup email field in the same sheet before proceeding — `text-zinc-500 text-xs mb-1` label "Recovery email" + email `TextInput` per §4 spec. Backup email is not verified at registration (async verification email sent later).
- Auth captures UID only — profile data written in Onboarding (Spec 94), not here.
- "Already have an account?" link: `text-zinc-500 text-sm text-center mt-6` with `text-amber-500` "Sign in" tap target → `router.replace('/(auth)/sign-in')`.

**Step 6 — AuthGate extension**
- File: `mobile/app/_layout.tsx` (extend existing two-step `useRootNavigationState` guard)
- After auth check: fetch `/api/user-profile`. Five outcomes:
  - 200 + `onboarding_complete = true` → proceed to app (subscription gate in `(app)/_layout.tsx` takes over — see Spec 96)
  - 200 + `onboarding_complete = false` → redirect `/(onboarding)/profession`
  - 404 (no profile yet) → redirect `/(onboarding)/profession` (new user)
  - 403 (`account_deleted_at` set, within 30 days) → show reactivation modal (§3.6). The 403 body is `{ error, account_deleted_at, days_remaining }` per Spec 95 §9 Step 2 — use `days_remaining` to populate the modal copy.
  - Network failure (after 3 retries with exponential backoff: 1s, 2s, 4s) → show full-screen error with "Try again" button; do not default to onboarding or full access

**Gate architecture (Expo Router — three-layer pattern):**
The three gates implement as nested layouts in Expo Router's file-based routing:
```
_layout.tsx          ← Layer 1: AuthGate (this spec)
                       Redirects unauthenticated → /(auth)/
                       Redirects onboarding-incomplete → /(onboarding)/
                       Shows reactivation modal for 403 (deleted account)
(app)/_layout.tsx    ← Layer 2: Subscription gate (Spec 96)
                       Runs only after AuthGate passes (onboarding_complete = true)
                       Shows PaywallScreen for 'expired'
                       Signs out + redirects for 'cancelled_pending_deletion'
(onboarding)/        ← Layer 3: Onboarding gate
                       Receives only users who AuthGate redirected here
```
The gate order "Auth → Subscription → Onboarding" describes the dependency order in which gates check conditions — not a sequential runtime pipeline. The AuthGate redirects onboarding-incomplete users directly to `(onboarding)/`, bypassing `(app)/_layout.tsx` entirely. The subscription gate in `(app)/_layout.tsx` only runs for users who have `onboarding_complete = true`. This is correct: incomplete users should not hit the subscription gate (they haven't started a trial yet). The `admin_managed` manufacturer case is handled by the AuthGate detecting `account_preset = 'manufacturer' AND onboarding_complete = false` and routing to the holding screen within `(onboarding)/`, never reaching `(app)/_layout.tsx`.

- **Critical:** The AuthGate does NOT enforce subscription status — that check is owned by Spec 96 `(app)/_layout.tsx`. Do not ship a build without Spec 96 fully implemented or every onboarded user will have unguarded access to the feed.

**Step 7 — Account deletion (Firebase side)**
- File: `mobile/app/(app)/settings.tsx` triggers deletion (Spec 97 §3.1 Steps 8–9); this spec owns the Firebase cleanup.
- Order is critical: PATCH `/api/user-profile` must succeed first → then `firebase.auth().signOut()`. If PATCH fails, show error toast and abort — do NOT sign out.
- After sign-out: navigate `/(auth)/sign-in`. Server state is authoritative; no `?deleted=true` URL param needed.

### Testing Gates

- **Unit:** `mobile/__tests__/useAuth.test.ts` — auth state machine: sign-in sets uid; sign-out clears store + does not clear MMKV; `onAuthStateChanged(null)` fires sign-out path (covers forced sign-out); `auth/account-exists-with-different-credential` triggers linking modal; AuthGate 404 redirects to onboarding; AuthGate fetch failure shows error screen.
- **Maestro:** `mobile/maestro/auth.yaml` — launch → sign in with email → verify feed visible → sign out → verify sign-in screen renders.

---

## 6. Operating Boundaries

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
