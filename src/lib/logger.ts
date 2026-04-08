// Centralized error logging — console.error locally, Sentry in production.
// SPEC LINK: docs/reports/system_architecture_audit.md

type ErrorContext = Record<string, unknown>;

let sentryCaptureException: ((err: unknown, ctx?: { extra?: ErrorContext }) => void) | null = null;

// Lazy-load Sentry only when DSN is configured (production).
// In local dev, this stays null and errors go to console only.
// webpackIgnore comment prevents the "Critical dependency" warning.
if (typeof process !== 'undefined' && process.env.SENTRY_DSN) {
  import(/* webpackIgnore: true */ '@sentry/nextjs')
    .then((Sentry: { init: (opts: Record<string, unknown>) => void; captureException: (err: unknown, ctx?: Record<string, unknown>) => void }) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1,
      });
      sentryCaptureException = (err, ctx) => Sentry.captureException(err, ctx);
    })
    .catch(() => {
      // @sentry/nextjs not installed — stay in console-only mode
    });
}

/**
 * Log an error with structured context.
 * Always writes to console.error. When SENTRY_DSN is set, also reports to Sentry.
 *
 * @param tag  Short label like "[sync]" or "[api/builders]"
 * @param err  The error object or message
 * @param context  Optional structured data (permit_num, pipeline, etc.)
 */
export function logError(tag: string, err: unknown, context?: ErrorContext): void {
  console.error(tag, err);

  if (sentryCaptureException) {
    sentryCaptureException(err instanceof Error ? err : new Error(String(err)), {
      extra: { tag, ...context },
    });
  }
}

/**
 * Log a warning (non-fatal). Console-only — no Sentry report.
 */
export function logWarn(tag: string, message: string, context?: ErrorContext): void {
  console.warn(tag, message, context ?? '');
}

/**
 * Log an informational event. Emits a structured JSON line that can be
 * ingested by log aggregators (Datadog, CloudWatch, etc.) without parsing.
 *
 * Use for observability events that aren't errors or warnings:
 *   - API request completion: { user_id, route, duration_ms }
 *   - Pipeline progress: { script, batch, rows_processed }
 *   - Feature usage: { event, user_id, ...metadata }
 *
 * Handles non-serializable values (circular refs, BigInt, etc.) gracefully —
 * never throws, falls back to a safe stringification.
 *
 * @param tag    Short label like "[api/leads/feed]" or "[pipeline/permits]"
 * @param event  Snake_case event name like "feed_query_success"
 * @param context Optional structured data merged into the JSON line
 */
export function logInfo(tag: string, event: string, context?: ErrorContext): void {
  const payload: Record<string, unknown> = {
    level: 'info',
    tag,
    event,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
  };
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    // Circular ref or other JSON.stringify failure — fall back to a safe
    // shape that omits the problematic context but preserves the event.
    line = JSON.stringify({
      level: 'info',
      tag,
      event,
      timestamp: payload.timestamp,
      _context_serialization_failed: true,
    });
  }
  console.log(line);
}
