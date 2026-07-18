# Stripe webhook + checkout smoke (P26-26E)

> **Note (2026-07-18):** the seeded Firebase uid flow below changes to a Supabase uuid at Supabase migration program Phase 1 (`.cursor/active_task.md`); this runbook is rewritten then.

**Owning spec:** `docs/specs/02-web-admin/20_stripe_web_checkout.md` (the money loop as built)
**Purpose:** First-validation of the LIVE Stripe event shapes against the webhook state machine + a real end-to-end test-card checkout. The mocked-SDK suites (13 test files) prove the *logic*; this runbook is the one thing they can't — that Stripe's *actual* payloads parse and drive the right DB transitions. **Human step — needs a Stripe test-mode account + the CLI + the app running.**

## 0. Why this exists (honest boundary)
`stripe trigger <event>` sends Stripe's **fixture** payloads — they do NOT carry our `subscription_data.metadata.user_id` / `client_reference_id`. So `trigger` validates:
- signature verification (`constructEvent` against `STRIPE_WEBHOOK_SECRET`),
- event **shape/parsing** (no 500, correct `classifyEvent` branch),
- dedup ledger writes (`stripe_webhook_events`),
- the **customer-id fallback** branch (userId null → match by `stripe_customer_id`).

It does NOT exercise the **metadata-primary** path (our user_id linkage) or the re-subscriber fix — those require a **real checkout** (§3, the test-card pass), which is the only way our metadata reaches Stripe.

## 1. Prereqs
- Stripe **test mode** account; `stripe login` (or `STRIPE_API_KEY` test key).
- App running locally: `npm run safe-start` (Next.js on :3000).
- `.env`: `STRIPE_SECRET_KEY=sk_test_…`, `stripe_price_id_default` seeded (mig 219), `SUBSCRIBE_CHECKOUT_BASE_URL` set (non-prod).
- A **seeded `user_profiles` row** (Firebase uid you control), `subscription_status='trial'`, `stripe_customer_id=NULL`.

## 2. Event-shape smoke (`stripe listen` + `trigger`)

1. Start the forwarder — it prints the signing secret:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   # -> "Ready! Your webhook signing secret is whsec_…"
   ```
   Put that `whsec_…` in `.env` as `STRIPE_WEBHOOK_SECRET` and restart the app (Zod fails fast if absent).

2. Fire each handled event and confirm the forwarder shows **`200 [received]`** (never 400/500) and the mapping below. Query `user_profiles` / `stripe_webhook_events` after each:

   | `stripe trigger <event>` | Expected: webhook 200, and… |
   |--------------------------|------------------------------|
   | `checkout.session.completed` | a row in `stripe_webhook_events` (event_id + event_type + customer_id, mig 221); fixture has no metadata → matches by customer-id fallback only |
   | `customer.subscription.created` / `.updated` | 200; `mapStripeSubStatus(status)` branch; no crash on the fixture shape |
   | `invoice.payment_succeeded` | 200 → (fallback branch) would set `active` for the matched customer |
   | `invoice.payment_failed` | 200 → `past_due` |
   | `customer.subscription.deleted` | 200 → `expired` (fenced against `cancelled_pending_deletion`) |
   | any other (`customer.discount.created`) | 200 no-op, dedup INSERT only, no UPDATE |

3. **Idempotency:** re-run the SAME `stripe trigger` (Stripe re-sends the same `evt_…` on retry) → the second delivery hits `ON CONFLICT (event_id) DO NOTHING`, short-circuits, still returns 200. Confirm exactly ONE `stripe_webhook_events` row per event id.

4. **Signature:** `curl -XPOST localhost:3000/api/webhooks/stripe -d '{}'` (no `Stripe-Signature`) → **400** "Missing signature"; a bad signature → **400** "Invalid signature" (Stripe stops retrying client-side errors).

## 3. End-to-end test-card pass (the metadata-primary + re-subscriber path)
The only path that exercises OUR linkage. Do this once per money-loop change:

1. Mint a nonce: `POST /api/subscribe/session` (as the seeded, Firebase-authed user) → `{ url: "…/subscribe?nonce=…" }`.
2. Open `/subscribe?nonce=…` → it POSTs to `/api/subscribe/exchange` (PUBLIC_EXACT) → redirects to the Stripe-hosted checkout.
3. Pay with test card **`4242 4242 4242 4242`**, any future expiry/CVC.
4. Stripe fires `checkout.session.completed` **with our `client_reference_id` + `subscription_data.metadata.user_id`** → the metadata-primary UPDATE sets `subscription_status='active'` + stores the minted `stripe_customer_id`. Confirm the DB row flips to `active`.
5. `/subscribe/success` polls the profile → shows the confirmed state (never a false "done").
6. **Re-subscriber:** cancel the sub in the Stripe dashboard (→ `subscription.deleted` → `expired`), then repeat steps 1–4. A NEW `cus_…` is minted; confirm the webhook overwrites `stripe_customer_id` authoritatively and re-activates (the P26 re-subscriber fix).
7. **Portal:** `POST /api/subscribe/portal-session` → returns a Stripe portal URL; "Cancel" there schedules `cancel_at_period_end` → `subscription.deleted` at period end.
8. **Delete-cancel:** delete the account (self-serve or admin) → confirm all live subs get `cancel_at_period_end=true` (period-end ruling); on a forced Stripe failure, `stripe_cancel_failed_at` is set.

## 4. Acceptance (Green Light for the money loop's live behavior)
- ✅ every handled event returns 200; every unhandled returns 200 no-op
- ✅ exactly one `stripe_webhook_events` row per event id (idempotent)
- ✅ signature failure → 400 (no retry storm)
- ✅ the test-card pass flips `trial/expired → active` with the correct `stripe_customer_id`
- ✅ re-subscribe (new `cus_…`) re-activates authoritatively
- ✅ delete schedules period-end cancel + sets the marker on failure

## Notes
- **`STRIPE_*` env presence is an operator flag, unverifiable at build time** — a missing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `stripe_price_id_default` surfaces as a NAMED 500 (`STRIPE_NOT_CONFIGURED`), not a silent failure (Spec 20 §10).
- The nonce single-use contract (issue → exchange consumes via `DELETE … RETURNING` → second use 400) is proven by `src/tests/db/subscribe-nonce-roundtrip.db.test.ts`; this runbook validates the *live* Stripe half.
