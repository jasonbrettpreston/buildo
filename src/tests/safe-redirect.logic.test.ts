// SPEC LINK: docs/specs/00-architecture/13_authentication.md §2, §3.3
//
// WF3 login open redirect (MF-46 plan security seat F1, HIGH). The ?redirect=
// target after sign-in must stay on the site. `/%09/evil.com` decodes to
// `/<TAB>/evil.com`; the WHATWG URL parser strips the tab, so the target
// resolves to `https://evil.com/` and Next's router (isExternalURL) does a
// full navigation there. One shared guard, `safeRedirectPath`, serves both
// callers: src/app/login/page.tsx and src/app/auth/callback/route.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

const ORIGIN = 'https://buildo.com';

/** The value a caller reads: `new URLSearchParams(search).get('redirect')`. */
function fromQuery(encoded: string): string | null {
  return new URLSearchParams(`redirect=${encoded}`).get('redirect');
}

/** Where the browser lands for a guarded target (the router resolves against location). */
function landing(target: string): URL {
  return new URL(target, `${ORIGIN}/login`);
}

// Attack inputs as they appear in the query string (the caller decodes once).
const ATTACK_QUERIES = [
  '/%09/evil.com',
  '/%0a/evil.com',
  '/%0d/evil.com',
  '/%0A/evil.com',
  '/%00/evil.com',
  '/%7f/evil.com',
  '%09//evil.com',
  '/%09%09/evil.com',
  '/%20%09/evil.com',
  '//evil.com',
  '/%5Cevil.com',
  '/%5cevil.com',
  '/%2F%2Fevil.com',
  '/%2f%2fevil.com',
  '%2f%2fevil.com',
  '%2F%2Fevil.com',
  'https://evil.com',
  'HTTPS://EVIL.COM',
  'https:evil.com',
  'javascript:alert(1)',
  '%20//evil.com',
  '/%252F%252Fevil.com',
  '/%2509/evil.com',
  '/%255Cevil.com',
];

// Attack inputs as already-decoded values handed to the guard.
const ATTACK_VALUES = [
  '/\t/evil.com',
  '/\n/evil.com',
  '/\r/evil.com',
  '/\t\t/evil.com',
  '\t//evil.com',
  '/ \t/evil.com',
  '//evil.com',
  '//EVIL.com',
  '/\\evil.com',
  '/\\/evil.com',
  '\\\\evil.com',
  'https://evil.com',
  'HtTpS://evil.com',
  ' https://evil.com',
  ' //evil.com',
  '/%2F%2Fevil.com',
  '/%2f/evil.com',
  '/%5Cevil.com',
  '/%09/evil.com',
  '/%0a/evil.com',
  '/%E0%A4%A',
  '',
];

describe('safeRedirectPath: attack inputs fall back to /dashboard (RED before the fix)', () => {
  it.each(ATTACK_QUERIES)('query %s', (q) => {
    const out = safeRedirectPath(fromQuery(q));
    expect(out).toBe('/dashboard');
    expect(landing(out).origin).toBe(ORIGIN);
  });

  it.each(ATTACK_VALUES)('value %j', (v) => {
    const out = safeRedirectPath(v);
    expect(out).toBe('/dashboard');
    expect(landing(out).origin).toBe(ORIGIN);
  });

  it('null and undefined fall back', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath(undefined)).toBe('/dashboard');
  });
});

// The middleware sets ?redirect=<pathname> (src/middleware.ts:126,144);
// these internal targets must come back byte-identical, as before the fix.
const VALID = [
  '/',
  '/dashboard',
  '/admin',
  '/admin/lead-feed/inspector',
  '/permits/24%20101234--01',
  '/permits/24 101234--01',
  '/search?q=main%20st&page=2',
  '/search?next=//not-a-host',
  '/map#zoom=14',
  '/onboarding/trade',
  '/a/b/c/',
  '/caf%C3%A9',
  '/café',
  '/%7Euser',
  '/.well-known/x',
  '/-/x',
  '/a//b',
  '/a?x=1&y=%2F%2F',
];

describe('safeRedirectPath: valid internal paths are unchanged', () => {
  it.each(VALID)('%j', (p) => {
    expect(safeRedirectPath(p)).toBe(p);
    expect(landing(p).origin).toBe(ORIGIN);
  });

  it.each(VALID)('%j through the query round trip', (p) => {
    const qs = new URLSearchParams({ redirect: p }).toString().slice('redirect='.length);
    expect(safeRedirectPath(fromQuery(qs))).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// The OAuth callback uses the same guard (one guard for every caller).
// ---------------------------------------------------------------------------
const mockExchange = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { exchangeCodeForSession: mockExchange } })),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

async function callbackLocation(redirectQuery: string | null): Promise<string | null> {
  const { NextRequest } = await import('next/server');
  const { GET } = await import('@/app/auth/callback/route');
  const qs = redirectQuery === null ? 'code=abc' : `code=abc&redirect=${redirectQuery}`;
  const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?${qs}`));
  return res.headers.get('location');
}

describe('auth/callback: redirect param goes through the shared guard', () => {
  beforeEach(() => {
    mockExchange.mockReset();
    mockExchange.mockResolvedValue({ error: null });
  });

  it.each(ATTACK_QUERIES)('query %s lands on /dashboard', async (q) => {
    expect(await callbackLocation(q)).toBe(`${ORIGIN}/dashboard`);
  });

  it.each(VALID)('valid %j is unchanged', async (p) => {
    const qs = new URLSearchParams({ redirect: p }).toString().slice('redirect='.length);
    expect(await callbackLocation(qs)).toBe(new URL(`${ORIGIN}${p}`).href);
  });

  it('no redirect param lands on /dashboard', async () => {
    expect(await callbackLocation(null)).toBe(`${ORIGIN}/dashboard`);
  });

  it('a failed exchange still goes to the login error page', async () => {
    mockExchange.mockResolvedValue({ error: new Error('bad code') });
    expect(await callbackLocation('/dashboard')).toBe(`${ORIGIN}/login?error=oauth_callback_failed`);
  });
});
