# Active Task: WF1 — Spec 93: Mobile Authentication
**Status:** Implementation
**Workflow:** WF1 — Genesis
**Domain Mode:** Admin (mobile/ Expo source — non-Maestro)

## Context
* **Goal:** Implement the full mobile authentication layer — 4 sign-in methods (Apple, Google, Phone/SMS, Email+Password), Firebase session persistence via SecureStore, AuthGate with `/api/user-profile` routing, account-linking bottom sheet, and account deletion Firebase side. Steps 1–5 and Step 7 are independent. Step 6 (AuthGate profile-check) is BLOCKED on Spec 95 (`/api/user-profile` must exist first) and is implemented as a stub.
* **Target Spec:** `docs/specs/03-mobile/93_mobile_auth.md`
* **Cross-spec build order:** `Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Sub gate) → Spec 97 (Settings)`
* **Key Files:**
  - `mobile/package.json` — install `firebase` + `expo-firebase-recaptcha` (Step 0b)
  - `mobile/src/lib/firebase.ts` — NEW: Firebase app init + `ExpoSecureStoreAdapter` + `auth` export (Step 1)
  - `mobile/.env.local.example` — NEW: placeholder EXPO_PUBLIC_FIREBASE_* keys (Step 1)
  - `mobile/src/store/authStore.ts` — MODIFY: wire `onAuthStateChanged`, add `isLoading`, rename `signOut()` action, call store resets (Step 2)
  - `mobile/src/store/filterStore.ts` — MODIFY: add `reset()` action (Step 2)
  - `mobile/src/store/notificationStore.ts` — MODIFY: add `reset()` action (Step 2)
  - `mobile/app/(auth)/_layout.tsx` — NEW: Stack navigator for auth group (Step 3)
  - `mobile/app/(auth)/sign-in.tsx` — NEW: replaces `login.tsx` stub (Step 4)
  - `mobile/app/(auth)/sign-up.tsx` — NEW: email/SMS sign-up (Step 5)
  - `mobile/app/_layout.tsx` — MODIFY: fix `/login` → `/(auth)/sign-in`; Step 6 AuthGate stub + profile-check with reactivation modal (Step 6)
  - `mobile/src/components/auth/PhoneInputField.tsx` — NEW: custom CA-first phone input (replaces blocked library)
  - `mobile/src/components/auth/OtpInputField.tsx` — NEW: render-prop wrapper for `input-otp-native`
  - `mobile/src/components/auth/GoogleSignInButton.tsx` — NEW: custom Pressable + Google G SVG
  - `mobile/src/components/auth/AccountLinkingSheet.tsx` — NEW: bottom sheet for `auth/account-exists-with-different-credential`
  - `mobile/__tests__/useAuth.test.ts` — NEW: unit tests
  - `mobile/maestro/auth.yaml` — NEW: Maestro E2E flow

## Technical Implementation
* **New/Modified Components:** `firebase.ts`, `authStore.ts` (extended), `filterStore.ts` (reset), `notificationStore.ts` (reset), `(auth)/_layout.tsx`, `sign-in.tsx`, `sign-up.tsx`, `PhoneInputField`, `OtpInputField`, `GoogleSignInButton`, `AccountLinkingSheet`
* **Data Hooks/Libs:** Firebase JS SDK (`firebase/auth`), `expo-auth-session` (Google OAuth), `expo-apple-authentication` (Apple), `expo-firebase-recaptcha` (SMS reCAPTCHA), `expo-haptics`, `@gorhom/bottom-sheet`
* **Database Impact:** NO — Spec 93 writes no DB rows; user profile creation is Spec 95's responsibility.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes added. All Firebase calls have per-method try-catch per §4 spinner pattern. Each catch path: set error state, fire `Haptics.NotificationFeedbackType.Error`, re-enable button.
* **Unhappy Path Tests:** `useAuth.test.ts` covers: wrong password, `too-many-requests`, `account-exists-with-different-credential`, `onAuthStateChanged(null)` forced sign-out, AuthGate 404 redirects to onboarding, AuthGate network failure shows error screen.
* **logError Mandate:** N/A for mobile source. Mobile error telemetry via `Sentry.captureException()` per domain-admin.md rule 5. Admin console.warn allowed only in fire-and-forget push registration (matches existing `_layout.tsx` pattern).
* **UI Layout:** Mobile-first (Expo). Touch targets `min-h-[52px]` (exceeds Spec 90 §9 44pt minimum). NativeWind utility classes throughout.

---

## Pre-flight Carry-overs (from WF2 Step 0, commit f8298ac)

| Issue | Resolution in this plan |
|-------|------------------------|
| `react-native-international-phone-number` blocked (supply chain attack) | Custom `PhoneInputField` component — Canada-first (🇨🇦 +1 prefix + `TextInput`). Country switching is a v2 enhancement. |
| `input-otp-native@0.6.0` API mismatch: spec documents `pinCount`/`cellStyle`/`focusedCellStyle` — these props do not exist | Correct to render-prop API: `<OTPInput maxLength={6} render={({ slots }) => ...} />`. Encapsulated in `OtpInputField` wrapper. |
| `firebase` npm package not installed | Step 0b installs it before any implementation. |
| `expo-firebase-recaptcha` not installed | Required for `signInWithPhoneNumber` in Expo managed workflow — install in Step 0b. |
| `tailwindcss-safe-area` removed (Tailwind v4-only) | No action — NativeWind preset provides `pb-safe`. |

---

## Execution Plan

### Step 0 (DONE) — Pre-flight dependencies
Committed `f8298ac`. 9 packages installed, `app.json` plugins added, jest transform updated.

---

### Step 0b — Install Firebase SDK and phone auth packages
**Run from `mobile/` directory:**
```bash
npm install firebase
npx expo install expo-firebase-recaptcha
```
- `firebase` (the modular Firebase JS SDK v9+) is NOT yet in `mobile/package.json` — confirmed by grep. All auth logic depends on it.
- `expo-firebase-recaptcha` provides `FirebaseRecaptchaVerifierModal` — required for `signInWithPhoneNumber` in Expo managed workflow. Firebase JS SDK phone auth in React Native requires an `ApplicationVerifier`; this package provides a WebView-based reCAPTCHA that satisfies Firebase's requirement.
- After install: add `expo-firebase-recaptcha` to jest `transformIgnorePatterns` (same pattern as other Expo packages — covered by existing `expo(nent)?` regex ✅).
- `firebase` is a pure JS package — no native code, no transform entry needed ✅.

---

### Step 1 — Firebase client config
**File: `mobile/src/lib/firebase.ts`** (NEW)

```typescript
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2, Step 1
import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Guard against double-initialization in Expo fast refresh cycles.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ExpoSecureStoreAdapter bridges Firebase's AsyncStorage-compatible interface to
// expo-secure-store (which uses different method names: getItemAsync/setItemAsync/deleteItemAsync).
// expo-secure-store does NOT export this adapter — it must be hand-implemented.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ExpoSecureStoreAdapter),
});

export { app };
```

**File: `mobile/.env.local.example`** (NEW)
```
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:abcdef123456
EXPO_PUBLIC_API_URL=https://buildo.app
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```
Add `mobile/.env.local` to `mobile/.gitignore` (keep `.env.local.example` committed, never the real values).

**EAS Secrets to document (not commit):**
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID` / `_ANDROID_CLIENT_ID`

---

### Step 2 — User session store (extend `authStore.ts`, add `reset()` to peer stores)

**File: `mobile/src/store/authStore.ts`** (MODIFY)

The existing store has: `user`, `idToken`, `_hasHydrated`, `setAuth()`, `clearAuth()`, `setHasHydrated()`.

**Required additions:**
1. Import `auth` from `mobile/src/lib/firebase.ts` and wire `onAuthStateChanged` listener.
2. Add `isLoading: boolean` field (true while Firebase resolves initial auth state on cold boot).
3. Rename `clearAuth()` → keep it as internal; add `signOut()` action that:
   - Calls `firebase.auth().signOut()`
   - Calls `useFilterStore.getState().reset()` (see filterStore changes below)
   - Calls `useNotificationStore.getState().reset()` (see notificationStore changes below)
   - Calls `useUserProfileStore.getState().reset()` — **forward dependency**: `userProfileStore` is created in Spec 95. Wire as a TODO stub: `// TODO Spec 95: useUserProfileStore.getState().reset()`
   - Calls `usePaywallStore.getState().clear()` — **forward dependency**: `paywallStore` is created in Spec 96. Wire as a TODO stub: `// TODO Spec 96: usePaywallStore.getState().clear()`
   - Does NOT clear MMKV — per §3.4, MMKV is preserved so a returning user gets fast hydration
   - Resets this store to `{ user: null, idToken: null, isLoading: false }`
4. `onAuthStateChanged` listener fires in `initFirebaseAuthListener()` exported function, called once from `RootLayout` in `_layout.tsx`. On user change: call `setAuth(user, idToken)` or `clearAuth()`.
5. Persist partialize: continue persisting only `user.uid` (no email/displayName/idToken — PIPEDA compliance; these are re-hydrated from Firebase on each cold boot).

**`onAuthStateChanged` placement:** The listener belongs in `RootLayout` (or a dedicated `FirebaseAuthProvider` component inside `RootLayout`) — not inside the Zustand store itself. The store only holds state; the component tree mounts the listener. Wire in `_layout.tsx` `RootLayout` via `useEffect` calling `onAuthStateChanged(auth, (user) => { if (user) { user.getIdToken().then(idToken => setAuth({uid, email, displayName}, idToken)); } else { clearAuth(); } })`.

**File: `mobile/src/store/filterStore.ts`** (MODIFY — add `reset()`)

Add to the `FilterState` interface:
```typescript
reset: () => void;
```
Add to the store implementation:
```typescript
reset: () => set({ radiusKm: 10, tradeSlug: '', homeBaseLocation: null }),
```
Reset values match the store's initial defaults.

**File: `mobile/src/store/notificationStore.ts`** (MODIFY — add `reset()`)

Add to `NotificationState` interface:
```typescript
reset: () => void;
```
Add to store:
```typescript
reset: () => set({ unreadFlightBoard: 0 }),
```

---

### Step 3 — Auth route group layout

**File: `mobile/app/(auth)/_layout.tsx`** (NEW)

```typescript
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Step 3
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

**Also in Step 3:**
- Delete `mobile/app/(auth)/login.tsx` (stub replaced by `sign-in.tsx`)
- Update `mobile/app/_layout.tsx` `AuthGate`: change `router.replace('/login')` → `router.replace('/(auth)/sign-in')`

---

### Step 4 — Sign-in screen

**File: `mobile/app/(auth)/sign-in.tsx`** (NEW — replaces login.tsx)

#### 4a. Skeleton and layout
```typescript
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §4, §5 Step 4
import { View, Text, Platform, Pressable, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { auth } from '@/lib/firebase';
```

Screen container: `bg-zinc-950 flex-1 items-center justify-center px-6`

Wordmark area (`mb-12`):
- Logo: `w-10 h-10 rounded-xl bg-amber-500` square (SVG asset or View placeholder), `mr-3`
- Wordmark: `text-zinc-100 text-2xl font-bold`
- Tagline: `text-zinc-500 text-sm text-center mt-1` — "Leads for the trades."

Button stack with `gap-3`. All buttons: `rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px]`.

Divider row between Google and Phone: `flex-row items-center gap-3 my-1` — `flex-1 h-px bg-zinc-800` flanking `text-zinc-600 text-xs` "or".

#### 4b. Apple Sign-In (iOS only)
```typescript
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';

const handleAppleSignIn = async () => {
  try {
    setAppleLoading(true);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const { identityToken, nonce } = credential;
    if (!identityToken) throw new Error('No identity token from Apple');
    const provider = new OAuthProvider('apple.com');
    const firebaseCredential = provider.credential({ idToken: identityToken, rawNonce: nonce ?? undefined });
    await signInWithCredential(auth, firebaseCredential);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // AuthGate navigates automatically via onAuthStateChanged
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // user cancelled
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    handleAuthError(err);
  } finally {
    setAppleLoading(false);
  }
};

// Render:
{Platform.OS === 'ios' && (
  <AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
    cornerRadius={16}
    style={{ width: '100%', height: 52 }}
    onPress={handleAppleSignIn}
  />
)}
```
`buttonStyle={WHITE}` is correct on dark backgrounds — white bg + black text stands out against `bg-zinc-950`. `BLACK` renders nearly invisible. Do NOT apply NativeWind className to this component.

#### 4c. Google Sign-In
```typescript
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect } from 'react';

const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
});

useEffect(() => {
  if (googleResponse?.type === 'success') {
    const { id_token } = googleResponse.params;
    void (async () => {
      try {
        setGoogleLoading(true);
        const credential = GoogleAuthProvider.credential(id_token);
        await signInWithCredential(auth, credential);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        handleAuthError(err);
      } finally {
        setGoogleLoading(false);
      }
    })();
  } else if (googleResponse?.type === 'error') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setGoogleError('Google sign-in failed. Please try again.');
  }
}, [googleResponse]);
```

Google button custom Pressable (per §4 spec):
- Container: `bg-zinc-900 border border-zinc-700 rounded-2xl py-4 px-5 flex-row items-center justify-center w-full min-h-[52px] active:bg-zinc-800`
- Google `G` SVG logo (coloured, 20×20) with `mr-3`
- Label: `text-zinc-100 text-sm font-semibold` "Sign in with Google"
- Loading: `<ActivityIndicator size="small" color="#71717a" />` replaces label
- `accessibilityRole="button"`

#### 4d. Phone / SMS (Custom PhoneInputField + OtpInputField)
**File: `mobile/src/components/auth/PhoneInputField.tsx`** (NEW)

Custom Canada-first phone input component. `react-native-international-phone-number` is blocked (supply chain attack on `@agnoliaarisian7180/string-argv`). Custom implementation:

```typescript
// Props: value: string, onChange: (formatted: string) => void
// Renders: 🇨🇦 flag + "+1" static prefix | TextInput for 10-digit number
// Layout: bg-zinc-800 rounded-xl overflow-hidden flex-row
//   Left: bg-zinc-700 px-4 py-4 flex-row items-center — "🇨🇦  +1" (Text, text-zinc-100)
//   Divider: w-px bg-zinc-600 (vertical separator)
//   Right: flex-1 TextInput — keyboardType="phone-pad", maxLength=14 (formats as 416-555-1234)
//   Formats input client-side: strip non-digits, group as (XXX) XXX-XXXX
// Full formatted number for Firebase: "+1" + stripped_digits
```

The `PhoneInputField` returns the E.164-format string (`+14165551234`) via `onChange` for passing to `signInWithPhoneNumber`.

**`@gorhom/bottom-sheet` phone sheet** opens on "Continue with Phone" tap:
- `snapPoints={['55%']}`, `keyboardBehavior="interactive"`, `<BottomSheetView>` as direct child (v5 requirement)
- Inside: `PhoneInputField` + "Send code" amber CTA button
- `auth/too-many-requests` error: `text-red-400 text-xs text-center mt-2`

**SMS reCAPTCHA with `expo-firebase-recaptcha`:**
```typescript
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { app } from '@/lib/firebase';

const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);

const handleSendCode = async () => {
  try {
    const phoneProvider = new PhoneAuthProvider(auth);
    const verificationId = await phoneProvider.verifyPhoneNumber(
      phoneNumber,  // E.164 format: +14165551234
      recaptchaVerifier.current!,
    );
    setVerificationId(verificationId);
    // Sheet transitions to OTP entry view
  } catch (err) {
    handleAuthError(err);
  }
};
```

Render in the component tree: `<FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={app.options} />` — the modal appears automatically when `verifyPhoneNumber` triggers reCAPTCHA, then dismisses. It is invisible to the user if invisible reCAPTCHA is configured in Firebase console.

**OTP Entry:**

**File: `mobile/src/components/auth/OtpInputField.tsx`** (NEW)

Wrapper for `input-otp-native` using the **correct render-prop API** (not the `pinCount`/`cellStyle` API documented in the spec §4 — that API does not exist in v0.6.0):

```typescript
import { OTPInput } from 'input-otp-native';
import { View, Text } from 'react-native';

// Props: maxLength: number, onComplete: (code: string) => void, errorMode?: boolean
export function OtpInputField({ maxLength = 6, onComplete, errorMode = false }: OtpInputFieldProps) {
  return (
    <OTPInput
      maxLength={maxLength}
      onComplete={onComplete}
      render={({ slots }) => (
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {slots.map((slot, idx) => (
            <View
              key={idx}
              style={{
                width: 48, height: 56, borderRadius: 12,
                backgroundColor: '#27272a',
                borderWidth: 2,
                borderColor: errorMode ? '#f87171' : (slot.isActive ? '#f59e0b' : '#3f3f46'),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#f4f4f5', fontSize: 24, fontFamily: 'SpaceMono' }}>
                {slot.char ?? (slot.hasFakeCaret ? '|' : '')}
              </Text>
            </View>
          ))}
        </View>
      )}
    />
  );
}
```

`errorMode` prop triggers `borderColor: '#f87171'` (red-400) on all cells. Reset `errorMode` to false on first new digit entered (via `onComplete` not firing until all 6 are entered, but `onChange` can detect any new input).

**OTP verification:**
```typescript
const handleVerifyCode = async (code: string) => {
  try {
    const credential = PhoneAuthProvider.credential(verificationId, code);
    await signInWithCredential(auth, credential);
    Keyboard.dismiss();
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (err) {
    setOtpError(true); // sets errorMode on OtpInputField
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
};
```

Resend CTA: disabled for 30s after initial send. Countdown: `"Resend in {N}s"` → re-enabled as `text-amber-500` "Resend".

#### 4e. Email Sign-In (inline form)
Tapping "Continue with Email" reveals an inline form below the button stack (conditional render, no new screen):
- Email `TextInput`: `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"`, `textContentType="emailAddress"`
- Password `TextInput`: `secureTextEntry`, `autoComplete="current-password"`, `textContentType="password"`
- Both: `bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base mb-3`, `placeholderTextColor="#71717a"`
- Submit button: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center mt-4`
- In-button spinner pattern per §4

```typescript
import { signInWithEmailAndPassword } from 'firebase/auth';

const handleEmailSignIn = async () => {
  try {
    setEmailLoading(true);
    await signInWithEmailAndPassword(auth, email, password);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (err) {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    handleAuthError(err);
  } finally {
    setEmailLoading(false);
  }
};
```

#### 4f. Account-linking bottom sheet
**File: `mobile/src/components/auth/AccountLinkingSheet.tsx`** (NEW)

All four auth paths (Apple, Google, Phone, Email) share the same error handler:

```typescript
const handleAuthError = async (err: unknown) => {
  const code = (err as { code?: string }).code;
  if (code === 'auth/account-exists-with-different-credential') {
    // fetchSignInMethodsForEmail to determine existing provider
    setLinkingError(err); // triggers AccountLinkingSheet
  } else {
    // map other Firebase error codes to user-facing messages
    setErrorMessage(mapFirebaseError(code));
  }
};
```

`AccountLinkingSheet`:
- `@gorhom/bottom-sheet` at `snapPoints={['50%']}`, `keyboardBehavior="interactive"`, `<BottomSheetView>` direct child
- `<Link2 size={24} color="#f59e0b" />` from `lucide-react-native` — centred, `mb-3`
- Headline: `text-zinc-100 text-base font-bold text-center mb-2` — "Email already registered"
- Body: `text-zinc-400 text-sm text-center mb-6` — "An account with this email already exists. Sign in with {existingMethod} to link your {newMethod} account."
- `{existingMethod}` derived via `fetchSignInMethodsForEmail(auth, email)` — returns the first existing provider name
- Primary: `bg-amber-500 rounded-2xl py-3.5 mx-4 items-center` + `text-zinc-950 font-semibold text-sm` — "Sign in with {existingMethod}"
- Secondary: `text-zinc-500 text-sm text-center mt-3` "Cancel"
- On link success: `linkWithCredential(existingUser, pendingCredential)` → close sheet, AuthGate takes over

#### 4g. Sign-in screen navigation footer
`router.push('/(auth)/sign-up')` from "Create account" link: `text-zinc-500 text-sm text-center mt-6` with `text-amber-500` "Sign up" tap target.

---

### Step 5 — Sign-up screen

**File: `mobile/app/(auth)/sign-up.tsx`** (NEW)

Same container and wordmark as sign-in (`bg-zinc-950 flex-1 px-6`). Wordmark `mb-10`. No 4-button stack — sign-up is method-specific.

#### 5a. Email/password path
Accessed via `/(auth)/sign-up?method=email` or directly via link from sign-in email form:
- Email field, password field, confirm-password field (per §4 spec)
- `autoComplete="new-password"`, `textContentType="newPassword"` on password field (triggers iOS strong password suggestion)
- `createUserWithEmailAndPassword(auth, email, password)` on submit
- In-button spinner + haptics pattern
- Auth captures UID only — profile data written in Spec 94 Onboarding, not here

#### 5b. SMS path sign-up
Same phone bottom sheet flow as sign-in (Step 4d). After OTP verified:
- Show backup email field in same sheet before proceeding
- Label: `text-zinc-500 text-xs mb-1` "Recovery email — in case you lose phone access"
- Email `TextInput` per §4 spec (same styling)
- Backup email is NOT verified at registration — async verification email sent later
- On submit: store backup email (POST to Spec 95 API in onboarding — not here)

#### 5c. Navigation footer
"Already have an account?" link: `text-zinc-500 text-sm text-center mt-6` with `text-amber-500` "Sign in" tap target → `router.replace('/(auth)/sign-in')`.

---

### Step 6 — AuthGate extension

**File: `mobile/app/_layout.tsx`** (MODIFY)

**This step is BLOCKED on Spec 95** — `GET /api/user-profile` must exist before the AuthGate can fetch it. Implement a stub that passes through authenticated users until Spec 95 is wired.

#### 6a. Immediate fixes (not blocked):
1. Fix routing: `router.replace('/login')` → `router.replace('/(auth)/sign-in')` in `AuthGate`
2. Wire `onAuthStateChanged` Firebase listener in `RootLayout` (a `useEffect` that calls `onAuthStateChanged(auth, handler)` and returns the unsubscribe)
3. `isLoading` spinner: show a full-screen spinner (`bg-zinc-950 flex-1 items-center justify-center`) while `isLoading || !_hasHydrated` — replaces the previous blank screen during cold-boot auth resolution

#### 6b. Full AuthGate profile-check (BLOCKED on Spec 95):
After Spec 95 ships, the `AuthGate` Step 2 `useEffect` extends from the current binary check (user / no user) to:

```typescript
// After confirming user is authenticated:
useEffect(() => {
  if (!isNavigationReady || !_hasHydrated || !user) return;
  const inAuthGroup = segments[0] === '(auth)';
  if (inAuthGroup) return; // already routing away

  void (async () => {
    setProfileLoading(true);
    let attempts = 0;
    while (attempts < 3) {
      try {
        const profile = await fetchWithAuth<UserProfileApiResponse>('/api/user-profile');
        if (profile.data.onboarding_complete) {
          router.replace('/(app)/');
        } else {
          router.replace('/(onboarding)/profession');
        }
        return;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            router.replace('/(onboarding)/profession');
            return;
          }
          if (err.status === 403) {
            setDeletionModalData(err.body); // { account_deleted_at, days_remaining }
            return;
          }
        }
        attempts++;
        await new Promise(r => setTimeout(r, Math.pow(2, attempts - 1) * 1000)); // 1s, 2s, 4s
      }
    }
    setNetworkError(true); // show full-screen "Try again" error after 3 failed attempts
  })();
}, [isNavigationReady, _hasHydrated, user]);
```

**Five outcomes:**
1. 200 + `onboarding_complete = true` → `router.replace('/(app)/')` (subscription gate in `(app)/_layout.tsx` takes over)
2. 200 + `onboarding_complete = false` → `router.replace('/(onboarding)/profession')`
3. 404 → `router.replace('/(onboarding)/profession')` (new user — no profile yet)
4. 403 → show reactivation modal (see below)
5. Network failure after 3 retries (1s, 2s, 4s exponential) → full-screen error with "Try again" button

**Reactivation modal (403 response):**
```
"Welcome back. Your account is scheduled for deletion on [date].
 Reactivate to keep your account?"
 [ Reactivate ]  [ Sign Out ]
```
- Date: `new Date(account_deleted_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })`
- `days_remaining = 0` edge case: "Your account is scheduled for deletion today." (not "0 days left")
- "Reactivate" → `POST /api/user-profile/reactivate` (Spec 95 Step 3b) → on success, resume profile check
- "Sign Out" → `useAuthStore.getState().signOut()`

**Network error full-screen:**
```tsx
<View className="bg-zinc-950 flex-1 items-center justify-center px-6">
  <Text className="text-zinc-100 text-base font-bold text-center mb-4">
    Unable to connect
  </Text>
  <Text className="text-zinc-500 text-sm text-center mb-8">
    Check your connection and try again.
  </Text>
  <Pressable onPress={retry} className="bg-amber-500 rounded-2xl py-4 px-8 items-center">
    <Text className="text-zinc-950 font-semibold text-sm">Try again</Text>
  </Pressable>
</View>
```

**Stub for now (until Spec 95):** Replace the Step 2 effect with a simple pass-through:
```typescript
// TODO Spec 95: Replace with full profile-check when /api/user-profile exists.
if (!user && !inAuthGroup) {
  router.replace('/(auth)/sign-in');
} else if (user && inAuthGroup) {
  router.replace('/(app)/');
  void registerPushToken().catch(...);
}
```
The stub restores baseline functionality immediately; the full profile-check is added in the same commit as Spec 95.

---

### Step 7 — Account deletion (Firebase side)

**File: `mobile/app/(app)/settings.tsx`** — Spec 97 §3.1 triggers deletion from this screen. Spec 93 owns the Firebase sign-out step that follows.

**Order is critical:**
1. `POST /api/user-profile/delete` (Spec 95 Step 3a) — **must succeed before proceeding**
2. If POST fails → show error toast (`text-red-400`), do NOT sign out
3. On POST success: `useAuthStore.getState().signOut()` (which calls `firebase.auth().signOut()` + store resets)
4. `router.replace('/(auth)/sign-in')` — AuthGate navigates automatically, but explicit replace ensures immediate routing

**Wire point (Spec 97 implements the UI; this step documents the contract Spec 93 must fulfil):**
- `settings.tsx` exports a `handleDeleteAccount()` function that Spec 97 wires to the "Delete Account" CTA
- This function: shows CSV export modal → shows confirmation modal → calls delete API → calls `signOut()` → navigates

---

### Testing Gates

**Unit: `mobile/__tests__/useAuth.test.ts`** (NEW)
```
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Testing Gates
```
Test cases (Jest + jest-expo):
1. `onAuthStateChanged` with a user → `setAuth` called, `uid` stored, `isLoading = false`
2. `onAuthStateChanged(null)` (forced sign-out) → `clearAuth` called, stores reset, MMKV preserved
3. `signOut()` → `auth.signOut()` called, `filterStore.reset()` called, `notificationStore.reset()` called
4. `auth/account-exists-with-different-credential` thrown → linking modal state set, error NOT shown as generic message
5. AuthGate: user null + not in auth group → `router.replace('/(auth)/sign-in')` called
6. AuthGate: user set + in auth group → `router.replace('/(app)/')` called
7. AuthGate: `/api/user-profile` returns 404 → `router.replace('/(onboarding)/profession')` called (Spec 95 gate — add to the test file as a `test.skip` with comment "enable after Spec 95 ships")
8. AuthGate: `/api/user-profile` returns 403 → reactivation modal shown (same skip pattern)
9. AuthGate: network failure after 3 retries → full-screen error shown (same skip pattern)

Mocking strategy:
- Mock `firebase/auth` module for `onAuthStateChanged`, `signInWithEmailAndPassword`, etc.
- Mock `@/lib/firebase` to export `auth: {}` stub
- Mock `expo-router` for `useRouter`, `useSegments`, `useRootNavigationState`
- Mock `@/lib/apiClient` `fetchWithAuth` for AuthGate profile-check tests

**Maestro: `mobile/maestro/auth.yaml`** (NEW)
```yaml
# SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §5 Testing Gates
appId: com.buildo.app
---
- launchApp:
    clearState: true
- assertVisible: "Sign in with Apple"   # iOS only; on Android: "Sign in with Google"
- tapOn: "Continue with Email"
- inputText:
    id: "email-input"
    text: "test@buildo.app"
- inputText:
    id: "password-input"
    text: "TestPassword123!"
- tapOn: "Sign in"
- assertVisible: "Lead Feed"            # confirms navigation to (app)/
- tapOn: "Settings"
- tapOn: "Sign Out"
- assertVisible: "Sign in with Google"  # confirms return to sign-in screen
```
Note: Maestro uses `accessibilityLabel` for `tapOn` text matching. All `TextInput` elements must have `testID` or `accessibilityLabel` set in implementation.

---

### Multi-Agent Review
Per review protocol: WF1 runs independent code reviewer AND both adversarial agents (Gemini + DeepSeek).

Spawn all three agents with `isolation: "worktree"` after implementation. Inputs: `docs/specs/03-mobile/93_mobile_auth.md` + all modified/new files. Summary: "WF1 Spec 93 — full mobile auth: 4 sign-in methods, Firebase session via SecureStore, AuthGate stub, account-linking sheet, unit tests, Maestro flow."

Adversarial agents focus on:
- Firebase credential leak paths (idToken in logs, MMKV, crash reports)
- `signOut()` missing any store reset (stale data visible to next user on shared device)
- `auth/account-exists-with-different-credential` flow: verify `linkWithCredential` is called with the correct pending credential, not discarded
- `onAuthStateChanged` double-subscription (fast refresh / StrictMode mount)
- Missing `Platform.OS === 'ios'` guard on Apple button
- OTP wrong-code error path resetting `errorMode` before re-entry

### Green Light
`npm run test:ci` from `mobile/` directory + `npm run typecheck` from `mobile/` directory. Both must pass with zero failures. Then commit.

---

## Execution Order Constraint
Step 0b → Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 (stub only) → Step 7 (contract wire point) → Tests → Review → Green Light → Commit → then plan Spec 95 WF1
