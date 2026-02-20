# Feature: Onboarding Wizard

## 1. User Story
"As a new user, I want a quick setup wizard to select my trades, locations, and preferences so my dashboard shows relevant leads immediately."

## 2. Technical Logic

### Wizard Steps
A 4-step linear wizard that runs once after first login. Each step validates before advancing. Progress is persisted to Firestore so users can resume if they close the browser.

| Step | Title | Purpose | Required |
|------|-------|---------|----------|
| 1 | Account Type | Select tradesperson, company, or supplier | Yes |
| 2 | Trade Selection | Multi-select from 20 trades (see `src/lib/classification/trades.ts`) | Yes (min 1) |
| 3 | Location Preferences | Define geographic focus area | No (defaults to all Toronto) |
| 4 | Notification Preferences | Set alert frequency and channels | No (defaults to daily email) |

### Step Details

**Step 1: Account Type**
* Radio button selection: tradesperson, company, supplier.
* Pre-populated from signup if account type was already selected (Spec 13).
* Determines which dashboard variant the user sees (Specs 15/16/17).
* Company type prompts for company name (stored in user profile).

**Step 2: Trade Selection**
* Grid of 20 trade cards with icon, name, and color from `TRADES` constant.
* Multi-select with visual highlight on selected trades.
* Minimum 1 trade required to proceed. Maximum: all 20.
* Supplier users select trades they supply materials for (same list, different context label).
* Search/filter input to find trades quickly.

**Step 3: Location Preferences**
* Three input modes (user picks one):
  * **Postal codes:** Comma-separated list of FSA codes (e.g., M5V, M6G, M4Y).
  * **Wards:** Multi-select dropdown of Toronto's 25 wards.
  * **Radius:** Address input with Google Places Autocomplete + radius slider (1-25 km).
* Default: all of Toronto (no filter applied).
* Postal code validation: must be valid Toronto FSA format (M[0-9][A-Z]).

**Step 4: Notification Preferences**
* Alert frequency: real-time, daily digest, weekly digest, none.
* Channels: email (always available), push notifications (browser permission prompt).
* Cost threshold: minimum est_const_cost to trigger alerts (slider: $0 - $10M+).
* Default: daily email digest, no cost threshold.

### State Machine
```
STEP_1_ACCOUNT_TYPE -> STEP_2_TRADES -> STEP_3_LOCATION -> STEP_4_NOTIFICATIONS -> COMPLETED
Any step can go BACK to previous step.
SKIP on steps 3 and 4 applies defaults and advances.
```

### Skip Option
* Steps 3 and 4 have a "Skip" button that applies sensible defaults:
  * Location: all Toronto (no geographic filter).
  * Notifications: daily email digest, no cost threshold.
* Steps 1 and 2 cannot be skipped.

### Persistence
* Each step writes progress to Firestore immediately on "Next" click.
* On wizard completion, `onboarding_completed` flag set to `true` on `/users/{uid}`.
* If user returns to `/onboarding` after completion, redirect to `/dashboard`.

## 3. Associated Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/onboarding/page.tsx` | Planned | Onboarding page with wizard container |
| `src/app/onboarding/layout.tsx` | Planned | Minimal layout (no sidebar/nav) |
| `src/components/onboarding/OnboardingWizard.tsx` | Planned | Wizard container with step management |
| `src/components/onboarding/StepAccountType.tsx` | Planned | Step 1: account type radio cards |
| `src/components/onboarding/StepTradeSelection.tsx` | Planned | Step 2: trade multi-select grid |
| `src/components/onboarding/StepLocation.tsx` | Planned | Step 3: location preference inputs |
| `src/components/onboarding/StepNotifications.tsx` | Planned | Step 4: notification preferences |
| `src/components/onboarding/WizardProgress.tsx` | Planned | Progress bar indicator |
| `src/lib/onboarding/defaults.ts` | Planned | Default preference values |
| `src/lib/onboarding/validation.ts` | Planned | Step validation logic |
| `src/tests/onboarding.logic.test.ts` | Planned | Onboarding logic unit tests |
| `src/tests/onboarding.ui.test.tsx` | Planned | Onboarding component tests |
| `src/tests/onboarding.infra.test.ts` | Planned | Onboarding Firestore integration tests |

## 4. Constraints & Edge Cases

### Constraints
* Wizard must complete in under 2 minutes for optimal conversion (design for speed).
* Trade list is static (20 trades from `TRADES` constant); changes require code deployment.
* Google Places Autocomplete requires API key and has usage costs ($2.83 per 1,000 requests).
* Browser push notification permission can only be requested once per origin; if denied, show instructions to re-enable.

### Edge Cases
* **User refreshes mid-wizard:** Firestore progress restores current step and previous selections.
* **User changes account type after step 2:** Trade selections are preserved (they still apply).
* **Invalid postal code format:** Show inline error; do not advance. Validate FSA pattern `^M[0-9][A-Z]$`.
* **Radius search with no geocodable address:** Show error "Address not found in Toronto."
* **User clicks back after completing:** Allow re-editing; re-save on next "Next" click.
* **Multiple devices:** Last write wins; Firestore merge handles concurrent edits.
* **User already completed onboarding and navigates to /onboarding:** Redirect to `/dashboard`.
* **Company type user:** Step 1 shows additional "Company Name" text input field.

## 5. Data Schema

### Firestore: `/users/{uid}` (updated fields)
```
{
  account_type:          string       // Set in Step 1
  company_name:          string|null  // Set in Step 1 (company only)
  onboarding_completed:  boolean      // Set to true on wizard completion
  onboarding_step:       number       // Current step (1-4), for resume
}
```

### Firestore: `/users/{uid}/preferences/trades`
```
{
  selected_trade_slugs:  string[]     // e.g. ["plumbing", "hvac", "electrical"]
  updated_at:            timestamp
}
```

### Firestore: `/users/{uid}/preferences/location`
```
{
  mode:                  string       // "all" | "postal_codes" | "wards" | "radius"
  postal_codes:          string[]     // e.g. ["M5V", "M6G"] (when mode = "postal_codes")
  wards:                 string[]     // e.g. ["10", "11"] (when mode = "wards")
  radius_center_lat:     number|null  // Latitude (when mode = "radius")
  radius_center_lng:     number|null  // Longitude (when mode = "radius")
  radius_center_address: string|null  // Display address (when mode = "radius")
  radius_km:             number|null  // Radius in km (when mode = "radius")
  updated_at:            timestamp
}
```

### Firestore: `/users/{uid}/preferences/notifications`
```
{
  alert_frequency:       string       // "realtime" | "daily" | "weekly" | "none"
  channels:              string[]     // ["email"] or ["email", "push"]
  min_cost_threshold:    number|null  // Minimum est_const_cost, null = no minimum
  trade_filters:         string[]     // Copy of selected_trade_slugs at time of setup
  postal_codes:          string[]     // Copy of location postal codes (denormalized)
  wards:                 string[]     // Copy of location wards (denormalized)
  cost_range:            object|null  // { min: number, max: number } or null
  updated_at:            timestamp
}
```

## 6. Integrations

### Internal
* **Auth (Spec 13):** Middleware redirects to `/onboarding` when `onboarding_completed === false`. Wizard reads `uid` from session.
* **Trade Taxonomy (Spec 07):** Step 2 uses the 20 trades defined in `src/lib/classification/trades.ts`.
* **Dashboard Tradesperson (Spec 15):** Uses `selected_trade_slugs` to filter permit feed.
* **Dashboard Company (Spec 16):** Uses `selected_trade_slugs` aggregated across team.
* **Dashboard Supplier (Spec 17):** Uses `selected_trade_slugs` to determine material demand.
* **Notifications (Spec 21):** Uses notification preferences from Step 4.
* **Search & Filter (Spec 19):** Location preferences pre-populate default filters.

### External
* **Cloud Firestore:** All preferences written to `/users/{uid}/preferences/` subcollection.
* **Google Places Autocomplete API:** Address input in Step 3 radius mode.
* **Firebase Cloud Messaging (FCM):** Browser push permission requested in Step 4 if user selects push channel.

## 7. The "Triad" Test Criteria (Mandatory)

### A. Logic Layer (`onboarding.logic.test.ts`)
* [ ] **Rule 1:** Step validation: Step 2 requires at least 1 trade selected; empty selection returns error.
* [ ] **Rule 2:** Progress state machine: steps advance 1->2->3->4->COMPLETED in order; back navigation works.
* [ ] **Rule 3:** Skip logic applies correct defaults: location = "all", notifications = daily email.
* [ ] **Rule 4:** Postal code validation accepts valid Toronto FSA codes and rejects invalid patterns.
* [ ] **Rule 5:** Default values are applied correctly when skip is used on steps 3 and 4.
* [ ] **Rule 6:** Company name is required when account_type is "company", optional otherwise.

### B. UI Layer (`onboarding.ui.test.tsx`)
* [ ] **Rule 1:** Wizard renders 4 steps with progress bar showing current step.
* [ ] **Rule 2:** Trade multi-select grid renders all 20 trades with correct icons and colors.
* [ ] **Rule 3:** Location picker renders three mode options (postal codes, wards, radius).
* [ ] **Rule 4:** Next button is disabled until step validation passes.
* [ ] **Rule 5:** Back button is hidden on step 1, visible on steps 2-4.
* [ ] **Rule 6:** Skip button renders on steps 3 and 4 only.

### C. Infra Layer (`onboarding.infra.test.ts`)
* [ ] **Rule 1:** Firestore write on step completion persists correct data to `/users/{uid}/preferences/`.
* [ ] **Rule 2:** Wizard resume loads saved progress from Firestore and restores correct step.
* [ ] **Rule 3:** `onboarding_completed` flag set to `true` in `/users/{uid}` on final step completion.
* [ ] **Rule 4:** Google Places Autocomplete loads and returns Toronto addresses.
* [ ] **Rule 5:** Push notification permission request triggers browser prompt.
