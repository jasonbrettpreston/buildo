// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//
// POST /api/webhooks/stripe — Stripe-only webhook receiver. Public route
// (no Firebase auth) verified by the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET. Updates user_profiles.subscription_status based
// on the event type:
//   checkout.session.completed                              → 'active' + stripe_customer_id
//                                                             (identity via client_reference_id → user_id)
//   customer.subscription.created/updated (status='active') → 'active' + stripe_customer_id
//   invoice.payment_succeeded                               → 'active'  (past_due recovery)
//   invoice.payment_failed                                  → 'past_due'
//   customer.subscription.deleted                           → 'expired'
//   anything else                                           → 200 no-op
//
// Re-subscriber correctness (Spec 20 §4.2 / P26): a RETURNING subscriber
// checks out again and Stripe mints a BRAND-NEW customer id (cus_NEW). The
// metadata.user_id path below writes `stripe_customer_id = $2` AUTHORITATIVELY
// (not COALESCE) and no longer gates on customer-id equality, so the new id
// overwrites the stale stored one and the account re-activates. Without this,
// the old guard silently matched 0 rows (stored cus_OLD ≠ event cus_NEW) and
// the paying re-subscriber was never reactivated.
//
// Idempotency: the dedup INSERT into stripe_webhook_events and the
// user_profiles UPDATE happen inside a single db.transaction() so a
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
import { logError } from '@/lib/logger';
// getStripeClient extracted to the shared module (P26-26B) so the
// checkout-session, portal, and delete-cancel paths construct the SDK
// identically. The API-version-pinning note lives there.
import { getStripeClient, mapStripeSubStatus } from '@/lib/stripe/client';

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
   * `subscription_data.metadata.user_id = <firebase_uid>` AND
   * `client_reference_id = <firebase_uid>` when creating the checkout
   * session. When present, we match by user_id instead of
   * stripe_customer_id — that closes the fail-open gap where a missed or
   * delayed `subscription.created` event would otherwise prevent later
   * `subscription.deleted` events from revoking access.
   */
  userId: string | null;
}

function customerIdFromUnknown(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'id' in input && typeof input.id === 'string') {
    return input.id;
  }
  return null;
}

function userIdFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  if (!metadata) return null;
  const value = metadata.user_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Maps Stripe subscription.status to our internal status. Returns null for
// statuses we don't act on (`incomplete`, `incomplete_expired`, `trialing`,
// `paused`, `canceled` — none of which should mutate our own
// subscription_status). The single source of truth for access revocation is
// `customer.subscription.deleted` (handled in classifyEvent), not any
// status mapping here — Spec 96 §7 configures subscriptions with
// `cancel_at_period_end = true`, so users retain access through the paid
// period and only `subscription.deleted` correctly times the cutoff.
//
// mapSubscriptionStatus lives in @/lib/stripe/client (mapStripeSubStatus) as the
// single source of truth, shared with the admin reconcile route so the
// drift-detector can never drift from what the webhook actually writes.

function clientReferenceIdOf(session: Stripe.Checkout.Session): string | null {
  const value = session.client_reference_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function classifyEvent(event: Stripe.Event): WebhookOutcome {
  switch (event.type) {
    case 'checkout.session.completed': {
      // The belt to subscription.created's suspenders: the FIRST signal that a
      // web checkout succeeded. Our /api/subscribe/exchange route sets
      // `client_reference_id = <firebase_uid>` when creating the session, so we
      // recover the internal user_id directly (no metadata dependency) and the
      // customer id Stripe minted for this checkout. Routes through the
      // metadata-primary UPDATE (userId non-null) which writes the customer id
      // authoritatively — correct for both first-time and re-subscribers.
      // Existing out-of-order + dedup guards make any double-activation with
      // subscription.created inert.
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        newStatus: 'active',
        stripeCustomerId: customerIdFromUnknown(session.customer),
        userId: clientReferenceIdOf(session) ?? userIdFromMetadata(session.metadata),
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
      return {
        newStatus,
        stripeCustomerId: customerIdFromUnknown(sub.customer),
        userId: userIdFromMetadata(sub.metadata),
      };
    }
    case 'invoice.payment_succeeded': {
      // Recurring payment cleared, or a past_due account recovered its card in
      // the Stripe portal. Invoice objects do NOT carry the subscription's
      // metadata.user_id, so identity resolves via the stripe_customer_id
      // fallback branch (userId null) — the customer id was stored on the
      // original activation. Flips past_due → active.
      const invoice = event.data.object as Stripe.Invoice;
      return {
        newStatus: 'active',
        stripeCustomerId: customerIdFromUnknown(invoice.customer),
        userId: userIdFromMetadata(invoice.metadata),
      };
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        newStatus: 'past_due',
        stripeCustomerId: customerIdFromUnknown(invoice.customer),
        userId: userIdFromMetadata(invoice.metadata),
      };
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        newStatus: 'expired',
        stripeCustomerId: customerIdFromUnknown(sub.customer),
        userId: userIdFromMetadata(sub.metadata),
      };
    }
    default:
      return { newStatus: null, stripeCustomerId: null, userId: null };
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

      // Identify the target row:
      //   1. Prefer event metadata.user_id / client_reference_id — set by OUR
      //      web checkout (/api/subscribe/exchange) when it creates the Stripe
      //      session with `client_reference_id` AND
      //      `subscription_data.metadata.user_id`. This is fail-closed: if the
      //      linkage is present, no missed `subscription.created` can orphan a
      //      later `subscription.deleted` because BOTH carry the same user_id.
      //   2. Fall back to stripe_customer_id when the linkage is absent
      //      (invoice.payment_succeeded/_failed, legacy events, or third-party
      //      tools that bypass the web checkout).
      //
      // Both paths are guarded against out-of-order delivery —
      // `last_stripe_event_at IS NULL OR last_stripe_event_at < $eventCreatedAt`.
      // Stripe does not guarantee delivery order, so a delayed
      // subscription.updated arriving after a subscription.deleted would
      // otherwise overwrite 'expired' back to 'active'. We track the latest
      // processed event timestamp per user and reject older events (rowCount
      // === 0, no log noise — expected behaviour).
      //
      // FORGERY FENCE (relocated — P26): the previous customer-id equality
      // guard on the user_id path (`stripe_customer_id IS NULL OR = $2`) was
      // REMOVED because it broke the re-subscriber flow — a returning customer
      // gets a NEW cus_ id every checkout, which never equals the stored one,
      // so activation silently matched 0 rows. The real fence against
      // metadata.user_id forgery is that `metadata.user_id` /
      // `client_reference_id` are set ONLY by our own checkout route
      // server-side; Stripe gives the paying customer no way to write them.
      // The customer id is therefore written AUTHORITATIVELY (`= $2`, not
      // COALESCE) so a re-subscribe overwrites cus_OLD with cus_NEW. Every
      // event that reaches this branch (checkout.session.completed,
      // subscription.created/updated) carries a customer id, so $2 is non-null
      // here.
      //
      // DELETION-STATE FENCE (P26-26D): both branches additionally refuse to
      // touch a row whose subscription_status is 'cancelled_pending_deletion'.
      // 26D's delete-time cancel schedules cancel_at_period_end, so Stripe
      // fires customer.subscription.updated NOW (status still 'active') and
      // customer.subscription.deleted LATER at period end — without this fence
      // EITHER event would overwrite the deletion state to 'active'/'expired',
      // which un-blocks the session route's DELETION_BLOCKED check and would
      // let a deleted account re-subscribe (the exact contract Spec 96 §2
      // forbids). Reactivation (Spec 95 §6.4) restores 'expired' explicitly,
      // after which webhook writes apply normally again.
      const eventCreatedAt = new Date(event.created * 1000);
      let result;
      if (outcome.userId !== null) {
        // SUPERSEDED-SUBSCRIPTION FENCE (P26 review — Reality-Check CRITICAL):
        //   `$1 = 'active' OR stripe_customer_id IS NOT DISTINCT FROM $2`
        // An ACTIVATING event (newStatus 'active') still claims the customer id
        // authoritatively (the re-subscriber fix — a returning customer's new
        // cus_id must win). But a REVOKING/downgrading event ('expired' /
        // 'past_due') only applies when the event's customer matches the
        // profile's CURRENT stripe_customer_id — so a terminal event from an
        // OLD, superseded subscription (delete -> reactivate -> re-subscribe
        // with a fresh cus_NEW; the period-end old sub fires .deleted weeks
        // later) can NOT downgrade the user's live, paid new subscription.
        // stripe_customer_id uses COALESCE so a customer-less event never NULLs
        // the stored id (Gemini HIGH).
        result = await client.query(
          `UPDATE user_profiles
           SET subscription_status = $1,
               stripe_customer_id = COALESCE($2, stripe_customer_id),
               last_stripe_event_at = $4,
               updated_at = NOW()
           WHERE user_id = $3
             AND (last_stripe_event_at IS NULL OR last_stripe_event_at < $4)
             AND subscription_status IS DISTINCT FROM 'cancelled_pending_deletion'
             AND ($1 = 'active' OR stripe_customer_id IS NOT DISTINCT FROM $2)`,
          [outcome.newStatus, outcome.stripeCustomerId, outcome.userId, eventCreatedAt],
        );
      } else if (outcome.stripeCustomerId !== null) {
        result = await client.query(
          `UPDATE user_profiles
           SET subscription_status = $1,
               last_stripe_event_at = $3,
               updated_at = NOW()
           WHERE stripe_customer_id = $2
             AND (last_stripe_event_at IS NULL OR last_stripe_event_at < $3)
             AND subscription_status IS DISTINCT FROM 'cancelled_pending_deletion'`,
          [outcome.newStatus, outcome.stripeCustomerId, eventCreatedAt],
        );
      } else {
        // Both identifiers missing — log and skip. The dedup row remains
        // committed so the same orphan event isn't reprocessed indefinitely.
        logError(
          '[stripe-webhook]',
          new Error('Stripe event has neither metadata.user_id nor a customer id'),
          { event_id: event.id, event_type: event.type, attempted_status: outcome.newStatus },
        );
        return;
      }

      if (result.rowCount === 0) {
        // No row matched. Three possible causes, distinguishable only by a
        // follow-up SELECT (skipped here for cost):
        //   (a) user_id / stripe_customer_id doesn't exist (account
        //       deleted before Stripe cleanup, or stale identifier)
        //   (b) stripe_customer_id mismatch in the WHERE guard (potential
        //       Stripe-metadata forgery — see the user_id branch above)
        //   (c) Out-of-order event — last_stripe_event_at >= $4, rejected
        //       intentionally as a stale delivery
        // We log all three the same way; do NOT throw, because throwing
        // would roll back the dedup row and Stripe would retry forever.
        // Operations should grep on `event: 'no_row_matched'` and
        // disambiguate by checking the user_profile row state.
        logError(
          '[stripe-webhook]',
          new Error('No user_profiles row matched event identifiers (or stale event)'),
          {
            event: 'no_row_matched',
            event_id: event.id,
            event_type: event.type,
            event_created_at: eventCreatedAt.toISOString(),
            user_id: outcome.userId,
            stripe_customer_id: outcome.stripeCustomerId,
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
