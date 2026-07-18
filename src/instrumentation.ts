// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13.2
//                docs/specs/00-architecture/13_authentication.md §3.3
// Next.js instrumentation hook — initializes Sentry for server + edge runtimes.
// Client init lives in sentry.client.config.ts.
//
// Firebase Admin boot call REMOVED (Spec 13 §3.3 instrumentation.ts row):
// Supabase verification is per-request via `src/lib/supabase/server.ts`'s
// request-scoped client factory, not a booted SDK singleton — there is
// nothing left to initialize at boot.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Sentry — production only, when DSN is present.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_SENTRY_DSN &&
    (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge')
  ) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
