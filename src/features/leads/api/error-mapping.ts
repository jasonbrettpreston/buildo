// 🔗 SPEC LINK: docs/specs/03-mobile/71_lead_feed_discovery_interface.md §API Endpoints
// 🔗 ADR: docs/adr/005-hardcoded-retry-after-60.md — hardcoded Retry-After is intentional
//
// Maps domain conditions to HTTP responses per spec 70's status code matrix.
// Each helper returns a `NextResponse` directly so route handlers stay tiny.
// Codifying these here prevents Phase 2-ii and Phase 2-iii from drifting
// on error shapes.

import type { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { err } from './envelope';

export const unauthorized = () => err('UNAUTHORIZED', 'Authentication required', 401);

export const forbiddenTradeMismatch = (requested: string, actual: string) =>
  err(
    'FORBIDDEN_TRADE_MISMATCH',
    `trade_slug '${requested}' does not match your profile trade '${actual}'`,
    403,
  );

/**
 * 429 with `Retry-After` header per RFC 6585. The value is the lower bound
 * in seconds before the client may retry — `withRateLimit` doesn't expose
 * a precise reset time, so we use a conservative 60s default that matches
 * the standard rate limit window.
 */
export const rateLimited = (remaining: number, retryAfterSec = 60) =>
  err('RATE_LIMITED', 'Too many requests', 429, { remaining }, {
    'Retry-After': String(retryAfterSec),
  });

export const badRequestZod = (zodError: ZodError) =>
  err('VALIDATION_FAILED', 'Request validation failed', 400, zodError.flatten());

/**
 * 400 for malformed lead id path params. The /api/leads/detail/:id and
 * /api/leads/flight-board/detail/:id endpoints accept either
 * `${permit_num}--${revision_num}` or `COA-${application_number}` ids;
 * anything else (empty after split, no separator, etc.) is rejected here
 * with a stable code so the mobile client can distinguish "user typed a
 * bad URL" from "permit doesn't exist" (404).
 */
export const badRequestInvalidId = () =>
  err('INVALID_LEAD_ID', 'Lead id must be `<permit_num>--<revision_num>` or `COA-<application_number>`', 400);

/**
 * 404 for missing leads. Used when a parsed id resolves to no row in
 * permits (detail endpoint) or is not on the user's saved board
 * (flight-board detail endpoint). Distinct from 400 (bad shape) so the
 * client can show "permit no longer exists" vs "bad URL" UX.
 */
export const notFound = (message = 'Lead not found') =>
  err('NOT_FOUND', message, 404);

/**
 * 500 fallback. Accepts the underlying cause and a context object so the
 * error is captured in logs (not lost) while the client still gets a
 * generic message with no leaked stack trace. Phase 2 routes call this
 * from their final catch block instead of crashing.
 */
export const internalError = (cause?: unknown, context?: Record<string, unknown>) => {
  if (cause !== undefined) {
    logError('[api/internal-error]', cause, context ?? {});
  }
  return err('INTERNAL_ERROR', 'An unexpected error occurred', 500);
};

/**
 * 503 for the "PostGIS extension is not installed" dev-env failure mode.
 * `LEAD_FEED_SQL` uses `::geography` casts for radius filtering; local dev
 * without the postgis extension throws `type "geography" does not exist`
 * (pg code 42704). The route's pre-flight check catches this and returns
 * this helper's structured response instead of a generic 500, giving the
 * operator actionable install instructions instead of an opaque error.
 *
 * Production Cloud SQL has PostGIS installed, so this path NEVER fires in
 * prod. Shipped alongside the admin test-feed variant (spec 76 §3.2) and
 * the feed-route variant (spec 70) from WF3 2026-04-11.
 */
export const devEnvMissingPostgis = () =>
  err(
    'DEV_ENV_MISSING_POSTGIS',
    'PostGIS extension is not installed in this database. The lead feed query requires PostGIS for geography-based radius filtering. Install the postgis package at the OS level (e.g. scoop install postgresql-postgis on Windows, apt install postgresql-16-postgis-3 on Linux, brew install postgis on Mac) and then run `CREATE EXTENSION postgis;` against the buildo database. Cloud SQL has PostGIS by default.',
    503,
  );
