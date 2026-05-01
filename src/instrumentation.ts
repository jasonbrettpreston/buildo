// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13.2
//                docs/specs/00-architecture/13_authentication.md §3 (firebase-admin init)
// Next.js instrumentation hook — initializes Sentry for server + edge runtimes
// AND firebase-admin in the nodejs runtime so verifyIdTokenCookie can verify
// real Firebase tokens (Spec 13 §4a Known Failure Mode: silent-401).
// Client init lives in sentry.client.config.ts.

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

  // firebase-admin — nodejs runtime only (firebase-admin can't load in edge).
  // Dynamic import keeps the edge bundle clean. getFirebaseAdmin() handles
  // dev/prod credential resolution and throws in production if no key is found.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    getFirebaseAdmin();
  }
}

export const onRequestError = Sentry.captureRequestError;
