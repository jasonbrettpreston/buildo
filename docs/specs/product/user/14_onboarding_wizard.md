# Spec 14 -- Onboarding Wizard

---

<requirements>

## 1. Goal & User Story
New users complete a 4-step setup wizard to select their account type, trades, location preferences, and notification settings so their dashboard shows relevant leads immediately.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Write (own profile only) |
| Admin | None |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** Authenticated user redirected from middleware when `onboarding_completed === false`; user selections at each step
- **Core Logic:**
  - 4-step linear wizard: (1) Account Type -- radio select tradesperson/company/supplier, company type adds company name field; (2) Trade Selection -- multi-select grid from trades constant, minimum 1 required; (3) Location Preferences -- postal codes (Toronto FSA `M[0-9][A-Z]`), wards (multi-select), or radius (Google Places Autocomplete + 1-25km slider), default all Toronto; (4) Notification Preferences -- frequency (realtime/daily/weekly/none), channels (email/push), cost threshold slider, default daily email
  - Steps 1-2 are required; steps 3-4 have a "Skip" button that applies defaults
  - Progress persisted to Firestore on each "Next" click so users can resume mid-wizard
  - On completion, sets `onboarding_completed = true` on `/users/{uid}`; subsequent visits to `/onboarding` redirect to `/dashboard`
- **Outputs:** Populated Firestore subcollections at `/users/{uid}/preferences/trades`, `/users/{uid}/preferences/location`, `/users/{uid}/preferences/notifications`; updated user profile with account_type and onboarding_completed flag
- **Edge Cases:**
  - Browser refresh mid-wizard: Firestore progress restores current step and selections
  - Invalid postal code format: inline error, block advancement
  - Radius search with non-geocodable address: "Address not found in Toronto" error
  - User already completed onboarding and navigates to `/onboarding`: redirect to `/dashboard`
  - Multiple devices: last write wins via Firestore merge

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **UI** (`onboarding.ui.test.tsx`): Onboarding Default Preferences; Onboarding Step Validation; Trade Selection Toggle; Postal Code Parsing; Account Type Validation; Preferences Construction
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/onboarding/page.tsx`
- `src/components/onboarding/OnboardingWizard.tsx`
- `src/tests/onboarding.ui.test.tsx`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Read-only (trade list for selection step).
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.

### Cross-Spec Dependencies
- Relies on **Spec 13 (Auth)**: Reads user profile, writes onboarding preferences.
- Relies on **Spec 07 (Trade Taxonomy)**: Reads trade list for trade selection step (read-only).

</constraints>
