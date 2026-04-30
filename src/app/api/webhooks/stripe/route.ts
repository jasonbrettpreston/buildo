// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//
// POST /api/webhooks/stripe — Stripe-only webhook receiver. Public route
// (no Firebase auth) verified by the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET. Updates user_profiles.subscription_status based
// on the event type:
//   customer.subscription.created/updated (status='active') → 'active' + stripe_customer_id
//   invoice.payment_failed                                  → 'past_due'
//   customer.subscription.deleted                           → 'expired'
//   anything else                                           → 200 no-op
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

// Stripe API version is pinned to the SDK default. Pinning explicitly here
// would require coordination with the Stripe dashboard; leaving it default
// means the SDK and the dashboard stay aligned through SDK upgrades.
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key);
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
   * The web checkout (out of scope for this task) is contracted to write
   * `metadata: { user_id: <firebase_uid> }` when creating the Stripe customer
   * and subscription. When present, we match by user_id instead of
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
// subscription_status).
//
// 'canceled' is intentionally excluded: Spec 96 §7 configures subscriptions
// with `cancel_at_period_end = true`, meaning the user retains access through
// the end of their paid period after they cancel. The canonical signal for
// access revocation is `customer.subscription.deleted` (mapped to 'expired'
// in classifyEvent, NOT here). Mapping 'canceled' here would lock out paying
// customers immediately on cancel, breaching the user agreement.
//
// 'unpaid' DOES revoke access — Stripe sets this status only after dunning
// retries are exhausted, so the user has already lost their subscription.
function mapSubscriptionStatus(status: Stripe.Subscription.Status): WebhookOutcome['newStatus'] {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'expired';
    default:
      return null;
  }
}

function classifyEvent(event: Stripe.Event): WebhookOutcome {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      // Spec §10 Step 5 mapping: covers active / past_due directly. canceled
      // and unpaid both end access — write 'expired'. The customer.subscription.deleted
      // event is the canonical "access ends now" signal; canceled here covers
      // the rare case where the event arrives via an updated event first.
      const newStatus = mapSubscriptionStatus(sub.status);
      return {
        newStatus,
        stripeCustomerId: customerIdFromUnknown(sub.customer),
        userId: userIdFromMetadata(sub.metadata),
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
      const inserted = await client.query<{ event_id: string }>(
        `INSERT INTO stripe_webhook_events (event_id) VALUES ($1)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id],
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
      //   1. Prefer event metadata.user_id — set by the web checkout when it
      //      creates the Stripe customer/subscription (see types.ts contract
      //      with `buildo.com/subscribe` page). This is fail-closed: if the
      //      metadata is correct, no missed `subscription.created` can
      //      orphan a later `subscription.deleted` because BOTH carry the
      //      same metadata.
      //   2. Fall back to stripe_customer_id when metadata is absent (legacy
      //      events from before metadata wiring, or third-party tools that
      //      bypass the web checkout).
      // The UPDATE also writes stripe_customer_id when matching by user_id,
      // so the next event for the same customer benefits from the indexed
      // path even without metadata.
      let result;
      if (outcome.userId !== null) {
        result = await client.query(
          `UPDATE user_profiles
           SET subscription_status = $1,
               stripe_customer_id = COALESCE(stripe_customer_id, $2),
               updated_at = NOW()
           WHERE user_id = $3`,
          [outcome.newStatus, outcome.stripeCustomerId, outcome.userId],
        );
      } else if (outcome.stripeCustomerId !== null) {
        result = await client.query(
          `UPDATE user_profiles
           SET subscription_status = $1, updated_at = NOW()
           WHERE stripe_customer_id = $2`,
          [outcome.newStatus, outcome.stripeCustomerId],
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
        // No row matched. This means the user_id (or stripe_customer_id)
        // doesn't exist in user_profiles — either an account was deleted
        // before Stripe finished cleanup, or the metadata carries a stale
        // identifier. Log and continue; do NOT throw, because throwing
        // would roll back the dedup row and Stripe would retry forever.
        logError(
          '[stripe-webhook]',
          new Error('No user_profiles row matched event identifiers'),
          {
            event_id: event.id,
            event_type: event.type,
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
