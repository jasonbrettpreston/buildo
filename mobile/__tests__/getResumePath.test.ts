/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 11
//             docs/specs/03-mobile/95_mobile_user_profiles.md §6 (trade_slug immutability)
//
// Pure-function tests for getResumePath — the AuthGate's onboarding resume
// helper. Primary signal: client-side currentStep (Spec 94 §10 Step 11).
// Fallback: derived from server profile state for MMKV-cleared scenarios.
//
// Matches the require()-pattern used in __tests__/onboarding.test.ts; no
// React component rendering needed (pure function under test).

describe('getResumePath', () => {
  // -----------------------------------------------------------------
  // Primary signal — currentStep is set, trust it regardless of profile
  // -----------------------------------------------------------------

  it("returns /(onboarding)/profession when currentStep='profession'", () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: null,
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'profession')).toBe('/(onboarding)/profession');
  });

  it("returns /(onboarding)/path when currentStep='path'", () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'path')).toBe('/(onboarding)/path');
  });

  it("returns /(onboarding)/address when currentStep='address'", () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'address')).toBe('/(onboarding)/address');
  });

  it("returns /(onboarding)/supplier when currentStep='supplier'", () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: 'home_base_fixed',
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'supplier')).toBe('/(onboarding)/supplier');
  });

  it("returns /(onboarding)/terms when currentStep='terms'", () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: 'home_base_fixed',
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'terms')).toBe('/(onboarding)/terms');
  });

  it("DEFENSIVE: returns /(onboarding)/complete if currentStep='complete' is somehow written", () => {
    // No screen calls setStep('complete') — markComplete() is the terminal
    // action and it sets currentStep to null. This case verifies that IF a
    // stale MMKV write or future regression stores 'complete' as currentStep,
    // getResumePath still returns a valid navigable path rather than falling
    // through to the path-based fallback (which would route an end-of-flow
    // user back to /path, potentially looping). The convention against
    // setStep('complete') is enforced by code review, not the type system.
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: 'home_base_fixed',
      tos_accepted_at: '2026-05-02T00:00:00Z',
      onboarding_complete: false,
    };
    expect(getResumePath(profile, 'complete')).toBe('/(onboarding)/complete');
  });

  // -----------------------------------------------------------------
  // Fallback — currentStep is null, derive from profile
  // -----------------------------------------------------------------

  it('FALLBACK: returns profession when currentStep null and trade_slug null (fresh user)', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: null,
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, null)).toBe('/(onboarding)/profession');
  });

  it('FALLBACK: returns path when currentStep null and trade_slug set non-realtor', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    // MMKV cleared but server has trade_slug; resume non-realtor at path step
    expect(getResumePath(profile, null)).toBe('/(onboarding)/path');
  });

  it('FALLBACK: returns address when currentStep null and trade_slug=realtor with no location', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'realtor',
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    // Realtor flow skips path step; goes profession → address → terms
    expect(getResumePath(profile, null)).toBe('/(onboarding)/address');
  });

  it('FALLBACK: returns terms when currentStep null and realtor with location set but no TOS', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'realtor',
      location_mode: 'home_base_fixed',
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    expect(getResumePath(profile, null)).toBe('/(onboarding)/terms');
  });

  it('FALLBACK: returns profession when profile is null (defensive — loading state)', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    expect(getResumePath(null, null)).toBe('/(onboarding)/profession');
  });

  // -----------------------------------------------------------------
  // Defensive — unknown step value falls through to fallback
  // -----------------------------------------------------------------

  it('returns fallback when currentStep is an unrecognized string (stale MMKV write)', () => {
    const { getResumePath } = require('@/lib/onboarding/getResumePath');
    const profile = {
      trade_slug: 'framing',
      location_mode: null,
      tos_accepted_at: null,
      onboarding_complete: false,
    };
    // Unknown step → fall through to derivation; trade_slug is set non-realtor → path
    expect(getResumePath(profile, 'invalid-step' as never)).toBe('/(onboarding)/path');
  });
});
