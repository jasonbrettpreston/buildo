// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2
//            docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4b
//
// POST /api/subscribe/exchange — the web checkout's nonce consumer (P26-26B).
// This is the endpoint whose absence made subscribe_nonces write-only: the
// session route mints nonces, THIS route redeems them. Flow:
//
//   1. Body `{ nonce }` (Zod).
//   2. Atomically consume the nonce: DELETE ... WHERE nonce = $1 AND
//      expires_at > NOW() RETURNING user_id. Single statement = single-use
//      is structural (two concurrent exchanges race on the row delete; only
//      one gets the RETURNING row). 0 rows → 400 INVALID_NONCE — expired,
//      already-consumed, and never-existed are DELIBERATELY indistinguishable
//      (an attacker probing nonce values learns nothing about which failure
//      mode they hit).
//   3. Resolve the user's Stripe Customer (W8, `.cursor/phase1_plan.md`
//      Item 4 / fold 4): reuse user_profiles.stripe_customer_id when stored;
//      create-and-store exactly once otherwise (one Customer per user — the
//      invoice-event identity bridge). Then create the Stripe Checkout
//      Session (mode: subscription) on that Customer, carrying BOTH linkage
//      fields — `client_reference_id` AND
//      `subscription_data.metadata.user_id` — so checkout.session.completed
//      AND every customer.subscription.* event can resolve the internal user
//      without depending on stripe_customer_id (the re-subscriber contract;
//      half-linkage breaks the webhook contract).
//   4. Return { url } — the caller redirects to Stripe-hosted checkout.
//
// Activation happens ONLY via the webhook; the /subscribe/success return page
// is cosmetic-plus-polling, never a source of truth.
//
// AUTH (route-guard trap, caught at plan time): /api/subscribe/* would
// prefix-inherit 'authenticated' from AUTHENTICATED_API_ROUTES, but the web
// browser mid-handoff has NO Firebase session — the nonce IS the credential.
// This path is a PUBLIC_EXACT_API_PATHS entry (the webhook's exact pattern);
// exact-match so no sibling path can inherit public status.
//
// Env/config presence guards (26-FOLDS §R5-style): missing STRIPE_SECRET_KEY
// → named 500 STRIPE_NOT_CONFIGURED; unset/blank stripe_price_id_default →
// named 500 STRIPE_PRICE_NOT_CONFIGURED. Never a silent deep failure.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { query, withTransaction } from '@/lib/db/client';
import { logError } from '@/lib/logger';
import {
  getStripeClient,
  resolveSubscribeBaseUrl,
  StripeNotConfiguredError,
} from '@/lib/stripe/client';

// Nonces are randomUUID() (36 chars). Bound the accepted shape so junk bodies
// fail fast without touching the database.
const ExchangeBodySchema = z.object({
  nonce: z.string().min(8).max(64),
});

const PRICE_VARIABLE_KEY = 'stripe_price_id_default';

/** Named 500 for an unconfigured price row (operator has not set the Stripe Price ID). */
class PriceNotConfiguredError extends Error {
  constructor() {
    super(`logic_variables.${PRICE_VARIABLE_KEY} is empty — set the Stripe Price ID`);
    this.name = 'PriceNotConfiguredError';
  }
}

async function loadDefaultPriceId(): Promise<string> {
  const rows = await query<{ variable_value_json: unknown }>(
    `SELECT variable_value_json FROM logic_variables WHERE variable_key = $1`,
    [PRICE_VARIABLE_KEY],
  );
  const value = rows[0]?.variable_value_json;
  // Seeded '""' (mig 219) until the operator sets a real price id. Anything
  // that isn't a `price_...` string is unconfigured — fail loud, named.
  if (typeof value !== 'string' || !value.startsWith('price_')) {
    throw new PriceNotConfiguredError();
  }
  return value;
}

const invalidNonce = () =>
  NextResponse.json(
    {
      data: null,
      // One code + one message for expired / consumed / unknown — deliberately
      // indistinguishable (see header comment).
      error: { code: 'INVALID_NONCE', message: 'This checkout link is invalid or has expired.' },
      meta: null,
    },
    { status: 400 },
  );

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' }, meta: null },
      { status: 400 },
    );
  }
  const parsed = ExchangeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    // Malformed nonce shape gets the SAME response as a wrong nonce — a
    // probing client cannot distinguish "bad shape" from "unknown value".
    return invalidNonce();
  }
  const { nonce } = parsed.data;

  try {
    // Atomic single-use consume. withTransaction is not strictly required for
    // a single statement, but keeps the mutation inside the standard
    // transaction boundary (engineering standards §R9-equivalent for src/).
    const consumed = await withTransaction(async (client) => {
      const res = await client.query<{ user_id: string }>(
        `DELETE FROM subscribe_nonces
         WHERE nonce = $1 AND expires_at > NOW()
         RETURNING user_id`,
        [nonce],
      );
      return res.rows[0]?.user_id ?? null;
    });

    if (consumed === null) {
      return invalidNonce();
    }
    const userId = consumed;

    // Config + env presence guards BEFORE the Stripe call.
    const priceId = await loadDefaultPriceId();
    const stripe = getStripeClient();
    const baseUrl = resolveSubscribeBaseUrl();

    // Stripe Customer REUSE (`.cursor/phase1_plan.md` Item 4 W8, fold 4):
    // one Customer per user, forever. A stored stripe_customer_id is passed
    // as `customer:` so Stripe reuses it; a NEW Customer is created ONLY on
    // the first-ever checkout and persisted back onto user_profiles. This
    // keeps stripe_customer_id a stable 1:1 identity bridge — the webhook's
    // customer-id-fallback identification path (invoice events carry no
    // metadata.user_id) depends on exactly that, and a second product's
    // checkout landing on the SAME Customer is what lets its invoice events
    // resolve too. The COALESCE write guard makes concurrent first checkouts
    // race-safe: the loser adopts the winner's stored id (and its own
    // just-created Customer is simply never used — inert, no billing state).
    const profileRows = await query<{ email: string | null; stripe_customer_id: string | null }>(
      `SELECT email, stripe_customer_id FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    const email = profileRows[0]?.email ?? null;
    let customerId = profileRows[0]?.stripe_customer_id ?? null;
    if (!customerId) {
      const created = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { user_id: userId },
      });
      const stored = await query<{ stripe_customer_id: string }>(
        `UPDATE user_profiles
         SET stripe_customer_id = COALESCE(stripe_customer_id, $2), updated_at = NOW()
         WHERE user_id = $1
         RETURNING stripe_customer_id`,
        [userId, created.id],
      );
      customerId = stored[0]?.stripe_customer_id ?? created.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // BOTH linkage fields — the webhook contract (see header). Losing either
      // one re-opens the re-subscriber / missed-event identity gap.
      client_reference_id: userId,
      subscription_data: { metadata: { user_id: userId } },
      // W8: always the stored/created Customer — never customer_email (Stripe
      // rejects passing both, and an email-only session would mint a NEW
      // Customer per checkout, breaking the 1:1 bridge above).
      customer: customerId,
      success_url: `${baseUrl}/success`,
      cancel_url: `${baseUrl}/cancel`,
    });

    if (!session.url) {
      // Hosted checkout always returns a url; a null here is an API-contract
      // surprise worth failing loudly on rather than redirecting to nowhere.
      logError('[subscribe/exchange]', new Error('Stripe session created without a url'), {
        session_id: session.id,
      });
      return NextResponse.json(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: { url: session.url }, error: null, meta: null });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      logError('[subscribe/exchange]', err, { event: 'stripe_not_configured' });
      return NextResponse.json(
        { data: null, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payment processing is not configured' }, meta: null },
        { status: 500 },
      );
    }
    if (err instanceof PriceNotConfiguredError) {
      logError('[subscribe/exchange]', err, { event: 'price_not_configured' });
      return NextResponse.json(
        { data: null, error: { code: 'STRIPE_PRICE_NOT_CONFIGURED', message: 'Subscription pricing is not configured' }, meta: null },
        { status: 500 },
      );
    }
    // NOTE: the nonce was already consumed if we got past the DELETE — a
    // Stripe-side failure here costs the user one round-trip through the app's
    // paywall CTA (the session route mints a fresh nonce). Acceptable v1 cost;
    // re-inserting the nonce on failure would re-open the single-use contract.
    logError('[subscribe/exchange]', err, { event: 'unexpected' });
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
      { status: 500 },
    );
  }
});
