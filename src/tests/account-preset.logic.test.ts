// SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §4 (persona derivation)
// P24-24A — named unit cases for the deterministic account_preset derivation.
import { describe, it, expect } from 'vitest';
import {
  deriveAccountPreset,
  PRODUCT_TRADE_SLUGS,
  REALTOR_TRADE_SLUG,
} from '@/lib/classification/account-preset';

describe('deriveAccountPreset', () => {
  it('realtor slug → realtor', () => {
    expect(deriveAccountPreset('realtor')).toBe('realtor');
    expect(deriveAccountPreset(REALTOR_TRADE_SLUG)).toBe('realtor');
  });

  it('every product trade → supplier', () => {
    for (const slug of PRODUCT_TRADE_SLUGS) {
      expect(deriveAccountPreset(slug)).toBe('supplier');
    }
  });

  it('construction / labour trades → tradesperson', () => {
    // A representative sample of the 14 non-product construction trades.
    for (const slug of ['excavation', 'concrete', 'structural-steel', 'demolition', 'solar', 'landscaping', 'drain-plumbing']) {
      expect(deriveAccountPreset(slug)).toBe('tradesperson');
    }
  });

  it('NULL / undefined / empty edges → tradesperson (safe default)', () => {
    expect(deriveAccountPreset(null)).toBe('tradesperson');
    expect(deriveAccountPreset(undefined)).toBe('tradesperson');
    expect(deriveAccountPreset('')).toBe('tradesperson');
    expect(deriveAccountPreset('   ')).toBe('tradesperson');
  });

  it('unknown slug → tradesperson (safe default, never throws)', () => {
    expect(deriveAccountPreset('not-a-real-trade')).toBe('tradesperson');
  });

  it('trims whitespace before matching', () => {
    expect(deriveAccountPreset('  realtor  ')).toBe('realtor');
    expect(deriveAccountPreset('  glazing ')).toBe('supplier');
  });

  it('PRODUCT_TRADE_SLUGS is the 20-slug partition (Spec 80 §5.B.4)', () => {
    expect(PRODUCT_TRADE_SLUGS).toHaveLength(20);
    expect(PRODUCT_TRADE_SLUGS).not.toContain('realtor');
  });
});
