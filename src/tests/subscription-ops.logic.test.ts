// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Pure-logic pins for the Subscription-Ops layer (P26-26-ADMIN):
//   - mapStripeSubStatus / deriveEffectiveStripeStatus (the single shared
//     source the webhook AND reconcile both use — a drift-detector that cannot
//     drift from what the webhook writes);
//   - the request schemas (mandatory reason, apply:true literal).

import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { mapStripeSubStatus, deriveEffectiveStripeStatus } from '@/lib/stripe/client';
import { ReconcileApplySchema, RetryCancelSchema, RECONCILE_PROTECTED_STATUSES } from '@/lib/admin/subscription-ops-schemas';

const sub = (status: string): Stripe.Subscription => ({ status } as unknown as Stripe.Subscription);

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

describe('ReconcileApplySchema', () => {
  it('requires apply:true and a ≥3-char reason', () => {
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'drift observed' }).success).toBe(true);
    expect(ReconcileApplySchema.safeParse({ apply: true, reason: 'no' }).success).toBe(false); // too short
    expect(ReconcileApplySchema.safeParse({ apply: false, reason: 'valid reason' }).success).toBe(false); // not literal true
    expect(ReconcileApplySchema.safeParse({ reason: 'valid reason' }).success).toBe(false); // apply missing
    expect(ReconcileApplySchema.safeParse({ apply: true }).success).toBe(false); // reason missing
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
