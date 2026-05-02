# Spec 90 — Mobile Engineering Protocol & Architecture (The Pivot)

## 1. Goal & User Story
**Goal:** Build a truly native Expo application for tradespeople, relying on the Next.js backend for all heavy lifting. This establishes the foundation for offline reliability, native push notifications, and elite list performance. *Note: Push infrastructure is a cross-domain dependency requiring coordination with the Next.js backend for token registration and payload triggering.*
**User Story:** As a tradesperson standing in a concrete basement with poor cell service, I need my Lead Feed to open instantly without crashing, allow me to scroll through thousands of local permits flawlessly, and ping my lock-screen the second a high-value job changes phases.

## 2. Platform & Device Matrix
This single Expo codebase targets three environments (Minimum OS requirements: iOS 16+ / Android 10+):
1. **Mobile (iOS/Android):** Primary target. UI must accommodate notches, dynamic islands, and safe areas.
2. **Tablet (iPad/Android):** UI must be responsive. Use NativeWind breakpoints (e.g., `md:flex-row`) to convert stacked mobile cards into side-by-side or grid layouts.
3. **Web (Expo Web):** Compiles to a PWA. *Fallback constraint:* `@shopify/flash-list` does not support Web. You must implement a standard `<FlatList>` or TanStack Virtual fallback for the web target.
**Theme Constraint:** The app must natively support System Dark Mode. NativeWind `dark:` variants are required for all UI components.

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
* **FlashList Mastery:** You MUST provide an accurate `estimatedItemSize`. 
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
