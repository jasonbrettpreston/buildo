// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7.2
//             (cache invalidation telemetry mandate)
//
// Runtime regression coverage for `mobile/src/lib/queryTelemetry.ts`'s
// `logQueryInvalidate(key)` helper. The static `spec99.mandates.lint.test.ts`
// asserts the helper file exists + has callers; this test asserts the
// helper actually fires the canonical breadcrumb shape AND honours the
// `__DEV__` gate per §7.2.

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
}));

import * as Sentry from '@sentry/react-native';
import { track } from '@/lib/analytics';
import { logQueryInvalidate } from '@/lib/queryTelemetry';

describe('logQueryInvalidate (Spec 99 §7.2)', () => {
  beforeEach(() => {
    (Sentry.addBreadcrumb as jest.Mock).mockClear();
    (track as jest.Mock).mockClear();
  });

  it('fires Sentry.addBreadcrumb with the canonical {category, message, data:{key}} shape', () => {
    logQueryInvalidate('user-profile');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'query',
      message: 'invalidate',
      data: { key: 'user-profile' },
    });
  });

  it('fires DEV-only track("query_invalidate", {key}) when __DEV__ is true', () => {
    // Jest's __DEV__ defaults to true — exercise the DEV branch.
    expect((globalThis as { __DEV__?: boolean }).__DEV__).toBe(true);
    logQueryInvalidate('leads');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('query_invalidate', { key: 'leads' });
  });

  it('does NOT fire track("query_invalidate") when __DEV__ is false (production builds)', () => {
    // Mutate __DEV__ for this case only; restore in finally so other tests
    // in the same file still see DEV semantics.
    const original = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      logQueryInvalidate('flight-board');
      // Sentry breadcrumb still fires (production telemetry)…
      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
      // …but track() does not (spec: DEV only — production volume too high).
      expect(track).not.toHaveBeenCalled();
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = original;
    }
  });
});
