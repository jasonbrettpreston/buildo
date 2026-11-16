// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3-§4 (dated note 2026-11-14, MF-47)
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 OD3/OD5, §5 OD4 (dated note 2026-11-14)
//            docs/specs/02-web-admin/128_surface_standard_policy.md §2 rule 3 (every tunable is a registered setting)
//
// MF-47 (RULED 2026-11-14 under the operator's acceptance; v1 plan section 12 folds 1, 2, 9-12, 15) · the MaxBLD checkout and Customer Portal,
// framework-free (the 'use server' wrappers in src/app/(maxbld)/parcel-tool/subscribe/actions.ts add the session and the redirect).
//   Basic and Pro are two Stripe Products, each with its price id in an admin setting (migration 322, empty until set); the plan chosen by the
//   caller picks the setting; a price that is unset, not `price_...`, or not mapped to parcel_tool in stripe_price_product_map refuses with a named
//   code and NO Stripe call (never a fallback to the other plan or to lead_gen).
//   Money rule (C-4, reactivate/route.ts:89-90): ONE short DB transaction (profile row, lock, deletion and entitlement checks, the settings reads),
//   committed BEFORE the first Stripe call; nothing holds a lock across the network.
//   Trial: one setting for both plans, sent per session as subscription_data.trial_end (calendar months), only to a buyer with no parcel_tool row
//   and no past MaxBLD subscription (v1 D-3 a, D-7 a); the session and the subscription carry metadata.trial = '1' so the webhook's one trial
//   writer (customer.subscription.created, trialing) is the only one.
//   Tax: automatic_tax + customer_update address auto + billing address collection, only while stripe_tax_enabled = 1 (RULED line 3).
//   Every refusal is logged under TAG with a named event (C-11); the caller gets a closed code, never a Stripe message.
import { query, withTransaction } from '@/lib/db/client';
import {
  addMonthsClamped,
  getEntitlementStatus,
  getEntitlementStatusForUpdate,
  isUuid,
  PLAN_KEYS,
  resolvePriceProduct,
  type PlanKey,
  type Queryable,
} from '@/lib/entitlements';
import { logError, logInfo } from '@/lib/logger';
import { getStripeClient, resolveMaxbldCheckoutBaseUrl, StripeNotConfiguredError } from '@/lib/stripe/client';
import { readPlanPriceIds } from '@/lib/stripe/parcel-plans';
import seedJson from '../../../scripts/seeds/logic_variables.json';

const TAG = '[stripe/parcel-checkout]';

export const TRIAL_MONTHS_KEY = 'parcel_tool_trial_months';
export const STRIPE_TAX_KEY = 'stripe_tax_enabled';
export const PORTAL_CONFIGURATION_KEY = 'stripe_portal_configuration_id_parcel_tool';
/** Stripe's own rule for subscription_data.trial_end (the API reference): at least 48 hours in the future. Fixed by Stripe, not a tunable. */
export const STRIPE_MIN_TRIAL_MS = 48 * 3600 * 1000;

/** The checkout hosts Stripe serves; a returned url is parsed and matched exactly, never prefix-matched. */
const CHECKOUT_HOST = 'checkout.stripe.com';
const PORTAL_HOST = 'billing.stripe.com';

export type CheckoutErrorCode =
  | 'NOT_SIGNED_IN'
  | 'INVALID_PLAN'
  | 'ACCOUNT_PENDING_DELETION'
  | 'ALREADY_SUBSCRIBED'
  | 'STRIPE_NOT_CONFIGURED'
  | 'STRIPE_PRICE_NOT_CONFIGURED'
  | 'STRIPE_PRICE_NOT_MAPPED'
  | 'TRY_AGAIN'
  | 'UNEXPECTED';
export type PortalErrorCode =
  | 'NOT_SIGNED_IN'
  | 'ACCOUNT_PENDING_DELETION'
  | 'NO_CUSTOMER'
  | 'STRIPE_NOT_CONFIGURED'
  | 'PORTAL_NOT_CONFIGURED'
  | 'UNEXPECTED';
export type CheckoutResult = { url: string } | { error: CheckoutErrorCode };
export type PortalResult = { url: string } | { error: PortalErrorCode };

// resolvePriceProduct / getEntitlementStatus take a pg-shaped Queryable ({ query } -> { rows }); the app's `query` helper returns bare rows.
const queryable = {
  query: async (text: string, values?: unknown[]) => ({ rows: await query(text, values) }),
} as unknown as Queryable;

/** True only for an https url on exactly `host` with no userinfo and no port: a parsed check, never a string prefix. */
export function isStripeUrl(url: unknown, host: string): url is string {
  if (typeof url !== 'string' || url === '') return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.hostname === host && u.username === '' && u.password === '' && u.port === '';
}

const bounds = (key: string): { min: number; max: number } => {
  const b = (seedJson as Record<string, { min?: number; max?: number }>)[key];
  if (!b || typeof b.min !== 'number' || typeof b.max !== 'number') throw new Error(`logic_variables seed has no bounds for ${key}`);
  return { min: b.min, max: b.max };
};

/** A whole-number setting inside its seed bounds; missing or outside throws (fail closed, no literal fallback). */
async function readIntSetting(db: Queryable, key: string): Promise<number> {
  const { min, max } = bounds(key);
  const res = await db.query<{ variable_value: string | number | null }>(
    `SELECT variable_value FROM logic_variables WHERE variable_key = $1`,
    [key],
  );
  const raw = res.rows[0]?.variable_value;
  const v = raw === undefined || raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`logic_variables.${key} is missing or outside ${min}..${max}`);
  return v;
}

async function readStringSetting(db: Queryable, key: string): Promise<string> {
  const res = await db.query<{ variable_value_json: unknown }>(`SELECT variable_value_json FROM logic_variables WHERE variable_key = $1`, [key]);
  const v = res.rows[0]?.variable_value_json;
  return typeof v === 'string' ? v : '';
}

/**
 * The trial end: `now` + `months` calendar months (UTC, day clamped to the month end), refused when `months` is not a whole number inside the
 * setting's seed bounds (min 1, so the end is far over Stripe's floor) or when the end is under Stripe's 48 hour floor. `minMs` is injectable for
 * the test only.
 */
export function trialEndFor(now: Date, months: number, minMs: number = STRIPE_MIN_TRIAL_MS): Date {
  const { min, max } = bounds(TRIAL_MONTHS_KEY);
  if (!Number.isInteger(months) || months < min || months > max) throw new Error(`trial months must be a whole number ${min}..${max}, got ${months}`);
  const end = addMonthsClamped(now, months);
  if (end.getTime() - now.getTime() < minMs) throw new Error("trial end is shorter than Stripe's 48 hour floor");
  return end;
}

type Gate =
  | { refuse: CheckoutErrorCode; event: string; level: 'info' | 'error'; extra?: Record<string, unknown> }
  | {
      refuse?: undefined;
      customerId: string | null;
      email: string | null;
      hasEntitlementRow: boolean;
      priceId: string;
      planPriceIds: string[];
      months: number;
      taxOn: boolean;
    };

/** The first, DB-only step: everything that needs the row lock and the settings. Returns data or a refusal; never touches Stripe. */
async function gate(uid: string, plan: PlanKey): Promise<Gate> {
  return withTransaction(async (client): Promise<Gate> => {
    await client.query(`INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [uid]);
    const profile = (
      await client.query<{ email: string | null; stripe_customer_id: string | null; account_deleted_at: unknown }>(
        `SELECT email, stripe_customer_id, account_deleted_at FROM user_profiles WHERE user_id = $1 FOR UPDATE`,
        [uid],
      )
    ).rows[0];
    if (!profile) return { refuse: 'UNEXPECTED', event: 'profile_missing', level: 'error' };
    if (profile.account_deleted_at) return { refuse: 'ACCOUNT_PENDING_DELETION', event: 'account_deleted', level: 'info' };
    const ent = await getEntitlementStatusForUpdate(client, uid, 'parcel_tool');
    if (ent?.status === 'cancelled_pending_deletion') return { refuse: 'ACCOUNT_PENDING_DELETION', event: 'entitlement_pending_deletion', level: 'info' };
    if (ent && ent.status !== 'expired') return { refuse: 'ALREADY_SUBSCRIBED', event: 'already_subscribed', level: 'info', extra: { status: ent.status } };

    const ids = await readPlanPriceIds(client);
    const priceId = ids[plan];
    if (priceId === '') return { refuse: 'STRIPE_PRICE_NOT_CONFIGURED', event: 'price_not_configured', level: 'error', extra: { plan_key: plan } };
    // Never a fallback to the other plan or to lead_gen: the price must resolve to parcel_tool through the product map.
    if ((await resolvePriceProduct(client, priceId)) !== 'parcel_tool') {
      return { refuse: 'STRIPE_PRICE_NOT_MAPPED', event: 'price_not_mapped', level: 'error', extra: { plan_key: plan } };
    }
    const months = await readIntSetting(client, TRIAL_MONTHS_KEY);
    const taxOn = (await readIntSetting(client, STRIPE_TAX_KEY)) === 1;
    return {
      customerId: profile.stripe_customer_id,
      email: profile.email,
      hasEntitlementRow: ent !== null,
      priceId,
      planPriceIds: PLAN_KEYS.map((k) => ids[k]).filter((id) => id !== ''),
      months,
      taxOn,
    };
  });
}

/** A subscription status that still bills or can still bill (anything not terminal). */
const ENDED = new Set(['canceled', 'incomplete_expired']);

/**
 * Starts a MaxBLD checkout for the signed-in user (`uid` from the verified session; null when there is none). Returns the Stripe-hosted url or a
 * closed error code. The caller redirects, after every try/catch (redirect() throws).
 */
export async function createParcelCheckout(uid: string | null, planKey: string, now: Date = new Date()): Promise<CheckoutResult> {
  if (uid === null || !isUuid(uid)) return { error: 'NOT_SIGNED_IN' };
  const plan = (PLAN_KEYS as readonly string[]).includes(planKey) ? (planKey as PlanKey) : null;
  if (plan === null) {
    logInfo(TAG, 'plan_invalid', { uid, plan_key: String(planKey).slice(0, 32) });
    return { error: 'INVALID_PLAN' };
  }
  let stage = 'stripe_client';
  try {
    const stripe = getStripeClient();
    stage = 'gate';
    const g = await gate(uid, plan);
    if (g.refuse !== undefined) {
      const ctx = { event: g.event, uid, ...g.extra };
      if (g.level === 'info') logInfo(TAG, g.event, ctx);
      else logError(TAG, new Error(`checkout refused: ${g.event}`), ctx);
      return { error: g.refuse };
    }
    stage = 'base_url';
    const base = resolveMaxbldCheckoutBaseUrl();

    // From here on: Stripe calls, outside any DB lock.
    let customerId = g.customerId;
    let pastSubscription = false;
    if (customerId !== null) {
      stage = 'subscriptions_list';
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
        // A MaxBLD subscription is one whose price is one of the two plan prices (a Buildo subscription on the same customer never counts).
        const mine = subs.data.filter((s) => (s.items?.data ?? []).some((i) => g.planPriceIds.includes(i.price?.id)));
        if (mine.some((s) => !ENDED.has(s.status))) {
          logInfo(TAG, 'already_subscribed', { event: 'live_subscription', uid });
          return { error: 'ALREADY_SUBSCRIBED' };
        }
        pastSubscription = mine.length > 0;
      } catch (cause) {
        logError(TAG, cause, { event: 'subscriptions_list_failed', uid });
        return { error: 'TRY_AGAIN' };
      }
    } else {
      stage = 'customer_create';
      const created = await stripe.customers.create({ ...(g.email ? { email: g.email } : {}), metadata: { user_id: uid } });
      const stored = await query<{ stripe_customer_id: string }>(
        `UPDATE user_profiles SET stripe_customer_id = COALESCE(stripe_customer_id, $2), updated_at = NOW()
         WHERE user_id = $1 RETURNING stripe_customer_id`,
        [uid, created.id],
      );
      if (stored.length === 0) {
        // The id could not be stored, so deleting the account could not cancel billing: refuse rather than bill what cannot be stopped.
        logError(TAG, new Error('Stripe customer id not stored (0 rows)'), { event: 'customer_store_failed', uid, stripe_customer_id: created.id });
        return { error: 'UNEXPECTED' };
      }
      customerId = stored[0]!.stripe_customer_id;
    }

    const trial = !g.hasEntitlementRow && !pastSubscription;
    stage = 'session_create';
    const trialEnd = trial ? Math.floor(trialEndFor(now, g.months).getTime() / 1000) : null;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: g.priceId, quantity: 1 }],
      // BOTH linkage fields (the webhook contract; half a linkage re-opens the orphan-event gap) and the product on the session AND the
      // subscription (v1 fold 4), so an invoice-first event never reaches the lead_gen default.
      client_reference_id: uid,
      metadata: { product: 'parcel_tool', ...(trial ? { trial: '1' } : {}) },
      subscription_data: {
        metadata: { user_id: uid, product: 'parcel_tool', ...(trial ? { trial: '1' } : {}) },
        ...(trialEnd !== null ? { trial_end: trialEnd } : {}),
      },
      payment_method_types: ['card'],
      customer: customerId,
      ...(g.taxOn
        ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' as const }, billing_address_collection: 'required' as const }
        : {}),
      success_url: `${base}/parcel-tool`,
      cancel_url: `${base}/parcel-tool`,
    });
    if (!isStripeUrl(session.url, CHECKOUT_HOST)) {
      logError(TAG, new Error('Stripe session without a usable checkout url'), { event: 'session_url_invalid', uid, session_id: session.id });
      return { error: 'UNEXPECTED' };
    }
    logInfo(TAG, 'session_created', { uid, plan_key: plan, trial, tax: g.taxOn, session_id: session.id });
    return { url: session.url };
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) {
      logError(TAG, cause, { event: 'stripe_not_configured', uid });
      return { error: 'STRIPE_NOT_CONFIGURED' };
    }
    logError(TAG, cause, { event: stage === 'session_create' ? 'session_create_failed' : 'unexpected', stage, uid });
    return { error: 'UNEXPECTED' };
  }
}

/** Opens the Stripe Customer Portal for the signed-in user with the MaxBLD configuration (Buildo's default portal is untouched). */
export async function createParcelPortal(uid: string | null): Promise<PortalResult> {
  if (uid === null || !isUuid(uid)) return { error: 'NOT_SIGNED_IN' };
  let stage = 'stripe_client';
  try {
    const stripe = getStripeClient();
    stage = 'profile';
    const rows = await query<{ stripe_customer_id: string | null; account_deleted_at: unknown }>(
      `SELECT stripe_customer_id, account_deleted_at FROM user_profiles WHERE user_id = $1`,
      [uid],
    );
    const profile = rows[0];
    if (profile?.account_deleted_at) {
      logInfo(TAG, 'portal_refused', { event: 'account_deleted', uid });
      return { error: 'ACCOUNT_PENDING_DELETION' };
    }
    if ((await getEntitlementStatus(queryable, uid, 'parcel_tool'))?.status === 'cancelled_pending_deletion') {
      logInfo(TAG, 'portal_refused', { event: 'entitlement_pending_deletion', uid });
      return { error: 'ACCOUNT_PENDING_DELETION' };
    }
    if (!profile?.stripe_customer_id) {
      logInfo(TAG, 'portal_refused', { event: 'no_customer', uid });
      return { error: 'NO_CUSTOMER' };
    }
    const configuration = await readStringSetting(queryable, PORTAL_CONFIGURATION_KEY);
    if (!configuration.startsWith('bpc_')) {
      logError(TAG, new Error('portal configuration id is not set'), { event: 'portal_not_configured', uid });
      return { error: 'PORTAL_NOT_CONFIGURED' };
    }
    stage = 'base_url';
    const base = resolveMaxbldCheckoutBaseUrl();
    stage = 'portal_create';
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      configuration,
      return_url: `${base}/parcel-tool`,
    });
    if (!isStripeUrl(session.url, PORTAL_HOST)) {
      logError(TAG, new Error('Stripe portal session without a usable url'), { event: 'portal_url_invalid', uid });
      return { error: 'UNEXPECTED' };
    }
    logInfo(TAG, 'portal_created', { uid });
    return { url: session.url };
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) {
      logError(TAG, cause, { event: 'stripe_not_configured', uid });
      return { error: 'STRIPE_NOT_CONFIGURED' };
    }
    logError(TAG, cause, { event: 'portal_unexpected', stage, uid });
    return { error: 'UNEXPECTED' };
  }
}
