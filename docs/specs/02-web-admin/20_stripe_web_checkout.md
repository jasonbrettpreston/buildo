# Spec 20 — Stripe Web Checkout & Billing

**Status:** ACTIVE
**Cross-references:** Spec 96 (Mobile Subscription), Spec 95 (User Profiles), Spec 21 (Admin User Management — the Subscription-Ops admin surface), Spec 93 (Auth touchpoints)

> **Rebuilt-to-truth 2026-07-12 (P26).** The prior revision described unbuilt routes (`/api/stripe/checkout-session`, `/api/stripe/portal-session`) and a three-tier role-price matrix that was never built. This revision documents the code as shipped; retired designs are kept as **SUPERSEDED** blocks per the house convention.

## 1. Goal & Context
To bypass mobile App Store 30% commission fees, all Buildo subscription purchases occur on the web at `buildo.com/subscribe`. This spec governs: the secure mobile→web handoff (single-use nonce), the Stripe Checkout session, the webhook state machine that is the source of truth for `subscription_status`, the Customer Portal, delete-time cancellation, and the admin Subscription-Ops surface.

**Route family (as built, flat `src/app/` — no route groups):**
| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/subscribe/session` | Firebase session | Mobile mints a single-use nonce → returns the `/subscribe?nonce=…` URL. |
| `POST /api/subscribe/exchange` | **PUBLIC_EXACT** (the nonce IS the credential) | Consumes the nonce + creates the Stripe Checkout session. |
| `src/app/subscribe/{page,success,cancel}` | public | Thin client: POSTs the nonce to `/exchange`, redirects to Stripe; `/success` polls profile status. |
| `POST /api/subscribe/portal-session` | Firebase session | Customer Portal session (payment-method / cancel). |
| `POST /api/webhooks/stripe` | Stripe signature | The subscription state machine. |
| `POST /api/admin/users/[uid]/subscription/{reconcile,retry-cancel,events}` | admin | Ops surface — §7, Spec 21 §6. |

## 2. Pricing Model — single price (v1)
v1 charges **one price** for every self-serve subscriber, seeded as the `stripe_price_id_default` logic variable (migration 219; the exchange route reads it at session creation and fails loud — named 500 `STRIPE_NOT_CONFIGURED` on missing SDK key, 500 on an unset/blank price). v1 is **tax-exclusive** (Stripe Tax is filed as v-next). `stripe_portal_url` is not used — the portal is created server-side per-user (§5).

> **SUPERSEDED — role-tiered pricing (`stripe_price_id_trade/_realtor/_manufacturer`).** The original design varied price by `account_preset`. That matrix was never built and the enum it keyed on is UX/billing-only (Spec 95 §2.5.1). It returns as v-next only if role pricing becomes a real product requirement; until then a single `stripe_price_id_default` is the ratified ruling.

## 3. The Secure Handoff (Nonce Exchange)
A Firebase token cannot be safely passed in a URL, so a single-use nonce (Spec 96) bridges the mobile session to the anonymous web page.

### 3.1 Mint (`POST /api/subscribe/session`, Firebase-authed)
1. Guard already-entitled states: `active` / `admin_managed` → 400 (no checkout needed). **`past_due` → distinct 400 routing the client to the Portal** (payment-method recovery lives there; walling past_due out would block recovery).
2. In one transaction with a row-level lock (a status flip to `active` between SELECT and INSERT must not mint a nonce), insert `subscribe_nonces (nonce, user_id, expires_at = NOW() + INTERVAL '15 minutes')`; an unexpired nonce for the user is reused (double-tap safe).
3. Return `{ url: "https://buildo.com/subscribe?nonce=…" }`; mobile opens it.

### 3.2 Exchange (`POST /api/subscribe/exchange`, PUBLIC_EXACT)
The `/subscribe` page POSTs `{ nonce }` here. This route is a `PUBLIC_EXACT_API_PATHS` entry — `/api/subscribe/*` otherwise prefix-inherits `authenticated`, but the nonce is the credential (the webhook's exact-path pattern).
1. **Atomically consume** the nonce: `DELETE FROM subscribe_nonces WHERE nonce = $1 AND expires_at > NOW() RETURNING user_id`. Zero rows (missing / expired / already-consumed) → an **indistinguishable 400** (no oracle).
2. Create the Checkout session (`mode: 'subscription'`, price = `stripe_price_id_default`) carrying **BOTH linkage fields** — `client_reference_id = user_id` AND `subscription_data.metadata.user_id = user_id` (half-linkage breaks the webhook contract) — with `success_url`/`cancel_url` under the resolved base URL.
3. Return the Stripe session URL; the client redirects. **Activation happens ONLY via the webhook** — the return pages are cosmetic (§3.3).

### 3.3 Return pages
`/subscribe/success` is not merely cosmetic: it briefly polls the profile status ("Payment received — your account is being upgraded…" → confirmed; bounded retries → "you'll be active shortly"), never a false "done". `/subscribe/cancel` returns the user to the app.

## 4. Stripe Webhooks (`POST /api/webhooks/stripe`) — the state machine
The webhook is the sole source of truth for `subscription_status`. Raw-body signature verification against `STRIPE_WEBHOOK_SECRET`; a bad signature → 400 (so Stripe stops retrying a client-side issue).

### 4.1 Idempotency + correlation
Dedup via `stripe_webhook_events`: the event id is the PK; a duplicate INSERT returns 0 rows and short-circuits inside the transaction. Migration 221 added `event_type` + `stripe_customer_id` to this ledger (populated going forward) so the admin per-user history (§7) can correlate events to a customer.

### 4.2 Event map (as built)
| Event | Resulting status | Notes |
|-------|------------------|-------|
| `checkout.session.completed` | `active` (+ store `stripe_customer_id`) | Belt to subscription.created; recovers `user_id` from `client_reference_id`. |
| `customer.subscription.created` / `.updated` | mapped from sub status (`mapStripeSubStatus`) | active / past_due / expired(unpaid) / no-op. |
| `invoice.payment_succeeded` | `active` | past_due recovery (customer-id fallback). |
| `invoice.payment_failed` | `past_due` | access retained during Smart Retries. |
| `customer.subscription.deleted` | `expired` | end-of-period or admin cancel. |

**Re-subscriber fix (was live money damage):** the activation branch is **metadata-primary** — when `metadata.user_id`/`client_reference_id` is present it matches by `user_id` and writes `stripe_customer_id = $2` **authoritatively** (dropping the old `stripe_customer_id IS NULL OR = $2` equality that made a returning customer's activation a silent 0-row, because re-checkout mints a NEW `cus_…`). The out-of-order guard (`last_stripe_event_at`) and event-dedup stay. The forgery fence is preserved: `metadata.user_id` is settable only by our exchange route.

**Deletion-state fence:** both UPDATE branches carry `AND subscription_status IS DISTINCT FROM 'cancelled_pending_deletion'` — a post-deletion `subscription.updated`/`.deleted` (fired by §6's period-end cancel) can never flip a deleted account back to active/expired and re-open the re-subscribe path (Spec 96 §2).

## 5. Customer Portal (`POST /api/subscribe/portal-session`, Firebase-authed)
Card updates and cancellations are offloaded to the Stripe Customer Portal. Backend looks up `stripe_customer_id`; NULL → 400 `NO_STRIPE_CUSTOMER`; else `stripe.billingPortal.sessions.create({ customer, return_url })`. The mobile app replaces its static billing URL with a `usePortalSession` hook (manufacturer-hide preserved). Portal cancellations fire `customer.subscription.deleted` at period end.

## 6. Delete-time cancellation (§6-DELETE)
Account deletion (Spec 95 §6.3) schedules **`cancel_at_period_end` on ALL** the customer's live subscriptions (period-end per the **2026-07-12 ruling** — the deleter keeps the paid period; the earlier immediate-cancel design is retired). The call is **loud-non-fatal**: a Stripe outage never blocks the user's right to delete — the failure is logged AND the durable `stripe_cancel_failed_at` marker (migration 220) is set, cleared by the operator sweep (`docs/runbook/stripe_cancel_failed_sweep.md`) or the admin retry route (§7). The shared `cancelAllStripeSubscriptions` helper (`@/lib/stripe/client`) is the single source for both delete-time and admin retry. Reactivation within the 30-day window needs no Stripe resurrection (reactivate → `expired` → re-subscribe).

## 7. Admin Subscription-Ops routes
P26 contributes three server routes under `/api/admin/users/[uid]/subscription/`; **Spec 21 §6 owns the admin SURFACE** that calls them. All are `verifyAdminAuth`-gated; the two mutations require an attributable **session** admin and write one `admin_audit_log` row each.
- `GET reconcile` — live-derive the customer's effective Stripe status and report stored-vs-Stripe drift (read-only).
- `POST reconcile { apply:true, reason }` — apply the Stripe truth. **Refuses (409)** to touch `cancelled_pending_deletion` / `admin_managed` (never resurrect a deleted or demote a comp account); the UPDATE carries the same deletion fence as the webhook.
- `POST retry-cancel { reason }` — re-run the period-end cancel for a user with `stripe_cancel_failed_at` set; clears the marker on success, **retains it (502) on Stripe failure** (no false success).
- `GET events` — per-customer webhook history from the correlated ledger (§4.1); NULL-`event_type` rows predate migration 221 (honest "history since deploy").

## 8. App Store Compliance Fallback
To mitigate Apple Guideline 3.1.1 rejection risk:
1. The "Continue at buildo.com" CTA is gated behind `logic_variables.show_external_paywall`.
2. If Apple rejects the binary, toggle the variable `false` — the CTA becomes passive "Your trial has ended…" copy (the "Reader App" exemption).

## 9. Operating Boundaries
**Target files:** `src/app/api/subscribe/**`, `src/app/subscribe/**`, `src/app/api/webhooks/stripe/route.ts`, `src/app/api/user-profile/delete/route.ts`, `src/app/api/admin/users/[uid]/subscription/**`, `src/lib/stripe/client.ts`, `src/lib/admin/subscription-ops-schemas.ts`, migrations 219–221.
**Out of scope:** role-tiered pricing (v-next); promo codes; Stripe Tax (filed); the mobile paywall UI (Spec 96); `plans.ts` deletion (WS3); impersonation/refunds/invoices (a future billing-ops spec if ever real).
**Cross-spec dependencies:** Spec 96 (mobile subscription + paywall), Spec 95 (profile data model + reactivation §6.4), Spec 21 (admin surface), Spec 93 (auth), Spec 33 (admin engineering conventions).

## 10. Known Failure Modes
- **STRIPE_* env presence is operator-provisioned, unverifiable at build time.** Missing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `stripe_price_id_default` surface as NAMED 500s (`STRIPE_NOT_CONFIGURED`), not silent failures.
- **The dedup ledger's `stripe_customer_id` is NULL for pre-mig-221 rows and for events with no customer** — the per-user history is honestly "since the correlation columns shipped".
- **Same-second out-of-ORDER apply** (two events with identical `created`) is a low residual; the `stripe_webhook_events` PK makes double-*processing* impossible, so only apply-order is at issue. Filed.
- **`cancel_at_period_end` on delete keeps a deleted account's subscription billing until period end** — deliberate (the deleter keeps the paid period); both variants stop future billing.
