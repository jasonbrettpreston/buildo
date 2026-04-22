// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 3 step 1
//
// Zustand store unit tests. We test the store in isolation by creating
// fresh stores per test via getState / setState, not via renderHook —
// the store's behavior is independent of React's render cycle except
// for the `persist` middleware rehydration, which we test by calling
// the exported `__validatePersistedSliceForTests` helper directly.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock captureEvent BEFORE importing the module under test so the
// observability hooks added in Phase 3-vi observability sibling are
// captured by the spy.
const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

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
  captureEventMock.mockReset();
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

describe('validatePersistedSlice — observability emit on recovery (Phase 3-vi)', () => {
  it('emits lead_feed.persisted_state_recovered when radiusKm is clamped', () => {
    validate({ radiusKm: 75, location: null });
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({
      field: 'radiusKm',
      original_value: 75,
      original_type: 'number',
      recovered_value: DEFAULT_RADIUS_KM,
    });
  });

  it('emits when radiusKm is the wrong type', () => {
    validate({ radiusKm: 'not-a-number', location: null });
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({
      field: 'radiusKm',
      original_type: 'string',
    });
  });

  it('emits when location is malformed (and sanitizes the original to a type tag, NO PII)', () => {
    validate({
      radiusKm: 10,
      location: { lat: 'corrupt', lng: -79.38 },
    });
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({
      field: 'location',
      // The original lat/lng object is replaced with a type tag —
      // NO actual coordinate values leak to PostHog.
      original_value: '[object:object]',
      recovered_value: null,
    });
    // Belt-and-suspenders: explicitly assert no coordinate values
    // appear anywhere in the emitted props.
    const propsString = JSON.stringify(calls[0]?.[1]);
    expect(propsString).not.toContain('-79.38');
    expect(propsString).not.toContain('corrupt');
  });

  it('does NOT emit when all fields are valid (no recovery happened)', () => {
    validate({
      radiusKm: 25,
      location: { lat: 43.65, lng: -79.38 },
      snappedLocation: { lat: 43.65, lng: -79.38 },
    });
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(0);
  });

  it('emits a single rollup event with __slice__ sentinel when the entire slice is non-object', () => {
    validate('totally corrupted');
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({
      // Distinct sentinel — '__slice__' lets PostHog facets
      // distinguish whole-slice corruption from per-field recovery.
      field: '__slice__',
      original_value: 'totally corrupted',
    });
  });

  it('truncates long strings in original_value to a [string:N] tag (PII guard)', () => {
    // A coordinate string ("43.6535,-79.3839") is 17 chars, below
    // the 50-char threshold, so it would still pass through if
    // someone stuffed it directly into a primitive slot. But a
    // realistic attack vector is a much longer string (e.g., a
    // JSON-serialized object). Verify the long-string sanitization.
    const longSensitiveString =
      'lat=43.6535,lng=-79.3839,user_token=eyJhbGciOiJIUzI1NiI...';
    validate(longSensitiveString);
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.persisted_state_recovered',
    );
    expect(calls).toHaveLength(1);
    const original = calls[0]?.[1] as { original_value: unknown };
    expect(typeof original.original_value).toBe('string');
    expect(original.original_value).toMatch(/^\[string:\d+\]$/);
    // Belt-and-suspenders: explicitly assert NO leak of the
    // sensitive substrings.
    const propsString = JSON.stringify(calls[0]?.[1]);
    expect(propsString).not.toContain('43.6535');
    expect(propsString).not.toContain('eyJhbGc');
  });
});

describe('validatePersistedSlice — Zod deadlock prevention (user review 2026-04-09)', () => {
  // The pre-fix validatePersistedSlice accepted radiusKm in [1, 100],
  // but the server enforces .max(50) via Zod. localStorage holding
  // 51-100 produced a permanently-broken state: every fetch returned
  // 400 VALIDATION_FAILED, the user's "Try again" hit the same wall,
  // and there was no UI failsafe to reset the radius. The fix
  // (Layers 1+2): import MAX_RADIUS_KM from distance.ts as the
  // single source of truth, AND clamp out-of-range values to
  // DEFAULT_RADIUS_KM in the migrate path so corrupted clients
  // self-heal on next page load.
  it('clamps radiusKm > MAX_RADIUS_KM (50) to DEFAULT_RADIUS_KM', () => {
    expect(validate({ radiusKm: 75, location: null }).radiusKm).toBe(
      DEFAULT_RADIUS_KM,
    );
    expect(validate({ radiusKm: 51, location: null }).radiusKm).toBe(
      DEFAULT_RADIUS_KM,
    );
    expect(validate({ radiusKm: 100, location: null }).radiusKm).toBe(
      DEFAULT_RADIUS_KM,
    );
    expect(validate({ radiusKm: 999999, location: null }).radiusKm).toBe(
      DEFAULT_RADIUS_KM,
    );
  });

  it('preserves radiusKm exactly at MAX_RADIUS_KM (boundary)', () => {
    expect(validate({ radiusKm: 50, location: null }).radiusKm).toBe(50);
  });

  it('preserves radiusKm just below the cap', () => {
    expect(validate({ radiusKm: 49, location: null }).radiusKm).toBe(49);
    expect(validate({ radiusKm: 25, location: null }).radiusKm).toBe(25);
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
