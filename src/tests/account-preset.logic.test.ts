// SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §4 (persona derivation)
// P24-24A (AMENDED 2026-07-11) — named unit cases for the deterministic
// account_preset derivation. v2 ruling: 'supplier' is EXPLICIT-ONLY (admin
// provisioning or the audited join-editor set_preset) and is NEVER derived
// from the trade — self-serve derivation defaults every non-realtor trade to
// 'tradesperson'.
import { describe, it, expect } from 'vitest';
import {
  deriveAccountPreset,
  REALTOR_TRADE_SLUG,
  type AccountPreset,
} from '@/lib/classification/account-preset';
import { AdminUserMutationSchema, CreateUserBodySchema } from '@/lib/admin/user-management-schemas';

describe('deriveAccountPreset (v2 — supplier explicit-only)', () => {
  it('realtor slug → realtor', () => {
    expect(deriveAccountPreset('realtor')).toBe('realtor');
    expect(deriveAccountPreset(REALTOR_TRADE_SLUG)).toBe('realtor');
  });

  it('product trades → tradesperson (NOT supplier — the v2 overrule)', () => {
    // The v1 partition derived these to 'supplier'; overruled because a trade
    // slug cannot distinguish a plumber from a plumbing-supply manufacturer.
    for (const slug of ['glazing', 'plumbing', 'framing', 'overhead-doors', 'stone-countertops', 'site-maintenance']) {
      expect(deriveAccountPreset(slug)).toBe('tradesperson');
    }
  });

  it('construction / labour trades → tradesperson', () => {
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
  });

  it('NEVER derives supplier or manufacturer for ANY input (explicit-only invariant)', () => {
    // Sweep representative + edge inputs; the function's whole range must be
    // {tradesperson, realtor}.
    const inputs = [
      'realtor', 'glazing', 'plumbing', 'concrete', 'supplier', 'manufacturer',
      'not-a-real-trade', '', '   ', null, undefined,
    ];
    const range = new Set<AccountPreset>(inputs.map((i) => deriveAccountPreset(i)));
    expect([...range].sort()).toEqual(['realtor', 'tradesperson']);
  });

  it('supplier IS reachable via the explicit paths (schema-level pin)', () => {
    // 1. Admin provisioning: CreateUserBodySchema admits account_preset='supplier'.
    expect(
      CreateUserBodySchema.safeParse({
        email: 'glass@example.com',
        account_preset: 'supplier',
        trade_slugs: ['glazing'],
        reason: 'onboard supplier',
      }).success,
    ).toBe(true);
    // 2. The audited join-editor re-label: set_preset admits 'supplier'.
    expect(
      AdminUserMutationSchema.safeParse({
        action: 'set_preset',
        account_preset: 'supplier',
        reason: 're-label self-serve account as supplier',
      }).success,
    ).toBe(true);
  });
});
