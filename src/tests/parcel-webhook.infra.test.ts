// 🔗 SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3-§5 (dated note 2026-11-14, MF-47)
//             docs/specs/03-mobile/96_mobile_subscription.md §10 Step 5
//             docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5 (DEFAULT_PRODUCT unchanged, 116 :91)
//
// MF-47 (RULED 2026-11-14; v1 plan section 12 folds 3-9) · the webhook half of the MaxBLD checkout, against the REAL route and entitlements SQL
// with a mocked transaction client (the stripe-webhook.infra.test.ts style). Locks:
//   - ONE trial writer: customer.subscription.created (trialing -> trial) is it. checkout.session.completed with metadata.trial = '1' and the
//     $0 subscription_create invoice write nothing; without them the Buildo behaviour is byte-identical (active).
//   - the product travels on the subscription (sub.metadata.product, invoice.parent.subscription_details.metadata.product): an invoice-first
//     MaxBLD event never reaches the lead_gen default (Spec 116 :91 keeps the two defaults, pinned below for metadata-less events).
//   - plan_key is written from the subscription's price by matching the two price-id settings (C-1: no second map), looking through
//     items.data, never items[0]; unset settings -> an info line, a set-but-unmatched or duplicated price -> an error line; plan_key untouched.
//   - period end: a checkout/invoice event without one never nulls a stored end; a NEW subscription never inherits the old end.
//   - the row-claim clause is unchanged (only 'active' claims a row across subscription ids).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockedConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({ webhooks: { constructEvent: mockedConstructEvent } })),
}));
const q = vi.fn();
vi.mock('@/lib/db/client', () => ({
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({ query: q })),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { POST } from '@/app/api/webhooks/stripe/route';
import { _resetPriceProductMapCacheForTests } from '@/lib/entitlements';
import { logError, logInfo } from '@/lib/logger';

const UID = '00000000-0000-0000-0000-000000000047';
const BASIC = 'price_basic_test';
const PRO = 'price_pro_test';
const T = 1717250000;
const TRIAL_END_S = 1719842000;

beforeEach(() => {
  vi.clearAllMocks();
  q.mockReset();
  _resetPriceProductMapCacheForTests();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
});

const req = (): NextRequest => ({
  headers: { get: (n: string) => (n.toLowerCase() === 'stripe-signature' ? 'sig' : null) },
  text: async () => 'raw',
  method: 'POST',
  nextUrl: { pathname: '/api/webhooks/stripe' },
}) as unknown as NextRequest;

/** Route every query by its text: the dedup insert hits, the settings read returns `settings`, the rest are recorded. */
let upsertRows = 1;
function wire(settings: { basic?: string; pro?: string } | null) {
  upsertRows = 1;
  q.mockImplementation(async (text: string) => {
    if (/INSERT INTO stripe_webhook_events/.test(text)) return { rowCount: 1, rows: [{ event_id: 'evt' }] };
    if (/variable_key = ANY/.test(text) && /stripe_price_id_parcel_tool/.test(JSON.stringify(q.mock.calls.at(-1)?.[1] ?? []))) {
      const rows = settings === null ? [] : [
        { variable_key: 'stripe_price_id_parcel_tool_basic', variable_value_json: settings.basic ?? '' },
        { variable_key: 'stripe_price_id_parcel_tool_pro', variable_value_json: settings.pro ?? '' },
      ];
      return { rowCount: rows.length, rows };
    }
    if (/INSERT INTO entitlements/.test(text)) return { rowCount: upsertRows, rows: [] };
    if (/UPDATE entitlements SET plan_key/.test(text)) return { rowCount: 1, rows: [] };
    if (/FROM user_profiles/.test(text)) return { rowCount: 1, rows: [{ user_id: UID }] };
    if (/SELECT product FROM entitlements/.test(text)) return { rowCount: 0, rows: [] };
    if (/stripe_price_product_map/.test(text)) return { rowCount: 1, rows: [{ variable_value_json: {} }] };
    return { rowCount: 0, rows: [] };
  });
}
const upsert = () => {
  const c = q.mock.calls.find((x) => /INSERT INTO entitlements/.test(x[0] as string));
  return c ? { sql: c[0] as string, params: c[1] as unknown[] } : null;
};
/** The plan write: its own statement after an applied upsert; its parameters are [user, product, plan, subscription]. */
const planWrite = () => {
  const c = q.mock.calls.find((x) => /UPDATE entitlements SET plan_key/.test(x[0] as string));
  return c ? { sql: c[0] as string, params: c[1] as unknown[] } : null;
};
const post = async (event: unknown) => { mockedConstructEvent.mockReturnValueOnce(event); return POST(req()); };

const sub = (over: Record<string, unknown> = {}, items: Array<{ price: string }> = [{ price: PRO }]) => ({
  id: 'evt_sub', type: 'customer.subscription.created', created: T,
  data: { object: { id: 'sub_1', customer: 'cus_1', status: 'trialing', metadata: { user_id: UID, product: 'parcel_tool', trial: '1' },
    items: { data: items.map((i) => ({ price: { id: i.price }, current_period_end: TRIAL_END_S })) }, ...over } },
});
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'evt_inv', type: 'invoice.payment_succeeded', created: T,
  data: { object: { customer: 'cus_1', billing_reason: 'subscription_create', total: 0, amount_paid: 0,
    parent: { subscription_details: { subscription: 'sub_1', metadata: { user_id: UID, product: 'parcel_tool' } } }, ...over } },
});
const checkout = (meta: Record<string, string>) => ({
  id: 'evt_co', type: 'checkout.session.completed', created: T,
  data: { object: { customer: 'cus_1', client_reference_id: UID, subscription: 'sub_1', metadata: meta } },
});

describe('MF-47 webhook: one trial writer', () => {
  it('subscription.created trialing -> status trial, product parcel_tool from the subscription metadata, period end = the trial end', async () => {
    wire({ basic: BASIC, pro: PRO });
    expect((await post(sub())).status).toBe(200);
    const u = upsert()!;
    expect(u.params.slice(0, 4)).toEqual([UID, 'parcel_tool', 'trial', 'sub_1']);
    expect((u.params[4] as Date).getTime()).toBe(TRIAL_END_S * 1000);
  });
  it('checkout.session.completed with metadata.trial = 1 writes nothing (the trialing subscription event is the writer)', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(checkout({ product: 'parcel_tool', trial: '1' }));
    expect(upsert()).toBeNull();
  });
  it('checkout.session.completed WITHOUT the trial flag still writes active (Buildo and paid MaxBLD: byte-identical)', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(checkout({ product: 'parcel_tool' }));
    expect(upsert()!.params.slice(0, 3)).toEqual([UID, 'parcel_tool', 'active']);
  });
  it('the $0 subscription_create invoice writes nothing', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(invoice());
    expect(upsert()).toBeNull();
  });
  it('a $0 RENEWAL invoice (any other billing_reason) still writes active', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(invoice({ billing_reason: 'subscription_cycle' }));
    expect(upsert()!.params.slice(0, 3)).toEqual([UID, 'parcel_tool', 'active']);
  });
  it('a paid subscription_create invoice (no trial) writes active', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(invoice({ total: 999, amount_paid: 999 }));
    expect(upsert()!.params.slice(0, 3)).toEqual([UID, 'parcel_tool', 'active']);
  });
  it('RED plant: an invoice-first MaxBLD event never resolves to lead_gen and never looks the product up by subscription', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(invoice({ total: 999, amount_paid: 999 }));
    expect(upsert()!.params[1]).toBe('parcel_tool');
    expect(q.mock.calls.some((c) => /SELECT product FROM entitlements/.test(c[0] as string))).toBe(false);
  });
});

describe('MF-47 webhook: the two lead_gen defaults stay for metadata-less events (Spec 116 :91, pinned)', () => {
  it('a checkout with no product metadata -> lead_gen; an invoice with no metadata and an unknown subscription -> lead_gen', async () => {
    wire(null);
    await post(checkout({}));
    expect(upsert()!.params[1]).toBe('lead_gen');
    q.mockClear(); wire(null);
    await post(invoice({ billing_reason: 'subscription_cycle', total: 999, parent: { subscription_details: { subscription: 'sub_9' } } }));
    expect(upsert()!.params[1]).toBe('lead_gen');
  });
  it('a lead_gen event never reads the plan settings and never writes plan_key', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active', metadata: { user_id: UID } }));
    expect(q.mock.calls.some((c) => /stripe_price_id_parcel_tool/.test(JSON.stringify(c[1] ?? [])))).toBe(false);
    expect(planWrite()).toBeNull();
  });
});

describe('MF-47 webhook: plan_key from the price (C-1, K5)', () => {
  it('the Pro price -> plan_key pro is written; the Basic price -> basic', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: PRO }]));
    expect(planWrite()!.params).toEqual([UID, 'parcel_tool', 'pro', 'sub_1']);
    q.mockClear(); wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: BASIC }]));
    expect(planWrite()!.params).toEqual([UID, 'parcel_tool', 'basic', 'sub_1']);
  });
  it('the licensed item is found by price, not items[0] (a later metered item may come first)', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: 'price_metered_x' }, { price: PRO }]));
    expect(planWrite()!.params[2]).toBe('pro');
  });
  it('a price in neither setting (settings set) leaves plan_key out and logs an ERROR line', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: 'price_other' }]));
    expect(planWrite()).toBeNull();
    expect(logError).toHaveBeenCalledWith('[stripe-webhook]', expect.anything(), expect.objectContaining({ event: 'plan_price_unmatched' }));
  });
  it('both settings empty -> plan_key left out, an INFO line (no error flood), the status still written', async () => {
    wire({ basic: '', pro: '' });
    await post(sub({ status: 'active' }, [{ price: PRO }]));
    expect(planWrite()).toBeNull();
    expect(upsert()!.params[2]).toBe('active');
    expect(logInfo).toHaveBeenCalledWith('[stripe-webhook]', expect.stringMatching(/unset/), expect.anything());
    expect(logError).not.toHaveBeenCalledWith('[stripe-webhook]', expect.anything(), expect.objectContaining({ event: 'plan_price_unmatched' }));
  });
  it('the same id in both settings is refused as ambiguous: plan_key left out, an ERROR line', async () => {
    wire({ basic: PRO, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: PRO }]));
    expect(planWrite()).toBeNull();
    expect(logError).toHaveBeenCalledWith('[stripe-webhook]', expect.anything(), expect.objectContaining({ event: 'plan_price_ambiguous' }));
  });
  it('an event with no price (checkout, invoice) never touches plan_key', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(invoice({ billing_reason: 'subscription_cycle', total: 999 }));
    expect(planWrite()).toBeNull();
  });
});

describe('MF-47 webhook: the plan write follows an applied upsert only', () => {
  it('a fenced or stale event (the upsert applies 0 rows) never writes plan_key', async () => {
    wire({ basic: BASIC, pro: PRO });
    upsertRows = 0;
    await post(sub({ status: 'active' }, [{ price: PRO }]));
    expect(planWrite()).toBeNull();
  });
  it('the upsert statement itself never mentions plan_key (static text; the INSERT takes the column default)', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }, [{ price: PRO }]));
    expect(upsert()!.sql).not.toMatch(/plan_key/);
  });
});

describe('MF-47 webhook: the upsert fences (row-claim unchanged; period end never nulled; new subscription never inherits)', () => {
  it('the row-claim clause is exactly the shipped one; the period end is protected', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub({ status: 'active' }));
    const { sql } = upsert()!;
    expect(sql).toContain("AND ($3 = 'active' OR entitlements.stripe_subscription_id IS NOT DISTINCT FROM EXCLUDED.stripe_subscription_id)");
    expect(sql).toMatch(/current_period_end = CASE WHEN EXCLUDED\.stripe_subscription_id IS NOT DISTINCT FROM entitlements\.stripe_subscription_id\s+OR EXCLUDED\.stripe_subscription_id IS NULL\s+THEN COALESCE\(EXCLUDED\.current_period_end, entitlements\.current_period_end\)\s+ELSE EXCLUDED\.current_period_end END/);
  });
  it('no trial_started_at write (the in-app 14-day expiry can never touch a Stripe trial)', async () => {
    wire({ basic: BASIC, pro: PRO });
    await post(sub());
    expect(upsert()!.sql).not.toMatch(/trial_started_at/);
  });
});
