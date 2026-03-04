# Spec 25 -- Subscription & Billing (Stripe)

## 1. Goal & User Story
As a user, I want to choose a subscription plan (Free, Pro at $29/mo, Enterprise at $99/mo) that fits my needs, with Stripe-hosted payment and self-service subscription management. Feature gating middleware enforces plan limits across the app.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own subscription) |
| Admin | Read/Write (all) |

## 3. Behavioral Contract
- **Inputs:** Plan selection on pricing page; Stripe webhook events (checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_failed, invoice.paid)
- **Core Logic:**
  - Three tiers with escalating feature gates: Free (basic search 30d, 5 saved permits, in-app notifications only), Pro (full history, unlimited saves, export, advanced filters, email+push notifications, 14-day trial for first-time), Enterprise (all Pro features + analytics, team management up to 25, API access, priority enrichment). See plan definitions in `src/lib/subscription/plans.ts`.
  - Checkout flow: look up or create Stripe Customer, create Checkout Session (mode: subscription), redirect to Stripe-hosted payment page; success returns to billing settings
  - Subscription management: Stripe Customer Portal handles upgrades, downgrades, cancellations, payment method updates, and invoice history
  - Webhook handler: verifies Stripe signature, processes events idempotently (event ID dedup with 48h TTL in Firestore), updates user plan and payment_status in Firestore `/users/{uid}`
  - Feature gating middleware checks user plan against required feature; returns 403 with upgrade_required error and minimum plan name when blocked
  - Downgrade: Pro features retained until billing period end; saved permits beyond 5 become read-only (not deleted)
  - Payment failure: Stripe dunning handles 3 retries over ~3 weeks; user sees past_due warning banner but retains features during grace period
- **Outputs:** Stripe Checkout/Portal redirect URLs; updated plan and payment_status in Firestore; 403 responses with upgrade prompts for gated features
- **Edge Cases:**
  - Duplicate webhook events are skipped via processed event ID lookup
  - Invalid webhook signatures rejected immediately with 400
  - User without stripe_customer_id cannot create portal session (error returned)
  - Trial offered only once per email (Stripe enforces); trial expiry without payment reverts to Free
  - One active subscription per user; checkout prevents creating a second
  - All prices in CAD with HST 13% applied via Stripe Tax

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`subscription.logic.test.ts`): Plan Catalog; canAccess; isWithinLimit
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/subscription/plans.ts`
- `src/tests/subscription.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/auth/`**: Governed by Spec 13. Auth logic is read-only.
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/app/api/permits/`**: Governed by Spec 06. API is consumed, not modified.

### Cross-Spec Dependencies
- Relies on **Spec 13 (Auth)**: Uses user identity for subscription association.
- Consumed by **Spec 21 (Notifications)**: Notification channels gated by plan.
- Consumed by **Spec 22 (Teams)**: Team features gated to Enterprise plan.
- Consumed by **Spec 23 (Analytics)**: Analytics gated to Pro/Enterprise plans.
- Consumed by **Spec 24 (Export)**: Export gated to Pro/Enterprise plans.
