// 🔗 SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3-§4 (dated note 2026-11-14, MF-47)
//             docs/specs/00-architecture/116_multi_product_architecture.md §4 OD3/OD5, §5 OD4 (dated note 2026-11-14)
//
// MF-47 (RULED 2026-11-14; v1 plan section 12 folds 1, 2, 9-12, 15) · the MaxBLD checkout and portal logic (src/lib/stripe/parcel-checkout.ts)
// against a mocked Stripe and a text-routed db (the subscribe-exchange.infra.test.ts pattern). Locks:
//   - the money rule: the DB transaction CLOSES before the first Stripe call (reactivate/route.ts:89-90);
//   - a price that is unset or not `price_...` (STRIPE_PRICE_NOT_CONFIGURED), unmapped, or mapped to another product (STRIPE_PRICE_NOT_MAPPED)
//     never reaches Stripe, and never falls back to the other plan or to lead_gen;
//   - first-time buyer: user_profiles row created, customer stored, a zero-row store fails closed (no session);
//   - the session: both linkage fields, product on the session AND the subscription, card only, trial_end only for a first-time buyer, the trial flag
//     the webhook's single trial writer keys on, tax params only behind stripe_tax_enabled, success/cancel from the fixed base (never the Host);
//   - redirect hardening: the url is parsed (https, exact host, no userinfo), never a string prefix; null is an error;
//   - Stripe errors map to the closed code list; refusals log under [stripe/parcel-checkout].
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sessionsCreate = vi.fn();
const customersCreate = vi.fn();
const subsList = vi.fn();
const portalCreate = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: sessionsCreate } },
    customers: { create: customersCreate },
    subscriptions: { list: subsList },
    billingPortal: { sessions: { create: portalCreate } },
  })),
}));

const order: string[] = [];
const q = vi.fn();
vi.mock('@/lib/db/client', () => ({
  query: (...a: unknown[]) => { order.push('query'); return q(...a).then((r: { rows: unknown[] }) => r.rows); }, // the app's query() returns bare rows
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
    order.push('txn-open');
    try { return await fn({ query: (...a: unknown[]) => { order.push('tx-query'); return q(...a); } }); } finally { order.push('txn-close'); }
  }),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { createParcelCheckout, createParcelPortal, isStripeUrl } from '@/lib/stripe/parcel-checkout';
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';
import { logError, logInfo } from '@/lib/logger';

const UID = '00000000-0000-0000-0000-0000000f0047';
const BASIC = 'price_basic_test';
const PRO = 'price_pro_test';
const NOW = new Date('2026-11-14T12:00:00.000Z');

interface World {
  basic?: string; pro?: string; portal?: string; tax?: number; months?: number | null;
  profile?: { email?: string | null; stripe_customer_id?: string | null; account_deleted_at?: string | null } | null;
  entitlement?: { status: string } | null;
  map?: Record<string, string>;
  storeRows?: number;
}
function world(w: World = {}) {
  const o = { basic: BASIC, pro: PRO, portal: 'bpc_test', tax: 0, months: 1, profile: { email: 'u@example.test', stripe_customer_id: null, account_deleted_at: null }, entitlement: null,
    map: { [BASIC]: 'parcel_tool', [PRO]: 'parcel_tool' }, storeRows: 1, ...w } as Required<World>;
  let inserted = false; // the checkout creates the user_profiles row when it is missing, so the next SELECT sees it
  const blank = { email: null, stripe_customer_id: null, account_deleted_at: null };
  q.mockReset();
  q.mockImplementation(async (text: string, values?: unknown[]) => {
    if (/INSERT INTO user_profiles/.test(text)) { inserted = true; return { rowCount: 1, rows: [] }; }
    if (/FROM user_profiles/.test(text)) { const row = o.profile ?? (inserted ? blank : null); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] }; }
    if (/FROM entitlements/.test(text)) return { rowCount: o.entitlement ? 1 : 0, rows: o.entitlement ? [o.entitlement] : [] };
    if (/UPDATE user_profiles/.test(text)) return { rowCount: o.storeRows, rows: o.storeRows ? [{ stripe_customer_id: 'cus_new' }] : [] };
    if (/stripe_price_product_map/.test(text)) return { rowCount: 1, rows: [{ variable_value_json: o.map }] };
    if (/variable_key = ANY/.test(text)) return { rowCount: 2, rows: [
      { variable_key: 'stripe_price_id_parcel_tool_basic', variable_value_json: o.basic }, { variable_key: 'stripe_price_id_parcel_tool_pro', variable_value_json: o.pro }] };
    if (/variable_key = \$1/.test(text)) {
      const k = String(values?.[0]);
      if (k === 'parcel_tool_trial_months') return { rowCount: o.months === null ? 0 : 1, rows: o.months === null ? [] : [{ variable_value: String(o.months) }] };
      if (k === 'stripe_tax_enabled') return { rowCount: 1, rows: [{ variable_value: String(o.tax) }] };
      if (k === 'stripe_portal_configuration_id_parcel_tool') return { rowCount: 1, rows: [{ variable_value_json: o.portal }] };
    }
    throw new Error('unrouted query: ' + text.slice(0, 80));
  });
  return o;
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  const mark = <T,>(v: T) => (..._a: unknown[]) => { order.push('stripe'); return Promise.resolve(v); };
  _resetPriceProductMapCacheForTests();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.MAXBLD_CHECKOUT_BASE_URL = 'https://staging.maxbld.test';
  customersCreate.mockImplementation(mark({ id: 'cus_new' }));
  subsList.mockImplementation(mark({ data: [] }));
  sessionsCreate.mockImplementation(mark({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }));
  portalCreate.mockImplementation(mark({ url: 'https://billing.stripe.com/p/session/x' }));
});

const stripeCalled = () => sessionsCreate.mock.calls.length + customersCreate.mock.calls.length + subsList.mock.calls.length;
const sessionArgs = () => sessionsCreate.mock.calls[0]![0] as Record<string, any>;

describe('refusals reach no Stripe call (K3/K7)', () => {
  it.each([
    ['not a uuid (dev bypass)', 'dev-user', 'basic', {}, 'NOT_SIGNED_IN'],
    ['no uid', null, 'basic', {}, 'NOT_SIGNED_IN'],
    ['an unknown plan key', UID, 'gold', {}, 'INVALID_PLAN'],
    ['the Basic price id unset', UID, 'basic', { basic: '' }, 'STRIPE_PRICE_NOT_CONFIGURED'],
    ['the price is not a price_ id', UID, 'pro', { pro: 'prod_nope' }, 'STRIPE_PRICE_NOT_CONFIGURED'],
    ['the price is unmapped', UID, 'basic', { map: {} }, 'STRIPE_PRICE_NOT_MAPPED'],
    ['the price maps to lead_gen', UID, 'basic', { map: { [BASIC]: 'lead_gen' } }, 'STRIPE_PRICE_NOT_MAPPED'],
    ['the account is pending deletion', UID, 'basic', { profile: { email: null, stripe_customer_id: null, account_deleted_at: '2026-11-01T00:00:00Z' } }, 'ACCOUNT_PENDING_DELETION'],
    ['the entitlement is pending deletion', UID, 'basic', { entitlement: { status: 'cancelled_pending_deletion' } }, 'ACCOUNT_PENDING_DELETION'],
    ['already a trial holder', UID, 'pro', { entitlement: { status: 'trial' } }, 'ALREADY_SUBSCRIBED'],
    ['already active', UID, 'pro', { entitlement: { status: 'active' } }, 'ALREADY_SUBSCRIBED'],
    ['admin_managed', UID, 'pro', { entitlement: { status: 'admin_managed' } }, 'ALREADY_SUBSCRIBED'],
    ['past_due (fix the card in the portal)', UID, 'pro', { entitlement: { status: 'past_due' } }, 'ALREADY_SUBSCRIBED'],
    ['the trial length setting missing (fail closed)', UID, 'basic', { months: null }, 'UNEXPECTED'],
  ])('%s -> %s', async (_l, uid, plan, w, code) => {
    world(w as World);
    expect(await createParcelCheckout(uid as string | null, plan, NOW)).toEqual({ error: code });
    expect(stripeCalled()).toBe(0);
  });
  it('the refusals log under [stripe/parcel-checkout] with a named event', async () => {
    world({ basic: '' });
    await createParcelCheckout(UID, 'basic', NOW);
    expect(logError).toHaveBeenCalledWith('[stripe/parcel-checkout]', expect.anything(), expect.objectContaining({ event: 'price_not_configured', uid: UID }));
  });
});

describe('the money rule and the first-time buyer', () => {
  it('the DB transaction is closed before the first Stripe call, and opened once', async () => {
    world({ profile: null });
    await createParcelCheckout(UID, 'basic', NOW);
    const close = order.indexOf('txn-close');
    const firstStripe = order.indexOf('stripe');
    expect(order.filter((x) => x === 'txn-open')).toHaveLength(1);
    expect(close).toBeGreaterThan(-1);
    expect(firstStripe).toBeGreaterThan(close);
    // nothing but Stripe and the post-txn customer store happens inside the transaction window
    expect(order.slice(order.indexOf('txn-open'), close).includes('stripe')).toBe(false);
  });
  it('no user_profiles row yet: the row is inserted, the new customer is stored, the session is created on it', async () => {
    world({ profile: null });
    const r = await createParcelCheckout(UID, 'basic', NOW);
    expect(r).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
    expect(q.mock.calls.some((c) => /INSERT INTO user_profiles/.test(c[0]))).toBe(true);
    expect(customersCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: { user_id: UID } }));
    expect(sessionArgs().customer).toBe('cus_new');
  });
  it('RED plant: a customer id that cannot be stored (0 rows) fails closed: no session, never the unstored id', async () => {
    world({ storeRows: 0 });
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'UNEXPECTED' });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith('[stripe/parcel-checkout]', expect.anything(), expect.objectContaining({ event: 'customer_store_failed' }));
  });
  it('a stored customer is reused (no customers.create)', async () => {
    world({ profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null }, entitlement: null });
    await createParcelCheckout(UID, 'pro', NOW);
    expect(customersCreate).not.toHaveBeenCalled();
    expect(sessionArgs().customer).toBe('cus_old');
  });
});

describe('the session parameters', () => {
  it('Pro: its own price, both linkage fields, product on the session AND the subscription, card only, the trial flag and trial_end', async () => {
    world();
    await createParcelCheckout(UID, 'pro', NOW);
    const s = sessionArgs();
    expect(s.mode).toBe('subscription');
    expect(s.line_items).toEqual([{ price: PRO, quantity: 1 }]);
    expect(s.client_reference_id).toBe(UID);
    expect(s.metadata).toEqual({ product: 'parcel_tool', trial: '1' });
    expect(s.subscription_data.metadata).toEqual({ user_id: UID, product: 'parcel_tool', trial: '1' });
    expect(s.payment_method_types).toEqual(['card']);
    expect(s.subscription_data.trial_end).toBe(Math.floor(new Date('2026-12-14T12:00:00.000Z').getTime() / 1000));
    expect(s.subscription_data.trial_end - Math.floor(NOW.getTime() / 1000)).toBeGreaterThanOrEqual(48 * 3600);
  });
  it('Basic uses the Basic price (never the other plan)', async () => {
    world();
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().line_items[0].price).toBe(BASIC);
  });
  it('a returning buyer (an expired row exists): no trial_end and no trial flag', async () => {
    world({ entitlement: { status: 'expired' } });
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().subscription_data.trial_end).toBeUndefined();
    expect(sessionArgs().metadata).toEqual({ product: 'parcel_tool' });
    expect(sessionArgs().subscription_data.metadata.trial).toBeUndefined();
  });
  it('a past MaxBLD subscription on the customer: no trial; a live one: ALREADY_SUBSCRIBED; a Buildo subscription (other price) never blocks the trial', async () => {
    world({ profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null } });
    subsList.mockResolvedValueOnce({ data: [{ status: 'canceled', items: { data: [{ price: { id: BASIC } }] } }] });
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().subscription_data.trial_end).toBeUndefined();
    sessionsCreate.mockClear();
    subsList.mockResolvedValueOnce({ data: [{ status: 'active', items: { data: [{ price: { id: PRO } }] } }] });
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'ALREADY_SUBSCRIBED' });
    expect(sessionsCreate).not.toHaveBeenCalled();
    subsList.mockResolvedValueOnce({ data: [{ status: 'active', items: { data: [{ price: { id: 'price_buildo' } }] } }] });
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().subscription_data.trial_end).toBeDefined();
  });
  it('a failing subscriptions.list fails closed (TRY_AGAIN, no session)', async () => {
    world({ profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null } });
    subsList.mockRejectedValueOnce(new Error('network'));
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'TRY_AGAIN' });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it('Stripe Tax params only when stripe_tax_enabled = 1', async () => {
    world({ tax: 0 });
    await createParcelCheckout(UID, 'basic', NOW);
    for (const k of ['automatic_tax', 'customer_update', 'billing_address_collection']) expect(sessionArgs()[k]).toBeUndefined();
    sessionsCreate.mockClear();
    world({ tax: 1 });
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().automatic_tax).toEqual({ enabled: true });
    expect(sessionArgs().customer_update).toEqual({ address: 'auto' });
    expect(sessionArgs().billing_address_collection).toBe('required');
  });
  it('success and cancel return to the fixed base (env), never a request value', async () => {
    world();
    await createParcelCheckout(UID, 'basic', NOW);
    expect(sessionArgs().success_url).toBe('https://staging.maxbld.test/parcel-tool');
    expect(sessionArgs().cancel_url).toBe('https://staging.maxbld.test/parcel-tool');
  });
  it('a missing base in a non-production environment fails loud (no session)', async () => {
    world();
    delete process.env.MAXBLD_CHECKOUT_BASE_URL;
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'UNEXPECTED' });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
  it('success logs a session_created line', async () => {
    world();
    await createParcelCheckout(UID, 'basic', NOW);
    expect(logInfo).toHaveBeenCalledWith('[stripe/parcel-checkout]', 'session_created', expect.objectContaining({ uid: UID, plan_key: 'basic', trial: true }));
  });
});

describe('Stripe failures and the redirect guard', () => {
  it('a missing STRIPE_SECRET_KEY -> STRIPE_NOT_CONFIGURED', async () => {
    world();
    delete process.env.STRIPE_SECRET_KEY;
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'STRIPE_NOT_CONFIGURED' });
  });
  it('a Stripe error on session create -> UNEXPECTED, logged', async () => {
    world();
    sessionsCreate.mockRejectedValueOnce(new Error('boom'));
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'UNEXPECTED' });
    expect(logError).toHaveBeenCalledWith('[stripe/parcel-checkout]', expect.anything(), expect.objectContaining({ event: 'session_create_failed' }));
  });
  it.each([
    ['null', null], ['an empty string', ''], ['a lookalike host with userinfo', 'https://checkout.stripe.com@evil.example/x'],
    ['a sub-domain trick', 'https://checkout.stripe.com.evil.example/x'], ['http', 'http://checkout.stripe.com/x'],
  ])('a session url that is %s is an error, never a redirect', async (_l, url) => {
    world();
    sessionsCreate.mockResolvedValueOnce({ id: 'cs_x', url });
    expect(await createParcelCheckout(UID, 'basic', NOW)).toEqual({ error: 'UNEXPECTED' });
  });
  it('isStripeUrl: exact host, https, no userinfo, no port games', () => {
    expect(isStripeUrl('https://checkout.stripe.com/c/pay/x', 'checkout.stripe.com')).toBe(true);
    expect(isStripeUrl('https://billing.stripe.com/p/x', 'checkout.stripe.com')).toBe(false);
    expect(isStripeUrl('https://checkout.stripe.com@evil.example/', 'checkout.stripe.com')).toBe(false);
    expect(isStripeUrl('https://checkout.stripe.com:8443/', 'checkout.stripe.com')).toBe(false);
    expect(isStripeUrl(undefined, 'checkout.stripe.com')).toBe(false);
  });
});

describe('the portal (K7, v1 fold 15)', () => {
  it('opens the portal on the stored customer with the MaxBLD configuration and the fixed return url', async () => {
    world({ profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null } });
    expect(await createParcelPortal(UID)).toEqual({ url: 'https://billing.stripe.com/p/session/x' });
    expect(portalCreate).toHaveBeenCalledWith({ customer: 'cus_old', configuration: 'bpc_test', return_url: 'https://staging.maxbld.test/parcel-tool' });
  });
  it.each([
    ['not signed in', null, {}, 'NOT_SIGNED_IN'],
    ['no customer yet', UID, { profile: { email: null, stripe_customer_id: null, account_deleted_at: null } }, 'NO_CUSTOMER'],
    ['no user_profiles row', UID, { profile: null }, 'NO_CUSTOMER'],
    ['a deleted account', UID, { profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: '2026-11-01T00:00:00Z' } }, 'ACCOUNT_PENDING_DELETION'],
    ['a pending-deletion entitlement', UID, { profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null }, entitlement: { status: 'cancelled_pending_deletion' } }, 'ACCOUNT_PENDING_DELETION'],
    ['the configuration id unset', UID, { profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null }, portal: '' }, 'PORTAL_NOT_CONFIGURED'],
    ['the configuration id not a bpc_ id', UID, { profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null }, portal: 'price_x' }, 'PORTAL_NOT_CONFIGURED'],
  ])('%s -> %s, no Stripe call', async (_l, uid, w, code) => {
    world(w as World);
    expect(await createParcelPortal(uid as string | null)).toEqual({ error: code });
    expect(portalCreate).not.toHaveBeenCalled();
  });
  it('a portal url on any other host is an error', async () => {
    world({ profile: { email: null, stripe_customer_id: 'cus_old', account_deleted_at: null } });
    portalCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' });
    expect(await createParcelPortal(UID)).toEqual({ error: 'UNEXPECTED' });
  });
});
