# Spec 20 — Stripe Web Checkout & Billing

**Status:** ACTIVE
**Cross-references:** Spec 96 (Mobile Subscription), Spec 95 (User Profiles), Spec 21 (Admin User Management)

## 1. Goal & Context
To bypass mobile App Store 30% commission fees, all Buildo subscription purchases occur on the web at `buildo.com/subscribe`. This specification governs the secure handoff from the mobile app to the web, the Stripe Checkout integration, and the webhook handling that upgrades user profiles.

## 2. Dynamic Pricing Model
Buildo's pricing is not a single flat rate. It varies based on the user's role (Trade, Realtor, Manufacturer). 
To support live pricing adjustments without code deployments, the Stripe Price IDs are stored as externalized `logic_variables` in the database.

### 2.1 Billing Logic Variables
The following keys MUST exist in `logic_variables.json`:
- `stripe_price_id_trade`: The Stripe Price ID for standard Trade accounts (e.g., HVAC, Plumbing).
- `stripe_price_id_realtor`: The Stripe Price ID for Realtor accounts.
- `stripe_price_id_manufacturer`: The Stripe Price ID for Manufacturer accounts (if they pay via self-serve rather than manual invoicing).
- `stripe_portal_url`: The URL to the Stripe Customer Portal for subscription management.

When creating a checkout session, the backend reads the user's `account_preset` or `trade_slug` to dynamically determine which `logic_variable` Price ID to charge.

## 3. The Secure Handoff (Nonce Exchange)
Because we cannot securely pass a Firebase authentication token in a URL query string, we use a single-use nonce system (introduced in Spec 96).

### 3.1 Mobile App Action
When the user taps "Continue at buildo.com" on the mobile paywall:
1. Mobile calls `POST /api/subscribe/session` (Authenticated with Firebase).
2. Backend generates a cryptographically secure 32-character string (`nonce`).
3. Backend inserts into `subscribe_nonces (nonce, user_id, expires_at)` where `expires_at` is `NOW() + INTERVAL '15 minutes'`.
4. Backend returns `{ url: "https://buildo.com/subscribe?nonce=XYZ" }`.
5. Mobile opens `WebBrowser.openBrowserAsync(url)`.

### 3.2 Web App Action (`/subscribe`)
1. User lands on Next.js page `src/app/subscribe/page.tsx`.
2. The page component extracts `?nonce=XYZ` and immediately calls `POST /api/stripe/checkout-session` passing the nonce.
3. **Backend Validation:**
   - Query `subscribe_nonces` for the nonce.
   - If missing or expired → Return HTTP 400.
   - If valid → Delete the nonce immediately (`DELETE FROM subscribe_nonces WHERE nonce = $1 RETURNING user_id`).
   - Look up the `user_profiles` row using the returned `user_id`.
4. **Stripe Session Creation:**
   - Determine the correct Price ID from `logic_variables` based on the user's profile.
   - Call `stripe.checkout.sessions.create()`.
   - Pass `customer_email: user.email`.
   - Pass `client_reference_id: user.user_id` (CRITICAL for webhook linking).
   - Pass `success_url: "https://buildo.com/subscribe/success"`
   - Pass `cancel_url: "https://buildo.com/subscribe/cancel"`
5. Return the Stripe `session.url` to the client, which automatically redirects the user to the Stripe-hosted checkout page.

## 4. Stripe Webhooks (`POST /api/webhooks/stripe`)
The webhook handler is the source of truth for all subscription state transitions. It must be heavily guarded against replay attacks and invalid signatures.

### 4.1 Security Rules
- Route MUST use the raw body buffer to verify `stripe.webhooks.constructEvent()` against `STRIPE_WEBHOOK_SECRET`.
- Route MUST be idempotent. Stripe guarantees at-least-once delivery, meaning we may receive the same event twice. We use `stripe_webhook_events(event_id, processed_at)` to deduplicate.

### 4.2 Handled Events

#### `checkout.session.completed`
- Triggered when a user successfully pays on the Stripe checkout page.
- **Action:** 
  1. Extract `client_reference_id` (which is our `user_id`) and `customer` (Stripe Customer ID).
  2. `UPDATE user_profiles SET subscription_status = 'active', stripe_customer_id = $1 WHERE user_id = $2`.

#### `customer.subscription.deleted`
- Triggered when a subscription is cancelled and reaches the end of its billing period (`cancel_at_period_end`), or if it is cancelled immediately by an admin.
- **Action:** 
  1. Look up user by `stripe_customer_id`.
  2. `UPDATE user_profiles SET subscription_status = 'expired'`.

#### `invoice.payment_failed`
- Triggered when a recurring payment fails (e.g., expired card).
- **Action:**
  1. Look up user by `stripe_customer_id`.
  2. `UPDATE user_profiles SET subscription_status = 'past_due'`.
  3. Note: The user retains access during `past_due` while Stripe's Smart Retries attempt to recover the payment over a few days. If it ultimately fails, Stripe fires `customer.subscription.deleted`.

#### `invoice.payment_succeeded`
- Triggered when a recurring payment succeeds (or a past_due payment is recovered).
- **Action:**
  1. `UPDATE user_profiles SET subscription_status = 'active'`.

## 5. Subscription Management (Customer Portal)
Users must be able to update their credit card or cancel their subscription. We offload this entirely to the Stripe Customer Portal.

- **Trigger:** If a user logs into `buildo.com` and navigates to Account Settings, they click "Manage Billing".
- **Action:** Call `POST /api/stripe/portal-session`. 
- **Backend:** Looks up `user.stripe_customer_id`. If null, error. If exists, calls `stripe.billingPortal.sessions.create({ customer: id, return_url: "https://buildo.com/account" })`.
- **Redirect:** Sends the user to the Stripe Portal. Any cancellations made there will fire the `customer.subscription.deleted` webhook at the end of their billing period.

## 6. App Store Compliance Fallback
To mitigate the risk of Apple rejecting the app due to external payment links (Guideline 3.1.1):
1. The "Continue at buildo.com" CTA in the mobile app should be gated behind a Remote Config flag or `logic_variables.show_external_paywall`.
2. If Apple rejects the binary, we can toggle the variable to `false`, hiding the CTA and converting the screen to a passive "Your trial has ended. Visit our website to learn more" text, relying on the "Reader App" exemption.
