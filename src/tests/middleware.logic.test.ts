// Logic Layer Tests — Route protection middleware
// SPEC LINK: docs/specs/13_auth.md
import { describe, it, expect, afterEach } from 'vitest';
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
    });

    it('classifies /permits/* as public (serves Expo mobile client)', () => {
      expect(classifyRoute('/permits/123--01')).toBe('public');
    });

    it('classifies /search and /map as authenticated (pages removed — Two-Client Architecture)', () => {
      // /search and /map pages were deleted in the Two-Client Architecture purge.
      // Their routes now fall through to the fail-closed default → 'authenticated'.
      expect(classifyRoute('/search')).toBe('authenticated');
      expect(classifyRoute('/map')).toBe('authenticated');
      expect(classifyRoute('/onboarding')).toBe('authenticated');
      expect(classifyRoute('/leads')).toBe('authenticated');
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

// Leads page (src/app/leads/) was removed in the Two-Client Architecture
// purge (2026-04-22). The tradesperson lead feed is now served by the Expo
// mobile client. The dev-seed tests above have been deleted along with the
// page itself.
