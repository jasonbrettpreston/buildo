/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §11
//
// PostHog telemetry helpers — verifies PII-strip whitelist, env-unset no-op,
// SDK error swallow, and identify shape.

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockConstructor = jest.fn();

jest.mock('posthog-react-native', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((apiKey: string, opts: unknown) => {
      mockConstructor(apiKey, opts);
      return {
        capture: mockCapture,
        identify: mockIdentify,
        reset: mockReset,
      };
    }),
  };
});

describe('analytics helpers', () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockIdentify.mockClear();
    mockReset.mockClear();
    mockConstructor.mockClear();
    jest.resetModules();
  });

  describe('without EXPO_PUBLIC_POSTHOG_API_KEY (local dev)', () => {
    beforeEach(() => {
      delete (process.env as Record<string, string | undefined>).EXPO_PUBLIC_POSTHOG_API_KEY;
    });

    it('track() is a no-op and does not construct the PostHog client', () => {
      const { track } = require('@/lib/analytics');
      track('any_event', { method: 'apple' });
      expect(mockConstructor).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('identifyUser() is a no-op', () => {
      const { identifyUser } = require('@/lib/analytics');
      identifyUser('uid-123');
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it('resetIdentity() is a no-op', () => {
      const { resetIdentity } = require('@/lib/analytics');
      resetIdentity();
      expect(mockReset).not.toHaveBeenCalled();
    });
  });

  describe('with EXPO_PUBLIC_POSTHOG_API_KEY set', () => {
    beforeEach(() => {
      (process.env as Record<string, string>).EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test_key';
    });

    it('track() forwards whitelisted props to PostHog.capture (+ mandatory product dimension)', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('auth_method_attempted', { method: 'google' });
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith('auth_method_attempted', {
        method: 'google',
        product: 'lead_gen',
      });
    });

    // Spec 116 N6 (P2-F2.11, MANDATORY): every tracked event carries the
    // product dimension so lead_gen events stay distinguishable once
    // additional products ship.
    it('track() injects product: "lead_gen" on every event — even with no props', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('signout_initiated');
      expect(mockCapture).toHaveBeenCalledWith('signout_initiated', { product: 'lead_gen' });
    });

    it('product survives stripPii and a caller-supplied product cannot override it', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('paywall_shown', { product: 'evil_override', tier: 'small' });
      const propsArg = mockCapture.mock.calls[0][1] as Record<string, unknown>;
      // The injected value wins (spread order: injection AFTER stripPii).
      expect(propsArg.product).toBe('lead_gen');
      expect(propsArg.tier).toBe('small');
    });

    it('track() strips PII keys (email, phone, displayName, accessToken)', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('auth_method_succeeded', {
        method: 'google',
        email: 'leak@example.com',
        phone: '+14165551234',
        displayName: 'Some Person',
        accessToken: 'super-secret-jwt',
      });
      expect(mockCapture).toHaveBeenCalledWith('auth_method_succeeded', {
        method: 'google',
        product: 'lead_gen',
      });
      const propsArg = mockCapture.mock.calls[0][1] as Record<string, unknown>;
      expect(propsArg).not.toHaveProperty('email');
      expect(propsArg).not.toHaveProperty('phone');
      expect(propsArg).not.toHaveProperty('displayName');
      expect(propsArg).not.toHaveProperty('accessToken');
    });

    it('track() preserves all whitelisted keys (catalogue completeness)', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('auth_account_link_failed', {
        method: 'apple',
        existing_method: 'email',
        new_method: 'apple',
        code: 'auth/credential-already-in-use',
        screen: 'sign-in',
      });
      expect(mockCapture).toHaveBeenCalledWith('auth_account_link_failed', {
        method: 'apple',
        existing_method: 'email',
        new_method: 'apple',
        code: 'auth/credential-already-in-use',
        screen: 'sign-in',
        product: 'lead_gen',
      });
    });

    it('track() swallows SDK errors silently', () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error('PostHog network failure');
      });
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      expect(() => track('auth_method_attempted', { method: 'apple' })).not.toThrow();
    });

    it('identifyUser() sends only the uid + first_seen_at — no PII in user properties', () => {
      const { identifyUser, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      identifyUser('firebase-uid-abc');
      expect(mockIdentify).toHaveBeenCalledTimes(1);
      const [distinctId, props] = mockIdentify.mock.calls[0];
      expect(distinctId).toBe('firebase-uid-abc');
      expect(props).toHaveProperty('first_seen_at');
      expect(typeof props.first_seen_at).toBe('string');
      // Must not contain email / displayName / phone
      expect(props).not.toHaveProperty('email');
      expect(props).not.toHaveProperty('displayName');
      expect(props).not.toHaveProperty('phone');
    });

    it('resetIdentity() calls PostHog.reset()', () => {
      const { resetIdentity, identifyUser, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      // identify first to ensure the singleton is constructed
      identifyUser('uid');
      mockReset.mockClear();
      resetIdentity();
      expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('identifyUser() de-dupes repeated calls with the same uid (token-refresh guard)', () => {
      const { identifyUser, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      identifyUser('uid-stable');
      identifyUser('uid-stable'); // simulate onAuthStateChanged firing on token refresh
      identifyUser('uid-stable');
      expect(mockIdentify).toHaveBeenCalledTimes(1);
    });

    it('identifyUser() re-fires after resetIdentity() so the next user can identify', () => {
      const { identifyUser, resetIdentity, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      identifyUser('user-one');
      resetIdentity();
      identifyUser('user-two');
      expect(mockIdentify).toHaveBeenCalledTimes(2);
      expect(mockIdentify.mock.calls[0][0]).toBe('user-one');
      expect(mockIdentify.mock.calls[1][0]).toBe('user-two');
    });

    it('singleton is constructed exactly once across multiple track() calls', () => {
      const { track, __resetForTests } = require('@/lib/analytics');
      __resetForTests();
      track('auth_method_attempted', { method: 'google' });
      track('auth_method_succeeded', { method: 'google' });
      track('auth_method_failed', { method: 'google', code: 'auth/wrong-password' });
      expect(mockConstructor).toHaveBeenCalledTimes(1);
    });
  });
});
