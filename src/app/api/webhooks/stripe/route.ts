// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5
//
// POST /api/webhooks/stripe — Stripe-only webhook receiver. Public route
// (no session auth) verified by the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET. Upserts per-product `entitlements` rows (Spec 116
// N2; `.cursor/phase1_plan.md` Item 4 W1 — the legacy
// user_profiles.subscription_status write surface is retired) based on the
// event type:
//   checkout.session.completed                              → 'active' (OD5 default product;
//                                                             identity via client_reference_id → user_id)
//   customer.subscription.created/updated (status='active') → 'active' (price → product fan-out, OD3)
//   invoice.payment_succeeded                               → 'active'  (past_due recovery)
//   invoice.payment_failed                                  → 'past_due'
//   customer.subscription.deleted                           → 'expired'
//   anything else                                           → 200 no-op
//
// PRICE → PRODUCT FAN-OUT (OD3, independent per-product subscriptions):
// customer.subscription.* events carry their price directly
// (items.data[0].price.id) and are the AUTHORITATIVE product-resolution
// events, mapped via `resolvePriceProduct` (logic_variables.
// stripe_price_product_map, ~60s TTL cache). checkout.session.completed does
// NOT carry price data without an extra expand round-trip — rather than add
// a Stripe API call inside the handler it writes the OD5-default product
// ('lead_gen'); the authoritative assignment corrects itself when
// subscription.created arrives moments later (the same belt-and-suspenders
// relationship the single-product design documented). invoice.* events
// resolve their product via the invoice's subscription reference against
// entitlements.stripe_subscription_id (no Stripe round-trip); an invoice
// with no resolvable subscription falls back to lead_gen and logs a WARN.
//
// Idempotency: the dedup INSERT into stripe_webhook_events and the
// entitlements upsert happen inside a single db.transaction() so a
// concurrent retry from Stripe cannot apply the same event twice. The
// transaction returns early when the INSERT collides (already-processed
// event), so the body is never re-applied.
//
// Webhook responses are `{ received: true }` — Stripe expects this shape,
// not the standard data envelope.
//
// Auth: route-guard adds /api/webhooks/stripe to PUBLIC_PREFIXES so the
// fail-closed default doesn't 401 every webhook before this handler runs.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { withTransaction } from '@/lib/db/client';
import { logError, logWarn } from '@/lib/logger';
// getStripeClient extracted to the shared module (P26-26B) so the
// checkout-session, portal, and delete-cancel paths construct the SDK
// identically. The API-version-pinning note lives there.
import {
  getStripeClient,
  mapStripeSubStatus,
  subscriptionPriceId,
  subscriptionCurrentPeriodEnd,
  stripeRefId,
} from '@/lib/stripe/client';
import {
  resolvePriceProduct,
  upsertEntitlementFromStripeEvent,
  isUuid,
  DEFAULT_PRODUCT,
  PRODUCTS,
  type Product,
} from '@/lib/entitlements';

/**
 * [P1-F6 fold] `logError` is contractually non-throwing (console + Sentry,
 * both guarded) — but several calls below run INSIDE the dedup transaction,
 * where a thrown log would roll back the dedup row and forge an infinite
 * Stripe retry loop. One line of insurance against that contract ever
 * regressing; logging must never poison the transaction.
 */
function safeLogError(...args: Parameters<typeof logError>): void {
  try {
    logError(...args);
  } catch {
    /* deliberately swallowed — see docstring */
  }
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

interface WebhookOutcome {
  newStatus: 'active' | 'past_due' | 'expired' | null;
  stripeCustomerId: string | null;
  /**
   * Internal Buildo user_id, when the Stripe object carries it in metadata.
   * The web checkout (/api/subscribe/exchange, P26-26B) writes BOTH
   * `subscription_data.metadata.user_id = <uid>` AND
   * `client_reference_id = <uid>` when creating the checkout session. When
   * present, we match by user_id instead of stripe_customer_id — that closes
   * the fail-open gap where a missed or delayed `subscription.created` event
   * would otherwise prevent later `subscription.deleted` events from revoking
   * access.
   */
  userId: string | null;
  /** items.data[0].price.id on subscription.* events; null elsewhere. */
  priceId: string | null;
  /**
   * [P1-F6 fold — Gemini MED race] `session.metadata.product` on
   * checkout.session.completed — stamped by /api/subscribe/exchange at
   * session creation from the SAME price→product map the webhook uses.
   * Validated against PRODUCTS before use; null elsewhere / when absent.
   */
  metadataProduct: string | null;
  /** The Stripe Subscription id this event belongs to, when resolvable. */
  subscriptionId: string | null;
  /** items.data[0].current_period_end on subscription.* events (net-new N2 column). */
  currentPeriodEnd: Date | null;
  /**
   * invoice.* events don't carry price data — resolve their product by
   * looking up which entitlement row tracks `subscriptionId` instead of
   * mapping a price (see header).
   */
  resolveProductViaSubscription: boolean;
}

function customerIdFromUnknown(input: unknown): string | null {
  return stripeRefId(input);
}

function userIdFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  if (!metadata) return null;
  const value = metadata.user_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Maps Stripe subscription.status to our internal status. Returns null for
// statuses we don't act on (`incomplete`, `incomplete_expired`, `trialing`,
// `paused`, `canceled` — none of which should mutate our own entitlement
// status). The single source of truth for access revocation is
// `customer.subscription.deleted` (handled in classifyEvent), not any
// status mapping here — Spec 96 §7 configures subscriptions with
// `cancel_at_period_end = true`, so users retain access through the paid
// period and only `subscription.deleted` correctly times the cutoff.
//
// mapStripeSubStatus lives in @/lib/stripe/client as the single source of
// truth, shared with the admin reconcile route so the drift-detector can
// never drift from what the webhook actually writes.

function clientReferenceIdOf(session: Stripe.Checkout.Session): string | null {
  const value = session.client_reference_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * [P1-F6 fold] Multi-item subscriptions are unsupported under OD3 (one
 * product per independent subscription) — every read below uses
 * items.data[0]. Log LOUDLY when Stripe hands us more than one item so an
 * operator notices before entitlements silently drift.
 */
function warnIfMultiItem(sub: Stripe.Subscription, eventId: string): void {
  const itemCount = sub.items?.data?.length ?? 0;
  if (itemCount > 1) {
    logWarn('[stripe-webhook]', 'subscription carries multiple items — unsupported under OD3, using items.data[0] only', {
      event_id: eventId,
      subscription_id: sub.id,
      item_count: itemCount,
    });
  }
}

/** Invoice → its subscription id. Stripe SDK v18+ moved the top-level
 *  `invoice.subscription` field under `parent.subscription_details`. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return stripeRefId(invoice.parent?.subscription_details?.subscription ?? null);
}

function classifyEvent(event: Stripe.Event): WebhookOutcome {
  switch (event.type) {
    case 'checkout.session.completed': {
      // The belt to subscription.created's suspenders: the FIRST signal that a
      // web checkout succeeded. Our /api/subscribe/exchange route sets
      // `client_reference_id = <uid>` when creating the session, so we
      // recover the internal user_id directly (no metadata dependency).
      // No price data without an expand call — but the exchange route now
      // stamps `metadata.product` at session creation ([P1-F6 fold — Gemini
      // MED race]), so the handler activates the RIGHT product directly;
      // the OD5 default remains only the no-metadata fallback (legacy /
      // third-party sessions), with subscription.created as corrector.
      const session = event.data.object as Stripe.Checkout.Session;
      const metadataProduct = session.metadata?.product;
      return {
        newStatus: 'active',
        stripeCustomerId: customerIdFromUnknown(session.customer),
        userId: clientReferenceIdOf(session) ?? userIdFromMetadata(session.metadata),
        priceId: null,
        metadataProduct:
          typeof metadataProduct === 'string' && metadataProduct.length > 0 ? metadataProduct : null,
        subscriptionId: stripeRefId(session.subscription),
        currentPeriodEnd: null,
        resolveProductViaSubscription: false,
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      // Mapping via the shared mapStripeSubStatus (single source): active ->
      // 'active', past_due -> 'past_due', unpaid -> 'expired'. Everything else,
      // INCLUDING `canceled`, maps to null (no-op) here — customer.subscription.deleted
      // is the sole canonical "access ends now" signal, so a `canceled` status
      // on an .updated event deliberately does NOT revoke access on its own.
      const newStatus = mapStripeSubStatus(sub.status);
      warnIfMultiItem(sub, event.id); // [P1-F6 fold] OD3 single-item contract
      return {
        newStatus,
        stripeCustomerId: customerIdFromUnknown(sub.customer),
        userId: userIdFromMetadata(sub.metadata),
        priceId: subscriptionPriceId(sub),
        metadataProduct: null,
        subscriptionId: sub.id,
        currentPeriodEnd: subscriptionCurrentPeriodEnd(sub),
        resolveProductViaSubscription: false,
      };
    }
    case 'invoice.payment_succeeded': {
      // Recurring payment cleared, or a past_due account recovered its card in
      // the Stripe portal. Invoice objects do NOT carry the subscription's
      // metadata.user_id, so identity resolves via the stripe_customer_id
      // fallback branch (userId null). Flips past_due → active.
      const invoice = event.data.object as Stripe.Invoice;
      return {
        newStatus: 'active',
        stripeCustomerId: customerIdFromUnknown(invoice.customer),
        userId: userIdFromMetadata(invoice.metadata),
        priceId: null,
        metadataProduct: null,
        subscriptionId: invoiceSubscriptionId(invoice),
        currentPeriodEnd: null,
        resolveProductViaSubscription: true,
      };
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        newStatus: 'past_due',
        stripeCustomerId: customerIdFromUnknown(invoice.customer),
        userId: userIdFromMetadata(invoice.metadata),
        priceId: null,
        metadataProduct: null,
        subscriptionId: invoiceSubscriptionId(invoice),
        currentPeriodEnd: null,
        resolveProductViaSubscription: true,
      };
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      warnIfMultiItem(sub, event.id); // [P1-F6 fold] OD3 single-item contract
      return {
        newStatus: 'expired',
        stripeCustomerId: customerIdFromUnknown(sub.customer),
        userId: userIdFromMetadata(sub.metadata),
        priceId: subscriptionPriceId(sub),
        metadataProduct: null,
        subscriptionId: sub.id,
        currentPeriodEnd: subscriptionCurrentPeriodEnd(sub),
        resolveProductViaSubscription: false,
      };
    }
    default:
      return {
        newStatus: null,
        stripeCustomerId: null,
        userId: null,
        priceId: null,
        metadataProduct: null,
        subscriptionId: null,
        currentPeriodEnd: null,
        resolveProductViaSubscription: false,
      };
  }
}

export const POST = withApiEnvelope(async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Raw body required for signature verification — JSON.parse'd body would
  // alter whitespace and the signature would no longer match.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Could not read body' }, { status: 400 });
  }

  if (rawBody.length === 0) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  // DoS guard: this is a public route. Without an upper-bound size check, an
  // attacker (with or without a valid signature) can POST multi-GB bodies
  // and exhaust server memory before constructEvent rejects them. Stripe's
  // largest realistic event payloads are well under 100KB; 1MB is generous
  // headroom while making the abuse case fast-fail. (request.text() has
  // already buffered the body — Next.js App Router does not apply a default
  // size limit when text/json parsing is bypassed; this is a follow-on
  // mitigation that should ideally be paired with an edge/proxy size cap
  // for true protection. Tracked in the ops runbook.)
  const MAX_BODY_BYTES = 1_048_576;
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (err) {
    // Bad signature, missing secret, malformed payload — all surface here.
    // Return 400 (not 500) so Stripe stops retrying for client-side issues.
    logError('[stripe-webhook]', err, { event: 'signature_verification_failed' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const outcome = classifyEvent(event);

  try {
    await withTransaction(async (client) => {
      // Dedup INSERT: returns 0 rows when the event_id is already present.
      // We check rowCount inside the transaction to short-circuit cleanly
      // without a stale read against the previous transaction.
      // Populate event_type + stripe_customer_id (mig 221) so the admin
      // per-user webhook history (Spec 21 §6) can correlate events to a
      // customer. Additive to the dedup contract — event_id PK is unchanged.
      const inserted = await client.query<{ event_id: string }>(
        `INSERT INTO stripe_webhook_events (event_id, event_type, stripe_customer_id) VALUES ($1, $2, $3)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id, event.type, outcome.stripeCustomerId],
      );
      if (inserted.rowCount === 0) {
        // Already processed by a concurrent retry — exit transaction without
        // applying the side effect. The 200 response below tells Stripe to
        // stop retrying.
        return;
      }

      if (outcome.newStatus === null) {
        // Recognised event but no status change required (e.g., trialing /
        // incomplete on subscription.updated), or an unknown event type.
        // The dedup row is committed so future retries skip the classifier
        // altogether.
        return;
      }

      // Identify the target USER:
      //   1. Prefer event metadata.user_id / client_reference_id — set by OUR
      //      web checkout (/api/subscribe/exchange) when it creates the Stripe
      //      session with `client_reference_id` AND
      //      `subscription_data.metadata.user_id`. This is fail-closed: if the
      //      linkage is present, no missed `subscription.created` can orphan a
      //      later `subscription.deleted` because BOTH carry the same user_id.
      //   2. Fall back to stripe_customer_id when the linkage is absent
      //      (invoice.payment_succeeded/_failed, legacy events, or third-party
      //      tools that bypass the web checkout). `user_profiles.
      //      stripe_customer_id` stays the customer-level 1:1 identity bridge
      //      (plan Item 4 legacy-column disposition) — under W8's
      //      one-Customer-per-user reuse, /api/subscribe/exchange creates and
      //      stores it BEFORE any webhook can fire, so this route no longer
      //      writes it (the legacy authoritative-overwrite re-subscriber fix
      //      is superseded by Customer reuse: the id never changes).
      //
      // FORGERY FENCE (P26, carried forward): `metadata.user_id` /
      // `client_reference_id` are set ONLY by our own checkout route
      // server-side; Stripe gives the paying customer no way to write them.
      let userId = outcome.userId;
      if (userId === null && outcome.stripeCustomerId !== null) {
        // LIMIT 1 ([P1-F6 fold]): stripe_customer_id is contractually 1:1 with
        // a user (W8), but the column carries no UNIQUE constraint — bound the
        // scan so a data-integrity breach degrades to one deterministic row,
        // never an unbounded read.
        const userRes = await client.query<{ user_id: string }>(
          `SELECT user_id FROM user_profiles WHERE stripe_customer_id = $1 LIMIT 1`,
          [outcome.stripeCustomerId],
        );
        userId = userRes.rows[0]?.user_id ?? null;
      }
      if (userId === null) {
        // Neither identifier resolved a user — log and skip. The dedup row
        // remains committed so the same orphan event isn't reprocessed
        // indefinitely.
        safeLogError(
          '[stripe-webhook]',
          new Error('Stripe event resolved no user (missing/unknown metadata.user_id and customer id)'),
          { event_id: event.id, event_type: event.type, attempted_status: outcome.newStatus,
            stripe_customer_id: outcome.stripeCustomerId },
        );
        return;
      }
      if (!isUuid(userId)) {
        // Pre-229 legacy/dev uid shapes cannot key an entitlements row (UUID
        // FK to auth.users) — treated as no-row-matched, never a 500/retry.
        safeLogError(
          '[stripe-webhook]',
          new Error('Resolved user id is not a Supabase uuid — entitlement write skipped'),
          { event_id: event.id, event_type: event.type, user_id: userId },
        );
        return;
      }

      // Identify the target PRODUCT (OD3 fan-out):
      //   - subscription.* events map their price via resolvePriceProduct.
      //   - checkout.session.completed carries no price, but our exchange
      //     route stamps `metadata.product` at session creation ([P1-F6 fold
      //     — Gemini MED race]) — read it (validated against PRODUCTS)
      //     BEFORE falling back to the OD5 default.
      //   - invoice.* events carry neither price nor metadata — resolve via
      //     which entitlement row tracks the invoice's subscription id (the
      //     partial index on stripe_subscription_id), avoiding a Stripe API
      //     round-trip inside the webhook; unresolvable → OD5 default + WARN.
      let product: Product;
      if (
        outcome.metadataProduct !== null &&
        (PRODUCTS as readonly string[]).includes(outcome.metadataProduct)
      ) {
        product = outcome.metadataProduct as Product;
      } else if (outcome.resolveProductViaSubscription) {
        product = DEFAULT_PRODUCT;
        if (outcome.subscriptionId !== null) {
          const prodRes = await client.query<{ product: Product }>(
            `SELECT product FROM entitlements WHERE stripe_subscription_id = $1 LIMIT 1`,
            [outcome.subscriptionId],
          );
          if (prodRes.rows[0]) {
            product = prodRes.rows[0].product;
          } else {
            logWarn('[stripe-webhook]', 'invoice subscription matches no entitlement row — defaulting to lead_gen', {
              event_id: event.id,
              subscription_id: outcome.subscriptionId,
            });
          }
        } else {
          logWarn('[stripe-webhook]', 'invoice event carries no subscription reference — defaulting to lead_gen', {
            event_id: event.id,
          });
        }
      } else {
        product = await resolvePriceProduct(client, outcome.priceId);
      }

      // Per-product entitlement upsert — all three legacy fences preserved
      // (out-of-order watermark keyed on event.created [fold 17], deletion
      // fence, superseded-subscription fence now keyed on
      // stripe_subscription_id). See upsertEntitlementFromStripeEvent.
      const eventCreatedAt = new Date(event.created * 1000);
      const rowCount = await upsertEntitlementFromStripeEvent(client, {
        userId,
        product,
        status: outcome.newStatus,
        stripeSubscriptionId: outcome.subscriptionId,
        currentPeriodEnd: outcome.currentPeriodEnd,
        eventCreatedAt,
      });

      if (rowCount === 0) {
        // No row applied. Three possible causes, distinguishable only by a
        // follow-up SELECT (skipped here for cost):
        //   (a) Out-of-order event — last_stripe_event_at >= event.created,
        //       rejected intentionally as a stale delivery
        //   (b) Deletion fence — the (user, product) row is
        //       'cancelled_pending_deletion' and must not be resurrected
        //   (c) Superseded-subscription fence — a terminal event from an old
        //       subscription that no longer matches the row's tracked sub id
        // We log all three the same way; do NOT throw, because throwing
        // would roll back the dedup row and Stripe would retry forever.
        // Operations should grep on `event: 'no_row_matched'` and
        // disambiguate by checking the entitlements row state.
        safeLogError(
          '[stripe-webhook]',
          new Error('No entitlements row applied (stale, deletion-fenced, or superseded event)'),
          {
            event: 'no_row_matched',
            event_id: event.id,
            event_type: event.type,
            event_created_at: eventCreatedAt.toISOString(),
            user_id: userId,
            product,
            stripe_customer_id: outcome.stripeCustomerId,
            stripe_subscription_id: outcome.subscriptionId,
            attempted_status: outcome.newStatus,
          },
        );
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    logError('[stripe-webhook]', err, { event_id: event.id, event_type: event.type });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
});
