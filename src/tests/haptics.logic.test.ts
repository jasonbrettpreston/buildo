// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 7
//
// hapticTap — shared Vibration API wrapper for the leads feature.
// Feature-detects navigator.vibrate (Safari/iOS don't implement it)
// and respects prefers-reduced-motion (WCAG 2.1 SC 2.3.3).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock navigator + window.matchMedia BEFORE importing the module.
// Each test builds up the globals it needs and the module reads them
// at call time (not import time) so no module cache issues.

function setNavigator(value: Partial<Navigator> | undefined): void {
  if (value === undefined) {
    delete (globalThis as { navigator?: Navigator }).navigator;
  } else {
    (globalThis as { navigator: Navigator }).navigator = value as Navigator;
  }
}

function setMatchMedia(reduceMotion: boolean): void {
  (globalThis as { window?: { matchMedia: (q: string) => { matches: boolean } } }).window = {
    matchMedia: (query: string) => ({
      matches: query.includes('reduce') && reduceMotion,
    }),
  };
}

beforeEach(() => {
  // Reset module cache so each test gets a fresh import
  vi.resetModules();
});

afterEach(() => {
  // Clean up globals after each test
  delete (globalThis as { navigator?: Navigator }).navigator;
  delete (globalThis as { window?: object }).window;
});

describe('hapticTap', () => {
  it('is a no-op in SSR when navigator is undefined (does not throw)', async () => {
    setNavigator(undefined);
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    expect(() => hapticTap()).not.toThrow();
  });

  it('is a no-op when navigator.vibrate is not a function (iOS Safari path)', async () => {
    setNavigator({}); // no vibrate method
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    expect(() => hapticTap()).not.toThrow();
  });

  it('calls navigator.vibrate with the default 10ms when no argument is given', async () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate } as Partial<Navigator>);
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    hapticTap();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('passes through a custom duration', async () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate } as Partial<Navigator>);
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    hapticTap(25);
    expect(vibrate).toHaveBeenCalledWith(25);
  });

  it('skips vibration when prefers-reduced-motion is active (WCAG 2.1 SC 2.3.3)', async () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate } as Partial<Navigator>);
    setMatchMedia(true); // reduce-motion = true
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    hapticTap();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by navigator.vibrate (throwing implementation)', async () => {
    const vibrate = vi.fn(() => {
      throw new Error('vibration not permitted');
    });
    setNavigator({ vibrate } as Partial<Navigator>);
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');
    expect(() => hapticTap()).not.toThrow();
  });

  it('reads prefers-reduced-motion at call time, not at module load', async () => {
    // The matchMedia check must be live — users can toggle OS-level
    // reduce-motion mid-session. Test by flipping the global between
    // two calls.
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate } as Partial<Navigator>);
    setMatchMedia(false);
    const { hapticTap } = await import('@/features/leads/lib/haptics');

    hapticTap(); // should vibrate
    expect(vibrate).toHaveBeenCalledTimes(1);

    setMatchMedia(true); // user toggled reduce-motion ON
    hapticTap(); // should NOT vibrate
    expect(vibrate).toHaveBeenCalledTimes(1); // unchanged
  });
});
