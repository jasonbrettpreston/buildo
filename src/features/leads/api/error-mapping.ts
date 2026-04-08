// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
//
// Maps domain conditions to HTTP responses per spec 70's status code matrix.
// Each helper returns a `NextResponse` directly so route handlers stay tiny.
// Codifying these here prevents Phase 2-ii and Phase 2-iii from drifting
// on error shapes.

import type { ZodError } from 'zod';
import { err } from './envelope';

export const unauthorized = () => err('UNAUTHORIZED', 'Authentication required', 401);

export const forbiddenTradeMismatch = (requested: string, actual: string) =>
  err(
    'FORBIDDEN_TRADE_MISMATCH',
    `trade_slug '${requested}' does not match your profile trade '${actual}'`,
    403,
  );

export const rateLimited = (remaining: number) =>
  err('RATE_LIMITED', 'Too many requests', 429, { remaining });

export const badRequestZod = (zodError: ZodError) =>
  err('VALIDATION_FAILED', 'Request validation failed', 400, zodError.flatten());

export const internalError = () =>
  err('INTERNAL_ERROR', 'An unexpected error occurred', 500);
