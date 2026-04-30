// Route classification and protection logic for Next.js middleware
// SPEC LINK: docs/specs/13_auth.md

type RouteClass = 'public' | 'authenticated' | 'admin';

// ---------------------------------------------------------------------------
// Dev Mode — bypass auth for local development
// ---------------------------------------------------------------------------

/**
 * Check if dev mode is enabled via the SERVER-ONLY `DEV_MODE=true` env var.
 * When enabled, middleware auto-injects a dev session cookie so all routes
 * are accessible without Firebase authentication.
 *
 * Defense-in-depth layer 1 (Phase 3-holistic WF3 Phase C, 2026-04-09):
 * previously read `NEXT_PUBLIC_DEV_MODE`, which Next.js inlines into the
 * client bundle. The security-critical middleware check now reads the
 * non-public `DEV_MODE` var; the login page's cosmetic "Continue as Dev"
 * button still reads `NEXT_PUBLIC_DEV_MODE` so developers see the button
 * locally, but even if that leaks into a prod bundle the middleware still
 * enforces real auth because `DEV_MODE` is server-only.
 *
 * Defense-in-depth layer 2 (WF3 2026-04-11 adversarial review): an AND
 * guard on `NODE_ENV !== 'production'`. A single operator mistake of
 * setting `DEV_MODE=true` in production would otherwise silently disable
 * all auth (middleware injects fake cookie, verifier returns dev-user,
 * leads page seeds dev-user profile). The NODE_ENV check ensures dev
 * mode requires BOTH a server-only flag AND a non-production build,
 * reducing the blast radius of misconfiguration from "one flag" to
 * "two independent misconfigurations at the same time".
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';
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
  // Stripe webhooks — Stripe calls without Firebase auth. The handler verifies
  // the Stripe-Signature header internally; without this entry the fail-closed
  // default would 401 every webhook before our handler could run (Spec 96 §10
  // Step 5 explicit). This is the ONLY webhook prefix permitted.
  '/api/webhooks/stripe',
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
  // Spec 96 §10 Step 4b: nonce-issuing checkout endpoint. Listed explicitly
  // (rather than relying on the fail-closed default) so the auth contract
  // is visible at a glance and grep-friendly.
  '/api/subscribe',
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

  // Read-only data APIs — public (serve Expo mobile client)
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return 'public';

  // Exact public paths
  if ((PUBLIC_PATHS as readonly string[]).includes(pathname)) return 'public';

  // Protected pages: dashboard (tradesperson-facing pages removed — Two-Client Architecture)
  if (
    pathname.startsWith('/dashboard')
  ) {
    return 'authenticated';
  }

  // Default: FAIL-CLOSED. Any route not explicitly whitelisted above
  // requires authentication. Phase 3-holistic WF3 Phase C fix (Gemini
  // Phase 0-3 CRITICAL): the previous default was `'public'` which
  // meant a developer adding a new protected page and forgetting to
  // whitelist it would ship it publicly accessible. Fail-closed makes
  // the forgotten case a visible 401 redirect instead of a silent
  // security hole. Unknown-nonexistent routes still reach a 404 after
  // auth verification — only real cost is an extra middleware round
  // trip for a 404-bound request, which is acceptable.
  return 'authenticated';
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

/**
 * Extract the raw token from an `Authorization: Bearer <token>` header.
 * Case-insensitive scheme check. Returns undefined when the header is absent,
 * uses a non-Bearer scheme, or the token portion is empty. The returned token
 * is NOT verified — callers must pass it through `isValidSessionCookie` (edge
 * shape check) or `verifyIdTokenCookie` (Node full Firebase verification).
 */
export function extractBearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || undefined;
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
