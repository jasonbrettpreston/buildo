# Spec 21 — Admin User Management & Config Hub

**Status:** ACTIVE
**Cross-references:** Spec 95 (User Profiles), Spec 96 (Mobile Subscription), Spec 20 (Stripe Web Checkout)

## 1. Goal & Context
The Buildo Admin portal (`/admin`) currently monitors the backend pipeline health and data quality. This specification expands the Admin portal to support Customer Success operations and dynamic system configuration. 

It defines two new sections:
1. **User Directory (`/admin/users`)**: Search, view, and modify user profiles and subscriptions.
2. **Configuration Hub (`/admin/config`)**: A GUI to adjust database `logic_variables` without requiring code changes.

## 2. Authentication & Authorization
Both `/admin/users` and `/admin/config` must be tightly guarded.
- **Middleware:** `src/middleware.ts` must enforce that the current user has `isAdmin === true` (or the equivalent admin claim) before serving these routes.
- **API Guard:** Every route under `/api/admin/*` must verify the admin session cookie/token before processing the request. 

## 3. User Directory (`/admin/users`)

### 3.1 Search & List View
A data table (e.g., Shadcn `<DataTable />`) displaying all registered users.
- **Searchable by:** Email, Phone Number, Full Name.
- **Columns:** User ID, Email, Phone, Profession (`trade_slug` / `account_preset`), Subscription Status, Sign-up Date.
- **Pagination:** Server-side pagination via Drizzle `limit` and `offset` is mandatory. Do not fetch all users into memory.

### 3.2 User Detail View (`/admin/users/[id]`)
Clicking a user row opens their full profile.

**Card 1: Identity & Profile**
- Full Name, Company, Email, Phone.
- `trade_slug` and `location_mode` (with home base coordinates if applicable).

**Card 2: Subscription & State**
- `subscription_status` (Dropdown: `trial`, `active`, `past_due`, `expired`, `admin_managed`, `cancelled_pending_deletion`).
- `trial_started_at`
- Stripe Customer ID (link directly to the Stripe Dashboard for this customer).

### 3.3 Customer Support Actions
Admins can perform the following overrides on a user:
1. **Extend Trial:** Adjusts `trial_started_at` to a newer date and resets `subscription_status` to `'trial'`.
2. **Manual Revoke:** Changes `subscription_status` to `'expired'`.
3. **Delete Account:** Triggers the Firebase Auth deletion and nullifies PII in `user_profiles`, setting status to `'cancelled_pending_deletion'`.
4. **Impersonation:** (Deferred to Phase 2) — generating a magic link to log in as the user.

*(Note: Financial actions like issuing refunds or cancelling paid Stripe subscriptions are handled inside the Stripe Dashboard by clicking the Stripe Customer ID link. Do not rebuild Stripe's billing UI inside Buildo.)*

## 4. Manufacturer & Enterprise Onboarding
Manufacturers bypass the standard mobile onboarding and Stripe checkout. They are provisioned manually by admins.

### 4.1 "Create Enterprise User" Flow
A modal in the Admin portal that accepts:
- Email
- Company Name
- Selected Trades (Multi-select array)
- Radius Cap (km)

**Execution:**
1. Calls Firebase Admin SDK `admin.auth().createUser({ email })` to generate a UID.
2. Sends a Firebase Password Reset email to the user so they can set their own password.
3. Inserts into `user_profiles`:
   - `user_id`: the new UID
   - `account_preset`: `'manufacturer'`
   - `trade_slug`: `NULL`
   - `trade_slugs_override`: `['plumbing', 'electrical', ...]` (The selected trades)
   - `radius_cap_km`: The assigned cap.
   - `subscription_status`: `'admin_managed'`

When the manufacturer logs into the mobile app, the AuthGate will see `onboarding_complete = false` but will immediately bypass it because `account_preset = manufacturer`, taking them straight to their multi-trade feed.

## 5. Configuration Hub (`/admin/config`)
A GUI to manage `logic_variables`. This replaces the need to run SQL migrations to change pipeline variables or app behavior.

### 5.1 UI Layout
The page is organized into categorical cards:
- **Mobile App Settings:** Free trial length, default radius, max radius.
- **Pricing Configuration:** Stripe Price IDs for Trades, Realtors, and Manufacturers.
- **Pipeline Data Quality:** Tolerances for scraper errors, missing cost estimates.
- **Lead Scoring (LoS):** Multipliers and penalties for the scoring algorithm.

### 5.2 Editing Mechanism
- The UI fetches all rows from `SELECT key, value, description FROM logic_variables`.
- Each variable renders as an input field (number or text depending on the variable type) accompanied by its `description`.
- **Save Action:** 
  1. Triggers `PATCH /api/admin/config`.
  2. Executes `INSERT INTO logic_variables (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`.
  3. Returns a success toast.

### 5.3 Required New Logic Variables
The initial rollout of the Config Hub must ensure the following variables are seeded via `apply-logic-variables.js`:

**Auth & Onboarding:**
- `free_trial_days` (default `14`)
- `otp_lockout_threshold` (default `5`)
- `checkout_nonce_expiry_mins` (default `15`)
- `onboarding_default_radius_km` (default `50`)
- `onboarding_max_radius_km` (default `150`)
- `manufacturer_radius_cap_km` (default `500`)

**Pricing (Stripe):**
- `stripe_price_id_trade`
- `stripe_price_id_realtor`
- `stripe_price_id_manufacturer`
- `stripe_portal_url`

### 5.4 Audit Logging
Any change made in the Configuration Hub MUST be logged to an `admin_audit_log` table (or Sentry) including the `admin_user_id`, the `logic_variable` key modified, the `old_value`, and the `new_value`. This prevents silent system degradation caused by accidental config changes.
