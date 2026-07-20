/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/93_mobile_auth.md §2.2 (D15 phone gating)
//
// D15 / P2-D1 [panel-fold: Ground truth + Integration, HIGH]: phone-OTP is
// gated OFF at ALL THREE entry points. This suite locks each one:
//   (a) sign-in.tsx  — "Continue with Phone" button render        (source-scan)
//   (b) sign-up.tsx  — in-page `setMethod('phone')` Pressable     (source-scan)
//   (c) sign-up.tsx  — `initialMethod` computation from ?method=  (pure fn,
//       both flag polarities — the stale-deep-link bypass case)
// Plus: the flag's shipped default is FALSE, and the gated call sites stay
// fully wired in the tree ("gated off, not deleted" — P2-F3.3).
//
// Source-scan approach follows the repo's storeReset.coverage.test.ts
// precedent — the screens have no RTL harness.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

import { PHONE_AUTH_ENABLED, resolveSignUpMethod } from '@/lib/featureFlags';

const signInSrc = fs.readFileSync(path.resolve(__dirname, '../app/(auth)/sign-in.tsx'), 'utf-8');
const signUpSrc = fs.readFileSync(path.resolve(__dirname, '../app/(auth)/sign-up.tsx'), 'utf-8');

describe('PHONE_AUTH_ENABLED flag (P2-D1)', () => {
  it('ships OFF (D15)', () => {
    expect(PHONE_AUTH_ENABLED).toBe(false);
  });
});

describe('entry point (a) — sign-in "Continue with Phone" button render gate', () => {
  it('the phone button render is guarded by PHONE_AUTH_ENABLED', () => {
    // The guard must precede the phone Pressable's testID within the same
    // JSX conditional block.
    expect(signInSrc).toMatch(/\{PHONE_AUTH_ENABLED && \([\s\S]{0,900}?testID="phone-button"/);
  });

  it('the gated flow stays fully wired (signInWithOtp + verifyOtp call sites present)', () => {
    // "Gated off, not deleted" (P2-F3.3): flipping the flag re-enables the
    // flow with zero code archaeology.
    expect(signInSrc).toMatch(/supabase\.auth\.signInWithOtp\(\{\s*phone:/);
    expect(signInSrc).toMatch(/supabase\.auth\.verifyOtp\(\{/);
    expect(signInSrc).toMatch(/type:\s*'sms'/);
  });
});

describe('entry point (b) — sign-up in-page phone Pressable render gate', () => {
  it('the setMethod("phone") Pressable is guarded by PHONE_AUTH_ENABLED', () => {
    expect(signUpSrc).toMatch(/\{PHONE_AUTH_ENABLED && \([\s\S]{0,600}?setMethod\('phone'\)/);
  });

  it('the gated sign-up phone flow stays fully wired', () => {
    expect(signUpSrc).toMatch(/supabase\.auth\.signInWithOtp\(\{\s*phone:/);
    expect(signUpSrc).toMatch(/supabase\.auth\.verifyOtp\(\{/);
  });
});

describe('entry point (c) — initialMethod computation gate (stale deep-link bypass)', () => {
  it('sign-up.tsx computes initialMethod through resolveSignUpMethod, not a raw ternary', () => {
    expect(signUpSrc).toMatch(/resolveSignUpMethod\(params\.method\)/);
  });

  it('?method=phone deep link degrades to email while the flag is OFF (the bypass case)', () => {
    // A stale deep link must never land the user in the phone flow even
    // though the buttons are hidden elsewhere [panel-fold: GT + Integration].
    expect(resolveSignUpMethod('phone', false)).toBe('email');
    // And at the SHIPPED default specifically:
    expect(resolveSignUpMethod('phone')).toBe('email');
  });

  it('?method=phone enters the phone flow once the flag is flipped ON', () => {
    expect(resolveSignUpMethod('phone', true)).toBe('phone');
  });

  it('non-phone params resolve to email under both polarities', () => {
    expect(resolveSignUpMethod(undefined, false)).toBe('email');
    expect(resolveSignUpMethod(undefined, true)).toBe('email');
    expect(resolveSignUpMethod('email', true)).toBe('email');
    expect(resolveSignUpMethod('garbage', true)).toBe('email');
  });
});
