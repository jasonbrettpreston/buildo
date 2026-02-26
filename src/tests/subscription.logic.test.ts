// 🔗 SPEC LINK: docs/specs/25_subscription.md
// Subscription plan definitions and feature gating
import { describe, it, expect } from 'vitest';
import {
  PLANS,
  canAccess,
  isWithinLimit,
  type PlanTier,
  type PlanFeatures,
} from '@/lib/subscription/plans';

describe('Plan Catalog', () => {
  const ALL_TIERS: PlanTier[] = ['free', 'pro', 'enterprise'];

  it('defines exactly 3 plan tiers', () => {
    expect(Object.keys(PLANS)).toHaveLength(3);
    ALL_TIERS.forEach((tier) => {
      expect(PLANS[tier]).toBeDefined();
    });
  });

  it('free plan has restrictive limits', () => {
    const free = PLANS.free;
    expect(free.max_saved_permits).toBe(5);
    expect(free.max_exports_per_day).toBe(2);
    expect(free.has_analytics).toBe(false);
    expect(free.has_teams).toBe(false);
    expect(free.has_api_access).toBe(false);
    expect(free.has_priority_support).toBe(false);
    expect(free.price_monthly_cad).toBe(0);
  });

  it('pro plan has unlimited permits and exports', () => {
    const pro = PLANS.pro;
    expect(pro.max_saved_permits).toBe(Infinity);
    expect(pro.max_exports_per_day).toBe(Infinity);
    expect(pro.has_analytics).toBe(true);
    expect(pro.has_teams).toBe(false);
    expect(pro.has_api_access).toBe(false);
    expect(pro.price_monthly_cad).toBe(29);
  });

  it('enterprise plan has all features enabled', () => {
    const ent = PLANS.enterprise;
    expect(ent.max_saved_permits).toBe(Infinity);
    expect(ent.max_exports_per_day).toBe(Infinity);
    expect(ent.has_analytics).toBe(true);
    expect(ent.has_teams).toBe(true);
    expect(ent.has_api_access).toBe(true);
    expect(ent.has_priority_support).toBe(true);
    expect(ent.price_monthly_cad).toBe(99);
  });

  it('plans are in ascending price order', () => {
    expect(PLANS.free.price_monthly_cad).toBeLessThan(PLANS.pro.price_monthly_cad);
    expect(PLANS.pro.price_monthly_cad).toBeLessThan(PLANS.enterprise.price_monthly_cad);
  });
});

describe('canAccess', () => {
  it('free plan can access saved permits (numeric > 0)', () => {
    expect(canAccess('free', 'max_saved_permits')).toBe(true);
  });

  it('free plan cannot access analytics', () => {
    expect(canAccess('free', 'has_analytics')).toBe(false);
  });

  it('free plan cannot access teams', () => {
    expect(canAccess('free', 'has_teams')).toBe(false);
  });

  it('pro plan can access analytics', () => {
    expect(canAccess('pro', 'has_analytics')).toBe(true);
  });

  it('pro plan cannot access teams', () => {
    expect(canAccess('pro', 'has_teams')).toBe(false);
  });

  it('pro plan cannot access API', () => {
    expect(canAccess('pro', 'has_api_access')).toBe(false);
  });

  it('enterprise plan can access everything', () => {
    const features: (keyof PlanFeatures)[] = [
      'has_analytics',
      'has_teams',
      'has_api_access',
      'has_priority_support',
      'max_saved_permits',
      'max_exports_per_day',
    ];
    features.forEach((f) => {
      expect(canAccess('enterprise', f)).toBe(true);
    });
  });
});

describe('isWithinLimit', () => {
  it('free plan: 3 saved permits is within limit of 5', () => {
    expect(isWithinLimit('free', 'max_saved_permits', 3)).toBe(true);
  });

  it('free plan: 5 saved permits is NOT within limit (must be < limit)', () => {
    expect(isWithinLimit('free', 'max_saved_permits', 5)).toBe(false);
  });

  it('free plan: 6 saved permits exceeds limit', () => {
    expect(isWithinLimit('free', 'max_saved_permits', 6)).toBe(false);
  });

  it('free plan: 1 export is within limit of 2', () => {
    expect(isWithinLimit('free', 'max_exports_per_day', 1)).toBe(true);
  });

  it('free plan: 2 exports is at limit (not within)', () => {
    expect(isWithinLimit('free', 'max_exports_per_day', 2)).toBe(false);
  });

  it('pro plan: any number of saved permits is within Infinity limit', () => {
    expect(isWithinLimit('pro', 'max_saved_permits', 999999)).toBe(true);
  });

  it('enterprise plan: any usage is within Infinity limits', () => {
    expect(isWithinLimit('enterprise', 'max_exports_per_day', 1000000)).toBe(true);
  });

  it('boolean features always return true (non-numeric)', () => {
    expect(isWithinLimit('free', 'has_analytics', 0)).toBe(true);
    expect(isWithinLimit('free', 'has_teams', 100)).toBe(true);
  });

  it('zero usage is always within any positive limit', () => {
    expect(isWithinLimit('free', 'max_saved_permits', 0)).toBe(true);
    expect(isWithinLimit('free', 'max_exports_per_day', 0)).toBe(true);
  });
});
