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
  const originalEnv = process.env.NEXT_PUBLIC_DEV_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEV_MODE;
    } else {
      process.env.NEXT_PUBLIC_DEV_MODE = originalEnv;
    }
  });

  it('isDevMode returns false by default', () => {
    delete process.env.NEXT_PUBLIC_DEV_MODE;
    expect(isDevMode()).toBe(false);
  });

  it('isDevMode returns true when NEXT_PUBLIC_DEV_MODE=true', () => {
    process.env.NEXT_PUBLIC_DEV_MODE = 'true';
    expect(isDevMode()).toBe(true);
  });

  it('isDevMode returns false for non-true values', () => {
    process.env.NEXT_PUBLIC_DEV_MODE = 'false';
    expect(isDevMode()).toBe(false);
    process.env.NEXT_PUBLIC_DEV_MODE = '1';
    expect(isDevMode()).toBe(false);
    process.env.NEXT_PUBLIC_DEV_MODE = '';
    expect(isDevMode()).toBe(false);
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
