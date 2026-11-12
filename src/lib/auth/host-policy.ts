// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.1 (the host allow-list is named per-feature code), 11b.7 W1-W9,
//            dated note 2026-11-11 item 8 (maxbld.ca apex only); docs/specs/02-web-admin/128_surface_standard_policy.md R-03 (scope D fenced);
//            docs/specs/00-architecture/13_authentication.md §3.5 (middleware is presence-only: this is a path rule, not auth).
//
// MF-46 · the maxbld.ca host table (plan v1 §3.1 with folds 1-3; plan v3). One app serves two hosts. On maxbld.ca only the rows below are
// served; every other path, scope D included, is refused with a 404 (never a redirect). On every other host (buildo.com, previews,
// localhost) the app behaves exactly as before, except that the MaxBLD internal prefix is refused there. Pure data and pure functions:
// no I/O, no environment read. `x-forwarded-host` is never read; only the Host header decides.

export type MaxbldRouteClass = 'public' | 'authenticated';

export interface MaxbldRoute {
  /** The path a visitor uses on maxbld.ca. */
  readonly path: string;
  /** `exact` = the path only; `prefix` = the path and any path below it, by whole segment. */
  readonly match: 'exact' | 'prefix';
  /** Never weaker than classifyRoute gives the internal path (pinned by src/tests/host-policy.logic.test.ts). */
  readonly routeClass: MaxbldRouteClass;
  /** The internal path served; absent = the same path. */
  readonly internal?: string;
}

/** The one MaxBLD host (apex only; www is redirected to the apex by the domain setting at launch, DECISIONS-v2 N-1). */
export const MAXBLD_HOST = 'maxbld.ca';

/** The one MaxBLD origin: the sign-up and reset email links are built from it, never from the Host header (plan v1 fold 6). */
export const MAXBLD_ORIGIN = `https://${MAXBLD_HOST}`;

/** The internal page a refused maxbld.ca page path is rewritten to (it calls notFound(): a 404 with the MaxBLD text). */
export const MAXBLD_REFUSED_PAGE = '/parcel-tool/refused';

/** The one internal prefix of the MaxBLD web pages (MF-44 note: `parcel-tool`, the app's route name). Refused on every other host. */
export const MAXBLD_INTERNAL_PREFIX = '/parcel-tool';

/**
 * Every path served on maxbld.ca. A new MaxBLD page or route adds its row here, with its row in the host table test.
 * The internal pages under `src/app/(maxbld)/parcel-tool/` carry the MaxBLD variant of a shared screen; the visitor never sees the prefix.
 */
export const MAXBLD_ROUTES: readonly MaxbldRoute[] = [
  // W4-W6 search and report (MF-44): the web paths are the app's route name.
  { path: '/parcel-tool', match: 'prefix', routeClass: 'authenticated' },
  // W2 sign in, sign up, reset, set a new password (MF-46): the shared sign-in screen, MaxBLD variant.
  { path: '/login', match: 'exact', routeClass: 'public', internal: '/parcel-tool/login' },
  { path: '/signup', match: 'exact', routeClass: 'public', internal: '/parcel-tool/signup' },
  { path: '/reset-password', match: 'exact', routeClass: 'public', internal: '/parcel-tool/reset-password' },
  { path: '/set-password', match: 'exact', routeClass: 'authenticated', internal: '/parcel-tool/set-password' },
  // The terms record once after the first MaxBLD sign-in (D-2 b).
  { path: '/terms-accept', match: 'exact', routeClass: 'authenticated', internal: '/parcel-tool/terms-accept' },
  { path: '/help', match: 'exact', routeClass: 'public', internal: '/parcel-tool/help' },
  { path: '/terms', match: 'exact', routeClass: 'public', internal: '/parcel-tool/terms' },
  { path: '/privacy', match: 'exact', routeClass: 'public', internal: '/parcel-tool/privacy' },
  // The shared OAuth and email-link code exchange (public: it is how a visitor becomes signed in).
  { path: '/auth/callback', match: 'exact', routeClass: 'public' },
  // The routes the MaxBLD pages call.
  { path: '/api/parcels/lookup', match: 'exact', routeClass: 'authenticated' },
  { path: '/api/parcels/entitlement', match: 'exact', routeClass: 'authenticated' },
];

/** The public internal paths of the MaxBLD rows (route-guard lists them as public by exact match; buildo.com refuses them by prefix). */
export const MAXBLD_PUBLIC_INTERNAL_PATHS: readonly string[] = MAXBLD_ROUTES.filter(
  (r) => r.routeClass === 'public' && r.internal !== undefined,
).map((r) => r.internal as string);

export type HostDecision =
  | { kind: 'buildo' }
  | { kind: 'refuse' }
  | { kind: 'maxbld'; route: MaxbldRoute; internal: string };

/** The Host header as a bare lower-case host name: port and one trailing dot removed; IPv6 safe. Null or unparsable = ''. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return '';
  let name: string;
  try {
    name = new URL(`http://${host}`).hostname;
  } catch {
    return '';
  }
  name = name.toLowerCase();
  return name.endsWith('.') ? name.slice(0, -1) : name;
}

const underPrefix = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The row serving `pathname`, or null. One trailing slash on a non-root path is ignored; case is not folded (fail closed). */
export function matchMaxbldRoute(pathname: string, routes: readonly MaxbldRoute[] = MAXBLD_ROUTES): MaxbldRoute | null {
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const r of routes) {
    if (r.match === 'exact' ? p === r.path : underPrefix(p, r.path)) return r;
  }
  return null;
}

/**
 * The fence decision for one request. `routes` is a parameter so the mutated-copy test can pass a table literal.
 * - maxbld.ca: a row → serve it (rewritten to its internal path when it has one); no row → refuse.
 * - any other host: the internal prefix → refuse; anything else → the Buildo app, unchanged.
 */
export function resolveHost(
  host: string | null | undefined,
  pathname: string,
  routes: readonly MaxbldRoute[] = MAXBLD_ROUTES,
): HostDecision {
  if (normalizeHost(host) === MAXBLD_HOST) {
    const route = matchMaxbldRoute(pathname, routes);
    if (!route) return { kind: 'refuse' };
    return { kind: 'maxbld', route, internal: route.internal ?? pathname };
  }
  return underPrefix(pathname, MAXBLD_INTERNAL_PREFIX) ? { kind: 'refuse' } : { kind: 'buildo' };
}

/** The MaxBLD branch of the post-login target: a path on the host table, else the MaxBLD search page; never `/dashboard`. */
export const MAXBLD_POST_LOGIN = '/parcel-tool';
