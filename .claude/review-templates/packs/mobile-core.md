# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile rules: Spec 90 (all sections), Spec 98, and .claude/domain-admin.md (the domain file the root CLAUDE.md names for mobile/)
Source: docs/specs/03-mobile/90_mobile_engineering_protocol.md:1-115; docs/specs/03-mobile/98_mobile_testing_protocol.md:1-139; .claude/domain-admin.md:1-77
Generator: hand-written, not generated
Rules in the whole list: 29 (counted by pattern /^(## \d+\.|### \d+\.\d+)/) · this is part 1 of 1

<<< Spec 90 whole (docs/specs/03-mobile/90_mobile_engineering_protocol.md:1-115) >>>
# Spec 90 — Mobile Engineering Protocol & Architecture (The Pivot)

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 2** of `.cursor/active_task.md`.

> **Prevention loop (frontend/mobile home):** the frontend-tagged rows of the prevention registry (`docs/specs/00_engineering_standards.md` §14) live here. New CRITICAL/HIGH review findings (Spec 08 roster — incl. the User-Advocate/UX lens) that yield a *mobile* rule become protocol requirements in this spec and, where deterministic, a gate.

## 1. Goal & User Story
**Goal:** Build a truly native Expo application for tradespeople, relying on the Next.js backend for all heavy lifting. This establishes the foundation for offline reliability, native push notifications, and elite list performance. *Note: Push infrastructure is a cross-domain dependency requiring coordination with the Next.js backend for token registration and payload triggering.*
**User Story:** As a tradesperson standing in a concrete basement with poor cell service, I need my Lead Feed to open instantly without crashing, allow me to scroll through thousands of local permits flawlessly, and ping my lock-screen the second a high-value job changes phases.

## 2. Platform & Device Matrix
This single Expo codebase targets three environments (Minimum OS requirements: iOS 16+ / Android 10+):
1. **Mobile (iOS/Android):** Primary target. UI must accommodate notches, dynamic islands, and safe areas.
2. **Tablet (iPad/Android):** UI must be responsive. Use NativeWind breakpoints (e.g., `md:flex-row`) to convert stacked mobile cards into side-by-side or grid layouts.
3. **Web (Expo Web):** Compiles to a PWA. *Fallback constraint:* `@shopify/flash-list` does not support Web. You must implement a standard `<FlatList>` or TanStack Virtual fallback for the web target.

> Dated note 2026-11-09 (M-246, prior text kept; spec review R-8, `~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md`): descriptor-governed web surfaces render as Next.js RSC (Spec 126 §5.3; Spec 128 R-22); the MaxBLD web pages use the web library of Spec 126 §11b.4. The Expo Web build target is unruled.

**Theme Constraint:** The app must natively support System Dark Mode. NativeWind `dark:` variants are required for all UI components.

> Dated note 2026-11-09 (MF-42 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "P42 decisions approved" and "approved smaller version"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-42 decisions"): measured at `ffb6b0610`, no `.tsx` file under `mobile/src` or `mobile/app` uses a `dark:` class, and the brand-primary surfaces are dark-mode-only (Spec 117 §3.4). How the React Native Reusables components carry their dark values is MF-35's to rule (coordinator direction, pending operator confirmation). Measured fact only; no rule changes.

## 3. The Prime Directive: "Dumb Glass" Architecture
You are an expert React Native / Expo developer. You are operating strictly in the **Mobile Domain**. 
This mobile application is a "Dumb Glass" client. It **MUST NOT** perform complex data mutation, geographic PostGIS math, or algorithmic sorting. All heavy computational lifting is handled entirely by the Next.js API Backend. 

The mobile app's sole responsibility is:
1. Capturing device state (GPS coordinates, push tokens).
2. Fetching pre-calculated JSON from the backend.
3. Rendering the UI at 60fps.

*Clarification:* This prohibits server-authoritative computed state. Ephemeral **optimistic UI state** (e.g., toggling a "Save" icon instantly before the server confirms) is highly encouraged and expected.

## 4. The Tech Stack Constraints
You must strictly adhere to the following stack:
* **Framework:** Expo SDK (React Native) utilizing Expo Router.
* **Core Native UI:** `react-native-reanimated` v3 and `react-native-gesture-handler` (required for 60fps animations and swipe gestures).
* **Styling:** NativeWind v4 (Tailwind CSS for React Native).
> ⚠️ **AMENDMENT 2026-09-15 (WF1 "Spec 126/127/128 surface standard") — two measured prose-vs-code drifts in this section. Additive; the original lines are retained below, unedited.**
>
> 1. **Auth is Supabase, not Firebase.** Measured: `mobile/package.json` declares `@supabase/supabase-js 2.110.7` and **no `@react-native-firebase/*` dependency at all**. The "Firebase Auth via `@react-native-firebase/auth`" line below predates the Supabase migration (Spec 113) and was never updated. Token persistence via Keychain/Keystore is still accurate in substance — it is the provider that is wrong.
> 2. **There is no monorepo and no `packages/shared-types`.** Measured: no workspace of that name exists in either tree. Zod schemas are **transcribed per tree** today, which is precisely the defect Spec 126 §5.2 closes by *generating* the mobile mirror from the CONTRACT descriptor — the parcel cost contract is currently declared at **four** sites and locked at **one**, and the two Zod declarations disagree in strictness (`src/app/api/parcels/lookup/types.ts` uses `.strict()` six times; `mobile/src/lib/schemas.ts` uses `.passthrough()`/`z.record` five times — the client is looser than the server it mirrors).
>
> **§3's "Dumb Glass" prime directive is unaffected and is reinforced** — Spec 126 §5.3 makes it enforceable rather than merely stated, and preserves its optimistic-UI carve-out verbatim.

* **Auth:** Firebase Auth via `@react-native-firebase/auth` (native module). Native Keychain (iOS) / Keystore (Android) handles token persistence; Play Integrity (Android) and APN silent-push (iOS) handle phone-auth bot prevention — no JS-rendered reCAPTCHA. Native dev build required (Spec 98); Expo Go is not supported.
* **Server State:** `@tanstack/react-query` (v5).
* **Client State:** `zustand` v5.
* **Local Persistence:** `react-native-mmkv` (Synchronous C++ storage).
* **Hardware:** `expo-location`, `expo-notifications`, `expo-haptics`.
* **Infrastructure:** EAS (Expo Application Services) for CI/CD builds (`eas build`) and Over-The-Air updates (`eas update`).

## 5. Strict Anti-Patterns (NEVER DO THESE)
If you attempt to use any of the following web paradigms in this project, you have failed:
* **NO HTML/DOM:** Never use `<div>`, `<span>`, `<a>`, `<p>`, or `<button>`. 
* **NO Web Libraries:** Never import `shadcn/ui`, `@tremor/react`, `framer-motion`, or `lucide-react`. 
* **NO DOM APIs:** Never use `window`, `document`, `localStorage`, `navigator.geolocation`.
* **NO `useEffect` for Fetching:** Never fetch API data inside a `useEffect`. Always use TanStack Query.
* **NO Inline `renderItem`:** Never pass an inline arrow function to a FlashList/FlatList `renderItem`. Always use `useCallback` or extract the function.
* **NO standard `<Image>`:** Never use the base React Native `<Image>` for external URLs.

## 6. The Component Philosophy: React Native Reusables
We do not npm-install generic UI components. We use **React Native Reusables** (via `npx rn-reusables add [component]`). The code lives inside our repository, giving us full ownership of Tailwind styling and native dependency adjustments without version conflicts.

> Dated note 2026-11-09 (MF-42 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "P42 decisions approved" and "approved smaller version"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-42 decisions"): the command named above is not the CLI's package name: the CLI is `@react-native-reusables/cli` (version 0.7.1, registry `nativewind`; measured by the MF-42 plan lane), recorded in `scripts/surfaces/_schema/vendor-rnr.manifest.json`, with `mobile/components.json` aliases into the protected vendor dir `mobile/src/vendor/rnr/` (Spec 126 §11b.4). MF-35 runs it.

> Dated note 2026-11-09 (McFrontend Phase 2; M-246, prior text kept; operator, verbatim: "D-0-D-4 approved D-3 we should used our existing components and approach as detailed in the mobile build specs"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: programme card v2.1 Part A, D-9"): React Native Reusables is confirmed as the mobile library for MaxBLD pages (D-3). The CLI output is generated and never edited; it is vendored unmodified under a protected manifest (the vendor folder and its rule: Spec 126 §11b.4). It is installed by MF-35.

## 7. State & Data Flow Protocol
* **The API Contract:** The Next.js `src/app/api/*` routes are the absolute source of truth.
* **Validation (Monorepo):** Zod schemas are shared via a `packages/shared-types` monorepo workspace to guarantee the mobile app and Next.js backend are never out of sync.
* **Offline Mutation Queue:** Mutations (like saving a lead) made while offline MUST be queued using TanStack Query's offline mutation cache, backed by MMKV, ensuring they flush to the server upon reconnection.
* **State Architecture & Ownership:** All Zustand stores, MMKV blobs, TanStack Query keys, and cross-layer bridges MUST conform to **Spec 99 — Mobile State Architecture & Ownership Protocol** (`docs/specs/03-mobile/99_mobile_state_architecture.md`). Adding a new field, store, or bridge requires either matching an existing pattern in Spec 99 §3-§5 or a Spec 99 amendment. Three render-loop incidents in 2026-05-02 traced to dual-source-of-truth violations precipitated this requirement.

## 8. Hardware & Geolocation Protocol
1. **Foreground Only:** Request ONLY foreground location (`requestForegroundPermissionsAsync()`). Background location invokes heavy App Store privacy scrutiny and is unnecessary for this feature.
2. **App Store Compliance:** Ensure `NSLocationWhenInUseUsageDescription` is explicitly defined in `app.json` under `expo.ios.infoPlist`.
3. **Debounce Map Pan:** Do not fire a TanStack Query refetch on every millimeter of map movement; wait for a 500ms pause.

## 9. UI & Styling Rules
* Touch targets for all interactive elements MUST be a minimum of `44px` by `44px`.
* Use the established design system tokens from **Spec 74** (e.g., `bg-bg-feed`, `text-amber-hardhat`). 
* **Font Loading:** Use `expo-font` to load custom fonts, keeping the Splash Screen visible until fonts are ready to prevent FOIT (Flash of Unstyled Text).
* Accommodate device Safe Areas using `react-native-safe-area-context`.

## 10. Testing Mandate
* **E2E / UI Testing (Maestro):** Specs are written in YAML and run directly against the iOS Simulator/Android Emulator. *Operational Note: Maestro Cloud will be used for CI to avoid the 10x cost premium of macOS GitHub Action runners.*
* **Unit Testing (Jest):** Jest + React Native Testing Library for logic hooks. Minimum 80% coverage threshold.
* **Offline Resilience Test:** Maestro flows MUST include a step that executes `toggleAirplaneMode` to verify the MMKV offline cache and empty states render without crashing.

## 11. Best-in-Class: Observability
* **Native Crash Reporting:** `@sentry/react-native`. *Critical:* Sentry source maps MUST be uploaded automatically during EAS Build using the `@sentry/react-native/app-plugin` in `app.json`.
* **Product Telemetry:** `posthog-react-native`. Track funnel events (`lead_viewed`, `job_claimed`). **Strip all PII**.

## 12. Best-in-Class: Scaling & Performance
* **FlashList Mastery:** Use `@shopify/flash-list` for native GPU memory recycling.
  * **v1 (legacy):** required an explicit `estimatedItemSize` prop for the recycler to pre-size cells.
  * **v2 (current — `^2.3.1` per `mobile/package.json`, since Spring 2026):** `estimatedItemSize` is **removed from the public API**. The new render engine auto-measures item heights at first render and reuses the measurements; passing the prop is now a TypeScript error (`Property 'estimatedItemSize' does not exist on type 'FlashListProps'`). Per-item-type recycling is still preserved via `getItemType` (e.g., `flight-board.tsx` tags 'header' vs 'card'). If a future version reintroduces the prop or exposes a `_estimatedItemSize` measurement override, this section becomes the canonical site to update.
  * **Use the typed `AnimatedFlashList` wrapper** (`mobile/app/(app)/index.tsx` + `flight-board.tsx`) so generic narrowing survives `Animated.createAnimatedComponent` (resolved 2026-04-30 by H4 commit `21520d9`).
* **Image Caching:** You MUST use `expo-image` for aggressive disk caching (SDWebImage/Glide).
* **Cache Management:** Configure TanStack Query with strict timeouts. Recommended: `gcTime: 86400000` (24h) and `staleTime: 300000` (5m) for the main feed. The MMKV persister requires `@tanstack/query-async-storage-persister`.
* **Bundle Optimization:** `react-native-maps` adds ~15MB. Use Expo's `metro.config.js` to exclude Apple Maps bundles from Android builds.

## 13. Best-in-Class: Bug Prevention
* **EAS Update (Over-The-Air Patches):** The ultimate bug prevention. JavaScript bundle fixes will bypass App Store review via Expo Application Services (EAS), allowing us to fix logical bugs in production in minutes.
* **The Zod Boundary:** Every JSON response fetched via TanStack Query MUST be parsed through a Zod schema before hitting the UI to prevent fatal native app crashes from API drift.
* **TypeScript Strictness:** `"strict": true` and `"noImplicitAny": true`. 

## 14. Best-in-Class: User Experience (The "Native" Feel)
* **Pull-to-Refresh:** Standard mobile expectation. Use `RefreshControl` combined with `queryClient.invalidateQueries()`.
* **Empty States:** A new user in a low-permit area must see a "No leads in your area" state with an "Expand radius" CTA button.
* **Optimistic Updates:** When a user taps "Save Lead", use `onMutate` to flip the UI instantly. Rollback on failure.
* **Instant Rehydration:** Use `react-native-mmkv` to cache the feed. On cold boot, the app must paint page 1 from cache instantly, then fetch fresh data in the background silently.
* **Tactile Feedback:** Use `expo-haptics` on major interactions.


<<< Spec 98 whole (docs/specs/03-mobile/98_mobile_testing_protocol.md:1-139) >>>
# Spec 98 — Mobile Testing Protocol & Local Environment

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 2** of `.cursor/active_task.md`.

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

> Dated note 2026-11-10 (M-246, prior text kept; MF-35 · McFrontend queue · lane MF-35 build; H9, P35-D6 as recommended; operator, verbatim: "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: Wave 1 decision batch"; plan `~/Buildo-scratch/mcfrontend/MF-35/plan.v3.md`): a render smoke (throws / renders non-empty / finds its test ids, labels and host props) and a screen-behaviour test are not snapshots. React Native Testing Library is the tool Spec 90 names for logic hooks (90:88); MF-35 extends its use to the mobile binding and the parcel search screen, and adds it as a dev dependency (`@testing-library/react-native` 13.3.3 with `react-test-renderer` 19.1.0). No Maestro flow covers parcel-tool today.

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

> Dated note 2026-11-10 (M-246, prior text kept; MF-35 · McFrontend queue · lane MF-35 build; operator, verbatim: "D15 b, D16 a, D17 a D18 a, D-2 a , D-9 a, D-1 a"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-10: MF-35 v3 and MF-51 decisions"; plan `~/Buildo-scratch/mcfrontend/MF-35/plan.v3.md`): the §B5 fan-out above also calls `recentSearchesStore.reset()` (MF-35; Spec 99 §3.4c). `mobile/__tests__/recentSearchesStore.test.ts` pins the store's own reset, and `storeReset.coverage.test.ts` finds it with no count change.

**Data Transformations (`utils.test.ts`)**
- `snapCoord.ts`: Verify 500m snapping logic and Toronto bounding box re-validation.
- `formatCurrency.ts`: Verify CAD formatting for permit valuations.

**Parcel Cost Tool (Spec 100)** — Spec 90 §13 (Zod boundary) + Spec 100 §6
- `useParcelLookup.test.ts`: `fetchParcelLookup` Zod-parses the whitelist envelope (`raw.data`); miss (`match:null, parcel:null`) is a valid parse; drift → `ParcelLookupSchemaError`; the CROSS-CONTRACT LOCK (a server-emitted `parcelId` from the SEARCH response pipes into the LOOKUP path, same schema); `shouldRetryParcelLookup` skips 400/403/429/drift.
- `parcelCostFormat.test.ts`: envelope-fallback label ("maximum envelope" when `opt_aor` null), absent ≠ `fits:false`, `getCostLine`/`costLineState`, currency/FSI/area formatters, and `SponsorSlot` renders `null` while flag-off.

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


<<< .claude/domain-admin.md whole (.claude/domain-admin.md:1-77) >>>
# Admin Mode — Full Rules

Read this file when declaring **Domain Mode: Admin**.
Applies to: `src/components/`, `src/app/` (pages), `src/hooks/`, admin-only `src/lib/` modules,
and `mobile/` (Expo source — non-Maestro changes).

Required reading before generating the active task:
- `docs/specs/00_engineering_standards.md` §1 (Architecture & UI), §4.3 (Frontend Security),
  §10 (Boundary), §13 (Observability Standards)

**Required reading order for any admin feature:** Spec 33 (engineering protocol) → Spec 35 (state architecture) → Spec 34 (testing) → the target tool's own spec (e.g. 36 / 86 / 89). Read them in that order; 33 sets the tooling reality, 35 the state/telemetry, 34 the test bar, then the tool spec.

---

## Before you write admin code — P15 pre-flight

Distilled from the Spec 36 Flight Center build, where several spec claims misled the plan. One line each; follow the pointer.

1. **UI kit: none.** shadcn/ui is NOT initialized (no `components.json`; `ui/` = `Badge`+`ScoreBadge`). Compose Tailwind + native elements; copy `ConfirmSyncModal.tsx`. Spec 33 §6.
2. **Destructive confirm = `role="alertdialog"` modal**, Sonner for toasts. NEVER `confirm()`/`alert()`. Spec 33 §14.
3. **Icons = inline `<svg>`** (`lucide-react` not installed); **forms = `useState` + Zod** (React Hook Form not installed).
4. **Telemetry is two helpers:** server `track(hashedUid, ...)` (`src/lib/admin/analytics.ts`); client `captureEvent(...)` + `Sentry.addBreadcrumb(...)` BEFORE the network call. Read-only surfaces = `captureEvent` only. Spec 33 §11 / Spec 35 §7.1.
5. **Per-admin identity ONLY on the `session` path.** `admin_key`→`'admin-key'`, `dev_bypass`→`'dev-user'` are SHARED sentinels. Per-admin writes MUST require `authMethod==='session'` (403 on `admin_key`). Spec 33 §8.1 (the Spec 36 PF1 pattern).
6. **Store fan-out:** the Control Panel store is `useAdminControlsStore` (action `resetStore()`), NOT `useControlPanelStore`/`discardDraft`. New admin stores register in `resetAdminStores()` (`src/lib/admin/session.ts`) or fail the §8.5 coverage test. The §B4 uid-change handler exists but its provider is UNMOUNTED (contract+test enforced, not runtime-invoked).
7. **Canonical lead keys:** join `trade_forecasts.lead_id` / `lead_views.lead_key` / `admin_watchlist.lead_key` ONLY via `buildLeadKey` (`record-lead-view.ts`) — has permit (`padStart(2).slice(-2)`) + coa branches. Never hand-format. Spec 33 §15.
8. **Retired page = `permanentRedirect()` (308)**, not `redirect()` (307); repoint every nav card/link — never leave one dangling on a redirect. Spec 33 §15.
9. **API envelope:** wrap handlers in `withApiEnvelope`; success is handler-built `ok(data, meta)` with free-form `meta` (pagination in `meta`). Spec 33 §15.
10. **Admin migrations** follow `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (XOR CHECK, `pg_trgm` GIN, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, all-comments DOWN, fresh-staging replay before push). Spec 33 §15.
11. **E2E harness does NOT exist** (`playwright` installed, no `tests/e2e/`). Test bar = Vitest `.logic`/`.infra`/`.ui` (+ `.db` under `BUILDO_TEST_DB=1`). Do not plan an E2E flow. Spec 34 §3.

**Reviewer gotcha:** worktree-isolated reviewers (Gemini/DeepSeek/Code Reviewer spawned with `isolation: "worktree"`) **cannot see untracked files** — a brand-new store/hook/component you haven't committed is invisible to them. Verify inventories (does `session.ts` enumerate every store? does this precedent file exist?) from the **MAIN tree**, not from a worktree reviewer's report.

---

## Expo Note
`src/features/leads/` consumer UI has moved to the Expo repo (`mobile/`).
The only Next.js frontend is the admin panel — an internal desktop-first tool.
`mobile/` follows mobile-first conventions enforced by its own toolchain.

---

## Required Tooling Stack
*What is ACTUALLY installed (verified against `package.json`, 2026-07-10 / P15). No new dependency without a Spec 33 amendment naming it.*

| Concern | Tool | Why / precedent |
|---------|------|-----|
| Server state / data fetching | **TanStack Query v5** | NEVER use `useEffect` for API calls. Always handle loading/error states. |
| Global UI state | **Zustand v5** | Feature-scoped stores (`useAdminControlsStore`, `useFlightCenterStore`) per Spec 35 §3. No kitchen-sink store. |
| Form state | **`useState` pending/applied pattern + Zod on submit** | ⚠️ **React Hook Form is NOT installed.** Copy `ParcelCostTool.tsx` / `StepOutputInspector`; validate the submitted value with a Zod schema. |
| API input validation | **Zod** with differentiated 400 responses (NOT generic 500) | Field-level error messages; parse request AND response (Spec 33 §13). |
| UI primitives | **Tailwind + hand-rolled native elements** | ⚠️ **shadcn/ui is NOT initialized** (no `components.json`; `src/components/ui/` = `Badge`+`ScoreBadge` only). Destructive confirm = `role="alertdialog"` modal (`ConfirmSyncModal.tsx` / `FlightCenterTool.tsx`) — never `confirm()`/`alert()`. See Spec 33 §6. |
| Icons | **inline `<svg>`** | ⚠️ **`lucide-react` is NOT installed** (`LifecycleTimelinePanel.tsx` documents this). |
| Toast notifications | **Sonner** (`import { Toaster, toast } from 'sonner'`) | Standalone dep (NOT "via shadcn"). NEVER build custom alert banners or use `alert()`. |
| Error tracking | **Sentry** (`@sentry/nextjs`) wired into `app/[...]/error.tsx` boundaries | Source maps uploaded on build. |
| Product analytics | server: **`track()`** (`src/lib/admin/analytics.ts`, hashed uid) · client: **`captureEvent()`** (`src/lib/observability/capture.ts`) + Sentry breadcrumb | ⚠️ Two different helpers — see Spec 33 §11 / Spec 35 §7.1. Wrong side = event silently dropped. |
| Auth | **Firebase Admin SDK**, `verifyAdminAuth(request)` as the FIRST line of every `/api/admin/**` handler | ⚠️ **Per-route guard, NOT middleware** (Spec 33 §8 — middleware is bypassable). Per-admin identity ONLY on the `session` path (§8.1). Row current until Supabase migration program Phase 1; swap governed by Spec 13 rewrite + Spec 113. |
| Animations / charts | **none installed** | ⚠️ `motion`/`framer-motion`, `recharts`, `@tremor/react` are NOT deps. Prefer CSS/SVG; adding any is a Spec 33 amendment. |

---

## Rules — Never Violate

1. **No floating promises** — every async call must be `await`-ed or chained with `.catch()`.
2. **No `useEffect` for data fetching** — use TanStack Query. Period.
3. **No secrets in `'use client'` components** — public Firebase config only.
4. **No `dangerouslySetInnerHTML` without DOMPurify** — XSS guard.
5. **No `console.log` in committed code** — use `Sentry.captureException()` for errors.
6. **API → Expo contract** — if an API route is consumed by the Expo app, treat as Cross-Domain.
   Do not change the response shape without a contract note.

---

## Pre-Commit Gauntlet (Admin UI Files)
1. TypeScript strict check: `npm run typecheck`
2. ESLint: `npm run lint`
3. Vitest related tests: `npx vitest related [changed files] --run`


