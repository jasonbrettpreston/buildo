// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13.2
//
// Sentry helper for route-level error.tsx boundaries. Re-exports a thin wrapper
// over @sentry/nextjs so callers don't need to import the SDK directly.
// Safe to call in dev (Sentry init is gated on production in instrumentation.ts).

import * as Sentry from '@sentry/nextjs';

type ErrorContext = Record<string, unknown>;

/**
 * Report an error to Sentry with structured context. Used by error.tsx
 * route boundaries. Never throws — telemetry must not crash the app.
 */
export function reportError(err: unknown, context?: ErrorContext): void {
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Telemetry must never crash the caller.
  }
}
