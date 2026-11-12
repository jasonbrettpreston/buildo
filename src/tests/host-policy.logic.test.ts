// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.1 (the host allow-list), 11b.3 `web_login` (never /dashboard),
//            11b.7 dated note 2026-11-11 item 8 (maxbld.ca apex only); docs/specs/02-web-admin/128_surface_standard_policy.md R-03;
//            docs/specs/00-architecture/13_authentication.md §3.5.
//
// MF-46 · the Host-parameterised table test (queue row MF-46 done-condition: "on maxbld.ca every scope-D path is refused (Host table test
// RED on a mutated copy)"). Pure-function cases over src/lib/auth/host-policy.ts, the real middleware() with a Host header, the MaxBLD
// branch of safeRedirectPath and the shared OAuth callback on maxbld.ca. Plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md (v1 §3.1, folds 1-4).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));
const mockExchange = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mockExchange } }),
}));

import {
  MAXBLD_ROUTES,
  MAXBLD_INTERNAL_PREFIX,
  MAXBLD_POST_LOGIN,
  matchMaxbldRoute,
  normalizeHost,
  resolveHost,
  type MaxbldRoute,
} from '@/lib/auth/host-policy';
import { classifyRoute } from '@/lib/auth/route-guard';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { middleware } from '@/middleware';

// The scope-D paths of the programme card (:51, :137) plus the scope B/C paths that are not MaxBLD rows. Each is refused on maxbld.ca.
const NOT_MAXBLD = [
  '/', '/dashboard', '/dashboard/leads', '/permits/x', '/builders', '/builders/1', '/api/permits', '/api/permits/1', '/api/builders',
  '/api/coa', '/api/trades', '/api/quality', '/api/leads', '/api/products', '/admin', '/admin/media', '/api/admin/stats', '/subscribe',
  '/subscribe/success', '/api/subscribe/exchange', '/api/webhooks/stripe', '/api/user-profile', '/api/sync', '/api/auth/x',
  '/parcel-toolx', '/api/parcels', '/api/parcels/lookupx', '/robots.txtx', '/zzz',
];
// Hosts that are NOT maxbld.ca (lookalikes included): Buildo behaviour.
const OTHER_HOSTS = ['buildo.com', 'x.vercel.app', 'localhost:3000', 'evilmaxbld.ca', 'evil.maxbld.ca', 'maxbld.ca.evil.com', 'www.maxbld.ca', '[::1]:3000', ''];
const MAXBLD_HOSTS = ['maxbld.ca', 'MAXBLD.CA', 'maxbld.ca:443', 'maxbld.ca:80', 'maxbld.ca.'];

/** The scope-D guard as a function of the table, so a mutated copy can be judged (RED on a mutated copy). */
function servedNonMaxbld(routes: readonly MaxbldRoute[]): string[] {
  return NOT_MAXBLD.filter((p) => resolveHost('maxbld.ca', p, routes).kind !== 'refuse');
}

describe('host-policy: hosts', () => {
  it.each(MAXBLD_HOSTS)('%s is the MaxBLD host', (h) => {
    expect(normalizeHost(h)).toBe('maxbld.ca');
  });
  it.each(OTHER_HOSTS)('%j is not the MaxBLD host', (h) => {
    expect(normalizeHost(h)).not.toBe('maxbld.ca');
  });
  it('null and unparsable hosts are Buildo', () => {
    expect(normalizeHost(null)).toBe('');
    expect(normalizeHost(undefined)).toBe('');
    expect(resolveHost(null, '/dashboard')).toEqual({ kind: 'buildo' });
  });
});

describe('host-policy: maxbld.ca serves only its rows', () => {
  it.each(NOT_MAXBLD)('%s is refused on maxbld.ca', (p) => {
    expect(resolveHost('maxbld.ca', p).kind).toBe('refuse');
  });

  it('no non-MaxBLD path is served by the real table', () => {
    expect(servedNonMaxbld(MAXBLD_ROUTES)).toEqual([]);
  });

  it('RED on a mutated copy: a table that adds /api/permits serves a scope-D path', () => {
    const mutated: MaxbldRoute[] = [...MAXBLD_ROUTES, { path: '/api/permits', match: 'prefix', routeClass: 'authenticated' }];
    expect(servedNonMaxbld(mutated)).toEqual(['/api/permits', '/api/permits/1']);
  });

  it('RED on a mutated copy: a whole-prefix row for /dashboard serves it', () => {
    const mutated: MaxbldRoute[] = [...MAXBLD_ROUTES, { path: '/dashboard', match: 'prefix', routeClass: 'authenticated' }];
    expect(servedNonMaxbld(mutated)).toEqual(['/dashboard', '/dashboard/leads']);
  });

  it.each(MAXBLD_ROUTES.map((r) => [r.path, r]))('row %s is served on maxbld.ca', (p, r) => {
    const d = resolveHost('maxbld.ca', p as string);
    expect(d.kind).toBe('maxbld');
    if (d.kind === 'maxbld') expect(d.route).toBe(r);
  });

  it('a prefix row matches by whole segment, a trailing slash is ignored, case is not folded', () => {
    expect(matchMaxbldRoute('/parcel-tool/123')?.path).toBe('/parcel-tool');
    expect(matchMaxbldRoute('/parcel-tool/')?.path).toBe('/parcel-tool');
    expect(matchMaxbldRoute('/parcel-toolbox')).toBeNull();
    expect(matchMaxbldRoute('/Parcel-Tool')).toBeNull();
    expect(matchMaxbldRoute('/auth/callback/')?.path).toBe('/auth/callback');
  });

  it("each row's class is never weaker than classifyRoute gives its path", () => {
    for (const r of MAXBLD_ROUTES) {
      const own = classifyRoute(r.internal ?? r.path);
      if (r.internal === undefined) expect(r.routeClass).toBe(own === 'admin' ? 'never' : own);
      else expect(r.internal.startsWith(`${MAXBLD_INTERNAL_PREFIX}/`)).toBe(true);
    }
  });
});

describe('host-policy: every other host is Buildo, minus the internal prefix', () => {
  it.each(OTHER_HOSTS)('%j refuses the internal prefix', (h) => {
    expect(resolveHost(h, '/parcel-tool').kind).toBe('refuse');
    expect(resolveHost(h, '/parcel-tool/123').kind).toBe('refuse');
  });
  it.each(OTHER_HOSTS)('%j keeps Buildo paths', (h) => {
    for (const p of ['/', '/dashboard', '/login', '/api/permits', '/admin', '/parcel-toolbox']) {
      expect(resolveHost(h, p)).toEqual({ kind: 'buildo' });
    }
  });
});

describe('middleware: the fence runs first', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const req = (host: string, path: string, cookie?: string): NextRequest => {
    const headers: Record<string, string> = { host };
    if (cookie) headers.cookie = cookie;
    return new NextRequest(`https://${host}${path}`, { headers });
  };

  it('maxbld.ca /dashboard is a 404, not a redirect', async () => {
    const res = await middleware(req('maxbld.ca', '/dashboard'));
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('maxbld.ca /api/permits is a 404 with no body', async () => {
    const res = await middleware(req('maxbld.ca', '/api/permits'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('dev mode never skips the fence', async () => {
    process.env.DEV_MODE = 'true';
    const res = await middleware(req('maxbld.ca', '/dashboard'));
    expect(res.status).toBe(404);
  });

  it('maxbld.ca /parcel-tool signed out goes to /login on maxbld.ca with the visitor path', async () => {
    const res = await middleware(req('maxbld.ca', '/parcel-tool'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.host).toBe('maxbld.ca');
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('redirect')).toBe('/parcel-tool');
  });

  it('maxbld.ca /parcel-tool with a session passes', async () => {
    const res = await middleware(req('maxbld.ca', '/parcel-tool', 'sb-x-auth-token=v'));
    expect(res.status).toBe(200);
  });

  it('maxbld.ca /api/parcels/lookup signed out is a 401', async () => {
    const res = await middleware(req('maxbld.ca', '/api/parcels/lookup'));
    expect(res.status).toBe(401);
  });

  it('buildo.com /parcel-tool is a 404', async () => {
    const res = await middleware(req('buildo.com', '/parcel-tool/123', 'sb-x-auth-token=v'));
    expect(res.status).toBe(404);
  });

  it('buildo.com /dashboard signed out still goes to /login on buildo.com (Buildo unchanged)', async () => {
    const res = await middleware(req('buildo.com', '/dashboard'));
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.host).toBe('buildo.com');
    expect(loc.pathname).toBe('/login');
  });
});

describe('safeRedirectPath: the MaxBLD branch', () => {
  const ATTACKS = ['/dashboard', '/permits/1', '//evil.com', '/\\evil.com', 'https://evil.com', '/%2F%2Fevil.com', '/%09/evil.com', '', null, '/zzz'];
  it.each(ATTACKS)('%j falls back to the MaxBLD search page', (raw) => {
    expect(safeRedirectPath(raw as string | null, { maxbld: true })).toBe(MAXBLD_POST_LOGIN);
  });
  it('a host-table path is kept, with its query', () => {
    expect(safeRedirectPath('/parcel-tool', { maxbld: true })).toBe('/parcel-tool');
    expect(safeRedirectPath('/parcel-tool/123?x=1', { maxbld: true })).toBe('/parcel-tool/123?x=1');
  });
  it('never /dashboard on MaxBLD, and the Buildo fallback is unchanged', () => {
    expect(safeRedirectPath(null, { maxbld: true })).not.toBe('/dashboard');
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
  });
});

describe('auth/callback on maxbld.ca', () => {
  beforeEach(() => {
    mockExchange.mockReset();
    mockExchange.mockResolvedValue({ error: null });
  });
  const location = async (qs: string): Promise<string | null> => {
    const { GET } = await import('@/app/auth/callback/route');
    const res = await GET(new NextRequest(`https://maxbld.ca/auth/callback?${qs}`, { headers: { host: 'maxbld.ca' } }));
    return res.headers.get('location');
  };
  it('no redirect lands on the MaxBLD search page, never /dashboard', async () => {
    expect(await location('code=abc')).toBe('https://maxbld.ca/parcel-tool');
  });
  it('a scope-D redirect lands on the MaxBLD search page', async () => {
    expect(await location('code=abc&redirect=/dashboard')).toBe('https://maxbld.ca/parcel-tool');
  });
  it('a host-table redirect is kept', async () => {
    expect(await location('code=abc&redirect=/parcel-tool/123')).toBe('https://maxbld.ca/parcel-tool/123');
  });
});
