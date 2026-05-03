/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §7.1 + §9.5
//
// Verifies the production-path (`__DEV__ === false`) no-op behavior of the
// stateDebug hub. jest-expo defaults `__DEV__ === true`, so the standard test
// run only exercises the DEV branch — leaving the `if (!__DEV__) return;`
// guards completely uncovered. A regression that flips one guard's polarity
// or removes it entirely would not be caught without this suite (DeepSeek
// WF3-§9.5 review F9 + Gemini #1 consensus).
//
// Strategy: temporarily flip the `__DEV__` global, `jest.resetModules()` so
// the freshly-imported stateDebug module sees the new value, run each
// exported function, and assert NO console output / NO state mutations.
// Restore __DEV__ after each test.

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(() => false),
    clearAll: jest.fn(),
  }),
}));

// stateDebug imports the 6 stores → authStore → @react-native-firebase/auth.
// In Jest the native module is unavailable; mock the firebase shim to keep
// the import graph resolvable. The actual functionality is unused (this
// suite only exercises stateDebug, not auth).
jest.mock('@/lib/firebase', () => ({
  auth: jest.fn(() => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signOut: jest.fn(() => Promise.resolve()),
    signInWithPhoneNumber: jest.fn(),
  })),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signOut: jest.fn(() => Promise.resolve()),
  })),
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));
jest.mock('@/lib/migrations/userProfileCacheCleanup', () => ({
  cleanupLegacyUserProfileCache: jest.fn(),
}));
jest.mock('@/lib/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn(() => Promise.resolve()),
    removeQueries: jest.fn(),
    clear: jest.fn(),
  },
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  identifyUser: jest.fn(),
  resetIdentity: jest.fn(),
}));

const ORIGINAL_DEV = (globalThis as { __DEV__?: boolean }).__DEV__;

describe('stateDebug — production no-op path (__DEV__ === false)', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    jest.resetModules();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('trackRender emits no console output in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { trackRender } = require('@/lib/debug/stateDebug');
    // Call >LOOP_THRESHOLD (30) times to ensure neither the per-render log
    // nor the LOOP-DETECTED warning fires in production.
    for (let i = 0; i < 50; i++) trackRender('prod-test');
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('useDepsTracker is a constant-reference noop in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useDepsTracker } = require('@/lib/debug/stateDebug');
    // The export should be a function that takes (tag, deps) and returns
    // void — but in production, it must be the noop variant: ZERO hooks
    // called. We can't render it without a React renderer, but we CAN assert
    // it returns undefined synchronously and emits no console output.
    expect(typeof useDepsTracker).toBe('function');
    expect(useDepsTracker.length).toBe(2); // (tag, deps) signature preserved
    // Calling it directly outside a component context: dev impl would throw
    // (hooks-outside-component). noop variant returns undefined silently.
    expect(() => useDepsTracker('prod-test', [1, 2, 3])).not.toThrow();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('dumpDiagnostics returns empty string in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dumpDiagnostics, trackRender } = require('@/lib/debug/stateDebug');
    // Even after some trackRender calls (which are no-ops in prod), the
    // diagnostic snapshot is empty.
    trackRender('prod-test');
    trackRender('prod-test');
    expect(dumpDiagnostics()).toBe('');
  });

  it('wireStoreLogging skips subscription wiring in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wireStoreLogging } = require('@/lib/debug/stateDebug');
    wireStoreLogging();
    // Production path returns immediately — never reaches the subscribeStore
    // calls or the success log line. Assert: no '[stateDebug]' log emitted.
    const stateDebugCalls = consoleLogSpy.mock.calls.filter((args: unknown[]) =>
      typeof args[0] === 'string' && args[0].includes('[stateDebug]'),
    );
    expect(stateDebugCalls).toHaveLength(0);
  });
});
