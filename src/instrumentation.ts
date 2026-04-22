// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13.2
// Next.js instrumentation hook — initializes Sentry for server + edge runtimes.
// Client init lives in sentry.client.config.ts.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
