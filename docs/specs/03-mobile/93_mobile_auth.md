# Spec 93 — Mobile Authentication

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol), Spec 94 (Onboarding), Spec 96 (Subscription), Spec 113 (Supabase Infrastructure §3 EAS key contract), Spec 13 (Authentication — server-side verification, out of scope here per §7)
**Rewrite context:** Phase S3 of the Supabase migration program (`.cursor/active_task.md` v2.1) — replaces `@react-native-firebase/auth` with `supabase-js`. Cited decisions (`D<n>`/`G<n>`) are from that program plan, dated 2026-07-18.

## 1. Goal & User Story

**Goal:** Provide a secure, frictionless authentication layer that supports four sign-in methods, persists sessions indefinitely, and bridges the mobile app and web platform via a shared Supabase Auth (GoTrue) identity.
**User Story:** As a tradesperson discovering the app from the App Store, I need to sign up in under 30 seconds using my phone number or Google account, stay signed in across sessions, and have my preferences restore automatically when I switch phones.

## 2. Technical Architecture (Expo / NativeWind)

**Stack:** `@supabase/supabase-js` (Decision D1 — `supabase-js` for AUTH ONLY; the pipeline/admin keep raw `pg`). Unlike `@react-native-firebase/auth`, `supabase-js` is a JS-only client with no native module and no automatic Keychain/Keystore persistence — session storage, URL-detection suppression, and refresh-lifecycle wiring are all explicit app code (this section). `expo-apple-authentication` (native, iOS-only, unchanged) and `@react-native-google-signin/google-signin` (native, replaces `expo-auth-session`'s web-based implicit flow) supply provider ID tokens; `supabase-js` verifies and exchanges them. No reCAPTCHA WebView.

### 2.1 Client factory — `mobile/src/lib/supabase.ts`

```typescript
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2, §5 Step 1
// Env/key contract: docs/specs/00-architecture/113_supabase_infrastructure.md §3
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing — ' +
    'check the active EAS build profile env block (Spec 113 §3).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Mandatory on native (Decision D7, 2026-07-18 program plan). Supabase's
    // default URL-based session detection assumes a browser location bar —
    // React Native has none. Leaving this at its default `true` makes the
    // client probe `window.location` during init, which is undefined on
    // native and produces a crash/hang before the client finishes
    // constructing (§6 Known Failure Modes).
    detectSessionInUrl: false,
    // Serializes concurrent auth operations (refresh, sign-in, sign-out)
    // across the JS context so two screens racing a 401-triggered refresh
    // don't produce two competing writes. NOTE: auth-js v3 removes `lock` /
    // `lockAcquireTimeout` in favor of built-in lockless coordination — this
    // is NOT a permanent API; re-verify against the v3 migration guide
    // before the next auth-js major version bump.
    lock: processLock,
  },
});

// React Native has no window-focus/blur events. Without this, auth-js's
// background refresh timer keeps ticking while the app is backgrounded
// (battery drain) and can race a stale refresh against the next foreground
// launch. Wiring refresh to AppState is Supabase's documented requirement
// for React Native, not an optimization — register exactly once, at module
// load, not inside a component.
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
```

**Storage adapter — OPTIONAL upgrade, not required for launch:** the adapter above stores the full session object (access token + refresh token + user metadata, serialized) in plain `AsyncStorage`, which is unencrypted on-device storage. `expo-secure-store` (iOS Keychain / Android Keystore) is **not** a drop-in replacement — SecureStore enforces a hard per-key value limit (2048 bytes on Android Keystore-backed storage), and a serialized Supabase session routinely exceeds that. The documented workaround is a wrap, not a swap: generate a random AES encryption key once, store **only that key** (small, fits SecureStore) in `expo-secure-store`, and use it to encrypt/decrypt the session blob written to `AsyncStorage`. This is a deferred hardening item — AsyncStorage's plaintext-on-disk exposure is judged acceptable at launch (zero users, pre-launch, matches the existing `mmkvPersister` Layer 4a/4b PII posture precedent, Spec 99 §2.1) — not a blocking requirement for Phase 2.2.

### 2.2 Sign-in methods (all four required at launch, unchanged from prior versions of this spec)

| Method | Primary Use Case | Supabase mechanism |
|--------|-----------------|-------|
| Apple Sign-In | iOS users | Required by App Store if any social login offered. `expo-apple-authentication` native token → `supabase.auth.signInWithIdToken({ provider: 'apple', ... })` |
| Google Sign-In | Android + web users | `@react-native-google-signin/google-signin` native token → `supabase.auth.signInWithIdToken({ provider: 'google', ... })` |
| Phone / SMS OTP | Tradespeople without Google | `supabase.auth.signInWithOtp({ phone })` + `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` |
| Email + Password | All users | `supabase.auth.signInWithPassword()` / `signUp()` |

**Screen location:** `mobile/app/(auth)/sign-in.tsx`, `mobile/app/(auth)/sign-up.tsx` — unchanged.

**Sign-in screen button order (Apple guideline compliance) — unchanged:**
```
[ Sign in with Apple    ]   ← required equal prominence
[ Sign in with Google   ]
─────────────────────────
[ Continue with Phone   ]
[ Continue with Email   ]
```

### 2.3 Nonce rule (Google + Apple — same rule, both providers)

Both native sign-in SDKs (Apple's and Google's) receive the **SHA-256 hash** of a locally generated random nonce; Supabase receives the **raw (unhashed) nonce** and recomputes the hash server-side to verify it matches the one embedded in the ID token's `nonce` claim. This is the identical shape to the pre-rewrite Firebase nonce contract (§5 Step 4) — only the verifying party changes from `auth.AppleAuthProvider.credential(idToken, rawNonce)` to `supabase.auth.signInWithIdToken({ provider, token, nonce: rawNonce })`. A mismatch (wrong half sent to the wrong party, algorithm swap) makes Supabase reject the credential with an `AuthApiError` — the same failure class as Firebase's `auth/invalid-credential`, re-mapped in `supabaseErrors.ts` (§5 Step 1). `mobile/src/lib/appleAuth.ts`'s `prepareAppleNonce()` is **unchanged** — it is a pure, provider-agnostic nonce-pair generator; only which call receives which half changes (§5 Step 4).

## 3. Behavioral Contract

### 3.1 Session Persistence

Sessions persist indefinitely until explicit sign-out. Supabase access tokens refresh automatically in the background via `autoRefreshToken` + the AppState wiring in §2.1 — no re-authentication prompts. The only **user-initiated** sign-out events are:

- User taps "Sign Out" in Settings
- User completes account deletion

**Forced sign-out (Supabase-initiated):** the following events invalidate the session, firing the `onAuthStateChange` listener (§5 Step 2) with a `null` session. The app handles these identically to a user-initiated sign-out — redirect to `/(auth)/sign-in`:
- **User changes their password (any device).** GoTrue's password-change endpoint revokes the account's *other* refresh tokens as a session-fixation guard — the device where the change was made keeps its session; every other device's next refresh/verification fails. **Verify this against the pinned `auth-js` version at Phase 2.2 implementation** — it is the mobile-side observable effect of a documented GoTrue security behavior, not app code to write.
- **Admin disables the account** (Supabase dashboard / Admin API `banUser`/`deleteUser` — server-side, Spec 13 concern, out of scope here §7).
- **Project-wide token revocation** (security incident) — rotating the project's asymmetric JWT signing keys (D7) invalidates every previously issued access token at its next verification.

In all forced sign-out cases the user sees the sign-in screen with no error message (same experience as a voluntary sign-out). The app does not distinguish the reason — this is unchanged from the Firebase version.

**Multiple devices:** the same Supabase account may be active on multiple devices simultaneously. No single-session enforcement.

**New device / reinstall:** user preferences (`trade_slug`, `radius_km`, `location_mode`, `home_base_lat/lng`, `default_tab`, `notification_prefs`) are stored server-side in `user_profiles`. On first launch after sign-in on a new device, the app fetches `user_profiles` and hydrates the Zustand `filterStore` — the user never notices they changed devices. Unchanged from prior versions.

### 3.2 Account Linking

**This section's mechanism changed materially from the Firebase version; the consent-first UX contract is preserved.**

Supabase Auth supports two linking postures, set as a dashboard project setting: **Automatic Linking** (default — a sign-in with a new provider silently merges into an existing user if the email matches and is verified on both sides, no user action) and **Manual Linking** (opt-in — a conflicting sign-in is rejected, and the already-authenticated user must explicitly call `supabase.auth.linkIdentity()` to attach a new provider). Buildo's dashboard is configured for **Manual Linking**, matching the original spec's requirement that merges never happen silently.

**Required error handling flow:**
```
User taps "Sign in with Google" with email that already has a password account
  → supabase.auth.signInWithIdToken() rejects (AuthApiError — see §5 Step 1
     supabaseErrors.ts mapping; GoTrue returns an `email_exists`-class code)
  → App catches error, shows modal:
      "An account with this email already exists.
       Sign in with your original method, then link Google from there."
  → User signs in with their original method (email/password, Apple, or phone)
  → App calls supabase.auth.linkIdentity({ provider: 'google' }) (OAuth) or
    supabase.auth.linkIdentity({ token: idToken, provider: 'google' }) (native
    ID-token path — the method the mobile app uses) while the original
    session is active
  → Identity linked — the account now has both providers
```

For Apple Sign-In and phone, the same pattern applies (`linkIdentity({ token, provider: 'apple' })`; phone is attached via `supabase.auth.updateUser({ phone })` + `verifyOtp({ ..., type: 'phone_change' })` since phone is not an OIDC identity). If the user cancels the linking flow, they remain authenticated with their original method — unchanged from before.

**Dropped from the Firebase version — flagged, not silently lost:** Firebase's `fetchSignInMethodsForEmail()` let the app name the *specific* existing provider in the modal copy (`"Sign in with Google to link your Apple account"`). Supabase Auth has **no equivalent API** — this is a deliberate anti-account-enumeration design choice (an unauthenticated caller cannot query which providers exist for an arbitrary email). The rewritten copy above names only the *attempted* method and directs the user back to the standard sign-in stack to try their other method directly, rather than deep-linking to one named button. See §6 Known Failure Modes.

### 3.3 SMS Account Recovery

SMS users must provide a backup email address during onboarding (Spec 94 §3.3). This is the recovery path if they lose or change their phone number. Without a backup email, account recovery requires contacting Buildo support. Unchanged from the Firebase version — this is a Buildo-side `user_profiles` field, not an Auth-provider mechanism, and carries over untouched.

### 3.4 Sign-Out Behaviour

Tapping "Sign Out" in Settings:
- Calls `supabase.auth.signOut()`
- Clears the Supabase session (access token + refresh token, both storage layers)
- **Resets** every peer Zustand store via `clearLocalSessionState()` (§5 Step 2): `usePaywallStore`, `useFilterStore`, `useNotificationStore`, `useOnboardingStore`, `useUserProfileStore`, `useFlightBoardSeenStore`, plus `queryClient.clear()`, `mmkvPersister.removeClient()`, `Sentry.setUser(null)`, and the PostHog `resetIdentity()` — so no stale data or user attribution is visible if a different user signs in on the same device (Spec 99 §B5 PIPEDA). This is a superset of the SDK-agnostic reset fan-out the prior spec text described — the mechanism (`auth().signOut()` → `supabase.auth.signOut()`) is the only part that changed.
- Redirects to sign-in screen

On next sign-in, `user_profiles` fetch overwrites local state cleanly. The reset + server hydration ensures stale data is never presented to a different user. Unchanged from the Firebase version.

### 3.5 Offline Behaviour

If the device has no internet connection:
- Already-authenticated users: app continues normally. Feed shows cached MMKV data with staleness banner: `"Offline — last updated [time]"` (per Spec 91 offline resilience pattern).
- Unauthenticated users attempting sign-in: show retry prompt. Supabase Auth cannot authenticate offline.

If Supabase Auth is unreachable at sign-in: show retry option. Already-authenticated users are unaffected (session cached locally by the storage adapter in §2.1; `autoRefreshToken` retries on its own schedule once connectivity returns). Unchanged in substance from the Firebase version.

### 3.6 Account Deletion

**Initiated from:** Settings → Account Actions → Delete Account (Spec 97 §3)

**Flow:**
1. CSV export offer (Spec 97 §3.1 Step 1).
2. Confirmation modal (Spec 97 §3.1 Step 2).
3. On confirm:
   - `POST /api/user-profile/delete` — **must succeed before proceeding** (Spec 95 Step 3a). This dedicated endpoint atomically sets `account_deleted_at`, `subscription_status: 'cancelled_pending_deletion'`, cancels the Stripe subscription if applicable, and invalidates the user's active Supabase sessions server-side (Supabase Admin API — Spec 13 concern, out of scope here §7; replaces `admin.auth().revokeRefreshTokens(uid)`). **Do NOT use the general `PATCH /api/user-profile`** — `subscription_status` and `account_deleted_at` are server-only fields blocked by the PATCH whitelist.
   - If POST fails: show error toast, do NOT sign out.
   - On POST success: `supabase.auth.signOut()` → redirect to `/(auth)/sign-in`.
4. **30-day recovery window:** on sign-in, the AuthGate fetches `/api/user-profile`. If the account is in the deletion window, the server returns `403` with `{ error: "Account scheduled for deletion.", account_deleted_at: "<ISO>", days_remaining: <N> }` (Spec 95 §9 Step 2). The AuthGate shows a reactivation modal before proceeding:
   ```
   "Welcome back. Your account is scheduled for deletion on [date].
    Reactivate to keep your account?"
    [ Reactivate ] [ Sign Out ]
   ```
   On reactivate: `POST /api/user-profile/reactivate` (Spec 95 Step 3b) — sets `account_deleted_at = null` and `subscription_status` to the restored value. Server state is authoritative.
5. **`days_remaining = 0` edge case:** CEIL(30 - 30) = 0. The reactivation modal shows "Your account is scheduled for deletion today." (not "0 days left"). `POST /api/user-profile/reactivate` returns 400 if the hard-delete window has passed. If `days_remaining = 0`, the modal still offers reactivation — hard delete runs via the daily pg_cron sweep (D8 §8.4 — replaces the never-built Cloud Function sweep referenced by the pre-rewrite version of this spec), not in real-time, so the window is still open until the sweep runs.
6. After 30 days: hard delete — the Supabase Auth user record is removed (Admin API, Spec 13 concern), `user_profiles` row deleted (Spec 97 §3.3).

**PIPEDA compliance:** CSV export must include all personally identifiable fields stored in `user_profiles`. Data not retained beyond the 30-day window. Unchanged from the Firebase version.

## 4. Design & Interface

The visual design and component-level layout are **unaffected by the SDK swap** — the four-method button stack, its styling, and its interaction patterns are Buildo's own UI, not Firebase- or Supabase-specific. This section carries over unchanged except where noted.

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
- Error state (rate-limited — GoTrue's `over_sms_send_rate_limit` code, §5 Step 1): `text-red-400 text-xs text-center mt-2` "Too many attempts. Try again in a few minutes."

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
- **Wrong-code error state:** when `verifyOtp()` fails (`invalid_credentials`/`otp_expired`-class error), render `text-red-400 text-xs text-center mt-2` "Incorrect code — try again." Apply a `borderColor: '#f87171'` (red-400) override to all cells via `cellStyle` until the user starts re-entering digits.

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
- Sign-in / sign-up **success**: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` from `expo-haptics` — fires immediately after the Supabase auth call resolves and before navigation.
- Sign-in / sign-up **failure**: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)` — fires on any auth error (wrong password, rate-limited, etc.) before showing the error message.

---

### Account Linking Bottom Sheet

When a linking-conflict error is caught (§3.2 — GoTrue rejects with an `email_exists`-class `AuthApiError` under Manual Linking):

- `@gorhom/bottom-sheet` at `snapPoints={['50%']}` · `keyboardBehavior="interactive"` (sheet moves with keyboard if the user needs to re-enter credentials) · `<BottomSheetView>` as direct child (v5 requirement)
- `<Link2 size={24} color="#f59e0b" />` from `lucide-react-native` — centred, `mb-3`
- Headline: `text-zinc-100 text-base font-bold text-center mb-2` "Email already registered"
- Body: `text-zinc-400 text-sm text-center mb-6` — "An account with this email already exists. Sign in with your original method, then link your {newMethod} account from there."
- Primary: `bg-amber-500 active:bg-amber-600 rounded-2xl py-3.5 mx-4 w-full items-center` + `text-zinc-950 font-semibold text-sm` "Back to sign in"
- Secondary: `text-zinc-500 text-sm text-center mt-3` "Cancel" — closes sheet, leaves user authenticated with original method (if one exists in-session) or on the sign-in screen

**`{newMethod}` is derivable client-side** — it's simply whichever button the user just tapped. **`{existingMethod}` is deliberately NOT shown** (§3.2) — Supabase Auth has no `fetchSignInMethodsForEmail` equivalent by design (anti-account-enumeration). The primary action returns the user to the standard sign-in stack rather than deep-linking to one named button; they pick their original method themselves.

## 5. Implementation

### Cross-Spec Build Order

This spec is step 2 of 5. **Spec 95 DB migration and `/api/user-profile` route must exist first** — the AuthGate reads `onboarding_complete` from `user_profiles`.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 0 — Install / remove dependencies**

Remove (RNFirebase per G6 — 100% Expo push means auth's removal does not touch push transport):
```bash
cd mobile
npm uninstall @react-native-firebase/app @react-native-firebase/auth
```
`firebase` (JS SDK) and `expo-firebase-recaptcha` were never installed (prior spec text) and remain absent.

Install:
```bash
npm install @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage @react-native-google-signin/google-signin
```
`expo-apple-authentication`, `expo-crypto` (nonce hashing, §2.3), `input-otp-native`, `react-native-international-phone-number`, `@sentry/react-native` are unchanged from the prior install. `expo-auth-session` is no longer required for the Google flow specifically (the native `signInWithIdToken` path replaces its web-based implicit-grant usage in `sign-in.tsx`) — leave the removal decision to Phase 2.2 if any other screen still imports it (verify with a repo-wide reference check before uninstalling; do not remove blind).

**`app.json` plugin changes** (Decision G6 — exact keep/remove split, binding):

REMOVE from the `plugins` array:
```json
"@react-native-firebase/app",
"@react-native-firebase/auth"
```
REMOVE the Android `intentFilters` entry using the Google reverse-client-ID scheme (`com.googleusercontent.apps.<...>`) — superseded by the new Google Sign-In config plugin, which manages its own URL scheme.

ADD:
```json
"@react-native-google-signin/google-signin",
"expo-apple-authentication"
```
(`expo-apple-authentication`'s plugin entry is unchanged from before — listed here only to show it survives the edit untouched.)

**KEEP — exactly, per G6 — do not touch:**
```json
"android": { "googleServicesFile": "./google-services.json", ... },
"ios":     { "googleServicesFile": "./GoogleService-Info.plist", ... }
```
plus the native `android/build.gradle:9` and `android/app/build.gradle:186` google-services Gradle wiring, plus the FCM manifest metadata. **Rationale (G6): FCM remains Android's physical push transport under Expo push (`getExpoPushTokenAsync` → Expo Push API → FCM), completely independent of whether `@react-native-firebase/*` npm packages are installed.** Removing these files breaks push delivery on Android even though they look like "Firebase leftovers" — see §6 Known Failure Modes. `mobile/src/lib/pushTokens.ts` requires **zero changes** — it already talks to `fetchWithAuth`/Expo's notification API, never Firebase.

**`tailwind.config.js`** — unchanged (`tailwindcss-safe-area` plugin, unrelated to auth).

**Native-mod audit (Phase 2.1, binding — before any `expo prebuild --clean`):** diff `android/` against a clean `expo prebuild` output and convert any manual native changes to config plugins first. `prebuild --clean` is destructive; running it before this audit can silently wipe unmanaged native edits (§6 Known Failure Modes).

---

**Step 1 — Supabase client config + error mapping**

- File: `mobile/src/lib/supabase.ts` — see §2.1 for the full client factory.
- File: `mobile/src/lib/supabaseErrors.ts` (renamed from `firebaseErrors.ts`) — maps GoTrue `AuthApiError.code` values to the same user-facing copy contract as before. The exact code taxonomy differs from Firebase's `auth/*` codes; **verify the mapping below against the pinned `@supabase/supabase-js` version's published error-code reference at Phase 2.2 implementation** (GoTrue's error codes are documented but this spec is not the source of truth for the live list):
  ```typescript
  // SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §3.2, §4
  export function mapSupabaseError(code: string | undefined): string {
    switch (code) {
      case 'invalid_credentials':
        return 'Incorrect email or password.';
      case 'user_not_found':
        return 'No account found with that email.';
      case 'email_exists':
        return 'That email is already registered.';
      case 'weak_password':
        return 'Password must be at least 6 characters.';
      case 'email_address_invalid':
        return 'That email address is not valid.';
      case 'over_request_rate_limit':
      case 'over_sms_send_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Too many attempts. Try again in a few minutes.';
      case 'otp_expired':
        return 'That code has expired. Request a new one.';
      case 'validation_failed':
        return 'That phone number is not valid.';
      default:
        return 'Sign-in failed. Please try again.';
    }
  }

  export function isAccountLinkingError(code: string | undefined): boolean {
    return code === 'email_exists';
  }
  ```
  User-cancelled native flows (Apple/Google cancel) resolve as a rejected promise from the *provider* SDK, not a Supabase error — handle that at the call site (empty string, no error message), same as the Firebase version's `auth/popup-closed-by-user` branch.
- **No env vars needed beyond `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (Spec 113 §3). The previous `EXPO_PUBLIC_FIREBASE_*` vars and the native `google-services.json`/`GoogleService-Info.plist` Firebase-SDK-config role are gone — those files are kept (§0 above) but now serve only the FCM/push-transport role, not Firebase Auth init. EAS still handles them as file secrets for the push-transport purpose (`eas secret:create --type file --name GOOGLE_SERVICES_JSON ...`) — unchanged mechanism, different reason.
- **`@react-native-firebase/app` and `@react-native-firebase/auth` MUST NOT appear in `mobile/package.json`** after this step.

---

**Step 2 — User session store**
- File: `mobile/src/store/authStore.ts`
- Zustand v5 store: `{ uid, email, displayName, isLoading }` + `signOut()` action. `uid` now holds the Supabase `auth.users.id` UUID string (D6) — the field name is kept as `uid` to minimize churn across consumers that only need an opaque per-user string (`Sentry.setUser({ id: uid })`, `identifyUser(uid)`, PostHog distinctId — MUST COVER item satisfied: `analytics.ts` itself needs **zero code changes**, it already just consumes whatever string it's handed). The bearer-token field is renamed `idToken` → `accessToken` to match Supabase's terminology (`session.access_token`) and avoid implying a Firebase ID-token refresh model that no longer applies — this rename propagates to `apiClient.ts` and all Jest mocks (§ Testing Gates).
- `supabase.auth.onAuthStateChange((event, session) => { ... })` listener writes `uid`/`email`/`displayName`/`accessToken` into the store. Unlike Firebase's `onAuthStateChanged` + separate async `getIdToken()` chain, `session.access_token` arrives **synchronously in the same callback** — the old code's stale-resolution race guard (a second listener fire's `getIdToken()` resolving after a first fire's, clobbering the wrong user) is **structurally eliminated**, not just no-longer-needed: there is no second async step for a later fire to race against. This is a genuine simplification, not a dropped contract — the race it guarded against was intrinsic to Firebase's two-step (event, then async token fetch) API shape.
- `session.user.email` maps directly. `displayName` sources from `session.user.user_metadata?.full_name` (GoTrue populates `user_metadata` from the OIDC token's profile claims on first Google/Apple sign-in; email/phone sign-ups have no `full_name` at this stage, same as the Firebase version — display name was always null until Onboarding in that path too).
- `signOut()`: (1) calls `supabase.auth.signOut()`; (2) the `clearLocalSessionState()` fan-out (Spec 99 §B5) resets every peer Zustand store — `filterStore.reset()`, `userProfileStore.reset()`, `paywallStore.reset()`, `notificationStore.reset()`, `onboardingStore.reset()`, `flightBoardSeenStore.reset()` — plus `queryClient.clear()`, `mmkvPersister.removeClient()`, `Sentry.setUser(null)`, and `resetIdentity()` (PostHog); (3) resets this store. Same fan-out as the Firebase version, called from the same two places (`signOut()` and the listener's null-session branch) — only the auth call at step (1) changed.
- **`paywallStore.reset()` is required in sign-out** (unchanged rule, Spec 99 §3.4/§9.19/§B5) — without it, a user who dismissed the paywall and then signed out on a shared device would leave `dismissed: true` in memory, causing the next user to start in inline blur mode.
- The module-scoped `lastKnownUid` staleness guard (cold-boot first-fire vs genuine UID change, gating the `['user-profile']` cache-invalidation telemetry) is **preserved as-is** — it is not Firebase-specific; it exists to distinguish "first ever fire" from "a different user signed in on this device," which applies identically under `onAuthStateChange`'s `INITIAL_SESSION`/`SIGNED_IN` events. Key off `session.user.id` instead of `firebaseUser.uid`.

---

**Step 3 — Auth route group layout**
- File: `mobile/app/(auth)/_layout.tsx`
- Stack navigator wrapping sign-in and sign-up screens. Unchanged.

**Step 4 — Sign-in screen**
- File: `mobile/app/(auth)/sign-in.tsx`
- **Layout per §4:** unchanged.
- **Apple (iOS only):** `{Platform.OS === 'ios' && <AppleAuthenticationButton>}` — unchanged component usage. **Nonce (§2.3):** call `prepareAppleNonce()` from `mobile/src/lib/appleAuth.ts` (unchanged file) to get `{ rawNonce, hashedNonce }`. Pass `nonce: hashedNonce` to `AppleAuthentication.signInAsync` (Apple receives the hash). Exchange the resulting `identityToken` via `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })` (Supabase receives the raw value and recomputes the hash). Mismatch produces an `AuthApiError` mapped through `supabaseErrors.ts`.
- **Google:** custom `<Pressable>` per §4. Configure once at module load: `GoogleSignin.configure({ webClientId: '<Supabase-dashboard Google provider web client ID>' })`. On tap: `await GoogleSignin.hasPlayServices()`, then obtain the native ID token — **apply the same nonce rule as Apple (§2.3)**: generate a fresh `{ rawNonce, hashedNonce }` pair, pass the hashed nonce into the Google sign-in call, then `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce })`. **Verify the exact nonce-parameter name on `GoogleSignin.signIn()`/`.configure()` against the pinned `@react-native-google-signin/google-signin` version via Context7 at Phase 2.2 implementation** (per CLAUDE.md Rule 9) — the parameter has moved between library versions and this spec is not the source of truth for a third-party API surface. In-button spinner per §4 spinner pattern.
- **Phone/SMS:** tapping "Continue with Phone" opens a bottom sheet (`snapPoints={['55%']}`). Phone input per §4 Phone Input spec. On "Send code" tap: `await supabase.auth.signInWithOtp({ phone: e164Number })` — unlike Firebase's `signInWithPhoneNumber`, this returns no confirmation handle; **store the phone number itself** (not an opaque confirmation object) in a ref, since verification takes the phone number directly. Sheet transitions to OTP entry using `input-otp-native` 6-cell spec per §4 OTP Entry. On 6-digit completion: `await supabase.auth.verifyOtp({ phone: e164Number, token: code, type: 'sms' })` resolves to a session on success. Handle rate-limit errors (`over_sms_send_rate_limit`) with the same `text-red-400 text-xs` message + 30s resend lockout timer as before. **No reCAPTCHA widget is mounted** (unchanged), but the underlying bot-prevention posture is materially different — see §6 Known Failure Modes (Play Integrity/APN silent-push had no Supabase equivalent; this is a Firebase-specific mechanism being dropped, expected under this rewrite, not flagged as a lost Buildo contract).
- **Email:** tapping "Continue with Email" navigates to `/(auth)/sign-in?method=email` or opens an inline form below the button stack. Fields per §4 email field spec. Submit calls `supabase.auth.signInWithPassword({ email, password })`.
- **Account linking:** catch an `email_exists`-class `AuthApiError` (`isAccountLinkingError()`, §5 Step 1) on all four paths. Show bottom sheet per §4 Account Linking Bottom Sheet spec (§3.2 — no named existing-provider). On successful sign-in via the user's own choice of original method, call `supabase.auth.linkIdentity({ token: pendingIdToken, provider: pendingProvider })` (OAuth-token path) to attach the previously attempted identity. On link success: close sheet, proceed to AuthGate.

**Step 5 — Sign-up screen**
- File: `mobile/app/(auth)/sign-up.tsx`
- Same container and visual language as sign-in screen (`bg-zinc-950 flex-1 px-6`). Wordmark at top (same as sign-in, `mb-10`). No 4-button stack — sign-up is always method-specific (user selected their method on sign-in screen).
- **Email/password path:** email field + password field per §4 email field spec. Password confirmation field: same styling, `autoComplete="new-password"`. Submit calls `supabase.auth.signUp({ email, password })`. Submit button: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center mt-4`. In-button spinner per §4 pattern.
- **SMS path:** phone input bottom sheet flow identical to sign-in (reuse component; `signInWithOtp`/`verifyOtp` create a new user automatically if the phone number is unrecognized — no separate "sign-up" call for phone). After OTP verified: show backup email field in the same sheet before proceeding — `text-zinc-500 text-xs mb-1` label "Recovery email" + email `TextInput` per §4 spec. Backup email is a Buildo `user_profiles` field (Spec 95), not a Supabase Auth identity — not verified at registration.
- Auth captures identity only — profile data written in Onboarding (Spec 94), not here. Unchanged.
- "Already have an account?" link: `text-zinc-500 text-sm text-center mt-6` with `text-amber-500` "Sign in" tap target → `router.replace('/(auth)/sign-in')`.

**Step 6 — AuthGate extension**
- File: `mobile/app/_layout.tsx` (extend existing two-step `useRootNavigationState` guard)
- After auth check: fetch `/api/user-profile`. Five outcomes — **unchanged from the Firebase version**, this logic is server-driven and SDK-agnostic:
  - 200 + `onboarding_complete = true` → proceed to app (subscription gate in `(app)/_layout.tsx` takes over — see Spec 96)
  - 200 + `onboarding_complete = false` → redirect `/(onboarding)/profession`
  - 404 (no profile yet) → redirect `/(onboarding)/profession` (new user)
  - 403 (`account_deleted_at` set, within 30 days) → show reactivation modal (§3.6)
  - Network failure (after 3 retries, exponential backoff: 1s, 2s, 4s) → full-screen error with "Try again" button; do not default to onboarding or full access

**Gate architecture (Expo Router — three-layer pattern) — unchanged, see prior spec text for the full nested-layout description.** The AuthGate does NOT enforce subscription status — that check is owned by Spec 96 `(app)/_layout.tsx`.

**Step 7 — Account deletion (Supabase side)**
- File: `mobile/app/(app)/settings.tsx` triggers deletion (Spec 97 §3.1 Steps 8–9); this spec owns the client-side session teardown.
- Order is critical: the deletion request (§3.6 Step 3) must succeed first → then `supabase.auth.signOut()`. If the request fails, show error toast and abort — do NOT sign out.
- After sign-out: navigate `/(auth)/sign-in`. Server state is authoritative; no `?deleted=true` URL param needed.

### Testing Gates

- **Unit (7 files, `mobile/__tests__/`):**
  - `useAuth.test.ts` — auth state machine: sign-in sets `uid`/`accessToken`; sign-out clears store + does not clear MMKV filter/notification caches beyond the §B5 reset; `onAuthStateChange` firing with a `null` session takes the forced-signout path; an `email_exists`-class error triggers the linking modal; phone flow `signInWithOtp` → `verifyOtp` resolves to a session and `setAuth` is called; `otp_expired` maps through `mapSupabaseError` and triggers error haptic; Apple/Google Sign-In nonce: same raw value passed to the provider SDK's hashed-nonce param and to `supabase.auth.signInWithIdToken({ ..., nonce: rawNonce })`; AuthGate 404 redirects to onboarding; AuthGate fetch failure shows error screen.
    Mock surface: `jest.mock('@/lib/supabase', ...)` exposing a `supabase.auth` object with `signInWithPassword`/`signUp`/`signInWithIdToken`/`signInWithOtp`/`verifyOtp`/`linkIdentity`/`signOut`/`onAuthStateChange`/`refreshSession` jest mock functions. Do NOT mock `@react-native-firebase/auth` — it is no longer in `package.json`.
  - `appleAuth.test.ts` — `prepareAppleNonce()` unit tests, **unchanged** (the function itself didn't change; kept in the 7-file surface because it's still auth-domain).
  - `apiClient.test.ts` — 401 intercept calls `supabase.auth.refreshSession()` (not `auth().currentUser?.getIdToken(true)`) and retries once; `isRetry` guard still prevents infinite loops.
  - `authGate.test.ts` — the pure `decideAuthGateRoute()` routing matrix, unchanged inputs/outputs (it never touched Firebase directly).
  - `analytics.test.ts` — `identifyUser`/`resetIdentity` contract, unchanged (SDK-agnostic, per §5 Step 2).
  - `stateDebug.prod.test.ts` — dev-only store-logging guard; updated only to the extent its fixture data referenced a Firebase-shaped `uid`.
  - `storeReset.coverage.test.ts` — static source-scan asserting `clearLocalSessionState()` calls all 6 peer-store `reset()`s and is invoked from both `signOut()` and the listener's null-session branch. Update the scan target if `initFirebaseAuthListener` is renamed to `initSupabaseAuthListener` in `authStore.ts` (§5 Step 2) — the test greps the file by function name.
- **Maestro:**
  - `mobile/maestro/auth.yaml` — launch → sign in with email → verify feed visible → sign out → verify sign-in screen renders. Update the header comment's "Requires a test account in Firebase Auth" to reference the Supabase test project; test credentials and flow steps are otherwise unchanged (same testIDs: `email-input`, `password-input`, `email-submit`, `sign-out-button`).
  - `mobile/maestro/sign-up.yaml` — cold launch → sign-up link → unique timestamped email → onboarding landing. Update the header comment's "guarantees a fresh Firebase account per run" to Supabase; flow and testIDs (`sign-up-link`, `signup-header`, `signup-email-input`, etc.) are unchanged.

## 6. Known Failure Modes

- **`detectSessionInUrl` left at its default (`true`) or omitted.** Supabase's default assumes a browser location bar to parse an OAuth/magic-link redirect from. React Native has no `window.location` — the client either throws during construction or hangs waiting on a URL event that never fires. Guard: §2.1's factory sets it explicitly to `false`; this is not optional on native regardless of which sign-in methods are enabled.
- **Nonce mismatch — hashed vs. raw sent to the wrong party.** Both Apple and Google native sign-in expect the **hashed** nonce; Supabase's `signInWithIdToken` expects the **raw** nonce and recomputes the hash itself (§2.3). Swapping which value goes where, reusing a nonce across attempts, or dropping the SHA-256 step produces an opaque `AuthApiError` rejection with no actionable client-side message — the failure looks identical to "wrong credentials." Guard: `prepareAppleNonce()`'s doc comment states the relationship explicitly; the same pairing discipline applies to the Google path (§5 Step 4), which is new with this rewrite (Firebase's Google flow didn't require a nonce at all).
- **Removing `google-services.json`/`GoogleService-Info.plist` "because Firebase is gone."** These files' *auth* role is retired, but their *push-transport* role is not — FCM is still Android's physical delivery mechanism under Expo push (G6), and both platforms' Expo push registration paths can depend on the native project being correctly configured against these files. Deleting them under the assumption that "no more `@react-native-firebase/*` packages means no more need for these" silently breaks push notification delivery, likely without an obvious error at build time. Guard: §5 Step 0's explicit KEEP list; `mobile/src/lib/pushTokens.ts` is unchanged and untouched by this spec precisely because its dependency graph never included Firebase.
- **`expo prebuild --clean` run before the native-mod audit (Phase 2.1).** Continuous prebuild regenerates `android/`/`ios/` from `app.json` + installed config plugins; any manual, unmanaged native edit not captured by a config plugin is silently discarded. Because this rewrite removes two config plugins (`@react-native-firebase/app`, `@react-native-firebase/auth`) and adds two more (`@react-native-google-signin/google-signin`, plus the same `expo-apple-authentication`), a prebuild run before confirming there's no manual native drift can destroy unrelated hand-edits with no warning. Guard: Phase 2.1's diff-against-clean-prebuild step, sequenced strictly before 2.3's `prebuild --clean`.
- **Session not persisting — wrong storage adapter, or SecureStore substituted naively.** Passing `expo-secure-store` directly as the `storage` option (instead of `AsyncStorage`, §2.1) fails silently or errors on write once the serialized session exceeds SecureStore's ~2048-byte per-key limit — a session with a long-lived refresh token and populated `user_metadata` crosses that threshold easily. The failure mode is not "auth doesn't work" but "auth works until the session object grows past the limit, then silently stops persisting across app restarts." Guard: AsyncStorage is the base adapter; SecureStore is only ever used to hold a *small* encryption key in the optional wrap-not-swap upgrade (§2.1), never the session object itself.
- **`lock: processLock` silently dropped or ignored on an `auth-js` v3 upgrade.** `processLock`/`lockAcquireTimeout` are flagged for removal in auth-js v3 in favor of built-in lockless coordination (§2.1). A dependency bump that lands v3 without re-reading the migration notes can leave a dead `lock` option in the client config (harmless) or, more importantly, change the concurrency guarantees the 401-refresh-retry path in `apiClient.ts` implicitly relies on (§5 Step 1's `refreshSession()` note). Guard: treat any `@supabase/supabase-js` major-version bump touching `auth-js` as requiring a re-read of this section, not a routine dependency update.
- **Manual Linking left at the dashboard default (Automatic Linking).** §3.2's consent-first bottom-sheet flow only fires if the Supabase project's Auth settings have **Manual Linking** enabled. This is a dashboard toggle, not code — nothing in the mobile client can detect or enforce it. If left at the default (Automatic Linking), a user attempting a second provider with a matching verified email is silently merged into the existing account with no bottom sheet, no consent step, and no `email_exists` error to catch — a materially different (and, for Buildo's stated UX contract, wrong) behavior that produces no test failure in the mobile test suite, because the mobile code never runs its linking-error branch. Guard: verify the dashboard setting explicitly during Phase 1.2 (web admin OAuth provider configuration) as part of the same authorization step that configures the Google/Apple provider credentials — it is easy to miss because it lives in a different settings panel from the provider toggles.
- **Phone-OTP bot prevention has no device-attestation equivalent.** Firebase's phone auth used Play Integrity (Android) and APN silent push (iOS) to suppress SMS-pumping abuse without a visible CAPTCHA. `supabase-js` has no built-in equivalent — protection is GoTrue's SMS rate limits (`over_sms_send_rate_limit`) plus an optional dashboard-level CAPTCHA (`options.captchaToken`, not configured per D7's Phase 1.2 scope) or SMS-provider-level abuse controls (Twilio/Vonage, outside this spec). This is a Firebase-specific mechanism that has no direct replacement, not a Buildo contract being dropped — but it changes the abuse-cost profile of the phone-OTP path and should inform the D7 rate-limit configuration decision at Phase 1.2, not be assumed covered by this rewrite.

## 7. Operating Boundaries

**Target files:**
- `mobile/app/(auth)/sign-in.tsx`
- `mobile/app/(auth)/sign-up.tsx`
- `mobile/app/(auth)/_layout.tsx`
- `mobile/app/_layout.tsx` (AuthGate — existing two-step `isNavigationReady` guard; listener component rename)
- `mobile/src/lib/supabase.ts` (new — client factory, §2.1)
- `mobile/src/lib/supabaseErrors.ts` (renamed from `firebaseErrors.ts`, §5 Step 1)
- `mobile/src/lib/appleAuth.ts` (owned by this spec; internals unchanged, §2.3)
- `mobile/src/lib/apiClient.ts` (401-refresh-retry call site only, §5 Step 1)
- `mobile/src/store/authStore.ts` (§5 Step 2)
- `mobile/src/constants/contracts.ts` — `CONTRACTS.schema.firebase_uid_max` retired outright (Decision D6): Postgres `user_id`/`admin_uid` columns convert to native `uuid` (fixed-width), which needs no max-length contract. No replacement key is added; this is a deletion, not a rename.
- `mobile/app.json` (plugins array + Android `intentFilters` delta only, §5 Step 0 — the `googleServicesFile` keys and every other existing entry are explicitly out of scope for this edit, G6)
- `mobile/__tests__/{useAuth,apiClient,authGate,analytics,stateDebug.prod,appleAuth,storeReset.coverage}.test.ts`
- `mobile/maestro/{auth,sign-up}.yaml`

**Out of scope:**
- Admin panel auth (`src/middleware.ts`, `src/lib/auth/route-guard.ts`, `src/lib/auth/get-user.ts`, `src/lib/auth/verify-admin.ts`) — governed by `docs/specs/00-architecture/13_authentication.md` (Phase S3 rewrite, same program) and `docs/specs/00_engineering_standards.md` §4
- Server-side JWT verification (`getClaims()`/`getUser()` criteria, DEV_MODE preservation, MFA/break-glass) — Spec 13's domain entirely; this spec covers only the mobile client's session lifecycle
- Supabase Admin API wiring (`revokeRefreshTokens`-equivalent, hard-delete sweep) — backend concern, Spec 13 + the pg_cron/scheduling spec (Phase S4)
- Connection/key contract mechanics (which env var holds which key, EAS profile wiring) — `docs/specs/00-architecture/113_supabase_infrastructure.md` §3 is the single normative source; this spec only consumes `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` per that contract
- Biometric re-authentication — not required
- FCM/Expo push transport internals (`mobile/src/lib/pushTokens.ts`, native `google-services.json`/gradle wiring beyond the plugin-array edit) — G6-governed, unaffected by this rewrite, explicitly not touched

**Cross-spec dependencies:**
- Spec 94 (Onboarding) — auth captures credential only; all profile data captured in onboarding immediately after first sign-in
- Spec 96 (Subscription) — `subscription_status` checked on every launch post-auth
- Spec 97 (Settings/Account Deletion) — triggers the flow this spec's §3.6/Step 7 implement client-side
- Spec 113 (Supabase Infrastructure) §3 — EAS key contract this spec's client factory consumes; §14 Known Failure Modes documents the platform-level failure modes this spec's §6 complements at the client-library level
- Spec 13 (Authentication, Phase S3 rewrite) — server-side verification criteria (`getClaims`/`getUser`), Admin API operations referenced but not defined here
- Decision D6 (2026-07-18 program plan) — `firebase_uid_max` retirement, `user_id`/`admin_uid` → `uuid` conversion this spec's `uid` field now carries
- Decision D7 (2026-07-18 program plan) — auth posture (asymmetric JWT keys, SMS/email rate-limit configuration referenced in §6)
- Decision G6 (2026-07-18 program plan) — mobile push verdict; governs the exact keep/remove native-config split in §5 Step 0
- Spec 90 §4 — native dev build required (Spec 98); Expo Go is not supported (unchanged — `supabase-js` has no native module, but Apple/Google native sign-in SDKs do)
