/**
 * withApiEnvelope — Higher-order function that wraps Next.js route handlers
 * to auto-catch uncaught exceptions, log them via logError, sanitize PG errors,
 * and always return a structured { data, error, meta } envelope.
 *
 * Usage:
 *   export const GET = withApiEnvelope(async (req) => {
 *     // ...route logic — any throw is caught and returned as 500 envelope
 *   });
 *
 * SPEC LINK: docs/specs/00_engineering_standards.md §2.2, §4.4
 *            docs/reports/bug_prevention_strategy.md §3
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse>;

/** Matches PostgreSQL 5-character SQLSTATE error codes (e.g. '42P01', '23505') */
const PG_ERROR_CODE_RE = /^[0-9A-Z]{5}$/;

/**
 * Wraps a route handler so any uncaught exception is caught, logged, and returned
 * as a structured 500 error envelope. The raw error message is never exposed to clients.
 */
export function withApiEnvelope(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    try {
      return await handler(request, context);
    } catch (cause) {
      logError('[api/envelope]', cause, {
        method: request.method,
        url: request.nextUrl.pathname,
      });

      // Sanitize PostgreSQL errors: return DATABASE_ERROR code so clients can
      // distinguish DB failures from generic 500s, without leaking schema details.
      const pgCode = (cause as Record<string, unknown> | null)?.code;
      if (typeof pgCode === 'string' && PG_ERROR_CODE_RE.test(pgCode)) {
        return NextResponse.json(
          { data: null, error: { code: 'DATABASE_ERROR', message: 'A database error occurred' }, meta: null },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, meta: null },
        { status: 500 },
      );
    }
  };
}
