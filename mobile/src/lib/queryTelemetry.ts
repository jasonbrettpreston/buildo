// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7.2
//             (cache invalidation telemetry mandate)
//
// Spec 99 §7.2 mandates that every non-trivial `queryClient.invalidateQueries`
// call MUST be paired with:
//   - Sentry.addBreadcrumb({category:'query', message:'invalidate', data:{key}})
//     in production (provides cache-mutation traces in Sentry replays).
//   - track('query_invalidate', {key}) in DEV ONLY (production volume too high
//     per spec — every refetch storm would flood PostHog).
//
// "Non-trivial" per spec: anything not inside a user-initiated `useMutation`'s
// `onSettled`. Mutation post-handler invalidates are exempt because the
// mutation framework already produced a telemetry event for the user-
// initiated action; adding a breadcrumb at the post-handler invalidate
// would duplicate the trace.
//
// This helper consolidates the two-call pattern. Calling sites (currently 9
// across mobile/) just import and call `logQueryInvalidate('user-profile')`
// (or whatever the queryKey root is) BEFORE the bare `invalidateQueries`.
//
// Wired by §7.2 follow-up WF3 (commit `<this commit>`); enforced going
// forward by §9.21 mandates-lint test (`mobile/__tests__/spec99.mandates.lint.test.ts`).

import * as Sentry from '@sentry/react-native';
import { track } from '@/lib/analytics';

/**
 * Spec 99 §7.2 cache invalidation telemetry. Call BEFORE the bare
 * `queryClient.invalidateQueries` at every non-trivial site.
 *
 * @param key - The TanStack queryKey root string (e.g., 'user-profile',
 *              'leads', 'flight-board'). Operational metadata only — no PII
 *              (whitelisted in `analytics.ts` `ALLOWED_KEYS`).
 */
export function logQueryInvalidate(key: string): void {
  Sentry.addBreadcrumb({
    category: 'query',
    message: 'invalidate',
    data: { key },
  });
  if (__DEV__) {
    track('query_invalidate', { key });
  }
}
