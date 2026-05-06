# Spec 98 — Mobile Testing Protocol & Local Environment
**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol), Spec 93 (Auth), Spec 94 (Onboarding), Spec 96 (Subscription)

## 1. Goal & Scope
**Goal:** Establish a bulletproof, reproducible testing environment for the Buildo mobile app, focusing on End-to-End (E2E) testing via Maestro, unit testing via Jest, and safe data-seeding practices.
**Scope:** This spec defines the Windows/Android local development startup routine, the organization of Maestro E2E test flows, database cloning for realistic test data, and the unit testing boundaries for Zustand stores and routing guards.

## 2. Local Environment Setup (Windows / Android)
This is the canonical startup routine for developing and testing the Buildo native app locally on a Windows machine.

### 2.1 Prerequisites
- **Android Studio:** Installed with a configured Virtual Device (Emulator). Target: Pixel 8 (API 34+).
- **Maestro CLI:** Installed via WSL or Windows command line.
- **Postgres CLI Tools:** `pg_dump` and `pg_restore` installed and added to the Windows System PATH.
- **Expo CLI:** `npm install -g eas-cli`

### 2.2 Boot Sequence
**Step 1: Boot the Physical Environment (Emulator)**
Always start the emulator via Android Studio before running any Expo commands to ensure background ADB daemons initialize correctly.
1. Open Android Studio.
2. Open Device Manager.
3. Click Play on the Pixel 8 emulator. Wait for the home screen.

**Step 2: Boot the App (Metro Bundler)**
Open a PowerShell terminal at the project root:
```powershell
cd mobile
npx expo run:android
```
*Note: `run:android` compiles the native C++/Java shell (Firebase, Reanimated) and boots the Metro bundler. Leave this terminal open. To recover from a red-screen crash, press `r` in this terminal to reload the JS bundle.*

**Step 3: Seed Local Database (Production Clone)**
To test real-world scrolling, ranking, and UI rendering, tests must run against production-volume data. Do NOT point the local app at the live production database. Open a second PowerShell terminal:
```powershell
# 1. Download a snapshot of production
pg_dump "postgresql://<PROD_USER>:<PASSWORD>@<HOST>:5432/<DB_NAME>" -F c -f buildo_prod.dump

# 2. Restore to local Postgres instance
pg_restore --clean --if-exists --no-owner --host=localhost --port=5432 --username=postgres --dbname=buildo buildo_prod.dump
```

## 3. End-to-End (E2E) Testing Strategy
**Tool:** Maestro
**Location:** `mobile/maestro/`

Maestro is used to validate critical user journeys from the perspective of a black-box user. Tests interact with the rendered UI accessibility layer, not internal state.

### 3.1 State Management in Tests
Every Maestro YAML file must explicitly define its state expectations using `clearState`:
- **`clearState: true` (Clean Slate):** Used for Auth and Onboarding flows. Wipes MMKV cache and Firebase Auth session before the test runs, simulating a fresh App Store install.
- **`clearState: false` (Persistent State):** Used for Feed, Settings, and Flight Board flows. Assumes the user has already completed onboarding. Requires manual setup (or a setup script) to populate the local MMKV state before running.

### 3.2 Required Test Suites (Launch Blockers)
The following YAML flows must pass cleanly before any production release:
- **`auth.yaml`**: `clearState: true`. Validates sign-in (email/password), sign-out reset behavior, and account linking UI.
- **`onboarding-leads.yaml`**: `clearState: true`. Validates trade selection lock, address geocoding bounds validation, and routing to the Lead Feed.
- **`onboarding-tracking.yaml`**: `clearState: true`. Validates bypassing address input, supplier selection, and routing to the Flight Board.
- **`scroll-feed.yaml`**: `clearState: false`. Validates infinite scrolling, empty states (NO LEADS IN RANGE), and tap-to-save interactions.
- **`subscription-paywall.yaml`**: Validates the 14-day expiry lock, the lead-count display on the paywall, and the "Maybe later" inline-blur feed state.

### 3.3 Maestro Execution Commands
Run from the mobile directory in PowerShell:
```powershell
# Run a specific flow
maestro test maestro/auth.yaml

# Open Maestro Studio to inspect UI elements and auto-generate YAML commands
maestro studio
```

## 4. Unit & Integration Testing Strategy
**Tool:** Jest + jest-expo
**Location:** `mobile/__tests__/`

Unit tests focus strictly on business logic, state machines, and Expo Router guards. UI component snapshot testing is deliberately excluded (Maestro handles UI validation).

### 4.1 Required Test Boundaries

This section is **non-exhaustive**. The normative test mandate set lives in **Spec 99 §8 (Test Mandates)** — every implementation MUST satisfy:
- **§8.1** — idempotency tests for every bridge (B1 server→TanStack, B2 TanStack→Zustand, B3 mutation rollback, B4 auth invalidation, B5 sign-out reset, B6 mid-session 401 refresh).
- **§8.2** — router branch coverage (AuthGate's 9 routing arms per §5.3).
- **§8.3** — gate-stability tests (no `isFetching` in render gates per §6.5).
- **§8.5** — store-enumeration grep test (`mobile/__tests__/storeReset.coverage.test.ts`) — every `create<*Store>(` in `mobile/src/store/*.ts` has a `.getState().reset()` call in `clearLocalSessionState`.

The boundaries below are illustrative examples within those mandates.

**AuthGate & Routing (`subscriptionGate.test.ts`)** — Spec 99 §8.2 + §8.3
- Validates that unauthenticated users are forced to `/(auth)`.
- Validates that incomplete profiles are forced to `/(onboarding)`.
- Validates that `subscription_status = 'expired'` forces `<PaywallScreen>`.
- Validates that `account_deleted_at = NOT NULL` forces sign-out.

**Zustand Stores (`store.test.ts`)** — Spec 99 §8.1 (idempotency) + §8.5 (store-enumeration)
- `authStore`: `signOut()` must trigger the §B5 fan-out (`filterStore.reset()`, `userProfileStore.reset()`, `paywallStore.reset()`, `notificationStore.reset()`, `onboardingStore.reset()`, `flightBoardSeenStore.reset()` + `queryClient.clear()` + `mmkvPersister.removeClient()`).
- `paywallStore`: Must default to `visible: false, dismissed: false` on cold boot. Method renamed `clear()` → `reset()` on 2026-05-03 per Spec 99 §3.4 + §9.19.

**Data Transformations (`utils.test.ts`)**
- `snapCoord.ts`: Verify 500m snapping logic and Toronto bounding box re-validation.
- `formatCurrency.ts`: Verify CAD formatting for permit valuations.

## 5. Continuous Integration (CI)
**Tool:** GitHub Actions + EAS (Expo Application Services)

**Pull Request Checks:** On every PR targeting `main`, GitHub Actions runs:
- `npm run typecheck` (TypeScript compiler)
- `npm run lint` (ESLint)
- `npm run test` (Jest unit tests)

**Pre-Build Checks:** EAS Build runs the above sequence natively before attempting an iOS/Android build. If tests fail, the build is aborted to save queue time and credits.

**E2E Automation (Phase 2):** Maestro tests will be integrated into GitHub Actions via Maestro Cloud to run automatically against staging builds.

## 6. Historical Context & Past Issues
To prevent future developers from falling into the same local development traps, we document the major environment issues that forced the transition to this protocol.

### 6.1 The "Pointing" Issues (Path Configuration)
There were persistent issues related to Windows environment variables failing to point correctly to the ADB (Android Debug Bridge) and Android SDK paths. The system would lose track of where the necessary Android build tools were located. This caused frustrating moments where the emulator was running perfectly in Android Studio, but Expo or Maestro couldn't connect to it because they couldn't find the `adb` executable. *Fix: Ensure ANDROID_HOME and platform-tools are permanently added to the Windows System PATH.*

### 6.2 The Great Migration: Expo Go vs. Development Builds
**The Errors:** The project hit massive dependency mismatches between React Native, Expo Go, and the Reanimated library, resulting in fatal TurboModule and worklet compatibility errors.
**The Solution:** Expo Go is a sandboxed testing app and cannot run custom native code. Because the Buildo app requires heavy native modules (like Firebase Auth, Apple Sign-In, and Sentry), the transition to a standalone "Development Build" was mandatory. That is why the boot sequence now explicitly uses `npx expo run:android` to physically compile a custom version of the app directly onto the emulator, rather than relying on Expo Go.

### 6.3 Navigation and Missing Plugins
After moving to the native development build, two significant configuration bugs emerged:
- **Expo Router Timing Crash:** There were navigation-related crashes where the Expo Router tried to aggressively redirect users (e.g., sending an unauthenticated user to the onboarding flow) before the root app layout had finished mounting.
- **Plugin Resolution Failures:** There were native build failures related to missing or improperly configured Expo plugins in `app.json`, specifically `@sentry/react-native/app-plugin`, which aborted the native compile step.
