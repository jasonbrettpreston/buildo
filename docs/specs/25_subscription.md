# 25 - Billing (Stripe)

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `13_auth.md`
**Blocks:** `21_notifications.md`, `22_teams.md`, `23_analytics.md`, `24_export.md`

---

## 1. User Story

> "As a user, I want to choose a subscription plan that fits my needs, with clear pricing and easy payment management."

**Acceptance Criteria:**
- Three subscription tiers: Free, Pro ($29/mo), Enterprise ($99/mo)
- Each tier has clearly defined feature limits and access levels
- Payment is handled via Stripe Checkout (no custom payment form)
- Users manage their subscription (upgrade, downgrade, cancel) through Stripe Customer Portal
- Feature gating middleware prevents access to features beyond the user's plan
- Subscription state changes (created, updated, cancelled, payment failed) are handled via Stripe webhooks
- Pricing page clearly compares all three plans with a prominent upgrade CTA

---

## 2. Technical Logic

### Plan Definitions

| Feature | Free | Pro ($29/mo) | Enterprise ($99/mo) |
|---------|------|-------------|---------------------|
| Permit search | Basic (last 30 days) | Full history | Full history |
| Saved permits | 5 max | Unlimited | Unlimited |
| Notifications | In-app only | In-app + Email + Push | In-app + Email + Push |
| Export (CSV/PDF) | No | Yes | Yes |
| Advanced filters | No | Yes | Yes |
| Analytics dashboard | No | No | Yes |
| Team management | No | No | Yes (up to 25 members) |
| API access | No | No | Yes |
| Lead scoring detail | Basic (score only) | Full breakdown | Full breakdown |
| Priority enrichment | No | No | Yes (faster builder data) |
| Support | Community | Email | Priority email + chat |

### Stripe Integration Architecture

```
[User] -> [Pricing Page] -> [Stripe Checkout Session] -> [Stripe Hosted Payment]
                                                              |
                                                              v
[Stripe Webhook] -> [/api/billing/webhook] -> [Update user plan in Firestore]
                                                              |
                                                              v
                                            [Feature gating middleware reads plan]
```

### Stripe Checkout Flow

```
createCheckoutSession(userId, priceId):
  1. Look up or create Stripe Customer for user
     - Store stripe_customer_id in Firestore /users/{uid}
     - Use user's email as Stripe Customer email
  2. Create Checkout Session:
     - mode: 'subscription'
     - customer: stripe_customer_id
     - line_items: [{ price: priceId, quantity: 1 }]
     - success_url: https://app.buildo.ca/settings/billing?session_id={CHECKOUT_SESSION_ID}
     - cancel_url: https://app.buildo.ca/pricing
     - metadata: { user_id: userId }
     - subscription_data: { trial_period_days: 14 } (Pro only, first-time)
  3. Return Checkout Session URL
  4. Redirect user to Stripe-hosted payment page
```

### Stripe Customer Portal

```
createPortalSession(userId):
  1. Look up stripe_customer_id from Firestore /users/{uid}
  2. Create Billing Portal Session:
     - customer: stripe_customer_id
     - return_url: https://app.buildo.ca/settings/billing
  3. Return Portal Session URL
  4. Redirect user to Stripe-hosted management page

Portal allows:
  - View invoices and payment history
  - Update payment method
  - Switch plan (upgrade/downgrade)
  - Cancel subscription
```

### Webhook Handler

```
handleWebhook(event):
  Verify Stripe signature using webhook secret

  switch (event.type):
    case 'checkout.session.completed':
      - Extract customer, subscription, metadata.user_id
      - Update Firestore /users/{uid}: plan, stripe_subscription_id, plan_updated_at
      - Send welcome-to-plan email

    case 'customer.subscription.updated':
      - Extract new price/plan from subscription items
      - Update Firestore /users/{uid}: plan, plan_updated_at
      - If downgrade: schedule feature access reduction at period end

    case 'customer.subscription.deleted':
      - Set Firestore /users/{uid}: plan = 'free', plan_updated_at
      - Send cancellation confirmation email

    case 'invoice.payment_failed':
      - Set Firestore /users/{uid}: payment_status = 'past_due'
      - Send payment failed email with update-payment-method link
      - After 3 failed attempts (managed by Stripe): subscription cancelled

    case 'invoice.paid':
      - Set Firestore /users/{uid}: payment_status = 'active'
      - Clear any past_due warnings
```

### Feature Gating Middleware

```typescript
interface PlanFeatures {
  plan: 'free' | 'pro' | 'enterprise';
  maxSavedPermits: number;            // 5 | Infinity | Infinity
  searchHistoryDays: number;          // 30 | Infinity | Infinity
  notificationChannels: string[];     // ['in_app'] | ['in_app','email','push'] | [...]
  canExport: boolean;
  canUseAdvancedFilters: boolean;
  canAccessAnalytics: boolean;
  canManageTeam: boolean;
  canAccessAPI: boolean;
  hasDetailedScoring: boolean;
  hasPriorityEnrichment: boolean;
}

const PLAN_FEATURES: Record<string, PlanFeatures> = {
  free: {
    plan: 'free',
    maxSavedPermits: 5,
    searchHistoryDays: 30,
    notificationChannels: ['in_app'],
    canExport: false,
    canUseAdvancedFilters: false,
    canAccessAnalytics: false,
    canManageTeam: false,
    canAccessAPI: false,
    hasDetailedScoring: false,
    hasPriorityEnrichment: false,
  },
  pro: {
    plan: 'pro',
    maxSavedPermits: Infinity,
    searchHistoryDays: Infinity,
    notificationChannels: ['in_app', 'email', 'push'],
    canExport: true,
    canUseAdvancedFilters: true,
    canAccessAnalytics: false,
    canManageTeam: false,
    canAccessAPI: false,
    hasDetailedScoring: true,
    hasPriorityEnrichment: false,
  },
  enterprise: {
    plan: 'enterprise',
    maxSavedPermits: Infinity,
    searchHistoryDays: Infinity,
    notificationChannels: ['in_app', 'email', 'push'],
    canExport: true,
    canUseAdvancedFilters: true,
    canAccessAnalytics: true,
    canManageTeam: true,
    canAccessAPI: true,
    hasDetailedScoring: true,
    hasPriorityEnrichment: true,
  },
};

// Middleware usage
function requireFeature(feature: keyof PlanFeatures) {
  return async (req, res, next) => {
    const user = await getAuthenticatedUser(req);
    const features = PLAN_FEATURES[user.plan];
    if (!features[feature]) {
      return res.status(403).json({
        error: 'upgrade_required',
        message: `This feature requires a ${getMinimumPlan(feature)} plan.`,
        upgrade_url: '/pricing',
      });
    }
    next();
  };
}
```

### Trial Period

- Pro plan includes a 14-day free trial for first-time subscribers
- Trial is tracked by Stripe (trial_end on subscription object)
- During trial, user has full Pro features
- 3 days before trial ends, send a reminder email
- If no payment method by trial end, subscription moves to `incomplete` and user reverts to Free

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/billing/plans.ts` | Plan definitions and feature maps | Planned |
| `src/lib/billing/stripe.ts` | Stripe client initialization and helpers | Planned |
| `src/lib/billing/feature-gate.ts` | Feature gating middleware | Planned |
| `src/app/api/billing/checkout/route.ts` | Create Stripe Checkout Session | Planned |
| `src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal Session | Planned |
| `src/app/api/billing/webhook/route.ts` | Stripe webhook handler | Planned |
| `src/app/pricing/page.tsx` | Public pricing page with plan comparison | Planned |
| `src/app/settings/billing/page.tsx` | User billing settings and portal link | Planned |
| `src/components/billing/PlanComparison.tsx` | Plan comparison table component | Planned |
| `src/components/billing/UpgradePrompt.tsx` | In-context upgrade CTA component | Planned |
| `src/components/billing/PlanBadge.tsx` | Badge showing current plan in navbar | Planned |

---

## 4. Constraints & Edge Cases

- **No custom payment form:** All payment collection happens on Stripe-hosted pages. This simplifies PCI compliance (SAQ A level).
- **Webhook idempotency:** Stripe may send the same webhook event multiple times. The handler must be idempotent. Use event ID to skip already-processed events (store processed event IDs in Firestore with 48h TTL).
- **Webhook signature verification:** Every incoming webhook must be verified using the Stripe webhook signing secret. Reject requests with invalid signatures immediately.
- **Plan downgrade behavior:** When downgrading from Pro to Free, the user retains Pro features until the end of the current billing period. After that, saved permits beyond 5 become read-only (not deleted). Notification channels revert to in-app only.
- **Payment failure grace period:** Stripe's built-in dunning handles retries (3 attempts over ~3 weeks). During this period, `payment_status = 'past_due'` is shown as a warning banner but features remain active.
- **Currency:** All prices in CAD. Stripe handles currency display and conversion.
- **Tax:** Canadian sales tax (HST 13% in Ontario) applied via Stripe Tax or manual tax rate configuration.
- **Cancellation:** Cancellation takes effect at end of billing period (no prorated refunds by default). Immediate cancellation can be requested via support.
- **Multiple subscriptions:** A user can only have one active subscription at a time. The checkout flow prevents creating a second subscription if one already exists.
- **Stripe Customer mapping:** One Stripe Customer per Buildo user. The stripe_customer_id mapping is stored in Firestore and must never be overwritten (to preserve payment history).
- **Trial abuse:** Trial is offered only once per email address. Stripe's trial eligibility check prevents re-trials on the same Customer.

---

## 5. Data Schema

### Firestore: `/users/{uid}` (Billing Fields)

```typescript
interface UserBillingData {
  plan: 'free' | 'pro' | 'enterprise';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_status: 'active' | 'past_due' | 'cancelled' | 'trialing' | null;
  trial_ends_at: Timestamp | null;
  plan_updated_at: Timestamp;
  plan_period_end: Timestamp | null;     // current billing period end date
}
```

### Firestore: `/processed_events/{eventId}`

```typescript
interface ProcessedStripeEvent {
  event_id: string;                      // Stripe event ID (evt_...)
  event_type: string;
  processed_at: Timestamp;
  ttl: Timestamp;                        // auto-delete after 48h
}
```

### Stripe Product/Price Configuration

```
Product: Buildo Pro
  Price: price_pro_monthly
    Amount: $29.00 CAD / month
    Trial: 14 days (first subscription only)

Product: Buildo Enterprise
  Price: price_enterprise_monthly
    Amount: $99.00 CAD / month
    Trial: none
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Authentication (`13`) | Upstream | User identity for Stripe Customer creation and plan lookup |
| Notifications (`21`) | Downstream | Channel availability gated by plan |
| Teams (`22`) | Downstream | Team features gated to Enterprise |
| Analytics (`23`) | Downstream | Analytics access gated to Enterprise |
| Export (`24`) | Downstream | Export features gated to Pro and Enterprise |
| Search & Filter (`19`) | Downstream | Advanced filters gated to Pro and Enterprise |
| Lead Scoring (`10`) | Downstream | Detailed score breakdown gated to Pro and Enterprise |
| Builder Enrichment (`11`) | Downstream | Priority enrichment gated to Enterprise |
| Stripe Checkout | External | Hosted payment page |
| Stripe Customer Portal | External | Subscription management |
| Stripe Webhooks | External | Subscription lifecycle events |
| SendGrid | External | Plan welcome, trial reminder, payment failed emails |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Free plan features | User plan = 'free' | maxSavedPermits=5, canExport=false, canAccessAnalytics=false |
| Pro plan features | User plan = 'pro' | maxSavedPermits=Infinity, canExport=true, canAccessAnalytics=false |
| Enterprise plan features | User plan = 'enterprise' | All features enabled, canManageTeam=true |
| Feature gate - allowed | Pro user accesses export | Request passes through middleware |
| Feature gate - blocked | Free user accesses export | 403 with upgrade_required error |
| Feature gate - upgrade message | Free user blocked from analytics | Message says "requires Enterprise plan" |
| Saved permits limit | Free user with 5 saved, tries to save 6th | Error: saved permit limit reached |
| Saved permits unlimited | Pro user with 100 saved, tries to save 101st | Save succeeds |
| Downgrade behavior | Pro -> Free, user has 20 saved permits | 20 permits become read-only, no deletion |
| Trial expiration | Trial ends, no payment method | Plan reverts to 'free' |
| Webhook idempotency | Same event ID processed twice | Second processing is skipped |
| Checkout session creation | Valid user, Pro price ID | Stripe Checkout Session URL returned |
| Portal session creation | User with stripe_customer_id | Stripe Portal Session URL returned |
| Portal session - no customer | User without stripe_customer_id | Error: no billing account |
| Payment failed status | invoice.payment_failed webhook | User payment_status = 'past_due' |
| Payment recovered | invoice.paid after past_due | User payment_status = 'active' |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Pricing page layout | Three plan cards displayed side-by-side with feature comparison |
| Plan comparison table | All features listed with check/cross icons per plan |
| Current plan highlight | User's active plan card has a highlighted border and "Current Plan" label |
| Upgrade CTA | Non-Enterprise plans show "Upgrade" button; current plan shows "Current" |
| Plan badge in navbar | Small badge next to user avatar shows current plan name |
| Upgrade prompt | Blocked features show inline upgrade prompt with link to pricing page |
| Billing settings page | Shows current plan, next billing date, and "Manage Billing" button |
| Trial banner | During trial, a banner shows days remaining and prompts to add payment method |
| Past due warning | payment_status='past_due' shows a warning banner with update payment link |
| Checkout redirect | Clicking "Upgrade to Pro" redirects to Stripe Checkout |
| Portal redirect | Clicking "Manage Billing" redirects to Stripe Customer Portal |
| Cancellation confirmation | After cancellation, page shows "Plan active until {date}" message |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Stripe webhook signature | Valid signature: event processed. Invalid signature: 400 rejected |
| Webhook endpoint responds 200 | All handled event types return 200 to Stripe |
| Webhook unhandled event | Unrecognized event type returns 200 (acknowledge, no action) |
| Checkout Session creation | Stripe API creates session with correct price, customer, and metadata |
| Portal Session creation | Stripe API creates portal session with correct return URL |
| Firestore plan update | Webhook updates /users/{uid} plan field within 5 seconds |
| Processed events TTL | Firestore TTL policy auto-deletes processed_events after 48h |
| Stripe Customer creation | First checkout creates Stripe Customer and stores ID in Firestore |
| Stripe Customer reuse | Subsequent checkouts reuse existing stripe_customer_id |
| Environment isolation | Test mode Stripe keys used in staging, live keys in production |
| Webhook retry handling | Stripe retries on 5xx response; handler is idempotent |
| HST tax calculation | Invoice includes 13% HST for Ontario-based customers |
