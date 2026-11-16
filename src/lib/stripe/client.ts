// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3, §4, §5
//
// Shared Stripe server-side helpers (P26-26B). Extracted from the webhook
// route's local getStripeClient so the checkout-session (exchange), portal,
// and delete-cancel paths construct the SDK identically.
//
// Stripe API version is pinned to the SDK default (deliberate — see the
// webhook route's original note): pinning explicitly would require
// coordination with the Stripe dashboard; leaving it default keeps the SDK
// and dashboard aligned through SDK upgrades.
//
// Env contract (operator-provisioned, unverifiable at build time):
//   STRIPE_SECRET_KEY     — required by every Stripe call site.
//   STRIPE_WEBHOOK_SECRET — required by the webhook route only.
// Call sites that face users must catch the throw and map it to a NAMED 500
// (STRIPE_NOT_CONFIGURED) rather than letting it surface as a generic error
// — the 26-FOLDS §R5-style env-presence guard.

import Stripe from 'stripe';
import { MAXBLD_ORIGIN } from '@/lib/auth/host-policy';
import { resolvePriceProduct, type Product, type Queryable } from '@/lib/entitlements';

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeNotConfiguredError('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key);
}

/**
 * Load-bearing error fingerprint: route handlers `instanceof`-check this to
 * return the named STRIPE_NOT_CONFIGURED 500 envelope instead of the generic
 * INTERNAL_ERROR — so a missing env var is diagnosable from the response
 * code alone (the operator flag from 26E).
 */
export class StripeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeNotConfiguredError';
  }
}

// Subscription statuses that are already terminal — Stripe rejects a cancel /
// cancel_at_period_end update on these, so we skip them.
const TERMINAL_STRIPE_STATUSES: ReadonlySet<string> = new Set(['canceled', 'incomplete_expired']);

/**
 * The internal statuses a Stripe subscription can produce. MF-47 (RULED 2026-11-14) adds 'trial': a MaxBLD card-up-front trial is a Stripe
 * `trialing` subscription (v1 D-6 a: the one shared mapping, no product special case). One type, used by every writer and reader of it.
 */
export type StripeManagedStatus = 'trial' | 'active' | 'past_due' | 'expired';

/** Our internal subscription_status values that a Stripe event can produce. */
export type MappedSubscriptionStatus = StripeManagedStatus | null;

/**
 * Map ONE Stripe subscription status to our internal subscription_status.
 * Single source of truth — consumed by the webhook (per-event) AND the admin
 * reconcile route (over the customer's whole list). 'unpaid' maps to 'expired'
 * because Stripe sets it only after dunning is exhausted (access already lost);
 * 'trialing' maps to 'trial' (MF-47);
 * everything not access-affecting (incomplete/canceled/paused) maps to
 * null = "no managed status change".
 */
export function mapStripeSubStatus(status: Stripe.Subscription.Status): MappedSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trial';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'expired';
    default:
      return null;
  }
}

/**
 * The effective internal status for a customer given ALL their subscriptions
 * (admin reconcile). Priority active > trial > past_due > expired: a customer with
 * any paying sub is 'active'; a trialing sub (no active) is 'trial' (MF-47: a
 * trialing-only customer must never derive 'expired'); any past_due sub (no
 * active, no trial) is 'past_due'; otherwise 'expired' (including the
 * no-subscriptions case). Never returns the operator-only states
 * (admin_managed/cancelled_pending_deletion) — those are not Stripe-derivable
 * and are protected from reconcile-apply by the route.
 */
export function deriveEffectiveStripeStatus(subs: Stripe.Subscription[]): StripeManagedStatus {
  let best: StripeManagedStatus = 'expired';
  for (const sub of subs) {
    const mapped = mapStripeSubStatus(sub.status);
    if (mapped === 'active') return 'active';
    if (mapped === 'trial') best = 'trial';
    else if (mapped === 'past_due' && best !== 'trial') best = 'past_due';
  }
  return best;
}

/** The Stripe Price ID a subscription bills against (single-price-per-sub v1). */
export function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/**
 * The subscription's current period end as a Date. Stripe SDK v18+ (API
 * 2025-03-31 "basil") moved `current_period_end` off Subscription onto each
 * SubscriptionItem — single-price v1 subscriptions have exactly one item, so
 * the first item's window IS the subscription's window.
 */
export function subscriptionCurrentPeriodEnd(sub: Stripe.Subscription): Date | null {
  const unixSeconds = sub.items?.data?.[0]?.current_period_end;
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000) : null;
}

/** Narrow a `string | <expandable object> | null` Stripe reference to its id. */
export function stripeRefId(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'id' in input && typeof input.id === 'string') {
    return input.id;
  }
  return null;
}

/**
 * Per-product successor to `deriveEffectiveStripeStatus` (plan Item 4): groups
 * a customer's subscriptions by the product their price maps to
 * (`resolvePriceProduct`, OD5 default lead_gen), then applies the existing
 * single-status priority logic per group. Both legacy call sites (W4
 * reactivate, W7 reconcile) consume this map; the single-status helper remains
 * exported as the per-group primitive.
 */
export async function deriveEffectiveStripeStatusByProduct(
  db: Queryable,
  subs: Stripe.Subscription[],
): Promise<Map<Product, StripeManagedStatus>> {
  const byProduct = new Map<Product, Stripe.Subscription[]>();
  for (const sub of subs) {
    const product = await resolvePriceProduct(db, subscriptionPriceId(sub));
    byProduct.set(product, [...(byProduct.get(product) ?? []), sub]);
  }
  const result = new Map<Product, StripeManagedStatus>();
  for (const [product, prodSubs] of byProduct) {
    result.set(product, deriveEffectiveStripeStatus(prodSubs));
  }
  return result;
}

/**
 * Schedule cancel_at_period_end on ALL of a customer's live Stripe
 * subscriptions (P26-26D; user ruling 2026-07-12 — period-end, not immediate).
 * Single source of truth for BOTH the delete-time cancel (user-profile/delete)
 * and the admin retry-cancel route — so the two paths can never diverge.
 *
 * Idempotent: subscriptions already scheduled to cancel are skipped, and
 * terminal subscriptions Stripe won't touch are skipped. Returns the number of
 * subscriptions newly scheduled. THROWS on any Stripe failure — the caller
 * decides whether to mark stripe_cancel_failed_at and continue (delete does;
 * retry-cancel surfaces the error).
 */
export async function cancelAllStripeSubscriptions(customerId: string): Promise<number> {
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  let cancelled = 0;
  for (const sub of subs.data) {
    if (TERMINAL_STRIPE_STATUSES.has(sub.status)) continue;
    if (sub.cancel_at_period_end) continue; // already scheduled — idempotent
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    cancelled += 1;
  }
  return cancelled;
}

/**
 * Base URL of the public /subscribe page family (page, /success, /cancel).
 * Mirrors the session route's resolver contract: SUBSCRIBE_CHECKOUT_BASE_URL
 * must be set explicitly in any non-production environment so a misconfigured
 * staging deployment fails loud instead of silently pointing checkout
 * redirect URLs at production.
 */
export function resolveSubscribeBaseUrl(): string {
  const fromEnv = process.env.SUBSCRIBE_CHECKOUT_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://buildo.com/subscribe';
  throw new Error(
    'SUBSCRIBE_CHECKOUT_BASE_URL is required in non-production environments. ' +
      'Set it in .env to your environment-specific checkout host.',
  );
}

/**
 * Base URL (an origin) the MaxBLD checkout and portal return to (MF-47, v1 plan 3.3). Keyed by product, never by the request Host header, so no
 * request value picks a redirect target. MAXBLD_CHECKOUT_BASE_URL must be set explicitly in any non-production environment (the same fail-loud
 * rule as resolveSubscribeBaseUrl); production uses the one MaxBLD origin constant of the host table.
 */
export function resolveMaxbldCheckoutBaseUrl(): string {
  const fromEnv = process.env.MAXBLD_CHECKOUT_BASE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return MAXBLD_ORIGIN;
  throw new Error(
    'MAXBLD_CHECKOUT_BASE_URL is required in non-production environments. ' +
      'Set it in .env to your environment-specific MaxBLD origin.',
  );
}
