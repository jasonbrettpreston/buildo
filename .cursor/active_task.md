# Active Task: Migrate Mobile Auth to @react-native-firebase
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Domain Mode:** Admin (mobile/ Expo source — non-Maestro). Read `.claude/domain-admin.md` ✓ + `docs/specs/03-mobile/93_mobile_auth.md` ✓ + `docs/specs/03-mobile/90_mobile_engineering_protocol.md` ✓ + `docs/specs/00_engineering_standards.md` ✓.

---

## Context

* **Goal:** Replace the Firebase JS SDK auth surface and the deprecated `expo-firebase-recaptcha` with `@react-native-firebase/auth` (native module). Permanent fix for the Gradle 8 build break in `expo-firebase-core@6.0.0` (the legacy `classifier` Jar property removed in Gradle 8) that is currently blocking `npx expo run:android` and the WF12 mobile launch. Phone-auth bot prevention shifts from a JS-rendered WebView reCAPTCHA modal to native Play Integrity (Android) and APN silent-push (iOS). All four sign-in methods (Apple, Google, Email, Phone) are reworked against the new API.

* **Target Spec:** `docs/specs/03-mobile/93_mobile_auth.md` (primary). This task also amends `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §4 — Spec 90's "Firebase Auth (using the standard JS SDK)" line is the architectural constraint that previously precluded the migration; it is updated as part of this WF2.

* **Key Files:**
  - `mobile/package.json` — remove `firebase`, `expo-firebase-recaptcha`; add `@react-native-firebase/app`, `@react-native-firebase/auth`, `expo-crypto`.
  - `mobile/app.json` — add `@react-native-firebase/app` + `@react-native-firebase/auth` config plugins; add `googleServicesFile` to BOTH `android` (→ `./google-services.json`) AND `ios` (→ `./GoogleService-Info.plist`) blocks. The `@react-native-firebase/app` config plugin reads the same key name on both platforms during `expo prebuild` and copies the files into the ephemeral native folders. There is no `googleServicesPlist` key.
  - `mobile/.gitignore` — add `google-services.json` + `GoogleService-Info.plist` BEFORE the user downloads them.
  - `mobile/src/lib/firebase.ts` — strip JS init (`initializeApp` / `initializeAuth` / `getReactNativePersistence` / `ExpoSecureStoreAdapter`); thin re-export of `auth` from `@react-native-firebase/auth`.
  - `mobile/src/store/authStore.ts` — swap `firebase/auth` listener for `auth().onAuthStateChanged(...)`; `auth().signOut()`.
  - `mobile/src/lib/apiClient.ts:101` — swap `auth.currentUser?.getIdToken(true)` for `auth().currentUser?.getIdToken(true)`.
  - `mobile/app/(auth)/sign-in.tsx` — drop `<FirebaseRecaptchaVerifierModal>`, switch all four method calls to RNFirebase, add Apple-Sign-In nonce.
  - `mobile/app/(auth)/sign-up.tsx` — same migration as sign-in.
  - `mobile/__tests__/useAuth.test.ts` — replace `firebase/auth` Jest mocks with `@react-native-firebase/auth` mocks; add phone-confirmation and Apple-nonce coverage.
  - `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §4 — Auth row update.
  - `docs/specs/03-mobile/93_mobile_auth.md` — §2 Stack, §5 Step 0 deps, §5 Step 1 firebase.ts, §5 Step 4 Phone path + Apple path, §5 Testing Gates.

---

## Technical Implementation

* **New/Modified Components:** No new RN components. UI structure (button stack, bottom sheets, OTP cells, account-linking sheet) is unchanged — visual diff target is zero. The only DOM change is removing one `<FirebaseRecaptchaVerifierModal>` from `sign-in.tsx`.

* **Data Hooks/Libs:**
  - `firebase.ts` shrinks to ~5 lines — RNFirebase auto-initialises from native config files. The Android Keystore-on-screen-lock-removal caveat (currently at `firebase.ts:50`) is preserved as a comment because it still applies to the native persistence layer.
  - `authStore.ts` — function-style API: `auth().onAuthStateChanged(...)` returns the same unsubscribe semantics. `firebaseSignOut(auth)` becomes `auth().signOut()`.
  - `apiClient.ts` — one-line change. Token refresh semantics identical.
  - **Phone flow rewrite:**
    ```
    // BEFORE
    PhoneAuthProvider(auth).verifyPhoneNumber(num, recaptchaVerifier.current)
      → setVerificationId(id) + transition to OTP screen
      → PhoneAuthProvider.credential(verificationId, code) + signInWithCredential(auth, cred)
    // AFTER
    auth().signInWithPhoneNumber(num)  // returns confirmation
      → confirmationRef.current = confirmation + transition to OTP screen
      → confirmation.confirm(code)
    ```
    Drop `recaptchaVerifier` ref, drop `verificationId` state (replaced by `confirmationRef`), drop the `<FirebaseRecaptchaVerifierModal>` mount.
  - **Apple Sign-In nonce:** RNFirebase's `auth.AppleAuthProvider.credential(idToken, nonce)` requires a nonce that was passed verbatim to `AppleAuthentication.signInAsync({ nonce })`. Generate via `expo-crypto`: a 32-char random string, then `Crypto.digestStringAsync(SHA256, raw)`. Pass the SHA to `signInAsync` (Apple sees the hash) and the raw to `credential` (Firebase verifies it matches).

* **Database Impact:** NO. Client-only migration. No backend, no schema, no factories.

---

## Standards Compliance

* **Try-Catch Boundary:** N/A — no API routes added or modified. Existing `try-catch` blocks around each auth call in `sign-in.tsx` / `sign-up.tsx` are preserved (only inner SDK calls swap).
* **Unhappy Path Tests:** Existing `useAuth.test.ts` covers `onAuthStateChanged(null)` (forced sign-out) and `signOut()` clearing peer stores — both kept. ADD: (a) phone confirmation expired (`auth/code-expired`) maps to `mapFirebaseError`; (b) Apple nonce mismatch is rejected and surfaces as a toast; (c) `linkWithCredential` rejection is non-fatal (existing pattern preserved).
* **logError Mandate:** N/A — auth screens are React client code; existing `Sentry.captureException` calls preserved unchanged.
* **UI Layout:** Mobile-first NativeWind classes preserved 1:1. Touch targets `min-h-[52px]` per Spec 93 §4 — unchanged.
* **Spec 90 §4 amendment justification:** The "smooth Expo Go compatibility" rationale is stale — this project moved to native dev builds per Spec 98, and Expo Go was already incompatible due to TurboModule dependencies (Firebase Auth, Reanimated worklets, Sentry — Spec 98 §6.4). The migration removes a deprecated package whose Gradle 8 incompatibility now blocks the build.
* **Spec 93 §5 Step 1 amendment:** Firebase config moves from `EXPO_PUBLIC_FIREBASE_*` env vars to native `google-services.json` / `GoogleService-Info.plist`. The new spec text documents the gitignore + EAS file-secret upload pattern.
* **Native config secret-handling:** `mobile/google-services.json` and `mobile/GoogleService-Info.plist` MUST be added to `mobile/.gitignore` BEFORE either is downloaded. EAS handles them via file secrets.
* **Engineering Standards reference:** The CLAUDE.md "§10 Plan Compliance Checklist" lookup returned empty — `00_engineering_standards.md` ends at §9. Compliance applied from §1 (Mobile-First UI), §2 (Try-Catch / Assumption Documentation), §5 (Testing Standards), §6 (logError — N/A here). No invented §10.

---

## Execution Plan

*WF2 verbatim. Each step lists what's done or why it's N/A.*

- [ ] **State Verification:** Five call sites confirmed via grep against `mobile/{src,app}`: `firebase.ts`, `apiClient.ts:101`, `authStore.ts`, `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`. Plus `__tests__/useAuth.test.ts` (mocks). No other importers of `firebase/*`. The AuthGate (`app/_layout.tsx`) consumes `useAuthStore` — no direct Firebase imports.
- [ ] **Contract Definition:** N/A. The Bearer-token contract between mobile and `src/app/api/*` is unchanged — `getIdToken()` returns the same JWT shape from RNFirebase as from the JS SDK. `fetchWithAuth` 401-retry semantics in `apiClient.ts` preserved.
- [ ] **Spec Update:**
  1. Amend `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §4 Auth row → `@react-native-firebase/auth` (native module). Native Keychain/Keystore persistence; Play Integrity (Android) and APN silent-push (iOS) for phone-auth bot prevention. Native dev build required (Spec 98) — Expo Go not supported.
  2. Amend `docs/specs/03-mobile/93_mobile_auth.md`:
     - §2 Stack — replace JS SDK line with RNFirebase line.
     - §5 Step 0 Install — drop `expo-firebase-recaptcha`; add `@react-native-firebase/app @react-native-firebase/auth`; `npx expo install expo-crypto`.
     - §5 Step 0 plugins — add `@react-native-firebase/app` and `@react-native-firebase/auth` to `app.json` plugin list.
     - §5 Step 1 firebase.ts — replace whole code sample with the RNFirebase 5-line shim.
     - §5 Step 4 Phone path — replace `PhoneAuthProvider.verifyPhoneNumber` flow with `auth().signInWithPhoneNumber → confirmation.confirm`. Note that no recaptcha widget is mounted.
     - §5 Step 4 Apple path — add nonce generation step (`expo-crypto`).
     - §5 Step 4 Account linking — change `linkWithCredential(user, cred)` to `currentUser.linkWithCredential(cred)`.
     - §5 Testing Gates — update mock surface from `firebase/auth` to `@react-native-firebase/auth`.
     - §6 Operating Boundaries Cross-spec line — note Spec 90 §4 amendment.
  3. Run `npm run system-map` to regenerate `docs/specs/00_system_map.md`.
- [ ] **Schema Evolution:** N/A — no DB change.
- [ ] **Guardrail Test:** Update `mobile/__tests__/useAuth.test.ts`:
  - Replace `jest.mock('firebase/auth', () => ({...}))` with `jest.mock('@react-native-firebase/auth', () => ...)` exposing function-style API (`auth()` factory + `auth.AppleAuthProvider.credential` + `auth.GoogleAuthProvider.credential`).
  - ADD `signInWithPhoneNumber` test: mocked `auth().signInWithPhoneNumber` returns a confirmation; `confirmation.confirm(code)` resolves; assert `setAuth` is called with the resulting uid.
  - ADD `auth/code-expired` failure test asserting `mapFirebaseError` returns the user-facing copy and triggers `Haptics.notificationAsync(Error)`.
  - ADD Apple nonce test: assert the same nonce passed to `AppleAuthentication.signInAsync` is forwarded to `auth.AppleAuthProvider.credential`.
- [ ] **Red Light:** `cd mobile && npx jest __tests__/useAuth.test.ts` — must fail (existing tests target `firebase/auth` mock paths that no longer resolve once production code switches).
- [ ] **Implementation:**
  1. `mobile/.gitignore` — add `google-services.json` and `GoogleService-Info.plist` lines.
  2. **Deps:** `cd mobile && npm uninstall firebase expo-firebase-recaptcha && npm install @react-native-firebase/app @react-native-firebase/auth && npx expo install expo-crypto`.
  3. **`app.json` plugin block** — append `"@react-native-firebase/app"` and `"@react-native-firebase/auth"`. Add `"googleServicesFile": "./google-services.json"` to the `android` block AND `"googleServicesFile": "./GoogleService-Info.plist"` to the `ios` block. Same key name on both platforms — the config plugin injects the file into the ephemeral native folder during `expo prebuild`.
  4. **`mobile/.env.local.example`** — drop `EXPO_PUBLIC_FIREBASE_*` lines; keep Google OAuth client IDs (`expo-auth-session` still uses them).
  5. **Rewrite `mobile/src/lib/firebase.ts`** — strip JS init, export `auth` from `@react-native-firebase/auth`. Preserve SPEC LINK header. Preserve the Android Keystore-on-screen-lock-removal comment.
  6. **Rewrite `mobile/src/store/authStore.ts`:**
     - Replace `import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth'` with `import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth'`.
     - `initFirebaseAuthListener` → `auth().onAuthStateChanged(...)`. Type `firebaseUser` as `FirebaseAuthTypes.User | null`.
     - `signOut` → `await auth().signOut()`.
  7. **Update `mobile/src/lib/apiClient.ts:101`** — `auth().currentUser?.getIdToken(true)`. Update import accordingly.
  8. **Rewrite `mobile/app/(auth)/sign-in.tsx`:**
     - Drop `import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha'`.
     - Drop `<FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={app.options} />` JSX.
     - Drop `recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null)` ref.
     - Replace `firebase/auth` imports with `import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth'`.
     - Replace `signInWithEmailAndPassword(auth, email, password)` → `auth().signInWithEmailAndPassword(email, password)`.
     - Replace `signInWithCredential(auth, credential)` → `auth().signInWithCredential(credential)`.
     - Replace `GoogleAuthProvider.credential(idToken)` → `auth.GoogleAuthProvider.credential(idToken)`.
     - Replace `OAuthProvider('apple.com').credential({ idToken })` → `auth.AppleAuthProvider.credential(identityToken, rawNonce)`.
     - **Phone flow:** replace `PhoneAuthProvider(auth).verifyPhoneNumber(...)` with `auth().signInWithPhoneNumber(phoneNumber)`; store returned confirmation in `confirmationRef`; OTP submit calls `confirmationRef.current?.confirm(code)`.
     - **Apple nonce:** generate per `expo-crypto` (raw 32-char string + SHA-256 hash); pass `hashedNonce` to `AppleAuthentication.signInAsync({ nonce })`; pass `rawNonce` to `auth.AppleAuthProvider.credential`.
     - **Account linking:** `auth().fetchSignInMethodsForEmail(errorEmail)`; in `linkPendingCredential`: `auth().currentUser?.linkWithCredential(pendingCredential)`.
     - Update typed annotations: `FirebaseUser` → `FirebaseAuthTypes.User`; `AuthCredential` → `FirebaseAuthTypes.AuthCredential`.
  9. **Apply identical migration to `mobile/app/(auth)/sign-up.tsx`** (smaller surface — no Apple, no account-linking sheet, just email + phone paths).
  10. **`mapFirebaseError` (`mobile/src/lib/firebaseErrors.ts`)** — RNFirebase preserves `auth/*` error codes 1:1. Spot-check `auth/missing-verification-code`, `auth/code-expired`, `auth/invalid-verification-code`, `auth/account-exists-with-different-credential`, `auth/too-many-requests`. No code change expected; if a code differs, add it to the mapping table.
  11. **Verify Firebase Console state (USER ACTION — flag in completion summary):**
     - User downloads `google-services.json` from Firebase Console → places at `mobile/google-services.json`.
     - User downloads `GoogleService-Info.plist` → places at `mobile/GoogleService-Info.plist`.
     - User registers debug + release SHA-256 fingerprints in Firebase Console under the Android app config (required for phone auth via Play Integrity). Command: `cd mobile/android && ./gradlew signingReport`. Both certificates' SHA-256 lines must be added.
- [ ] **UI Regression Check:** N/A — no shared UI component touched. The only screens modified are auth screens; `npx jest __tests__/useAuth.test.ts` is the regression anchor.
- [ ] **Pre-Review Self-Checklist:** Generate 5–10 self-skeptical questions from Spec 93 §3 Behavioral Contract + §6 Operating Boundaries:
  1. Does the diff handle `onAuthStateChanged(null)` (forced sign-out) identically to user-initiated sign-out, redirecting to `/(auth)/sign-in` with no error? (§3.1)
  2. Does sign-out call `paywallStore.clear()` BEFORE `auth().signOut()`? (§3.4 + Spec 96 §9)
  3. Does sign-out reset `filterStore`, `notificationStore`, `userProfileStore`, `userProfileCache` — but preserve MMKV?
  4. Is the Apple nonce passed AS `hashedNonce` to `signInAsync` and AS `rawNonce` to `AppleAuthProvider.credential`? (Apple spec — SHA-256 to Apple, raw to Firebase)
  5. Does `auth().signInWithPhoneNumber` failure path map `auth/too-many-requests` to the spec'd 30-second resend lockout?
  6. Does `auth/account-exists-with-different-credential` still surface the linking sheet AND preserve the `pendingCredential` across the existing-method sign-in?
  7. Are `google-services.json` + `GoogleService-Info.plist` gitignored BEFORE they exist on disk?
  8. Does `apiClient.ts` 401 retry still call `getIdToken(true)` exactly once per call (no concurrent stampede regression)?
  9. Are the existing Sentry tags (`layer: 'auth'`, `op: 'linkWithCredential'`) preserved in the new code paths?
  10. Does the `mapFirebaseError` table cover the same set of `auth/*` codes after the SDK swap?

  Walk each against the actual diff. Output PASS/FAIL per item BEFORE running tests.
- [ ] **Multi-Agent Review:** ONE message, three parallel tool calls. No checklist provided to any agent — each generates its own from spec + diff.
  - **Tool call 1 — Bash:** `npm run review:gemini -- review mobile/app/(auth)/sign-in.tsx --context docs/specs/03-mobile/93_mobile_auth.md`
  - **Tool call 2 — Bash:** `npm run review:deepseek -- review mobile/app/(auth)/sign-in.tsx --context docs/specs/03-mobile/93_mobile_auth.md`
  - **Tool call 3 — Agent** (`subagent_type: "feature-dev:code-reviewer"`, `isolation: "worktree"`): provide spec path + modified files list (`mobile/src/lib/firebase.ts`, `mobile/src/store/authStore.ts`, `mobile/src/lib/apiClient.ts`, `mobile/app/(auth)/sign-in.tsx`, `mobile/app/(auth)/sign-up.tsx`) + one-sentence summary.
  - **Triage:** BUG (blocking) → file WF3 immediately and fix before Green Light. DEFER → append to `docs/reports/review_followups.md`.
- [ ] **Green Light:** `cd mobile && npx jest && npx tsc --noEmit && npm run lint -- --fix`. Paste final test summary line + typecheck result. Then resume WF12: re-run `npx expo run:android` — broken `expo-firebase-core` is gone, build should reach Gradle SUCCESS and the app should launch on the emulator. → WF6.

---

## Pre-requisite User Actions (cannot be automated)

These two steps require Firebase Console access:
1. **Download native config files** from Firebase Console:
   - Android app → `google-services.json` → save to `mobile/google-services.json`
   - iOS app → `GoogleService-Info.plist` → save to `mobile/GoogleService-Info.plist`
   *(I will add `.gitignore` entries before you download, so neither file is committed.)*
2. **Register Android signing fingerprints.** Run `cd mobile/android && ./gradlew signingReport`. Copy the SHA-256 lines for both `debug` and `release` variants into Firebase Console → Project Settings → Android app → Add fingerprint. Required for phone-auth Play Integrity attestation; without these, SMS sends will fail in production builds.

Both must be done BEFORE Step 11 (`Implementation`) completes — the dev build will not boot without `google-services.json`.

---

> **PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
> Note: Spec 90 §4 amendment is part of this WF2 — the JS-SDK constraint is the architectural blocker that previously precluded this migration. If you'd rather split the spec amendment into its own WF, say so and I'll re-scope.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
