// Centralized error logging — console.error locally, Sentry in production.
// SPEC LINK: docs/reports/system_architecture_audit.md

type ErrorContext = Record<string, unknown>;

let sentryCaptureException: ((err: unknown, ctx?: { extra?: ErrorContext }) => void) | null = null;

// Lazy-load Sentry only when DSN is configured (production).
// In local dev, this stays null and errors go to console only.
// webpackIgnore comment prevents the "Critical dependency" warning.
if (typeof process !== 'undefined' && process.env.SENTRY_DSN) {
  // @ts-expect-error — @sentry/nextjs is an optional production dependency
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
