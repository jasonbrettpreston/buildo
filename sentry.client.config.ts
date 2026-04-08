// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §7a + §13.2
// Sentry client-side init. Production-only by design — dev runs noise-free.

import * as Sentry from '@sentry/nextjs';

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}
