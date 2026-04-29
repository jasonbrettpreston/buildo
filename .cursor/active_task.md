# Active Task: WF2 — Spec 93 Step 0: Mobile Pre-flight Dependencies
**Status:** Implementation
**Workflow:** WF2 — Feature Enhancement
**Domain Mode:** Admin (mobile/ Expo source — non-Maestro)

## Context
* **Goal:** Install 10 missing mobile packages, add 3 missing `app.json` plugin entries, register `tailwindcss-safe-area` in `tailwind.config.js`, and update Jest `transformIgnorePatterns` for new native packages. This is the required pre-flight step before implementing any of Specs 93–97. Without it, all subsequent WF1s will hit missing-module errors at import time.
* **Target Spec:** `docs/specs/03-mobile/93_mobile_auth.md` (§5 Build Sequence — Step 0)
* **Key Files:**
  - `mobile/package.json` — add 10 packages; update jest transformIgnorePatterns
  - `mobile/app.json` — add expo-apple-authentication plugin, @sentry/react-native/app-plugin, Google OAuth intentFilters
  - `mobile/tailwind.config.js` — add `require('tailwindcss-safe-area')` to plugins array

## State Verification (confirmed before planning)
**`mobile/package.json` — packages confirmed MISSING:**
| Package | Required by |
|---------|------------|
| `expo-secure-store` | Spec 93 Step 1 — Firebase persistence adapter |
| `expo-apple-authentication` | Spec 93 Step 4 — Apple Sign-In (iOS) |
| `expo-web-browser` | Spec 93 Step 4 / Spec 96 Step 1 — Google OAuth + Stripe checkout |
| `expo-sharing` | Spec 97 Step 8 — CSV data export |
| `expo-blur` | Spec 96 Step 3 — inline blur over locked lead cards |
| `input-otp-native` | Spec 93 Step 4 — 6-cell OTP entry component |
| `react-native-international-phone-number` | Spec 93 Step 4 — phone number input with country dial-code |
| `tailwindcss-safe-area` | Spec 94 Step 3 — `pb-safe` class for sticky footer |
| `@react-navigation/bottom-tabs` | Spec 97 Step 5 — `useBottomTabBarHeight()` for notification pre-prompt |
| `@sentry/react-native` | Spec 90 §11 — native crash reporting |

**`mobile/app.json` plugins array — confirmed MISSING:**
- `["expo-apple-authentication"]` — required by Apple Sign-In native module
- `["@sentry/react-native/app-plugin", {...}]` — required for Sentry source maps on EAS Build
- Google OAuth URL scheme `intentFilters` on Android — required for expo-auth-session Google sign-in

**`mobile/tailwind.config.js` — `plugins: []` — confirmed MISSING:**
- `require('tailwindcss-safe-area')` — required for `pb-safe` class

**Jest `transformIgnorePatterns` — needs additions for new native packages NOT already covered by existing patterns:**
- `@sentry/react-native` (not covered by current regex)
- `react-native-international-phone-number` (not covered — `react-native` in name but full package name differs)
- `input-otp-native` (not covered)
- Note: `expo-*` packages covered by existing `expo(nent)?` regex ✅; `@react-navigation/bottom-tabs` covered by existing `@react-navigation/.*` regex ✅

## Technical Implementation
* **New/Modified Components:** Config files only — no source code
* **Data Hooks/Libs:** N/A
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** N/A — config-only change; existing test suite runs as regression check
* **logError Mandate:** N/A
* **UI Layout:** N/A — config-only

## Execution Plan

- [ ] **State Verification:** Confirmed above — 10 packages missing from `mobile/package.json`, 3 app.json plugins missing, tailwind.config.js plugins empty, 3 jest transform patterns missing.

- [ ] **Contract Definition:** N/A — no API route changes.

- [ ] **Spec Update:** `docs/specs/03-mobile/93_mobile_auth.md` Step 0 already updated in the previous session (commit `626f1b8`). Run `npm run system-map` after implementation to reflect any file changes. N/A beyond confirming Step 0 is already the authoritative reference.

- [ ] **Schema Evolution:** NO DB impact. N/A.

- [ ] **Guardrail Test:** N/A — no new behaviour to test. Existing `mobile/__tests__/` suite runs as regression proof.

- [ ] **Red Light:** N/A — no new failing tests to write for a dependency install. Baseline: run `npm run test` from root before installing to confirm current pass count.

- [ ] **Implementation (in order — run from `mobile/` directory):**

  **Step A — Install Expo SDK packages** (Expo-managed versions):
  ```bash
  cd mobile
  npx expo install expo-secure-store expo-apple-authentication expo-web-browser expo-sharing expo-blur @sentry/react-native
  ```

  **Step B — Install non-Expo npm packages** (version-pinned by us):
  ```bash
  npm install input-otp-native react-native-international-phone-number tailwindcss-safe-area @react-navigation/bottom-tabs
  ```

  **Step C — Update `mobile/app.json` plugins array** — add after the existing `expo-location` entry:
  ```json
  ["expo-apple-authentication"],
  [
    "@sentry/react-native/app-plugin",
    {
      "organization": "buildo",
      "project": "buildo-mobile"
    }
  ]
  ```
  Add to `android` section — Google OAuth URL scheme intentFilter:
  ```json
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        {
          "scheme": "com.googleusercontent.apps.REPLACE_WITH_GOOGLE_ANDROID_CLIENT_ID"
        }
      ],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
  ```
  **Note:** `REPLACE_WITH_GOOGLE_ANDROID_CLIENT_ID` is a placeholder — the actual reverse client ID comes from Google Cloud Console → Credentials → Android OAuth 2.0 Client. Do not commit a real client ID in plain text — use an EAS environment variable or substitute at build time.

  **Step D — Update `mobile/tailwind.config.js` plugins array:**
  Change `plugins: []` → `plugins: [require('tailwindcss-safe-area')]`

  **Step E — Update `mobile/package.json` jest `transformIgnorePatterns`:**
  Append `|@sentry/react-native|react-native-international-phone-number|input-otp-native` to the existing regex pattern (before the closing `))"`).

- [ ] **UI Regression Check:** N/A — no shared components modified.

- [ ] **Pre-Review Self-Checklist (5 items):**
  1. Does `expo install` pin each Expo SDK package to a version compatible with `expo ~54.0.33`? Verify no peer-dependency warnings after install.
  2. Does the `@sentry/react-native/app-plugin` require `SENTRY_DSN` or `SENTRY_AUTH_TOKEN` env vars at build time? Confirm `eas.json` or EAS Secrets covers this before first EAS Build — or document as a known gap.
  3. Does adding `tailwindcss-safe-area` to `tailwind.config.js` break the existing `presets: [require('nativewind/preset')]` order? Safe-area must come after the preset, not before.
  4. Does the Google OAuth `intentFilters` entry conflict with the existing `scheme: "buildo"` deep-link handler in `app.json`? Confirm both can coexist in the Android manifest.
  5. Are the 3 new jest `transformIgnorePatterns` entries correctly placed inside the existing negative lookahead group? Confirm the regex compiles without syntax error by running a quick jest dry-run.

- [ ] **Multi-Agent Review:** Per the review protocol (`docs/reports/` feedback memory) — **adversarial agents (Gemini + DeepSeek) are SKIPPED for pure config changes** (package.json, app.json, tailwind.config.js). Independent code reviewer agent still runs.
  Spawn `feature-dev:code-reviewer` agent (`isolation: "worktree"`). Inputs: spec path `docs/specs/03-mobile/93_mobile_auth.md`, modified files: `mobile/package.json`, `mobile/app.json`, `mobile/tailwind.config.js`. Summary: "WF2 — install 10 missing mobile packages and update 3 config files per Spec 93 Step 0 pre-flight. No logic or source code changes." Agent generates its own checklist. Fix any FAIL items before Green Light. DEFER items → `docs/reports/review_followups.md`.

- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix` from root. Paste actual terminal output. Both must show zero failures. List each prior step as DONE or N/A. → WF6.
