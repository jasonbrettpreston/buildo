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
    hoveredLeadId: null,
    selectedLeadId: null,
    radiusKm: DEFAULT_RADIUS_KM,
    location: null,
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

describe('validatePersistedSlice — defensive migrate guard', () => {
  it('returns defaults for null', () => {
    expect(validate(null)).toEqual({ radiusKm: DEFAULT_RADIUS_KM, location: null });
  });

  it('returns defaults for undefined', () => {
    expect(validate(undefined)).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('returns defaults for non-object primitive', () => {
    expect(validate('corrupted')).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
    expect(validate(42)).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('preserves valid radiusKm + location together', () => {
    expect(validate({ radiusKm: 5, location: { lat: 43.65, lng: -79.38 } })).toEqual({
      radiusKm: 5,
      location: { lat: 43.65, lng: -79.38 },
    });
  });

  it('replaces invalid radiusKm with default (0 is not positive)', () => {
    expect(validate({ radiusKm: 0, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('replaces negative radiusKm with default', () => {
    expect(validate({ radiusKm: -5, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('replaces NaN radiusKm with default', () => {
    expect(validate({ radiusKm: Number.NaN, location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('replaces string radiusKm with default', () => {
    expect(validate({ radiusKm: '10', location: null })).toEqual({
      radiusKm: DEFAULT_RADIUS_KM,
      location: null,
    });
  });

  it('clears location when lat is missing', () => {
    expect(validate({ radiusKm: 10, location: { lng: -79.38 } })).toEqual({
      radiusKm: 10,
      location: null,
    });
  });

  it('clears location when lng is missing', () => {
    expect(validate({ radiusKm: 10, location: { lat: 43.65 } })).toEqual({
      radiusKm: 10,
      location: null,
    });
  });

  it('clears location when lat is a string', () => {
    expect(validate({ radiusKm: 10, location: { lat: '43.65', lng: -79.38 } })).toEqual({
      radiusKm: 10,
      location: null,
    });
  });

  it('clears location when lat is NaN', () => {
    expect(
      validate({ radiusKm: 10, location: { lat: Number.NaN, lng: -79.38 } }),
    ).toEqual({ radiusKm: 10, location: null });
  });

  it('clears location when it is not an object', () => {
    expect(validate({ radiusKm: 10, location: 'Toronto' })).toEqual({
      radiusKm: 10,
      location: null,
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
    });
  });
});
