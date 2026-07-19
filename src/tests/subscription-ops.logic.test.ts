// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Pure-logic pins for the Subscription-Ops layer (P26-26-ADMIN):
//   - mapStripeSubStatus / deriveEffectiveStripeStatus (the single shared
//     source the webhook AND reconcile both use — a drift-detector that cannot
//     drift from what the webhook writes);
//   - the request schemas (mandatory reason, apply:true literal).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  mapStripeSubStatus,
  deriveEffectiveStripeStatus,
  deriveEffectiveStripeStatusByProduct,
} from '@/lib/stripe/client';
import {
  resolvePriceProduct,
  _resetPriceProductMapCacheForTests,
  type Queryable,
} from '@/lib/entitlements';
import { ReconcileApplySchema, RetryCancelSchema, RECONCILE_PROTECTED_STATUSES } from '@/lib/admin/subscription-ops-schemas';

const sub = (status: string, priceId?: string): Stripe.Subscription =>
  ({
    status,
    ...(priceId ? { items: { data: [{ price: { id: priceId } }] } } : {}),
  } as unknown as Stripe.Subscription);

/** Minimal Queryable whose stripe_price_product_map read returns `map`. */
function fakeDb(map: Record<string, string>): Queryable {
  return {
    query: vi.fn(async () => ({
      rowCount: 1,
      rows: [{ variable_value_json: map }],
    })),
  } as unknown as Queryable;
}

describe('mapStripeSubStatus', () => {
  it('maps access-affecting statuses; everything else → null', () => {
    expect(mapStripeSubStatus('active')).toBe('active');
    expect(mapStripeSubStatus('past_due')).toBe('past_due');
    expect(mapStripeSubStatus('unpaid')).toBe('expired'); // dunning exhausted
    for (const s of ['trialing', 'incomplete', 'incomplete_expired', 'canceled', 'paused'] as const) {
      expect(mapStripeSubStatus(s)).toBeNull();
    }
  });
});

describe('deriveEffectiveStripeStatus (priority active > past_due > expired)', () => {
  it('any active sub → active', () => {
    expect(deriveEffectiveStripeStatus([sub('past_due'), sub('active'), sub('canceled')])).toBe('active');
  });
  it('no active, any past_due → past_due', () => {
    expect(deriveEffectiveStripeStatus([sub('canceled'), sub('past_due')])).toBe('past_due');
  });
  it('no access-granting sub → expired', () => {
    expect(deriveEffectiveStripeStatus([sub('canceled'), sub('incomplete')])).toBe('expired');
  });
  it('a customer with zero subscriptions → expired (no access)', () => {
    expect(deriveEffectiveStripeStatus([])).toBe('expired');
  });
});

describe('resolvePriceProduct (OD3 price → product map, ~60s TTL cache)', () => {
  beforeEach(() => _resetPriceProductMapCacheForTests());

  it('maps a configured price to its product', async () => {
    expect(await resolvePriceProduct(fakeDb({ price_fc: 'flight_center' }), 'price_fc')).toBe('flight_center');
  });

  it('null price → lead_gen without touching the DB (OD5 default)', async () => {
    const db = fakeDb({});
    expect(await resolvePriceProduct(db, null)).toBe('lead_gen');
    expect((db as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it('unmapped price → lead_gen (WARN path, never an error)', async () => {
    expect(await resolvePriceProduct(fakeDb({}), 'price_unknown')).toBe('lead_gen');
  });

  it('a mapped-but-invalid product value fails soft to lead_gen (chk constraint would reject it)', async () => {
    expect(await resolvePriceProduct(fakeDb({ price_x: 'not_a_product' }), 'price_x')).toBe('lead_gen');
  });

  it('caches the map — a second resolve within the TTL issues no second query', async () => {
    const db = fakeDb({ price_fc: 'flight_center' });
    await resolvePriceProduct(db, 'price_fc');
    await resolvePriceProduct(db, 'price_fc');
    expect((db as unknown as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledTimes(1);
  });
});

describe('deriveEffectiveStripeStatusByProduct (per-product grouping, plan Item 4)', () => {
  beforeEach(() => _resetPriceProductMapCacheForTests());

  it('groups subscriptions by mapped product and applies the priority logic per group', async () => {
    const db = fakeDb({ price_lg: 'lead_gen', price_fc: 'flight_center' });
    const result = await deriveEffectiveStripeStatusByProduct(db, [
      sub('active', 'price_lg'),
      sub('past_due', 'price_fc'),
    ]);
    expect(result.get('lead_gen')).toBe('active');
    expect(result.get('flight_center')).toBe('past_due');
  });

  it('one product cancelled + the other live resolve independently (N2 — no cross-product collapse)', async () => {
    const db = fakeDb({ price_lg: 'lead_gen', price_fc: 'flight_center' });
    const result = await deriveEffectiveStripeStatusByProduct(db, [
      sub('canceled', 'price_lg'),
      sub('active', 'price_fc'),
    ]);
    expect(result.get('lead_gen')).toBe('expired');
    expect(result.get('flight_center')).toBe('active');
  });

  it('unmapped-price subs collapse into lead_gen (OD5 default)', async () => {
    const result = await deriveEffectiveStripeStatusByProduct(fakeDb({}), [
      sub('past_due', 'price_mystery'),
      sub('active', 'price_other'),
    ]);
    expect(result.get('lead_gen')).toBe('active');
    expect(result.size).toBe(1);
  });

  it('zero subscriptions → empty map (callers apply their own no-sub fallback)', async () => {
    const result = await deriveEffectiveStripeStatusByProduct(fakeDb({}), []);
    expect(result.size).toBe(0);
  });
});

describe('ReconcileApplySchema', () => {
  it('requires apply:true and a ≥3-char reason', () => {
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'drift observed' }).success).toBe(true);
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'no' }).success).toBe(false); // too short
    expect(ReconcileApplySchema.safeParse({ apply: false, reason: 'valid reason' }).success).toBe(false); // not literal true
    expect(ReconcileApplySchema.safeParse({ reason: 'valid reason' }).success).toBe(false); // apply missing
    expect(ReconcileApplySchema.safeParse({ apply: true }).success).toBe(false); // reason missing
  });

  it('accepts an optional per-product scope and rejects unknown products (W7)', () => {
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'drift', product: 'lead_gen' }).success).toBe(true);
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'drift', product: 'flight_center' }).success).toBe(true);
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'drift', product: 'lot_opt' }).success).toBe(false);
  });
});

describe('RetryCancelSchema', () => {
  it('requires a ≥3-char reason', () => {
    expect(RetryCancelSchema.safeParse({ reason: 'operator retry' }).success).toBe(true);
    expect(RetryCancelSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(RetryCancelSchema.safeParse({}).success).toBe(false);
  });
});

describe('RECONCILE_PROTECTED_STATUSES', () => {
  it('shields deleted + comp accounts from reconcile-apply', () => {
    expect(RECONCILE_PROTECTED_STATUSES.has('cancelled_pending_deletion')).toBe(true);
    expect(RECONCILE_PROTECTED_STATUSES.has('admin_managed')).toBe(true);
    expect(RECONCILE_PROTECTED_STATUSES.has('active')).toBe(false);
    expect(RECONCILE_PROTECTED_STATUSES.has('expired')).toBe(false);
  });
});
