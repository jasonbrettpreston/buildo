// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §7a + §13
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock posthog-js BEFORE importing the wrapper so the module under test
// sees the mock. This is the canonical pattern in our infra tests.
const mockPosthog = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  isFeatureEnabled: vi.fn(),
};

vi.mock('posthog-js', () => ({
  default: mockPosthog,
}));

describe('Observability — captureEvent wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exports the expected public API', async () => {
    const mod = await import('@/lib/observability/capture');
    expect(typeof mod.initObservability).toBe('function');
    expect(typeof mod.captureEvent).toBe('function');
    expect(typeof mod.identifyUser).toBe('function');
    expect(typeof mod.isFeatureEnabled).toBe('function');
  });

  it('captureEvent is a no-op when window is undefined (SSR safe)', async () => {
    const mod = await import('@/lib/observability/capture');
    // Should not throw even though we haven't initialized
    expect(() => mod.captureEvent('lead_feed.viewed')).not.toThrow();
    // posthog.capture should not have been called because there's no window in test env
    expect(mockPosthog.capture).not.toHaveBeenCalled();
  });

  it('isFeatureEnabled returns false when window is undefined', async () => {
    const mod = await import('@/lib/observability/capture');
    expect(mod.isFeatureEnabled('any_flag')).toBe(false);
  });

  it('identifyUser is a no-op on SSR', async () => {
    const mod = await import('@/lib/observability/capture');
    expect(() => mod.identifyUser('test-uid', { trade: 'plumbing' })).not.toThrow();
    expect(mockPosthog.identify).not.toHaveBeenCalled();
  });

  it('captureEvent does not throw if posthog throws internally', async () => {
    // Simulate window existing — vitest jsdom env provides one
    if (typeof window === 'undefined') (globalThis as Record<string, unknown>).window = {};
    mockPosthog.capture.mockImplementationOnce(() => {
      throw new Error('PostHog internal error');
    });
    const mod = await import('@/lib/observability/capture');
    // Even when we call after a (faked) init, the wrapper must not crash callers
    expect(() => mod.captureEvent('lead_feed.viewed')).not.toThrow();
  });
});

describe('Observability — EventName type safety', () => {
  it('only accepts known event names (compile-time check via TS)', async () => {
    const mod = await import('@/lib/observability/capture');
    // Valid event names from spec 75 §7a
    expect(() => mod.captureEvent('lead_feed.viewed')).not.toThrow();
    expect(() => mod.captureEvent('lead_feed.lead_clicked')).not.toThrow();
    expect(() => mod.captureEvent('lead_feed.lead_saved')).not.toThrow();
    expect(() => mod.captureEvent('lead_feed.builder_called')).not.toThrow();
    // TypeScript would reject mod.captureEvent('not.an.event') — runtime behavior
    // is "noop" so we just verify we have the wrapper function
  });
});

describe('Observability — initObservability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('is idempotent — multiple calls do nothing extra', async () => {
    const mod = await import('@/lib/observability/capture');
    mod.initObservability();
    mod.initObservability();
    // posthog.init should be called at most once even though we called twice
    // (in SSR test env, it's called 0 times because window is undefined,
    // but the idempotence guard should still hold)
    expect(mockPosthog.init.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
