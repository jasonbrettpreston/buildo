// Logic Layer Tests — Route protection middleware
// SPEC LINK: docs/specs/13_auth.md
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  classifyRoute,
  isPublicRoute,
  isAdminRoute,
  isAuthRoute,
  isDevMode,
  DEV_SESSION_COOKIE,
  PUBLIC_PATHS,
  ADMIN_PATH_PREFIX,
} from '@/lib/auth/route-guard';

// ---------------------------------------------------------------------------
// Route Classification
// ---------------------------------------------------------------------------

describe('Route Classification', () => {
  describe('classifyRoute', () => {
    it('classifies root path as public', () => {
      expect(classifyRoute('/')).toBe('public');
    });

    it('classifies /login as public', () => {
      expect(classifyRoute('/login')).toBe('public');
    });

    it('classifies /signup as public', () => {
      expect(classifyRoute('/signup')).toBe('public');
    });

    it('classifies /api/auth/* as public', () => {
      expect(classifyRoute('/api/auth/session')).toBe('public');
      expect(classifyRoute('/api/auth/logout')).toBe('public');
    });

    it('classifies /_next/* as public', () => {
      expect(classifyRoute('/_next/static/chunk.js')).toBe('public');
      expect(classifyRoute('/_next/image?url=test')).toBe('public');
    });

    it('classifies /favicon.ico as public', () => {
      expect(classifyRoute('/favicon.ico')).toBe('public');
    });

    it('classifies read-only data APIs as public', () => {
      expect(classifyRoute('/api/permits')).toBe('public');
      expect(classifyRoute('/api/permits/123--01')).toBe('public');
      expect(classifyRoute('/api/permits/geo')).toBe('public');
      expect(classifyRoute('/api/trades')).toBe('public');
      expect(classifyRoute('/api/builders')).toBe('public');
      expect(classifyRoute('/api/builders/42')).toBe('public');
      expect(classifyRoute('/api/products')).toBe('public');
      expect(classifyRoute('/api/coa')).toBe('public');
      expect(classifyRoute('/api/quality')).toBe('public');
    });

    it('classifies admin API routes as admin', () => {
      expect(classifyRoute('/api/admin/stats')).toBe('admin');
      expect(classifyRoute('/api/admin/sync')).toBe('admin');
      expect(classifyRoute('/api/admin/pipelines/load_permits')).toBe('admin');
      expect(classifyRoute('/api/admin/builders')).toBe('admin');
      expect(classifyRoute('/api/admin/market-metrics')).toBe('admin');
      expect(classifyRoute('/api/admin/rules')).toBe('admin');
    });

    it('classifies write/mutation API routes as authenticated', () => {
      expect(classifyRoute('/api/sync')).toBe('authenticated');
      expect(classifyRoute('/api/quality/refresh')).toBe('authenticated');
      expect(classifyRoute('/api/notifications')).toBe('authenticated');
    });

    it('classifies protected pages as authenticated', () => {
      expect(classifyRoute('/dashboard')).toBe('authenticated');
      expect(classifyRoute('/dashboard/leads')).toBe('authenticated');
      expect(classifyRoute('/onboarding')).toBe('authenticated');
      expect(classifyRoute('/onboarding/step-2')).toBe('authenticated');
      // Phase 3-iv: lead feed page
      expect(classifyRoute('/leads')).toBe('authenticated');
      expect(classifyRoute('/leads/123')).toBe('authenticated');
    });

    it('classifies search and map pages as public', () => {
      expect(classifyRoute('/search')).toBe('public');
      expect(classifyRoute('/map')).toBe('public');
      expect(classifyRoute('/permits/123--01')).toBe('public');
    });

    it('classifies admin pages as admin', () => {
      expect(classifyRoute('/admin')).toBe('admin');
      expect(classifyRoute('/admin/data-quality')).toBe('admin');
      expect(classifyRoute('/admin/market-metrics')).toBe('admin');
    });

    // Phase 3-holistic WF3 Phase C: fail-closed default. Previously
    // unknown routes defaulted to `'public'`, which meant a new
    // protected page added without updating classifyRoute would ship
    // publicly accessible. Gemini Phase 0-3 CRITICAL finding.
    it('defaults unknown routes to authenticated (fail-closed)', () => {
      expect(classifyRoute('/unknown-page')).toBe('authenticated');
      expect(classifyRoute('/some/nested/future/route')).toBe('authenticated');
      expect(classifyRoute('/api/future-endpoint')).toBe('authenticated');
    });
  });

  describe('isPublicRoute', () => {
    it('returns true for public routes', () => {
      expect(isPublicRoute('/')).toBe(true);
      expect(isPublicRoute('/login')).toBe(true);
      expect(isPublicRoute('/api/permits')).toBe(true);
    });

    it('returns false for protected routes', () => {
      expect(isPublicRoute('/api/admin/stats')).toBe(false);
      expect(isPublicRoute('/dashboard')).toBe(false);
      expect(isPublicRoute('/api/sync')).toBe(false);
    });
  });

  describe('isAdminRoute', () => {
    it('returns true for admin API routes', () => {
      expect(isAdminRoute('/api/admin/stats')).toBe(true);
      expect(isAdminRoute('/api/admin/pipelines/load_permits')).toBe(true);
    });

    it('returns true for admin pages', () => {
      expect(isAdminRoute('/admin')).toBe(true);
      expect(isAdminRoute('/admin/data-quality')).toBe(true);
    });

    it('returns false for non-admin routes', () => {
      expect(isAdminRoute('/api/permits')).toBe(false);
      expect(isAdminRoute('/dashboard')).toBe(false);
    });
  });

  describe('isAuthRoute', () => {
    it('returns true for auth routes', () => {
      expect(isAuthRoute('/api/auth/session')).toBe(true);
      expect(isAuthRoute('/api/auth/logout')).toBe(true);
    });

    it('returns false for non-auth routes', () => {
      expect(isAuthRoute('/api/permits')).toBe(false);
      expect(isAuthRoute('/login')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Route Guard Constants', () => {
  it('PUBLIC_PATHS includes essential public paths', () => {
    expect(PUBLIC_PATHS).toContain('/');
    expect(PUBLIC_PATHS).toContain('/login');
    expect(PUBLIC_PATHS).toContain('/signup');
  });

  it('ADMIN_PATH_PREFIX is /admin', () => {
    expect(ADMIN_PATH_PREFIX).toBe('/admin');
  });
});

// ---------------------------------------------------------------------------
// Session Cookie Validation
// ---------------------------------------------------------------------------

import { isValidSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/route-guard';

describe('Session Cookie Validation', () => {
  it('SESSION_COOKIE_NAME is __session', () => {
    expect(SESSION_COOKIE_NAME).toBe('__session');
  });

  it('rejects undefined cookie', () => {
    expect(isValidSessionCookie(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSessionCookie('')).toBe(false);
  });

  it('rejects non-JWT format', () => {
    expect(isValidSessionCookie('not-a-jwt')).toBe(false);
    expect(isValidSessionCookie('only.two')).toBe(false);
  });

  it('rejects JWT with empty segments', () => {
    expect(isValidSessionCookie('..')).toBe(false);
    expect(isValidSessionCookie('header..')).toBe(false);
    expect(isValidSessionCookie('.payload.')).toBe(false);
  });

  it('accepts valid JWT-shaped cookie', () => {
    expect(isValidSessionCookie('eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiIxMjMifQ.signature')).toBe(true);
  });

  it('accepts any 3-segment dot-separated string', () => {
    expect(isValidSessionCookie('a.b.c')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dev Mode
// ---------------------------------------------------------------------------

describe('Dev Mode', () => {
  const originalEnv = process.env.DEV_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEV_MODE;
    } else {
      process.env.DEV_MODE = originalEnv;
    }
  });

  it('isDevMode returns false by default', () => {
    delete process.env.DEV_MODE;
    expect(isDevMode()).toBe(false);
  });

  it('isDevMode returns true when DEV_MODE=true (server-only, not NEXT_PUBLIC_)', () => {
    process.env.DEV_MODE = 'true';
    expect(isDevMode()).toBe(true);
  });

  it('isDevMode returns false for non-true values', () => {
    process.env.DEV_MODE = 'false';
    expect(isDevMode()).toBe(false);
    process.env.DEV_MODE = '1';
    expect(isDevMode()).toBe(false);
    process.env.DEV_MODE = '';
    expect(isDevMode()).toBe(false);
  });

  it('isDevMode returns false when NODE_ENV=production, EVEN WITH DEV_MODE=true (WF3 2026-04-11 adversarial defense-in-depth)', () => {
    // Defense-in-depth layer 2: if an operator somehow sets DEV_MODE=true
    // in a production deployment, the NODE_ENV guard prevents auth
    // bypass activation. Both flags must agree.
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.DEV_MODE = 'true';
    expect(isDevMode()).toBe(false);
    (process.env as Record<string, string>).NODE_ENV = prevNodeEnv ?? 'test';
  });

  it('DEV_SESSION_COOKIE is a valid JWT-shaped string', () => {
    expect(DEV_SESSION_COOKIE).toBeDefined();
    const parts = DEV_SESSION_COOKIE.split('.');
    expect(parts.length).toBe(3);
    expect(parts.every(p => p.length > 0)).toBe(true);
  });

  it('DEV_SESSION_COOKIE passes isValidSessionCookie', () => {
    expect(isValidSessionCookie(DEV_SESSION_COOKIE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// File Existence
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

describe('Security Files', () => {
  it('src/middleware.ts exists', () => {
    const filePath = path.join(__dirname, '../middleware.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('src/lib/auth/route-guard.ts exists', () => {
    const filePath = path.join(__dirname, '../lib/auth/route-guard.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Middleware — dev-mode cookie visibility to Server Components
// (WF3 2026-04-11 — Bug #1 fix)
// ---------------------------------------------------------------------------
// Next.js middleware can either set cookies on the OUTGOING response (browser
// stores for the NEXT request) or mutate the INCOMING request (current-request
// Server Components see the value). For a dev-mode bypass where we want the
// user to land directly on a protected page on the first navigation, we MUST
// do BOTH: mutate the request so the current Server Component reads it, AND
// set the response so the browser persists it for subsequent navigations.
//
// The prior implementation only set on response — Server Components saw no
// cookie on the first navigation and redirected to /login. These file-shape
// tests lock the fix in place: the middleware must call request.cookies.set
// BEFORE NextResponse.next({ request }) AND also set on the response.

describe('Middleware dev-mode cookie injection (Bug #1 regression lock)', () => {
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '../middleware.ts'),
    'utf-8',
  );

  it('mutates the incoming request cookies in the dev-mode branch', () => {
    // Must call request.cookies.set so downstream Server Components
    // read the dev cookie from `cookies()` in next/headers.
    expect(middlewareSource).toMatch(
      /request\.cookies\.set\(\s*SESSION_COOKIE_NAME\s*,\s*DEV_SESSION_COOKIE\s*\)/,
    );
  });

  it('forwards modified request headers to NextResponse.next in the dev-mode branch', () => {
    // Must pass { request: { headers: request.headers } } to
    // NextResponse.next so the Server Component runtime sees the
    // mutated cookie header, not the pristine original. Use a
    // substring check rather than a strict object-literal regex so
    // the test tolerates trailing commas / formatting variations.
    expect(middlewareSource).toContain('NextResponse.next({');
    expect(middlewareSource).toContain('request: { headers: request.headers }');
  });

  it('still sets cookie on the outgoing response for browser persistence', () => {
    // Belt-and-braces: the browser needs to persist the cookie for
    // subsequent navigations so the response.cookies.set stays.
    expect(middlewareSource).toContain('response.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE');
  });

  it('places request.cookies.set BEFORE NextResponse.next in the source', () => {
    // Ordering check: mutating the cookies AFTER calling next() would
    // be too late — headers are already snapshotted. A regression that
    // swapped the order would silently re-introduce Bug #1.
    const requestSetIdx = middlewareSource.indexOf('request.cookies.set(SESSION_COOKIE_NAME');
    const nextCallIdx = middlewareSource.indexOf('NextResponse.next({');
    expect(requestSetIdx).toBeGreaterThan(-1);
    expect(nextCallIdx).toBeGreaterThan(-1);
    expect(requestSetIdx).toBeLessThan(nextCallIdx);
  });
});

// ---------------------------------------------------------------------------
// Leads page dev-mode profile seed (WF3 2026-04-11 Bug #3 regression lock)
// ---------------------------------------------------------------------------
// In dev mode, user_profiles may be empty on a fresh local DB. Without a
// dev-mode convenience seed, the leads page redirects to /onboarding —
// which is a client-only mockup that doesn't persist anything, creating a
// dead-end loop. The fix: when tradeSlug lookup returns empty AND we're in
// dev mode with uid === 'dev-user', UPSERT a default profile and proceed.
// These tests lock the shape of the fix in place.

describe('Leads page dev seed (Bug #3 regression lock)', () => {
  const leadsPageSource = fs.readFileSync(
    path.join(__dirname, '../app/leads/page.tsx'),
    'utf-8',
  );

  it('imports isDevMode from route-guard', () => {
    expect(leadsPageSource).toContain('isDevMode');
    expect(leadsPageSource).toContain("from '@/lib/auth/route-guard'");
  });

  it('has a dev-mode branch that checks uid === "dev-user" before redirecting to onboarding', () => {
    // Gate: the seed fires ONLY when BOTH isDevMode() is true AND
    // uid === 'dev-user'. Either condition false → fall through to the
    // normal redirect path.
    expect(leadsPageSource).toMatch(/isDevMode\(\)\s*&&\s*uid\s*===\s*['"]dev-user['"]/);
  });

  it('UPSERTs dev-user into user_profiles with ON CONFLICT DO NOTHING', () => {
    // Idempotent seed: first visit creates the row, subsequent visits
    // are a no-op via the conflict clause.
    expect(leadsPageSource).toContain('INSERT INTO user_profiles');
    expect(leadsPageSource).toContain("'dev-user'");
    expect(leadsPageSource).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('preserves the normal /onboarding redirect path for non-dev users', () => {
    // Regression guard: production (non-dev) users without a profile
    // must still redirect to /onboarding. The dev branch is additive.
    expect(leadsPageSource).toContain("redirect('/onboarding')");
  });

  // -------------------------------------------------------------------------
  // Dev profile trade_slug switcher (WF3 2026-04-11 — user request)
  // -------------------------------------------------------------------------
  // The prior WF3 hardcoded dev-user trade_slug = 'plumbing'. The user
  // asked how to change profiles. Fix: accept ?trade_slug=<slug> as a
  // query param on /leads, validate against the canonical 32-slug
  // allowlist from src/lib/classification/trades.ts, and UPSERT the dev
  // profile with DO UPDATE. Production path is unreachable via the
  // existing isDevMode() && uid === 'dev-user' gate.

  it('accepts searchParams as a Next.js 15 async prop', () => {
    // Next.js 15 changed searchParams to Promise<...> on Server Components.
    // The signature must be async and await searchParams before reading.
    expect(leadsPageSource).toMatch(/searchParams\s*:\s*Promise/);
  });

  it('imports the TRADES allowlist from classification for server-boundary validation', () => {
    // Server-side validation is critical — a query param goes straight
    // to a SQL UPDATE, so the allowlist must gate unknown slugs before
    // the DB call.
    expect(leadsPageSource).toContain('TRADES');
    expect(leadsPageSource).toContain("from '@/lib/classification/trades'");
  });

  it('UPSERTs the requested trade_slug via DO UPDATE when a valid slug is provided in dev mode', () => {
    // Must include the DO UPDATE SET clause — ON CONFLICT DO NOTHING
    // alone (the earlier seed pattern) wouldn't actually change the
    // existing trade_slug for an already-seeded dev-user.
    expect(leadsPageSource).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(leadsPageSource).toContain('trade_slug = EXCLUDED.trade_slug');
  });

  it('validates the query param against the allowlist BEFORE the UPSERT', () => {
    // Positional check: the allowlist membership test (e.g. TRADES.some,
    // TRADES.find, or a Set lookup) must appear in the source BEFORE
    // the INSERT with the DO UPDATE clause. A regression that skipped
    // validation would allow arbitrary strings into the SQL UPDATE.
    const allowlistIdx = Math.max(
      leadsPageSource.indexOf('TRADES.some'),
      leadsPageSource.indexOf('TRADES.find'),
      leadsPageSource.indexOf('TRADES.map'),
    );
    const updateIdx = leadsPageSource.indexOf('ON CONFLICT (user_id) DO UPDATE');
    expect(allowlistIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(allowlistIdx).toBeLessThan(updateIdx);
  });
});
