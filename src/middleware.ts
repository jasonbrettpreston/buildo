// Next.js Middleware — Route protection
// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.5, §4
//            .cursor/phase1_plan.md Item 1 + Item 2 (middleware.ts row)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  classifyRoute,
  SESSION_COOKIE_NAME,
  isValidSessionCookie,
  isDevMode,
  DEV_SESSION_COOKIE,
  extractBearerToken,
} from '@/lib/auth/route-guard';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js middleware runs in the **edge runtime**. Auth verification splits
 * into two layers (Spec 13 §3.5, unchanged shape from the Firebase era):
 *
 *   1. Edge layer (this file): `updateSession` (`src/lib/supabase/
 *      middleware.ts`) refreshes the Supabase session cookie transparently
 *      as a SIDE EFFECT of calling `getClaims()` — its result is never read
 *      for the routing decision below (fail-open contract, see that file's
 *      header). Routing itself is a cheap PRESENCE check: does a Supabase
 *      `sb-*` session cookie or a shape-valid Bearer token exist. No
 *      cryptographic verification happens here.
 *
 *   2. Node layer (`src/lib/auth/get-user.ts`): full `getClaims()`/
 *      `getUser()` verification inside individual API route handlers, which
 *      run in the Node runtime. Returns the verified uid or null.
 *
 * Route handlers that need a real verified user MUST call
 * `getClaimsUid(request)`/`getVerifiedUid(request)` — they cannot rely on
 * middleware alone.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeClass = classifyRoute(pathname);

  // Public routes — pass through. Still runs the Supabase refresh pass (a
  // logged-in user browsing a public data route shouldn't silently go
  // stale) but its result never gates access here.
  if (routeClass === 'public') {
    return updateSession(request);
  }

  // Dev mode — inject dev session cookie and allow all routes. UNCHANGED,
  // byte-identical to the Firebase era (Spec 13 §4 dev-mode site 1/3).
  if (isDevMode()) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      // WF3 2026-04-11 fix: the dev cookie must be visible BOTH to the
      // downstream Server Components of the CURRENT request AND to the
      // browser for subsequent navigations. Setting it only on the
      // outgoing response (the prior implementation) meant Server
      // Components on the first navigation saw no cookie and redirected
      // to /login. The Next.js canonical pattern is:
      //   1. Mutate request.cookies so the incoming request carries it
      //   2. Pass the modified request.headers through NextResponse.next
      //      so downstream handlers see the mutated cookie header
      //   3. Also set on the outgoing response so the browser persists
      //      it for subsequent requests (belt-and-braces — step 1+2
      //      cover the current request only).
      request.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE);
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      response.cookies.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
      return response;
    }
    return NextResponse.next();
  }

  // Real (non-dev) session path: run the Supabase refresh pass FIRST
  // (`src/lib/supabase/middleware.ts` design note) — its result is
  // fail-open refresh plumbing, never read for the routing decision below.
  const response = await updateSession(request);

  // Check for a Supabase session cookie (browser / SSR) OR a shape-valid
  // Bearer token (mobile clients). The cookie is NOT named `__session`
  // anymore for a real session (Item 1) — `@supabase/ssr` owns its own
  // chunked `sb-*` cookie naming, and this is a PRESENCE check only.
  // Middleware performs no cryptographic verification (Spec 13 §3.5) — full
  // verification stays in `get-user.ts`'s Node runtime.
  const bearerToken = extractBearerToken(request.headers.get('authorization'));
  const hasValidSession = hasSupabaseSessionCookie(request) || isValidSessionCookie(bearerToken);

  // Admin routes — require session (or the CI-credential path, re-checked
  // independently inside verify-admin.ts).
  if (routeClass === 'admin') {
    // API routes: return 401
    if (pathname.startsWith('/api/')) {
      // Secret COMPARISON removed from middleware (Item 2 recommendation —
      // verify-admin.ts mode 2 is the sole verifier), but the TRANSPORT must
      // pass through: an x-admin-key-bearing request has no session cookie by
      // definition, and 401ing it here makes the CI/break-glass path
      // unreachable (found live at the Phase 1 P1-F4 break-glass proof,
      // 2026-07-19 — unit tests call verifyAdminAuth directly and could not
      // see this). Presence-only check: a wrong token still 401s in
      // verify-admin.ts (negative control verified).
      //
      // SECURITY-REVIEW ADJUDICATION (2026-07-19, presence-only flagged as
      // "fail-open"): REJECTED — presence-only is this middleware's designed
      // posture for BOTH credentials (a garbage sb-* cookie also passes;
      // Spec 13 §3.5: middleware performs no cryptographic verification).
      // The authoritative, constant-time, fail-closed gate is verifyAdminAuth
      // as the FIRST LINE of every admin route (Spec 33 §5). Re-adding a
      // secret compare here would recreate the duplicated-verifier the P1
      // output panel retired, in the Edge runtime, for zero security delta.
      if (!hasValidSession && !request.headers.get('x-admin-key')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      return response;
    }
    // Admin pages: redirect to login
    if (!hasValidSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // Authenticated routes — require session
  if (routeClass === 'authenticated') {
    if (!hasValidSession) {
      // API routes: return 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      // Pages: redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  return response;
}

/**
 * Presence-only check for a Supabase session cookie. `@supabase/ssr` names
 * its cookie `sb-<project-ref>-auth-token`, chunked into `.0`/`.1`/… suffixes
 * when the session exceeds a single cookie's size budget — `includes` covers
 * both the unchunked and chunked forms. NOT a shape/signature check (that
 * would require the Node-runtime SDK) — an empty or garbage cookie value
 * still passes this presence check and is rejected later by `get-user.ts`.
 */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token') && c.value.length > 0);
}

// Tell Next.js which routes to run middleware on
export const config = {
  matcher: [
    // Match all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
