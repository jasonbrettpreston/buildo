// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
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
