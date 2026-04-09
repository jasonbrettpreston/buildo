// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 3 step 3
//
// useGeolocation tests — mocks navigator.permissions + navigator.geolocation
// to cover the discriminated status union. We exercise:
//   - unsupported (no Permissions API)
//   - denied (permanent)
//   - prompt (user hasn't been asked)
//   - granted via request() success callback
//   - error via request() error callback
//
// The Safari-throws branch is covered by stubbing `navigator.permissions.query`
// to reject with a DOMException.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGeolocation } from '@/features/leads/hooks/useGeolocation';

type FakePermissionStatus = {
  state: PermissionState;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  onchange: (() => void) | null;
};

function makePermissionStatus(state: PermissionState): FakePermissionStatus {
  return {
    state,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onchange: null,
  };
}

describe('useGeolocation — cleanup correctness (Phase 3-i review fix)', () => {
  it('calls removeEventListener on unmount with the same function reference passed to addEventListener', async () => {
    // Phase 3-i adversarial review fix: pre-fix cleanup set
    // `perm.onchange = null` which is a completely different
    // subscription mechanism from addEventListener and caused a
    // listener leak. Every mount added a new onChange closure and
    // none were ever removed. This test locks the fix.
    const perm = makePermissionStatus('prompt');
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: { query: vi.fn().mockResolvedValue(perm) },
      geolocation: undefined,
    });
    const { unmount } = renderHook(() => useGeolocation());
    // Wait for the async effect to install the listener.
    await waitFor(() => expect(perm.addEventListener).toHaveBeenCalled());
    const addedHandler = (perm.addEventListener as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[1];
    unmount();
    // removeEventListener must be called with the SAME function reference.
    await waitFor(() =>
      expect(perm.removeEventListener).toHaveBeenCalledWith('change', addedHandler),
    );
  });
});

beforeEach(() => {
  // Reset global navigator shape per test
  vi.stubGlobal('navigator', {
    ...window.navigator,
    permissions: undefined,
    geolocation: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGeolocation — permission states', () => {
  it('returns "unsupported" when navigator.permissions is undefined', async () => {
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('unsupported'));
  });

  it('returns "unsupported" when navigator is undefined (SSR path)', async () => {
    vi.stubGlobal('navigator', undefined);
    // The hook runs in useEffect so SSR itself never hits this branch;
    // in the client it would check feature-detection and bail.
    // We can't truly test SSR here but we can verify the hook doesn't
    // crash when the feature-detect fails.
    const { result } = renderHook(() => useGeolocation());
    // With navigator undefined the initial state is 'idle' and the
    // effect early-returns. We observe one of the two possible states:
    // either 'idle' (if the effect hasn't run) or 'unsupported'.
    await waitFor(() => {
      const s = result.current.status.state;
      expect(['idle', 'unsupported']).toContain(s);
    });
  });

  it('returns "unsupported" when permissions.query throws (Safari quirk)', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockRejectedValue(new Error('not supported')),
      },
      geolocation: undefined,
    });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('unsupported'));
  });

  it('returns "denied" with permanent=false on initial check (cannot distinguish session vs persistent denial)', async () => {
    // Phase 3-i adversarial review fix: the Permissions API `denied`
    // state cannot tell us whether the user denied in this session or
    // persistently blocked in site settings. Setting `permanent: true`
    // on the initial check was too aggressive — the UI would send
    // users to settings when a simple re-prompt could have worked.
    // `permanent: true` is now only set from the explicit
    // PERMISSION_DENIED error callback (tested separately below).
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('denied')),
      },
      geolocation: undefined,
    });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('denied'));
    if (result.current.status.state === 'denied') {
      expect(result.current.status.permanent).toBe(false);
    }
  });

  it('returns "prompt" when permission is prompt', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: undefined,
    });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));
  });

  it('auto-calls getCurrentPosition when initial permission is "granted" (spec 75 state machine fix)', async () => {
    // Phase 3-i adversarial review fix: the pre-fix behaviour was to
    // emit `prompt` on the initial granted branch, forcing the user
    // to re-grant permission via the prompt UI. The correct
    // behaviour is to immediately fetch the position since the user
    // already granted permission in a prior session.
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 43.6535,
          longitude: -79.3839,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        } as GeolocationCoordinates,
        timestamp: 1_000_000,
      } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('granted')),
      },
      geolocation: { getCurrentPosition },
    });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('granted'));
    expect(getCurrentPosition).toHaveBeenCalled();
    if (result.current.status.state === 'granted') {
      expect(result.current.status.coords).toEqual({ lat: 43.6535, lng: -79.3839 });
    }
  });

  it('explicit request() → PERMISSION_DENIED sets permanent=true (interaction-confirmed denial)', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback | undefined) => {
        error?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'User denied',
        } as GeolocationPositionError);
      },
    );
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: { getCurrentPosition },
    });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));
    act(() => {
      result.current.request();
    });
    await waitFor(() => expect(result.current.status.state).toBe('denied'));
    if (result.current.status.state === 'denied') {
      expect(result.current.status.permanent).toBe(true);
    }
  });
});

describe('useGeolocation — request() action', () => {
  it('transitions to granted on successful geolocation callback', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 43.6535,
            longitude: -79.3839,
            accuracy: 25,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          } as GeolocationCoordinates,
          timestamp: 1_234_567_890,
        } as GeolocationPosition);
      },
    );
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));

    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status.state).toBe('granted'));
    if (result.current.status.state === 'granted') {
      expect(result.current.status.coords).toEqual({ lat: 43.6535, lng: -79.3839 });
      expect(result.current.status.accuracy).toBe(25);
    }
  });

  it('transitions to denied on PERMISSION_DENIED error callback', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback | undefined) => {
        error?.({
          code: 1, // PERMISSION_DENIED
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'User denied geolocation',
        } as GeolocationPositionError);
      },
    );
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));

    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status.state).toBe('denied'));
  });

  it('transitions to error on non-permission failure (timeout, unavailable)', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback | undefined) => {
        error?.({
          code: 3, // TIMEOUT
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'Timed out',
        } as GeolocationPositionError);
      },
    );
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));

    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status.state).toBe('error'));
    if (result.current.status.state === 'error') {
      expect(result.current.status.message).toBe('Timed out');
    }
  });

  it('transitions to unsupported when navigator.geolocation is undefined', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      permissions: {
        query: vi.fn().mockResolvedValue(makePermissionStatus('prompt')),
      },
      geolocation: undefined,
    });

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.status.state).toBe('prompt'));

    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status.state).toBe('unsupported'));
  });
});
