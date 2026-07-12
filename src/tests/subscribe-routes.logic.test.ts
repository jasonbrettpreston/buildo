// SPEC LINK: docs/specs/02-web-admin/20_stripe_web_checkout.md §3.2, §5
//            docs/specs/13_auth.md
//
// Route-guard classification pins for the P26 checkout/subscription route
// family. These pin the EXACT trap the plan caught: /api/subscribe/* would
// prefix-inherit 'authenticated' from AUTHENTICATED_API_ROUTES, so the
// sessionless exchange endpoint MUST be a PUBLIC_EXACT_API_PATHS entry —
// while its authenticated siblings (session, portal-session) must NOT be.

import { describe, it, expect } from 'vitest';
import { classifyRoute } from '@/lib/auth/route-guard';

describe('P26 route classification — the checkout family', () => {
  it('exchange is public (the nonce is the credential)', () => {
    expect(classifyRoute('/api/subscribe/exchange')).toBe('public');
  });

  it('exchange siblings do NOT inherit public (exact-match only)', () => {
    expect(classifyRoute('/api/subscribe/exchange-evil')).toBe('authenticated');
    expect(classifyRoute('/api/subscribe/exchange/extra')).toBe('authenticated');
  });

  it('session (nonce ISSUER) stays authenticated', () => {
    expect(classifyRoute('/api/subscribe/session')).toBe('authenticated');
  });

  it('portal-session stays authenticated (26C — session-authed billing portal)', () => {
    expect(classifyRoute('/api/subscribe/portal-session')).toBe('authenticated');
  });

  it('the /subscribe page family is public (sessionless mobile-handoff visitors + Stripe redirects)', () => {
    expect(classifyRoute('/subscribe')).toBe('public');
    expect(classifyRoute('/subscribe/success')).toBe('public');
    expect(classifyRoute('/subscribe/cancel')).toBe('public');
  });

  it('unknown /subscribe sub-pages fall back to fail-closed authenticated', () => {
    expect(classifyRoute('/subscribe/admin')).toBe('authenticated');
  });
});
