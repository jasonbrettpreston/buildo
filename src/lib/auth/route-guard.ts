// Route classification and protection logic for Next.js middleware
// SPEC LINK: docs/specs/13_auth.md

export type RouteClass = 'public' | 'authenticated' | 'admin';

// ---------------------------------------------------------------------------
// Dev Mode — bypass auth for local development
// ---------------------------------------------------------------------------

/**
 * Check if dev mode is enabled via NEXT_PUBLIC_DEV_MODE=true.
 * When enabled, middleware auto-injects a dev session cookie so
 * all routes are accessible without Firebase authentication.
 */
export function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === 'true';
}

/** A valid JWT-shaped cookie value used in dev mode to satisfy session checks. */
export const DEV_SESSION_COOKIE = 'dev.buildo.local';

// ---------------------------------------------------------------------------
// Public paths — accessible without authentication
// ---------------------------------------------------------------------------

export const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/search',
  '/map',
] as const;

/** Path prefixes that are always public */
const PUBLIC_PREFIXES = [
  '/_next/',
  '/api/auth/',
  '/api/permits',
  '/api/trades',
  '/api/builders',
  '/api/products',
  '/api/coa',
  '/api/quality',
  '/permits/',
] as const;

/** Exact public file paths */
const PUBLIC_FILES = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
] as const;

// ---------------------------------------------------------------------------
// Admin paths — require admin role
// ---------------------------------------------------------------------------

export const ADMIN_PATH_PREFIX = '/admin';

// ---------------------------------------------------------------------------
// Mutation API routes — require authentication
// ---------------------------------------------------------------------------

const AUTHENTICATED_API_ROUTES = [
  '/api/sync',
  '/api/quality/refresh',
  '/api/notifications',
  '/api/leads', // Phase 2 lead feed routes — require Firebase session
] as const;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a URL path as public, authenticated, or admin.
 * Used by Next.js middleware to decide whether to allow/block/redirect.
 */
export function classifyRoute(pathname: string): RouteClass {
  // Static files
  if (PUBLIC_FILES.some(f => pathname === f)) return 'public';

  // Next.js internals
  if (pathname.startsWith('/_next/')) return 'public';

  // Auth API routes — always public
  if (pathname.startsWith('/api/auth/')) return 'public';

  // Admin API routes — require admin
  if (pathname.startsWith('/api/admin/')) return 'admin';

  // Admin pages — require admin
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';

  // Mutation API routes — require auth
  if (AUTHENTICATED_API_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return 'authenticated';
  }

  // Read-only data APIs — public (serve search/map pages)
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return 'public';

  // Exact public paths
  if ((PUBLIC_PATHS as readonly string[]).includes(pathname)) return 'public';

  // Protected pages: dashboard, onboarding
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) {
    return 'authenticated';
  }

  // Default: public (unknown routes handled by Next.js 404)
  return 'public';
}

/** Check if a route is publicly accessible */
export function isPublicRoute(pathname: string): boolean {
  return classifyRoute(pathname) === 'public';
}

/** Check if a route requires admin privileges */
export function isAdminRoute(pathname: string): boolean {
  return classifyRoute(pathname) === 'admin';
}

/** Check if a path is an auth API endpoint */
export function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith('/api/auth/');
}

// ---------------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = '__session';

/**
 * Basic session cookie validation.
 * Checks that the cookie exists and looks like a JWT (3 dot-separated base64 segments).
 * Full verification (signature, expiry) requires Firebase Admin SDK.
 */
export function isValidSessionCookie(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every(p => p.length > 0);
}
