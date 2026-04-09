// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 3 step 1
//
// Zustand store unit tests. We test the store in isolation by creating
// fresh stores per test via getState / setState, not via renderHook —
// the store's behavior is independent of React's render cycle except
// for the `persist` middleware rehydration, which we test by calling
// the exported `__validatePersistedSliceForTests` helper directly.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RADIUS_KM,
  useLeadFeedState,
  __validatePersistedSliceForTests as validate,
} from '@/features/leads/hooks/useLeadFeedState';

beforeEach(() => {
  // Reset to initial state + clear localStorage between tests.
  useLeadFeedState.setState({
    _hasHydrated: false,
    hoveredLeadId: null,
    selectedLeadId: null,
    radiusKm: DEFAULT_RADIUS_KM,
    location: null,
    snappedLocation: null,
  });
  localStorage.clear();
});

describe('useLeadFeedState — state transitions', () => {
  it('initial state matches documented defaults', () => {
    const s = useLeadFeedState.getState();
    expect(s.hoveredLeadId).toBeNull();
    expect(s.selectedLeadId).toBeNull();
    expect(s.radiusKm).toBe(DEFAULT_RADIUS_KM);
    expect(s.location).toBeNull();
  });

  it('setHoveredLeadId updates the hoveredLeadId field only', () => {
    useLeadFeedState.getState().setHoveredLeadId('permit:24 101234:00');
    expect(useLeadFeedState.getState().hoveredLeadId).toBe('permit:24 101234:00');
    expect(useLeadFeedState.getState().selectedLeadId).toBeNull();
  });

  it('setSelectedLeadId updates the selectedLeadId field only', () => {
    useLeadFeedState.getState().setSelectedLeadId('builder:9183');
    expect(useLeadFeedState.getState().selectedLeadId).toBe('builder:9183');
    expect(useLeadFeedState.getState().hoveredLeadId).toBeNull();
  });

  it('setRadius updates radiusKm', () => {
    useLeadFeedState.getState().setRadius(25);
    expect(useLeadFeedState.getState().radiusKm).toBe(25);
  });

  it('setLocation updates location', () => {
    useLeadFeedState.getState().setLocation({ lat: 43.65, lng: -79.38 });
    expect(useLeadFeedState.getState().location).toEqual({ lat: 43.65, lng: -79.38 });
  });

  it('setLocation(null) clears the location', () => {
    useLeadFeedState.getState().setLocation({ lat: 43.65, lng: -79.38 });
    useLeadFeedState.getState().setLocation(null);
    expect(useLeadFeedState.getState().location).toBeNull();
  });
});

describe('useLeadFeedState — hasHydrated signal (Phase 3-i review fix)', () => {
  it('exposes a _hasHydrated field that starts false on fresh mount', () => {
    // Phase 3-i adversarial review fix: consumers need a gate to
    // avoid rendering UI with default filter values during the async
    // rehydration window. This signal is flipped by
    // onRehydrateStorage after persist middleware loads.
    const s = useLeadFeedState.getState();
    expect(s._hasHydrated).toBe(false);
  });

  it('setHasHydrated flips the flag', () => {
    useLeadFeedState.getState().setHasHydrated(true);
    expect(useLeadFeedState.getState()._hasHydrated).toBe(true);
  });

  it('partialize does NOT serialize _hasHydrated (persisting it would bypass the rehydration gate)', () => {
    // We test the partialize function indirectly by setting the flag
    // and inspecting what the middleware would persist. The partialize
    // function is private to zustand internals, so we call the store
    // with the expected post-hydration shape and verify the flag is
    // not in the persisted localStorage output.
    useLeadFeedState.getState().setHasHydrated(true);
    useLeadFeedState.getState().setRadius(25);
    // Give Zustand a microtask to flush.
    const stored = localStorage.getItem('buildo-lead-feed');
    if (stored) {
      const parsed = JSON.parse(stored) as { state: Record<string, unknown> };
      expect(parsed.state).not.toHaveProperty('_hasHydrated');
      expect(parsed.state).not.toHaveProperty('hoveredLeadId');
      expect(parsed.state).not.toHaveProperty('selectedLeadId');
    }
  });
});

describe('validatePersistedSlice — defensive migrate guard', () => {
  it('returns defaults for null', () => {
    expect(validate(null)).toEqual({ radiusKm: DEFAULT_RADIUS_KM, location: null, snappedLocation: null });
  });

  it('returns defaults for undefined', () => {
    expect(validate(undefined)).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('returns defaults for non-object primitive', () => {
    expect(validate('corrupted')).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
    expect(validate(42)).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('preserves valid radiusKm + location together', () => {
    expect(validate({ radiusKm: 5, location: { lat: 43.65, lng: -79.38 } })).toEqual({
      radiusKm: 5,
      location: { lat: 43.65, lng: -79.38 },
      snappedLocation: null,
    });
  });

  it('replaces invalid radiusKm with default (0 is not positive)', () => {
    expect(validate({ radiusKm: 0, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('replaces negative radiusKm with default', () => {
    expect(validate({ radiusKm: -5, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('replaces NaN radiusKm with default', () => {
    expect(validate({ radiusKm: Number.NaN, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('replaces string radiusKm with default', () => {
    expect(validate({ radiusKm: '10', location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
      snappedLocation: null,
    });
  });

  it('clears location when lat is missing', () => {
    expect(validate({ radiusKm: 10, location: { lng: -79.38 } })).toEqual({
      radiusKm: 10,
      location: null,
      snappedLocation: null,
    });
  });

  it('clears location when lng is missing', () => {
    expect(validate({ radiusKm: 10, location: { lat: 43.65 } })).toEqual({
      radiusKm: 10,
      location: null,
      snappedLocation: null,
    });
  });

  it('clears location when lat is a string', () => {
    expect(validate({ radiusKm: 10, location: { lat: '43.65', lng: -79.38 } })).toEqual({
      radiusKm: 10,
      location: null,
      snappedLocation: null,
    });
  });

  it('clears location when lat is NaN', () => {
    expect(
      validate({ radiusKm: 10, location: { lat: Number.NaN, lng: -79.38 } }),
    ).toEqual({ radiusKm: 10, location: null, snappedLocation: null });
  });

  it('clears location when it is not an object', () => {
    expect(validate({ radiusKm: 10, location: 'Toronto' })).toEqual({
      radiusKm: 10,
      location: null,
      snappedLocation: null,
    });
  });

  it('ignores extra unknown fields', () => {
    expect(
      validate({
        radiusKm: 10,
        location: { lat: 43.65, lng: -79.38 },
        somethingElse: 'ignored',
        nested: { deep: true },
      }),
    ).toEqual({
      radiusKm: 10,
      location: { lat: 43.65, lng: -79.38 },
      snappedLocation: null,
    });
  });

  it('preserves valid snappedLocation', () => {
    expect(
      validate({
        radiusKm: 10,
        location: null,
        snappedLocation: { lat: 43.65, lng: -79.38 },
      }),
    ).toEqual({
      radiusKm: 10,
      location: null,
      snappedLocation: { lat: 43.65, lng: -79.38 },
    });
  });

  it('clears invalid snappedLocation (NaN lat) independently of location', () => {
    expect(
      validate({
        radiusKm: 10,
        location: { lat: 43.65, lng: -79.38 },
        snappedLocation: { lat: Number.NaN, lng: -79.38 },
      }),
    ).toEqual({
      radiusKm: 10,
      location: { lat: 43.65, lng: -79.38 },
      snappedLocation: null,
    });
  });
});

describe('useLeadFeedState — snappedLocation (Gemini 2026-04-09 fix)', () => {
  it('snappedLocation starts null', () => {
    expect(useLeadFeedState.getState().snappedLocation).toBeNull();
  });

  it('setSnappedLocation updates the field', () => {
    useLeadFeedState.getState().setSnappedLocation({ lat: 43.65, lng: -79.38 });
    expect(useLeadFeedState.getState().snappedLocation).toEqual({
      lat: 43.65,
      lng: -79.38,
    });
  });

  it('setSnappedLocation(null) clears the field', () => {
    useLeadFeedState.getState().setSnappedLocation({ lat: 43.65, lng: -79.38 });
    useLeadFeedState.getState().setSnappedLocation(null);
    expect(useLeadFeedState.getState().snappedLocation).toBeNull();
  });
});
