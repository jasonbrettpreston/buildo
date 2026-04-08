// Next.js Middleware — Route protection
// SPEC LINK: docs/specs/13_auth.md
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  classifyRoute,
  SESSION_COOKIE_NAME,
  isValidSessionCookie,
  isDevMode,
  DEV_SESSION_COOKIE,
} from '@/lib/auth/route-guard';

/**
 * Next.js middleware runs in the **edge runtime**, where firebase-admin (Node-only)
 * cannot execute. We therefore split auth verification into two layers:
 *
 *   1. Edge layer (this file): a fast cookie *shape* pre-check via
 *      `isValidSessionCookie` — confirms the `__session` cookie exists and looks
 *      like a 3-segment JWT. Cheap, no network, no crypto.
 *
 *   2. Node layer (`src/lib/auth/get-user.ts`): full Firebase Admin
 *      `verifyIdToken()` call inside individual API route handlers, which run
 *      in the Node runtime and can use firebase-admin. Returns the verified
 *      uid or null.
 *
 * Route handlers that need a real verified user MUST call
 * `getUserIdFromSession(request)` — they cannot rely on middleware alone.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeClass = classifyRoute(pathname);

  // Public routes — pass through
  if (routeClass === 'public') {
    return NextResponse.next();
  }

  // Dev mode — inject dev session cookie and allow all routes
  if (isDevMode()) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      // Set the dev cookie so downstream code sees a valid session
      const response = NextResponse.next();
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

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasValidSession = isValidSessionCookie(sessionCookie);

  // Admin routes — require session + admin key header for API routes
  if (routeClass === 'admin') {
    // API routes: return 401
    if (pathname.startsWith('/api/')) {
      if (!hasValidSession) {
        // Allow admin API key as fallback (for pipeline scripts, CI)
        const adminKey = request.headers.get('x-admin-key');
        const expectedKey = process.env.ADMIN_API_KEY;
        if (expectedKey && adminKey === expectedKey) {
          return NextResponse.next();
        }
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      return NextResponse.next();
    }
    // Admin pages: redirect to login
    if (!hasValidSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
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
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Tell Next.js which routes to run middleware on
export const config = {
  matcher: [
    // Match all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
